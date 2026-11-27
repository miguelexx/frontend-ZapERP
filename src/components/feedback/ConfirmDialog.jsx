import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "../../atendimento/useDialogFocus";
import { useMobileOverlayBack } from "../../atendimento/useMobileOverlayBack";
import "./ConfirmDialog.css";

/**
 * Confirmação modal acessível (overlay + foco).
 *
 * 27/11/2026 — substituiu o window.confirm no Atendimento (apagar mensagens), então passou a
 * ter o que o diálogo nativo dava de graça:
 *  - Tab preso dentro do diálogo e foco devolvido a quem abriu ao fechar (useDialogFocus);
 *  - "voltar" do celular = Cancelar, sem tirar a conversa da tela (useMobileOverlayBack);
 *  - toque no fundo escurecido fecha SEM "atravessar" para o que está por baixo.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {import('react').ReactNode} props.children
 * @param {string} [props.confirmLabel]
 * @param {string} [props.cancelLabel]
 * @param {boolean} [props.danger]
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 * @param {{ current: HTMLElement | null }} [props.returnFocusRef] — destino do foco se quem
 *   abriu já saiu da tela (ex.: o item de menu que pediu a confirmação)
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  onConfirm,
  onCancel,
  returnFocusRef,
}) {
  const idBase = useId();
  const titleId = `${idBase}-title`;
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useDialogFocus({
    open: Boolean(open),
    dialogRef,
    getInitialFocus: () => cancelRef.current,
    returnFocusRef,
  });

  useMobileOverlayBack(Boolean(open), () => onCancelRef.current?.(), "confirm");

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        onCancel?.();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="ds-confirm-overlay"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        // Rato: fecha já (o clique vai para o ancestral comum, nunca para o que está por baixo).
        if (e.pointerType === "mouse") {
          e.preventDefault();
          onCancel?.();
        }
      }}
      onClick={(e) => {
        // Toque/caneta: fecha no clique, com o fundo ainda na tela — ele "engole" o toque.
        if (e.target !== e.currentTarget) return;
        onCancel?.();
      }}
    >
      <div
        ref={dialogRef}
        className="ds-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="ds-confirm-title">
          {title}
        </h2>
        <div className="ds-confirm-body">{children}</div>
        <div className="ds-confirm-actions">
          <button ref={cancelRef} type="button" className="ds-confirm-btn ds-confirm-btn--ghost" onClick={() => onCancel?.()}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`ds-confirm-btn ${danger ? "ds-confirm-btn--danger" : "ds-confirm-btn--primary"}`}
            onClick={() => onConfirm?.()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
