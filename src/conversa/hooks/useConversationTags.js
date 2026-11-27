import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConversaStore } from "../conversaStore";
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
  /*
   * Mutações em voo POR ETIQUETA (26/11/2026). Antes era um único `mutationRef`: com uma
   * etiqueta a caminho do servidor, o painel inteiro ficava desabilitado e um 2.º clique
   * noutra etiqueta (150ms depois) era descartado em silêncio. Agora só a etiqueta em voo
   * fica travada; as outras alternam em paralelo, cada uma com o seu rollback.
   */
  const inFlightRef = useRef(new Map());
  const [mutatingIds, setMutatingIds] = useState([]);
  useEffect(() => {
    inFlightRef.current = new Map();
    setMutatingIds([]);
    return () => { inFlightRef.current = new Map(); };
  }, [conversaId]);
  /** Compatível com o nome antigo: lista de ids (string) em voo, ou null. */
  const tagMutatingId = mutatingIds.length > 0 ? mutatingIds : null;

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
      const key = String(tag?.id ?? "");
      if (!conversaId || !tag?.id || inFlightRef.current.has(key)) return;
      const storeNow = useConversaStore.getState();
      if (String(storeNow.selectedId) !== String(conversaId)) return;
      const mutation = {};
      const inFlight = inFlightRef.current;
      inFlight.set(key, mutation);
      // Estado do CLIQUE, lido da store (não do closure do render): com alternâncias em
      // paralelo o closure já estaria velho e uma sobrescreveria a outra.
      const previousTags = Array.isArray(storeNow.tags) ? storeNow.tags : [];
      const alreadySelected = previousTags.some((t) => String(t?.id) === key);
      const nextTags = alreadySelected
        ? previousTags.filter((t) => String(t.id) !== key)
        : [...previousTags, tag];
      try {
        setMutatingIds((prev) => (prev.includes(key) ? prev : [...prev, key]));
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
        // Reverte só a etiqueta alterada; eventos de outras etiquetas continuam válidos.
        const current = useConversaStore.getState();
        if (inFlight.get(key) === mutation && String(current.selectedId) === String(conversaId)) {
          const currentTags = Array.isArray(current.tags) ? current.tags : [];
          setTags(alreadySelected
            ? [...currentTags.filter((t) => String(t.id) !== String(tag.id)), tag]
            : currentTags.filter((t) => String(t.id) !== String(tag.id)));
        }
        if (alreadySelected) useChatStore.getState().adicionarTag(conversaId, tag);
        else useChatStore.getState().removerTag(conversaId, tag.id);
        console.error("Erro ao atualizar tag da conversa:", err);
        showToast({
          type: "error",
          title: "Falha ao atualizar tag",
          message: "Não foi possível atualizar as tags desta conversa.",
        });
      } finally {
        if (inFlight.get(key) === mutation) {
          inFlight.delete(key);
          // Só mexe no estado se ainda é a mesma conversa (o Map é trocado ao mudar de conversa).
          if (inFlightRef.current === inFlight) {
            setMutatingIds((prev) => prev.filter((id) => id !== key));
          }
        }
      }
    },
    [conversaId, setTags, showToast]
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
