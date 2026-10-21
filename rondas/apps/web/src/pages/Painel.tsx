import { ROLE_LABELS } from "@rondas/shared";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, useMe } from "../auth/AuthProvider";
import { db } from "../lib/firebase";

export function PainelPage() {
  const me = useMe();
  const { can } = useAuth();
  const [empresa, setEmpresa] = useState<string | null>(null);
  const [postos, setPostos] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    if (me.companyId) {
      getDoc(doc(db, "companies", me.companyId))
        .then((s) => setEmpresa((s.data()?.nome as string) ?? me.companyId))
        .catch(() => setEmpresa(me.companyId));
    }
    Promise.all(
      me.postIds.slice(0, 10).map((id) =>
        getDoc(doc(db, "posts", id))
          .then((s) => ({ id, nome: (s.data()?.nome as string) ?? id }))
          .catch(() => ({ id, nome: id })),
      ),
    ).then(setPostos);
  }, [me.companyId, me.postIds]);

  return (
    <section className="stack">
      <div className="card">
        <p className="muted">Bem-vindo(a)</p>
        <h1>{me.nome || me.email}</h1>
        <p>
          <span className="badge">{ROLE_LABELS[me.role]}{me.funcao === "fiscal" ? " · fiscal" : ""}</span>
          {empresa && <span className="badge badge-soft">{empresa}</span>}
        </p>
      </div>

      {(me.role === "vigilante" || me.role === "supervisor") && (
        <div className="card">
          <h2>Seus postos</h2>
          {postos.length === 0 && me.contractIds.length === 0 ? (
            <p className="muted">Nenhum posto vinculado. Procure o administrador da empresa.</p>
          ) : (
            <ul className="list">
              {postos.map((p) => <li key={p.id}>{p.nome}</li>)}
              {me.contractIds.length > 0 && <li className="muted">+ todos os postos de {me.contractIds.length} contrato(s)</li>}
            </ul>
          )}
          <p className="muted small">
            A programação e a execução de rondas serão liberadas nas próximas etapas do sistema.
          </p>
        </div>
      )}

      {(can("usuario.gerir") || can("sistema.configurar")) && (
        <div className="grid-actions">
          {can("usuario.gerir") && <Link className="btn btn-primary btn-lg" to="/usuarios">Gerenciar usuários</Link>}
          {can("auditoria.ver") && <Link className="btn btn-lg" to="/auditoria">Ver auditoria</Link>}
          {can("sistema.configurar") && <Link className="btn btn-lg" to="/configuracoes">Configurar sistema</Link>}
        </div>
      )}
    </section>
  );
}
