import { buildAudioRetryPayload, buildRetryPayload } from "../utils/bubbleRetry";

export default function MessageRetry({
  variant = "default",
  isRetrying,
  onRetry,
  payload,
}) {
  const label = isRetrying ? "Reenviando…" : "Tentar novamente";
  if (variant === "audio") {
    return (
      <button
        type="button"
        className="wa-msgRetryBtn wa-audioRetryBtn"
        disabled={isRetrying}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isRetrying) return;
          onRetry?.(payload);
        }}
        title={label}
        aria-label={isRetrying ? "Reenviando mensagem" : "Tentar enviar novamente"}
      >
        <span aria-hidden="true">↻</span> {label}
      </button>
    );
  }

  return (
    <div className="wa-msgRetryWrap">
      <div className="wa-msgRetryHint" role="status">
        Não foi possível enviar
      </div>
      <button
        type="button"
        className="wa-msgRetryBtn"
        disabled={isRetrying}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isRetrying) return;
          onRetry?.(payload);
        }}
        title={label}
        aria-label={isRetrying ? "Reenviando mensagem" : "Tentar enviar novamente"}
      >
        <span aria-hidden="true">↻</span> {label}
      </button>
    </div>
  );
}

export { buildAudioRetryPayload, buildRetryPayload };
