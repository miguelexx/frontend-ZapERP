import { getAnaliticaUiFromData, isPlainObject } from "./aiAskTypes.js";

/** @param {unknown} data */
export function getRecorteTemporalFromData(data) {
  if (!isPlainObject(data)) return null;
  if (isPlainObject(data.recorte_temporal)) return data.recorte_temporal;
  const ui = getAnaliticaUiFromData(data);
  if (ui && isPlainObject(ui.recorte_mensagens)) return ui.recorte_mensagens;
  return null;
}

/**
 * Cabeçalho de período real (sempre acima do markdown da resposta).
 * @param {unknown} data
 */
export function getPeriodoCabecalhoText(data) {
  if (!isPlainObject(data)) return "";
  const ui = getAnaliticaUiFromData(data);
  const direct = ui?.texto_cabecalho_periodo;
  if (direct != null && String(direct).trim()) return String(direct).trim();
  const r = getRecorteTemporalFromData(data);
  if (r?.texto_cabecalho_ui != null && String(r.texto_cabecalho_ui).trim()) return String(r.texto_cabecalho_ui).trim();
  return "";
}

/** @param {unknown} data */
export function getOrientacaoResumoIa(data) {
  if (!isPlainObject(data)) return "";
  const o = data.orientacao_resumo_ia;
  return o != null && String(o).trim() ? String(o).trim() : "";
}
