import { describe, expect, it } from "vitest";
import {
  createCompanySchema,
  createContractSchema,
  createPostSchema,
  isValidCnpj,
  operationalState,
  updateCompanySchema,
} from "../src/index.js";

describe("CNPJ", () => {
  it("aceita CNPJ válido com ou sem máscara e normaliza a máscara", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(createCompanySchema.parse({ nome: "Empresa X", cnpj: "11222333000181" }).cnpj).toBe("11.222.333/0001-81");
  });
  it("rejeita dígitos verificadores errados e sequências repetidas", () => {
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("123")).toBe(false);
  });
  it("CNPJ é opcional", () => {
    expect(createCompanySchema.parse({ nome: "Empresa X" }).cnpj).toBeUndefined();
    expect(createCompanySchema.parse({ nome: "Empresa X", cnpj: "" }).cnpj).toBeNull();
  });
});

describe("empresa", () => {
  it("aplica padrões: retenção de 7 dias e admin gerencia contratos/postos", () => {
    const c = createCompanySchema.parse({ nome: "Empresa X" });
    expect(c.retencaoFotosDias).toBe(7);
    expect(c.permissoesAdmin).toEqual({ gerirContratos: true, gerirPostos: true });
  });
  it("recusa campos desconhecidos e status na criação", () => {
    expect(createCompanySchema.safeParse({ nome: "Empresa X", status: "ativa" }).success).toBe(false);
  });
  it("edição exige alguma alteração além do motivo", () => {
    expect(updateCompanySchema.safeParse({ motivo: "x" }).success).toBe(false);
    expect(updateCompanySchema.safeParse({ status: "bloqueada", motivo: "Inadimplência" }).success).toBe(true);
  });
});

describe("contrato", () => {
  const base = { companyId: "empA", nome: "Contrato 1", cliente: "Condomínio", vigenciaInicio: "2026-01-01" };
  it("vigência: fim não pode ser antes do início; datas inexistentes são recusadas", () => {
    expect(createContractSchema.safeParse({ ...base, vigenciaFim: "2025-12-31" }).success).toBe(false);
    expect(createContractSchema.safeParse({ ...base, vigenciaFim: "2026-01-01" }).success).toBe(true);
    expect(createContractSchema.safeParse({ ...base, vigenciaInicio: "2026-02-30" }).success).toBe(false);
  });
  it("sem fim de vigência = indeterminado", () => {
    expect(createContractSchema.parse(base).vigenciaFim).toBeNull();
  });
});

describe("posto", () => {
  const base = { contractId: "cA", nome: "Portaria", endereco: "Rua A, 1 - Rio de Janeiro" };
  it("padrões: America/Sao_Paulo, todos os dias, regra de virada pelo início do turno", () => {
    const p = createPostSchema.parse(base);
    expect(p.timezone).toBe("America/Sao_Paulo");
    expect(p.diasOperacao).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(p.shiftDateRule).toBe("inicio_turno");
  });
  it("valida fuso, coordenadas, horários e dias", () => {
    expect(createPostSchema.safeParse({ ...base, timezone: "Marte/Olympus" }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...base, geo: { lat: -95, lng: 0 } }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...base, horarioFuncionamento: { inicio: "25:00", fim: "08:00" } }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...base, diasOperacao: [] }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...base, diasOperacao: [1, 1] }).success).toBe(false);
    expect(createPostSchema.parse({ ...base, diasOperacao: [5, 1, 3] }).diasOperacao).toEqual([1, 3, 5]);
  });
  it("aceita horário que atravessa a meia-noite", () => {
    expect(createPostSchema.safeParse({ ...base, horarioFuncionamento: { inicio: "18:00", fim: "08:00" } }).success).toBe(true);
  });
  it("não aceita companyId vindo do cliente (é herdado do contrato)", () => {
    expect(createPostSchema.safeParse({ ...base, companyId: "empB" }).success).toBe(false);
  });
});

describe("situação operacional", () => {
  const company = { status: "ativa" };
  const contract = { status: "ativo", vigenciaInicio: "2026-01-01", vigenciaFim: "2026-12-31" };
  const post = { status: "ativo" };
  it("a situação mais restritiva prevalece", () => {
    expect(operationalState(company, contract, post, "2026-06-01")).toBe("operando");
    expect(operationalState({ status: "bloqueada" }, contract, post, "2026-06-01")).toBe("bloqueado");
    expect(operationalState(company, { ...contract, status: "suspenso" }, post, "2026-06-01")).toBe("suspenso");
    expect(operationalState(company, contract, { status: "encerrado" }, "2026-06-01")).toBe("encerrado");
    expect(operationalState(company, contract, post, "2027-01-01")).toBe("fora_vigencia");
    expect(operationalState(company, contract, post, "2025-12-31")).toBe("fora_vigencia");
  });
});
