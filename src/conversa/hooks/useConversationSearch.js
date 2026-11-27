import { useCallback, useRef, useState } from "react";
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

/* Quanto esperar uma página de histórico JÁ em voo (de uma escolha anterior ou do scroll). */
const LOAD_MORE_IDLE_WAIT_MS = 12_000;
/* Teto de esperas por páginas alheias: o scroll pode ir pedindo páginas sem parar. */
const MAX_FOREIGN_WAITS = 25;
const MAX_OWN_PAGES = 20;

/**
 * Resolve quando a store termina a página em voo (`loadingMore` volta a false).
 * `false` = desistiu por tempo. Assina a store em vez de girar quadros à espera.
 */
function waitForLoadMoreIdle(timeoutMs) {
  return new Promise((resolve) => {
    if (!useConversaStore.getState().loadingMore) {
      resolve(true);
      return;
    }
    let done = false;
    let unsubscribe = null;
    let timer = null;
    const finish = (ok) => {
      if (done) return;
      done = true;
      unsubscribe?.();
      if (timer != null) clearTimeout(timer);
      resolve(ok);
    };
    unsubscribe = useConversaStore.subscribe((state) => {
      if (!state.loadingMore) finish(true);
    });
    timer = setTimeout(() => finish(false), timeoutMs);
    // A página pode ter acabado entre o getState e o subscribe.
    if (!useConversaStore.getState().loadingMore) finish(true);
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
 * A ÚLTIMA escolha vence (27/11/2026, R5-02). Com o painel encaixado o atendente percorre
 * os resultados com ↑/↓/Enter; duas escolhas seguidas eram duas corridas sem ordem: a mais
 * antiga terminava de paginar e puxava a thread de volta, e a nova via `loadingMore` da
 * outra, desistia e mostrava "não foi possível posicionar". Agora cada escolha leva um
 * número; depois de cada espera, a que já não é a última sai calada. Página em voo não é
 * motivo para desistir: espera ela acabar (com teto) e segue.
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
  const selectSeqRef = useRef(0);

  // Callbacks estáveis: evitam quebrar o memo de Header/painel a cada render.
  const openMessageSearch = useCallback(() => setMessageSearchOpen(true), []);
  const closeMessageSearch = useCallback(() => setMessageSearchOpen(false), []);

  const handleSelectMessageSearchResult = useCallback(
    /**
     * @param {object} msg resultado da busca
     * @param {{ docked?: boolean }} [opts] o painel diz se está ENCAIXADO como coluna
     *   (desktop largo, 26/11/2026). Encaixado ele fica aberto — não tapa a thread e o
     *   atendente percorre os resultados com ↑/↓/Enter. Sobreposto (celular, tablet, desktop
     *   estreito) fecha ao escolher, senão o resultado pulado ficava atrás do painel.
     */
    async (msg, opts) => {
      const msgId = msg?.id;
      if (!msgId || !conversaId) return;
      const seq = ++selectSeqRef.current;
      const closeAfterSelect = headerCompact || opts?.docked !== true;
      armThreadJump?.();

      const sameConversation = () =>
        String(useConversaStore.getState().selectedId ?? "") === String(conversaId);
      // Outra escolha começou depois desta, ou a conversa mudou: esta sai sem mexer em nada.
      const stale = () => seq !== selectSeqRef.current || !sameConversation();
      const isLoaded = () =>
        (useConversaStore.getState().mensagens || []).some((m) => String(m?.id) === String(msgId));

      let loaded = false;
      let ownPages = 0;
      let foreignWaits = 0;
      for (;;) {
        if (stale()) return;
        const st = useConversaStore.getState();
        if (st.loadingMore) {
          /*
           * Página em voo (escolha anterior ou scroll): saltar antes de ela acabar deixava o
           * restore da âncora dela puxar a vista de volta; desistir dava o falso "não foi
           * possível posicionar". Espera, renova a trava do snap e reavalia.
           */
          if (foreignWaits >= MAX_FOREIGN_WAITS) break;
          foreignWaits += 1;
          // eslint-disable-next-line no-await-in-loop
          const idle = await waitForLoadMoreIdle(LOAD_MORE_IDLE_WAIT_MS);
          if (stale()) return;
          armThreadJump?.();
          // eslint-disable-next-line no-await-in-loop
          await waitForPaint();
          if (!idle) break;
          continue;
        }
        loaded = isLoaded();
        if (loaded || !st.hasMore || ownPages >= MAX_OWN_PAGES) break;
        ownPages += 1;
        prepareLoadOlder?.();
        // eslint-disable-next-line no-await-in-loop
        await st.loadMore();
        if (stale()) return;
        armThreadJump?.();
        // eslint-disable-next-line no-await-in-loop
        await waitForPaint();
      }

      if (stale()) return;
      loaded = isLoaded();
      if (closeAfterSelect) setMessageSearchOpen(false);
      if (loaded) {
        /*
         * Depois do loadMore o restore da âncora ainda reaplica o fundo num frame.
         * Esperar um pouco evita que esse reajuste cancele o salto até a mensagem.
         */
        window.setTimeout(() => {
          if (stale()) return;
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
