import { useCallback, useSyncExternalStore } from "react";
import {
  cancelUpload,
  getUploadProgress,
  isUploadCancelable,
  subscribeUploadProgress,
  uploadBatchSize,
} from "../../uploadProgressStore";
import "../uploadProgress.css";

/**
 * Chave do upload de uma bolha: o tempId da mensagem otimista. Mensagem que já tem `id` do
 * servidor está reconciliada (HTTP ou socket chegou primeiro) — não há mais o que mostrar.
 */
export function uploadTempIdOf(msg) {
  if (!msg || msg.id != null) return "";
  const t = msg.tempId ?? msg.client_temp_id;
  return t == null ? "" : String(t);
}

const NOOP_UNSUB = () => {};

/**
 * Progresso 0..1 do upload desta bolha, ou null sem upload em curso. Assina SÓ este tempId
 * (uploadProgressStore): a linha da thread e a store das mensagens não re-renderizam.
 */
export function useUploadProgress(msg) {
  const key = uploadTempIdOf(msg);
  const subscribe = useCallback(
    (onChange) => (key ? subscribeUploadProgress(key, onChange) : NOOP_UNSUB),
    [key]
  );
  const getSnapshot = useCallback(() => (key ? getUploadProgress(key) : null), [key]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function stopOnly(e) {
  e.stopPropagation();
}

/**
 * Anel determinado estilo WhatsApp com X para cancelar. Absoluto/centrado pelo pai — não
 * ocupa fluxo. Com o corpo inteiro enviado (progress = 1) o servidor está a repassar ao
 * WhatsApp: o anel gira indeterminado e o X some (cancelar ali não desfaria o envio).
 *
 * `<span role="button">` e não `<button>`: o anel vive dentro do `<button>` da moldura da
 * foto/vídeo (botão aninhado é HTML inválido) — mesmo padrão do `.wa-bubble-imgStalled`.
 */
export default function UploadProgressRing({ tempId, progress, variant = "media", showCancel = true }) {
  if (progress == null || !tempId) return null;
  const processing = progress >= 1;
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const cancelable = showCancel && !processing && isUploadCancelable(tempId);
  const batch = uploadBatchSize(tempId);
  /* "Cancelar ESTE envio": "Cancelar envio" já é o nome do X da prévia de anexo (e dos testes
     que o procuram por nome) — com um upload em curso as duas coisas coexistem na tela. */
  const cancelLabel = batch > 1 ? `Cancelar este envio (${batch} arquivos)` : "Cancelar este envio";

  const onCancel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    cancelUpload(tempId);
  };

  return (
    <span
      className={`wa-uploadRing wa-uploadRing--${variant}${processing ? " is-processing" : ""}`}
      role="progressbar"
      aria-label="Enviando arquivo"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={processing ? undefined : pct}
      aria-valuetext={processing ? "Finalizando o envio" : `${pct}%`}
    >
      <svg className="wa-uploadRing-svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle className="wa-uploadRing-track" cx="24" cy="24" r="20" />
        <circle
          className="wa-uploadRing-bar"
          cx="24"
          cy="24"
          r="20"
          pathLength="100"
          /* Mínimo de 3%: no início do upload o anel já mostra um traço (sabe-se que começou). */
          style={processing ? undefined : { strokeDashoffset: 100 - Math.max(3, pct) }}
        />
      </svg>
      {cancelable ? (
        <span
          role="button"
          tabIndex={0}
          className="wa-uploadRing-cancel"
          aria-label={cancelLabel}
          title={cancelLabel}
          onPointerDown={stopOnly}
          onPointerUp={stopOnly}
          onContextMenu={stopOnly}
          onClick={onCancel}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            onCancel(e);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 7l10 10M17 7L7 17" />
          </svg>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Véu + anel por cima da foto, absoluto dentro da moldura (sem mexer na altura da bolha).
 * Assina sozinho: só ele re-renderiza a cada passo do progresso — a `<img>` da bolha não.
 */
export function UploadProgressOverlay({ msg, variant = "image", showCancel = true }) {
  const progress = useUploadProgress(msg);
  if (progress == null) return null;
  return (
    <span className={`wa-uploadOverlay wa-uploadOverlay--${variant}`}>
      <UploadProgressRing
        tempId={uploadTempIdOf(msg)}
        progress={progress}
        variant={variant}
        showCancel={showCancel}
      />
    </span>
  );
}
