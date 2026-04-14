import IaAnaliticaAlerts from "./IaAnaliticaAlerts.jsx";
import IaPeriodoFonte from "./IaPeriodoFonte.jsx";
import IaCandidatosPicker from "./IaCandidatosPicker.jsx";
import IaEvidenciasChips from "./IaEvidenciasChips.jsx";
import { isPlainObject, getAnaliticaUiFromData, analiticaUiHasBarContent } from "./aiAskTypes.js";
import { resolveAlertasParaUi } from "./collectAnaliticaAlertas.js";
import { extractEvidenciasFromData } from "./extractEvidencias.js";

function analiticaPanelHasContent(data, intentFromRoot) {
  if (data == null) return false;
  if (Array.isArray(data)) return extractEvidenciasFromData({ evidencias: data }).length > 0;
  if (!isPlainObject(data)) return false;
  if (resolveAlertasParaUi(data).length > 0) return true;
  const ui = getAnaliticaUiFromData(data);
  if (analiticaUiHasBarContent(ui)) return true;
  if (extractEvidenciasFromData(data).length > 0) return true;
  if (intentFromRoot != null && String(intentFromRoot).trim()) return true;
  return false;
}

/**
 * Painel abaixo da resposta: alertas, período/fonte/intent em `analitica_ui`, desambiguação e evidências.
 * @param {{ data: unknown, intentFromRoot?: string | null, onCandidatoPick: (s: string) => void, pickDisabled?: boolean }} props
 */
export default function IaAnaliticaPanel({ data, intentFromRoot, onCandidatoPick, pickDisabled }) {
  if (!analiticaPanelHasContent(data, intentFromRoot)) return null;
  if (Array.isArray(data)) {
    return (
      <div className="ia-analitica-panel">
        <IaEvidenciasChips data={{ evidencias: data }} />
      </div>
    );
  }
  if (!isPlainObject(data)) return null;

  return (
    <div className="ia-analitica-panel">
      <IaAnaliticaAlerts data={data} />
      <IaPeriodoFonte data={data} intentFromRoot={intentFromRoot} />
      <IaCandidatosPicker data={data} onPick={onCandidatoPick} disabled={pickDisabled} />
      <IaEvidenciasChips data={data} />
    </div>
  );
}
