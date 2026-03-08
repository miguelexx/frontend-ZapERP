import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import {
  canAcessarConfiguracoes,
  canAcessarDashboard,
  canAcessarChatbot,
  canAcessarUsuarios,
} from "../auth/permissions";
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

export default function AppRoutes() {
  const { token, user } = useAuthStore();
  const canAccessConfig = canAcessarConfiguracoes(user);
  const canAccessDashboard_ = canAcessarDashboard(user);
  const canAccessChatbot_ = canAcessarChatbot(user);
  const canAccessUsers = canAcessarUsuarios(user);

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
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}