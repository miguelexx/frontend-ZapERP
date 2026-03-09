import { useState } from "react"
import ChatList from "../chats/chatList"
import ConversaView from "../conversa/ConversaView"
import Dashboard from "../dashboard/Dashboard"
import { useAuthStore } from "../auth/authStore"
import { useNotificationStore } from "../notifications/notificationStore"
import { puxarChatFila, getChatById } from "../conversa/conversaService"
import GlobalNotifications from "../notifications/GlobalNotifications"

export default function AppLayout() {
  const [chatSelecionado, setChatSelecionado] = useState(null)
  const [tab, setTab] = useState("atendimento")
  const [loadingFila, setLoadingFila] = useState(false)

  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const showToast = useNotificationStore((s) => s.showToast)

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
      showToast?.({ type: "warning", title: "Fila vazia", message: "Nenhuma conversa disponível na fila no momento." })
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
