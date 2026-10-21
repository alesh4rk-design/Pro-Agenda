import { beforeEach, describe, expect, it } from "vitest";
import { resetRateLimits } from "../src/rateLimit.js";
import { KEY, setup } from "./fakes.js";

let t: ReturnType<typeof setup>;
beforeEach(() => {
  resetRateLimits();
  t = setup();
});

const novoPosto = (companyId = "empA", extra: Record<string, unknown> = {}) => ({
  login: "portaria-nova",
  senha: "senha-do-posto-1",
  nome: "Portaria Nova",
  role: "posto",
  companyId,
  postIds: companyId === "empA" ? ["pA"] : ["pB"],
  ...extra,
});

describe("autenticação", () => {
  it("rejeita requisição sem token", async () => {
    const r = await t.call("GET", "/v1/me");
    expect(r.status).toBe(401);
    expect(r.body.erro.codigo).toBe("NAO_AUTENTICADO");
  });

  it("rejeita token inválido", async () => {
    const r = await t.call("GET", "/v1/me", "lixo");
    expect(r.status).toBe(401);
  });

  it("rejeita usuário sem perfil", async () => {
    const r = await t.call("GET", "/v1/me", "tok|fantasma|posto|empA");
    expect(r.status).toBe(403);
    expect(r.body.erro.codigo).toBe("PERFIL_INEXISTENTE");
  });

  it("rejeita usuário bloqueado", async () => {
    t.db.docs.get("users/postoA")!.status = "bloqueado";
    const r = await t.call("GET", "/v1/me", t.tokens.postoA);
    expect(r.status).toBe(403);
    expect(r.body.erro.codigo).toBe("USUARIO_INATIVO");
  });

  it("rejeita usuário de empresa bloqueada", async () => {
    t.db.docs.get("companies/empA")!.status = "bloqueada";
    const r = await t.call("GET", "/v1/me", t.tokens.admA);
    expect(r.status).toBe(403);
    expect(r.body.erro.codigo).toBe("EMPRESA_INATIVA");
  });

  it("claims forjadas/desatualizadas não concedem acesso (documento é a fonte da verdade)", async () => {
    // Token afirma admin_geral, mas o perfil gravado é posto.
    const r = await t.call("GET", "/v1/me", "tok|postoA|admin_geral|");
    expect(r.status).toBe(401);
    expect(r.body.erro.codigo).toBe("CLAIMS_DESATUALIZADAS");
    // Token afirma outra empresa.
    const r2 = await t.call("GET", "/v1/me", "tok|admA|admin_empresa|empB");
    expect(r2.status).toBe(401);
  });

  it("GET /v1/me devolve permissões do perfil", async () => {
    const r = await t.call("GET", "/v1/me", t.tokens.postoA);
    expect(r.status).toBe(200);
    expect(r.body.role).toBe("posto");
    expect(r.body.permissions).toContain("ronda.executar");
    expect(r.body.permissions).not.toContain("usuario.gerir");
    expect(r.body.assignableRoles).toEqual([]);
  });
});

describe("configuração do sistema", () => {
  it("admin_geral altera o nome do sistema com auditoria", async () => {
    const r = await t.call("PUT", "/v1/config/sistema", t.tokens.geral, { nomeSistema: "Ronda Segura" });
    expect(r.status).toBe(200);
    expect(t.db.docs.get("config/publico")!.nomeSistema).toBe("Ronda Segura");
    const logs = t.db.collection("auditLogs");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "sistema.configurar", actorUid: "geral", after: { nomeSistema: "Ronda Segura" } });
  });

  it.each(["admA", "supA", "postoA"] as const)("%s não altera o nome do sistema", async (who) => {
    const r = await t.call("PUT", "/v1/config/sistema", t.tokens[who], { nomeSistema: "Hack" });
    expect(r.status).toBe(403);
    expect(t.db.docs.get("config/publico")).toBeUndefined();
  });

  it("valida o corpo", async () => {
    const r = await t.call("PUT", "/v1/config/sistema", t.tokens.geral, { nomeSistema: "x", extra: 1 });
    expect(r.status).toBe(400);
    expect(r.body.erro.codigo).toBe("DADOS_INVALIDOS");
  });
});

