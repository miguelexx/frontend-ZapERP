import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

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

export default function InternalChatHeader({ conversation, peerOnline, peerLastSeen, formatLastSeen, onBack }) {
  const subtitle = conversation.otherEmail || "Conversa interna da equipe";
  const statusLine = peerOnline ? "Online" : peerLastSeen ? `Último acesso: ${formatLastSeen(peerLastSeen)}` : "";

  return (
    <header className="ic-thread-header">
      {typeof onBack === "function" ? (
        <button type="button" className="ic-thread-back" onClick={onBack} aria-label="Voltar à lista de colaboradores">
          <ArrowLeft size={22} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
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
