import { beforeEach, describe, expect, it } from "vitest";
import { resetRateLimits } from "../src/rateLimit.js";
import { KEY, setup } from "./fakes.js";

let t: ReturnType<typeof setup>;
beforeEach(() => {
  resetRateLimits();
  t = setup();
  t.db.docs.set("contracts/cA", { id: "cA", companyId: "empA", nome: "Contrato A", cliente: "Cliente A", vigenciaInicio: "2026-01-01", vigenciaFim: null, status: "ativo" });
  t.db.docs.set("posts/pA", { id: "pA", companyId: "empA", contractId: "cA", nome: "Portaria", endereco: "Rua A", status: "ativo", timezone: "America/Sao_Paulo" });
});

const k = (n: number) => ({ "Idempotency-Key": KEY(100 + n) });
const contrato = (companyId = "empA") => ({ companyId, nome: "Condomínio Sol", cliente: "Condomínio Sol", vigenciaInicio: "2026-01-01" });
const posto = (contractId = "cA") => ({ contractId, nome: "Garagem", endereco: "Rua B, 10 - Rio de Janeiro", geo: { lat: -22.9, lng: -43.17 } });

describe("empresas", () => {
  it("admin geral cria empresa ativa, com padrões e auditoria", async () => {
    const r = await t.call("POST", "/v1/companies", t.tokens.geral, { nome: "Segurança Alfa", cnpj: "11222333000181" }, k(1));
    expect(r.status).toBe(201);
    expect(r.body.companyId).toBe(r.body.id);
    expect(t.db.docs.get(`companies/${r.body.id}`)).toMatchObject({
      nome: "Segurança Alfa",
      cnpj: "11.222.333/0001-81",
      status: "ativa",
      retencaoFotosDias: 7,
      permissoesAdmin: { gerirContratos: true, gerirPostos: true },
      createdBy: "geral",
    });
    expect(t.db.collection("auditLogs")[0]).toMatchObject({ action: "empresa.criar", companyId: r.body.id });
  });

  it.each(["admA", "supA", "postoA"] as const)("%s não cria nem altera empresas", async (who) => {
    expect((await t.call("POST", "/v1/companies", t.tokens[who], { nome: "X Ltda" }, k(2))).status).toBe(403);
    expect((await t.call("PATCH", "/v1/companies/empA", t.tokens[who], { nome: "Hack" })).status).toBe(403);
  });

  it("repetição com a mesma chave não cria empresa duplicada", async () => {
    const r1 = await t.call("POST", "/v1/companies", t.tokens.geral, { nome: "Segurança Beta" }, k(3));
    const r2 = await t.call("POST", "/v1/companies", t.tokens.geral, { nome: "Segurança Beta" }, k(3));
    expect(r2.body.id).toBe(r1.body.id);
    expect(t.db.collection("companies")).toHaveLength(3);
  });

  it("bloquear exige motivo; bloqueio corta o acesso dos usuários da empresa", async () => {
    expect((await t.call("PATCH", "/v1/companies/empA", t.tokens.geral, { status: "bloqueada" })).body.erro.codigo).toBe("MOTIVO_OBRIGATORIO");
    const r = await t.call("PATCH", "/v1/companies/empA", t.tokens.geral, { status: "bloqueada", motivo: "Inadimplência" });
    expect(r.status).toBe(200);
    expect(t.db.collection("auditLogs")[0]).toMatchObject({ action: "empresa.status.bloqueada", motivo: "Inadimplência", before: { status: "ativa" } });
    expect((await t.call("GET", "/v1/me", t.tokens.admA)).body.erro.codigo).toBe("EMPRESA_INATIVA");
    expect((await t.call("GET", "/v1/me", t.tokens.postoA)).status).toBe(403);
    // Reativar não exige motivo.
    expect((await t.call("PATCH", "/v1/companies/empA", t.tokens.geral, { status: "ativa" })).status).toBe(200);
    expect((await t.call("GET", "/v1/me", t.tokens.postoA)).status).toBe(200);
  });

  it("admin geral restringe o admin da empresa (sem gerir contratos)", async () => {
    await t.call("PATCH", "/v1/companies/empA", t.tokens.geral, { permissoesAdmin: { gerirContratos: false, gerirPostos: true } });
    expect((await t.call("POST", "/v1/contracts", t.tokens.admA, contrato(), k(4))).status).toBe(403);
    expect((await t.call("POST", "/v1/posts", t.tokens.admA, posto(), k(5))).status).toBe(201);
  });

  it("CNPJ duplicado é recusado (na criação e na edição)", async () => {
    expect((await t.call("POST", "/v1/companies", t.tokens.geral, { nome: "Alfa", cnpj: "11222333000181" }, k(7))).status).toBe(201);
    const dup = await t.call("POST", "/v1/companies", t.tokens.geral, { nome: "Alfa 2", cnpj: "11.222.333/0001-81" }, k(8));
    expect(dup.status).toBe(409);
    expect(dup.body.erro.codigo).toBe("CNPJ_EM_USO");
    expect((await t.call("PATCH", "/v1/companies/empB", t.tokens.geral, { cnpj: "11222333000181" })).status).toBe(409);
  });

  it("CNPJ inválido é recusado", async () => {
    expect((await t.call("POST", "/v1/companies", t.tokens.geral, { nome: "Gama", cnpj: "11.222.333/0001-00" }, k(6))).status).toBe(400);
  });
});

