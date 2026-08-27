import { safeString } from "../../utils/conversaViewHelpers";
import { replySnippetDisplay } from "../../utils/conversaMessageDisplay";

export default function QuotedReply({ replyMeta, out, peerName, onJumpToReply }) {
  if (!replyMeta) return null;

  const jump = (e) => {
    e?.stopPropagation?.();
    const rid = replyMeta?.replyToId;
    if (rid && onJumpToReply) onJumpToReply(rid);
  };

  return (
    <div
      className={`wa-replyCtx ${out ? "isOut" : "isIn"}`}
      aria-label="Mensagem citada"
      role="button"
      tabIndex={0}
      title="Ver mensagem respondida"
      onClick={jump}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          const rid = replyMeta?.replyToId;
          if (rid && onJumpToReply) onJumpToReply(rid);
        }
      }}
    >
      <div className="wa-replyCtx-bar" aria-hidden="true" />
      <div className="wa-replyCtx-content">
        {safeString(replyMeta.thumb) ? (
          <img
            src={replyMeta.thumb}
            alt=""
            className="wa-replyCtx-thumb"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className="wa-replyCtx-textStack">
          <div className="wa-replyCtx-name">
            {replyMeta.name && replyMeta.name !== "Contato"
              ? replyMeta.name
              : (peerName || replyMeta.name)}
          </div>
          <div className="wa-replyCtx-snippet">{replySnippetDisplay(replyMeta)}</div>
        </div>
      </div>
    </div>
  );
}
