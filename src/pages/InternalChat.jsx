import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../auth/authStore";
import { SkeletonChatList } from "../components/feedback/Skeleton";
import "../components/feedback/skeleton.css";
import {
  createOrOpenInternalConversation,
  listInternalConversations,
  listInternalEmployees,
  listInternalMessages,
  sendInternalMessage,
  markInternalConversationRead,
  normalizeConversation,
} from "../api/internalChatService";
import InternalChatThread from "../internal-chat/InternalChatThread";
import {
  extractConversationIdFromPayload,
  extractMessageFromPayload,
  extractReadPayload,
  unwrapPayload,
} from "../internal-chat/payloadUtils";
import {
  normalizeInternalMessage,
  sortMessagesAsc,
  upsertMessageSorted,
  isMessageMine,
} from "../internal-chat/messageUtils";
import { useInternalChatSocket } from "../internal-chat/useInternalChatSocket";
import "./internalChat.css";

const PAGE_SIZE = 40;

function formatActivityShort(ts) {
  if (ts == null || ts === "") return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function formatLastSeen(ts) {
  if (ts == null || ts === "") return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function sortEmployees(list) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}

function sortConversations(list) {
  return [...list].sort((a, b) => {
    const ta = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
    const tb = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
    return tb - ta;
  });
}

function pickErrorMessage(err) {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    "Não foi possível carregar o chat interno."
  );
}

function InternalAvatar({ url, name, online }) {
  const [broken, setBroken] = useState(false);
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  const showImg = url && !broken;

  useEffect(() => {
    setBroken(false);
  }, [url]);

  return (
    <div className="internal-chat-avatar">
      {showImg ? <img src={url} alt="" onError={() => setBroken(true)} /> : initial}
      {online ? <span className="internal-chat-online" title="Online" /> : null}
    </div>
  );
}

