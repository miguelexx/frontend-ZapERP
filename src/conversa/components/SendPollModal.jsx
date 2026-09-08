import { createPortal } from "react-dom";
import { IconChartBar } from "@tabler/icons-react";
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

  const filledOptions = (options || []).filter((o) => String(o || "").trim()).length;
  const canSend = String(title || "").trim().length > 0 && filledOptions >= 2 && !sending;

  return createPortal(
    <div
      className="wa-modalOverlay wa-pollModal-overlay"
      role="dialog"
      aria-label="Enviar enquete"
      onMouseDown={() => {
        if (sending) return;
        onClose?.();
      }}
    >
      <div className="wa-modal wa-pollModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wa-pollModal-head">
          <div className="wa-pollModal-brand">
            <span className="wa-pollModal-icon" aria-hidden="true">
              <IconChartBar size={22} strokeWidth={1.75} />
            </span>
            <div className="wa-pollModal-titles">
              <div className="wa-pollModal-title">Enviar enquete</div>
              <p className="wa-pollModal-subtitle">O cliente escolhe no WhatsApp; a opção chega aqui como texto.</p>
            </div>
          </div>
          <button
            type="button"
            className="wa-iconBtn wa-pollModal-close"
            onClick={() => !sending && onClose?.()}
            title="Fechar"
            aria-label="Fechar"
            disabled={sending}
          >
            <IconClose />
          </button>
        </div>

        <div className="wa-pollModal-body">
          <div className="wa-pollModal-hint">
            <span className="wa-pollModal-hintDot" aria-hidden="true" />
            Ideal para triagem rápida (setor, preferência, sim/não).
          </div>

          <label className="wa-pollModal-field">
            <span className="wa-pollModal-label">Pergunta</span>
            <input
              className="wa-input wa-pollModal-input"
              value={title}
              onChange={(e) => onTitleChange?.(e.target.value)}
              placeholder="Ex.: Qual setor você precisa?"
              disabled={sending}
              autoFocus
            />
          </label>

          <div className="wa-pollModal-field">
            <div className="wa-pollModal-labelRow">
              <span className="wa-pollModal-label">Opções</span>
              <span className="wa-pollModal-count">
                {filledOptions}/{maxOptions}
              </span>
            </div>
            <div className="wa-pollModal-options">
              {(options || []).map((opt, idx) => (
                <div key={idx} className="wa-pollModal-optionRow">
                  <span className="wa-pollModal-optionIndex" aria-hidden="true">
                    {idx + 1}
                  </span>
                  <input
                    className="wa-input wa-pollModal-input"
                    value={opt}
                    onChange={(e) => onOptionChange?.(idx, e.target.value)}
                    placeholder={`Opção ${idx + 1}`}
                    disabled={sending}
                  />
                  {(options || []).length > 2 ? (
                    <button
                      type="button"
                      className="wa-pollModal-remove"
                      disabled={sending}
                      onClick={() => onRemoveOption?.(idx)}
                      title="Remover"
                      aria-label={`Remover opção ${idx + 1}`}
                    >
                      ×
                    </button>
                  ) : (
                    <span className="wa-pollModal-removeSpacer" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>
            {(options || []).length < maxOptions ? (
              <button
                type="button"
                className="wa-pollModal-add"
                disabled={sending}
                onClick={() => onAddOption?.()}
              >
                <span aria-hidden="true">+</span> Adicionar opção
              </button>
            ) : null}
          </div>

          <label className={`wa-pollModal-multi${multi ? " is-on" : ""}`}>
            <input
              type="checkbox"
              checked={!!multi}
              disabled={sending}
              onChange={(e) => onMultiChange?.(e.target.checked)}
            />
            <span className="wa-pollModal-switch" aria-hidden="true" />
            <span className="wa-pollModal-multiText">
              <strong>Várias respostas</strong>
              <span>O cliente pode marcar mais de uma opção</span>
            </span>
          </label>
        </div>

        <div className="wa-pollModal-footer">
          <button type="button" className="wa-btn wa-pollModal-cancel" disabled={sending} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="wa-btn wa-btn-primary wa-pollModal-submit"
            disabled={!canSend}
            onClick={onSend}
          >
            {sending ? "Enviando…" : "Enviar enquete"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
