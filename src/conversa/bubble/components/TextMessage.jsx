import { formatHora } from "../../utils/conversaViewHelpers";
import { renderTextWithLinks } from "../../utils/conversaViewFormat";
import MessageStatus from "./MessageStatus";
import EditedLabel from "./EditedLabel";
import { Pin, Star } from "lucide-react";

/*
 * Fixada/favorita ao lado da hora, como no WhatsApp (26/11/2026). Os selos moravam só no meta
 * flutuante, que fica escondido em toda bolha com hora inline (texto): "Favoritar" não mudava
 * nada visível na mensagem mais comum.
 */
function InlineMarks({ isPinned, isStarred }) {
  if (!isPinned && !isStarred) return null;
  return (
    <>
      {isPinned ? <Pin className="wa-inlineMeta-badge" aria-label="Fixada" role="img" strokeWidth={2.2} /> : null}
      {isStarred ? (
        <Star className="wa-inlineMeta-badge" aria-label="Favorita" role="img" fill="currentColor" strokeWidth={1.8} />
      ) : null}
    </>
  );
}

export default function TextMessage({ texto, inlineMeta, msg, isGroup, isPinned = false, isStarred = false }) {
  if (inlineMeta) {
    return (
      <span className="wa-bubble-text wa-bubble-textInline">
        <span className="wa-bubble-textBody">{renderTextWithLinks(texto)}</span>
        <span className="wa-inlineMeta" aria-label="Horário e status">
          <InlineMarks isPinned={isPinned} isStarred={isStarred} />
          <EditedLabel msg={msg} />
          <span className="wa-inlineTime">{formatHora(msg?.criado_em)}</span>
          <MessageStatus msg={msg} isGroup={Boolean(isGroup)} />
        </span>
      </span>
    );
  }

  return <span className="wa-bubble-text">{renderTextWithLinks(texto)}</span>;
}

/**
 * Bolha que não tem conteúdo renderizável — mídia recebida sem URL, mensagem sem tipo. Mostra o
 * rótulo tipado ("🎤 Áudio", "📷 Foto", "Mensagem").
 *
 * O horário vem junto: antes este ramo devolvia só o rótulo e a bolha ficava SEM hora e SEM tique,
 * porque nem o meta inline (que mora no TextMessage) nem o flutuante (que o shell só desenha com
 * showFloatingMetaTime) alcançavam o fallback. No WhatsApp toda bolha tem hora — sem ela o
 * atendente não sabe quando o cliente mandou aquilo.
 */
export function FallbackMessage({ label, inlineMeta, msg, isGroup, isPinned = false, isStarred = false }) {
  if (inlineMeta) {
    return (
      <span className="wa-bubble-text wa-muted wa-bubble-textInline">
        <span className="wa-bubble-textBody">{label}</span>
        <span className="wa-inlineMeta" aria-label="Horário e status">
          <InlineMarks isPinned={isPinned} isStarred={isStarred} />
          <EditedLabel msg={msg} />
          <span className="wa-inlineTime">{formatHora(msg?.criado_em)}</span>
          <MessageStatus msg={msg} isGroup={Boolean(isGroup)} />
        </span>
      </span>
    );
  }
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
