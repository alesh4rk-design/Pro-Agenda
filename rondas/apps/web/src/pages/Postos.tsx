import {
  OPERATIONAL_STATE_LABELS,
  SHIFT_DATE_RULE_LABELS,
  SHIFT_DATE_RULES,
  type ShiftDateRule,
  operationalState,
} from "@rondas/shared";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CompanyPicker, useCompanyScope } from "../components/CompanyPicker";
import { StatusBadge, askMotivo } from "../components/Status";
import { api, errorMessage } from "../lib/api";
import { db } from "../lib/firebase";
import { DIAS_SEMANA, formatDias, todayIn } from "../lib/format";
import { usePaged } from "../lib/usePaged";
import type { Contract } from "./Contratos";

type PostStatus = "ativo" | "suspenso" | "encerrado";

interface Post {
  companyId: string;
  contractId: string;
  nome: string;
  endereco: string;
  geo: { lat: number; lng: number } | null;
  timezone: string;
  diasOperacao: number[];
  horarioFuncionamento: { inicio: string; fim: string } | null;
  shiftDateRule: ShiftDateRule;
  instrucoes?: string;
  status: PostStatus;
}

const FUSOS = [
  { tz: "America/Sao_Paulo", label: "Brasília (RJ, SP, MG, Sul, Nordeste, GO, DF)" },
  { tz: "America/Manaus", label: "Amazonas, Rondônia, Roraima, MT, MS (−1 h)" },
  { tz: "America/Rio_Branco", label: "Acre (−2 h)" },
  { tz: "America/Noronha", label: "Fernando de Noronha (+1 h)" },
];

