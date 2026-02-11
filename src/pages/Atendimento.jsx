import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import ChatList from "../chats/chatList";
import ConversaView from "../conversa/ConversaView";
import { useConversaStore } from "../conversa/conversaStore";

export default function Atendimento() {
  const location = useLocation();
  const navigate = useNavigate();
  const carregarConversa = useConversaStore((s) => s.carregarConversa);
  const selectedId = useConversaStore((s) => s.selectedId);

  const isRoot = location.pathname === "/atendimento";
  const openConversaId = location.state?.openConversaId;

  useEffect(() => {
    if (openConversaId) {
      carregarConversa(openConversaId);
      navigate("/atendimento", { replace: true, state: {} });
    }
  }, [openConversaId, carregarConversa, navigate]);

  return (
    <div className={`atendimento-layout ${selectedId ? "conversation-open" : ""}`}>
      <aside className="atendimento-sidebar">
        <ChatList />
      </aside>

      <main className="atendimento-chat-area">
        {isRoot ? <ConversaView /> : <Outlet />}
      </main>
    </div>
  );
}