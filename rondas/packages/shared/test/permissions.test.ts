import { describe, expect, it } from "vitest";
import {
  type Actor,
  assignableRoles,
  can,
  canAccessScope,
  canManageUser,
  createUserSchema,
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
const vigA = actor({ role: "vigilante", postIds: ["p1"] });

describe("isolamento entre empresas", () => {
  it("admin_empresa não acessa outra empresa", () => {
    expect(canAccessScope(adminA, { companyId: "empA" })).toBe(true);
    expect(canAccessScope(adminA, { companyId: "empB" })).toBe(false);
  });

  it("supervisor e vigilante não acessam outra empresa mesmo com o mesmo postId", () => {
    expect(canAccessScope(supA, { companyId: "empB", postId: "p1" })).toBe(false);
    expect(canAccessScope(vigA, { companyId: "empB", postId: "p1" })).toBe(false);
  });

  it("escopo sem companyId é negado para perfis de empresa", () => {
    expect(canAccessScope(adminA, { companyId: "" })).toBe(false);
  });

  it("admin_geral acessa qualquer empresa", () => {
    expect(canAccessScope(geral, { companyId: "empB" })).toBe(true);
  });
});

describe("escopo por posto/contrato", () => {
  it("vigilante só acessa o posto vinculado", () => {
    expect(canAccessScope(vigA, { companyId: "empA", postId: "p1" })).toBe(true);
    expect(canAccessScope(vigA, { companyId: "empA", postId: "p2" })).toBe(false);
    expect(canAccessScope(vigA, { companyId: "empA", contractId: "c2", postId: "p9" })).toBe(false);
    expect(canAccessScope(vigA, { companyId: "empA" })).toBe(false);
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
    const v = actor({ role: "vigilante", postIds: ["p1"], companyStatus: "bloqueada" });
    expect(hasPermission(v, "ronda.executar")).toBe(false);
    expect(canAccessScope(v, { companyId: "empA", postId: "p1" })).toBe(false);
  });

  it("admin_geral desativado não tem acesso", () => {
    expect(permissionsOf(actor({ role: "admin_geral", status: "desativado" }))).toEqual([]);
  });
});

describe("permissões por perfil", () => {
  it("vigilante executa rondas mas não gerencia nada", () => {
    expect(hasPermission(vigA, "ronda.executar")).toBe(true);
    expect(hasPermission(vigA, "usuario.gerir")).toBe(false);
    expect(hasPermission(vigA, "relatorio.ver")).toBe(false);
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
      expect(hasPermission(vigA, p)).toBe(false);
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
  it("admin_empresa cria vigilante/supervisor apenas na própria empresa", () => {
    expect(canManageUser(adminA, { role: "vigilante", companyId: "empA" })).toBe(true);
    expect(canManageUser(adminA, { role: "supervisor", companyId: "empA" })).toBe(true);
    expect(canManageUser(adminA, { role: "vigilante", companyId: "empB" })).toBe(false);
  });

  it("admin_empresa não cria administradores", () => {
    expect(canManageUser(adminA, { role: "admin_empresa", companyId: "empA" })).toBe(false);
    expect(canManageUser(adminA, { role: "admin_geral", companyId: null })).toBe(false);
  });

  it("admin_geral cria qualquer perfil, admin_geral sem empresa", () => {
    expect(canManageUser(geral, { role: "admin_geral", companyId: null })).toBe(true);
    expect(canManageUser(geral, { role: "admin_geral", companyId: "empA" })).toBe(false);
    expect(canManageUser(geral, { role: "admin_empresa", companyId: "empB" })).toBe(true);
    expect(canManageUser(geral, { role: "vigilante", companyId: null })).toBe(false);
  });

  it("supervisor e vigilante não cadastram usuários", () => {
    expect(assignableRoles(supA)).toEqual([]);
    expect(canManageUser(vigA, { role: "vigilante", companyId: "empA" })).toBe(false);
  });
});

describe("validação de entrada", () => {
  it("rejeita campos desconhecidos (ex.: tentativa de injetar status/claims)", () => {
    const r = createUserSchema.safeParse({ email: "a@b.com", nome: "Ana", role: "vigilante", companyId: "empA", admin: true });
    expect(r.success).toBe(false);
  });

  it("rejeita IDs com caracteres de caminho", () => {
    const r = createUserSchema.safeParse({ email: "a@b.com", nome: "Ana", role: "vigilante", companyId: "../empB" });
    expect(r.success).toBe(false);
  });

  it("exige empresa para perfis de empresa e proíbe para admin_geral", () => {
    expect(createUserSchema.safeParse({ email: "a@b.com", nome: "Ana", role: "vigilante", companyId: null }).success).toBe(false);
    expect(createUserSchema.safeParse({ email: "a@b.com", nome: "Ana", role: "admin_geral", companyId: "x" }).success).toBe(false);
  });

  it("normaliza e-mail", () => {
    const r = createUserSchema.parse({ email: "  Ana@Empresa.COM ", nome: "Ana", role: "vigilante", companyId: "empA" });
    expect(r.email).toBe("ana@empresa.com");
  });
});