describe("cadastro de usuários", () => {
  it("admin_empresa cria acesso do posto com login e senha (Auth + claims + perfil + auditoria)", async () => {
    const r = await t.call("POST", "/v1/users", t.tokens.admA, novoPosto(), { "Idempotency-Key": KEY(1) });
    expect(r.status).toBe(201);
    const uid = r.body.uid;
    const conta = t.identity.users.get(uid)!;
    expect(conta.claims).toEqual({ role: "posto", cid: "empA" });
    expect(conta.email).toBe("portaria-nova@postos.invalid");
    expect(conta.password).toBe("senha-do-posto-1");
    expect(t.db.docs.get(`users/${uid}`)).toMatchObject({ role: "posto", login: "portaria-nova", companyId: "empA", postIds: ["pA"], status: "ativo", createdBy: "admA" });
    expect(r.body).toMatchObject({ login: "portaria-nova", email: null });
    // A senha não aparece em nenhum documento gravado (perfil, auditoria, idempotência).
    expect(JSON.stringify([...t.db.docs.values()])).not.toContain("senha-do-posto-1");
    expect(t.db.collection("auditLogs")[0]).toMatchObject({ action: "usuario.criar", targetId: uid, companyId: "empA" });
  });

  it("admin_empresa NÃO cadastra usuário em outra empresa (alterando companyId)", async () => {
    const r = await t.call("POST", "/v1/users", t.tokens.admA, novoPosto("empB"), { "Idempotency-Key": KEY(2) });
    expect(r.status).toBe(403);
    expect(t.identity.users.size).toBe(5);
  });

  it("admin_empresa NÃO vincula posto de outra empresa", async () => {
    const r = await t.call("POST", "/v1/users", t.tokens.admA, novoPosto("empA", { postIds: ["pB"] }), { "Idempotency-Key": KEY(3) });
    expect(r.status).toBe(400);
    expect(r.body.erro.codigo).toBe("VINCULO_INVALIDO");
  });

  it("admin_empresa NÃO cria administradores", async () => {
    for (const role of ["admin_empresa", "admin_geral"]) {
      const body = { email: `${role}@x.com`, nome: "Adm", role, companyId: role === "admin_geral" ? null : "empA" };
      const r = await t.call("POST", "/v1/users", t.tokens.admA, body, { "Idempotency-Key": KEY(role.length) });
      expect(r.status).toBe(403);
    }
  });

  it.each(["supA", "postoA"] as const)("%s não cadastra usuários", async (who) => {
    const r = await t.call("POST", "/v1/users", t.tokens[who], novoPosto(), { "Idempotency-Key": KEY(4) });
    expect(r.status).toBe(403);
  });

  it("admin_geral cadastra admin_empresa em qualquer empresa", async () => {
    const r = await t.call(
      "POST",
      "/v1/users",
      t.tokens.geral,
      { email: "adm@b.com", nome: "Admin B2", role: "admin_empresa", companyId: "empB" },
      { "Idempotency-Key": KEY(5) },
    );
    expect(r.status).toBe(201);
  });

  it("não cadastra em empresa bloqueada", async () => {
    t.db.docs.get("companies/empB")!.status = "bloqueada";
    const r = await t.call("POST", "/v1/users", t.tokens.geral, novoPosto("empB"), { "Idempotency-Key": KEY(6) });
    expect(r.status).toBe(409);
  });

  it("login ou e-mail duplicado é recusado", async () => {
    const r = await t.call("POST", "/v1/users", t.tokens.admA, novoPosto("empA", { login: "Portaria-A" }), { "Idempotency-Key": KEY(7) });
    expect(r.status).toBe(409);
    expect(r.body.erro.codigo).toBe("LOGIN_EM_USO");
    const sup = { email: "SUPA@teste.local", nome: "Sup", role: "supervisor", companyId: "empA", postIds: ["pA"] };
    const r2 = await t.call("POST", "/v1/users", t.tokens.admA, sup, { "Idempotency-Key": KEY(17) });
    expect(r2.body.erro.codigo).toBe("EMAIL_EM_USO");
  });

  it("requisição repetida com a mesma Idempotency-Key não duplica o usuário", async () => {
    const h = { "Idempotency-Key": KEY(8) };
    const r1 = await t.call("POST", "/v1/users", t.tokens.admA, novoPosto(), h);
    const r2 = await t.call("POST", "/v1/users", t.tokens.admA, novoPosto(), h);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.headers.get("Idempotent-Replay")).toBe("true");
    expect(r2.body.uid).toBe(r1.body.uid);
    expect(t.identity.users.size).toBe(6);
    expect(t.db.collection("auditLogs")).toHaveLength(1);
  });

  it("exige Idempotency-Key", async () => {
    const r = await t.call("POST", "/v1/users", t.tokens.admA, novoPosto());
    expect(r.status).toBe(400);
  });

  it("se a gravação falhar, a conta criada no Auth é removida (sem conta órfã)", async () => {
    t.db.failNextCommit = true;
    const r = await t.call("POST", "/v1/users", t.tokens.admA, novoPosto(), { "Idempotency-Key": KEY(9) });
    expect(r.status).toBe(500);
    expect(await t.identity.findUidByEmail("novo@empresa.com")).toBeNull();
  });
});

