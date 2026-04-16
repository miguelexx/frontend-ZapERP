import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { can } from "../auth/permissions";
import ProtectedRoute from "./ProtectedRoute";

import Login from "../pages/Login";
import MainLayout from "../layouts/MainLayout";
import NotFound from "../pages/NotFound";

import Dashboard from "../dashboard/Dashboard";
import Atendimento from "../pages/Atendimento";
import Configuracoes from "../pages/Configuracoes";
import IA from "../pages/IA";
import DashboardIA from "../pages/DashboardIA";
import NovoContato from "../pages/NovoContato";
import NovoGrupo from "../pages/NovoGrupo";
import NovaComunidade from "../pages/NovaComunidade";
import ConnectWhatsApp from "../pages/ConnectWhatsApp";
import Permissoes from "../pages/Permissoes";
import Mensagens from "../pages/Mensagens";
import Atalhos from "../pages/Atalhos";
import InternalChat from "../pages/InternalChat";

import CrmLayout from "../crm/CrmLayout";
import CrmDashboard from "../crm/pages/CrmDashboard";
import CrmKanban from "../crm/pages/CrmKanban";
import CrmAgenda from "../crm/pages/CrmAgenda";
import CrmLeads from "../crm/pages/CrmLeads";
import CrmLeadDetail from "../crm/pages/CrmLeadDetail";
import CrmPipelines from "../crm/pages/CrmPipelines";
import CrmStages from "../crm/pages/CrmStages";
import CrmOrigens from "../crm/pages/CrmOrigens";

export default function AppRoutes() {
  const { token, user } = useAuthStore();
  const canAccessConfig = can("config_acessar", user);
  const canAccessDashboard_ = can("dashboard_acessar", user);
  const canAccessChatbot_ = can("chatbot_acessar", user);
  const canAccessUsers = can("usuarios_acessar", user);

  if (!token) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Navigate to="/atendimento" replace />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute canAccess={canAccessDashboard_} redirectTo="/atendimento">
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/ia"
            element={
              <ProtectedRoute canAccess={canAccessDashboard_} redirectTo="/atendimento">
                <DashboardIA />
              </ProtectedRoute>
            }
          />
          <Route path="/atendimento" element={<Atendimento />} />
          <Route path="/chat-interno" element={<InternalChat />} />
          <Route path="/atendimento/novo-contato" element={<NovoContato />} />
          <Route path="/atendimento/novo-grupo" element={<NovoGrupo />} />
          <Route path="/atendimento/nova-comunidade" element={<NovaComunidade />} />
          <Route
            path="/chatbot"
            element={
              canAccessChatbot_ ? (
                <Navigate to="/ia" replace />
              ) : (
                <Navigate to="/atendimento" replace />
              )
            }
          />
          <Route
            path="/configuracoes"
            element={
              <ProtectedRoute canAccess={canAccessConfig} redirectTo="/atendimento">
                <Configuracoes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/configuracoes/whatsapp"
            element={
              <ProtectedRoute canAccess={canAccessConfig} redirectTo="/atendimento">
                <ConnectWhatsApp />
              </ProtectedRoute>
            }
          />
          <Route
            path="/configuracoes/chatbot"
            element={
              canAccessChatbot_ ? (
                <Navigate to="/ia?tab=chatbot" replace />
              ) : (
                <Navigate to="/atendimento" replace />
              )
            }
          />
          <Route
            path="/ia"
            element={
              <ProtectedRoute canAccess={canAccessChatbot_} redirectTo="/atendimento">
                <IA />
              </ProtectedRoute>
            }
          />
          <Route
            path="/usuarios"
            element={
              canAccessUsers ? (
                <Navigate to="/configuracoes?tab=usuarios" replace />
              ) : (
                <Navigate to="/atendimento" replace />
              )
            }
          />
          <Route
            path="/permissoes"
            element={
              canAccessUsers ? (
                <Permissoes />
              ) : (
                <Navigate to="/atendimento" replace />
              )
            }
          />
          <Route path="/campanhas" element={<Navigate to="/atendimento" replace />} />
          <Route path="/mensagens" element={<Mensagens />} />
          <Route path="/atalhos" element={<Atalhos />} />

          <Route path="/crm" element={<CrmLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<CrmDashboard />} />
            <Route path="kanban" element={<CrmKanban />} />
            <Route path="agenda" element={<CrmAgenda />} />
            <Route path="leads" element={<CrmLeads />} />
            <Route path="leads/:id" element={<CrmLeadDetail />} />
            <Route path="pipelines" element={<CrmPipelines />} />
            <Route path="stages" element={<CrmStages />} />
            <Route path="origens" element={<CrmOrigens />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}