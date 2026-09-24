import { useCallback, useState } from "react";
import { IconCheck, IconCopy, IconKey } from "@tabler/icons-react";

/**
 * Bolha do cartão Pix enviado ao cliente (espelha o cartão nativo do WhatsApp com
 * botão "Copiar chave Pix"). O botão copia a chave de verdade também aqui no CRM.
 */
export default function PixMessage({ pixMeta, texto, out }) {
  const [copied, setCopied] = useState(false);
  const pix = pixMeta && typeof pixMeta === "object" ? pixMeta : {};
  const chave = String(pix.chave_pix || "").trim();
  const nome = String(pix.nome_recebedor || "").trim();
  const tipoLabel = String(pix.tipo_label || "").trim();
  const extra = String(pix.mensagem_padrao || "").trim();
  const copyLabel = String(pix.copy_label || "Copiar chave Pix").trim();

  const handleCopy = useCallback(async () => {
    if (!chave) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(chave);
      } else {
        const ta = document.createElement("textarea");
        ta.value = chave;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* silencioso: a chave continua visível no cartão */
    }
  }, [chave]);

  if (!chave) {
    // Sem chave estruturada → mostra o texto puro (não quebra).
    return <span className="wa-pixMsg-fallback">{texto}</span>;
  }

  return (
    <div className={`wa-pixMsg${out ? " wa-pixMsg--out" : ""}`} aria-label="Chave Pix">
      <div className="wa-pixMsg-head">
        <span className="wa-pixMsg-icon" aria-hidden="true">
          <IconKey size={16} stroke={1.9} />
        </span>
        <span className="wa-pixMsg-title">Pagamento via Pix</span>
      </div>

      <div className="wa-pixMsg-body">
        {nome ? (
          <div className="wa-pixMsg-row">
            <span className="wa-pixMsg-label">Recebedor</span>
            <span className="wa-pixMsg-value">{nome}</span>
          </div>
        ) : null}
        {tipoLabel ? (
          <div className="wa-pixMsg-row">
            <span className="wa-pixMsg-label">Tipo</span>
            <span className="wa-pixMsg-value">{tipoLabel}</span>
          </div>
        ) : null}
        <div className="wa-pixMsg-row wa-pixMsg-row--key">
          <span className="wa-pixMsg-label">Chave</span>
          <span className="wa-pixMsg-key" title={chave}>{chave}</span>
        </div>
      </div>

      {extra ? <p className="wa-pixMsg-note">{extra}</p> : null}

      <button
        type="button"
        className={`wa-pixMsg-copyBtn${copied ? " is-copied" : ""}`}
        onClick={handleCopy}
      >
        {copied ? <IconCheck size={16} stroke={2.1} /> : <IconCopy size={16} stroke={1.9} />}
        {copied ? "Chave copiada!" : copyLabel}
      </button>
    </div>
  );
}
