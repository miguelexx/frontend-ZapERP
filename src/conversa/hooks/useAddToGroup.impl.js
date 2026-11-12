import api from "../../api/http";
import { useChatStore } from "../../chats/chatsStore";
import { fetchChats } from "../../chats/chatService";
import { isGroupConversation } from "../../utils/conversaUtils";

/**
 * Corpo do "Adicionar contato a um grupo" (fora do chunk crítico — ver lazyHookImpl.js).
 */

/**
 * Efeito ao abrir o modal: grupos do cache do chatsStore ou `fetchChats`.
 * Sem cleanup, como o original (o fechamento zera a lista pelo ramo `!open` da casca).
 */
export function loadGruposOnOpen({ setAddToGroupGrupos, setAddToGroupLoading }) {
  const cachedChats = useChatStore.getState().chats;
  const gruposEmMemoria = (Array.isArray(cachedChats) ? cachedChats : []).filter((c) => isGroupConversation(c));
  if (gruposEmMemoria.length > 0) {
    setAddToGroupGrupos(gruposEmMemoria);
    setAddToGroupLoading(false);
    return;
  }
  setAddToGroupLoading(true);
  fetchChats()
    .then((list) => {
      const grupos = (Array.isArray(list) ? list : []).filter((c) => isGroupConversation(c));
      setAddToGroupGrupos(grupos);
    })
    .catch(() => setAddToGroupGrupos([]))
    .finally(() => setAddToGroupLoading(false));
}

/** `ctx` é o snapshot do hook casca no momento do clique. */
export async function confirmAddToGroup(ctx, grupo) {
  const { addToGroupModal, addToGroupSending, showToast, setAddToGroupSending, closeAddToGroupModal } = ctx;
  if (!grupo?.id || !addToGroupModal?.telefone || addToGroupSending) return;
  setAddToGroupSending(true);
  try {
    await api.post(`/chats/${grupo.id}/participantes`, { telefone: addToGroupModal.telefone });
    showToast({ type: "success", title: "Adicionado", message: `${addToGroupModal.nome} foi adicionado ao grupo.` });
    closeAddToGroupModal();
  } catch (e) {
    const status = e?.response?.status;
    const msg = e?.response?.data?.error || e.message;
    if (status === 404 || status === 501 || msg?.toLowerCase?.().includes("not found") || msg?.toLowerCase?.().includes("não suportado")) {
      showToast({
        type: "info",
        title: "Funcionalidade indisponível",
        message: "Adicionar contato a grupo pode não estar disponível nesta instância.",
      });
    } else {
      showToast({ type: "error", title: "Falha ao adicionar", message: msg || "Não foi possível adicionar ao grupo." });
    }
  } finally {
    setAddToGroupSending(false);
  }
}
