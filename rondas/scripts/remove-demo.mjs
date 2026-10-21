#!/usr/bin/env node
/**
 * Remove todos os documentos marcados com `demo: true` (e as contas *@demo.local e *-demo do posto).
 * Por segurança, roda somente contra os emuladores, a menos que --project seja
 * informado explicitamente junto com --confirmar.
 *
 *   node scripts/remove-demo.mjs                       # emulador (demo-rondas)
 *   node scripts/remove-demo.mjs --project X --confirmar   # projeto real
 */
import { parseArgs } from "node:util";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const { values } = parseArgs({ options: { project: { type: "string" }, confirmar: { type: "boolean" } } });
if (values.project && !values.confirmar) {
  console.error("Para projeto real, informe --confirmar.");
  process.exit(1);
}
if (!values.project) {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
}
initializeApp(values.project ? { projectId: values.project, credential: applicationDefault() } : { projectId: "demo-rondas" });
const db = getFirestore();
const auth = getAuth();

const collections = ["companies", "contracts", "posts", "users", "vigilantes", "checkpoints", "checklists", "schedules", "rounds", "scans", "incidents", "alerts", "photos"];
let total = 0;
for (const c of collections) {
  const snap = await db.collection(c).where("demo", "==", true).get();
  for (const d of snap.docs) {
    await db.recursiveDelete(d.ref);
    total++;
  }
}
const list = await auth.listUsers(1000);
const demoUids = list.users.filter((u) => u.email?.endsWith("@demo.local") || /-demo@postos\.invalid$/.test(u.email ?? "")).map((u) => u.uid);
if (demoUids.length) await auth.deleteUsers(demoUids);
console.log(`Removidos ${total} documentos e ${demoUids.length} contas de demonstração.`);
