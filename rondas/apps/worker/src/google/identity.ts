/**
 * Operações administrativas do Firebase Authentication via Identity Toolkit REST.
 * Só o backend (com a conta de serviço) pode criar contas, definir perfis
 * (custom claims), bloquear e revogar sessões.
 */
import type { AuthClaims } from "@rondas/shared";

export interface IdentityAdmin {
  findUidByEmail(email: string): Promise<string | null>;
  createUser(input: { email: string; displayName: string }): Promise<string>;
  setClaims(uid: string, claims: AuthClaims): Promise<void>;
  /** disabled=true bloqueia o login; revoke encerra as sessões existentes (refresh tokens). */
  setDisabled(uid: string, disabled: boolean): Promise<void>;
  revokeSessions(uid: string): Promise<void>;
  deleteUser(uid: string): Promise<void>;
}

export interface IdentityOptions {
  projectId: string;
  emulatorHost?: string;
  getToken: () => Promise<string>;
}

export function createRestIdentity(opts: IdentityOptions): IdentityAdmin {
  const base = opts.emulatorHost
    ? `http://${opts.emulatorHost}/identitytoolkit.googleapis.com/v1/projects/${opts.projectId}`
    : `https://identitytoolkit.googleapis.com/v1/projects/${opts.projectId}`;

  async function post<T>(path: string, body: unknown): Promise<T> {
    const token = opts.emulatorHost ? "owner" : await opts.getToken();
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Identity Toolkit ${path} ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  return {
    async findUidByEmail(email) {
      const r = await post<{ users?: { localId: string }[] }>("/accounts:lookup", { email: [email] });
      return r.users?.[0]?.localId ?? null;
    },
    async createUser({ email, displayName }) {
      // Conta criada sem senha: o usuário define a própria senha pelo e-mail de redefinição.
      const r = await post<{ localId: string }>("/accounts", { email, displayName, emailVerified: false });
      return r.localId;
    },
    async setClaims(uid, claims) {
      await post("/accounts:update", { localId: uid, customAttributes: JSON.stringify(claims) });
    },
    async setDisabled(uid, disabled) {
      await post("/accounts:update", { localId: uid, disableUser: disabled });
    },
    async revokeSessions(uid) {
      await post("/accounts:update", { localId: uid, validSince: String(Math.floor(Date.now() / 1000)) });
    },
    async deleteUser(uid) {
      await post("/accounts:delete", { localId: uid });
    },
  };
}
