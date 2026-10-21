import { formatZodError, hasPermission, systemConfigSchema } from "@rondas/shared";
import { auditWrite, diff } from "../audit.js";
import type { Ctx } from "../context.js";
import { ApiError, json, readJson } from "../http.js";

/** PUT /v1/config/sistema — nome do sistema (somente administrador geral). */
export async function putSystemConfig(ctx: Ctx): Promise<Response> {
  const { actor, deps } = ctx;
  if (!hasPermission(actor, "sistema.configurar")) {
    throw new ApiError(403, "SEM_PERMISSAO", "Somente o administrador geral altera as configurações do sistema.");
  }
  const parsed = systemConfigSchema.safeParse(await readJson(ctx.request));
  if (!parsed.success) throw new ApiError(400, "DADOS_INVALIDOS", "Dados inválidos.", formatZodError(parsed.error));

  const now = deps.now();
  const before = (await deps.db.getDoc("config/publico")) ?? {};
  const after = { nomeSistema: parsed.data.nomeSistema };
  const d = diff(before, after);
  if (d.changed.length === 0) return json({ ...after, alterado: false });

  await deps.db.commit([
    { op: "set", path: "config/publico", data: { ...after, updatedAt: now, updatedBy: actor.uid } },
    auditWrite(deps.newId(), now, actor, ctx.requestId, {
      action: "sistema.configurar",
      targetType: "config",
      targetId: "publico",
      companyId: null,
      before: d.before,
      after: d.after,
    }),
  ]);
  return json({ ...after, alterado: true });
}
