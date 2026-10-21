import { z } from "zod";
import { POSTO_LOGIN_DOMAIN, POSTO_LOGIN_RE, ROLES, SUPERVISOR_FUNCOES, USER_STATUSES } from "./roles.js";

/** Identificadores de documentos: evita path traversal e IDs malformados. */
export const docId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador inválido");

const nome = z.string().trim().min(2, "Informe o nome").max(120);

export const postoLogin = z
  .string()
  .trim()
  .toLowerCase()
  .regex(POSTO_LOGIN_RE, "Login: 3 a 40 caracteres (letras minúsculas, números, ponto, hífen ou sublinhado)");

/** Senha definida pelo administrador para o acesso do posto. */
export const senha = z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(128);

/**
 * Coerência entre perfil, empresa e vínculos. Usada no cadastro e também no
 * estado final de uma edição (o backend valida o resultado, não só o patch).
 */
export function userShapeIssues(v: {
  role: string;
  companyId: string | null;
  postIds: string[];
  contractIds: string[];
  funcao?: string | null;
}): { path: string[]; message: string }[] {
  const issues: { path: string[]; message: string }[] = [];
  if (v.role === "admin_geral" && v.companyId !== null) {
    issues.push({ path: ["companyId"], message: "Administrador geral não pertence a uma empresa" });
  }
  if (v.role !== "admin_geral" && !v.companyId) {
    issues.push({ path: ["companyId"], message: "Informe a empresa" });
  }
  if (v.role !== "supervisor" && v.contractIds.length > 0) {
    issues.push({ path: ["contractIds"], message: "Somente supervisores são vinculados a contratos" });
  }
  if ((v.role === "admin_geral" || v.role === "admin_empresa") && v.postIds.length > 0) {
    issues.push({ path: ["postIds"], message: "Administradores não são vinculados a postos" });
  }
  if (v.funcao && v.role !== "supervisor") {
    issues.push({ path: ["funcao"], message: "Função só se aplica a supervisores" });
  }
  if (v.role === "posto" && v.postIds.length !== 1) {
    issues.push({ path: ["postIds"], message: "O acesso do posto deve estar vinculado a exatamente um posto" });
  }
  return issues;
}

export const createUserSchema = z
  .object({
    /** Obrigatório para administradores e supervisores (recebem o link para definir a senha). */
    email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido")).pipe(z.string().max(254)).optional(),
    /** Somente para o acesso do posto: login e senha definidos pelo administrador. */
    login: postoLogin.optional(),
    senha: senha.optional(),
    nome,
    role: z.enum(ROLES),
    funcao: z.enum(SUPERVISOR_FUNCOES).optional(),
    companyId: docId.nullable(),
    postIds: z.array(docId).max(50).default([]),
    contractIds: z.array(docId).max(20).default([]),
    telefone: z.string().trim().max(30).optional(),
    matricula: z.string().trim().max(40).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const issue of userShapeIssues(v)) ctx.addIssue({ code: "custom", ...issue });
    if (v.role === "posto") {
      if (!v.login) ctx.addIssue({ code: "custom", path: ["login"], message: "Informe o login do posto" });
      if (!v.senha) ctx.addIssue({ code: "custom", path: ["senha"], message: "Informe a senha do posto" });
      if (v.email) ctx.addIssue({ code: "custom", path: ["email"], message: "O acesso do posto não usa e-mail" });
    } else {
      if (!v.email) ctx.addIssue({ code: "custom", path: ["email"], message: "Informe o e-mail" });
      if (v.email?.endsWith(`@${POSTO_LOGIN_DOMAIN}`)) ctx.addIssue({ code: "custom", path: ["email"], message: "E-mail inválido" });
      if (v.login || v.senha) {
        ctx.addIssue({ code: "custom", path: ["senha"], message: "Login e senha são definidos só para o acesso do posto" });
      }
    }
  });
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    nome: nome.optional(),
    role: z.enum(ROLES).optional(),
    funcao: z.enum(SUPERVISOR_FUNCOES).nullable().optional(),
    status: z.enum(USER_STATUSES).optional(),
    postIds: z.array(docId).max(50).optional(),
    contractIds: z.array(docId).max(20).optional(),
    telefone: z.string().trim().max(30).nullable().optional(),
    matricula: z.string().trim().max(40).nullable().optional(),
    motivo: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "motivo"), "Nenhuma alteração informada");
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** Redefinição de senha do acesso do posto pelo administrador. */
export const resetPostoPasswordSchema = z
  .object({ senha, motivo: z.string().trim().max(500).optional() })
  .strict();

export const systemConfigSchema = z
  .object({
    nomeSistema: z.string().trim().min(2, "Nome muito curto").max(60, "Nome muito longo"),
  })
  .strict();
export type SystemConfigInput = z.infer<typeof systemConfigSchema>;

/** Formata erros do zod para resposta da API em português. */
export function formatZodError(error: z.ZodError): { campo: string; mensagem: string }[] {
  return error.issues.map((i) => ({ campo: i.path.join(".") || "(corpo)", mensagem: i.message }));
}
