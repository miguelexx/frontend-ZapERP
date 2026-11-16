import { IconClose, IconSend } from "../../conversaComposerIcons";

/**
 * `interrupted`: a gravação foi parada por fora (ligação, outro app pegou o microfone, fone
 * desconectado) e o trecho capturado ficou guardado como rascunho — o atendente decide se envia
 * ou descarta, em vez de perder o áudio.
 */
export default function VoiceRecorder({ open, seconds, interrupted = false, preparing = false, onCancel, onSend }) {
  if (!open) return null;

  const safeSeconds = Math.max(0, Number(seconds) || 0);

  return (
    <div className="wa-recordingOverlay">
      <div className={`wa-recording-bar${interrupted ? " wa-recording-bar--interrupted" : ""}`}>
        <button
          type="button"
          className="wa-recording-cancel"
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => event.preventDefault()}
          onClick={onCancel}
          title={interrupted ? "Descartar áudio" : "Cancelar"}
          aria-label={interrupted ? "Descartar áudio gravado" : "Cancelar gravação"}
        >
          <IconClose />
        </button>
        <div className="wa-recording-timer">
          <span className="wa-recording-dot" aria-hidden="true" />
          <span className="wa-recording-time">
            {Math.floor(safeSeconds / 60)}:{(safeSeconds % 60).toString().padStart(2, "0")}
          </span>
        </div>
        <span className="wa-recording-hint" role={interrupted ? "status" : undefined}>
          {interrupted
            ? preparing
              ? "Interrompida · salvando…"
              : "Interrompida · enviar?"
            : "Toque para enviar"}
        </span>
        <button
          type="button"
          className="wa-recording-send"
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => event.preventDefault()}
          onClick={onSend}
          disabled={preparing}
          title="Enviar áudio"
          aria-label={interrupted ? "Enviar o trecho gravado" : "Enviar áudio"}
        >
          <IconSend />
        </button>
      </div>
    </div>
  );
}
