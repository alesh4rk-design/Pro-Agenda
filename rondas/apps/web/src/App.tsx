import type { Permission } from "@rondas/shared";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { Shell } from "./components/Shell";
import { useSystemName } from "./lib/hooks";
import { AcessoNegadoPage } from "./pages/AcessoNegado";
import { AuditoriaPage } from "./pages/Auditoria";
import { ConfiguracoesPage } from "./pages/Configuracoes";
import { LoginPage } from "./pages/Login";
import { PainelPage } from "./pages/Painel";
import { RecuperarSenhaPage } from "./pages/RecuperarSenha";
import { UsuariosPage } from "./pages/Usuarios";

/** Guarda de rota (conveniência de interface — a segurança real está no backend e nas regras). */
function Require({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  return can(permission) ? <>{children}</> : <Navigate to="/" replace />;
}

function Root() {
  const { state } = useAuth();
  const systemName = useSystemName();

  if (state.status === "carregando") {
    return <div className="splash" aria-busy="true">Carregando…</div>;
  }
  if (state.status === "anonimo") {
    return (
      <Routes>
        <Route path="/recuperar-senha" element={<RecuperarSenhaPage />} />
        <Route path="*" element={<LoginPage systemName={systemName} />} />
      </Routes>
    );
  }
  if (state.status === "negado") return <AcessoNegadoPage motivo={state.motivo} codigo={state.codigo} />;

  return (
    <Shell systemName={systemName}>
      <Routes>
        <Route path="/" element={<PainelPage />} />
        <Route path="/usuarios" element={<Require permission="usuario.gerir"><UsuariosPage /></Require>} />
        <Route path="/auditoria" element={<Require permission="auditoria.ver"><AuditoriaPage /></Require>} />
        <Route path="/configuracoes" element={<Require permission="sistema.configurar"><ConfiguracoesPage systemName={systemName} /></Require>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </BrowserRouter>
  );
}
