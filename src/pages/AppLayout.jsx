import { useState, useEffect } from "react"
import ChatList from "../chats/chatList"
import ConversaView from "../conversa/ConversaView"
import Dashboard from "../dashboard/Dashboard"
import { useAuthStore } from "../auth/authStore"
import { useChatStore } from "../chats/chatsStore"
import { useNotificationStore } from "../notifications/notificationStore"
import { puxarChatFila, getChatById } from "../conversa/conversaService"

const TITLE_BASE = "Zap ERP"

function GlobalNotifications() {
  const toast = useNotificationStore((s) => s.toast)
  const clearToast = useNotificationStore((s) => s.clearToast)
  const chats = useChatStore((s) => s.chats || [])

  useEffect(() => {
    const total = chats.reduce((acc, c) => acc + Number(c?.unread_count ?? 0), 0)
    document.title = total > 0 ? `(${total}) ${TITLE_BASE}` : TITLE_BASE
    return () => { document.title = TITLE_BASE }
  }, [chats])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clearToast, 4500)
    return () => clearTimeout(t)
  }, [toast, clearToast])

  if (!toast) return null
  const isError = toast.type === "error"
  const isWarning = toast.type === "warning"
  const borderColor = isError ? "#dc2626" : isWarning ? "#ea580c" : "#e2e8f0"
  const titleColor = isError ? "#991b1b" : isWarning ? "#c2410c" : "#0f172a"
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
  )
}

export default function AppLayout() {
  const [chatSelecionado, setChatSelecionado] = useState(null)
  const [tab, setTab] = useState("atendimento")
  const [loadingFila, setLoadingFila] = useState(false)

  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)

  async function handlePuxarFila() {
    if (loadingFila) return

    setLoadingFila(true)

    try {
      const resp = await puxarChatFila()

      if (resp?.conversa_id) {
        const conversa = await getChatById(resp.conversa_id)
        setChatSelecionado(conversa)
      }
    } catch (e) {
      console.error("Erro ao puxar da fila:", e)
      alert("Nenhuma conversa disponível na fila")
    } finally {
      setLoadingFila(false)
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <GlobalNotifications />
      {/* SIDEBAR */}
      <div
        style={{
          width: 340,
          borderRight: "1px solid #eee",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <strong>Zap ERP</strong>
          <button onClick={logout}>Sair</button>
        </div>

        {/* USUÁRIO */}
        <div style={{ fontSize: 12, color: "#666" }}>
          {user?.nome} ({user?.email})
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setTab("atendimento")}
            style={{
              flex: 1,
              background: tab === "atendimento" ? "#eef2ff" : "#fff",
            }}
          >
            Atendimento
          </button>

          <button
            onClick={() => setTab("dashboard")}
            style={{
              flex: 1,
              background: tab === "dashboard" ? "#eef2ff" : "#fff",
            }}
          >
            Dashboard
          </button>
        </div>

        {/* BOTÃO FILA */}
        {tab === "atendimento" && (
          <button
            onClick={handlePuxarFila}
            disabled={loadingFila}
            style={{
              padding: 10,
              borderRadius: 8,
              background: loadingFila ? "#ddd" : "#e7f0ff",
              border: "1px solid #c9dcff",
              cursor: loadingFila ? "not-allowed" : "pointer",
            }}
          >
            {loadingFila ? "⏳ Puxando..." : "📥 Puxar da fila"}
          </button>
        )}

        {/* LISTA DE CHATS */}
        {tab === "atendimento" ? (
          <ChatList
            onSelect={(c) => setChatSelecionado(c)}
            selectedId={chatSelecionado?.id}
          />
        ) : (
          <div style={{ fontSize: 12, color: "#666" }}>
            O dashboard aparece no painel principal
          </div>
        )}
      </div>

      {/* PAINEL PRINCIPAL */}
      <div style={{ flex: 1 }}>
        {tab === "dashboard" ? (
          <Dashboard />
        ) : (
          <ConversaView
            conversaSelecionada={chatSelecionado}
            onRefreshChat={() => {
              // pronto para forçar reload no futuro
            }}
          />
        )}
      </div>
    </div>
  )
}
