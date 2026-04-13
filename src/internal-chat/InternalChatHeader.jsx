import { useEffect, useState } from "react";

function HeaderAvatar({ url, name }) {
  const [broken, setBroken] = useState(false);
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  const show = url && !broken;
  useEffect(() => setBroken(false), [url]);
  return (
    <div className="ic-thread-avatar">
      {show ? <img src={url} alt="" onError={() => setBroken(true)} /> : initial}
    </div>
  );
}

export default function InternalChatHeader({ conversation, peerOnline, peerLastSeen, formatLastSeen }) {
  const subtitle = conversation.otherEmail || "Conversa interna da equipe";
  const statusLine = peerOnline ? "Online" : peerLastSeen ? `Último acesso: ${formatLastSeen(peerLastSeen)}` : "";

  return (
    <header className="ic-thread-header">
      <HeaderAvatar url={conversation.avatarUrl} name={conversation.otherName} />
      <div className="ic-thread-header-text">
        <h2 className="ic-thread-title">{conversation.otherName}</h2>
        <p className="ic-thread-sub">{subtitle}</p>
        {statusLine ? <p className="ic-thread-status">{statusLine}</p> : null}
      </div>
      <span className="ic-thread-badge">Interno</span>
    </header>
  );
}
