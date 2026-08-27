import { formatHora } from "../../utils/conversaViewHelpers";
import { renderTextWithLinks } from "../../utils/conversaViewFormat";
import MessageStatus from "./MessageStatus";

export default function TextMessage({ texto, inlineMeta, msg, isGroup }) {
  if (inlineMeta) {
    return (
      <span className="wa-bubble-text wa-bubble-textInline">
        {renderTextWithLinks(texto)}
        <span className="wa-inlineMeta" aria-label="Horário e status">
          <span className="wa-inlineTime">{formatHora(msg?.criado_em)}</span>
          <MessageStatus msg={msg} isGroup={Boolean(isGroup)} />
        </span>
      </span>
    );
  }

  return <span className="wa-bubble-text">{renderTextWithLinks(texto)}</span>;
}

export function FallbackMessage({ label }) {
  return <span className="wa-bubble-text wa-muted">{label}</span>;
}

export function CallMessage({ texto }) {
  return (
    <div className="wa-callBubble">
      <div className="wa-callIcon" aria-hidden="true">📞</div>
      <div className="wa-callText">
        {texto || "Ligação via WhatsApp"}
      </div>
    </div>
  );
}
