import { memo, useEffect, useRef } from "react";
import { CloudOff, RotateCw } from "lucide-react";
import EmptyState from "../components/feedback/EmptyState";
import { SkeletonChatList } from "../components/feedback/Skeleton";
import ConversationActionMenu from "./ConversationActionMenu";
import ChatListRows from "./ChatListRows";
import ConversationEmptyIllustration from "./ConversationEmptyIllustration";

/**
 * Área rolável + linhas — re-render quando `chatsFiltrados` ou estado de lista mudam.
 */
function ChatListRowsPane({
  scrollRef,
  scrollSaveRef,
  scrollTopNoncePrevRef,
  chatsFiltrados,
  chatsFiltradosLayoutKey,
  loading,
  hasStoreChats,
  tab,
  minhaFilaList,
  adminPorFuncionarioAtivo,
  zapFilterSkeleton,
  isMobileLayout,
  rowCurrentUserId,
  rowCurrentUserName,
  chatListScrollToTopNonce,
  onSelect,
  onOpenClienteSemConversa,
  openConversationId,
  onToggleMenu,
  pendentesFuncionarioSet,
  onNovoContato,
  searchAtivo = false,
  menuIsOpen,
  menuAnchorRect,
  menuActions,
  onMenuClose,
  onMenuAction,
  canLoadMoreChats = false,
  loadingMoreChats = false,
  loadMoreChatsError = "",
  onLoadMoreChats,
  onRetryList,
  listRefreshing = false,
}) {
  const filteredLen = chatsFiltrados.length;
  const loadMoreSentinelRef = useRef(null);
  /*
   * A lista NÃO carregou (27/11/2026, A3-01): erro sem próxima página para pedir. Antes a
   * Minha fila caía em "Nenhuma conversa encontrada" (a fila parecia vazia, sem aviso) e as
   * outras abas em "Carregando conversas… Há mais conversas além desta página", com um
   * "Carregar mais" que não fazia nada e o "Network Error" cru. Vale em TODAS as abas.
   * Erro do "Carregar mais" (há próxima página) continua no rodapé, com o botão de sempre.
   */
  const listLoadFailed =
    Boolean(loadMoreChatsError) &&
    !loading &&
    !loadingMoreChats &&
    // Minha fila não pagina (sem rodapé nem "Carregar mais"): ali todo erro é da lista.
    (!canLoadMoreChats || (tab === "minha_fila" && !searchAtivo));
  const showPaginationFooter =
    (tab !== "minha_fila" || searchAtivo) &&
    !loading &&
    !listLoadFailed &&
    (canLoadMoreChats || loadingMoreChats || loadMoreChatsError);
  /*
   * Nenhuma linha à vista, há próxima página e o "Carregar mais" falhou (revisão A3-01): o
   * ramo abaixo dizia "Carregando conversas…" sem nada a carregar. Mesmo painel de erro; o
   * "Tentar novamente" pede a próxima página (a 1.ª já veio).
   */
  const emptyLoadMoreFailed =
    filteredLen === 0 &&
    !listLoadFailed &&
    Boolean(loadMoreChatsError) &&
    !loading &&
    !loadingMoreChats &&
    canLoadMoreChats;
  const retryFailedLoad = listLoadFailed ? onRetryList : onLoadMoreChats;
  const canRetryList = typeof retryFailedLoad === "function";

  /*
   * Foco do "Tentar novamente" (revisão A3-01, 27/11/2026): a nova tentativa troca o painel
   * pelo esqueleto (ou desabilita o botão do rodapé) e, se falha de novo, o botão volta — mas
   * o foco já tinha caído no <body> e o teclado recomeçava do topo da página. Devolve o foco
   * ao botão quando a tentativa termina com erro, só se ninguém o levou para outro lugar.
   * Sucesso: o botão some e nada é focado.
   */
  const retryBtnRef = useRef(null);
  const retryFocusPendingRef = useRef(false);
  const runRetry = (fn) => (e) => {
    retryFocusPendingRef.current = e.currentTarget === document.activeElement;
    fn?.();
  };
  useEffect(() => {
    if (!retryFocusPendingRef.current) return;
    if (loading || listRefreshing || loadingMoreChats) return;
    retryFocusPendingRef.current = false;
    const btn = retryBtnRef.current;
    if (!btn?.isConnected || btn.disabled) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== btn) return;
    if (active !== btn) btn.focus({ preventScroll: true });
  }, [loading, listRefreshing, loadingMoreChats, loadMoreChatsError, filteredLen]);

  // Infinite scroll: ao aproximar do fim da lista, pede a próxima página.
  // Com erro, PARA (27/11/2026, revisão A3-01): o observer recriado dispara na hora com o
  // sentinela à vista, e a falha virava um laço — "Carregando…" eterno (o erro nunca ficava na
  // tela) e um GET a cada ~1s contra o servidor fora do ar. Depois do erro, só o botão
  // "Carregar mais conversas" tenta de novo; o sucesso limpa o erro e o scroll volta a pedir.
  useEffect(() => {
    if (!showPaginationFooter || !canLoadMoreChats || loadingMoreChats || loadMoreChatsError) return undefined;
    if (typeof onLoadMoreChats !== "function") return undefined;
    const root = scrollRef?.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreChats();
        }
      },
      { root, rootMargin: "160px 0px", threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    showPaginationFooter,
    canLoadMoreChats,
    loadingMoreChats,
    loadMoreChatsError,
    onLoadMoreChats,
    scrollRef,
    filteredLen,
  ]);

  /* Linhas antigas à vista e a recarga falhou: aviso discreto no fim, sem apagar o que há. */
  const listErrorFooter = listLoadFailed && filteredLen > 0 ? (
    <div className="chat-list-pagination-footer chat-list-load-error-footer">
      <p className="chat-list-pagination-error" role="alert">
        {loadMoreChatsError}
      </p>
      {canRetryList ? (
        <button
          ref={retryBtnRef}
          type="button"
          className="chat-list-load-more-btn"
          onClick={runRetry(onRetryList)}
          disabled={listRefreshing}
          aria-busy={listRefreshing || undefined}
        >
          {listRefreshing ? "Tentando…" : "Tentar novamente"}
        </button>
      ) : null}
    </div>
  ) : null;

  const paginationFooter = showPaginationFooter ? (
    <div className="chat-list-pagination-footer">
      {loadMoreChatsError ? (
        <p className="chat-list-pagination-error" role="alert">
          {loadMoreChatsError}
        </p>
      ) : null}
      {canLoadMoreChats || loadingMoreChats ? (
        <button
          type="button"
          className="chat-list-load-more-btn"
          onClick={onLoadMoreChats}
          disabled={loadingMoreChats}
          aria-busy={loadingMoreChats}
        >
          {loadingMoreChats ? "Carregando…" : "Carregar mais conversas"}
        </button>
      ) : null}
      <div ref={loadMoreSentinelRef} className="chat-list-load-more-sentinel" aria-hidden="true" />
    </div>
  ) : null;

  return (
    <>
      <div ref={scrollRef} className="chat-list-list chat-list-scroll">
        {loading && !hasStoreChats ? (
          <SkeletonChatList />
        ) : zapFilterSkeleton ? (
          <div className="zap-skeleton-list" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={`zap-skel-${i}`} className="zap-skeleton-card" />
            ))}
          </div>
        ) : filteredLen === 0 ? (
          <div className="chat-list-empty-wrap">
            {listLoadFailed || emptyLoadMoreFailed ? (
              <div className="chat-list-load-error">
                <EmptyState
                  className="chat-list-load-error__state"
                  icon={<CloudOff size={44} strokeWidth={1.5} aria-hidden="true" />}
                  title="Não foi possível carregar as conversas"
                  description={loadMoreChatsError}
                  actionLabel="Tentar novamente"
                  action={
                    canRetryList ? (
                      <button
                        ref={retryBtnRef}
                        type="button"
                        className="ds-btn ds-btn--primary chat-list-load-error__retry"
                        onClick={runRetry(retryFailedLoad)}
                        disabled={listRefreshing}
                        aria-busy={listRefreshing || undefined}
                      >
                        <RotateCw size={15} strokeWidth={2} aria-hidden="true" />
                        {listRefreshing ? "Tentando…" : "Tentar novamente"}
                      </button>
                    ) : null
                  }
                />
              </div>
            ) : showPaginationFooter && (canLoadMoreChats || loadingMoreChats) ? (
              <>
                <EmptyState
                  icon={<ConversationEmptyIllustration />}
                  title="Carregando conversas…"
                  description="Há mais conversas além desta página. Continue para ver o histórico antigo."
                  actionLabel={loadingMoreChats ? "Carregando…" : "Carregar mais conversas"}
                  action={onLoadMoreChats}
                />
                {paginationFooter}
              </>
            ) : searchAtivo ? (
              <EmptyState
                icon={<ConversationEmptyIllustration />}
                title="Nenhum cliente encontrado"
                description="Nenhum cliente com esse nome ou telefone. Verifique a busca ou cadastre um novo contato."
                actionLabel="Criar novo contato"
                action={onNovoContato}
              />
            ) : tab === "campanhas" ? (
              <EmptyState
                icon={<ConversationEmptyIllustration />}
                title="Nenhuma campanha aguardando resposta"
                description="Contatos que receberam um disparo e ainda não responderam aparecem aqui. Quando o cliente responder, a conversa vai para Minha fila."
              />
            ) : (
              <EmptyState
                icon={<ConversationEmptyIllustration />}
                title="Nenhuma conversa encontrada"
                description="Suas conversas aparecerão aqui quando você receber mensagens ou iniciar um atendimento."
                actionLabel="Criar novo contato"
                action={onNovoContato}
              />
            )}
          </div>
        ) : (
          <ChatListRows
            chatsFiltrados={chatsFiltrados}
            chatsLayoutKey={chatsFiltradosLayoutKey}
            isMobileLayout={isMobileLayout}
            scrollRef={scrollRef}
            scrollSaveRef={scrollSaveRef}
            scrollTopNoncePrevRef={scrollTopNoncePrevRef}
            chatListScrollToTopNonce={chatListScrollToTopNonce}
            onSelect={onSelect}
            onOpenClienteSemConversa={onOpenClienteSemConversa}
            currentUserId={rowCurrentUserId}
            currentUserName={rowCurrentUserName}
            openConversationId={openConversationId}
            onToggleMenu={onToggleMenu}
            pendentesFuncionarioSet={pendentesFuncionarioSet}
            showResponsavelAtendimento={
              tab === "em_atendimento" ||
              tab === "aguardando_funcionario" ||
              tab === "aguardando_atendente"
            }
          />
        )}
        {filteredLen > 0 ? paginationFooter : null}
        {listErrorFooter}
      </div>

      <ConversationActionMenu
        isOpen={menuIsOpen}
        anchorRect={menuAnchorRect}
        actions={menuActions}
        onRequestClose={onMenuClose}
        onAction={onMenuAction}
      />
    </>
  );
}