export default function InternalChat() {
  const user = useAuthStore((s) => s.user);
  const myId = user?.id != null ? String(user.id) : null;

  const [leftTab, setLeftTab] = useState(/** @type {"employees" | "conversations"} */ ("employees"));
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const selectedConvIdRef = useRef(null);
  selectedConvIdRef.current = selectedConversationId;

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const [messages, setMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [threadError, setThreadError] = useState(null);
  const [nextBeforeId, setNextBeforeId] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  const messagesListRef = useRef(null);
  const conversationsRef = useRef([]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const otherUserIdForSelected = useMemo(() => {
    const c = conversations.find((x) => String(x.id) === String(selectedConversationId));
    return c?.otherUserId ?? null;
  }, [conversations, selectedConversationId]);

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [emRaw, convRaw] = await Promise.all([listInternalEmployees(), listInternalConversations(user?.id)]);
      const filtered = myId ? emRaw.filter((e) => String(e.id) !== myId) : emRaw;
      setEmployees(sortEmployees(filtered));
      setConversations(sortConversations(convRaw));
    } catch (err) {
      setError(pickErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [myId, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      setNextBeforeId(null);
      setThreadError(null);
      setSendError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setThreadLoading(true);
      setThreadError(null);
      setNextBeforeId(null);
      setSendError(null);
      try {
        const { rawMessages, nextBeforeId: nb } = await listInternalMessages(selectedConversationId, {
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        const otherUid =
          conversationsRef.current.find((x) => String(x.id) === String(selectedConversationId))?.otherUserId ?? null;
        const normalized = rawMessages
          .map((r) => normalizeInternalMessage(r, user?.id, otherUid))
          .filter(Boolean);
        setMessages(sortMessagesAsc(normalized));
        setNextBeforeId(nb && nb !== "null" && nb !== "undefined" ? nb : null);
        try {
          await markInternalConversationRead(selectedConversationId);
        } catch (_) {}
        setConversations((prev) =>
          sortConversations(
            prev.map((c) => (String(c.id) === String(selectedConversationId) ? { ...c, unreadCount: 0 } : c))
          )
        );
      } catch (err) {
        if (!cancelled) setThreadError(pickErrorMessage(err));
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedConversationId, user?.id]);

  const loadOlder = useCallback(async () => {
    if (!selectedConversationId || !nextBeforeId || olderLoading || threadLoading) return;
    const el = messagesListRef.current;
    const prevH = el?.scrollHeight ?? 0;
    const prevT = el?.scrollTop ?? 0;
    setOlderLoading(true);
    setThreadError(null);
    try {
      const { rawMessages, nextBeforeId: nb } = await listInternalMessages(selectedConversationId, {
        limit: PAGE_SIZE,
        beforeId: nextBeforeId,
      });
      const normalized = rawMessages
        .map((r) => normalizeInternalMessage(r, user?.id, otherUserIdForSelected))
        .filter(Boolean);
      setMessages((prev) => {
        const merged = [...normalized, ...prev];
        const m = new Map(merged.map((x) => [x.id, x]));
        return sortMessagesAsc([...m.values()]);
      });
      setNextBeforeId(nb && nb !== "null" && nb !== "undefined" ? nb : null);
      requestAnimationFrame(() => {
        const el2 = messagesListRef.current;
        if (el2) el2.scrollTop = el2.scrollHeight - prevH + prevT;
      });
    } catch (err) {
      setThreadError(pickErrorMessage(err));
    } finally {
      setOlderLoading(false);
    }
  }, [selectedConversationId, nextBeforeId, olderLoading, threadLoading, user?.id]);

  const handleSend = useCallback(
    async (text) => {
      const tid = selectedConversationId;
      if (!tid || !String(text || "").trim()) return;
      setSendError(null);
      setSending(true);
      try {
        const peerUid =
          conversationsRef.current.find((c) => String(c.id) === String(tid))?.otherUserId ?? null;
        const msg = await sendInternalMessage(tid, text, user?.id, peerUid);
        if (msg) setMessages((prev) => upsertMessageSorted(prev, msg));
        const trimmed = String(text).trim();
        setConversations((prev) =>
          sortConversations(
            prev.map((c) =>
              String(c.id) === String(tid)
                ? {
                    ...c,
                    lastMessage: trimmed.slice(0, 200),
                    lastActivity: msg?.createdAt ?? new Date().toISOString(),
                  }
                : c
            )
          )
        );
      } catch (err) {
        setSendError(pickErrorMessage(err));
        throw err;
      } finally {
        setSending(false);
      }
    },
    [selectedConversationId, user?.id]
  );

  useInternalChatSocket({
    onConversationCreated: (payload) => {
      const raw = unwrapPayload(payload);
      const conv = normalizeConversation(raw?.conversation ?? raw, user?.id);
      if (!conv?.id) return;
      setConversations((prev) => {
        const idx = prev.findIndex((c) => String(c.id) === String(conv.id));
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...conv };
          return sortConversations(next);
        }
        return sortConversations([...prev, conv]);
      });
    },
    onMessageCreated: (payload) => {
      const convId = extractConversationIdFromPayload(payload);
      if (!convId) return;
      const raw = extractMessageFromPayload(payload);
      const otherUid =
        conversationsRef.current.find((c) => String(c.id) === String(convId))?.otherUserId ?? null;
      const msg = normalizeInternalMessage(raw, user?.id, otherUid);
      if (!msg?.id) return;
      const openId = selectedConvIdRef.current;
      const isOpen = openId != null && String(openId) === String(convId);
      const isOwn = isMessageMine(msg, user?.id, otherUid);
      if (isOpen) {
        setMessages((prev) => upsertMessageSorted(prev, msg));
        if (!isOwn) {
          markInternalConversationRead(convId).catch(() => {});
        }
      }
      const preview = (msg.content || "").trim().slice(0, 120);
      const lastActivity = msg.createdAt || new Date().toISOString();
      setConversations((prev) =>
        sortConversations(
          prev.map((c) => {
            if (String(c.id) !== String(convId)) return c;
            if (isOwn || isOpen) {
              return {
                ...c,
                lastMessage: preview || c.lastMessage,
                lastActivity,
                unreadCount: isOpen ? 0 : Number(c.unreadCount) || 0,
              };
            }
            return {
              ...c,
              lastMessage: preview || c.lastMessage,
              lastActivity,
              unreadCount: (Number(c.unreadCount) || 0) + 1,
            };
          })
        )
      );
    },
    onConversationRead: (payload) => {
      const p = extractReadPayload(payload);
      if (!p) return;
      const cid =
        p.conversation_id != null
          ? String(p.conversation_id)
          : p.conversationId != null
            ? String(p.conversationId)
            : null;
      if (!cid) return;
      const me = user?.id != null ? String(user.id) : null;
      const readerId = p.user_id ?? p.reader_id ?? p.usuario_id ?? p.reader_user_id;
      const unreadVal = p.unread_count ?? p.unreadCount;
      setConversations((prev) =>
        sortConversations(
          prev.map((c) => {
            if (String(c.id) !== cid) return c;
            if (unreadVal != null && unreadVal !== "") {
              return { ...c, unreadCount: Number(unreadVal) || 0 };
            }
            if (me && readerId != null && String(readerId) === me) {
              return { ...c, unreadCount: 0 };
            }
            return c;
          })
        )
      );
    },
  });

  const q = search.trim().toLowerCase();

  const employeesFiltered = useMemo(() => {
    if (!q) return employees;
    return employees.filter(
      (e) => e.name.toLowerCase().includes(q) || (e.email && e.email.toLowerCase().includes(q))
    );
  }, [employees, q]);

  const conversationsFiltered = useMemo(() => {
    if (!q) return conversations;
    return conversations.filter((c) => {
      const blob = `${c.otherName} ${c.otherEmail || ""} ${c.lastMessage || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [conversations, q]);

  const selected = useMemo(
    () => conversations.find((c) => String(c.id) === String(selectedConversationId)) || null,
    [conversations, selectedConversationId]
  );

  const peerEmployee = useMemo(() => {
    if (!selected?.otherUserId) return null;
    return employees.find((e) => String(e.id) === String(selected.otherUserId)) ?? null;
  }, [employees, selected]);

  async function handleSelectEmployee(emp) {
    if (!emp?.id || actionLoading) return;
    const hit = conversations.find((c) => c.otherUserId && String(c.otherUserId) === String(emp.id));
    if (hit) {
      setSelectedConversationId(hit.id);
      setLeftTab("conversations");
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const conv = await createOrOpenInternalConversation(emp.id, user?.id);
      const next = await listInternalConversations(user?.id);
      setConversations(sortConversations(next));
      if (conv?.id) {
        setSelectedConversationId(conv.id);
      } else {
        const found = next.find((c) => String(c.otherUserId) === String(emp.id));
        if (found) setSelectedConversationId(found.id);
      }
      setLeftTab("conversations");
    } catch (err) {
      setError(pickErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  function handleSelectConversation(conv) {
    if (!conv?.id) return;
    setSelectedConversationId(conv.id);
  }

  function employeeForConversationRow(c) {
    if (!c?.otherUserId) return null;
    return employees.find((e) => String(e.id) === String(c.otherUserId)) ?? null;
  }

  const retryThread = useCallback(() => {
    if (!selectedConversationId) return;
    setThreadError(null);
    setThreadLoading(true);
    listInternalMessages(selectedConversationId, { limit: PAGE_SIZE })
      .then(({ rawMessages, nextBeforeId: nb }) => {
        const normalized = rawMessages
          .map((r) => normalizeInternalMessage(r, user?.id, otherUserIdForSelected))
          .filter(Boolean);
        setMessages(sortMessagesAsc(normalized));
        setNextBeforeId(nb && nb !== "null" && nb !== "undefined" ? nb : null);
      })
      .catch((err) => setThreadError(pickErrorMessage(err)))
      .finally(() => setThreadLoading(false));
  }, [selectedConversationId, user?.id, otherUserIdForSelected]);

  return (
    <div className="internal-chat-root">
      <aside className="internal-chat-sidebar" aria-label="Lista de equipe e conversas internas">
        <header className="internal-chat-head">
          <h1>Chat interno</h1>
          <p>Mensagens entre funcionários da sua empresa. Separado do atendimento WhatsApp.</p>
        </header>

        <div className="internal-chat-search">
          <label htmlFor="internal-chat-search-input" className="visually-hidden">
            Buscar
          </label>
          <input
            id="internal-chat-search-input"
            type="search"
            autoComplete="off"
            placeholder={leftTab === "employees" ? "Buscar por nome ou e-mail…" : "Buscar conversa ou mensagem…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="internal-chat-tabs" role="tablist" aria-label="Seções">
          <button
            type="button"
            role="tab"
            aria-selected={leftTab === "employees"}
            className="internal-chat-tab"
            onClick={() => setLeftTab("employees")}
          >
            Funcionários
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={leftTab === "conversations"}
            className="internal-chat-tab"
            onClick={() => setLeftTab("conversations")}
          >
            Conversas
          </button>
        </div>

        {error ? (
          <div className="internal-chat-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => loadData()}>
              Tentar novamente
            </button>
          </div>
        ) : null}

        <div className="internal-chat-list-wrap">
          {loading ? (
            <div className="internal-chat-skel-pad">
              <SkeletonChatList />
            </div>
          ) : leftTab === "employees" ? (
            employeesFiltered.length === 0 ? (
              <div className="internal-chat-panel" style={{ padding: "24px 16px" }}>
                <p style={{ fontSize: "0.88rem", color: "var(--ds-text-secondary)" }}>
                  {q ? "Nenhum funcionário encontrado para a busca." : "Nenhum outro funcionário disponível no momento."}
                </p>
              </div>
            ) : (
              employeesFiltered.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  className="internal-chat-row"
                  disabled={actionLoading}
                  onClick={() => handleSelectEmployee(emp)}
                >
                  <InternalAvatar url={emp.avatarUrl} name={emp.name} online={emp.isOnline} />
                  <div className="internal-chat-row-body">
                    <div className="internal-chat-row-title">{emp.name}</div>
                    <div className="internal-chat-row-sub">
                      {emp.email || "—"}
                      {!emp.isOnline && emp.lastSeen ? ` · ${formatLastSeen(emp.lastSeen)}` : ""}
                    </div>
                  </div>
                </button>
              ))
            )
          ) : conversationsFiltered.length === 0 ? (
            <div className="internal-chat-panel" style={{ padding: "24px 16px" }}>
              <p style={{ fontSize: "0.88rem", color: "var(--ds-text-secondary)" }}>
                {q ? "Nenhuma conversa encontrada." : "Nenhuma conversa interna ainda. Selecione um funcionário para começar."}
              </p>
            </div>
          ) : (
            conversationsFiltered.map((c) => {
              const active = String(c.id) === String(selectedConversationId);
              const rowEmp = employeeForConversationRow(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`internal-chat-row${active ? " internal-chat-row--active" : ""}`}
                  onClick={() => handleSelectConversation(c)}
                >
                  <InternalAvatar url={c.avatarUrl} name={c.otherName} online={Boolean(rowEmp?.isOnline)} />
                  <div className="internal-chat-row-body">
                    <div className="internal-chat-row-title">{c.otherName}</div>
                    <div className="internal-chat-row-sub">{c.lastMessage || "Sem mensagens"}</div>
                  </div>
                  <div className="internal-chat-row-meta">
                    <span className="internal-chat-time">{formatActivityShort(c.lastActivity)}</span>
                    {c.unreadCount > 0 ? <span className="internal-chat-badge">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span> : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <main className="internal-chat-main" aria-label="Área da conversa interna">
        {!selected ? (
          <div className="internal-chat-panel">
            <div className="internal-chat-empty-icon" aria-hidden>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 20c0-3.31 3.58-6 8-6s8 2.69 8 6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M19 8h3M20.5 6.5v3" strokeLinecap="round" />
              </svg>
            </div>
            <h2>Selecione uma conversa</h2>
            <p>Escolha um funcionário ou uma conversa interna na coluna à esquerda para ver o histórico e enviar mensagens.</p>
            <span className="internal-chat-chip">Área interna · não é WhatsApp</span>
          </div>
        ) : (
          <InternalChatThread
            conversation={selected}
            myUserId={user?.id}
            messagesListRef={messagesListRef}
            peerOnline={Boolean(peerEmployee?.isOnline)}
            peerLastSeen={peerEmployee?.lastSeen ?? null}
            formatLastSeen={formatLastSeen}
            messages={messages}
            initLoading={threadLoading}
            olderLoading={olderLoading}
            error={threadError}
            hasMoreOlder={Boolean(nextBeforeId)}
            onLoadOlder={loadOlder}
            onRetryLoad={retryThread}
            onSend={handleSend}
            sending={sending}
            sendError={sendError}
          />
        )}
      </main>
    </div>
  );
}
