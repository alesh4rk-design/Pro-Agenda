/**
 * Cadastros da Etapa 2: empresas, contratos e postos.
 *
 * Regras comuns:
 * - Nada é apagado: empresas são bloqueadas/desativadas; contratos e postos são
 *   suspensos/encerrados. O histórico operacional continua íntegro.
 * - `companyId`/`contractId` de contratos e postos são imutáveis (mover um posto
 *   de empresa misturaria históricos de clientes diferentes).
 * - Recurso de outra empresa responde 404 (não revela existência).
 * - Mudar para um status não ativo exige motivo (fica na auditoria).
 */
import {
  type Actor,
  type Permission,
  canAccessScope,
  createCompanySchema,
  createContractSchema,
  createPostSchema,
  formatZodError,
  hasPermission,
  updateCompanySchema,
  updateContractSchema,
  updatePostSchema,
} from "@rondas/shared";
import type { z } from "zod";
import { auditWrite, diff } from "../audit.js";
import type { Ctx } from "../context.js";
import type { DocData } from "../google/firestore.js";
import { ApiError, json, readJson } from "../http.js";
import { findReplay, idempotencyKey, idempotencyWrite } from "../idempotency.js";

async function parse<S extends z.ZodType>(ctx: Ctx, schema: S): Promise<z.infer<S>> {
  const parsed = schema.safeParse(await readJson(ctx.request));
  if (!parsed.success) throw new ApiError(400, "DADOS_INVALIDOS", "Dados inválidos.", formatZodError(parsed.error));
  return parsed.data;
}

function requirePermission(actor: Actor, p: Permission, msg: string) {
  if (!hasPermission(actor, p)) throw new ApiError(403, "SEM_PERMISSAO", msg);
}

const notFound = (label: string) => new ApiError(404, "NAO_ENCONTRADO", `${label} não encontrado(a).`);

const ACTIVE_STATUS = new Set(["ativa", "ativo"]);

/** Cria o documento + auditoria + registro de idempotência num único commit. */
async function auditedCreate(
  ctx: Ctx,
  /** companyId null = o próprio documento é a empresa (companyId = id gerado). */
  opts: { route: string; collection: string; targetType: string; action: string; companyId: string | null; data: DocData },
): Promise<Response> {
  const { actor, deps } = ctx;
  const key = idempotencyKey(ctx.request, true)!;
  const now = deps.now();
  const id = deps.newId();
  const companyId = opts.companyId ?? id;
  const doc = { id, ...opts.data, createdAt: now, createdBy: actor.uid, updatedAt: now, updatedBy: actor.uid };
  const body = { id, companyId };
  await deps.db.commit([
    { op: "create", path: `${opts.collection}/${id}`, data: doc },
    auditWrite(deps.newId(), now, actor, ctx.requestId, {
      action: opts.action,
      targetType: opts.targetType,
      targetId: id,
      companyId,
      after: opts.data,
    }),
    idempotencyWrite(actor.uid, key, opts.route, 201, body, now),
  ]);
  return json(body, 201);
}

async function replayIfAny(ctx: Ctx, route: string): Promise<Response | null> {
  const key = idempotencyKey(ctx.request, true);
  const stored = await findReplay(ctx.deps.db, ctx.actor.uid, key, route);
  return stored ? json(stored.body, stored.status, { "Idempotent-Replay": "true" }) : null;
}

/** Aplica o patch, grava só o que mudou e audita antes/depois. */
async function auditedUpdate(
  ctx: Ctx,
  opts: {
    path: string;
    current: DocData;
    patch: Record<string, unknown> & { motivo?: string; status?: string };
    targetType: string;
    actionPrefix: string;
    companyId: string;
  },
): Promise<Response> {
  const { actor, deps } = ctx;
  const { motivo, ...fields } = opts.patch;
  const d = diff(opts.current, fields);
  if (d.changed.length === 0) return json({ id: opts.current.id, alterado: false });

  const statusChanged = d.changed.includes("status");
  if (statusChanged && !ACTIVE_STATUS.has(String(fields.status)) && !motivo) {
    throw new ApiError(400, "MOTIVO_OBRIGATORIO", "Informe o motivo da mudança de status.");
  }
  const now = deps.now();
  const changed = Object.fromEntries(d.changed.map((k) => [k, fields[k] ?? null]));
  await deps.db.commit([
    { op: "update", path: opts.path, data: { ...changed, updatedAt: now, updatedBy: actor.uid } },
    auditWrite(deps.newId(), now, actor, ctx.requestId, {
      action: statusChanged ? `${opts.actionPrefix}.status.${fields.status}` : `${opts.actionPrefix}.editar`,
      targetType: opts.targetType,
      targetId: String(opts.current.id ?? opts.path.split("/")[1]),
      companyId: opts.companyId,
      before: d.before,
      after: d.after,
      motivo,
    }),
  ]);
  return json({ id: opts.current.id, alterado: true, campos: d.changed });
}

// ------------------------------------------------------------- empresas

/** CNPJ é único entre as empresas cadastradas. */
async function requireUniqueCnpj(ctx: Ctx, cnpj: string | null | undefined, exceptId?: string) {
  if (!cnpj) return;
  const found = await ctx.deps.db.query("companies", [{ field: "cnpj", op: "EQUAL", value: cnpj }], 2);
  if (found.some((c) => c.id !== exceptId)) {
    throw new ApiError(409, "CNPJ_EM_USO", "Já existe uma empresa cadastrada com este CNPJ.");
  }
}

