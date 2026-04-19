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
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle?.(conversationId, e.currentTarget);
      }}
      title="Ações da conversa"
    >
      <span className="chat-row-action-trigger-chev" aria-hidden>
        <ChevronDown size={15} strokeWidth={2} />
      </span>
    </button>
  );
}

const ConversationActionMenuTrigger = memo(ConversationActionMenuTriggerBase);

export default ConversationActionMenuTrigger;

