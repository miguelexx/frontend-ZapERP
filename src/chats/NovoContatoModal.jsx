import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Phone, User } from "lucide-react";
import { criarContato, conversaFromContatoResponse } from "./chatService";
import {
  AJUDA_TELEFONE_PADRAO,
  EXEMPLO_TELEFONE_PADRAO,
  digitsOnly,
  formatBrPhoneDisplay,
  isPlausibleBrPhoneDigits,
} from "./phoneBrFormat";
import "./novoContatoModal.css";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(conversa: object) => void} [props.onSuccess]
 */
export default function NovoContatoModal({ open, onClose, onSuccess }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState("");
  const [apiError, setApiError] = useState(null);

  const telefoneRef = useRef(null);
  const overlayRef = useRef(null);
  const idBase = useId();
  const helpId = `${idBase}-help`;
  const nomeId = `${idBase}-nome`;
  const telId = `${idBase}-tel`;

  const resetApiHints = useCallback(() => {
    setApiError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    setNome("");
    setTelefone("");
    setSubmitting(false);
    setClientError("");
    setApiError(null);
    const t = requestAnimationFrame(() => {
      telefoneRef.current?.focus();
    });
    return () => cancelAnimationFrame(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, submitting]);

  function handleTelChange(e) {
    const v = e.target.value;
    setTelefone(formatBrPhoneDisplay(v));
    setClientError("");
    resetApiHints();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedNome = nome.trim();
    const telDigits = digitsOnly(telefone);

    if (!telDigits) {
      setClientError("Informe o número com DDD.");
      telefoneRef.current?.focus();
      return;
    }

    if (!isPlausibleBrPhoneDigits(telDigits)) {
      setClientError("O número parece incompleto. Use DDD + telefone (10 ou 11 dígitos) ou inclua o código 55.");
      telefoneRef.current?.focus();
      return;
    }

    setClientError("");
    setSubmitting(true);
    resetApiHints();

    try {
      const data = await criarContato(trimmedNome || undefined, telefone);
      const conversa = conversaFromContatoResponse(data);
      if (conversa?.id) {
        onSuccess?.(conversa);
        onClose();
      } else {
        setApiError({
          detalhe: "A conversa foi criada, mas a resposta veio em um formato inesperado. Atualize a lista.",
          exemplos: [],
        });
      }
    } catch (err) {
      if (err?.isApiValidation) {
        const ex = Array.isArray(err.exemplos) ? err.exemplos : [];
        setApiError({
          codigo: err.codigo,
          detalhe: err.detalhe || err.message,
          formato_esperado: err.formato_esperado,
          exemplos: ex,
        });
        return;
      }
      const status = err?.response?.status;
      const fallback =
        err?.response?.data?.error ||
        err?.response?.data?.detalhe ||
        (status ? `Erro ${status}` : err?.message || "Não foi possível criar o contato.");
      setApiError({ detalhe: fallback, exemplos: [] });
    } finally {
      setSubmitting(false);
    }
  }

  const helpLinhaExtra = apiError?.formato_esperado ? String(apiError.formato_esperado) : null;
  const exemploApi = Array.isArray(apiError?.exemplos) && apiError.exemplos.length > 0 ? apiError.exemplos[0] : null;

  if (!open) return null;

  const node = (
    <div
      ref={overlayRef}
      className="ncm-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === overlayRef.current && !submitting) onClose();
      }}
    >
      <div
        className="ncm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idBase}-heading`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ncm-head">
          <div className="ncm-title-block">
            <div className="ncm-icon" aria-hidden>
              <Phone size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="ncm-title" id={`${idBase}-heading`}>
                Novo contato
              </h2>
              <p className="ncm-subtitle">Digite o número com DDD. O sistema aceita com ou sem máscara.</p>
            </div>
          </div>
          <button type="button" className="ncm-close" onClick={() => !submitting && onClose()} aria-label="Fechar">
            ×
          </button>
        </div>

        <form className="ncm-body" onSubmit={handleSubmit} noValidate>
          <div className="ncm-field">
            <label className="ncm-label-row" htmlFor={nomeId}>
              <User size={16} strokeWidth={1.75} />
              Nome <span style={{ fontWeight: 400, color: "var(--ds-text-tertiary)" }}>(opcional)</span>
            </label>
            <input
              id={nomeId}
              name="nome"
              type="text"
              className="ncm-input"
              autoComplete="name"
              placeholder="Como aparecerá na conversa"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                resetApiHints();
              }}
              disabled={submitting}
            />
          </div>

          <div className="ncm-field">
            <label className="ncm-label-row" htmlFor={telId}>
              <Phone size={16} strokeWidth={1.75} />
              Telefone
            </label>
            <input
              ref={telefoneRef}
              id={telId}
              name="telefone"
              type="tel"
              inputMode="tel"
              className="ncm-input"
              autoComplete="tel-national"
              placeholder="Ex.: (11) 98765-4321 ou +55 11 98765-4321"
              value={telefone}
              onChange={handleTelChange}
              disabled={submitting}
              aria-required="true"
              aria-invalid={!!(clientError || apiError)}
              aria-describedby={helpId}
            />
            <p id={helpId} className="ncm-help">
              {AJUDA_TELEFONE_PADRAO}
              <span className="ncm-example">{EXEMPLO_TELEFONE_PADRAO}</span>
            </p>
          </div>

          {apiError?.detalhe ? (
            <div className="ncm-alert" role="alert">
              <strong>{apiError.detalhe}</strong>
              {exemploApi ? <span className="ncm-example" style={{ display: "block", marginTop: 6 }}>Exemplo aceito: {exemploApi}</span> : null}
              {helpLinhaExtra ? <span style={{ display: "block", marginTop: 6 }}>{helpLinhaExtra}</span> : null}
            </div>
          ) : null}

          {clientError ? (
            <div className="ncm-alert" role="alert">
              {clientError}
            </div>
          ) : null}

          <div className="ncm-footer">
            <button type="button" className="ncm-btn ncm-btn--ghost" onClick={() => !submitting && onClose()} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="ncm-btn ncm-btn--primary" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="ncm-spin" aria-hidden />
                  Abrindo…
                </>
              ) : (
                "Iniciar conversa"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
