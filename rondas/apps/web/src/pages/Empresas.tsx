import { DEFAULT_RETENCAO_FOTOS_DIAS, type CompanyStatus } from "@rondas/shared";
import { collection, orderBy, query } from "firebase/firestore";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge, askMotivo } from "../components/Status";
import { api, errorMessage } from "../lib/api";
import { db } from "../lib/firebase";
import { usePaged } from "../lib/usePaged";

interface Responsavel {
  nome: string;
  telefone?: string;
  email?: string;
}

interface Company {
  nome: string;
  cnpj: string | null;
  responsaveis: Responsavel[];
  status: CompanyStatus;
  permissoesAdmin: { gerirContratos: boolean; gerirPostos: boolean };
  retencaoFotosDias: number;
}

const baseQuery = query(collection(db, "companies"), orderBy("nome"));

export function EmpresasPage() {
  const list = usePaged<Company>(baseQuery, "companies");
  const [editando, setEditando] = useState<(Company & { id: string }) | "nova" | null>(null);
  const [erro, setErro] = useState("");

  async function mudarStatus(c: Company & { id: string }, status: CompanyStatus) {
    const acao = status === "ativa" ? "reativar" : status === "bloqueada" ? "bloquear" : "desativar";
    const motivo = askMotivo(acao, c.nome, status !== "ativa");
    if (motivo === null) return;
    try {
      await api(`/v1/companies/${c.id}`, { method: "PATCH", body: { status, motivo: motivo || undefined } });
      list.patch(c.id, { status });
    } catch (err) {
      setErro(errorMessage(err));
    }
  }

  return (
    <section className="stack">
      <div className="row-between">
        <h1>Empresas</h1>
        <button className="btn btn-primary" onClick={() => setEditando(editando ? null : "nova")}>
          {editando ? "Fechar" : "+ Nova empresa"}
        </button>
      </div>
      <p className="muted small">
        Empresas clientes que compraram o sistema. Bloquear uma empresa suspende imediatamente o acesso de todos os
        usuários e postos dela; nada é apagado.
      </p>

      {editando && (
        <EmpresaForm
          key={editando === "nova" ? "nova" : editando.id}
          inicial={editando === "nova" ? null : editando}
          onSaved={() => {
            setEditando(null);
            void list.reload();
          }}
        />
      )}

      {(erro || list.error) && <p className="alert alert-error">{erro || list.error}</p>}

      <ul className="cards">
        {list.items.map((c) => (
          <li key={c.id} className="card stack-sm">
            <div className="row-between">
              <div>
                <strong>{c.nome}</strong>
                <div className="muted small">{c.cnpj ?? "Sem CNPJ"} · fotos guardadas por {c.retencaoFotosDias} dia(s)</div>
              </div>
              <StatusBadge status={c.status} />
            </div>
            {c.responsaveis?.length > 0 && (
              <div className="small">Responsável: {c.responsaveis.map((r) => [r.nome, r.telefone].filter(Boolean).join(" · ")).join("; ")}</div>
            )}
            <div className="actions">
              <Link className="btn" to={`/contratos?empresa=${c.id}`}>Contratos</Link>
              <Link className="btn" to={`/postos?empresa=${c.id}`}>Postos</Link>
              <Link className="btn" to={`/usuarios?empresa=${c.id}`}>Acessos</Link>
              <button className="btn" onClick={() => setEditando(c)}>Editar</button>
              {c.status === "ativa" ? (
                <button className="btn btn-danger" onClick={() => void mudarStatus(c, "bloqueada")}>Bloquear</button>
              ) : (
                <button className="btn" onClick={() => void mudarStatus(c, "ativa")}>Reativar</button>
              )}
              {c.status !== "desativada" && (
                <button className="btn btn-ghost" onClick={() => void mudarStatus(c, "desativada")}>Desativar</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {list.loading && <p className="muted">Carregando…</p>}
      {!list.loading && list.items.length === 0 && !list.error && <p className="muted">Nenhuma empresa cadastrada.</p>}
      {!list.fim && <button className="btn" onClick={() => void list.more()}>Carregar mais</button>}
    </section>
  );
}

function EmpresaForm({ inicial, onSaved }: { inicial: (Company & { id: string }) | null; onSaved: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [cnpj, setCnpj] = useState(inicial?.cnpj ?? "");
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>(inicial?.responsaveis?.length ? inicial.responsaveis : [{ nome: "" }]);
  const [gerirContratos, setGerirContratos] = useState(inicial?.permissoesAdmin?.gerirContratos ?? true);
  const [gerirPostos, setGerirPostos] = useState(inicial?.permissoesAdmin?.gerirPostos ?? true);
  const [retencao, setRetencao] = useState(String(inicial?.retencaoFotosDias ?? DEFAULT_RETENCAO_FOTOS_DIAS));
  const [key] = useState(() => crypto.randomUUID());
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string; novaId?: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMsg(null);
    const body = {
      nome,
      cnpj,
      responsaveis: responsaveis
        .filter((r) => r.nome.trim())
        .map((r) => ({ nome: r.nome, ...(r.telefone ? { telefone: r.telefone } : {}), ...(r.email ? { email: r.email } : {}) })),
      permissoesAdmin: { gerirContratos, gerirPostos },
      retencaoFotosDias: Number(retencao),
    };
    try {
      if (inicial) {
        await api(`/v1/companies/${inicial.id}`, { method: "PATCH", body });
        onSaved();
      } else {
        const r = await api<{ id: string }>("/v1/companies", { method: "POST", body, idempotencyKey: key });
        setMsg({ tipo: "ok", texto: "Empresa cadastrada. Agora crie o administrador da empresa.", novaId: r.id });
      }
    } catch (err) {
      setMsg({ tipo: "error", texto: errorMessage(err) });
    } finally {
      setEnviando(false);
    }
  }

  const setResp = (i: number, campo: keyof Responsavel, v: string) =>
    setResponsaveis((rs) => rs.map((r, j) => (j === i ? { ...r, [campo]: v } : r)));

  if (msg?.novaId) {
    return (
      <div className="card stack">
        <p className="alert alert-ok">{msg.texto}</p>
        <Link className="btn btn-primary btn-lg" to={`/usuarios?empresa=${msg.novaId}`}>Criar administrador da empresa</Link>
        <button className="btn" onClick={onSaved}>Voltar à lista</button>
      </div>
    );
  }

  return (
    <form className="card stack" onSubmit={salvar}>
      <h2>{inicial ? "Editar empresa" : "Nova empresa"}</h2>
      <label>Nome da empresa<input value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} /></label>
      <label>CNPJ (opcional)<input inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" /></label>

      <fieldset className="stack-sm">
        <legend>Responsáveis e contatos</legend>
        {responsaveis.map((r, i) => (
          <div key={i} className="grid-3">
            <input aria-label="Nome do responsável" placeholder="Nome" value={r.nome} onChange={(e) => setResp(i, "nome", e.target.value)} />
            <input aria-label="Telefone" placeholder="Telefone" inputMode="tel" value={r.telefone ?? ""} onChange={(e) => setResp(i, "telefone", e.target.value)} />
            <input aria-label="E-mail" placeholder="E-mail" type="email" value={r.email ?? ""} onChange={(e) => setResp(i, "email", e.target.value)} />
          </div>
        ))}
        {responsaveis.length < 10 && (
          <button type="button" className="btn btn-ghost" onClick={() => setResponsaveis((rs) => [...rs, { nome: "" }])}>+ Responsável</button>
        )}
      </fieldset>

      <fieldset>
        <legend>O administrador da empresa pode</legend>
        <label className="check"><input type="checkbox" checked={gerirContratos} onChange={(e) => setGerirContratos(e.target.checked)} /> Cadastrar e alterar contratos</label>
        <label className="check"><input type="checkbox" checked={gerirPostos} onChange={(e) => setGerirPostos(e.target.checked)} /> Cadastrar e alterar postos</label>
      </fieldset>

      <label>
        Dias de retenção das fotografias
        <input type="number" min={1} max={365} value={retencao} onChange={(e) => setRetencao(e.target.value)} required />
      </label>
      <p className="muted small">Fotos são apagadas automaticamente após esse prazo (padrão 7 dias). Os registros da ronda continuam.</p>

      {msg && <p className={`alert alert-${msg.tipo}`}>{msg.texto}</p>}
      <button className="btn btn-primary btn-lg" disabled={enviando}>{enviando ? "Salvando…" : "Salvar"}</button>
    </form>
  );
}
