/**
 * Perfis de acesso do sistema.
 *
 * O perfil é gravado em dois lugares:
 *  - no documento `users/{uid}` (fonte da verdade, lido pelo backend e pelas regras);
 *  - nas custom claims do Firebase Auth (`role`, `cid`), usadas como cache rápido
 *    pelas regras do Firestore e pelo frontend.
 *
 * Quando os dois divergem (claims desatualizadas), o acesso é NEGADO até o
 * usuário renovar o token. Ver docs/ARQUITETURA.md, seção "Fluxo de autenticação".
 */
export const ROLES = ["admin_geral", "admin_empresa", "supervisor", "vigilante"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin_geral: "Administrador geral",
  admin_empresa: "Administrador da empresa",
  supervisor: "Supervisor / fiscal",
  vigilante: "Vigilante",
};

/** Subtipo do perfil supervisor: mesmo conjunto de permissões, rótulo distinto. */
export const SUPERVISOR_FUNCOES = ["supervisor", "fiscal"] as const;
export type SupervisorFuncao = (typeof SUPERVISOR_FUNCOES)[number];

export const USER_STATUSES = ["ativo", "bloqueado", "desativado"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const COMPANY_STATUSES = ["ativa", "bloqueada", "desativada"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

/** Perfis que pertencem obrigatoriamente a uma empresa. */
export function roleRequiresCompany(role: Role): boolean {
  return role !== "admin_geral";
}

/** Perfis cujo acesso é restrito a postos/contratos específicos. */
export function roleIsScopedToPosts(role: Role): boolean {
  return role === "supervisor" || role === "vigilante";
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Formato das custom claims gravadas no Firebase Auth (limite de 1000 bytes). */
export interface AuthClaims {
  role: Role;
  /** companyId — ausente para admin_geral. */
  cid?: string;
}
