import { z } from "zod";
import { ROLES, SUPERVISOR_FUNCOES, USER_STATUSES } from "./roles.js";

/** Identificadores de documentos: evita path traversal e IDs malformados. */
export const docId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador inválido");

const nome = z.string().trim().min(2, "Informe o nome").max(120);

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
  return issues;
}

export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido")).pipe(z.string().max(254)),
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
