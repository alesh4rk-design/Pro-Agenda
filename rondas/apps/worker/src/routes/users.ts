import {
  type AuthClaims,
  type Role,
  canAccessScope,
  canManageUser,
  createUserSchema,
  formatZodError,
  isRole,
  updateUserSchema,
  userShapeIssues,
} from "@rondas/shared";
import { auditWrite, diff } from "../audit.js";
import type { Ctx, Deps } from "../context.js";
import type { DocData } from "../google/firestore.js";
import { ApiError, json, readJson } from "../http.js";
import { findReplay, idempotencyKey, idempotencyWrite } from "../idempotency.js";

/** Confere se postos/contratos existem e pertencem à empresa do usuário. */
async function validateAssignments(deps: Deps, companyId: string | null, postIds: string[], contractIds: string[]) {
  if (!companyId) return;
  const check = async (collection: string, id: string, label: string) => {
    const doc = await deps.db.getDoc(`${collection}/${id}`);
    // Mesma mensagem para "não existe" e "é de outra empresa": não revela dados alheios.
    if (!doc || doc.companyId !== companyId) {
      throw new ApiError(400, "VINCULO_INVALIDO", `${label} ${id} não encontrado nesta empresa.`);
    }
  };
  await Promise.all([
    ...[...new Set(postIds)].map((id) => check("posts", id, "Posto")),
    ...[...new Set(contractIds)].map((id) => check("contracts", id, "Contrato")),
  ]);
}

async function requireActiveCompany(deps: Deps, companyId: string | null) {
  if (!companyId) return;
  const company = await deps.db.getDoc(`companies/${companyId}`);
  if (!company) throw new ApiError(400, "EMPRESA_INEXISTENTE", "Empresa não encontrada.");
  if (company.status !== "ativa") throw new ApiError(409, "EMPRESA_INATIVA", "A empresa não está ativa.");
}

function claimsFor(role: Role, companyId: string | null): AuthClaims {
  return companyId ? { role, cid: companyId } : { role };
}

/** POST /v1/users — cadastra usuário (conta no Auth + perfil + claims + auditoria). */
export async function createUser(ctx: Ctx): Promise<Response> {
  const { actor, deps } = ctx;
  const route = "POST /v1/users";
  const key = idempotencyKey(ctx.request, true);
  const replay = await findReplay(deps.db, actor.uid, key, route);
  if (replay) return json(replay.body, replay.status, { "Idempotent-Replay": "true" });

  const parsed = createUserSchema.safeParse(await readJson(ctx.request));
  if (!parsed.success) throw new ApiError(400, "DADOS_INVALIDOS", "Dados inválidos.", formatZodError(parsed.error));
  const input = parsed.data;

  if (!canManageUser(actor, { role: input.role, companyId: input.companyId })) {
    throw new ApiError(403, "SEM_PERMISSAO", "Você não pode cadastrar este perfil nesta empresa.");
  }
  await requireActiveCompany(deps, input.companyId);
  await validateAssignments(deps, input.companyId, input.postIds, input.contractIds);

  if (await deps.identity.findUidByEmail(input.email)) {
    throw new ApiError(409, "EMAIL_EM_USO", "Já existe um usuário com este e-mail.");
  }

  const now = deps.now();
  const uid = await deps.identity.createUser({ email: input.email, displayName: input.nome });
  const profile: DocData = {
    uid,
    email: input.email,
    nome: input.nome,
    role: input.role,
    funcao: input.role === "supervisor" ? (input.funcao ?? "supervisor") : null,
    companyId: input.companyId,
    postIds: input.postIds,
    contractIds: input.contractIds,
    status: "ativo",
    telefone: input.telefone ?? null,
    matricula: input.matricula ?? null,
    createdAt: now,
    createdBy: actor.uid,
    updatedAt: now,
    updatedBy: actor.uid,
  };
  const body = { uid, email: input.email, role: input.role, companyId: input.companyId };

  try {
    await deps.identity.setClaims(uid, claimsFor(input.role, input.companyId));
    await deps.db.commit([
      { op: "create", path: `users/${uid}`, data: profile },
      auditWrite(deps.newId(), now, actor, ctx.requestId, {
        action: "usuario.criar",
        targetType: "user",
        targetId: uid,
        companyId: input.companyId,
        after: { email: input.email, nome: input.nome, role: input.role, companyId: input.companyId, postIds: input.postIds, contractIds: input.contractIds },
      }),
      idempotencyWrite(actor.uid, key!, route, 201, body, now),
    ]);
  } catch (err) {
    // Compensação: sem perfil gravado, a conta no Auth não deve ficar órfã.
    await deps.identity.deleteUser(uid).catch(() => undefined);
    throw err;
  }
  return json(body, 201);
}