function rowsPanePropsAreEqual(prev, next) {
  if (prev.chatsFiltrados !== next.chatsFiltrados) return false;
  if (prev.chatsFiltradosLayoutKey !== next.chatsFiltradosLayoutKey) return false;
  if (prev.loading !== next.loading) return false;
  if (prev.hasStoreChats !== next.hasStoreChats) return false;
  if (prev.tab !== next.tab) return false;
  if (prev.searchAtivo !== next.searchAtivo) return false;
  if (prev.minhaFilaList !== next.minhaFilaList) return false;
  if (prev.adminPorFuncionarioAtivo !== next.adminPorFuncionarioAtivo) return false;
  if (prev.zapFilterSkeleton !== next.zapFilterSkeleton) return false;
  if (prev.isMobileLayout !== next.isMobileLayout) return false;
  if (prev.rowCurrentUserId !== next.rowCurrentUserId) return false;
  if (prev.rowCurrentUserName !== next.rowCurrentUserName) return false;
  if (prev.chatListScrollToTopNonce !== next.chatListScrollToTopNonce) return false;
  if (prev.openConversationId !== next.openConversationId) return false;
  if (prev.menuIsOpen !== next.menuIsOpen) return false;
  if (prev.menuAnchorRect !== next.menuAnchorRect) return false;
  if (prev.menuActions !== next.menuActions) return false;
  if (prev.pendentesFuncionarioSet !== next.pendentesFuncionarioSet) return false;
  if (prev.scrollRef !== next.scrollRef) return false;
  if (prev.scrollSaveRef !== next.scrollSaveRef) return false;
  if (prev.scrollTopNoncePrevRef !== next.scrollTopNoncePrevRef) return false;
  if (prev.onSelect !== next.onSelect) return false;
  if (prev.onOpenClienteSemConversa !== next.onOpenClienteSemConversa) return false;
  if (prev.onToggleMenu !== next.onToggleMenu) return false;
  if (prev.onNovoContato !== next.onNovoContato) return false;
  if (prev.onMenuClose !== next.onMenuClose) return false;
  if (prev.onMenuAction !== next.onMenuAction) return false;
  if (prev.canLoadMoreChats !== next.canLoadMoreChats) return false;
  if (prev.loadingMoreChats !== next.loadingMoreChats) return false;
  if (prev.loadMoreChatsError !== next.loadMoreChatsError) return false;
  if (prev.onLoadMoreChats !== next.onLoadMoreChats) return false;
  if (prev.onRetryList !== next.onRetryList) return false;
  if (prev.listRefreshing !== next.listRefreshing) return false;
  return true;
}

export default memo(ChatListRowsPane, rowsPanePropsAreEqual);
