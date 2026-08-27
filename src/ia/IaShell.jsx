import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { usePermissoesStore } from "../auth/permissoesStore";
import { canAcessarConfiguracoes } from "../auth/permissions";
import Breadcrumb from "../components/layout/Breadcrumb";
import { SectionLoading } from "./shared/SectionFeedback";
import "../components/layout/breadcrumb.css";
import "../components/feedback/skeleton.css";
import "../components/ui/switch.css";
import "../pages/IA.css";

const TriagemSection = lazy(() => import("./triagem/TriagemSectionController"));
const RespostasSection = lazy(() => import("./respostas/RespostasAutomaticasSectionController"));
const IaSettingsSection = lazy(() => import("./configuracoes/IaSettingsSectionController"));
const AutomacoesSection = lazy(() => import("./automacoes/AutomacoesSectionController"));
const AlertasSection = lazy(() => import("./alertas/AlertasAtendimentoSection"));
const LogsSection = lazy(() => import("./logs/LogsSection"));

export const IA_TABS = [
  { id: "chatbot", label: "Chatbot de Triagem" },
  { id: "respostas", label: "Respostas automáticas" },
  { id: "ia", label: "IA (sugestões)" },
  { id: "automacoes", label: "Automações" },
  { id: "alertas", label: "Alertas de Atendimento" },
  { id: "logs", label: "Logs do bot" },
];

function resolveTab(value) {
  if (value === "bot") return "chatbot";
  return IA_TABS.some((tab) => tab.id === value) ? value : "chatbot";
}

export default function IaShell() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  usePermissoesStore((state) => state.permissoes);
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(() => resolveTab(tabFromUrl));
  const canAccess = canAcessarConfiguracoes(user);
  const companyKey = user?.empresa_id ?? user?.company_id ?? user?.empresaId ?? user?.companyId ?? "";

  useEffect(() => {
    setActiveTab(resolveTab(tabFromUrl));
  }, [tabFromUrl]);

  useEffect(() => {
    if (!canAccess) navigate("/atendimento", { replace: true });
  }, [canAccess, navigate]);

  if (!canAccess) return null;

  return (
    <div className="ia-wrap">
      <header className="ia-header">
        <Breadcrumb items={[{ label: "Configurações", to: "/configuracoes" }, { label: "IA / Chatbot" }]} />
        <h1 className="ia-title">IA / Bot / Automação</h1>
        <p className="ia-subtitle">Configure automações. Se desligado → atendimento 100% humano.</p>
      </header>

      <nav className="ia-tabs">
        {IA_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`ia-tab ${activeTab === tab.id ? "ia-tab--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="ia-content">
        <Suspense fallback={<SectionLoading />}>
          {activeTab === "chatbot" ? <TriagemSection companyKey={companyKey} /> : null}
          {activeTab === "respostas" ? <RespostasSection companyKey={companyKey} /> : null}
          {activeTab === "ia" ? <IaSettingsSection companyKey={companyKey} /> : null}
          {activeTab === "automacoes" ? <AutomacoesSection companyKey={companyKey} /> : null}
          {activeTab === "alertas" ? <AlertasSection companyKey={companyKey} /> : null}
          {activeTab === "logs" ? <LogsSection companyKey={companyKey} /> : null}
        </Suspense>
      </div>
    </div>
  );
}
