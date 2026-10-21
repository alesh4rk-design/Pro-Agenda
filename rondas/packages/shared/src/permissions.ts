import type { Role, UserStatus, CompanyStatus, SupervisorFuncao } from "./roles.js";

/**
 * Modelo de permissões (RBAC + escopo por empresa/contrato/posto).
 *
 * Uma decisão de acesso sempre combina DUAS verificações:
 *  1. Permissão do perfil  -> `hasPermission(actor, permission)`
 *  2. Escopo do recurso    -> `canAccessScope(actor, scope)`
 *
 * O backend (Worker) usa estas funções antes de qualquer escrita.
 * As regras do Firestore (firestore.rules) replicam a parte de LEITURA.
 * Esconder botões no frontend é apenas conveniência, nunca segurança.
 */

export const PERMISSIONS = [
  // Plataforma
  "sistema.configurar", // nome do sistema, parâmetros globais
  "empresa.gerir", // criar/editar/bloquear/desativar empresas
  "empresa.ver_todas",
  "auditoria.ver",
  "retencao.gerir", // política de retenção de fotos e custos
  // Empresa
  "contrato.gerir",
  "posto.gerir",
  "usuario.gerir",
  "ponto.gerir", // pontos de ronda e QR Codes
  "checklist.gerir",
  "programacao.gerir",
  "contatos.gerir",
  "alerta.configurar",
  // Operação / fiscalização
  "ronda.acompanhar",
  "ronda.justificar",
  "inspecao.registrar",
  "relatorio.ver",
  "mapa.ver",
  "ocorrencia.gerir",
  // Acesso do posto
  "ronda.executar",
  "ocorrencia.registrar",
  "ronda.ver_proprias",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Permissões que o admin_empresa só tem se a empresa permitir (flag em `companies/{id}.permissoesAdmin`). */
export const COMPANY_GATED_PERMISSIONS = {
  "contrato.gerir": "gerirContratos",
  "posto.gerir": "gerirPostos",
} as const satisfies Partial<Record<Permission, keyof CompanyAdminPermissions>>;

export interface CompanyAdminPermissions {
  gerirContratos: boolean;
  gerirPostos: boolean;
}

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin_geral: PERMISSIONS,
  admin_empresa: [
    "contrato.gerir",
    "posto.gerir",
    "usuario.gerir",
    "ponto.gerir",
    "checklist.gerir",
    "programacao.gerir",
    "contatos.gerir",
    "alerta.configurar",
    "ronda.acompanhar",
    "ronda.justificar",
    "relatorio.ver",
    "mapa.ver",
    "ocorrencia.gerir",
  ],
  supervisor: [
    "ronda.acompanhar",
    "ronda.justificar",
    "inspecao.registrar",
    "relatorio.ver",
    "mapa.ver",
    "ocorrencia.gerir",
  ],
  posto: ["ronda.executar", "ocorrencia.registrar", "ronda.ver_proprias"],
};

/** Usuário autenticado, montado pelo backend a partir do token + documento users/{uid}. */
export interface Actor {
  uid: string;
  role: Role;
  companyId: string | null;
  status: UserStatus;
  postIds: string[];
  contractIds: string[];
  /** Status da empresa do usuário (null para admin_geral). */
  companyStatus: CompanyStatus | null;
  companyAdminPermissions?: CompanyAdminPermissions;
}

/** Usuário apto a usar o sistema: conta ativa e, se vinculado, empresa ativa. */
export function isActorActive(actor: Actor): boolean {
  if (actor.status !== "ativo") return false;
  if (actor.role === "admin_geral") return true;
  return actor.companyId !== null && actor.companyStatus === "ativa";
}

export function permissionsOf(actor: Actor): Permission[] {
  if (!isActorActive(actor)) return [];
  return ROLE_PERMISSIONS[actor.role].filter((p) => {
    if (actor.role !== "admin_empresa") return true;
    const flag = (COMPANY_GATED_PERMISSIONS as Partial<Record<Permission, keyof CompanyAdminPermissions>>)[p];
    if (!flag) return true;
    return actor.companyAdminPermissions?.[flag] === true;
  });
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return permissionsOf(actor).includes(permission);
}

/** Escopo de um recurso: a qual empresa / contrato / posto ele pertence. */
export interface ResourceScope {
  companyId: string;
  contractId?: string | null;
  postId?: string | null;
}

/**
 * Verifica se o usuário pode acessar um recurso daquele escopo.
 * - admin_geral: qualquer empresa.
 * - admin_empresa: somente a própria empresa.
 * - supervisor: própria empresa E (posto vinculado OU contrato vinculado).
 *   Recursos de nível de empresa (sem posto/contrato) não são acessíveis.
 * - posto: própria empresa E o posto vinculado.
 */
export function canAccessScope(actor: Actor, scope: ResourceScope): boolean {
  if (!isActorActive(actor)) return false;
  if (actor.role === "admin_geral") return true;
  if (!scope.companyId || actor.companyId !== scope.companyId) return false;
  if (actor.role === "admin_empresa") return true;

  const postOk = !!scope.postId && actor.postIds.includes(scope.postId);
  if (actor.role === "posto") return postOk;

  const contractOk = !!scope.contractId && actor.contractIds.includes(scope.contractId);
  return postOk || contractOk;
}

export function can(actor: Actor, permission: Permission, scope?: ResourceScope): boolean {
  if (!hasPermission(actor, permission)) return false;
  if (!scope) return true;
  return canAccessScope(actor, scope);
}

/** Dados do usuário-alvo numa operação de cadastro/edição de usuário. */
export interface UserTarget {
  role: Role;
  companyId: string | null;
  funcao?: SupervisorFuncao;
}

/**
 * Quais perfis cada perfil pode cadastrar/editar.
 * Impede escalonamento de privilégio: admin_empresa nunca cria admin_geral
 * nem outro admin_empresa, e nunca atua fora da própria empresa.
 */
const MANAGEABLE_ROLES: Record<Role, readonly Role[]> = {
  admin_geral: ["admin_geral", "admin_empresa", "supervisor", "posto"],
  admin_empresa: ["supervisor", "posto"],
  supervisor: [],
  posto: [],
};

export function canManageUser(actor: Actor, target: UserTarget): boolean {
  if (!hasPermission(actor, "usuario.gerir")) return false;
  if (!MANAGEABLE_ROLES[actor.role].includes(target.role)) return false;
  if (target.role === "admin_geral") return target.companyId === null;
  if (!target.companyId) return false;
  return canAccessScope(actor, { companyId: target.companyId });
}

/** Perfis que o usuário pode atribuir (para popular formulários). */
export function assignableRoles(actor: Actor): Role[] {
  if (!hasPermission(actor, "usuario.gerir")) return [];
  return [...MANAGEABLE_ROLES[actor.role]];
}
