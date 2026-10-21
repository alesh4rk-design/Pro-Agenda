import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, deleteDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-rondas",
    firestore: { rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const set = (p: string, d: Record<string, unknown>) => setDoc(doc(db, p), d);
    await set("config/publico", { nomeSistema: "Rondas" });
    await set("config/privado", { segredo: 1 });
    await set("companies/empA", { nome: "A", status: "ativa" });
    await set("companies/empB", { nome: "B", status: "ativa" });
    await set("companies/empX", { nome: "X", status: "bloqueada" });
    await set("contracts/cA", { companyId: "empA" });
    await set("contracts/cA2", { companyId: "empA" });
    await set("contracts/cB", { companyId: "empB" });
    await set("posts/pA", { companyId: "empA", contractId: "cA" });
    await set("posts/pA2", { companyId: "empA", contractId: "cA2" });
    await set("posts/pB", { companyId: "empB", contractId: "cB" });
    await set("checkpoints/kA", { companyId: "empA", contractId: "cA", postId: "pA" });
    await set("checkpoints/kA2", { companyId: "empA", contractId: "cA2", postId: "pA2" });
    await set("checkpoints/kB", { companyId: "empB", contractId: "cB", postId: "pB" });
    await set("checkpointSecrets/kA", { tokenHash: "abc" });
    await set("scans/sPostoA", { companyId: "empA", contractId: "cA", postId: "pA", userId: "postoA" });
    await set("scans/sPostoA2", { companyId: "empA", contractId: "cA2", postId: "pA2", userId: "postoA2" });
    await set("vigilantes/jose", { companyId: "empA", nome: "José", postIds: ["pA"] });
    await set("vigilantes/maria", { companyId: "empA", nome: "Maria", postIds: ["pA2"] });
    await set("vigilantes/joao", { companyId: "empB", nome: "João", postIds: ["pB"] });
    await set("auditLogs/l1", { companyId: "empA", action: "x" });
    await set("idempotency/x", { a: 1 });
    const u = (uid: string, role: string, companyId: string | null, extra = {}) =>
      set(`users/${uid}`, { uid, role, companyId, status: "ativo", postIds: [], contractIds: [], ...extra });
    await u("geral", "admin_geral", null);
    await u("admA", "admin_empresa", "empA");
    await u("admB", "admin_empresa", "empB");
    await u("supA", "supervisor", "empA", { contractIds: ["cA2"] });
    await u("postoA", "posto", "empA", { postIds: ["pA"], login: "portaria-a" });
    await u("postoA2", "posto", "empA", { postIds: ["pA2"], login: "portaria-a2" });
    await u("postoBloq", "posto", "empA", { postIds: ["pA"], status: "bloqueado" });
    await u("postoX", "posto", "empX", { postIds: [] });
  });
});

const as = (uid: string, role: string, cid?: string) =>
  env.authenticatedContext(uid, cid ? { role, cid } : { role }).firestore();
const geral = () => as("geral", "admin_geral");
const admA = () => as("admA", "admin_empresa", "empA");
const admB = () => as("admB", "admin_empresa", "empB");
const supA = () => as("supA", "supervisor", "empA");
const postoA = () => as("postoA", "posto", "empA");

describe("isolamento entre empresas", () => {
  it("admin da empresa A não lê empresa, contrato, posto ou ponto da empresa B (manipulando IDs)", async () => {
    const db = admA();
    await assertFails(getDoc(doc(db, "companies/empB")));
    await assertFails(getDoc(doc(db, "contracts/cB")));
    await assertFails(getDoc(doc(db, "posts/pB")));
    await assertFails(getDoc(doc(db, "checkpoints/kB")));
    await assertSucceeds(getDoc(doc(db, "posts/pA")));
  });

  it("consulta sem filtro por empresa é negada; com filtro da própria empresa é aceita", async () => {
    const db = admA();
    await assertFails(getDocs(collection(db, "posts")));
    await assertFails(getDocs(query(collection(db, "posts"), where("companyId", "==", "empB"))));
    await assertSucceeds(getDocs(query(collection(db, "posts"), where("companyId", "==", "empA"))));
  });

  it("claim cid forjada para outra empresa não dá acesso (perfil gravado manda)", async () => {
    const db = as("admA", "admin_empresa", "empB");
    await assertFails(getDoc(doc(db, "companies/empB")));
    await assertFails(getDoc(doc(db, "posts/pB")));
  });

  it("claim role forjada não dá acesso de admin geral", async () => {
    await assertFails(getDoc(doc(as("postoA", "admin_geral"), "companies/empB")));
  });

  it("admin geral lê todas as empresas e a auditoria", async () => {
    await assertSucceeds(getDoc(doc(geral(), "companies/empB")));
    await assertSucceeds(getDocs(collection(geral(), "auditLogs")));
    await assertFails(getDocs(collection(admA(), "auditLogs")));
  });
});

