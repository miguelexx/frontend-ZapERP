import { useEffect } from "react";
import { useNotificationStore } from "./notificationStore";
import { useChatStore } from "../chats/chatsStore";

const TITLE_BASE = "ZapERP — Atendimento inteligente";

export default function GlobalNotifications() {
  const toast = useNotificationStore((s) => s.toast);
  const clearToast = useNotificationStore((s) => s.clearToast);
  const chats = useChatStore((s) => s.chats || []);

  useEffect(() => {
    const total = chats.reduce((acc, c) => acc + Number(c?.unread_count ?? 0), 0);
    document.title = total > 0 ? `(${total}) ${TITLE_BASE}` : TITLE_BASE;
    return () => {
      document.title = TITLE_BASE;
    };
  }, [chats]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 4500);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;
  const isError = toast.type === "error";
  const isWarning = toast.type === "warning";
  const borderColor = isError ? "#dc2626" : isWarning ? "#ea580c" : "#e2e8f0";
  const titleColor = isError ? "#991b1b" : isWarning ? "#c2410c" : "#0f172a";
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={toast.title}
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        maxWidth: "90vw",
        padding: "14px 20px",
        borderRadius: 8,
        background: "#fff",
        border: `1px solid ${borderColor}`,
        borderLeftWidth: 4,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: titleColor }}>{toast.title}</div>
        {toast.message ? <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{toast.message}</div> : null}
      </div>
      <button
        type="button"
        onClick={clearToast}
        aria-label="Fechar"
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: 4,
          fontSize: 18,
          lineHeight: 1,
          color: "#64748b",
        }}
      >
        ×
      </button>
    </div>
  );
}
