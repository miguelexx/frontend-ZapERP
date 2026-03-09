import { useEffect } from "react";
import { useNotificationStore } from "./notificationStore";
import { useChatStore } from "../chats/chatsStore";
import Toast from "../components/feedback/Toast";
import "../components/feedback/toast.css";

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

  return (
    <Toast
      title={toast.title}
      message={toast.message}
      type={toast.type || "info"}
      onClose={clearToast}
    />
  );
}
