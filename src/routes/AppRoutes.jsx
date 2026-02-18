import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";

import Login from "../pages/Login";
import MainLayout from "../layouts/MainLayout";
import NotFound from "../pages/NotFound";

import Dashboard from "../dashboard/Dashboard";
import Atendimento from "../pages/Atendimento";
import Configuracoes from "../pages/Configuracoes";
import IA from "../pages/IA";
import NovoContato from "../pages/NovoContato";
import NovoGrupo from "../pages/NovoGrupo";
import NovaComunidade from "../pages/NovaComunidade";





export default function AppRoutes() {
  const { token } = useAuthStore();

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
          <Route path="/" element={<Navigate to="/atendimento" />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/atendimento" element={<Atendimento />} />
          <Route path="/chatbot" element={<Navigate to="/ia" replace />} />
          <Route path="/usuarios" element={<Navigate to="/configuracoes" replace />} />
          <Route path="/atendimento/novo-contato" element={<NovoContato />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/ia" element={<IA />} />
          <Route path="/atendimento/novo-grupo" element={<NovoGrupo />} />
          <Route path="/atendimento/nova-comunidade" element={<NovaComunidade />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}