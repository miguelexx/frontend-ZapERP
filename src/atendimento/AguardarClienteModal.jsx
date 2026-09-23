import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./aguardarPagamento.css";

/** Opções do alarme "Aguardar cliente". `id` casa com o backend (aguardarClientePrazo). */
const OPCOES = [
  {
    id: "1h",
    label: "1 hora",
    hint: "Retorno rápido",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "2h",
    label: "2 horas",
    hint: "Curto prazo",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l4 2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "4h",
    label: "4 horas",
    hint: "Ainda hoje",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M13 2 4 14h7l-1 8 10-14h-7l1-6z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "hoje",
    label: "Hoje",
    hint: "Até o fim do dia",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4l2.5 1.5" strokeLinecap="round" />
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

export default function AguardarClienteModal({ open, busy, onClose, onConfirm }) {
  const [prazo, setPrazo] = useState("1h");
  const [data, setData] = useState("");

  useEffect(() => {
    if (!open) return;
    setPrazo("1h");
    setData("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, busy, onClose]);

  const handleConfirm = useCallback(() => {
    if (busy) return;
    onConfirm?.({ prazo, data: prazo === "data" ? data : undefined });
  }, [busy, onConfirm, prazo, data]);

  if (!open) return null;

  const dataInvalida = prazo === "data" && !/^\d{4}-\d{2}-\d{2}$/.test(String(data || "").trim());
  const minDate = new Date().toISOString().slice(0, 10);

  return createPortal(
    <div
      className="zap-pg-overlay zap-ac-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        className="zap-pg-modal zap-ac-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="zap-ac-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="zap-pg-modal__glow" aria-hidden="true" />

        <header className="zap-pg-header">
          <div className="zap-pg-header__brand">
            <span className="zap-pg-header__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75">
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2.5 1.5M9 2h6M5 5l2 2M19 5l-2 2" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <h2 id="zap-ac-title" className="zap-pg-title">
                Aguardar cliente
              </h2>
              <p className="zap-pg-subtitle">
                Defina por quanto tempo vai esperar a resposta. O sistema monitora o prazo e sinaliza a conversa com etiquetas automáticas.
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
          <p className="zap-pg-section-label">Aguardar por</p>
          <div className="zap-pg-grid" role="radiogroup" aria-label="Prazo da espera">
            {OPCOES.map((op) => {
              const selected = prazo === op.id;
              return (
                <button
                  key={op.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
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
              <label className="zap-pg-date-label" htmlFor="zap-ac-date-input">
                Aguardar até o dia
              </label>
              <input
                id="zap-ac-date-input"
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
              "Iniciar espera"
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
