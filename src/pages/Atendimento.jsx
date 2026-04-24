import { useEffect } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import ChatList from "../chats/chatList";
import ConversaView from "../conversa/ConversaView";
import { useConversaStore } from "../conversa/conversaStore";
import { useChatStore } from "../chats/chatsStore";
import { updateDocumentTitleFromChats } from "../socket/socket";

export default function Atendimento() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const carregarConversa = useConversaStore((s) => s.carregarConversa);
  const selectedId = useConversaStore((s) => s.selectedId);
  const chats = useChatStore((s) => s.chats);

  useEffect(() => {
    updateDocumentTitleFromChats();
  }, [chats]);

  const isRoot = location.pathname === "/atendimento";
  const openConversaId = location.state?.openConversaId;

  useEffect(() => {
    if (openConversaId) {
      carregarConversa(openConversaId);
      navigate("/atendimento", { replace: true, state: {} });
    }
  }, [openConversaId, carregarConversa, navigate]);

  useEffect(() => {
    const q = searchParams.get("conversa");
    if (q) {
      carregarConversa(q);
      navigate({ pathname: "/atendimento", search: "", replace: true });
    }
  }, [searchParams, carregarConversa, navigate]);

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