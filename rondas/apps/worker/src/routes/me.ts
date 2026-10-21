import { assignableRoles, permissionsOf } from "@rondas/shared";
import type { Ctx } from "../context.js";
import { json } from "../http.js";

/** GET /v1/me — perfil efetivo, permissões e perfis que pode atribuir. */
export async function getMe(ctx: Ctx): Promise<Response> {
  const { actor } = ctx;
  const profile = await ctx.deps.db.getDoc(`users/${actor.uid}`);
  return json({
    uid: actor.uid,
    nome: profile?.nome ?? "",
    email: profile?.email ?? "",
    role: actor.role,
    funcao: profile?.funcao ?? null,
    companyId: actor.companyId,
    postIds: actor.postIds,
    contractIds: actor.contractIds,
    permissions: permissionsOf(actor),
    assignableRoles: assignableRoles(actor),
  });
}
