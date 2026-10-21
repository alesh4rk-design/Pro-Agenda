import { ROLE_LABELS, type Role, type UserStatus } from "@rondas/shared";
import { sendPasswordResetEmail } from "firebase/auth";
import {
  type QueryDocumentSnapshot,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useMe } from "../auth/AuthProvider";
import { api, errorMessage } from "../lib/api";
import { auth, db } from "../lib/firebase";

const PAGE = 25;
const GERAIS = "__admin_geral__";

interface UserRow {
  uid: string;
  nome: string;
  email: string;
  login?: string | null;
  role: Role;
  status: UserStatus;
  postIds: string[];
}

interface Option {
  id: string;
  nome: string;
}

export function UsuariosPage() {
  const me = useMe();
  const isGeral = me.role === "admin_geral";
  const [companies, setCompanies] = useState<Option[]>([]);
  const [companyId, setCompanyId] = useState<string>(me.companyId ?? "");
  const [posts, setPosts] = useState<Option[]>([]);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [fim, setFim] = useState(false);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState(false);

  useEffect(() => {
    if (!isGeral) return;
    getDocs(query(collection(db, "companies"), orderBy("nome"), limit(100)))
      .then((s) => {
        const list = s.docs.map((d) => ({ id: d.id, nome: (d.data().nome as string) ?? d.id }));
        setCompanies(list);
        setCompanyId((c) => c || list[0]?.id || GERAIS);
      })
      .catch(() => setErro("Não foi possível carregar as empresas."));
  }, [isGeral]);

  useEffect(() => {
    if (!companyId || companyId === GERAIS) return setPosts([]);
    getDocs(query(collection(db, "posts"), where("companyId", "==", companyId), limit(100)))
      .then((s) => setPosts(s.docs.map((d) => ({ id: d.id, nome: (d.data().nome as string) ?? d.id }))))
      .catch(() => setPosts([]));
  }, [companyId]);

  const carregar = useCallback(
    async (reset: boolean) => {
      if (!companyId) return;
      setErro("");
      try {
        const filtro = where("companyId", "==", companyId === GERAIS ? null : companyId);
        const q = query(
          collection(db, "users"),
          filtro,
          orderBy("nome"),
          ...(reset || !cursor ? [] : [startAfter(cursor)]),
          limit(PAGE),
        );
        const snap = await getDocs(q);
        const page = snap.docs.map((d) => d.data() as UserRow);
        setRows((r) => (reset ? page : [...r, ...page]));
        setCursor(snap.docs[snap.docs.length - 1] ?? null);
        setFim(snap.docs.length < PAGE);
      } catch {
        setErro("Não foi possível carregar os acessos.");
      }
    },
    [companyId, cursor],
  );

  useEffect(() => void carregar(true), [companyId]);

  async function alterarStatus(u: UserRow, status: UserStatus) {
    const motivo = window.prompt(`Motivo para ${status === "ativo" ? "reativar" : "bloquear"} ${u.nome}:`) ?? undefined;
    if (motivo === undefined) return;
    try {
      await api(`/v1/users/${u.uid}`, { method: "PATCH", body: { status, motivo: motivo || undefined } });
      setRows((r) => r.map((x) => (x.uid === u.uid ? { ...x, status } : x)));
    } catch (err) {
      setErro(errorMessage(err));
    }
  }

  const postName = (id: string) => posts.find((p) => p.id === id)?.nome ?? id;

  return (
    <section className="stack">
      <div className="row-between">
        <h1>Acessos</h1>
        <button className="btn btn-primary" onClick={() => setNovo((v) => !v)} disabled={!companyId}>
          {novo ? "Fechar" : "+ Novo acesso"}
        </button>
      </div>
      <p className="muted small">
        Crie um <strong>acesso para cada posto</strong> (login e senha usados pela equipe do posto) e, se quiser,
        acessos individuais para supervisores e fiscais.
      </p>

      {isGeral && (
        <label>
          Empresa
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            <option value={GERAIS}>— Administradores gerais —</option>
          </select>
        </label>
      )}

      {novo && companyId && (
        <NovoAcesso
          companyId={companyId === GERAIS ? null : companyId}
          posts={posts}
          roles={me.assignableRoles.filter((r) => (companyId === GERAIS ? r === "admin_geral" : r !== "admin_geral"))}
          onCreated={() => {
            setNovo(false);
            void carregar(true);
          }}
        />
      )}

      {erro && <p className="alert alert-error">{erro}</p>}

      <ul className="cards">
        {rows.map((u) => (
          <AcessoCard
            key={u.uid}
            u={u}
            postName={postName}
            podeGerir={u.uid !== me.uid && me.assignableRoles.includes(u.role)}
            onStatus={(s) => void alterarStatus(u, s)}
          />
        ))}
      </ul>
      {rows.length === 0 && !erro && <p className="muted">Nenhum acesso cadastrado.</p>}
      {!fim && rows.length > 0 && <button className="btn" onClick={() => void carregar(false)}>Carregar mais</button>}
    </section>
  );
}

