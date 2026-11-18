import { memo, useCallback, useMemo, useRef } from "react";
import { Archive, Undo2 } from "lucide-react";
import { getMessageListReactKey } from "./conversaStore";
import { getStatusAtendimentoEffective, isClosedAttendanceStatus } from "../utils/conversaUtils";
import { ConversaMessageStaticList, ConversaMessageVirtualList } from "./ConversaMessageVirtualList";
import ThreadRow from "./ThreadRow";
import { messageRowVisualSignature } from "./threadRowCompare";
import ClosedAttendancePanel from "./ClosedAttendancePanel";
import { SkeletonMessages } from "../components/feedback/Skeleton";
import { useOnlineStatus } from "../utils/useOnlineStatus";
import { useCompanyTimezoneVersion } from "../utils/useCompanyTimezone";

const EMPTY_SET = new Set();
const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);

/**
 * Conversas no mobile com mais de este limite de itens (mensagens + separadores de dia)
 * usam lista virtualizada para evitar montar centenas de bolhas no DOM de uma vez.
 * Conversas menores mantêm lista estática (scroll nativo mais previsível no toque).
 */
const MOBILE_VIRTUALIZE_THRESHOLD = 24;
/**
 * Com a conversa já na tela, a lista estática só vira virtual acima deste total (o mesmo teto
 * que a estática desenha, MOBILE_STATIC_MAX). Trocar de componente remonta todas as bolhas:
 * fotos recarregam e o scroll salta (166px medidos quando o GET de abertura trazia 28 itens
 * sobre os 20 do cache, 17/11/2026). Por isso o tipo é escolhido UMA vez por conversa e só
 * muda por necessidade real — e nunca de virtual de volta para estática.
 */
const MOBILE_STATIC_KEEP_MAX = 60;

function firstFilled(...values) {
  for (const value of values) {
    const text = value == null ? "" : String(value).trim();
    if (text) return text;
  }
  return "";
}

function extractProtocolFromMessages(mensagens) {
  if (!Array.isArray(mensagens)) return "";
  for (let i = mensagens.length - 1; i >= 0; i -= 1) {
    const text = firstFilled(mensagens[i]?.texto, mensagens[i]?.conteudo, mensagens[i]?.message, mensagens[i]?.body);
    if (!text) continue;
    const match = text.match(/protocolo\D{0,24}(\d{2,})/i);
    if (match?.[1]) return match[1];
  }
  return "";
}

/**
 * Lista virtualizada de mensagens + estados vazios/bloqueado + carregar histórico.
 * Scroll container (.wa-messages) permanece no ConversaView.
 */
