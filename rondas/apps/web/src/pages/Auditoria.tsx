import { ROLE_LABELS, type Role } from "@rondas/shared";
import { type QueryDocumentSnapshot, Timestamp, collection, getDocs, limit, orderBy, query, startAfter } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../lib/firebase";

const PAGE = 30;
const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" });

interface Log {
  id: string;
  at: Timestamp;
  action: string;
  actorUid: string;
  actorRole: Role;
  targetType: string;
  targetId: string;
  companyId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  motivo?: string;
}

export function AuditoriaPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [fim, setFim] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar(after: QueryDocumentSnapshot | null) {
    try {
      const snap = await getDocs(
        query(collection(db, "auditLogs"), orderBy("at", "desc"), ...(after ? [startAfter(after)] : []), limit(PAGE)),
      );
      setLogs((l) => [...(after ? l : []), ...snap.docs.map((d) => d.data() as Log)]);
      setCursor(snap.docs[snap.docs.length - 1] ?? null);
      setFim(snap.docs.length < PAGE);
    } catch {
      setErro("Não foi possível carregar a auditoria.");
    }
  }
  useEffect(() => void carregar(null), []);

  return (
    <section className="stack">
      <h1>Auditoria</h1>
      <p className="muted small">Registros imutáveis de ações administrativas. Horários em America/Sao_Paulo (horário do servidor).</p>
      {erro && <p className="alert alert-error">{erro}</p>}
      <ul className="cards">
        {logs.map((l) => (
          <li key={l.id} className="card">
            <div className="row-between">
              <strong>{l.action}</strong>
              <span className="muted small">{l.at instanceof Timestamp ? fmt.format(l.at.toDate()) : ""}</span>
            </div>
            <div className="small">
              Por <code>{l.actorUid}</code> ({ROLE_LABELS[l.actorRole] ?? l.actorRole}) · {l.targetType} <code>{l.targetId}</code>
              {l.companyId && <> · empresa <code>{l.companyId}</code></>}
            </div>
            {l.motivo && <div className="small">Motivo: {l.motivo}</div>}
            {(l.before || l.after) && (
              <details>
                <summary className="small">Alterações</summary>
                <pre className="diff">{JSON.stringify({ antes: l.before, depois: l.after }, null, 2)}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
      {!fim && logs.length > 0 && <button className="btn" onClick={() => void carregar(cursor)}>Carregar mais</button>}
    </section>
  );
}
