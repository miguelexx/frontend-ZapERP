import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { canAcessarConfiguracoes } from "../auth/permissions";
import ZapERPLogo from "../brand/ZapERPLogo";
import GlobalNotifications from "../notifications/GlobalNotifications";

export default function MainLayout() {
  const navigate = useNavigate();
  const { logout, user } = useAuthStore();
  const isAdmin = canAcessarConfiguracoes(user);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-layout app-layout--crm">
      <GlobalNotifications />
      <aside className="sidebar sidebar--compact" aria-label="Menu">
        <div className="sidebar-brand-compact" title="ZapERP — Atendimento inteligente">
          <ZapERPLogo variant="compact" size="sm" title="ZapERP" />
        </div>
        <nav className="sidebar-nav sidebar-nav--compact">
          <NavItem to="/dashboard" label="Dashboard" icon={<IconDashboard />} />
          <NavItem to="/dashboard/ia" label="IA" icon={<IconBot />} />
          <NavItem to="/atendimento" label="Atendimento" icon={<IconAtendimento />} />
          {isAdmin && (
            <>
              <NavItem to="/configuracoes" label="Configurações" icon={<IconConfig />} />
              <NavItem to="/ia" label="IA / Bot" icon={<IconIASparkle />} />
            </>
          )}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-footer sidebar-footer--compact">
          {isAdmin && <span className="sidebar-badge-compact" title="Administrador">A</span>}
          <button type="button" className="sidebar-logout" onClick={handleLogout} title="Sair" aria-label="Sair">
            <IconLogout />
          </button>
        </div>
      </aside>

      <main className="main-content main-content--crm">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, label, icon }) {
  return (
    <NavLink to={to} className="sidebar-nav-item" title={label}>
      <span className="sidebar-nav-icon">{icon}</span>
      <span className="sidebar-nav-label">{label}</span>
    </NavLink>
  );
}

function IconDashboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

function IconAtendimento() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

function IconIASparkle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M19 14l1.2 3.6L24 19l-3.6 1.2L19 24l-1.2-3.6L14 19l3.6-1.2L19 14z" />
      <path d="M5 17l.8 2.4L8 20l-2.4.8L5 23l-.8-2.4L2 20l2.4-.8L5 17z" />
    </svg>
  );
}

function IconConfig() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconBot() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <circle cx="9" cy="16" r="1" fill="currentColor" />
      <circle cx="15" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