/** POST /v1/companies — somente administrador geral. */
export async function createCompany(ctx: Ctx): Promise<Response> {
  requirePermission(ctx.actor, "empresa.gerir", "Somente o administrador geral cadastra empresas.");
  const route = "POST /v1/companies";
  const replay = await replayIfAny(ctx, route);
  if (replay) return replay;
  const input = await parse(ctx, createCompanySchema);
  await requireUniqueCnpj(ctx, input.cnpj);
  return auditedCreate(ctx, {
    route,
    collection: "companies",
    targetType: "company",
    action: "empresa.criar",
    companyId: null,
    data: { ...input, cnpj: input.cnpj ?? null, status: "ativa" },
  });
}

/** PATCH /v1/companies/:id — somente administrador geral (inclui bloquear/desativar). */
export async function updateCompany(ctx: Ctx): Promise<Response> {
  requirePermission(ctx.actor, "empresa.gerir", "Somente o administrador geral altera empresas.");
  const id = ctx.params.id!;
  const patch = await parse(ctx, updateCompanySchema);
  const current = await ctx.deps.db.getDoc(`companies/${id}`);
  if (!current) throw notFound("Empresa");
  if (patch.cnpj && patch.cnpj !== current.cnpj) await requireUniqueCnpj(ctx, patch.cnpj, id);
  return auditedUpdate(ctx, { path: `companies/${id}`, current: { id, ...current }, patch, targetType: "company", actionPrefix: "empresa", companyId: id });
}

// ------------------------------------------------------------- contratos

/** POST /v1/contracts — admin geral ou admin da empresa (se a empresa permitir). */
export async function createContract(ctx: Ctx): Promise<Response> {
  const { actor, deps } = ctx;
  requirePermission(actor, "contrato.gerir", "Você não tem permissão para cadastrar contratos.");
  const route = "POST /v1/contracts";
  const replay = await replayIfAny(ctx, route);
  if (replay) return replay;
  const input = await parse(ctx, createContractSchema);
  if (!canAccessScope(actor, { companyId: input.companyId })) throw notFound("Empresa");
  const company = await deps.db.getDoc(`companies/${input.companyId}`);
  if (!company) throw notFound("Empresa");
  if (company.status !== "ativa") throw new ApiError(409, "EMPRESA_INATIVA", "A empresa não está ativa.");
  return auditedCreate(ctx, {
    route,
    collection: "contracts",
    targetType: "contract",
    action: "contrato.criar",
    companyId: input.companyId,
    data: { ...input, status: "ativo" },
  });
}

/** PATCH /v1/contracts/:id */
export async function updateContract(ctx: Ctx): Promise<Response> {
  const { actor, deps } = ctx;
  requirePermission(actor, "contrato.gerir", "Você não tem permissão para alterar contratos.");
  const id = ctx.params.id!;
  const patch = await parse(ctx, updateContractSchema);
  const current = await deps.db.getDoc(`contracts/${id}`);
  if (!current || !canAccessScope(actor, { companyId: String(current.companyId) })) throw notFound("Contrato");
  const inicio = (patch.vigenciaInicio ?? current.vigenciaInicio) as string;
  const fim = (patch.vigenciaFim !== undefined ? patch.vigenciaFim : current.vigenciaFim) as string | null;
  if (fim !== null && fim < inicio) {
    throw new ApiError(400, "DADOS_INVALIDOS", "Dados inválidos.", [{ campo: "vigenciaFim", mensagem: "O fim da vigência deve ser igual ou posterior ao início" }]);
  }
  return auditedUpdate(ctx, { path: `contracts/${id}`, current: { id, ...current }, patch, targetType: "contract", actionPrefix: "contrato", companyId: String(current.companyId) });
}

// ------------------------------------------------------------- postos

/** POST /v1/posts — a empresa é herdada do contrato (nunca informada pelo cliente). */
export async function createPost(ctx: Ctx): Promise<Response> {
  const { actor, deps } = ctx;
  requirePermission(actor, "posto.gerir", "Você não tem permissão para cadastrar postos.");
  const route = "POST /v1/posts";
  const replay = await replayIfAny(ctx, route);
  if (replay) return replay;
  const input = await parse(ctx, createPostSchema);
  const contract = await deps.db.getDoc(`contracts/${input.contractId}`);
  if (!contract || !canAccessScope(actor, { companyId: String(contract.companyId) })) throw notFound("Contrato");
  if (contract.status === "encerrado") throw new ApiError(409, "CONTRATO_ENCERRADO", "Contrato encerrado não recebe novos postos.");
  const companyId = String(contract.companyId);
  const company = await deps.db.getDoc(`companies/${companyId}`);
  if (company?.status !== "ativa") throw new ApiError(409, "EMPRESA_INATIVA", "A empresa não está ativa.");
  return auditedCreate(ctx, {
    route,
    collection: "posts",
    targetType: "post",
    action: "posto.criar",
    companyId,
    data: { ...input, companyId, status: "ativo" },
  });
}

/** PATCH /v1/posts/:id */
export async function updatePost(ctx: Ctx): Promise<Response> {
  const { actor, deps } = ctx;
  requirePermission(actor, "posto.gerir", "Você não tem permissão para alterar postos.");
  const id = ctx.params.id!;
  const patch = await parse(ctx, updatePostSchema);
  const current = await deps.db.getDoc(`posts/${id}`);
  if (!current || !canAccessScope(actor, { companyId: String(current.companyId) })) throw notFound("Posto");
  return auditedUpdate(ctx, { path: `posts/${id}`, current: { id, ...current }, patch, targetType: "post", actionPrefix: "posto", companyId: String(current.companyId) });
}
