import { collection, orderBy, query, where } from "firebase/firestore";
import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CompanyPicker, useCompanyScope } from "../components/CompanyPicker";
import { StatusBadge, askMotivo } from "../components/Status";
import { api, errorMessage } from "../lib/api";
import { db } from "../lib/firebase";
import { formatDate } from "../lib/format";
import { usePaged } from "../lib/usePaged";

type ContractStatus = "ativo" | "suspenso" | "encerrado";

export interface Contract {
  companyId: string;
  nome: string;
  cliente: string;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  retencaoFotosDias: number | null;
  observacoes?: string;
  status: ContractStatus;
}

export function ContratosPage() {
  const scope = useCompanyScope();
  const q = useMemo(
    () => (scope.companyId ? query(collection(db, "contracts"), where("companyId", "==", scope.companyId), orderBy("nome")) : null),
    [scope.companyId],
  );
  const list = usePaged<Contract>(q, scope.companyId);
  const [editando, setEditando] = useState<(Contract & { id: string }) | "novo" | null>(null);
  const [erro, setErro] = useState("");

  async function mudarStatus(c: Contract & { id: string }, status: ContractStatus) {
    const acao = status === "ativo" ? "reativar" : status === "suspenso" ? "suspender" : "encerrar";
    const motivo = askMotivo(acao, c.nome, status !== "ativo");
    if (motivo === null) return;
    try {
      await api(`/v1/contracts/${c.id}`, { method: "PATCH", body: { status, motivo: motivo || undefined } });
      list.patch(c.id, { status });
    } catch (err) {
      setErro(errorMessage(err));
    }
  }

  return (
    <section className="stack">
      <div className="row-between">
        <h1>Contratos</h1>
        <button className="btn btn-primary" disabled={!scope.companyId} onClick={() => setEditando(editando ? null : "novo")}>
          {editando ? "Fechar" : "+ Novo contrato"}
        </button>
      </div>
      <CompanyPicker scope={scope} />

      {editando && scope.companyId && (
        <ContratoForm
          key={editando === "novo" ? "novo" : editando.id}
          companyId={scope.companyId}
          inicial={editando === "novo" ? null : editando}
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
                <div className="muted small">
                  Cliente: {c.cliente} · Vigência {formatDate(c.vigenciaInicio)} a {c.vigenciaFim ? formatDate(c.vigenciaFim) : "indeterminado"}
                </div>
              </div>
              <StatusBadge status={c.status} />
            </div>
            <div className="actions">
              <Link className="btn" to={`/postos?empresa=${c.companyId}&contrato=${c.id}`}>Postos</Link>
              <button className="btn" onClick={() => setEditando(c)}>Editar</button>
              {c.status !== "ativo" && <button className="btn" onClick={() => void mudarStatus(c, "ativo")}>Reativar</button>}
              {c.status === "ativo" && <button className="btn btn-ghost" onClick={() => void mudarStatus(c, "suspenso")}>Suspender</button>}
              {c.status !== "encerrado" && <button className="btn btn-danger" onClick={() => void mudarStatus(c, "encerrado")}>Encerrar</button>}
            </div>
          </li>
        ))}
      </ul>
      {list.loading && <p className="muted">Carregando…</p>}
      {!list.loading && list.items.length === 0 && !list.error && scope.companyId && <p className="muted">Nenhum contrato cadastrado.</p>}
      {!list.fim && <button className="btn" onClick={() => void list.more()}>Carregar mais</button>}
    </section>
  );
}

function ContratoForm({
  companyId,
  inicial,
  onSaved,
}: {
  companyId: string;
  inicial: (Contract & { id: string }) | null;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    nome: inicial?.nome ?? "",
    cliente: inicial?.cliente ?? "",
    vigenciaInicio: inicial?.vigenciaInicio ?? new Date().toISOString().slice(0, 10),
    vigenciaFim: inicial?.vigenciaFim ?? "",
    retencao: inicial?.retencaoFotosDias != null ? String(inicial.retencaoFotosDias) : "",
    observacoes: inicial?.observacoes ?? "",
  });
  const [key] = useState(() => crypto.randomUUID());
  const [msg, setMsg] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMsg("");
    const body = {
      nome: f.nome,
      cliente: f.cliente,
      vigenciaInicio: f.vigenciaInicio,
      vigenciaFim: f.vigenciaFim || null,
      retencaoFotosDias: f.retencao ? Number(f.retencao) : null,
      observacoes: f.observacoes,
    };
    try {
      if (inicial) await api(`/v1/contracts/${inicial.id}`, { method: "PATCH", body });
      else await api("/v1/contracts", { method: "POST", body: { ...body, companyId }, idempotencyKey: key });
      onSaved();
    } catch (err) {
      setMsg(errorMessage(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="card stack" onSubmit={salvar}>
      <h2>{inicial ? "Editar contrato" : "Novo contrato"}</h2>
      <label>Nome do contrato<input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required minLength={2} /></label>
      <label>Cliente<input value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} required minLength={2} /></label>
      <div className="grid-2">
        <label>Início da vigência<input type="date" value={f.vigenciaInicio} onChange={(e) => setF({ ...f, vigenciaInicio: e.target.value })} required /></label>
        <label>Fim da vigência<input type="date" value={f.vigenciaFim} min={f.vigenciaInicio} onChange={(e) => setF({ ...f, vigenciaFim: e.target.value })} /></label>
      </div>
      <p className="muted small">Deixe o fim em branco para prazo indeterminado.</p>
      <label>
        Retenção de fotos (dias)
        <input type="number" min={1} max={365} placeholder="Padrão da empresa" value={f.retencao} onChange={(e) => setF({ ...f, retencao: e.target.value })} />
      </label>
      <label>Observações<textarea rows={3} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} maxLength={1000} /></label>
      {msg && <p className="alert alert-error">{msg}</p>}
      <button className="btn btn-primary btn-lg" disabled={enviando}>{enviando ? "Salvando…" : "Salvar"}</button>
    </form>
  );
}
