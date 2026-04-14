import { getAnaliticaUiFromData } from "./aiAskTypes.js";

/**
 * @param {{ data: unknown, intentFromRoot?: string | null }} props
 */
export default function IaPeriodoFonte({ data, intentFromRoot }) {
  const ui = getAnaliticaUiFromData(data);
  const dias = ui?.periodo_dias_efetivo;
  const intent = String(ui?.intent || intentFromRoot || "").trim();
  const fonte = ui?.fonte_dados;

  const showPeriodo = ui != null && dias != null && Number.isFinite(Number(dias));
  const showFonte = fonte === "mensagens_whatsapp" || fonte === "internal_messages";
  const showIntent = Boolean(intent);

  if (!showPeriodo && !showFonte && !showIntent) return null;

  let periodoLabel = "";
  if (showPeriodo && ui) {
    periodoLabel = `Últimos ${Number(dias)} dias`;
    if (ui.periodo_definido_na_requisicao) {
      periodoLabel += " · definido no pedido";
    } else if (ui.periodo_padrao_usado) {
      periodoLabel += " · período padrão";
    }
  }

  const fonteLabel =
    fonte === "mensagens_whatsapp"
      ? "Fonte: mensagens WhatsApp"
      : fonte === "internal_messages"
        ? "Fonte: chat interno"
        : null;

  return (
    <div className="ia-meta-bar" aria-label="Contexto da resposta">
      {showIntent ? (
        <span className="ia-meta-pill ia-meta-pill--intent" title="Intent classificado">
          {intent}
        </span>
      ) : null}
      {showPeriodo ? (
        <span className="ia-meta-pill ia-meta-pill--periodo" title="Janela temporal da consulta">
          {periodoLabel}
        </span>
      ) : null}
      {showFonte && fonteLabel ? (
        <span className="ia-meta-pill ia-meta-pill--fonte" title="Origem dos trechos">
          {fonteLabel}
        </span>
      ) : null}
    </div>
  );
}