describe("contratos", () => {
  it("admin da empresa cria contrato na própria empresa", async () => {
    const r = await t.call("POST", "/v1/contracts", t.tokens.admA, contrato(), k(10));
    expect(r.status).toBe(201);
    expect(t.db.docs.get(`contracts/${r.body.id}`)).toMatchObject({ companyId: "empA", status: "ativo", vigenciaFim: null });
  });

  it("admin da empresa NÃO cria contrato em outra empresa (troca de companyId)", async () => {
    const r = await t.call("POST", "/v1/contracts", t.tokens.admA, contrato("empB"), k(11));
    expect(r.status).toBe(404);
    expect(t.db.collection("contracts")).toHaveLength(2);
  });

  it("admin de outra empresa não edita (404) e supervisor/posto não editam (403)", async () => {
    expect((await t.call("PATCH", "/v1/contracts/cA", t.tokens.admB, { nome: "Hack" })).status).toBe(404);
    expect((await t.call("PATCH", "/v1/contracts/cA", t.tokens.supA, { nome: "Hack" })).status).toBe(403);
    expect((await t.call("PATCH", "/v1/contracts/cA", t.tokens.postoA, { nome: "Hack" })).status).toBe(403);
  });

  it("não move contrato para outra empresa", async () => {
    expect((await t.call("PATCH", "/v1/contracts/cA", t.tokens.geral, { companyId: "empB" })).status).toBe(400);
  });

  it("valida vigência combinando o que já está gravado", async () => {
    const r = await t.call("PATCH", "/v1/contracts/cA", t.tokens.admA, { vigenciaFim: "2025-06-30" });
    expect(r.status).toBe(400);
    expect((await t.call("PATCH", "/v1/contracts/cA", t.tokens.admA, { vigenciaFim: "2026-12-31" })).status).toBe(200);
  });

  it("encerrar exige motivo e registra antes/depois", async () => {
    expect((await t.call("PATCH", "/v1/contracts/cA", t.tokens.admA, { status: "encerrado" })).status).toBe(400);
    const r = await t.call("PATCH", "/v1/contracts/cA", t.tokens.admA, { status: "encerrado", motivo: "Fim do contrato" });
    expect(r.status).toBe(200);
    expect(t.db.collection("auditLogs")[0]).toMatchObject({ action: "contrato.status.encerrado", before: { status: "ativo" }, after: { status: "encerrado" } });
  });

  it("não cria contrato em empresa bloqueada", async () => {
    t.db.docs.get("companies/empB")!.status = "bloqueada";
    expect((await t.call("POST", "/v1/contracts", t.tokens.geral, contrato("empB"), k(12))).status).toBe(409);
  });
});

describe("postos", () => {
  it("cria posto herdando a empresa do contrato, com fuso padrão", async () => {
    const r = await t.call("POST", "/v1/posts", t.tokens.admA, posto(), k(20));
    expect(r.status).toBe(201);
    expect(t.db.docs.get(`posts/${r.body.id}`)).toMatchObject({
      companyId: "empA",
      contractId: "cA",
      timezone: "America/Sao_Paulo",
      shiftDateRule: "inicio_turno",
      diasOperacao: [0, 1, 2, 3, 4, 5, 6],
      status: "ativo",
    });
  });

  it("admin da empresa A NÃO cria posto em contrato da empresa B", async () => {
    expect((await t.call("POST", "/v1/posts", t.tokens.admA, posto("cB"), k(21))).status).toBe(404);
  });

  it("companyId enviado pelo cliente é recusado", async () => {
    expect((await t.call("POST", "/v1/posts", t.tokens.admA, { ...posto(), companyId: "empB" }, k(22))).status).toBe(400);
  });

  it("contrato encerrado não recebe novos postos", async () => {
    t.db.docs.get("contracts/cA")!.status = "encerrado";
    expect((await t.call("POST", "/v1/posts", t.tokens.admA, posto(), k(23))).body.erro.codigo).toBe("CONTRATO_ENCERRADO");
  });

  it("edita posto com auditoria só dos campos alterados", async () => {
    const r = await t.call("PATCH", "/v1/posts/pA", t.tokens.admA, { nome: "Portaria Principal", endereco: "Rua A", shiftDateRule: "data_civil" });
    expect(r.body.campos).toEqual(["nome", "shiftDateRule"]);
    expect(t.db.collection("auditLogs")[0]).toMatchObject({ action: "posto.editar", before: { nome: "Portaria" }, after: { nome: "Portaria Principal" } });
  });

  it("não move posto de contrato e outra empresa não edita", async () => {
    expect((await t.call("PATCH", "/v1/posts/pA", t.tokens.admA, { contractId: "cB" })).status).toBe(400);
    expect((await t.call("PATCH", "/v1/posts/pA", t.tokens.admB, { nome: "Outro nome" })).status).toBe(404);
    expect((await t.call("PATCH", "/v1/posts/pA", t.tokens.postoA, { nome: "Outro nome" })).status).toBe(403);
  });

  it("suspender posto exige motivo", async () => {
    expect((await t.call("PATCH", "/v1/posts/pA", t.tokens.admA, { status: "suspenso" })).body.erro.codigo).toBe("MOTIVO_OBRIGATORIO");
    expect((await t.call("PATCH", "/v1/posts/pA", t.tokens.admA, { status: "suspenso", motivo: "Reforma" })).status).toBe(200);
  });
});
