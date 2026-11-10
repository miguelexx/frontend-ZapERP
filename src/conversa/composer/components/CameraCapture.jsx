import { createPortal } from "react-dom";
import { SwitchCamera, Zap, ZapOff } from "lucide-react";
import { IconClose } from "../../conversaComposerIcons";

export default function CameraCapture({
  open,
  videoRef,
  canvasRef,
  starting,
  error,
  flash,
  canFlip,
  torchAvailable,
  torchOn,
  onFlip,
  onToggleTorch,
  onClose,
  onCapture,
}) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="wa-cameraCapture" role="dialog" aria-modal="true" aria-label="Câmera">
      <div className="wa-cameraCapture-stage">
        <video
          ref={videoRef}
          className="wa-cameraCapture-video"
          playsInline
          muted
          autoPlay
        />
        {torchAvailable ? (
          <button
            type="button"
            className={`wa-cameraCapture-torch${torchOn ? " is-on" : ""}`}
            onClick={onToggleTorch}
            title={torchOn ? "Desligar lanterna" : "Ligar lanterna"}
            aria-label={torchOn ? "Desligar lanterna" : "Ligar lanterna"}
            aria-pressed={torchOn === true}
          >
            {torchOn ? (
              <Zap size={20} strokeWidth={2} aria-hidden="true" />
            ) : (
              <ZapOff size={20} strokeWidth={2} aria-hidden="true" />
            )}
          </button>
        ) : null}
        {starting ? (
          <div className="wa-cameraCapture-status" role="status">
            Abrindo câmera...
          </div>
        ) : null}
        {error ? (
          <div className="wa-cameraCapture-error" role="alert">
            {error}
          </div>
        ) : null}
        {/* Piscada do disparo: confirma o toque sem esperar o encode do JPEG. */}
        {flash ? <span className="wa-cameraCapture-flash" aria-hidden="true" /> : null}
      </div>
      <canvas ref={canvasRef} className="wa-cameraCapture-canvas" aria-hidden="true" />
      <div className="wa-cameraCapture-actions">
        <button
          type="button"
          className="wa-cameraCapture-close wa-iconBtn"
          onClick={onClose}
          title="Cancelar"
          aria-label="Cancelar câmera"
        >
          <IconClose />
        </button>
        <button
          type="button"
          className="wa-cameraCapture-shot"
          onClick={onCapture}
          disabled={starting}
          title="Tirar foto"
          aria-label="Tirar foto"
        >
          <span aria-hidden="true" />
        </button>
        {canFlip ? (
          <button
            type="button"
            className="wa-cameraCapture-flip wa-iconBtn"
            onClick={onFlip}
            disabled={starting}
            title="Virar câmera"
            aria-label="Virar câmera"
          >
            <SwitchCamera size={22} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
