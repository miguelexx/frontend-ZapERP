import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import "./crm.css";
import { useCrmSocketEvents } from "./useCrmSocket";
import { useNotificationStore } from "../notifications/notificationStore";

const TABS = [
  { to: "/crm/dashboard", label: "Dashboard" },
  { to: "/crm/kanban", label: "Kanban" },
  { to: "/crm/agenda", label: "Agenda" },
  { to: "/crm/leads", label: "Leads" },
  { to: "/crm/pipelines", label: "Pipelines" },
  { to: "/crm/stages", label: "Estágios" },
  { to: "/crm/origens", label: "Origens" },
];

export default function CrmLayout() {
  const location = useLocation();
  useCrmSocketEvents(true);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const g = q.get("crm_google");
    if (g === "connected") {
      useNotificationStore.getState().showToast({
        type: "success",
        title: "Google Calendar",
        message: "Conta conectada com sucesso.",
      });
      window.history.replaceState({}, "", `${location.pathname}${location.hash || ""}`);
    } else if (g === "error" || q.get("crm_google_error")) {
      useNotificationStore.getState().showToast({
        type: "error",
        title: "Google Calendar",
        message: "Não foi possível concluir a conexão. Tente novamente.",
      });
      window.history.replaceState({}, "", `${location.pathname}${location.hash || ""}`);
    }
  }, [location]);

  return (
    <div className="crm-wrap">
      <header className="crm-header">
        <div>
          <h1 className="crm-title">CRM</h1>
          <p className="crm-sub">
            Funil de vendas, leads e agenda integrados ao ZapERP. Dados filtrados pela sua empresa (JWT).
          </p>
        </div>
      </header>

      <nav className="crm-tabs" aria-label="Seções do CRM">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === "/crm/dashboard"}
            className={({ isActive }) => `crm-tab ${isActive ? "crm-tab--active" : ""}`}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