function AcessoCard({
  u,
  postName,
  podeGerir,
  onStatus,
}: {
  u: UserRow;
  postName: (id: string) => string;
  podeGerir: boolean;
  onStatus: (s: UserStatus) => void;
}) {
  const [trocando, setTrocando] = useState(false);
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const isPosto = u.role === "posto";

  async function redefinir(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api(`/v1/users/${u.uid}/senha`, { method: "POST", body: { senha } });
      setMsg({ tipo: "ok", texto: "Senha alterada. Os aparelhos conectados com a senha antiga precisarão entrar de novo." });
      setSenha("");
      setTrocando(false);
    } catch (err) {
      setMsg({ tipo: "error", texto: errorMessage(err) });
    }
  }

  return (
    <li className="card user-card">
      <div>
        <strong>{u.nome}</strong>
        <div className="muted small">
          {isPosto ? <>Login: <code>{u.login}</code> · {u.postIds.map(postName).join(", ")}</> : u.email}
        </div>
        <span className="badge">{ROLE_LABELS[u.role]}</span>
        <span className={`badge ${u.status === "ativo" ? "badge-ok" : "badge-danger"}`}>{u.status}</span>
      </div>
      {podeGerir && (
        <div className="row-between">
          {isPosto && (
            <button className="btn" onClick={() => setTrocando((v) => !v)}>{trocando ? "Cancelar" : "Nova senha"}</button>
          )}
          {u.status === "ativo" ? (
            <button className="btn btn-danger" onClick={() => onStatus("bloqueado")}>Bloquear</button>
          ) : (
            <button className="btn" onClick={() => onStatus("ativo")}>Reativar</button>
          )}
        </div>
      )}
      {trocando && (
        <form className="inline-form" onSubmit={redefinir}>
          <input
            type="text"
            autoComplete="new-password"
            placeholder="Nova senha (mín. 8)"
            aria-label={`Nova senha para ${u.nome}`}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            minLength={8}
            required
          />
          <button className="btn btn-primary" disabled={senha.length < 8}>Salvar senha</button>
        </form>
      )}
      {msg && <p className={`alert alert-${msg.tipo} small`}>{msg.texto}</p>}
    </li>
  );
}

