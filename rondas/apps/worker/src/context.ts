import type { Actor } from "@rondas/shared";
import type { FirestoreClient } from "./google/firestore.js";
import type { IdentityAdmin } from "./google/identity.js";
import type { TokenVerifier } from "./auth.js";

/** Dependências injetáveis (permitem testes com dublês e com os emuladores). */
export interface Deps {
  db: FirestoreClient;
  identity: IdentityAdmin;
  verifyToken: TokenVerifier;
  now: () => Date;
  newId: () => string;
}

export interface Ctx {
  deps: Deps;
  request: Request;
  requestId: string;
  actor: Actor;
  params: Record<string, string>;
}
