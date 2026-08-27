import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import {
  canAcessarConfiguracoes,
  canAcessarUsuarios,
  canGerenciarRespostasSalvas,
} from "../auth/permissions";
import Breadcrumb from "../components/layout/Breadcrumb";
import { SkeletonGrid } from "../components/feedback/Skeleton";
import "../components/layout/breadcrumb.css";
import "../components/feedback/skeleton.css";
import "../components/ui/switch.css";
import "../pages/IA.css";
import "../pages/Configuracoes.css";

const GeralSection = lazy(() => import("./sections/GeralSection"));
const UsuariosSection = lazy(() => import("./sections/UsuariosSection"));
const PermissoesSection = lazy(() => import("./sections/PermissoesSection"));
const DepartamentosSection = lazy(() => import("./sections/DepartamentosSection"));
const TagsSection = lazy(() => import("./sections/TagsSection"));
const RespostasSection = lazy(() => import("./sections/RespostasSection"));
const LimitesSection = lazy(() => import("./sections/LimitesSection"));
const BotSection = lazy(() => import("./sections/BotSection"));
const ClientesSection = lazy(() => import("./sections/ClientesSection"));
const AuditoriaSection = lazy(() => import("./sections/AuditoriaSection"));

const TABS = [
  { id: "geral", label: "Geral" },
  { id: "usuarios", label: "Usuários" },
  { id: "permissoes", label: "Permissões" },
  { id: "departamentos", label: "Departamentos" },
  { id: "tags", label: "Tags" },
  { id: "respostas", label: "Respostas salvas" },
  { id: "limites", label: "Limites de Atendimento" },
  { id: "bot", label: "ChatBot / IA" },
  { id: "clientes", label: "Clientes" },
  { id: "auditoria", label: "Auditoria" },
];

function SectionFallback() {
  return <SkeletonGrid count={4} />;
}

function SectionContent({ tab, usuarioIdPermissoes, onUsuarioIdPermissoesChange, onEditarPermissoes }) {
  if (tab === "geral") return <GeralSection />;
  if (tab === "usuarios") return <UsuariosSection onEditarPermissoes={onEditarPermissoes} />;
  if (tab === "permissoes") {
    return (
      <PermissoesSection
        usuarioIdInicial={usuarioIdPermissoes}
        onUsuarioIdChange={onUsuarioIdPermissoesChange}
      />
    );
  }
  if (tab === "departamentos") return <DepartamentosSection />;
  if (tab === "tags") return <TagsSection />;
  if (tab === "respostas") return <RespostasSection />;
  if (tab === "limites") return <LimitesSection />;
  if (tab === "bot") return <BotSection />;
  if (tab === "clientes") return <ClientesSection />;
  if (tab === "auditoria") return <AuditoriaSection />;
  return null;
}

export default function ConfiguracoesShell() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const canAccessConfig = canAcessarConfiguracoes(user);
  const canAccessUsers = canAcessarUsuarios(user);
  const canManageRespostas = canGerenciarRespostasSalvas(user);
  const respostasOnlyMode = !canAccessConfig && canManageRespostas;

  const visibleTabs = useMemo(() => {
    if (respostasOnlyMode) return TABS.filter((item) => item.id === "respostas");
    const isAdmin = String(user?.perfil || "").toLowerCase() === "admin";
    const roleTabs = isAdmin ? TABS : TABS.filter((item) => item.id !== "limites");
    return canAccessUsers
      ? roleTabs
      : roleTabs.filter((item) => item.id !== "usuarios" && item.id !== "permissoes");
  }, [canAccessUsers, respostasOnlyMode, user?.perfil]);

  const requestedTab = searchParams.get("tab");
  const requestedTabIsVisible = visibleTabs.some((item) => item.id === requestedTab);
  const defaultTab = respostasOnlyMode ? "respostas" : "geral";
  const normalizedTab = requestedTabIsVisible ? requestedTab : defaultTab;
  const [tab, setTab] = useState(normalizedTab);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([normalizedTab]));
  const [usuarioIdPermissoes, setUsuarioIdPermissoes] = useState("");

  useEffect(() => {
    if (!canAccessConfig && !canManageRespostas) {
      navigate("/atendimento", { replace: true });
    }
  }, [canAccessConfig, canManageRespostas, navigate]);

  useEffect(() => {
    if (!canAccessConfig && !canManageRespostas) return;
    setTab(normalizedTab);
    setVisitedTabs((current) => {
      if (current.has(normalizedTab)) return current;
      const next = new Set(current);
      next.add(normalizedTab);
      return next;
    });
    if (requestedTab !== normalizedTab) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("tab", normalizedTab);
      navigate({ search: `?${nextParams.toString()}` }, { replace: true });
    }
  }, [canAccessConfig, canManageRespostas, navigate, normalizedTab, requestedTab, searchParams]);

  const setTabAndUrl = useCallback((nextTab) => {
    if (!visibleTabs.some((item) => item.id === nextTab)) return;
    setTab(nextTab);
    setVisitedTabs((current) => {
      if (current.has(nextTab)) return current;
      const next = new Set(current);
      next.add(nextTab);
      return next;
    });
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", nextTab);
    navigate({ search: `?${nextParams.toString()}` }, { replace: true });
  }, [navigate, searchParams, visibleTabs]);

  const handleEditarPermissoes = useCallback((selectedUser) => {
    setUsuarioIdPermissoes(String(selectedUser.id));
    setTabAndUrl("permissoes");
  }, [setTabAndUrl]);

  if (!canAccessConfig && !canManageRespostas) return null;

  return (
    <div className="ia-wrap config-wrap">
      <header className="ia-header">
        <Breadcrumb items={[{ label: "Configurações" }]} />
        <h1 className="ia-title">{respostasOnlyMode ? "Respostas salvas" : "Configurações"}</h1>
        <p className="ia-subtitle">
          {respostasOnlyMode
            ? "Cadastre modelos pessoais para usar no atendimento com o atalho /"
            : "Central de administração — configure 100% do sistema"}
        </p>
      </header>

      <nav className="ia-tabs">
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ia-tab ${tab === item.id ? "ia-tab--active" : ""}`}
            onClick={() => setTabAndUrl(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="ia-content">
        {[...visitedTabs].map((visitedTab) => (
          <div key={visitedTab} hidden={visitedTab !== tab}>
            <Suspense fallback={<SectionFallback />}>
              <SectionContent
                tab={visitedTab}
                usuarioIdPermissoes={usuarioIdPermissoes}
                onUsuarioIdPermissoesChange={setUsuarioIdPermissoes}
                onEditarPermissoes={handleEditarPermissoes}
              />
            </Suspense>
          </div>
        ))}
      </div>
    </div>
  );
}
