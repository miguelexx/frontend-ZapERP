import { MessageCircle, Sparkles } from "lucide-react";

/** Decorative only: the surrounding EmptyState supplies the accessible message. */
export default function ConversationEmptyIllustration() {
  return (
    <div className="conversation-empty-art" aria-hidden="true">
      <span className="conversation-empty-art__orbit" />
      <span className="conversation-empty-art__floor" />
      <span className="conversation-empty-art__sheet conversation-empty-art__sheet--back"><i /><i /></span>
      <span className="conversation-empty-art__sheet conversation-empty-art__sheet--front">
        <span className="conversation-empty-art__seal"><MessageCircle size={23} strokeWidth={1.6} /></span>
        <span className="conversation-empty-art__lines"><i /><i /><i /></span>
      </span>
      <span className="conversation-empty-art__spark"><Sparkles size={15} strokeWidth={1.5} /></span>
      <span className="conversation-empty-art__point" />
    </div>
  );
}
