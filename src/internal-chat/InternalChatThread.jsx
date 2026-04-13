import { useCallback, useEffect, useRef, useState } from "react";
import { SkeletonLine } from "../components/feedback/Skeleton";
import "../components/feedback/skeleton.css";
import { formatMessageTime, isMessageMine } from "./messageUtils";

function assignRefs(el, a, b) {
  a.current = el;
  if (b) b.current = el;
}

function ThreadAvatar({ url, name }) {
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

export default function InternalChatThread({
  conversation,
  myUserId,
  messagesListRef,
  peerOnline = false,
  peerLastSeen = null,
  formatLastSeen = () => "",
  messages,
  initLoading,
  olderLoading,
  error,
  hasMoreOlder,
  onLoadOlder,
  onRetryLoad,
  onSend,
  sending,
  sendError,
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickBottomRef = useRef(true);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (initLoading || olderLoading) return;
    if (stickBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom(messages.length < 8 ? "auto" : "smooth"));
    }
  }, [messages, initLoading, olderLoading, scrollToBottom]);

  useEffect(() => {
    stickBottomRef.current = true;
    if (!initLoading && messages.length) {
      requestAnimationFrame(() => scrollToBottom("auto"));
    }
  }, [conversation?.id, initLoading, messages.length, scrollToBottom]);

  function onScrollList() {
    const el = listRef.current;
    if (!el) return;
    const threshold = 80;
    stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    try {
      await onSend(text);
      setDraft("");
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!conversation) return null;

  const subtitle = conversation.otherEmail || "Conversa interna da equipe";
  const statusLine = peerOnline ? "Online" : peerLastSeen ? `Último acesso: ${formatLastSeen(peerLastSeen)}` : "";

  return (
    <div className="ic-thread">
      <header className="ic-thread-header">
        <ThreadAvatar url={conversation.avatarUrl} name={conversation.otherName} />
        <div className="ic-thread-header-text">
          <h2 className="ic-thread-title">{conversation.otherName}</h2>
          <p className="ic-thread-sub">{subtitle}</p>
          {statusLine ? <p className="ic-thread-status">{statusLine}</p> : null}
        </div>
        <span className="ic-thread-badge">Interno</span>
      </header>

      <div className="ic-thread-body">
        {error && !initLoading ? (
          <div className="ic-thread-banner ic-thread-banner--error" role="alert">
            <span>{error}</span>
            <button type="button" className="ic-thread-banner-btn" onClick={onRetryLoad}>
              Tentar novamente
            </button>
          </div>
        ) : null}

        <div
          className="ic-thread-messages-wrap"
          ref={(el) => assignRefs(el, listRef, messagesListRef)}
          onScroll={onScrollList}
        >
          {hasMoreOlder ? (
            <div className="ic-thread-load-more">
              <button type="button" className="ic-thread-load-more-btn" disabled={olderLoading} onClick={onLoadOlder}>
                {olderLoading ? "Carregando…" : "Carregar mensagens anteriores"}
              </button>
            </div>
          ) : null}

          {initLoading ? (
            <div className="ic-thread-skel" aria-busy="true">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className={`ic-thread-skel-row ${i % 2 !== 0 ? "ic-thread-skel-row--out" : ""}`}>
                  <SkeletonLine width={i % 3 === 0 ? "72%" : "48%"} />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="ic-thread-empty">
              <div className="ic-thread-empty-icon" aria-hidden>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="ic-thread-empty-title">Nenhuma mensagem ainda</p>
              <p className="ic-thread-empty-text">Envie a primeira mensagem abaixo. Ela é exclusiva desta conversa interna.</p>
            </div>
          ) : (
            <ul className="ic-thread-msg-list" aria-label="Mensagens">
              {messages.map((m, idx) => {
                const mine = isMessageMine(m, myUserId, conversation?.otherUserId);
                const prev = messages[idx - 1];
                const prevMine = prev ? isMessageMine(prev, myUserId, conversation?.otherUserId) : null;
                const cluster = prevMine === mine;
                return (
                  <li
                    key={m.id}
                    className={`ic-thread-msg${mine ? " ic-thread-msg--mine" : ""}${cluster ? " ic-thread-msg--cluster" : ""}`}
                  >
                    <div className="ic-thread-bubble">
                      <p className="ic-thread-bubble-text">{m.content || <span className="ic-thread-muted">(sem texto)</span>}</p>
                      <div className="ic-thread-bubble-meta">
                        <time className="ic-thread-bubble-time" dateTime={m.createdAt ? String(m.createdAt) : undefined}>
                          {formatMessageTime(m.createdAt)}
                        </time>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <footer className="ic-thread-footer">
        {sendError ? (
          <div className="ic-thread-send-err" role="status">
            {sendError}
          </div>
        ) : null}
        <div className="ic-thread-composer">
          <textarea
            ref={inputRef}
            className="ic-thread-input"
            rows={2}
            placeholder="Escreva uma mensagem… (Shift+Enter para nova linha)"
            value={draft}
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Mensagem"
          />
          <button type="button" className="ic-thread-send" disabled={sending || !draft.trim()} onClick={handleSend}>
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </footer>
    </div>
  );
}
