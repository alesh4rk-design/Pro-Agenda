/**
 * Teste de integração: Worker real (clientes REST) contra os emuladores do
 * Firebase Auth e Firestore. Rodar com `npm run test:integration` na raiz.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { PreconditionFailed } from "../src/google/firestore.js";
import { depsFromEnv } from "../src/index.js";
import type { Env } from "../src/env.js";

const PROJECT = "demo-rondas";
const AUTH = "127.0.0.1:9099";
const env: Env = {
  ENVIRONMENT: "development",
  FIREBASE_PROJECT_ID: PROJECT,
  ALLOWED_ORIGINS: "http://localhost:5173",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: AUTH,
};
const deps = depsFromEnv(env);
const app = createApp(deps, { allowedOrigins: env.ALLOWED_ORIGINS, environment: env.ENVIRONMENT });
const run = Date.now().toString(36);

async function authRest(path: string, body: unknown) {
  const res = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/${path}?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, any>;
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

async function signIn(email: string, password: string): Promise<string> {
  return (await authRest("accounts:signInWithPassword", { email, password, returnSecureToken: true })).idToken;
}

async function api(method: string, path: string, token: string, body?: unknown, key?: string) {
  const res = await app(
    new Request(`http://worker${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

let geralToken = "";
const geralEmail = `geral-${run}@demo.local`;

beforeAll(async () => {
  // Bootstrap do primeiro administrador geral (equivalente a scripts/bootstrap-admin.mjs).
  const { localId } = await authRest("accounts:signUp", { email: geralEmail, password: "senha-demo-123", returnSecureToken: true });
  await deps.identity.setClaims(localId, { role: "admin_geral" });
  const now = new Date();
  await deps.db.commit([
    { op: "set", path: `users/${localId}`, data: { uid: localId, email: geralEmail, nome: "Admin Geral", role: "admin_geral", companyId: null, postIds: [], contractIds: [], status: "ativo", createdAt: now, createdBy: "bootstrap", updatedAt: now, updatedBy: "bootstrap" } },
    { op: "set", path: `companies/emp-${run}`, data: { nome: "Empresa Demo", status: "ativa", permissoesAdmin: { gerirContratos: true, gerirPostos: true } } },
    { op: "set", path: `posts/posto-${run}`, data: { companyId: `emp-${run}`, contractId: `ct-${run}`, nome: "Posto Demo" } },
  ]);
  geralToken = await signIn(geralEmail, "senha-demo-123");
});

describe("Worker + emuladores", () => {
  it("verifica o token do Auth e devolve o perfil", async () => {
    const r = await api("GET", "/v1/me", geralToken);
    expect(r.status).toBe(200);
    expect(r.body.role).toBe("admin_geral");
  });

  it("cadastra vigilante: conta no Auth com claims, perfil e auditoria no Firestore", async () => {
    const email = `vig-${run}@demo.local`;
    const key = crypto.randomUUID();
    const body = { email, nome: "Vigilante Demo", role: "vigilante", companyId: `emp-${run}`, postIds: [`posto-${run}`] };
    const r = await api("POST", "/v1/users", geralToken, body, key);
    expect(r.status).toBe(201);
    const uid = r.body.uid as string;

    const lookup = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, {
      method: "POST",
      headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({ localId: [uid] }),
    }).then((x) => x.json() as Promise<any>);
    expect(JSON.parse(lookup.users[0].customAttributes)).toEqual({ role: "vigilante", cid: `emp-${run}` });

    expect(await deps.db.getDoc(`users/${uid}`)).toMatchObject({ role: "vigilante", status: "ativo" });
    const logs = await deps.db.query("auditLogs", [{ field: "targetId", op: "EQUAL", value: uid }], 10);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.data.action).toBe("usuario.criar");

    // Repetição com a mesma chave: mesma resposta, sem nova conta.
    const again = await api("POST", "/v1/users", geralToken, body, key);
    expect(again.status).toBe(201);
    expect(again.body.uid).toBe(uid);

    // Recuperação de senha: o emulador registra o código de redefinição.
    await authRest("accounts:sendOobCode", { requestType: "PASSWORD_RESET", email });
    const codes = await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`).then((x) => x.json() as Promise<any>);
    const code = codes.oobCodes.find((c: any) => c.email === email && c.requestType === "PASSWORD_RESET");
    expect(code).toBeDefined();
    await authRest("accounts:resetPassword", { oobCode: code.oobCode, newPassword: "nova-senha-456" });
    const vigToken = await signIn(email, "nova-senha-456");
    const me = await api("GET", "/v1/me", vigToken);
    expect(me.status).toBe(200);
    expect(me.body.role).toBe("vigilante");

    // Bloqueio: conta desativada no Auth e token atual recusado.
    const bloq = await api("PATCH", `/v1/users/${uid}`, geralToken, { status: "bloqueado" });
    expect(bloq.status).toBe(200);
    expect((await api("GET", "/v1/me", vigToken)).status).toBe(403);
    await expect(signIn(email, "nova-senha-456")).rejects.toThrow(/USER_DISABLED/);
  });

  it("altera o nome do sistema", async () => {
    const r = await api("PUT", "/v1/config/sistema", geralToken, { nomeSistema: `Rondas ${run}` });
    expect(r.status).toBe(200);
    expect((await deps.db.getDoc("config/publico"))!.nomeSistema).toBe(`Rondas ${run}`);
  });

  it("create com precondição não sobrescreve documento existente (base da idempotência)", async () => {
    await deps.db.commit([{ op: "create", path: `testes/dup-${run}`, data: { v: 1 } }]);
    await expect(deps.db.commit([{ op: "create", path: `testes/dup-${run}`, data: { v: 2 } }])).rejects.toBeInstanceOf(PreconditionFailed);
    expect((await deps.db.getDoc(`testes/dup-${run}`))!.v).toBe(1);
  });

  it("recusa token adulterado", async () => {
    const [h, p] = geralToken.split(".");
    const payload = JSON.parse(Buffer.from(p!, "base64url").toString());
    payload.aud = "outro-projeto";
    const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.`;
    expect((await api("GET", "/v1/me", forged)).status).toBe(401);
  });
});
