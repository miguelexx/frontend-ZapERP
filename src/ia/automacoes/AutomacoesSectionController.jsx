import AutomacoesView from "./AutomacoesSection";
import { useIaConfigSection } from "../shared/useIaConfigSection";
import { SectionLoading } from "../shared/SectionFeedback";

export default function AutomacoesSectionController({ companyKey }) {
  const state = useIaConfigSection("automacoes", companyKey);
  if (state.loading) return <SectionLoading />;
  return (
    <>
      {state.error ? <div className="ia-error-banner" role="alert">{state.error}</div> : null}
      <AutomacoesView config={state.config} onSave={state.save} saving={state.saving} />
    </>
  );
}
