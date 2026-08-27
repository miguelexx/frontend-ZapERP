import TriagemView from "./TriagemSection";
import { useTriagemAuxData } from "./useTriagemAuxData";
import { useIaConfigSection } from "../shared/useIaConfigSection";
import { SectionLoading } from "../shared/SectionFeedback";

export default function TriagemSectionController({ companyKey }) {
  const triagem = useIaConfigSection("chatbot_triage", companyKey);
  const adminAlert = useIaConfigSection("admin_atendimento_alerta", companyKey);
  const auxiliary = useTriagemAuxData(companyKey);
  const loading = triagem.loading || adminAlert.loading || auxiliary.loading;
  if (loading) return <SectionLoading />;
  const error = triagem.error || adminAlert.error || auxiliary.error;
  return (
    <>
      {error ? <div className="ia-error-banner" role="alert">{error}</div> : null}
      <TriagemView
        config={triagem.config}
        adminAtendimentoAlerta={adminAlert.config}
        departamentos={auxiliary.departamentos}
        logs={auxiliary.logs}
        onSave={triagem.save}
        onSaveAdminAlert={adminAlert.save}
        onRefreshLogs={auxiliary.reloadLogs}
        saving={triagem.saving || adminAlert.saving}
      />
    </>
  );
}
