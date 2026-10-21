import { describe, expect, it } from "vitest";
import {
  type Actor,
  assignableRoles,
  can,
  canAccessScope,
  canManageUser,
  createUserSchema,
  loginIdentifierToEmail,
  hasPermission,
  permissionsOf,
} from "../src/index.js";

function actor(partial: Partial<Actor> & Pick<Actor, "role">): Actor {
  return {
    uid: "u1",
    companyId: partial.role === "admin_geral" ? null : "empA",
    status: "ativo",
    postIds: [],
    contractIds: [],
    companyStatus: partial.role === "admin_geral" ? null : "ativa",
    companyAdminPermissions: { gerirContratos: true, gerirPostos: true },
    ...partial,
  };
}

const geral = actor({ role: "admin_geral" });
const adminA = actor({ role: "admin_empresa" });
const supA = actor({ role: "supervisor", postIds: ["p1"], contractIds: ["c2"] });
const postoA = actor({ role: "posto", postIds: ["p1"] });

describe("isolamento entre empresas", () => {
  it("admin_empresa não acessa outra empresa", () => {
    expect(canAccessScope(adminA, { companyId: "empA" })).toBe(true);
    expect(canAccessScope(adminA, { companyId: "empB" })).toBe(false);
  });

  it("supervisor e posto não acessam outra empresa mesmo com o mesmo postId", () => {
    expect(canAccessScope(supA, { companyId: "empB", postId: "p1" })).toBe(false);
    expect(canAccessScope(postoA, { companyId: "empB", postId: "p1" })).toBe(false);
  });

  it("escopo sem companyId é negado para perfis de empresa", () => {
    expect(canAccessScope(adminA, { companyId: "" })).toBe(false);
  });

  it("admin_geral acessa qualquer empresa", () => {
    expect(canAccessScope(geral, { companyId: "empB" })).toBe(true);
  });
});

describe("escopo por posto/contrato", () => {
  it("posto só acessa o posto vinculado", () => {
    expect(canAccessScope(postoA, { companyId: "empA", postId: "p1" })).toBe(true);
    expect(canAccessScope(postoA, { companyId: "empA", postId: "p2" })).toBe(false);
    expect(canAccessScope(postoA, { companyId: "empA", contractId: "c2", postId: "p9" })).toBe(false);
    expect(canAccessScope(postoA, { companyId: "empA" })).toBe(false);
  });

  it("supervisor acessa posto vinculado ou qualquer posto de contrato vinculado", () => {
    expect(canAccessScope(supA, { companyId: "empA", postId: "p1" })).toBe(true);
    expect(canAccessScope(supA, { companyId: "empA", contractId: "c2", postId: "p9" })).toBe(true);
    expect(canAccessScope(supA, { companyId: "empA", contractId: "c3", postId: "p9" })).toBe(false);
    expect(canAccessScope(supA, { companyId: "empA" })).toBe(false);
  });
});

describe("status de conta e empresa", () => {
  it("usuário bloqueado perde todas as permissões", () => {
    const b = actor({ role: "admin_empresa", status: "bloqueado" });
    expect(permissionsOf(b)).toEqual([]);
    expect(canAccessScope(b, { companyId: "empA" })).toBe(false);
  });

  it("empresa bloqueada bloqueia seus usuários", () => {
    const v = actor({ role: "posto", postIds: ["p1"], companyStatus: "bloqueada" });
    expect(hasPermission(v, "ronda.executar")).toBe(false);
    expect(canAccessScope(v, { companyId: "empA", postId: "p1" })).toBe(false);
  });

  it("admin_geral desativado não tem acesso", () => {
    expect(permissionsOf(actor({ role: "admin_geral", status: "desativado" }))).toEqual([]);
  });
});

describe("permissões por perfil", () => {
  it("posto executa rondas mas não gerencia nada", () => {
    expect(hasPermission(postoA, "ronda.executar")).toBe(true);
    expect(hasPermission(postoA, "usuario.gerir")).toBe(false);
    expect(hasPermission(postoA, "relatorio.ver")).toBe(false);
  });

  it("supervisor acompanha mas não cadastra", () => {
    expect(can(supA, "ronda.acompanhar", { companyId: "empA", postId: "p1" })).toBe(true);
    expect(hasPermission(supA, "ponto.gerir")).toBe(false);
    expect(hasPermission(supA, "usuario.gerir")).toBe(false);
  });

  it("somente admin_geral configura sistema, empresas e auditoria", () => {
    for (const p of ["sistema.configurar", "empresa.gerir", "auditoria.ver", "retencao.gerir"] as const) {
      expect(hasPermission(geral, p)).toBe(true);
      expect(hasPermission(adminA, p)).toBe(false);
      expect(hasPermission(supA, p)).toBe(false);
      expect(hasPermission(postoA, p)).toBe(false);
    }
  });

  it("contratos/postos do admin_empresa dependem da permissão da empresa", () => {
    const restrito = actor({ role: "admin_empresa", companyAdminPermissions: { gerirContratos: false, gerirPostos: true } });
    expect(hasPermission(restrito, "contrato.gerir")).toBe(false);
    expect(hasPermission(restrito, "posto.gerir")).toBe(true);
    const semFlags = actor({ role: "admin_empresa", companyAdminPermissions: undefined });
    expect(hasPermission(semFlags, "contrato.gerir")).toBe(false);
  });
});

