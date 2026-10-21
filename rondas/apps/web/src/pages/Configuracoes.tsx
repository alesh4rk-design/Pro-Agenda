import { type FormEvent, useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";

export function ConfiguracoesPage({ systemName }: { systemName: string }) {
  const [nome, setNome] = useState(systemName);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setNome(systemName), [systemName]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMsg(null);
    try {
      const r = await api<{ alterado: boolean }>("/v1/config/sistema", { method: "PUT", body: { nomeSistema: nome } });
      setMsg({ tipo: "ok", texto: r.alterado ? "Nome atualizado. A alteração foi registrada na auditoria." : "Nenhuma alteração." });
    } catch (err) {
      setMsg({ tipo: "error", texto: errorMessage(err) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="stack">
      <h1>Configurações do sistema</h1>
      <form className="card stack" onSubmit={salvar}>
        <label>
          Nome do sistema
          <input value={nome} onChange={(e) => setNome(e.target.value)} minLength={2} maxLength={60} required />
        </label>
        <p className="muted small">Exibido na tela de login, no topo do aplicativo e no título da página.</p>
        {msg && <p className={`alert alert-${msg.tipo}`}>{msg.texto}</p>}
        <button className="btn btn-primary btn-lg" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </form>
    </section>
  );
}
