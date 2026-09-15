import { memo } from "react";
import { ChevronDown } from "lucide-react";

function ConversationActionMenuTriggerBase({
  conversationId,
  isOpen,
  onToggle,
}) {
  return (
    <button
      type="button"
      className={`chat-row-action-trigger ${isOpen ? "is-open" : ""}`}
      aria-label="Abrir ações da conversa"
      aria-haspopup="menu"
      aria-expanded={isOpen ? "true" : "false"}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle?.(conversationId, e.currentTarget);
      }}
    >
      <span className="chat-row-action-trigger-chev" aria-hidden>
        <ChevronDown size={17} strokeWidth={1.8} />
      </span>
    </button>
  );
}

const ConversationActionMenuTrigger = memo(ConversationActionMenuTriggerBase);

export default ConversationActionMenuTrigger;