describe("edição de usuários", () => {
  it("admin_empresa bloqueia o acesso do posto: perfil, Auth desativado, sessões revogadas, auditoria", async () => {
    const r = await t.call("PATCH", "/v1/users/postoA", t.tokens.admA, { status: "bloqueado", motivo: "Desligamento" });
    expect(r.status).toBe(200);
    expect(t.db.docs.get("users/postoA")!.status).toBe("bloqueado");
    expect(t.identity.users.get("postoA")!.disabled).toBe(true);
    expect(t.identity.users.get("postoA")!.revokedAt).toBeDefined();
    expect(t.db.collection("auditLogs")[0]).toMatchObject({
      action: "usuario.status.bloqueado",
      before: { status: "ativo" },
      after: { status: "bloqueado" },
      motivo: "Desligamento",
    });
    // Depois do bloqueio, o token ainda válido do posto não serve mais.
    expect((await t.call("GET", "/v1/me", t.tokens.postoA)).status).toBe(403);
  });

  it("usuário de outra empresa é tratado como inexistente (manipulação de ID na URL)", async () => {
    const r = await t.call("PATCH", "/v1/users/postoA", t.tokens.admB, { status: "bloqueado" });
    expect(r.status).toBe(404);
    expect(t.db.docs.get("users/postoA")!.status).toBe("ativo");
  });

  it("admin_empresa não edita outro admin nem o admin_geral", async () => {
    t.db.docs.set("users/admA2", { uid: "admA2", role: "admin_empresa", companyId: "empA", status: "ativo", postIds: [], contractIds: [] });
    expect((await t.call("PATCH", "/v1/users/admA2", t.tokens.admA, { nome: "Outro" })).status).toBe(403);
    expect((await t.call("PATCH", "/v1/users/geral", t.tokens.admA, { nome: "Outro" })).status).toBe(404);
  });

  it("admin_empresa não promove acesso do posto a administrador", async () => {
    const r = await t.call("PATCH", "/v1/users/postoA", t.tokens.admA, { role: "admin_empresa", postIds: [] });
    expect([400, 403]).toContain(r.status);
    expect(t.db.docs.get("users/postoA")!.role).toBe("posto");
  });

  it("ninguém altera o próprio perfil ou status", async () => {
    expect((await t.call("PATCH", "/v1/users/geral", t.tokens.geral, { status: "desativado" })).status).toBe(403);
    expect((await t.call("PATCH", "/v1/users/admA", t.tokens.admA, { role: "admin_geral" })).status).toBe(403);
  });

  it("promoção de perfil atualiza as claims", async () => {
    const r = await t.call("PATCH", "/v1/users/supA", t.tokens.geral, { role: "admin_empresa", postIds: [] });
    expect(r.status).toBe(200);
    expect(t.identity.users.get("supA")!.claims).toEqual({ role: "admin_empresa", cid: "empA" });
    expect(t.db.docs.get("users/supA")).toMatchObject({ role: "admin_empresa", funcao: null });
    // O token antigo (supervisor) deixa de valer até ser renovado.
    expect((await t.call("GET", "/v1/me", t.tokens.supA)).body.erro.codigo).toBe("CLAIMS_DESATUALIZADAS");
  });

  it("acesso do posto não vira outro perfil (credenciais diferentes)", async () => {
    const r = await t.call("PATCH", "/v1/users/postoA", t.tokens.admA, { role: "supervisor" });
    expect(r.status).toBe(400);
    expect(r.body.erro.codigo).toBe("PERFIL_INCOMPATIVEL");
    const r2 = await t.call("PATCH", "/v1/users/supA", t.tokens.admA, { role: "posto" });
    expect(r2.body.erro.codigo).toBe("PERFIL_INCOMPATIVEL");
  });

  it("acesso do posto fica vinculado a exatamente um posto", async () => {
    t.db.docs.set("posts/pA2", { companyId: "empA", contractId: "cA" });
    expect((await t.call("PATCH", "/v1/users/postoA", t.tokens.admA, { postIds: ["pA", "pA2"] })).status).toBe(400);
    expect((await t.call("PATCH", "/v1/users/postoA", t.tokens.admA, { postIds: ["pA2"] })).status).toBe(200);
  });

  it("valida o estado final (admin não pode ficar com postos)", async () => {
    const r = await t.call("PATCH", "/v1/users/supA", t.tokens.geral, { role: "admin_empresa" });
    expect(r.status).toBe(400);
  });

  it("sem alterações reais não grava auditoria", async () => {
    const r = await t.call("PATCH", "/v1/users/postoA", t.tokens.admA, { nome: "postoA" });
    expect(r.body.alterado).toBe(false);
    expect(t.db.collection("auditLogs")).toHaveLength(0);
  });
});

