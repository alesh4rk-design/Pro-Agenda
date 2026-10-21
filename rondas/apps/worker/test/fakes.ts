import type { AuthClaims } from "@rondas/shared";
import { createApp } from "../src/app.js";
import type { DecodedToken } from "../src/auth.js";
import type { Deps } from "../src/context.js";
import { type DocData, type FirestoreClient, PreconditionFailed, type Write } from "../src/google/firestore.js";
import type { IdentityAdmin } from "../src/google/identity.js";
import { ApiError } from "../src/http.js";

export class MemoryFirestore implements FirestoreClient {
  docs = new Map<string, DocData>();
  failNextCommit = false;
  async getDoc(path: string) {
    const d = this.docs.get(path);
    return d ? structuredClone(d) : null;
  }
  async commit(writes: Write[]) {
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error("falha simulada");
    }
    for (const w of writes) {
      if (w.op === "create" && this.docs.has(w.path)) throw new PreconditionFailed(w.path);
      if (w.op === "update" && !this.docs.has(w.path)) throw new PreconditionFailed(w.path);
    }
    for (const w of writes) {
      if (w.op === "delete") this.docs.delete(w.path);
      else if (w.op === "update") this.docs.set(w.path, { ...this.docs.get(w.path), ...structuredClone(w.data) });
      else this.docs.set(w.path, structuredClone(w.data));
    }
  }
  async query(collection: string, filters: { field: string; op: string; value: unknown }[] = [], max = 500) {
    return [...this.docs.entries()]
      .filter(([p]) => p.startsWith(`${collection}/`) && p.split("/").length === 2)
      .filter(([, d]) => filters.every((f) => f.op !== "EQUAL" || d[f.field] === f.value))
      .slice(0, max)
      .map(([p, data]) => ({ id: p.split("/")[1]!, data }));
  }
  collection(name: string) {
    return [...this.docs.entries()].filter(([p]) => p.startsWith(`${name}/`)).map(([, d]) => d);
  }
}

export class FakeIdentity implements IdentityAdmin {
  users = new Map<string, { email: string; password?: string; claims?: AuthClaims; disabled: boolean; revokedAt?: number }>();
  private seq = 0;
  async findUidByEmail(email: string) {
    for (const [uid, u] of this.users) if (u.email.toLowerCase() === email.toLowerCase()) return uid;
    return null;
  }
  async createUser({ email, password }: { email: string; password?: string }) {
    const uid = `novo${++this.seq}`;
    this.users.set(uid, { email, password, disabled: false });
    return uid;
  }
  async setPassword(uid: string, password: string) {
    this.users.get(uid)!.password = password;
  }
  async setClaims(uid: string, claims: AuthClaims) {
    this.users.get(uid)!.claims = claims;
  }
  async setDisabled(uid: string, disabled: boolean) {
    const u = this.users.get(uid);
    if (u) u.disabled = disabled;
  }
  async revokeSessions(uid: string) {
    const u = this.users.get(uid);
    if (u) u.revokedAt = Date.now();
  }
  async deleteUser(uid: string) {
    this.users.delete(uid);
  }
}

/** Token de teste: "tok|uid|role|cid". */
export async function fakeVerify(token: string): Promise<DecodedToken> {
  const [prefix, uid, role, cid] = token.split("|");
  if (prefix !== "tok" || !uid) throw new ApiError(401, "TOKEN_INVALIDO", "inválido");
  return { uid, role: role || undefined, cid: cid || undefined, iat: 0 };
}

export function setup() {
  const db = new MemoryFirestore();
  const identity = new FakeIdentity();
  let n = 0;
  const deps: Deps = {
    db,
    identity,
    verifyToken: fakeVerify,
    now: () => new Date("2026-10-21T12:00:00Z"),
    newId: () => `id-${++n}`,
  };
  const app = createApp(deps, { allowedOrigins: "http://localhost:5173", environment: "test" });

  // Base: duas empresas, um contrato/posto em cada, usuários de cada perfil.
  const now = new Date("2026-10-01T00:00:00Z");
  db.docs.set("companies/empA", { nome: "Empresa A", status: "ativa", permissoesAdmin: { gerirContratos: true, gerirPostos: true } });
  db.docs.set("companies/empB", { nome: "Empresa B", status: "ativa", permissoesAdmin: { gerirContratos: true, gerirPostos: true } });
  db.docs.set("contracts/cA", { companyId: "empA" });
  db.docs.set("contracts/cB", { companyId: "empB" });
  db.docs.set("posts/pA", { companyId: "empA", contractId: "cA" });
  db.docs.set("posts/pB", { companyId: "empB", contractId: "cB" });
  const user = (uid: string, role: string, companyId: string | null, extra: DocData = {}) => {
    db.docs.set(`users/${uid}`, { uid, role, companyId, status: "ativo", postIds: [], contractIds: [], nome: uid, email: `${uid}@teste.local`, createdAt: now, ...extra });
    identity.users.set(uid, { email: (extra.email as string) ?? `${uid}@teste.local`, disabled: false, claims: companyId ? { role: role as never, cid: companyId } : { role: role as never } });
  };
  user("geral", "admin_geral", null);
  user("admA", "admin_empresa", "empA");
  user("admB", "admin_empresa", "empB");
  user("supA", "supervisor", "empA", { postIds: ["pA"], funcao: "supervisor" });
  user("postoA", "posto", "empA", { postIds: ["pA"], login: "portaria-a", email: "portaria-a@postos.invalid" });

  const tokens = {
    geral: "tok|geral|admin_geral|",
    admA: "tok|admA|admin_empresa|empA",
    admB: "tok|admB|admin_empresa|empB",
    supA: "tok|supA|supervisor|empA",
    postoA: "tok|postoA|posto|empA",
  };

  async function call(method: string, path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app(
      new Request(`https://api.teste${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  }

  return { db, identity, app, call, tokens };
}

export const KEY = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