function ConversaThread({
  virtualThreadRef,
  messagesContainerRef,
  scrollThreadId,
  conversaId,
  headerCompact,
  mensagensComSeparadores,
  mensagens,
  loading,
  /** O véu da abertura (ThreadOpeningVeil) já desenha as bolhas-fantasma. */
  suppressLoadingSkeleton = false,
  loadingMore,
  hasMore,
  cursor,
  conversa,
  showAssumeEmptyCta,
  assumeEmptyBusy,
  onAssumeEmpty,
  showReopenClosedCta,
  reopenClosedBusy,
  onReopenClosed,
  showPuxarNovamenteCta = false,
  puxarNovamenteBusy = false,
  onPuxarNovamente,
  showContactOldSyncCta,
  showLidPhoneMissingHint = false,
  contactOldSyncBusy,
  onContactOldSync,
  onLoadOlderMessagesClick,
  onVirtualContentResize,
  BubbleComponent,
  zapSeenMsgKeysRef,
  zapMsgsInitialPassRef,
  isGroup,
  avatarUrl,
  nome,
  selectMode,
  forwardSelectIntent,
  selectedSet,
  pinnedSet,
  starredSet,
  localReactions,
  reactionLoading,
  myUserId,
  whatsappInstanceProvider,
  mostrarNomeAoCliente,
  swipeReplyEnabled,
  compactMessageUx,
  onToggleSelected,
  onInfo,
  onReply,
  onCopy,
  onForward,
  onTogglePin,
  onToggleStar,
  onStartSelect,
  onDeleteForMe,
  onDeleteForEveryone,
  onEdit,
  onJumpToReply,
  onOpenMedia,
  onReenviarAudio,
  onReenviarFalha,
  onReact,
  onRemoveReaction,
  onConversarContact,
  onAdicionarGrupoContact,
}) {
  const estaOnline = useOnlineStatus();
  /* A hora de cada bolha usa o fuso da empresa; sem isto nas props do ThreadRow a linha
     memoizada ficava no fuso antigo depois de o admin trocar o estado (doc 14). */
  const tzVersion = useCompanyTimezoneVersion();
  const threadConversaId = scrollThreadId ?? conversaId;
  /** Igual ao ConversaView anterior: chave React da bolha usa conversaId carregado, não só selectedId. */
  const messageKeyConversaId = conversaId ?? threadConversaId;

  const safeMensagensComSeparadores = Array.isArray(mensagensComSeparadores)
    ? mensagensComSeparadores
    : EMPTY_ARRAY;
  const safeMensagens = Array.isArray(mensagens) ? mensagens : EMPTY_ARRAY;
  const safeSelectedSet = selectedSet instanceof Set ? selectedSet : EMPTY_SET;
  const safePinnedSet = pinnedSet instanceof Set ? pinnedSet : EMPTY_SET;
  const safeStarredSet = starredSet instanceof Set ? starredSet : EMPTY_SET;
  const safeLocalReactions =
    localReactions && typeof localReactions === "object" ? localReactions : EMPTY_OBJECT;
  const safeReactionLoading =
    reactionLoading && typeof reactionLoading === "object" ? reactionLoading : EMPTY_OBJECT;

  const threadRowCount = safeMensagensComSeparadores.length;

  /*
   * Tipo de lista com histerese, por conversa. Desktop é sempre virtual. No celular: decide na
   * 1.ª pintura com mensagens; estática → virtual só acima de MOBILE_STATIC_KEEP_MAX; virtual
   * fica virtual. Ref (não state): o valor é derivado e idempotente — um render descartado
   * deixa no máximo a mesma decisão que o render seguinte tomaria.
   */
  const listModeRef = useRef({ key: null, virtual: false });
  const listModeKey = `${headerCompact ? "m" : "d"}:${String(threadConversaId ?? "")}`;
  let renderVirtualList;
  if (!headerCompact) {
    renderVirtualList = true;
  } else if (threadRowCount === 0) {
    renderVirtualList = listModeRef.current.key === listModeKey && listModeRef.current.virtual;
  } else if (listModeRef.current.key !== listModeKey) {
    renderVirtualList = threadRowCount > MOBILE_VIRTUALIZE_THRESHOLD;
    listModeRef.current = { key: listModeKey, virtual: renderVirtualList };
  } else {
    renderVirtualList =
      listModeRef.current.virtual || threadRowCount > MOBILE_STATIC_KEEP_MAX;
    listModeRef.current.virtual = renderVirtualList;
  }
  const showSelectedReactionPicker =
    Boolean(compactMessageUx && selectMode && !forwardSelectIntent && safeSelectedSet.size === 1);

  const renderItem = useCallback(
    (item, index) => {
      if (!item) return null;
      const allowEnterAnimation = index >= threadRowCount - 2;

      if (item.__type === "day") {
        return (
          <ThreadRow
            item={item}
            messageKey={item.id}
            messageVisualSig=""
            allowEnterAnimation={allowEnterAnimation}
            BubbleComponent={BubbleComponent}
            zapSeenMsgKeysRef={zapSeenMsgKeysRef}
            zapMsgsInitialPassRef={zapMsgsInitialPassRef}
            isGroup={isGroup}
            peerAvatarUrl={avatarUrl}
            peerName={nome}
            selectMode={selectMode}
            isSelected={false}
            isPinned={false}
            isStarred={false}
            reactionForMessage={undefined}
            reactionLoadingForMessage={false}
            showMobileReactionPicker={false}
            currentUserId={myUserId}
            whatsappInstanceProvider={whatsappInstanceProvider}
            mostrarNomeAoCliente={mostrarNomeAoCliente}
            swipeReplyEnabled={swipeReplyEnabled}
            mobileMessageChrome={compactMessageUx}
            menuUsesBottomSheet={compactMessageUx}
            onToggleSelected={onToggleSelected}
            onInfo={onInfo}
            onReply={onReply}
            onCopy={onCopy}
            onForward={onForward}
            onTogglePin={onTogglePin}
            onToggleStar={onToggleStar}
            onStartSelect={onStartSelect}
            onDeleteForMe={onDeleteForMe}
            onDeleteForEveryone={onDeleteForEveryone}
            onEdit={onEdit}
            onJumpToReply={onJumpToReply}
            onOpenMedia={onOpenMedia}
            onReact={onReact}
            onRemoveReaction={onRemoveReaction}
            onConversarContact={onConversarContact}
            onAdicionarGrupoContact={onAdicionarGrupoContact}
          />
        );
      }

      const messageKey = getMessageListReactKey(item, messageKeyConversaId);
      const messageVisualSig = messageRowVisualSignature(item);

      return (
        <ThreadRow
          item={item}
          messageKey={messageKey}
          messageVisualSig={messageVisualSig}
          tzVersion={tzVersion}
          allowEnterAnimation={allowEnterAnimation}
          BubbleComponent={BubbleComponent}
          zapSeenMsgKeysRef={zapSeenMsgKeysRef}
          zapMsgsInitialPassRef={zapMsgsInitialPassRef}
          isGroup={isGroup}
          peerAvatarUrl={avatarUrl}
          peerName={nome}
          selectMode={selectMode}
          isSelected={safeSelectedSet.has(String(messageKey))}
          isPinned={safePinnedSet.has(String(messageKey))}
          isStarred={safeStarredSet.has(String(messageKey))}
          reactionForMessage={safeLocalReactions[String(messageKey)] || item.__reaction}
          /* Reação que veio do CLIENTE (inbound): não é "Sua reação" nem pode ser removida
             pelo atendente. */
          reactionFromPeer={!safeLocalReactions[String(messageKey)] && Boolean(item.__reaction)}
          reactionLoadingForMessage={Boolean(safeReactionLoading[String(messageKey)])}
          showMobileReactionPicker={Boolean(showSelectedReactionPicker && safeSelectedSet.has(String(messageKey)))}
          currentUserId={myUserId}
          whatsappInstanceProvider={whatsappInstanceProvider}
          mostrarNomeAoCliente={mostrarNomeAoCliente}
          swipeReplyEnabled={swipeReplyEnabled}
          mobileMessageChrome={compactMessageUx}
          menuUsesBottomSheet={compactMessageUx}
          onToggleSelected={onToggleSelected}
          onInfo={onInfo}
          onReply={onReply}
          onCopy={onCopy}
          onForward={onForward}
          onTogglePin={onTogglePin}
          onToggleStar={onToggleStar}
          onStartSelect={onStartSelect}
          onDeleteForMe={onDeleteForMe}
          onDeleteForEveryone={onDeleteForEveryone}
          onEdit={onEdit}
          onJumpToReply={onJumpToReply}
          onOpenMedia={onOpenMedia}
          onReenviarAudio={onReenviarAudio}
          onReenviarFalha={onReenviarFalha}
          onReact={onReact}
          onRemoveReaction={onRemoveReaction}
          onConversarContact={onConversarContact}
          onAdicionarGrupoContact={onAdicionarGrupoContact}
        />
      );
    },
    [
      threadRowCount,
      tzVersion,
      messageKeyConversaId,
      BubbleComponent,
      zapSeenMsgKeysRef,
      zapMsgsInitialPassRef,
      isGroup,
      avatarUrl,
      nome,
      selectMode,
      forwardSelectIntent,
      safeSelectedSet,
      safePinnedSet,
      safeStarredSet,
      safeLocalReactions,
      safeReactionLoading,
      myUserId,
      whatsappInstanceProvider,
      mostrarNomeAoCliente,
      swipeReplyEnabled,
      compactMessageUx,
      showSelectedReactionPicker,
      onToggleSelected,
      onInfo,
      onReply,
      onCopy,
      onForward,
      onTogglePin,
      onToggleStar,
      onStartSelect,
      onDeleteForMe,
      onDeleteForEveryone,
      onEdit,
      onJumpToReply,
      onOpenMedia,
      onReenviarAudio,
      onReenviarFalha,
      onReact,
      onRemoveReaction,
      onConversarContact,
      onAdicionarGrupoContact,
    ]
  );

  const closedMeta = useMemo(() => {
    const atendenteNome = firstFilled(conversa?.atendente_nome, conversa?.atendente?.nome) || "outro usuário";
    const protocolo =
      firstFilled(
        conversa?.protocolo,
        conversa?.protocolo_atendimento,
        conversa?.atendimento_protocolo,
        conversa?.ultimo_protocolo
      ) || extractProtocolFromMessages(safeMensagens);
    const setor =
      firstFilled(conversa?.setor, conversa?.departamento?.nome, conversa?.departamentos?.nome) || "Sem setor";
    return { atendenteNome, protocolo, setor };
  }, [conversa, safeMensagens]);

  const statusAtendimento = String(getStatusAtendimentoEffective(conversa) ?? "").toLowerCase();
  const isClosedConversation = isClosedAttendanceStatus(statusAtendimento);
  const showClosedBanner = isClosedConversation && !isGroup;

  const closedBanner = showClosedBanner ? (
    <div className="wa-closedAttendance-banner">
      <ClosedAttendancePanel
        atendenteNome={closedMeta.atendenteNome}
        showReopenCta={showReopenClosedCta}
        reopenBusy={reopenClosedBusy}
        onReopen={onReopenClosed}
      />
    </div>
  ) : null;

  if (conversa?.mensagens_bloqueadas) {
    const atendenteNome = closedMeta.atendenteNome;

    return (
      <div className="wa-messages-empty">
        <div className="wa-messages-emptyCard wa-messages-emptyCard--blocked">
          <span className="wa-messages-blocked-icon" aria-hidden="true">
            <Archive size={20} strokeWidth={2.25} />
          </span>
          <strong>{`Este atendimento foi assumido por ${atendenteNome}.`}</strong>
          <p className="wa-messages-emptyHint" role="status">
            {showPuxarNovamenteCta
              ? `Você transferiu esta conversa. Puxe novamente para voltar a atender junto com ${atendenteNome}.`
              : "O histórico fica oculto enquanto outro atendente conduz a conversa. Administradores e supervisores podem visualizar o conteúdo."}
          </p>
          {showPuxarNovamenteCta ? (
            <button
              type="button"
              className="wa-messages-puxarBtn"
              onClick={onPuxarNovamente}
              disabled={puxarNovamenteBusy}
              aria-label="Puxar conversa novamente para voltar a atender"
            >
              <Undo2 size={17} strokeWidth={2.4} aria-hidden="true" />
              <span>{puxarNovamenteBusy ? "Puxando…" : "Puxar conversa novamente"}</span>
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (loading && safeMensagensComSeparadores.length === 0) {
    return (
      <>
        {closedBanner}
        {suppressLoadingSkeleton ? null : <SkeletonMessages />}
      </>
    );
  }

  if (safeMensagensComSeparadores.length === 0) {
    return (
      <>
        {closedBanner}
        <div className="wa-messages-empty">
          <div className="wa-messages-emptyCard">
            <p className="wa-messages-emptyText">Sem mensagens salvas ainda.</p>
            {showAssumeEmptyCta ? (
              <button
                type="button"
                className="wa-btn wa-btn-primary wa-btn-assumir-destaque"
                onClick={onAssumeEmpty}
                disabled={assumeEmptyBusy}
              >
                {assumeEmptyBusy ? "Assumindo…" : "Assumir"}
              </button>
            ) : null}
            {showContactOldSyncCta ? (
              <button
                type="button"
                className="wa-btn wa-btn-secondary"
                onClick={onContactOldSync}
                disabled={contactOldSyncBusy}
                title="Importa as mensagens que a UltraMSG armazenou desde a conexão do WhatsApp (histórico anterior à conexão fica apenas no celular)"
              >
                {contactOldSyncBusy ? "Carregando..." : "Buscar histórico no WhatsApp"}
              </button>
            ) : null}
            {showLidPhoneMissingHint ? (
              <p className="wa-messages-emptyHint" role="status">
                Número ainda indisponível. Quando o telefone for identificado (mensagem do contato ou cliente vinculado), você poderá buscar o histórico no WhatsApp.
              </p>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {closedBanner}
      {!estaOnline ? (
        <div className="wa-offlinePill" role="status" aria-live="polite">
          Sem conexão — modo leitura offline
        </div>
      ) : null}
      {!conversa?.mensagens_bloqueadas && safeMensagens.length > 0 && !loading ? (
        <div className="wa-loadOlderHistory">
          {showContactOldSyncCta ? (
            <button
              type="button"
              className="wa-loadOlderBtn"
              onClick={onContactOldSync}
              disabled={contactOldSyncBusy}
              aria-busy={contactOldSyncBusy}
              title="Busca no WhatsApp conectado o histórico antigo deste contato e salva no sistema"
            >
              {contactOldSyncBusy ? "Carregando..." : "Buscar histórico no WhatsApp"}
            </button>
          ) : null}
          {showLidPhoneMissingHint ? (
            <p className="wa-loadOlderEnd" role="status">
              Número ainda indisponível para buscar histórico no WhatsApp.
            </p>
          ) : null}
          {hasMore && cursor ? (
            <button
              type="button"
              className="wa-loadOlderBtn"
              onClick={onLoadOlderMessagesClick}
              disabled={loadingMore}
              aria-busy={loadingMore}
              title="Carrega o lote anterior já salvo no sistema. Também pode rolar até o topo da conversa."
              aria-label={loadingMore ? "Carregando mensagens salvas" : "Carregar mensagens salvas"}
            >
              Carregar mensagens salvas
            </button>
          ) : !hasMore ? (
            <p className="wa-loadOlderEnd" role="status">
              {showContactOldSyncCta
                ? "Todas as mensagens salvas foram carregadas. “Buscar histórico no WhatsApp” importa o que a UltraMSG tem armazenado desde a conexão — conversas mais antigas ficam apenas no celular."
                : "Todas as mensagens salvas foram carregadas."}
            </p>
          ) : null}
        </div>
      ) : null}
      {loadingMore ? (
        <div className="wa-historyLoading" role="status" aria-live="polite" aria-label="Carregando histórico">
          <span className="wa-historyLoading-bar" />
        </div>
      ) : null}
      {/* Mobile com muitas mensagens usa lista virtualizada para evitar DOM explosion.
          Desktop sempre usa lista virtualizada (comportamento original inalterado).
          Mobile com poucas mensagens mantém lista estática (scroll nativo no toque). */}
      {renderVirtualList ? (
        <ConversaMessageVirtualList
          key={`wa-thread-${headerCompact ? "mobile" : "desktop"}-${String(threadConversaId ?? "")}`}
          ref={virtualThreadRef}
          scrollRef={messagesContainerRef}
          overscan={headerCompact ? 3 : 10}
          mobileThread={headerCompact}
          conversaId={threadConversaId}
          items={safeMensagensComSeparadores}
          onVirtualContentResize={onVirtualContentResize}
          renderItem={renderItem}
        />
      ) : (
        <ConversaMessageStaticList
          key={`wa-thread-static-${String(threadConversaId ?? "")}`}
          ref={virtualThreadRef}
          scrollRef={messagesContainerRef}
          conversaId={threadConversaId}
          items={safeMensagensComSeparadores}
          onVirtualContentResize={onVirtualContentResize}
          renderItem={renderItem}
        />
      )}
    </>
  );
}

/*
 * Memoizado: o ConversaThread recebe só props estáveis (dados via useMemo/store, callbacks
 * via useCallback, refs). Sem isto, cada setState do ConversaView (toast, typing, sending…)
 * re-executava o renderItem e o diffing do virtualizer à toa. As linhas (ThreadRow) já são
 * memo; isto evita o trabalho de re-render do container quando os dados não mudaram.
 */
export default memo(ConversaThread);
