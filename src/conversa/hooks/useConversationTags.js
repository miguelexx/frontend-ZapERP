import { useCallback, useMemo, useState } from "react";
import { useChatStore } from "../../chats/chatsStore";
import {
  listarTags,
  adicionarTagConversa,
  removerTagConversa,
} from "../../api/tagService";

/**
 * Tags da conversa: painel de tags do cliente + toggle otimista.
 *
 * Extraído de ConversaView.jsx sem alterar comportamento: mesma origem
 * (listarTags), mesmo update otimista (setTags do conversaStore + chatsStore),
 * mesmo rollback em erro, mesmo tratamento de 409 e mesmos endpoints
 * (adicionarTagConversa / removerTagConversa). As tags carregam apenas ao abrir
 * o painel (evita toast de falha em background). Expõe `tagsOpen`/`setTagsOpen`
 * para o handler global de Esc.
 *
 * @param {{ conversaId: any, tags: any[], setTags: Function, showToast: Function }} deps
 */
export function useConversationTags({ conversaId, tags, setTags, showToast }) {
  const [allTags, setAllTags] = useState([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagMutatingId, setTagMutatingId] = useState(null);

  const selectedTagIds = useMemo(
    () => (Array.isArray(tags) ? tags.map((t) => String(t?.id)) : []),
    [tags]
  );

  const carregarTags = useCallback(
    async (opts = {}) => {
      const showError = opts.showErrorToUser !== false;
      try {
        setTagsLoading(true);
        const data = await listarTags();
        setAllTags(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Erro ao listar tags:", err);
        if (showError) {
          showToast({
            type: "error",
            title: "Falha ao carregar tags",
            message: "Não foi possível carregar as tags disponíveis.",
          });
        }
      } finally {
        setTagsLoading(false);
      }
    },
    [showToast]
  );

  const handleToggleTagPanel = useCallback(() => {
    setTagsOpen((prev) => {
      const next = !prev;
      if (next) {
        // ao abrir o painel, carrega tags e mostra toast só se falhar (usuário está vendo o painel)
        carregarTags({ showErrorToUser: true });
      }
      return next;
    });
  }, [carregarTags]);

  const handleToggleTag = useCallback(
    async (tag) => {
      if (!conversaId || !tag?.id) return;
      const alreadySelected = selectedTagIds.includes(String(tag.id));
      const previousTags = Array.isArray(tags) ? tags : [];
      const nextTags = alreadySelected
        ? previousTags.filter((t) => String(t.id) !== String(tag.id))
        : [...previousTags, tag];
      try {
        setTagMutatingId(tag.id);
        setTags(nextTags);
        const chatStore = useChatStore.getState();
        if (alreadySelected) {
          chatStore.removerTag(conversaId, tag.id);
        } else {
          chatStore.adicionarTag(conversaId, tag);
        }
        if (alreadySelected) {
          await removerTagConversa(conversaId, tag.id);
        } else {
          await adicionarTagConversa(conversaId, tag.id);
        }
      } catch (err) {
        if (!alreadySelected && err?.response?.status === 409) {
          return;
        }
        setTags(previousTags);
        useChatStore.getState().updateChat({ id: conversaId, tags: previousTags });
        console.error("Erro ao atualizar tag da conversa:", err);
        showToast({
          type: "error",
          title: "Falha ao atualizar tag",
          message: "Não foi possível atualizar as tags desta conversa.",
        });
      } finally {
        setTagMutatingId(null);
      }
    },
    [conversaId, selectedTagIds, setTags, showToast, tags]
  );

  return {
    allTags,
    tagsOpen,
    setTagsOpen,
    tagsLoading,
    tagMutatingId,
    selectedTagIds,
    handleToggleTagPanel,
    handleToggleTag,
  };
}
