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
      .catch((e) => setErro(String(e)));
  }, [isGeral]);

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
        setErro("Não foi possível carregar os usuários.");
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

  return (
    <section className="stack">
      <div className="row-between">
        <h1>Usuários</h1>
        <button className="btn btn-primary" onClick={() => setNovo((v) => !v)} disabled={!companyId}>
          {novo ? "Fechar" : "+ Novo usuário"}
        </button>
      </div>

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
        <NovoUsuario
          companyId={companyId === GERAIS ? null : companyId}
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
          <li key={u.uid} className="card user-card">
            <div>
              <strong>{u.nome}</strong>
              <div className="muted small">{u.email}</div>
              <span className="badge">{ROLE_LABELS[u.role]}</span>
              <span className={`badge ${u.status === "ativo" ? "badge-ok" : "badge-danger"}`}>{u.status}</span>
            </div>
            {u.uid !== me.uid && me.assignableRoles.includes(u.role) && (
              u.status === "ativo" ? (
                <button className="btn btn-danger" onClick={() => void alterarStatus(u, "bloqueado")}>Bloquear</button>
              ) : (
                <button className="btn" onClick={() => void alterarStatus(u, "ativo")}>Reativar</button>
              )
            )}
          </li>
        ))}
      </ul>
      {rows.length === 0 && !erro && <p className="muted">Nenhum usuário cadastrado.</p>}
      {!fim && rows.length > 0 && <button className="btn" onClick={() => void carregar(false)}>Carregar mais</button>}
    </section>
  );
}

function NovoUsuario({ companyId, roles, onCreated }: { companyId: string | null; roles: Role[]; onCreated: () => void }) {
  const [form, setForm] = useState({ nome: "", email: "", role: roles.includes("vigilante") ? "vigilante" : (roles[0] ?? "vigilante"), funcao: "supervisor", telefone: "", matricula: "" });
  const [postIds, setPostIds] = useState<string[]>([]);
  const [contractIds, setContractIds] = useState<string[]>([]);
  const [posts, setPosts] = useState<Option[]>([]);
  const [contracts, setContracts] = useState<Option[]>([]);
  // Uma chave por formulário: duplo toque ou reenvio não criam dois usuários.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [msg, setMsg] = useState<{ tipo: "ok" | "error" | "warn"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const opts = (name: string) =>
      getDocs(query(collection(db, name), where("companyId", "==", companyId), limit(100)))
        .then((s) => s.docs.map((d) => ({ id: d.id, nome: (d.data().nome as string) ?? d.id })))
        .catch(() => []);
    void opts("posts").then(setPosts);
    void opts("contracts").then(setContracts);
  }, [companyId]);

  const scoped = form.role === "vigilante" || form.role === "supervisor";

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMsg(null);
    try {
      await api("/v1/users", {
        method: "POST",
        idempotencyKey: key,
        body: {
          nome: form.nome,
          email: form.email,
          role: form.role,
          companyId,
          ...(form.role === "supervisor" ? { funcao: form.funcao, contractIds } : {}),
          postIds: scoped ? postIds : [],
          ...(form.telefone ? { telefone: form.telefone } : {}),
          ...(form.matricula ? { matricula: form.matricula } : {}),
        },
      });
      setKey(crypto.randomUUID());
      try {
        await sendPasswordResetEmail(auth, form.email.trim());
        setMsg({ tipo: "ok", texto: `Usuário criado. Um e-mail para definir a senha foi enviado para ${form.email}.` });
      } catch {
        setMsg({ tipo: "warn", texto: "Usuário criado, mas o e-mail de definição de senha falhou. Use “Esqueci minha senha” no login." });
      }
      setTimeout(onCreated, 2500);
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
      <h2>Novo usuário</h2>
      <label>Nome completo<input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></label>
      <label>E-mail<input type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
      <label>
        Perfil
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </label>
      {form.role === "supervisor" && (
        <label>
          Função
          <select value={form.funcao} onChange={(e) => setForm({ ...form, funcao: e.target.value })}>
            <option value="supervisor">Supervisor</option>
            <option value="fiscal">Fiscal</option>
          </select>
        </label>
      )}
      {scoped && (
        <fieldset>
          <legend>Postos autorizados</legend>
          {posts.length === 0 && <p className="muted small">Nenhum posto cadastrado nesta empresa.</p>}
          {posts.map((p) => (
            <label key={p.id} className="check">
              <input type="checkbox" checked={postIds.includes(p.id)} onChange={() => toggle(postIds, setPostIds, p.id)} /> {p.nome}
            </label>
          ))}
        </fieldset>
      )}
      {form.role === "supervisor" && contracts.length > 0 && (
        <fieldset>
          <legend>Contratos (acesso a todos os postos do contrato)</legend>
          {contracts.map((c) => (
            <label key={c.id} className="check">
              <input type="checkbox" checked={contractIds.includes(c.id)} onChange={() => toggle(contractIds, setContractIds, c.id)} /> {c.nome}
            </label>
          ))}
        </fieldset>
      )}
      <label>Telefone (opcional)<input inputMode="tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></label>
      <label>Matrícula (opcional)<input value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} /></label>
      <p className="muted small">Colete apenas os dados necessários (LGPD). Não é solicitado CPF.</p>
      {msg && <p className={`alert alert-${msg.tipo}`}>{msg.texto}</p>}
      <button className="btn btn-primary btn-lg" disabled={enviando}>{enviando ? "Salvando…" : "Cadastrar"}</button>
    </form>
  );
}
