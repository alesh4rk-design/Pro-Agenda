export interface Env {
  ENVIRONMENT: "production" | "development";
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
  GOOGLE_CLIENT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  /** Somente desenvolvimento: "127.0.0.1:8080". Recusado em produção. */
  FIRESTORE_EMULATOR_HOST?: string;
  /** Somente desenvolvimento: "127.0.0.1:9099". Recusado em produção. */
  FIREBASE_AUTH_EMULATOR_HOST?: string;
}

export function usesEmulators(env: Env): boolean {
  const any = !!env.FIRESTORE_EMULATOR_HOST || !!env.FIREBASE_AUTH_EMULATOR_HOST;
  if (any && env.ENVIRONMENT !== "development") {
    // Nunca aceitar tokens não assinados do emulador em produção.
    throw new Error("Emuladores configurados fora do ambiente de desenvolvimento.");
  }
  return any;
}
