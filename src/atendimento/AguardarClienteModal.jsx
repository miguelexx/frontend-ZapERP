import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { moverSelecaoRadio, useDialogFocus } from "./useDialogFocus";
import { useMobileOverlayBack } from "./useMobileOverlayBack";
import { hojeNoFusoDaEmpresa } from "./prazoDataMinima";
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

export default function AguardarClienteModal({ open, busy, onClose, onConfirm, returnFocusRef }) {
  const [prazo, setPrazo] = useState("1h");
  const [data, setData] = useState("");
  /** Falha do último envio (409, rede…), mostrada DENTRO do modal: o toast global nasce por
      baixo do véu desfocado (z 9999 < 12000) e o atendente não via nada (R7-04). */
  const [erro, setErro] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setPrazo("1h");
    setData("");
    setErro(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    /*
     * CAPTURA + preventDefault (26/11/2026): o atalho global (useGlobalHotkeys, na window)
     * só ignora o ESC já tratado. Sem isto o mesmo ESC fechava o modal E a conversa inteira.
     * Ocupado (salvando) ainda consome o ESC, para a conversa nunca fechar por baixo.
     */
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

  // Foco entra no prazo escolhido (nunca num campo de texto: no celular abriria o teclado),
  // fica preso no diálogo e volta ao botão "Aguardar cliente" ao fechar.
  useDialogFocus({
    open,
    dialogRef,
    returnFocusRef,
    getInitialFocus: () => dialogRef.current?.querySelector('[role="radio"][aria-checked="true"]'),
  });

  // Celular: o "voltar" fecha só o modal, não a conversa (R4-05). Fecha MESMO salvando: o voltar
  // já consumiu a entrada do histórico, e um modal que ficasse aberto sem ela fazia o voltar
  // seguinte tirar a conversa da tela. O resultado chega igual (pílula de sucesso ou toast de
  // erro — com o modal fechado, o AtendimentoActions manda o erro para o toast).
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

  // A3-11: "hoje" no fuso da EMPRESA (antes era o dia UTC: às 21h em São Paulo o calendário
  // já bloqueava o próprio dia). Data digitada antes de hoje também não vale.
  const minDate = hojeNoFusoDaEmpresa();
  const dataTxt = String(data || "").trim();
  const dataInvalida = prazo === "data" && (!/^\d{4}-\d{2}-\d{2}$/.test(dataTxt) || dataTxt < minDate);

  return createPortal(
    <div
      className="zap-pg-overlay zap-ac-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className="zap-pg-modal zap-ac-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="zap-ac-title"
        tabIndex={-1}
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
          <div
            className="zap-pg-grid"
            role="radiogroup"
            aria-label="Prazo da espera"
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

        {erro ? (
          <div className="zap-pg-error" role="alert">
            <span className="zap-pg-error__text">
              <strong>Não foi possível iniciar a espera.</strong> {erro}
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
              "Iniciar espera"
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
