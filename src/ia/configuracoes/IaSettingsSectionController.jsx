import IaSettingsView from "./IaSettingsSection";
import { useIaConfigSection } from "../shared/useIaConfigSection";
import { SectionLoading } from "../shared/SectionFeedback";

export default function IaSettingsSectionController({ companyKey }) {
  const state = useIaConfigSection("ia", companyKey);
  if (state.loading) return <SectionLoading />;
  return (
    <>
      {state.error ? <div className="ia-error-banner" role="alert">{state.error}</div> : null}
      <IaSettingsView config={state.config} onSave={state.save} saving={state.saving} />
    </>
  );
}