/** PATCH /v1/users/:uid — altera perfil, vínculos ou status (bloqueio/desativação). */
export async function updateUser(ctx: Ctx): Promise<Response> {
  const { actor, deps } = ctx;
  const uid = ctx.params.uid!;
  const parsed = updateUserSchema.safeParse(await readJson(ctx.request));
  if (!parsed.success) throw new ApiError(400, "DADOS_INVALIDOS", "Dados inválidos.", formatZodError(parsed.error));
  const patch = parsed.data;

  const current = await deps.db.getDoc(`users/${uid}`);
  const currentCompany = (current?.companyId as string | null | undefined) ?? null;
  // Usuários de outra empresa são tratados como inexistentes (não vaza a existência).
  if (!current || !isRole(current.role) || (currentCompany !== null && !canAccessScope(actor, { companyId: currentCompany })) || (currentCompany === null && actor.role !== "admin_geral")) {
    throw new ApiError(404, "USUARIO_NAO_ENCONTRADO", "Usuário não encontrado.");
  }
  if (!canManageUser(actor, { role: current.role, companyId: currentCompany })) {
    throw new ApiError(403, "SEM_PERMISSAO", "Você não pode alterar este usuário.");
  }
  if (uid === actor.uid && (patch.role !== undefined || patch.status !== undefined)) {
    throw new ApiError(403, "AUTO_ALTERACAO", "Você não pode alterar o próprio perfil ou status.");
  }

  const next = {
    nome: patch.nome ?? current.nome,
    role: (patch.role ?? current.role) as Role,
    funcao: (patch.funcao !== undefined ? patch.funcao : (current.funcao ?? null)) as string | null,
    status: patch.status ?? current.status,
    postIds: patch.postIds ?? ((current.postIds as string[]) ?? []),
    contractIds: patch.contractIds ?? ((current.contractIds as string[]) ?? []),
    telefone: patch.telefone !== undefined ? patch.telefone : (current.telefone ?? null),
    matricula: patch.matricula !== undefined ? patch.matricula : (current.matricula ?? null),
  };
  if (next.role === "supervisor" && !next.funcao) next.funcao = "supervisor";
  if (next.role !== "supervisor") next.funcao = null;

  if (!canManageUser(actor, { role: next.role, companyId: currentCompany })) {
    throw new ApiError(403, "SEM_PERMISSAO", "Você não pode atribuir este perfil.");
  }
  const issues = userShapeIssues({ ...next, companyId: currentCompany });
  if (issues.length) {
    throw new ApiError(400, "DADOS_INVALIDOS", "Dados inválidos.", issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })));
  }
  await validateAssignments(deps, currentCompany, patch.postIds ?? [], patch.contractIds ?? []);

  const d = diff(current, next);
  if (d.changed.length === 0) return json({ uid, alterado: false });

  const now = deps.now();
  await deps.db.commit([
    { op: "update", path: `users/${uid}`, data: { ...next, updatedAt: now, updatedBy: actor.uid } },
    auditWrite(deps.newId(), now, actor, ctx.requestId, {
      action: patch.status && patch.status !== current.status ? `usuario.status.${patch.status}` : "usuario.editar",
      targetType: "user",
      targetId: uid,
      companyId: currentCompany,
      before: d.before,
      after: d.after,
      motivo: patch.motivo,
    }),
  ]);

  // Efeitos no Auth depois do commit: o documento já nega acesso mesmo se algo abaixo falhar.
  if (d.changed.includes("role")) await deps.identity.setClaims(uid, claimsFor(next.role, currentCompany));
  if (d.changed.includes("status")) {
    await deps.identity.setDisabled(uid, next.status !== "ativo");
    if (next.status !== "ativo") await deps.identity.revokeSessions(uid);
  }
  // Postos/contratos não ficam nas claims: regras e backend leem users/{uid} a cada acesso,
  // então a mudança de escopo vale imediatamente, sem novo login.
  return json({ uid, alterado: true, campos: d.changed });
}
