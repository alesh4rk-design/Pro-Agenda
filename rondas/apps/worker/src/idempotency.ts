import type { FirestoreClient, Write } from "./google/firestore.js";
import { ApiError } from "./http.js";

/**
 * Proteção contra requisições duplicadas (duplo toque, reenvio após queda de rede).
 * O cliente envia `Idempotency-Key` (UUID). A resposta da primeira execução é
 * gravada no mesmo commit da operação; repetições devolvem a mesma resposta.
 */
const KEY_RE = /^[A-Za-z0-9-]{16,64}$/;

export function idempotencyKey(request: Request, required: boolean): string | null {
  const key = request.headers.get("Idempotency-Key");
  if (!key) {
    if (required) throw new ApiError(400, "IDEMPOTENCIA_AUSENTE", "Cabeçalho Idempotency-Key obrigatório.");
    return null;
  }
  if (!KEY_RE.test(key)) throw new ApiError(400, "IDEMPOTENCIA_INVALIDA", "Idempotency-Key inválida.");
  return key;
}

const docPath = (uid: string, key: string) => `idempotency/${uid}_${key}`;

export async function findReplay(
  db: FirestoreClient,
  uid: string,
  key: string | null,
  route: string,
): Promise<{ status: number; body: unknown } | null> {
  if (!key) return null;
  const doc = await db.getDoc(docPath(uid, key));
  if (!doc) return null;
  if (doc.route !== route) throw new ApiError(422, "IDEMPOTENCIA_REUTILIZADA", "Chave já usada em outra operação.");
  return { status: doc.status as number, body: JSON.parse(doc.body as string) };
}

export function idempotencyWrite(uid: string, key: string, route: string, status: number, body: unknown, now: Date): Write {
  return {
    op: "create",
    path: docPath(uid, key),
    data: {
      route,
      status,
      body: JSON.stringify(body),
      createdAt: now,
      // Removível por rotina de limpeza (Etapa 8) ou TTL do Firestore.
      expiresAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
    },
  };
}
