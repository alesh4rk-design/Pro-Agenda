import { defineConfig } from "vitest/config";
// Executado via `npm run test:integration` na raiz (sobe os emuladores de Firestore e Auth).
export default defineConfig({ test: { root: import.meta.dirname, include: ["test/**/*.integration.test.ts"], testTimeout: 20000 } });
