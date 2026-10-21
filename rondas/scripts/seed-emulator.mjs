#!/usr/bin/env node
/**
 * Dados FICTÍCIOS de demonstração — SOMENTE para os emuladores locais.
 * Todos os documentos recebem `demo: true` e nomes marcados como "(DEMO)".
 *
 * Uso: com `npm run emulators` rodando em outro terminal:
 *   npm run seed:emulator
 *
 * Etapa 1: plataforma, empresa, contrato, postos, acessos (um por posto) e supervisor.
 * Pontos de ronda, checklists, programação, rondas e ocorrências serão
 * adicionados a este script nas etapas correspondentes.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
const PROJECT = "demo-rondas";

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!PROJECT.startsWith("demo-")) throw new Error("Seed permitido apenas em projetos demo-*");
initializeApp({ projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();
const now = Timestamp.now();
const audit = { createdAt: now, createdBy: "seed", updatedAt: now, updatedBy: "seed", demo: true };
const SENHA = "demo-123456";

await db.doc("config/publico").set({ nomeSistema: "Rondas Patrimoniais (DEMO)", updatedAt: now, updatedBy: "seed" });

await db.doc("companies/demo-empresa").set({
  id: "demo-empresa",
  nome: "Vigilância Exemplo Ltda (DEMO)",
  cnpj: null,
  responsaveis: [{ nome: "Responsável Fictício", telefone: "(21) 0000-0000" }],
  status: "ativa",
  permissoesAdmin: { gerirContratos: true, gerirPostos: true },
  retencaoFotosDias: 7,
  ...audit,
});
await db.doc("companies/demo-outra").set({
  id: "demo-outra",
  nome: "Outra Empresa (DEMO — teste de isolamento)",
  status: "ativa",
  permissoesAdmin: { gerirContratos: true, gerirPostos: true },
  retencaoFotosDias: 7,
  ...audit,
});
await db.doc("contracts/demo-contrato").set({
  id: "demo-contrato",
  companyId: "demo-empresa",
  nome: "Condomínio Jardim Fictício (DEMO)",
  cliente: "Condomínio Jardim Fictício",
  vigenciaInicio: "2026-01-01",
  vigenciaFim: null,
  status: "ativo",
  ...audit,
});
await db.doc("posts/demo-posto-garagem").set({
  id: "demo-posto-garagem",
  companyId: "demo-empresa",
  contractId: "demo-contrato",
  nome: "Garagem (DEMO)",
  endereco: "Endereço fictício, Rio de Janeiro - RJ",
  geo: { lat: -22.9071, lng: -43.1733 },
  timezone: "America/Sao_Paulo",
  diasOperacao: [1, 2, 3, 4, 5],
  horarioFuncionamento: null,
  shiftDateRule: "inicio_turno",
  status: "ativo",
  ...audit,
});
await db.doc("posts/demo-posto").set({
  id: "demo-posto",
  companyId: "demo-empresa",
  contractId: "demo-contrato",
  nome: "Portaria Principal (DEMO)",
  endereco: "Endereço fictício, Rio de Janeiro - RJ",
  geo: { lat: -22.9068, lng: -43.1729 },
  timezone: "America/Sao_Paulo",
  diasOperacao: [0, 1, 2, 3, 4, 5, 6],
  horarioFuncionamento: null,
  shiftDateRule: "inicio_turno",
  status: "ativo",
  ...audit,
});

const usuarios = [
  { email: "admin@demo.local", nome: "Admin Geral (DEMO)", role: "admin_geral", companyId: null },
  { email: "empresa@demo.local", nome: "Admin Empresa (DEMO)", role: "admin_empresa", companyId: "demo-empresa" },
  { email: "supervisor@demo.local", nome: "Supervisor (DEMO)", role: "supervisor", funcao: "supervisor", companyId: "demo-empresa", postIds: ["demo-posto"] },
  // Acessos de posto: login (sem e-mail real) + senha definida pelo administrador.
  { login: "portaria-demo", nome: "Portaria Principal (DEMO)", role: "posto", companyId: "demo-empresa", postIds: ["demo-posto"] },
  { login: "garagem-demo", nome: "Garagem (DEMO)", role: "posto", companyId: "demo-empresa", postIds: ["demo-posto-garagem"] },
  { email: "outra@demo.local", nome: "Admin Outra Empresa (DEMO)", role: "admin_empresa", companyId: "demo-outra" },
];

for (const u of usuarios) {
  if (u.login) u.email = `${u.login}@postos.invalid`;
  let uid;
  try {
    uid = (await auth.getUserByEmail(u.email)).uid;
  } catch {
    uid = (await auth.createUser({ email: u.email, password: SENHA, displayName: u.nome })).uid;
  }
  await auth.setCustomUserClaims(uid, u.companyId ? { role: u.role, cid: u.companyId } : { role: u.role });
  await db.doc(`users/${uid}`).set({
    uid,
    email: u.email,
    login: u.login ?? null,
    nome: u.nome,
    role: u.role,
    funcao: u.funcao ?? null,
    companyId: u.companyId,
    postIds: u.postIds ?? [],
    contractIds: [],
    status: "ativo",
    ...audit,
  });
  console.log(`${u.role.padEnd(14)} ${u.login ?? u.email}`);
}

console.log(`\nSenha de todos os acessos de demonstração: ${SENHA}`);
