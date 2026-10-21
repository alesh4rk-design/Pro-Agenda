import { useAuth } from "../auth/AuthProvider";

export function AcessoNegadoPage({ motivo, codigo }: { motivo: string; codigo: string }) {
  const { logout, reload } = useAuth();
  const transitorio = codigo === "OFFLINE" || codigo === "REDE" || codigo === "ERRO_INTERNO";
  return (
    <main className="auth-page">
      <div className="card auth-card">
        <h1>{transitorio ? "Não foi possível conectar" : "Acesso não liberado"}</h1>
        <p className={`alert ${transitorio ? "alert-warn" : "alert-error"}`}>{motivo}</p>
        {transitorio && <button className="btn btn-primary btn-lg" onClick={() => void reload()}>Tentar novamente</button>}
        <button className="btn btn-ghost btn-lg" onClick={() => void logout()}>Sair</button>
      </div>
    </main>
  );
}
