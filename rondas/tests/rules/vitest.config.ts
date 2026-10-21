import { defineConfig } from "vitest/config";
// Executado via `npm run test:rules` (sobe o emulador do Firestore).
export default defineConfig({ test: { root: import.meta.dirname, include: ["**/*.test.ts"], testTimeout: 20000, fileParallelism: false } });