export function PostosPage() {
  const scope = useCompanyScope();
  const [params, setParams] = useSearchParams();
  const contratoFiltro = params.get("contrato") ?? "";
  const [contracts, setContracts] = useState<(Contract & { id: string })[]>([]);
  const [companyStatus, setCompanyStatus] = useState("ativa");

  useEffect(() => {
    if (!scope.companyId) return setContracts([]);
    getDocs(query(collection(db, "contracts"), where("companyId", "==", scope.companyId), orderBy("nome"), limit(200)))
      .then((s) => setContracts(s.docs.map((d) => ({ ...(d.data() as Contract), id: d.id }))))
      .catch(() => setContracts([]));
    getDoc(doc(db, "companies", scope.companyId))
      .then((s) => setCompanyStatus((s.data()?.status as string) ?? "ativa"))
      .catch(() => undefined);
  }, [scope.companyId]);

  const q = useMemo(() => {
    if (!scope.companyId) return null;
    const base = collection(db, "posts");
    return contratoFiltro
      ? query(base, where("companyId", "==", scope.companyId), where("contractId", "==", contratoFiltro), orderBy("nome"))
      : query(base, where("companyId", "==", scope.companyId), orderBy("nome"));
  }, [scope.companyId, contratoFiltro]);
  const list = usePaged<Post>(q, `${scope.companyId}|${contratoFiltro}`);
  const [editando, setEditando] = useState<(Post & { id: string }) | "novo" | null>(null);
  const [erro, setErro] = useState("");

  const contrato = (id: string) => contracts.find((c) => c.id === id);
  const ativos = contracts.filter((c) => c.status !== "encerrado");

  function filtrar(id: string) {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (id) n.set("contrato", id);
      else n.delete("contrato");
      return n;
    });
  }

  async function mudarStatus(p: Post & { id: string }, status: PostStatus) {
    const acao = status === "ativo" ? "reativar" : status === "suspenso" ? "suspender" : "encerrar";
    const motivo = askMotivo(acao, p.nome, status !== "ativo");
    if (motivo === null) return;
    try {
      await api(`/v1/posts/${p.id}`, { method: "PATCH", body: { status, motivo: motivo || undefined } });
      list.patch(p.id, { status });
    } catch (err) {
      setErro(errorMessage(err));
    }
  }

  return (
    <section className="stack">
      <div className="row-between">
        <h1>Postos</h1>
        <button className="btn btn-primary" disabled={ativos.length === 0} onClick={() => setEditando(editando ? null : "novo")}>
          {editando ? "Fechar" : "+ Novo posto"}
        </button>
      </div>
      <CompanyPicker scope={scope} />
      <label>
        Contrato
        <select value={contratoFiltro} onChange={(e) => filtrar(e.target.value)}>
          <option value="">Todos os contratos</option>
          {contracts.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.status !== "ativo" ? ` (${c.status})` : ""}</option>)}
        </select>
      </label>
      {scope.companyId && contracts.length > 0 && ativos.length === 0 && (
        <p className="alert alert-warn">Todos os contratos estão encerrados. Cadastre ou reative um contrato para criar postos.</p>
      )}
      {scope.companyId && contracts.length === 0 && (
        <p className="alert alert-warn">
          Nenhum contrato cadastrado. <Link to={`/contratos${scope.isGeral ? `?empresa=${scope.companyId}` : ""}`}>Cadastre um contrato</Link> antes de criar postos.
        </p>
      )}

      {editando && (
        <PostoForm
          key={editando === "novo" ? "novo" : editando.id}
          contratos={ativos}
          contratoPadrao={contratoFiltro}
          inicial={editando === "novo" ? null : editando}
          onSaved={() => {
            setEditando(null);
            void list.reload();
          }}
        />
      )}

      {(erro || list.error) && <p className="alert alert-error">{erro || list.error}</p>}

      <ul className="cards">
        {list.items.map((p) => {
          const c = contrato(p.contractId);
          const estado = c ? operationalState({ status: companyStatus }, c, p, todayIn(p.timezone)) : null;
          return (
            <li key={p.id} className="card stack-sm">
              <div className="row-between">
                <div>
                  <strong>{p.nome}</strong>
                  <div className="muted small">{p.endereco}</div>
                  <div className="muted small">Contrato: {c?.nome ?? p.contractId}</div>
                </div>
                {estado ? <StatusBadge status={estado} label={OPERATIONAL_STATE_LABELS[estado]} /> : <StatusBadge status={p.status} />}
              </div>
              <div className="small">
                {formatDias(p.diasOperacao)} ·{" "}
                {p.horarioFuncionamento ? `${p.horarioFuncionamento.inicio}–${p.horarioFuncionamento.fim}` : "24 horas"} ·{" "}
                {p.geo ? (
                  <a href={`https://www.openstreetmap.org/?mlat=${p.geo.lat}&mlon=${p.geo.lng}#map=18/${p.geo.lat}/${p.geo.lng}`} target="_blank" rel="noreferrer">
                    ver no mapa
                  </a>
                ) : (
                  <span className="text-warn">sem coordenadas</span>
                )}
              </div>
              <div className="actions">
                <button className="btn" onClick={() => setEditando(p)}>Editar</button>
                {p.status !== "ativo" && <button className="btn" onClick={() => void mudarStatus(p, "ativo")}>Reativar</button>}
                {p.status === "ativo" && <button className="btn btn-ghost" onClick={() => void mudarStatus(p, "suspenso")}>Suspender</button>}
                {p.status !== "encerrado" && <button className="btn btn-danger" onClick={() => void mudarStatus(p, "encerrado")}>Encerrar</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {list.loading && <p className="muted">Carregando…</p>}
      {!list.loading && list.items.length === 0 && !list.error && contracts.length > 0 && <p className="muted">Nenhum posto cadastrado.</p>}
      {!list.fim && <button className="btn" onClick={() => void list.more()}>Carregar mais</button>}
    </section>
  );
}

function PostoForm({
  contratos,
  contratoPadrao,
  inicial,
  onSaved,
}: {
  contratos: (Contract & { id: string })[];
  contratoPadrao: string;
  inicial: (Post & { id: string }) | null;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    contractId: inicial?.contractId ?? (contratos.some((c) => c.id === contratoPadrao) ? contratoPadrao : (contratos[0]?.id ?? "")),
    nome: inicial?.nome ?? "",
    endereco: inicial?.endereco ?? "",
    lat: inicial?.geo ? String(inicial.geo.lat) : "",
    lng: inicial?.geo ? String(inicial.geo.lng) : "",
    timezone: inicial?.timezone ?? "America/Sao_Paulo",
    dias: inicial?.diasOperacao ?? [0, 1, 2, 3, 4, 5, 6],
    h24: !inicial?.horarioFuncionamento,
    inicio: inicial?.horarioFuncionamento?.inicio ?? "07:00",
    fim: inicial?.horarioFuncionamento?.fim ?? "19:00",
    shiftDateRule: inicial?.shiftDateRule ?? ("inicio_turno" as ShiftDateRule),
    instrucoes: inicial?.instrucoes ?? "",
  });
  const [gps, setGps] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const [msg, setMsg] = useState("");
  const [enviando, setEnviando] = useState(false);

  function usarLocalizacao() {
    if (!navigator.geolocation) return setGps("Este aparelho não informa localização.");
    setGps("Obtendo localização…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setF((x) => ({ ...x, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
        setGps(`Localização obtida (precisão aproximada de ${Math.round(pos.coords.accuracy)} m). Confira no mapa antes de salvar.`);
      },
      (err) =>
        setGps(err.code === err.PERMISSION_DENIED ? "Permissão de localização negada. Informe as coordenadas manualmente." : "Não foi possível obter a localização."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    const temGeo = f.lat.trim() !== "" || f.lng.trim() !== "";
    const lat = Number(f.lat.replace(",", "."));
    const lng = Number(f.lng.replace(",", "."));
    if (temGeo && (!Number.isFinite(lat) || !Number.isFinite(lng) || f.lat.trim() === "" || f.lng.trim() === "")) {
      return setMsg("Informe latitude e longitude (ou deixe as duas em branco).");
    }
    setEnviando(true);
    const body = {
      nome: f.nome,
      endereco: f.endereco,
      geo: temGeo ? { lat, lng } : null,
      timezone: f.timezone,
      diasOperacao: f.dias,
      horarioFuncionamento: f.h24 ? null : { inicio: f.inicio, fim: f.fim },
      shiftDateRule: f.shiftDateRule,
      instrucoes: f.instrucoes,
    };
    try {
      if (inicial) await api(`/v1/posts/${inicial.id}`, { method: "PATCH", body });
      else await api("/v1/posts", { method: "POST", body: { ...body, contractId: f.contractId }, idempotencyKey: key });
      onSaved();
    } catch (err) {
      setMsg(errorMessage(err));
    } finally {
      setEnviando(false);
    }
  }

  const toggleDia = (d: number) => setF((x) => ({ ...x, dias: x.dias.includes(d) ? x.dias.filter((y) => y !== d) : [...x.dias, d].sort() }));

  return (
    <form className="card stack" onSubmit={salvar}>
      <h2>{inicial ? "Editar posto" : "Novo posto"}</h2>
      {!inicial && (
        <label>
          Contrato
          <select value={f.contractId} onChange={(e) => setF({ ...f, contractId: e.target.value })} required>
            {contratos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
      )}
      <label>Nome do posto<input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required minLength={2} /></label>
      <label>Endereço<input value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} required minLength={3} /></label>

      <fieldset className="stack-sm">
        <legend>Localização do posto</legend>
        <div className="grid-2">
          <input aria-label="Latitude" placeholder="Latitude" inputMode="decimal" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} />
          <input aria-label="Longitude" placeholder="Longitude" inputMode="decimal" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} />
        </div>
        <button type="button" className="btn" onClick={usarLocalizacao}>📍 Usar minha localização atual</button>
        {gps && <p className="muted small">{gps}</p>}
        <p className="muted small">Ex.: -22.906800 e -43.172900. Use o botão no próprio posto. A localização serve de referência e não comprova sozinha a presença de alguém.</p>
      </fieldset>

      <label>
        Fuso horário
        <select value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>
          {FUSOS.map((z) => <option key={z.tz} value={z.tz}>{z.label}</option>)}
        </select>
      </label>

      <fieldset>
        <legend>Dias de operação</legend>
        <div className="dias">
          {DIAS_SEMANA.map((nome, d) => (
            <label key={d} className={`dia ${f.dias.includes(d) ? "dia-on" : ""}`}>
              <input type="checkbox" checked={f.dias.includes(d)} onChange={() => toggleDia(d)} />
              {nome}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="stack-sm">
        <legend>Horário de funcionamento</legend>
        <label className="check"><input type="checkbox" checked={f.h24} onChange={(e) => setF({ ...f, h24: e.target.checked })} /> 24 horas</label>
        {!f.h24 && (
          <div className="grid-2">
            <label>Início<input type="time" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} required /></label>
            <label>Fim<input type="time" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} required /></label>
          </div>
        )}
        {!f.h24 && f.fim <= f.inicio && <p className="muted small">O horário atravessa a meia-noite (termina no dia seguinte).</p>}
      </fieldset>

      <fieldset>
        <legend>Turnos que passam da meia-noite contam na…</legend>
        {SHIFT_DATE_RULES.map((r) => (
          <label key={r} className="check">
            <input type="radio" name="shiftDateRule" checked={f.shiftDateRule === r} onChange={() => setF({ ...f, shiftDateRule: r })} />
            {SHIFT_DATE_RULE_LABELS[r]}
          </label>
        ))}
      </fieldset>

      <label>Instruções para a equipe (opcional)<textarea rows={3} maxLength={2000} value={f.instrucoes} onChange={(e) => setF({ ...f, instrucoes: e.target.value })} /></label>
      {msg && <p className="alert alert-error">{msg}</p>}
      <button className="btn btn-primary btn-lg" disabled={enviando || f.dias.length === 0}>{enviando ? "Salvando…" : "Salvar"}</button>
    </form>
  );
}
