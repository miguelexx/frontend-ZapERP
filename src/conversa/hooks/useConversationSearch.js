import { useCallback, useState } from "react";
import { useConversaStore } from "../conversaStore";

function waitForPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

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
 * nova. `scrollToMsg` é injetado; o salto da busca só segura o snap ao fim.
 *
 * `armThreadJump` segura o snap ao fim enquanto a vista vai até o resultado.
 * `prepareLoadOlder` grava a âncora antes de cada página, senão o prepend
 * joga o thread para o início e o snap devolve ao final.
 *
 * @param {{ conversaId: any, headerCompact: boolean, scrollToMsg: Function, showToast: Function, armThreadJump?: Function, prepareLoadOlder?: Function }} deps
 */
export function useConversationSearch({
  conversaId,
  headerCompact,
  scrollToMsg,
  showToast,
  armThreadJump,
  prepareLoadOlder,
}) {
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);

  // Callbacks estáveis: evitam quebrar o memo de Header/painel a cada render.
  const openMessageSearch = useCallback(() => setMessageSearchOpen(true), []);
  const closeMessageSearch = useCallback(() => setMessageSearchOpen(false), []);

  const handleSelectMessageSearchResult = useCallback(
    async (msg) => {
      const msgId = msg?.id;
      if (!msgId || !conversaId) return;
      armThreadJump?.();

      const sameConversation = () =>
        String(useConversaStore.getState().selectedId ?? "") === String(conversaId);

      let loaded = (useConversaStore.getState().mensagens || []).some((m) => String(m?.id) === String(msgId));
      let attempts = 0;
      while (!loaded && attempts < 20) {
        const st = useConversaStore.getState();
        if (!sameConversation()) return;
        if (!st.hasMore || st.loadingMore) break;
        attempts += 1;
        prepareLoadOlder?.();
        // eslint-disable-next-line no-await-in-loop
        await st.loadMore();
        if (!sameConversation()) return;
        loaded = (useConversaStore.getState().mensagens || []).some((m) => String(m?.id) === String(msgId));
        armThreadJump?.();
        // eslint-disable-next-line no-await-in-loop
        await waitForPaint();
      }

      if (!sameConversation()) return;
      if (headerCompact) setMessageSearchOpen(false);
      if (loaded) {
        /*
         * Depois do loadMore o restore da âncora ainda reaplica o fundo num frame.
         * Esperar um pouco evita que esse reajuste cancele o salto até a mensagem.
         */
        window.setTimeout(() => {
          if (!sameConversation()) return;
          scrollToMsg(msgId, { behavior: "auto" });
        }, headerCompact ? 120 : 48);
        return;
      }

      showToast({
        type: "info",
        title: "Mensagem encontrada",
        message: "O resultado existe no histórico, mas não foi possível posicionar a conversa automaticamente.",
      });
    },
    [armThreadJump, conversaId, headerCompact, prepareLoadOlder, scrollToMsg, showToast]
  );

  return {
    messageSearchOpen,
    setMessageSearchOpen,
    openMessageSearch,
    closeMessageSearch,
    handleSelectMessageSearchResult,
  };
}
