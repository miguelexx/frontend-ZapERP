import { createPortal } from "react-dom";
import { IconClose } from "../../conversaComposerIcons";

export default function CameraCapture({
  open,
  videoRef,
  canvasRef,
  starting,
  error,
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
      </div>
    </div>,
    document.body
  );
}
