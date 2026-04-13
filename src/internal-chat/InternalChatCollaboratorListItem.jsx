import { useEffect, useState } from "react";

function RowAvatar({ url, name, online }) {
  const [broken, setBroken] = useState(false);
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  const showImg = url && !broken;
  useEffect(() => setBroken(false), [url]);
  return (
    <div className="internal-chat-avatar">
      {showImg ? <img src={url} alt="" onError={() => setBroken(true)} /> : initial}
      {online ? <span className="internal-chat-online" title="Online" /> : null}
    </div>
  );
}

export default function InternalChatCollaboratorListItem({
  title,
  avatarUrl,
  online,
  subtitle,
  timeLabel,
  unreadCount,
  active,
  disabled,
  onClick,
}) {
  const unread = Number(unreadCount) || 0;
  const hasUnread = unread > 0;

  return (
    <button
      type="button"
      className={`internal-chat-row${active ? " internal-chat-row--active" : ""}${hasUnread ? " internal-chat-row--unread" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <RowAvatar url={avatarUrl} name={title} online={online} />
      <div className="internal-chat-row-body">
        <div className="internal-chat-row-title">{title}</div>
        <div className="internal-chat-row-sub">{subtitle}</div>
      </div>
      <div className="internal-chat-row-meta">
        {timeLabel ? <span className="internal-chat-time">{timeLabel}</span> : null}
        {hasUnread ? <span className="internal-chat-badge">{unread > 99 ? "99+" : unread}</span> : null}
      </div>
    </button>
  );
}
