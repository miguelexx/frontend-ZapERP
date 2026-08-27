import { IconClose } from "../../conversaComposerIcons";

export default function ReplyBar({ preview, isRecording, sending, onCancel }) {
  if (!preview || isRecording) return null;

  return (
    <div className="wa-replyBar" role="region" aria-label="Respondendo">
      <div className="wa-replyBar-bar" aria-hidden="true" />
      {preview.thumb ? (
        <img
          src={preview.thumb}
          alt=""
          className="wa-replyBar-thumb"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <div className="wa-replyBar-left">
        <div className="wa-replyBar-title">{preview.title}</div>
        <div className="wa-replyBar-text">{preview.text}</div>
      </div>
      <button
        type="button"
        className="wa-iconBtn"
        onClick={onCancel}
        title="Cancelar resposta"
        aria-label="Cancelar resposta"
        disabled={sending}
      >
        <IconClose />
      </button>
    </div>
  );
}
