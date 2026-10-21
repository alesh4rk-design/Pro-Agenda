/**
 * Validação dos cadastros de empresas, contratos e postos (Etapa 2).
 * Usado pelo Worker (fonte da verdade) e pelos formulários do frontend.
 */
import { z } from "zod";
import { COMPANY_STATUSES } from "./roles.js";
import { docId } from "./schemas.js";

export const DEFAULT_RETENCAO_FOTOS_DIAS = 7;

// ------------------------------------------------------------- utilitários

/** Valida CNPJ (14 dígitos e dígitos verificadores). Aceita com ou sem máscara. */
export function isValidCnpj(value: string): boolean {
  const d = value.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function formatCnpj(value: string): string {
  const d = value.replace(/\D/g, "");
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : value;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Data civil YYYY-MM-DD válida (rejeita 2026-02-30). */
export function isValidIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const texto = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max);
const isoDate = z.string().refine(isValidIsoDate, "Data inválida (use AAAA-MM-DD)");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido (use HH:mm)");
const motivo = z.string().trim().max(500).optional();
const retencao = z.number().int().min(1, "Mínimo de 1 dia").max(365, "Máximo de 365 dias");

const responsavel = z
  .object({
    nome: texto(2, 120, "Informe o nome do responsável"),
    telefone: z.string().trim().max(30).optional(),
    email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido")).optional(),
  })
  .strict();

const permissoesAdmin = z.object({ gerirContratos: z.boolean(), gerirPostos: z.boolean() }).strict();

const cnpj = z
  .string()
  .trim()
  .refine((v) => v === "" || isValidCnpj(v), "CNPJ inválido")
  .transform((v) => (v === "" ? null : formatCnpj(v)));

// ------------------------------------------------------------- empresas

export const createCompanySchema = z
  .object({
    nome: texto(2, 120, "Informe o nome da empresa"),
    cnpj: cnpj.optional(),
    responsaveis: z.array(responsavel).max(10).default([]),
    permissoesAdmin: permissoesAdmin.default({ gerirContratos: true, gerirPostos: true }),
    retencaoFotosDias: retencao.default(DEFAULT_RETENCAO_FOTOS_DIAS),
  })
  .strict();
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = z
  .object({
    nome: texto(2, 120, "Informe o nome da empresa").optional(),
    cnpj: cnpj.optional(),
    responsaveis: z.array(responsavel).max(10).optional(),
    permissoesAdmin: permissoesAdmin.optional(),
    retencaoFotosDias: retencao.optional(),
    status: z.enum(COMPANY_STATUSES).optional(),
    motivo,
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "motivo"), "Nenhuma alteração informada");
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

// ------------------------------------------------------------- contratos

export const CONTRACT_STATUSES = ["ativo", "suspenso", "encerrado"] as const;

function vigenciaOk(v: { vigenciaInicio?: string; vigenciaFim?: string | null }) {
  return !v.vigenciaInicio || !v.vigenciaFim || v.vigenciaFim >= v.vigenciaInicio;
}
const VIGENCIA_MSG = { message: "O fim da vigência deve ser igual ou posterior ao início", path: ["vigenciaFim"] };

export const createContractSchema = z
  .object({
    companyId: docId,
    nome: texto(2, 120, "Informe o nome do contrato"),
    cliente: texto(2, 120, "Informe o cliente"),
    vigenciaInicio: isoDate,
    vigenciaFim: isoDate.nullable().default(null),
    retencaoFotosDias: retencao.nullable().default(null),
    observacoes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine(vigenciaOk, VIGENCIA_MSG);
export type CreateContractInput = z.infer<typeof createContractSchema>;

export const updateContractSchema = z
  .object({
    nome: texto(2, 120, "Informe o nome do contrato").optional(),
    cliente: texto(2, 120, "Informe o cliente").optional(),
    vigenciaInicio: isoDate.optional(),
    vigenciaFim: isoDate.nullable().optional(),
    retencaoFotosDias: retencao.nullable().optional(),
    observacoes: z.string().trim().max(1000).optional(),
    status: z.enum(CONTRACT_STATUSES).optional(),
    motivo,
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "motivo"), "Nenhuma alteração informada");
export type UpdateContractInput = z.infer<typeof updateContractSchema>;

// ------------------------------------------------------------- postos

export const SHIFT_DATE_RULES = ["inicio_turno", "data_civil"] as const;
export const SHIFT_DATE_RULE_LABELS: Record<(typeof SHIFT_DATE_RULES)[number], string> = {
  inicio_turno: "Data de início do turno (turno 18:00 de segunda → 08:00 de terça conta como segunda)",
  data_civil: "Data civil de cada ronda (rondas após 00:00 contam no dia seguinte)",
};

const geo = z
  .object({
    lat: z.number().min(-90, "Latitude inválida").max(90, "Latitude inválida"),
    lng: z.number().min(-180, "Longitude inválida").max(180, "Longitude inválida"),
  })
  .strict();

const diasOperacao = z
  .array(z.number().int().min(0).max(6))
  .min(1, "Selecione ao menos um dia de operação")
  .max(7)
  .refine((d) => new Set(d).size === d.length, "Dias repetidos")
  .transform((d) => [...d].sort((a, b) => a - b));

const timezone = z.string().trim().refine(isValidTimezone, "Fuso horário inválido");

/** Horário de funcionamento; fim <= início indica que atravessa a meia-noite. Iguais = 24 h. */
const horario = z.object({ inicio: hhmm, fim: hhmm }).strict();

export const createPostSchema = z
  .object({
    contractId: docId,
    nome: texto(2, 120, "Informe o nome do posto"),
    endereco: texto(3, 300, "Informe o endereço"),
    geo: geo.nullable().default(null),
    timezone: timezone.default("America/Sao_Paulo"),
    diasOperacao: diasOperacao.default([0, 1, 2, 3, 4, 5, 6]),
    horarioFuncionamento: horario.nullable().default(null),
    shiftDateRule: z.enum(SHIFT_DATE_RULES).default("inicio_turno"),
    instrucoes: z.string().trim().max(2000).optional(),
  })
  .strict();
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z
  .object({
    nome: texto(2, 120, "Informe o nome do posto").optional(),
    endereco: texto(3, 300, "Informe o endereço").optional(),
    geo: geo.nullable().optional(),
    timezone: timezone.optional(),
    diasOperacao: diasOperacao.optional(),
    horarioFuncionamento: horario.nullable().optional(),
    shiftDateRule: z.enum(SHIFT_DATE_RULES).optional(),
    instrucoes: z.string().trim().max(2000).optional(),
    status: z.enum(CONTRACT_STATUSES).optional(),
    motivo,
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "motivo"), "Nenhuma alteração informada");
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

// ------------------------------------------------------------- situação efetiva

export type OperationalState = "operando" | "suspenso" | "encerrado" | "bloqueado" | "fora_vigencia";

/**
 * Situação operacional de um posto considerando empresa, contrato, vigência e o próprio posto.
 * A situação mais restritiva prevalece. Usado para exibição e, nas próximas etapas,
 * para decidir se rondas são geradas.
 */
export function operationalState(
  company: { status: string },
  contract: { status: string; vigenciaInicio: string; vigenciaFim: string | null },
  post: { status: string },
  today: string,
): OperationalState {
  if (company.status !== "ativa") return "bloqueado";
  if (contract.status === "encerrado" || post.status === "encerrado") return "encerrado";
  if (contract.status === "suspenso" || post.status === "suspenso") return "suspenso";
  if (today < contract.vigenciaInicio || (contract.vigenciaFim !== null && today > contract.vigenciaFim)) {
    return "fora_vigencia";
  }
  return "operando";
}

export const OPERATIONAL_STATE_LABELS: Record<OperationalState, string> = {
  operando: "Operando",
  suspenso: "Suspenso",
  encerrado: "Encerrado",
  bloqueado: "Empresa bloqueada",
  fora_vigencia: "Fora da vigência",
};
