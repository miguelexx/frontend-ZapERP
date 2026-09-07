import { IconClose, IconPencil } from "../../conversaComposerIcons";

export default function ReplyBar({ preview, isRecording, sending, onCancel, variant = "reply" }) {
  if (!preview || isRecording) return null;
  const isEdit = variant === "edit" || preview.variant === "edit";

  return (
    <div
      className={`wa-replyBar${isEdit ? " wa-replyBar--edit" : ""}`}
      role="region"
      aria-label={isEdit ? "Editando mensagem" : "Respondendo"}
    >
      <div className="wa-replyBar-bar" aria-hidden="true" />
      {isEdit ? (
        <span className="wa-replyBar-editIcon" aria-hidden="true">
          <IconPencil />
        </span>
      ) : null}
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
        <div className="wa-replyBar-title">{isEdit ? "Editando mensagem" : preview.title}</div>
        <div className="wa-replyBar-text">{preview.text}</div>
      </div>
      <button
        type="button"
        className="wa-iconBtn"
        onClick={onCancel}
        title={isEdit ? "Cancelar edição" : "Cancelar resposta"}
        aria-label={isEdit ? "Cancelar edição" : "Cancelar resposta"}
        disabled={sending}
      >
        <IconClose />
      </button>
    </div>
  );
}
