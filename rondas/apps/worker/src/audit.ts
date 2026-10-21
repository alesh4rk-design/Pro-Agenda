import type { Actor } from "@rondas/shared";
import type { Write } from "./google/firestore.js";

/** Monta a escrita do registro de auditoria — sempre no MESMO commit da alteração. */
export function auditWrite(
  id: string,
  at: Date,
  actor: Actor,
  requestId: string,
  entry: {
    action: string;
    targetType: string;
    targetId: string;
    companyId: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    motivo?: string;
  },
): Write {
  return {
    op: "create",
    path: `auditLogs/${id}`,
    data: {
      id,
      at,
      actorUid: actor.uid,
      actorRole: actor.role,
      requestId,
      before: null,
      after: null,
      ...entry,
    },
  };
}

/** Retorna apenas os campos que mudaram, com valores antes/depois. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) {
      b[k] = before[k] ?? null;
      a[k] = after[k] ?? null;
    }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}
