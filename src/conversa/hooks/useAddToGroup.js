import { useCallback, useEffect, useState } from "react";
import api from "../../api/http";
import { useChatStore } from "../../chats/chatsStore";
import { fetchChats } from "../../chats/chatService";
import { isGroupConversation } from "../../utils/conversaUtils";

/**
 * Fluxo "Adicionar contato a um grupo" (cartão de contato → escolher grupo).
 *
 * Extraído de ConversaView.jsx sem alterar comportamento: mesmos estados,
 * mesmo endpoint (POST /chats/:grupoId/participantes), mesma origem dos grupos
 * (cache do chatsStore ou fetchChats) e mesmo tratamento de erro/toasts.
 *
 * @param {(t: object) => void} showToast
 */
export function useAddToGroup(showToast) {
  const [addToGroupModal, setAddToGroupModal] = useState({ open: false, telefone: null, nome: null });
  const [addToGroupGrupos, setAddToGroupGrupos] = useState([]);
  const [addToGroupLoading, setAddToGroupLoading] = useState(false);
  const [addToGroupSending, setAddToGroupSending] = useState(false);

  const handleAdicionarGrupoContact = useCallback((meta) => {
    if (!meta?.telefone) {
      showToast({ type: "warning", title: "Telefone indisponível", message: "Este contato não possui número." });
      return;
    }
    setAddToGroupModal({ open: true, telefone: meta.telefone, nome: meta.nome || "Contato" });
  }, [showToast]);

  const closeAddToGroupModal = useCallback(() => {
    setAddToGroupModal({ open: false, telefone: null, nome: null });
    setAddToGroupGrupos([]);
    setAddToGroupSending(false);
  }, []);

  const confirmAddToGroup = useCallback(
    async (grupo) => {
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
    },
    [addToGroupModal, addToGroupSending, showToast, closeAddToGroupModal]
  );

  useEffect(() => {
    if (!addToGroupModal?.open) {
      setAddToGroupGrupos([]);
      setAddToGroupLoading(false);
      return;
    }
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
  }, [addToGroupModal?.open]);

  return {
    addToGroupModal,
    addToGroupGrupos,
    addToGroupLoading,
    addToGroupSending,
    handleAdicionarGrupoContact,
    closeAddToGroupModal,
    confirmAddToGroup,
  };
}
