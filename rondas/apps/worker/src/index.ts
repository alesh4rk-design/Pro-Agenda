import { emulatorTokenVerifier, firebaseTokenVerifier } from "./auth.js";
import { createApp } from "./app.js";
import type { Deps } from "./context.js";
import { type Env, usesEmulators } from "./env.js";
import { createRestFirestore } from "./google/firestore.js";
import { createRestIdentity } from "./google/identity.js";
import { getServiceAccountToken } from "./google/serviceAccount.js";

export function depsFromEnv(env: Env): Deps {
  const emulators = usesEmulators(env);
  const getToken = () => {
    if (!env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
      throw new Error("GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY não configurados (wrangler secret put).");
    }
    return getServiceAccountToken(env.GOOGLE_CLIENT_EMAIL, env.GOOGLE_PRIVATE_KEY);
  };
  return {
    db: createRestFirestore({ projectId: env.FIREBASE_PROJECT_ID, emulatorHost: env.FIRESTORE_EMULATOR_HOST, getToken }),
    identity: createRestIdentity({
      projectId: env.FIREBASE_PROJECT_ID,
      emulatorHost: env.FIREBASE_AUTH_EMULATOR_HOST,
      getToken,
    }),
    verifyToken: emulators
      ? emulatorTokenVerifier(env.FIREBASE_PROJECT_ID)
      : firebaseTokenVerifier(env.FIREBASE_PROJECT_ID),
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = createApp(depsFromEnv(env), { allowedOrigins: env.ALLOWED_ORIGINS, environment: env.ENVIRONMENT });
    return app(request);
  },
} satisfies ExportedHandler<Env>;