function NovoAcesso({
  companyId,
  posts,
  roles,
  onCreated,
}: {
  companyId: string | null;
  posts: Option[];
  roles: Role[];
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    nome: "",
    email: "",
    login: "",
    senha: "",
    role: (roles.includes("posto") ? "posto" : (roles[0] ?? "posto")) as Role,
    funcao: "supervisor",
    telefone: "",
  });
  const [postId, setPostId] = useState("");
  const [postIds, setPostIds] = useState<string[]>([]);
  const [contractIds, setContractIds] = useState<string[]>([]);
  const [contracts, setContracts] = useState<Option[]>([]);
  // Uma chave por formulário: duplo toque ou reenvio não criam dois acessos.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [msg, setMsg] = useState<{ tipo: "ok" | "error" | "warn"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    getDocs(query(collection(db, "contracts"), where("companyId", "==", companyId), limit(100)))
      .then((s) => setContracts(s.docs.map((d) => ({ id: d.id, nome: (d.data().nome as string) ?? d.id }))))
      .catch(() => setContracts([]));
  }, [companyId]);

  const isPosto = form.role === "posto";

  // Sugere nome e login a partir do posto escolhido (editáveis).
  function escolherPosto(id: string) {
    setPostId(id);
    const p = posts.find((x) => x.id === id);
    if (!p) return;
    const sugestao = p.nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    setForm((f) => ({ ...f, nome: f.nome || p.nome, login: f.login || sugestao }));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMsg(null);
    try {
      const body = isPosto
        ? { role: "posto", nome: form.nome, companyId, login: form.login, senha: form.senha, postIds: [postId] }
        : {
            role: form.role,
            nome: form.nome,
            email: form.email,
            companyId,
            ...(form.role === "supervisor" ? { funcao: form.funcao, contractIds, postIds } : {}),
            ...(form.telefone ? { telefone: form.telefone } : {}),
          };
      await api("/v1/users", { method: "POST", idempotencyKey: key, body });
      setKey(crypto.randomUUID());
      if (isPosto) {
        setMsg({ tipo: "ok", texto: `Acesso criado. Entregue à equipe do posto o login “${form.login}” e a senha definida.` });
      } else {
        try {
          await sendPasswordResetEmail(auth, form.email.trim());
          setMsg({ tipo: "ok", texto: `Acesso criado. Um e-mail para definir a senha foi enviado para ${form.email}.` });
        } catch {
          setMsg({ tipo: "warn", texto: "Acesso criado, mas o e-mail de definição de senha falhou. Use “Esqueci minha senha” no login." });
        }
      }
      setTimeout(onCreated, 3000);
    } catch (err) {
      setMsg({ tipo: "error", texto: errorMessage(err) });
    } finally {
      setEnviando(false);
    }
  }

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <form className="card stack" onSubmit={salvar}>
      <h2>Novo acesso</h2>
      <label>
        Tipo de acesso
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </label>

      {isPosto ? (
        <>
          <label>
            Posto
            <select value={postId} onChange={(e) => escolherPosto(e.target.value)} required>
              <option value="" disabled>Selecione o posto</option>
              {posts.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
          {posts.length === 0 && <p className="muted small">Nenhum posto cadastrado nesta empresa.</p>}
          <label>Nome de exibição<input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></label>
          <label>
            Login
            <input
              value={form.login}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setForm({ ...form, login: e.target.value.toLowerCase() })}
              pattern="[a-z0-9][a-z0-9._\-]{1,38}[a-z0-9]"
              title="3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado"
              required
            />
          </label>
          <label>
            Senha
            <input type="text" autoComplete="new-password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} minLength={8} required />
          </label>
          <p className="muted small">
            A equipe do posto entra com este login e senha. Vigilantes não precisam de login: as rondas ficam registradas em nome do posto. Você pode trocar
            a senha a qualquer momento (por exemplo, quando alguém deixar o posto).
          </p>
        </>
      ) : (
        <>
          <label>Nome completo<input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></label>
          <label>E-mail<input type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          {form.role === "supervisor" && (
            <>
              <label>
                Função
                <select value={form.funcao} onChange={(e) => setForm({ ...form, funcao: e.target.value })}>
                  <option value="supervisor">Supervisor</option>
                  <option value="fiscal">Fiscal</option>
                </select>
              </label>
              <fieldset>
                <legend>Postos que acompanha</legend>
                {posts.length === 0 && <p className="muted small">Nenhum posto cadastrado nesta empresa.</p>}
                {posts.map((p) => (
                  <label key={p.id} className="check">
                    <input type="checkbox" checked={postIds.includes(p.id)} onChange={() => toggle(postIds, setPostIds, p.id)} /> {p.nome}
                  </label>
                ))}
              </fieldset>
              {contracts.length > 0 && (
                <fieldset>
                  <legend>Contratos (acesso a todos os postos do contrato)</legend>
                  {contracts.map((c) => (
                    <label key={c.id} className="check">
                      <input type="checkbox" checked={contractIds.includes(c.id)} onChange={() => toggle(contractIds, setContractIds, c.id)} /> {c.nome}
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          )}
          <label>Telefone (opcional)<input inputMode="tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></label>
          <p className="muted small">A pessoa recebe por e-mail um link para criar a própria senha.</p>
        </>
      )}
      {msg && <p className={`alert alert-${msg.tipo}`}>{msg.texto}</p>}
      <button className="btn btn-primary btn-lg" disabled={enviando}>{enviando ? "Salvando…" : "Criar acesso"}</button>
    </form>
  );
}