describe("acesso por perfil e escopo de posto", () => {
  it("acesso do posto lê somente o posto vinculado", async () => {
    await assertSucceeds(getDoc(doc(postoA(), "posts/pA")));
    await assertFails(getDoc(doc(postoA(), "posts/pA2")));
    await assertSucceeds(getDoc(doc(postoA(), "checkpoints/kA")));
    await assertFails(getDoc(doc(postoA(), "checkpoints/kA2")));
  });

  it("acesso do posto não lê contratos nem outros usuários", async () => {
    await assertFails(getDoc(doc(postoA(), "contracts/cA")));
    await assertFails(getDoc(doc(postoA(), "users/postoA2")));
    await assertSucceeds(getDoc(doc(postoA(), "users/postoA")));
  });

  it("acesso do posto lê as leituras de QR do próprio posto, não de outro", async () => {
    await assertSucceeds(getDoc(doc(postoA(), "scans/sPostoA")));
    await assertFails(getDoc(doc(postoA(), "scans/sPostoA2")));
  });

  it("acesso do posto lista os vigilantes do próprio posto (para identificar o plantão)", async () => {
    await assertSucceeds(getDoc(doc(postoA(), "vigilantes/jose")));
    await assertFails(getDoc(doc(postoA(), "vigilantes/maria")));
    await assertFails(getDoc(doc(postoA(), "vigilantes/joao")));
    await assertSucceeds(getDocs(query(collection(postoA(), "vigilantes"), where("companyId", "==", "empA"), where("postIds", "array-contains", "pA"))));
    await assertFails(getDocs(query(collection(admB(), "vigilantes"), where("companyId", "==", "empA"))));
  });

  it("supervisor vê postos do contrato vinculado, não os demais", async () => {
    await assertSucceeds(getDoc(doc(supA(), "contracts/cA2")));
    await assertSucceeds(getDoc(doc(supA(), "posts/pA2")));
    await assertFails(getDoc(doc(supA(), "posts/pA")));
    await assertFails(getDoc(doc(supA(), "contracts/cA")));
  });

  it("supervisor lê acessos de posto da empresa, mas não administradores", async () => {
    await assertSucceeds(getDoc(doc(supA(), "users/postoA")));
    await assertFails(getDoc(doc(supA(), "users/admA")));
  });

  it("admin da empresa lê usuários da própria empresa, não de outra", async () => {
    await assertSucceeds(getDocs(query(collection(admA(), "users"), where("companyId", "==", "empA"))));
    await assertFails(getDocs(query(collection(admB(), "users"), where("companyId", "==", "empA"))));
  });
});

describe("contas e empresas inativas", () => {
  it("usuário bloqueado não lê dados operacionais", async () => {
    const db = as("postoBloq", "posto", "empA");
    await assertFails(getDoc(doc(db, "posts/pA")));
    await assertSucceeds(getDoc(doc(db, "users/postoBloq"))); // vê o próprio perfil (status)
  });

  it("usuário de empresa bloqueada não lê dados da empresa", async () => {
    await assertFails(getDoc(doc(as("postoX", "posto", "empX"), "companies/empX")));
  });

  it("não autenticado só lê o nome público do sistema", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "config/publico")));
    await assertFails(getDoc(doc(db, "config/privado")));
    await assertFails(getDoc(doc(db, "posts/pA")));
  });
});

describe("escritas pelo cliente são sempre negadas", () => {
  it("nem o admin geral escreve direto (tudo passa pelo backend)", async () => {
    await assertFails(setDoc(doc(geral(), "companies/nova"), { nome: "N" }));
    await assertFails(updateDoc(doc(geral(), "config/publico"), { nomeSistema: "X" }));
  });

  it("usuário não altera o próprio perfil (escalonamento de privilégio)", async () => {
    await assertFails(updateDoc(doc(postoA(), "users/postoA"), { role: "admin_geral" }));
    await assertFails(updateDoc(doc(postoA(), "users/postoA"), { postIds: ["pA", "pA2"] }));
  });

  it("acesso do posto não grava nem apaga leituras/auditoria", async () => {
    await assertFails(setDoc(doc(postoA(), "scans/novo"), { companyId: "empA", postId: "pA", userId: "postoA" }));
    await assertFails(deleteDoc(doc(admA(), "auditLogs/l1")));
  });

  it("coleções internas são inacessíveis", async () => {
    await assertFails(getDoc(doc(geral(), "checkpointSecrets/kA")));
    await assertFails(getDoc(doc(geral(), "idempotency/x")));
  });
});
