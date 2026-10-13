import { buildAudioRetryPayload, buildRetryPayload } from "../utils/bubbleRetry";

/**
 * `aceitoPeloProvedor`: o WhatsApp já havia aceitado e identificado a mensagem (há
 * whatsapp_id) e o erro veio de NÓS desistirmos de esperar a confirmação, não de uma recusa.
 * Nesse caso a mensagem provavelmente FOI entregue — anunciar "não foi possível enviar" leva
 * o atendente a reenviar e duplicar no cliente. O botão continua disponível (às vezes ela
 * realmente não chegou), mas o texto deixa o risco explícito.
 */
export default function MessageRetry({
  variant = "default",
  isRetrying,
  onRetry,
  payload,
  aceitoPeloProvedor = false,
}) {
  const label = isRetrying
    ? "Reenviando…"
    : aceitoPeloProvedor
      ? "Reenviar mesmo assim"
      : "Tentar novamente";
  const aviso = aceitoPeloProvedor
    ? "Enviada — o WhatsApp não confirmou a entrega"
    : "Não foi possível enviar";
  const tituloBotao = aceitoPeloProvedor
    ? "O WhatsApp aceitou esta mensagem; reenviar pode duplicá-la para o cliente"
    : label;
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
        title={tituloBotao}
        aria-label={isRetrying ? "Reenviando mensagem" : tituloBotao}
      >
        <span aria-hidden="true">↻</span> {label}
      </button>
    );
  }

  return (
    <div className="wa-msgRetryWrap">
      <div
        className={`wa-msgRetryHint ${aceitoPeloProvedor ? "wa-msgRetryHint--naoConfirmada" : ""}`}
        role="status"
      >
        {aviso}
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
        title={tituloBotao}
        aria-label={isRetrying ? "Reenviando mensagem" : tituloBotao}
      >
        <span aria-hidden="true">↻</span> {label}
      </button>
    </div>
  );
}

export { buildAudioRetryPayload, buildRetryPayload };
