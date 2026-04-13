import { formatMessageTime, isMessageMine } from "./messageUtils";

/**
 * Bolha de mensagem — alinhamento e cores controlados por CSS (.ic-thread-msg--mine).
 */
export default function InternalChatMessageBubble({ message, myUserId, otherUserId, cluster }) {
  const mine = isMessageMine(message, myUserId, otherUserId);
  const time = formatMessageTime(message.createdAt);
  const deleted = Boolean(message.isDeleted);

  return (
    <li
      className={`ic-thread-msg${mine ? " ic-thread-msg--mine" : ""}${cluster ? " ic-thread-msg--cluster" : ""}`}
    >
      <div className={`ic-thread-bubble${deleted ? " ic-thread-bubble--deleted" : ""}`}>
        <p className="ic-thread-bubble-text">
          {deleted ? (
            <span className="ic-thread-muted">Mensagem apagada</span>
          ) : message.content ? (
            message.content
          ) : (
            <span className="ic-thread-muted">(sem texto)</span>
          )}
        </p>
        <div className="ic-thread-bubble-meta">
          <time className="ic-thread-bubble-time" dateTime={message.createdAt ? String(message.createdAt) : undefined}>
            {time}
          </time>
        </div>
      </div>
    </li>
  );
}
