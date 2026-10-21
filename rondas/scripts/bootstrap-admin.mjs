#!/usr/bin/env node
/**
 * Cria (ou promove) o PRIMEIRO administrador geral em um projeto Firebase real.
 * Executado uma única vez, na máquina de quem administra o projeto — nunca no navegador.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   node scripts/bootstrap-admin.mjs --project SEU-PROJETO --email voce@empresa.com --nome "Seu Nome"
 *
 * O script imprime um link para definir a senha. A chave da conta de serviço
 * (service-account.json) NUNCA deve ser versionada (.gitignore já a ignora).
 */
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const { values } = parseArgs({
  options: { project: { type: "string" }, email: { type: "string" }, nome: { type: "string" } },
});
if (!values.project || !values.email || !values.nome) {
  console.error("Uso: node scripts/bootstrap-admin.mjs --project <id> --email <email> --nome <nome>");
  process.exit(1);
}
const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
initializeApp(usingEmulator ? { projectId: values.project } : { projectId: values.project, credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();
const email = values.email.trim().toLowerCase();

let user;
try {
  user = await auth.getUserByEmail(email);
  console.log(`Usuário existente encontrado: ${user.uid}`);
} catch {
  user = await auth.createUser({ email, displayName: values.nome });
  console.log(`Usuário criado: ${user.uid}`);
}

await auth.setCustomUserClaims(user.uid, { role: "admin_geral" });
const batch = db.batch();
batch.set(db.doc(`users/${user.uid}`), {
  uid: user.uid,
  email,
  nome: values.nome,
  role: "admin_geral",
  funcao: null,
  companyId: null,
  postIds: [],
  contractIds: [],
  status: "ativo",
  createdAt: FieldValue.serverTimestamp(),
  createdBy: "bootstrap",
  updatedAt: FieldValue.serverTimestamp(),
  updatedBy: "bootstrap",
});
const auditId = randomUUID();
batch.create(db.doc(`auditLogs/${auditId}`), {
  id: auditId,
  at: FieldValue.serverTimestamp(),
  actorUid: "bootstrap",
  actorRole: "admin_geral",
  companyId: null,
  action: "usuario.bootstrap_admin_geral",
  targetType: "user",
  targetId: user.uid,
  before: null,
  after: { email, role: "admin_geral" },
  requestId: auditId,
});
await batch.commit();

const link = await auth.generatePasswordResetLink(email);
console.log("\nAdministrador geral configurado.");
console.log("Abra o link abaixo para definir a senha (válido por tempo limitado):\n");
console.log(link);
