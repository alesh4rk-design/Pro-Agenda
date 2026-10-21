import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { type Actor, type CompanyAdminPermissions, isRole } from "@rondas/shared";
import type { FirestoreClient } from "./google/firestore.js";
import { ApiError } from "./http.js";

export interface DecodedToken {
  uid: string;
  email?: string;
  role?: string;
  cid?: string;
  iat: number;
}

export type TokenVerifier = (idToken: string) => Promise<DecodedToken>;

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

/** Verifica a assinatura, emissor, público e validade do ID token do Firebase. */
export function firebaseTokenVerifier(projectId: string): TokenVerifier {
  return async (idToken) => {
    try {
      const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
        algorithms: ["RS256"],
      });
      return toDecoded(payload);
    } catch {
      throw new ApiError(401, "TOKEN_INVALIDO", "Sessão inválida ou expirada. Entre novamente.");
    }
  };
}

/**
 * SOMENTE DESENVOLVIMENTO: o emulador do Auth emite tokens sem assinatura.
 * `usesEmulators()` impede que este verificador seja usado em produção.
 */
export function emulatorTokenVerifier(projectId: string): TokenVerifier {
  return async (idToken) => {
    try {
      const payload = decodeJwt(idToken);
      if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error();
      if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) throw new Error();
      return toDecoded(payload);
    } catch {
      throw new ApiError(401, "TOKEN_INVALIDO", "Sessão inválida ou expirada. Entre novamente.");
    }
  };
}

function toDecoded(payload: Record<string, unknown>): DecodedToken {
  const uid = payload.sub;
  if (typeof uid !== "string" || !uid) throw new Error("sub ausente");
  return {
    uid,
    email: typeof payload.email === "string" ? payload.email : undefined,
    role: typeof payload.role === "string" ? payload.role : undefined,
    cid: typeof payload.cid === "string" ? payload.cid : undefined,
    iat: typeof payload.iat === "number" ? payload.iat : 0,
  };
}

export function bearerToken(request: Request): string {
  const h = request.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m?.[1]) throw new ApiError(401, "NAO_AUTENTICADO", "Faça login para continuar.");
  return m[1];
}

/**
 * Monta o Actor a partir do token + users/{uid} (fonte da verdade) + empresa.
 * Nega acesso se a conta/empresa não estiver ativa ou se as claims do token
 * estiverem desatualizadas em relação ao perfil gravado.
 */
export async function loadActor(db: FirestoreClient, token: DecodedToken): Promise<Actor> {
  const profile = await db.getDoc(`users/${token.uid}`);
  if (!profile) throw new ApiError(403, "PERFIL_INEXISTENTE", "Usuário sem perfil cadastrado. Procure o administrador.");
  const role = profile.role;
  if (!isRole(role)) throw new ApiError(403, "PERFIL_INVALIDO", "Perfil de acesso inválido.");
  if (profile.status !== "ativo") throw new ApiError(403, "USUARIO_INATIVO", "Seu acesso está bloqueado ou desativado.");

  const companyId = (profile.companyId as string | null) ?? null;
  if (token.role !== role || (token.cid ?? null) !== companyId) {
    throw new ApiError(401, "CLAIMS_DESATUALIZADAS", "Suas permissões mudaram. Atualizando sessão…");
  }

  let companyStatus: Actor["companyStatus"] = null;
  let companyAdminPermissions: CompanyAdminPermissions | undefined;
  if (role !== "admin_geral") {
    if (!companyId) throw new ApiError(403, "PERFIL_INVALIDO", "Usuário sem empresa vinculada.");
    const company = await db.getDoc(`companies/${companyId}`);
    if (!company) throw new ApiError(403, "EMPRESA_INEXISTENTE", "Empresa não encontrada.");
    companyStatus = company.status as Actor["companyStatus"];
    if (companyStatus !== "ativa") throw new ApiError(403, "EMPRESA_INATIVA", "A empresa está bloqueada ou desativada.");
    companyAdminPermissions = company.permissoesAdmin as CompanyAdminPermissions | undefined;
  }

  return {
    uid: token.uid,
    role,
    companyId,
    status: "ativo",
    postIds: (profile.postIds as string[] | undefined) ?? [],
    contractIds: (profile.contractIds as string[] | undefined) ?? [],
    companyStatus,
    companyAdminPermissions,
  };
}
