import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { moverSelecaoRadio, useDialogFocus } from "./useDialogFocus";
import { useMobileOverlayBack } from "./useMobileOverlayBack";
import { hojeNoFusoDaEmpresa } from "./prazoDataMinima";
import "./aguardarPagamento.css";

const OPCOES = [
  {
    id: "hoje",
    label: "Hoje",
    hint: "Até o fim do dia",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "amanha",
    label: "Amanhã",
    hint: "Até o fim de amanhã",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "4h",
    label: "Em 4 horas",
    hint: "Prazo curto",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M13 2L4 14h7l-1 8 10-14h-7l1-6z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "data",
    label: "Data específica",
    hint: "Escolha o dia",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M6 4v4M18 4v4M4 9h16M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" strokeLinecap="round" />
      </svg>
    ),
  },
];

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

export default function AguardarPagamentoModal({ open, busy, onClose, onConfirm, returnFocusRef }) {
  const [prazo, setPrazo] = useState("hoje");
  const [data, setData] = useState("");
  /** Falha do último envio, mostrada DENTRO do modal (o toast ficava sob o véu — R7-04). */
  const [erro, setErro] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setPrazo("hoje");
    setData("");
    setErro(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // CAPTURA + preventDefault: sem isto o ESC global fechava a conversa junto (ver AguardarClienteModal).
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      if (!busy) onClose?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, busy, onClose]);

  useDialogFocus({
    open,
    dialogRef,
    returnFocusRef,
    getInitialFocus: () => dialogRef.current?.querySelector('[role="radio"][aria-checked="true"]'),
  });

  // Celular: o "voltar" fecha só o modal, não a conversa (R4-05) — mesmo salvando: a entrada do
  // histórico já foi consumida (ver AguardarClienteModal). O resultado chega em pílula/toast.
  useMobileOverlayBack(open, () => onClose?.(), "aguardar");

  const handleConfirm = useCallback(async () => {
    if (busy) return;
    setErro(null);
    try {
      await onConfirm?.({ prazo, data: prazo === "data" ? data : undefined });
    } catch (e) {
      setErro(e?.userMessage || e?.message || "Tente de novo em instantes.");
    }
  }, [busy, onConfirm, prazo, data]);

  if (!open) return null;

  // A3-11: "hoje" no fuso da EMPRESA, não o dia UTC (ver AguardarClienteModal).
  const minDate = hojeNoFusoDaEmpresa();
  const dataTxt = String(data || "").trim();
  const dataInvalida = prazo === "data" && (!/^\d{4}-\d{2}-\d{2}$/.test(dataTxt) || dataTxt < minDate);

  return createPortal(
    <div
      className="zap-pg-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className="zap-pg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="zap-pg-title"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="zap-pg-modal__glow" aria-hidden="true" />

        <header className="zap-pg-header">
          <div className="zap-pg-header__brand">
            <span className="zap-pg-header__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="3" y="6" width="18" height="14" rx="2" />
                <path d="M3 10h18M8 6V4M16 6V4" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <h2 id="zap-pg-title" className="zap-pg-title">
                Aguardar pagamento
              </h2>
              <p className="zap-pg-subtitle">
                Defina quando a cobrança deve ser quitada. A conversa ficará como pagamento pendente.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="zap-pg-close"
            onClick={() => !busy && onClose?.()}
            disabled={busy}
            aria-label="Fechar"
          >
            <IconClose />
          </button>
        </header>

        <div className="zap-pg-body">
          <p className="zap-pg-section-label">Prazo de acompanhamento</p>
          <div
            className="zap-pg-grid"
            role="radiogroup"
            aria-label="Prazo do pagamento"
            onKeyDown={(e) => moverSelecaoRadio(e, OPCOES, prazo, setPrazo)}
          >
            {OPCOES.map((op) => {
              const selected = prazo === op.id;
              return (
                <button
                  key={op.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  className={`zap-pg-card${selected ? " is-selected" : ""}`}
                  disabled={busy}
                  onClick={() => setPrazo(op.id)}
                >
                  <span className="zap-pg-card__radio" aria-hidden="true">
                    <span className="zap-pg-card__radio-dot" />
                  </span>
                  <span className="zap-pg-card__icon">{op.icon}</span>
                  <span className="zap-pg-card__text">
                    <span className="zap-pg-card__label">{op.label}</span>
                    <span className="zap-pg-card__hint">{op.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {prazo === "data" ? (
            <div className="zap-pg-date-wrap">
              <label className="zap-pg-date-label" htmlFor="zap-pg-date-input">
                Data limite do pagamento
              </label>
              <input
                id="zap-pg-date-input"
                type="date"
                className="zap-pg-date-input"
                value={data}
                min={minDate}
                onChange={(e) => setData(e.target.value)}
                disabled={busy}
              />
            </div>
          ) : null}
        </div>

        {erro ? (
          <div className="zap-pg-error" role="alert">
            <span className="zap-pg-error__text">
              <strong>Não foi possível definir o prazo.</strong> {erro}
            </span>
            <button
              type="button"
              className="zap-pg-error__close"
              onClick={() => setErro(null)}
              aria-label="Dispensar aviso"
              title="Dispensar"
            >
              <IconClose />
            </button>
          </div>
        ) : null}

        <footer className="zap-pg-footer">
          <button type="button" className="zap-pg-btn zap-pg-btn--ghost" disabled={busy} onClick={() => onClose?.()}>
            Cancelar
          </button>
          <button
            type="button"
            className="zap-pg-btn zap-pg-btn--primary"
            disabled={busy || dataInvalida}
            onClick={handleConfirm}
          >
            {busy ? (
              <>
                <span className="zap-pg-btn__spinner" aria-hidden="true" />
                Salvando…
              </>
            ) : (
              "Confirmar prazo"
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