describe("senha do acesso do posto", () => {
  it("admin da empresa redefine a senha: Auth atualizado, sessões encerradas, auditoria sem a senha", async () => {
    const r = await t.call("POST", "/v1/users/postoA/senha", t.tokens.admA, { senha: "nova-senha-posto", motivo: "Troca de turno" });
    expect(r.status).toBe(200);
    expect(t.identity.users.get("postoA")!.password).toBe("nova-senha-posto");
    expect(t.identity.users.get("postoA")!.revokedAt).toBeDefined();
    const log = t.db.collection("auditLogs")[0]!;
    expect(log).toMatchObject({ action: "usuario.senha_redefinida", targetId: "postoA", motivo: "Troca de turno" });
    expect(JSON.stringify(log)).not.toContain("nova-senha-posto");
  });

  it("admin de outra empresa não redefine (tratado como inexistente)", async () => {
    expect((await t.call("POST", "/v1/users/postoA/senha", t.tokens.admB, { senha: "nova-senha-posto" })).status).toBe(404);
  });

  it.each(["supA", "postoA"] as const)("%s não redefine senhas", async (who) => {
    expect((await t.call("POST", "/v1/users/postoA/senha", t.tokens[who], { senha: "nova-senha-posto" })).status).toBe(403);
  });

  it("só vale para acesso do posto; senha curta é recusada", async () => {
    expect((await t.call("POST", "/v1/users/supA/senha", t.tokens.admA, { senha: "nova-senha-posto" })).body.erro.codigo).toBe("PERFIL_INCOMPATIVEL");
    expect((await t.call("POST", "/v1/users/postoA/senha", t.tokens.admA, { senha: "123" })).status).toBe(400);
  });
});

describe("proteções gerais", () => {
  it("rota inexistente e método não permitido", async () => {
    expect((await t.call("GET", "/v1/nada", t.tokens.geral)).status).toBe(404);
    expect((await t.call("DELETE", "/v1/me", t.tokens.geral)).status).toBe(405);
  });

  it("IDs com caracteres inválidos na URL não casam com rotas", async () => {
    expect((await t.call("PATCH", "/v1/users/..%2Fcompanies%2FempB", t.tokens.geral, { nome: "X" })).status).toBe(404);
  });

  it("corpo que não é JSON é recusado", async () => {
    const r = await t.call("PUT", "/v1/config/sistema", t.tokens.geral, undefined, { "Content-Type": "text/plain" });
    expect(r.status).toBe(415);
  });

  it("corpo muito grande é recusado", async () => {
    const r = await t.call("PUT", "/v1/config/sistema", t.tokens.geral, { nomeSistema: "x".repeat(40_000) });
    expect(r.status).toBe(413);
  });

  it("limite de requisições por usuário", async () => {
    let last = 0;
    for (let i = 0; i < 35; i++) last = (await t.call("PUT", "/v1/config/sistema", t.tokens.geral, { nomeSistema: `Nome ${i}` })).status;
    expect(last).toBe(429);
  });

  it("CORS só libera origens configuradas", async () => {
    const ok = await t.app(new Request("https://api.teste/v1/health", { headers: { Origin: "http://localhost:5173" } }));
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    const bad = await t.app(new Request("https://api.teste/v1/health", { headers: { Origin: "https://malicioso.example" } }));
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
