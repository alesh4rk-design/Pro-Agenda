import { ROLE_LABELS, type Permission } from "@rondas/shared";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth, useMe } from "../auth/AuthProvider";
import { useOnline } from "../lib/hooks";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  permission?: Permission;
}

// Somente telas já implementadas aparecem no menu (sem botões que não funcionam).
const NAV: NavItem[] = [
  { to: "/", label: "Painel", icon: "◉" },
  { to: "/usuarios", label: "Acessos", icon: "👥", permission: "usuario.gerir" },
  { to: "/auditoria", label: "Auditoria", icon: "🧾", permission: "auditoria.ver" },
  { to: "/configuracoes", label: "Sistema", icon: "⚙", permission: "sistema.configurar" },
];

export function Shell({ systemName, children }: { systemName: string; children: ReactNode }) {
  const { can, logout } = useAuth();
  const me = useMe();
  const online = useOnline();
  const items = NAV.filter((i) => !i.permission || can(i.permission));

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>{systemName}</span>
        </div>
        <span className={`net ${online ? "net-on" : "net-off"}`} role="status">
          {online ? "Online" : "Offline"}
        </span>
      </header>
      {!online && (
        <div className="offline-banner" role="alert">
          Sem conexão. Você vê os dados já carregados; alterações não serão enviadas até a conexão voltar.
        </div>
      )}
      <div className="layout">
        <nav className="sidenav" aria-label="Menu principal">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === "/"} className="navlink">
              <span aria-hidden>{i.icon}</span> {i.label}
            </NavLink>
          ))}
          <div className="sidenav-user">
            <strong>{me.nome || me.login || me.email}</strong>
            <span className="muted">{ROLE_LABELS[me.role]}{me.funcao === "fiscal" ? " (fiscal)" : ""}</span>
            <button className="btn btn-ghost" onClick={() => void logout()}>Sair</button>
          </div>
        </nav>
        <main className="content">{children}</main>
      </div>
      <nav className="bottomnav" aria-label="Menu inferior">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === "/"} className="bottomlink">
            <span aria-hidden className="bottomicon">{i.icon}</span>
            {i.label}
          </NavLink>
        ))}
        <button className="bottomlink" onClick={() => void logout()}>
          <span aria-hidden className="bottomicon">⎋</span>Sair
        </button>
      </nav>
    </div>
  );
}
