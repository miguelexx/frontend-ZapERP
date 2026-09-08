import { createPortal } from "react-dom";
import { IconClose } from "../conversaViewIcons";

export default function SendPollModal({
  open,
  title,
  options,
  multi,
  sending,
  maxOptions = 12,
  onClose,
  onTitleChange,
  onOptionChange,
  onAddOption,
  onRemoveOption,
  onMultiChange,
  onSend,
}) {
  if (!open) return null;

  return createPortal(
    <div
      className="wa-modalOverlay"
      role="dialog"
      aria-label="Enviar enquete"
      onMouseDown={() => {
        if (sending) return;
        onClose?.();
      }}
    >
      <div className="wa-modal wa-pollModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wa-modal-head">
          <div className="wa-modal-title">Enviar enquete</div>
          <button type="button" className="wa-iconBtn" onClick={() => !sending && onClose?.()} title="Fechar" aria-label="Fechar">
            <IconClose />
          </button>
        </div>
        <div className="wa-modal-body">
          <p className="wa-modal-row wa-modal-row--hint">
            O cliente vota no WhatsApp. A resposta chega nesta conversa como texto (útil para triagem).
          </p>
          <div className="wa-modal-row">
            <span className="wa-modal-label">Pergunta</span>
            <input
              className="wa-input"
              value={title}
              onChange={(e) => onTitleChange?.(e.target.value)}
              placeholder="Ex.: Qual setor você precisa?"
              disabled={sending}
              autoFocus
            />
          </div>
          <div className="wa-modal-row">
            <span className="wa-modal-label">Opções</span>
            <div className="wa-pollModal-options">
              {(options || []).map((opt, idx) => (
                <div key={idx} className="wa-pollModal-optionRow">
                  <input
                    className="wa-input"
                    value={opt}
                    onChange={(e) => onOptionChange?.(idx, e.target.value)}
                    placeholder={`Opção ${idx + 1}`}
                    disabled={sending}
                  />
                  {(options || []).length > 2 ? (
                    <button
                      type="button"
                      className="wa-iconBtn"
                      disabled={sending}
                      onClick={() => onRemoveOption?.(idx)}
                      title="Remover"
                      aria-label={`Remover opção ${idx + 1}`}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {(options || []).length < maxOptions ? (
              <button type="button" className="wa-btn" disabled={sending} onClick={() => onAddOption?.()}>
                + Opção
              </button>
            ) : null}
          </div>
          <label className="wa-pollModal-multi">
            <input
              type="checkbox"
              checked={!!multi}
              disabled={sending}
              onChange={(e) => onMultiChange?.(e.target.checked)}
            />
            <span>Permitir várias respostas</span>
          </label>
          <div className="wa-modal-row wa-modal-row--actions">
            <button type="button" className="wa-btn" disabled={sending} onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="wa-btn wa-btn-primary" disabled={sending} onClick={onSend}>
              {sending ? "Enviando…" : "Enviar enquete"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
