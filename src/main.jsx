import React from "react";
import ReactDOM from "react-dom/client";
import AppRoutes from "./routes/AppRoutes";
import { useAuthStore } from "./auth/authStore";
import "./styles/app.css";
import "./styles/theme.css";

// Restaura sessão do localStorage ao carregar (evita logout em refresh)
useAuthStore.getState().restore();

function applyTheme() {
  const theme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", theme);
}

applyTheme(); // 🔥 aplica ANTES do React (resolve bug de atualização tardia)

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppRoutes />
  </React.StrictMode>
);