describe("cadastro de usuários (sem escalonamento de privilégio)", () => {
  it("admin_empresa cria posto/supervisor apenas na própria empresa", () => {
    expect(canManageUser(adminA, { role: "posto", companyId: "empA" })).toBe(true);
    expect(canManageUser(adminA, { role: "supervisor", companyId: "empA" })).toBe(true);
    expect(canManageUser(adminA, { role: "posto", companyId: "empB" })).toBe(false);
  });

  it("admin_empresa não cria administradores", () => {
    expect(canManageUser(adminA, { role: "admin_empresa", companyId: "empA" })).toBe(false);
    expect(canManageUser(adminA, { role: "admin_geral", companyId: null })).toBe(false);
  });

  it("admin_geral cria qualquer perfil, admin_geral sem empresa", () => {
    expect(canManageUser(geral, { role: "admin_geral", companyId: null })).toBe(true);
    expect(canManageUser(geral, { role: "admin_geral", companyId: "empA" })).toBe(false);
    expect(canManageUser(geral, { role: "admin_empresa", companyId: "empB" })).toBe(true);
    expect(canManageUser(geral, { role: "posto", companyId: null })).toBe(false);
  });

  it("supervisor e posto não cadastram usuários", () => {
    expect(assignableRoles(supA)).toEqual([]);
    expect(canManageUser(postoA, { role: "posto", companyId: "empA" })).toBe(false);
  });
});

describe("validação de entrada", () => {
  const posto = { nome: "Portaria Jardim", role: "posto", companyId: "empA", postIds: ["p1"], login: "portaria-jardim", senha: "senha-forte-1" };

  it("rejeita campos desconhecidos (ex.: tentativa de injetar status/claims)", () => {
    expect(createUserSchema.safeParse({ ...posto, admin: true }).success).toBe(false);
  });

  it("rejeita IDs com caracteres de caminho", () => {
    expect(createUserSchema.safeParse({ ...posto, companyId: "../empB" }).success).toBe(false);
  });

  it("exige empresa para perfis de empresa e proíbe para admin_geral", () => {
    expect(createUserSchema.safeParse({ ...posto, companyId: null }).success).toBe(false);
    expect(createUserSchema.safeParse({ email: "a@b.com", nome: "Ana", role: "admin_geral", companyId: "x" }).success).toBe(false);
  });

  it("acesso do posto: login e senha obrigatórios, sem e-mail, exatamente um posto", () => {
    expect(createUserSchema.safeParse(posto).success).toBe(true);
    expect(createUserSchema.safeParse({ ...posto, login: undefined }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...posto, senha: "curta" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...posto, email: "a@b.com" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...posto, postIds: [] }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...posto, postIds: ["p1", "p2"] }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...posto, login: "Ab" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...posto, login: "joao@x" }).success).toBe(false);
  });

  it("normaliza o login para minúsculas", () => {
    expect(createUserSchema.parse({ ...posto, login: "  Portaria-Jardim " }).login).toBe("portaria-jardim");
  });

  it("administradores e supervisores usam e-mail, sem login/senha", () => {
    const sup = { email: "  Ana@Empresa.COM ", nome: "Ana", role: "supervisor", companyId: "empA", postIds: ["p1"] };
    expect(createUserSchema.parse(sup).email).toBe("ana@empresa.com");
    expect(createUserSchema.safeParse({ ...sup, email: undefined }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...sup, senha: "senha-forte-1" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...sup, email: "x@postos.invalid" }).success).toBe(false);
  });

  it("login digitado vira e-mail sintético; e-mail fica como está", () => {
    expect(loginIdentifierToEmail(" Portaria-Jardim ")).toBe("portaria-jardim@postos.invalid");
    expect(loginIdentifierToEmail("Admin@Empresa.com")).toBe("admin@empresa.com");
  });
});
