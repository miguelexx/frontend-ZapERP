import { useCallback, useState } from "react";
import { useConversaStore } from "../conversaStore";

/**
 * Busca de mensagens dentro da conversa (coordenação do painel).
 *
 * A UI/pesquisa em si vive em `ConversaMessageSearchPanel` (com seu próprio
 * debounce/cancelamento/highlight). Este hook concentra apenas o estado de
 * abertura e o posicionamento ao selecionar um resultado, extraído de
 * ConversaView.jsx sem alterar comportamento.
 *
 * Ao selecionar um resultado que ainda não está carregado, pagina via
 * `loadMore` (respeitando `hasMore`/`loadingMore`) e aborta se a conversa
 * mudar no meio — garantindo que uma seleção antiga não posicione a conversa
 * nova. `scrollToMsg` é injetado (não altera a lógica de scroll existente).
 *
 * @param {{ conversaId: any, headerCompact: boolean, scrollToMsg: Function, showToast: Function }} deps
 */
export function useConversationSearch({ conversaId, headerCompact, scrollToMsg, showToast }) {
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);

  // Callbacks estáveis: evitam quebrar o memo de Header/painel a cada render.
  const openMessageSearch = useCallback(() => setMessageSearchOpen(true), []);
  const closeMessageSearch = useCallback(() => setMessageSearchOpen(false), []);

  const handleSelectMessageSearchResult = useCallback(
    async (msg) => {
      const msgId = msg?.id;
      if (!msgId || !conversaId) return;

      let loaded = (useConversaStore.getState().mensagens || []).some((m) => String(m?.id) === String(msgId));
      let attempts = 0;
      while (!loaded && attempts < 20) {
        const st = useConversaStore.getState();
        if (String(st.selectedId ?? "") !== String(conversaId)) return;
        if (!st.hasMore || st.loadingMore) break;
        attempts += 1;
        // eslint-disable-next-line no-await-in-loop
        await st.loadMore();
        loaded = (useConversaStore.getState().mensagens || []).some((m) => String(m?.id) === String(msgId));
      }

      if (headerCompact) setMessageSearchOpen(false);
      if (loaded) {
        window.setTimeout(() => scrollToMsg(msgId), headerCompact ? 120 : 0);
        return;
      }

      showToast({
        type: "info",
        title: "Mensagem encontrada",
        message: "O resultado existe no histórico, mas não foi possível posicionar a conversa automaticamente.",
      });
    },
    [conversaId, headerCompact, scrollToMsg, showToast]
  );

  return {
    messageSearchOpen,
    setMessageSearchOpen,
    openMessageSearch,
    closeMessageSearch,
    handleSelectMessageSearchResult,
  };
}
