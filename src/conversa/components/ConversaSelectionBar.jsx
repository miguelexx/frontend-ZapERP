import { memo } from "react";
import { IconClose, IconForward } from "../conversaViewIcons";
import { IconTrash, IconCopy } from "@tabler/icons-react";

/**
 * Barra de seleção estilo WhatsApp: fina, fixada no rodapé (overlay do .wa-shell).
 * Esquerda: fechar (X) + contagem. Direita: ações em ícone (encaminhar / apagar).
 * Estado, limites e handlers permanecem no ConversaView.
 */
function ConversaSelectionBar({
  open,
  forwardSelectIntent,
  compactMessageUx,
  selectedCount,
  forwardSending,
  deleteBusy = false,
  onDismiss,
  onForward,
  onDelete,
  onCopy,
}) {
  if (!open) return null;

  const hasSelection = selectedCount > 0;
  const forwardDisabled = !hasSelection || forwardSending;
  const deleteDisabled = !hasSelection || deleteBusy;

  return (
    <div
      className={`wa-selectBar${forwardSelectIntent ? " wa-selectBar--forwardIntent" : ""}${
        compactMessageUx ? " wa-selectBar--compactUx" : ""
      }`}
      role="region"
      aria-label="Modo seleção"
    >
      <div className="wa-selectBar-left">
        <button
          type="button"
          className="wa-selectBar-iconBtn wa-selectBar-close"
          onClick={onDismiss}
          title="Cancelar seleção"
          aria-label="Cancelar seleção"
        >
          <IconClose />
        </button>
        <span className="wa-selectBar-countBadge" aria-live="polite" aria-atomic="true">
          {selectedCount} selecionada{selectedCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="wa-selectBar-actions">
        {/* Copiar várias (26/11/2026): trecho da conversa com data/hora e autor, como no WhatsApp. */}
        {!forwardSelectIntent && onCopy ? (
          <button
            type="button"
            className="wa-selectBar-iconBtn"
            onClick={onCopy}
            disabled={!hasSelection}
            title="Copiar selecionadas"
            aria-label="Copiar mensagens selecionadas"
          >
            <IconCopy size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ) : null}
        {!forwardSelectIntent ? (
          <button
            type="button"
            className="wa-selectBar-iconBtn wa-selectBar-iconBtn--danger"
            onClick={onDelete}
            disabled={deleteDisabled}
            aria-busy={deleteBusy ? "true" : undefined}
            title={deleteBusy ? "Apagando…" : "Apagar selecionadas"}
            aria-label={deleteBusy ? "Apagando mensagens selecionadas" : "Apagar mensagens selecionadas"}
          >
            <IconTrash size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="wa-selectBar-iconBtn wa-selectBar-iconBtn--forward"
          onClick={onForward}
          disabled={forwardDisabled}
          title="Encaminhar selecionadas"
          aria-label="Encaminhar mensagens selecionadas"
        >
          <IconForward />
        </button>
      </div>
    </div>
  );
}

export default memo(ConversaSelectionBar);
