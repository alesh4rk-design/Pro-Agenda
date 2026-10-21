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

  it("cria acesso do posto (login + senha), entra pelo login, redefine senha e bloqueia", async () => {
    const login = `portaria-${run}`;
    const key = crypto.randomUUID();
    const body = { login, senha: "senha-inicial-1", nome: "Portaria Demo", role: "posto", companyId: `emp-${run}`, postIds: [`posto-${run}`] };
    const r = await api("POST", "/v1/users", geralToken, body, key);
    expect(r.status).toBe(201);
    const uid = r.body.uid as string;

    const lookup = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, {
      method: "POST",
      headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({ localId: [uid] }),
    }).then((x) => x.json() as Promise<any>);
    expect(lookup.users[0].email).toBe(`${login}@postos.invalid`);
    expect(JSON.parse(lookup.users[0].customAttributes)).toEqual({ role: "posto", cid: `emp-${run}` });

    expect(await deps.db.getDoc(`users/${uid}`)).toMatchObject({ role: "posto", login, status: "ativo" });
    const logs = await deps.db.query("auditLogs", [{ field: "targetId", op: "EQUAL", value: uid }], 10);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.data.action).toBe("usuario.criar");

    // Repetição com a mesma chave: mesma resposta, sem nova conta.
    const again = await api("POST", "/v1/users", geralToken, body, key);
    expect(again.status).toBe(201);
    expect(again.body.uid).toBe(uid);

    // O posto entra com o login (convertido no e-mail sintético) e a senha definida pelo admin.
    const postoToken = await signIn(`${login}@postos.invalid`, "senha-inicial-1");
    const me = await api("GET", "/v1/me", postoToken);
    expect(me.status).toBe(200);
    expect(me.body.role).toBe("posto");

    // Admin redefine a senha: a antiga deixa de funcionar, a nova funciona.
    const reset = await api("POST", `/v1/users/${uid}/senha`, geralToken, { senha: "senha-nova-2" });
    expect(reset.status).toBe(200);
    await expect(signIn(`${login}@postos.invalid`, "senha-inicial-1")).rejects.toThrow(/INVALID/);
    const novoToken = await signIn(`${login}@postos.invalid`, "senha-nova-2");
    expect((await api("GET", "/v1/me", novoToken)).status).toBe(200);

    // Bloqueio: conta desativada no Auth e token atual recusado.
    const bloq = await api("PATCH", `/v1/users/${uid}`, geralToken, { status: "bloqueado" });
    expect(bloq.status).toBe(200);
    expect((await api("GET", "/v1/me", novoToken)).status).toBe(403);
    await expect(signIn(`${login}@postos.invalid`, "senha-nova-2")).rejects.toThrow(/USER_DISABLED/);
  });

  it("supervisor (com e-mail) define a senha pelo link de recuperação", async () => {
    const email = `sup-${run}@demo.local`;
    const body = { email, nome: "Supervisor Demo", role: "supervisor", companyId: `emp-${run}`, postIds: [`posto-${run}`] };
    expect((await api("POST", "/v1/users", geralToken, body, crypto.randomUUID())).status).toBe(201);
    await authRest("accounts:sendOobCode", { requestType: "PASSWORD_RESET", email });
    const codes = await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`).then((x) => x.json() as Promise<any>);
    const code = codes.oobCodes.find((c: any) => c.email === email && c.requestType === "PASSWORD_RESET");
    expect(code).toBeDefined();
    await authRest("accounts:resetPassword", { oobCode: code.oobCode, newPassword: "nova-senha-456" });
    const supToken = await signIn(email, "nova-senha-456");
    expect((await api("GET", "/v1/me", supToken)).body.role).toBe("supervisor");
  });

  it("cadastra empresa → contrato → posto e bloqueia a empresa", async () => {
    const emp = await api("POST", "/v1/companies", geralToken, {
      nome: `Empresa Integração ${run}`,
      cnpj: "11.222.333/0001-81",
      responsaveis: [{ nome: "Fulano", telefone: "(21) 99999-0000" }],
      retencaoFotosDias: 15,
    }, crypto.randomUUID());
    expect(emp.status).toBe(201);
    const companyId = emp.body.id as string;

    const ct = await api("POST", "/v1/contracts", geralToken, { companyId, nome: "Contrato X", cliente: "Cliente X", vigenciaInicio: "2026-01-01" }, crypto.randomUUID());
    expect(ct.status).toBe(201);

    const pt = await api("POST", "/v1/posts", geralToken, {
      contractId: ct.body.id,
      nome: "Portaria X",
      endereco: "Rua X, 1 - Rio de Janeiro",
      geo: { lat: -22.9068, lng: -43.1729 },
      diasOperacao: [5, 1, 3],
      horarioFuncionamento: { inicio: "18:00", fim: "08:00" },
    }, crypto.randomUUID());
    expect(pt.status).toBe(201);

    expect(await deps.db.getDoc(`companies/${companyId}`)).toMatchObject({
      responsaveis: [{ nome: "Fulano", telefone: "(21) 99999-0000" }],
      permissoesAdmin: { gerirContratos: true, gerirPostos: true },
      retencaoFotosDias: 15,
    });
    expect(await deps.db.getDoc(`posts/${pt.body.id}`)).toMatchObject({
      companyId,
      contractId: ct.body.id,
      geo: { lat: -22.9068, lng: -43.1729 },
      diasOperacao: [1, 3, 5],
      horarioFuncionamento: { inicio: "18:00", fim: "08:00" },
      timezone: "America/Sao_Paulo",
    });

    const edit = await api("PATCH", `/v1/posts/${pt.body.id}`, geralToken, { geo: null, nome: "Portaria X2" });
    expect([...edit.body.campos].sort()).toEqual(["geo", "nome"]);
    expect((await deps.db.getDoc(`posts/${pt.body.id}`))!.geo).toBeNull();

    const bloq = await api("PATCH", `/v1/companies/${companyId}`, geralToken, { status: "bloqueada", motivo: "Teste" });
    expect(bloq.status).toBe(200);
    const novoContrato = await api("POST", "/v1/contracts", geralToken, { companyId, nome: "Contrato Y", cliente: "Cliente Y", vigenciaInicio: "2026-01-01" }, crypto.randomUUID());
    expect(novoContrato.status).toBe(409);
    const logs = await deps.db.query("auditLogs", [{ field: "companyId", op: "EQUAL", value: companyId }], 20);
    expect(logs.map((l) => l.data.action).sort()).toEqual(["contrato.criar", "empresa.criar", "empresa.status.bloqueada", "posto.criar", "posto.editar"]);
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
