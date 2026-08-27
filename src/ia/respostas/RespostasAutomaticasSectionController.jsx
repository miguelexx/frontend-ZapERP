import RespostasAutomaticasView from "./RespostasAutomaticasSection";
import { useRespostasAutomaticas } from "./useRespostasAutomaticas";
import { SectionError, SectionLoading } from "../shared/SectionFeedback";

export default function RespostasAutomaticasSectionController({ companyKey }) {
  const state = useRespostasAutomaticas(companyKey);
  if (state.loading) return <SectionLoading />;
  if (state.error) return <SectionError message={state.error} onRetry={state.reload} />;
  return (
    <RespostasAutomaticasView
      regras={state.regras}
      formRegra={state.formRegra}
      setFormRegra={state.setFormRegra}
      departamentos={state.departamentos}
      tags={state.tags}
      onAdd={state.add}
      onDelete={state.remove}
    />
  );
}
