import { IconClose, IconSend } from "../../conversaComposerIcons";

export default function VoiceRecorder({ open, seconds, onCancel, onSend }) {
  if (!open) return null;

  return (
    <div className="wa-recordingOverlay">
      <div className="wa-recording-bar">
        <button
          type="button"
          className="wa-recording-cancel"
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => event.preventDefault()}
          onClick={onCancel}
          title="Cancelar"
          aria-label="Cancelar gravação"
        >
          <IconClose />
        </button>
        <div className="wa-recording-timer">
          <span className="wa-recording-dot" aria-hidden="true" />
          <span className="wa-recording-time">
            {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, "0")}
          </span>
        </div>
        <span className="wa-recording-hint">Toque para enviar</span>
        <button
          type="button"
          className="wa-recording-send"
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => event.preventDefault()}
          onClick={onSend}
          title="Enviar áudio"
          aria-label="Enviar áudio"
        >
          <IconSend />
        </button>
      </div>
    </div>
  );
}
