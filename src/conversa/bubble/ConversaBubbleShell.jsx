import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  safeString,
  copyTextToClipboard,
  formatHora,
  resolveBubbleMediaCandidates,
  resolveAudioPlaybackCandidates,
} from "../utils/conversaViewHelpers";
import BubbleDeletedNotice from "./components/BubbleDeletedNotice";
import { SwipeReplyTrack } from "../SwipeReplyTrack";
import { resolveContactMetaFromMessage } from "../../utils/conversaUtils";
import { classifyBubbleMessage, canDeleteMessageForEveryone, canEditMessage } from "./utils/bubbleClassify";
import { buildRetryPayload } from "./utils/bubbleRetry";
import { useMessageMenu } from "./hooks/useMessageMenu";
import { useMessageGestures } from "./hooks/useMessageGestures";
import { useMediaRetry } from "./hooks/useMediaRetry";
import MessageStatus from "./components/MessageStatus";
import EditedLabel from "./components/EditedLabel";
import QuotedReply from "./components/QuotedReply";
import MessageMenu from "./components/MessageMenu";
import MessageRetry from "./components/MessageRetry";
import { LOCAL_MEDIA_LOSS_NOTICE, shouldShowLocalMediaNotice } from "../localMediaNotice";
import BubbleTypedContent from "./components/BubbleTypedContent";
import { ReactionPicker, ReactionButton, ReactionBadge } from "./components/MessageReactions";

const Bubble = memo(function Bubble({
  msg,
  showRemetente,
  isGroup,
  peerAvatarUrl,
  peerName,
  selectMode,
  selected,
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
  isPinned,
  isStarred,
  currentUserId,
  whatsappInstanceProvider,
  onJumpToReply,
  onOpenMedia,
  onReenviarAudio,
  onReenviarFalha,
  localReaction,
  onReact,
  onRemoveReaction,
  reactionBusy,
  onConversarContact,
  onAdicionarGrupoContact,
  mostrarNomeAoCliente = true,
  swipeReplyEnabled = false,
  captionBundleTop = false,
  captionBundleFollow = false,
  /** Mobile/tablet: sem setinha fixa; menu por long press + folha inferior */
  mobileMessageChrome = false,
  menuUsesBottomSheet = false,
  showMobileReactionPicker = false,
  zapAnimateIn = false,
}) {
  const mediaCandidates = useMemo(
    () => resolveBubbleMediaCandidates(msg),
    [
      msg?._optimisticBlobUrl,
      msg?.url,
      msg?.url_absoluta,
      msg?.media_url,
      msg?.mediaUrl,
      msg?.file_url,
      msg?.fileUrl,
      msg?.download_url,
      msg?.downloadUrl,
    ]
  );
  const mediaUrl = mediaCandidates[0] || "";
  const audioPlaybackCandidates = useMemo(
    () => resolveAudioPlaybackCandidates(msg),
    [
      msg?._optimisticBlobUrl,
      msg?.url,
      msg?.url_absoluta,
      msg?.media_url,
      msg?.mediaUrl,
      msg?.file_url,
      msg?.fileUrl,
      msg?.download_url,
      msg?.downloadUrl,
      msg?.tipo,
    ]
  );
  const contactBubbleMeta = useMemo(() => resolveContactMetaFromMessage(msg), [msg]);
  const classified = classifyBubbleMessage(msg, mediaUrl, contactBubbleMeta);
  const {
    out,
    isImg,
    isSticker,
    isFile,
    isAudioOrVoice,
    isVideo,
    isContact,
    isLocation,
    isCall,
    isApagadaParaTodos,
    isApagadaPeloCliente,
    deletionInfo,
    hasInlineMetaClass,
    showFloatingMetaTime,
    isEncaminhado,
    replyMeta,
    hasReply,
  } = classified;
  const canDeleteForEveryone = useMemo(
    () => canDeleteMessageForEveryone(msg, { out, currentUserId }),
    [out, currentUserId, msg?.autor_usuario_id, msg?.apagada_para_todos]
  );
  const canEdit = useMemo(
    () => canEditMessage(msg, { out, currentUserId, provider: whatsappInstanceProvider }),
    [
      out,
      currentUserId,
      whatsappInstanceProvider,
      msg?.autor_usuario_id,
      msg?.apagada_para_todos,
      msg?.tipo,
      msg?.direcao,
      msg?.whatsapp_id,
      msg?.criado_em,
      msg?.status,
      msg?.status_mensagem,
      msg?.envio_erro,
    ]
  );
  const remetente = showRemetente && !out && (msg?.remetente_nome || msg?.remetente_telefone);
  const retry = useMediaRetry(msg, classified, { onReenviarFalha, onReenviarAudio });
  const showMenuButton = !selectMode;
  const bubbleRef = useRef(null);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [reactionExpanded, setReactionExpanded] = useState(false);
  const showReactionPicker = !isCall && (reactionOpen || showMobileReactionPicker);

  const {
    menuOpen,
    setMenuOpen,
    menuStyle,
    menuAnchorRef,
    menuBtnRef,
    menuElRef,
  } = useMessageMenu({ menuUsesBottomSheet });

  const {
    onBubblePointerDown,
    handleMediaPointerDown,
    handleMediaPointerUp,
    handleMediaClick,
    clearSkipNextMediaTap,
  } = useMessageGestures({
    mobileMessageChrome,
    selectMode,
    menuOpen,
    setMenuOpen,
    onOpenMedia,
  });

  useEffect(() => {
    if (!menuOpen) clearSkipNextMediaTap();
  }, [menuOpen, clearSkipNextMediaTap]);

  useEffect(() => {
    if (!zapAnimateIn || !bubbleRef.current) return undefined;
    const el = bubbleRef.current;
    const onEnd = () => el.classList.add("zap-anim-settled");
    el.addEventListener("animationend", onEnd, { once: true });
    return () => el.removeEventListener("animationend", onEnd);
  }, [zapAnimateIn]);

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const onSelectStart = (ev) => {
      // Desktop: permite selecionar o texto da mensagem (WhatsApp Web).
      // Mobile/tablet e modo seleção: bloqueia a seleção nativa para não brigar com long-press / checkbox.
      if (selectMode || mobileMessageChrome) ev.preventDefault();
    };
    el.addEventListener("selectstart", onSelectStart);
    return () => el.removeEventListener("selectstart", onSelectStart);
  }, [msg?.id, selectMode, mobileMessageChrome]);

  const canSelectMessage = Boolean(msg?.id) && !msg?.apagada_para_todos;

  const handleToggleSelect = useCallback(
    (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      onToggleSelected?.(msg);
    },
    [onToggleSelected, msg]
  );

  const handleStartSelectFromMouse = useCallback(
    (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (!canSelectMessage) return;
      if (selectMode) {
        onToggleSelected?.(msg);
        return;
      }
      onStartSelect?.(msg);
    },
    [canSelectMessage, selectMode, onToggleSelected, onStartSelect, msg]
  );

  const handleRowClick = useCallback(
    (e) => {
      if (!canSelectMessage) return;
      if (selectMode) {
        if (e.target?.closest?.(".wa-selectChk, .wa-msgMenuBtn, .wa-reactionBtn, .wa-reactionPicker, a[href], button")) {
          return;
        }
        handleToggleSelect(e);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        onStartSelect?.(msg);
      }
    },
    [canSelectMessage, selectMode, handleToggleSelect, onStartSelect, msg]
  );

  const doCopy = useCallback(async () => {
    const text =
      safeString(msg?.texto) ||
      (mediaUrl ? `${msg?.nome_arquivo ? `${msg.nome_arquivo}\n` : ""}${mediaUrl}` : "");
    const ok = await copyTextToClipboard(text);
    onCopy?.(ok);
  }, [msg, mediaUrl, onCopy]);

  const runAction = useCallback(
    async (action) => {
      setMenuOpen(false);
      if (action === "info") onInfo?.(msg);
      if (action === "reply") onReply?.(msg);
      if (action === "copy") await doCopy();
      if (action === "forward") onForward?.(msg);
      if (action === "pin") onTogglePin?.(msg);
      if (action === "star") onToggleStar?.(msg);
      if (action === "select") onStartSelect?.(msg);
      if (action === "deleteForMe") onDeleteForMe?.(msg);
      if (action === "deleteForEveryone") onDeleteForEveryone?.(msg);
      if (action === "edit") onEdit?.(msg);
    },
    [msg, onInfo, onReply, doCopy, onForward, onTogglePin, onToggleStar, onStartSelect, onDeleteForMe, onDeleteForEveryone, onEdit, setMenuOpen]
  );

  const typedProps = {
    classified,
    msg,
    mediaUrl,
    audioPlaybackCandidates,
    selectMode,
    isGroup,
    peerAvatarUrl,
    peerName,
    onOpenMedia,
    onConversarContact,
    onAdicionarGrupoContact,
    handleMediaPointerDown,
    handleMediaPointerUp,
    handleMediaClick,
    retry,
  };

  return (
      <div
        className={`wa-row ${out ? "wa-row-out" : "wa-row-in"}${localReaction ? " wa-row--hasReaction" : ""}${
          captionBundleTop ? " wa-row--captionBundleTop" : ""
        }${captionBundleFollow ? " wa-row--captionBundleFollow" : ""}${menuOpen ? " wa-row--menuOpen" : ""}`}
        data-msg-id={msg?.id}
        data-group-start={showRemetente && !out ? "1" : "0"}
        onClick={canSelectMessage ? handleRowClick : undefined}
        onClickCapture={selectMode && canSelectMessage ? (event) => {
          // A media button/link must select, never open its viewer in selection mode.
          if (event.target.closest?.(".wa-selectChk")) return;
          event.preventDefault();
          event.stopPropagation();
          handleToggleSelect(event);
        } : undefined}
      >
      {selectMode && canSelectMessage ? (
        <button
          type="button"
          className={`wa-selectChk ${selected ? "isOn" : ""}`}
          onClick={handleToggleSelect}
          title={selected ? "Desmarcar" : "Selecionar"}
          aria-label={selected ? "Desmarcar mensagem" : "Selecionar mensagem"}
          aria-pressed={selected}
        >
          <svg className="wa-selectChk-check" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3.5 8.4 6.6 11.4 12.5 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}

      <SwipeReplyTrack
        enabled={Boolean(swipeReplyEnabled && !isCall && !msg?.apagada_para_todos)}
        outgoing={out}
        gestureBlocked={menuOpen || showReactionPicker || selectMode}
        onCommit={() => {
          setMenuOpen(false);
          setReactionOpen(false);
          setReactionExpanded(false);
          onReply?.(msg);
        }}
      >
      {showMobileReactionPicker && !isCall ? (
        <ReactionPicker
          mobileSelected
          reactionExpanded={reactionExpanded}
          reactionBusy={reactionBusy}
          apagadaParaTodos={msg?.apagada_para_todos}
          localReaction={localReaction}
          onReact={(emo) => onReact?.(msg, emo)}
          onRemoveReaction={() => onRemoveReaction?.(msg)}
          onExpandToggle={() => setReactionExpanded((v) => !v)}
          onPicked={() => {
            setReactionOpen(false);
            setReactionExpanded(false);
          }}
        />
      ) : null}
      <div
        ref={(node) => {
          menuAnchorRef.current = node;
          bubbleRef.current = node;
        }}
        className={[
          "wa-bubble",
          zapAnimateIn ? "zap-message-enter" : "",
          out ? "wa-bubble-out" : "wa-bubble-in",
          hasInlineMetaClass ? "hasInlineMeta" : "",
          (isImg || isSticker) ? "wa-bubble-media" : "",
          isSticker ? "wa-bubble-sticker sticker-message" : "",
          isImg && !isSticker ? "image-message" : "",
          isFile ? "wa-bubble-fileWrap" : "",
          isContact ? "wa-bubble-contactWrap" : "",
          isLocation ? "wa-bubble-locationWrap" : "",
          isAudioOrVoice ? "wa-bubble-audio audio-message" : "",
          isVideo ? "wa-bubble-video" : "",
          selected ? "isSelected" : "",
          menuOpen ? "wa-bubble--menuOpen" : "",
          mobileMessageChrome ? "wa-bubble--mobileUx" : "",
          msg?.apagada_para_todos ? "wa-bubble--revokedEveryone" : "",
          isApagadaPeloCliente ? "wa-bubble--clientDeleted" : "",
        ].filter(Boolean).join(" ")}
        onPointerDown={mobileMessageChrome && !selectMode ? onBubblePointerDown : undefined}
        onContextMenu={mobileMessageChrome ? (ev) => ev.preventDefault() : undefined}
        role="group"
        aria-label="Mensagem"
      >
        {showMenuButton && !mobileMessageChrome ? (
          <button
            ref={menuBtnRef}
            type="button"
            className={`wa-msgMenuBtn wa-msgMenuBtn--top ${menuOpen ? "isOpen" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            title="Mais opções"
            aria-label="Abrir opções da mensagem"
          >
            <svg
              className="wa-msgMenuBtn-caret"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4.6 6.4 8 9.6l3.4-3.2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
        <div className="wa-bubble-body">
          {deletionInfo ? (
            <BubbleDeletedNotice info={deletionInfo} currentUserId={currentUserId} />
          ) : null}
          {isEncaminhado && !isFile && !isContact && !isLocation ? (
            <div className="wa-bubble-fwd-badge">
              <svg className="wa-bubble-fwd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 10 20 15 15 20" />
                <path d="M4 4v7a4 4 0 0 0 4 4h12" />
              </svg>
              <span>Encaminhado</span>
            </div>
          ) : null}
          {hasReply && (
            <QuotedReply
              replyMeta={replyMeta}
              out={out}
              peerName={peerName}
              onJumpToReply={onJumpToReply}
            />
          )}
          {out &&
          msg?.enviado_por_usuario &&
          !isApagadaParaTodos &&
          safeString(msg?.usuario_nome) &&
          !(
            !msg?.id &&
            !msg?.whatsapp_id &&
            msg?.tempId &&
            safeString(msg?.usuario_nome).toLowerCase() === safeString(peerName).toLowerCase()
          ) ? (
            <div
              className="wa-bubble-atendente"
              aria-label={`Enviado por ${msg.usuario_nome}`}
              title={`Enviado por ${msg.usuario_nome}`}
            >
              <svg
                className="wa-bubble-atendente-ic"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="8" r="3.4" />
                <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
              </svg>
              <span className="wa-bubble-atendente-nome">{msg.usuario_nome}</span>
            </div>
          ) : null}
          {remetente ? (
            <div className="wa-bubble-remetente">
              <span className="wa-bubble-remetente-nome">
                {remetente}:
              </span>
              <BubbleTypedContent includeAudioAndCall={false} requireVideoUrl={false} {...typedProps} />
            </div>
          ) : (
            <BubbleTypedContent includeAudioAndCall requireVideoUrl {...typedProps} />
          )}
          {shouldShowLocalMediaNotice(msg) ? (
            <p className="wa-local-media-notice" role="note">{LOCAL_MEDIA_LOSS_NOTICE}</p>
          ) : null}
          {retry.canShowRetry && !isAudioOrVoice ? (
            <MessageRetry
              isRetrying={retry.isRetrying}
              onRetry={retry.onRetry}
              payload={buildRetryPayload(msg, retry)}
            />
          ) : null}
        </div>
        {!selectMode && !mobileMessageChrome && canSelectMessage ? (
          <button
            type="button"
            className="wa-selectChk wa-selectChk--hover"
            onClick={handleStartSelectFromMouse}
            title="Selecionar mensagem (Ctrl+clique)"
            aria-label="Selecionar mensagem"
          />
        ) : null}
        {!isCall && !mobileMessageChrome ? (
          <ReactionButton
            reactionOpen={reactionOpen}
            reactionBusy={reactionBusy}
            apagadaParaTodos={msg?.apagada_para_todos}
            onToggle={() => {
              setReactionOpen((v) => !v);
              setReactionExpanded(false);
            }}
          />
        ) : null}
        <div className="wa-bubble-meta">
          <div className="wa-bubble-metaLeft">
            {showFloatingMetaTime ? (
              <>
                {!(isAudioOrVoice && mediaUrl) ? (
                  <>
                    <EditedLabel msg={msg} />
                    <span className="wa-bubble-time">{formatHora(msg?.criado_em)}</span>
                  </>
                ) : null}
                <MessageStatus msg={msg} isGroup={Boolean(isGroup)} />
              </>
            ) : null}
            {isPinned ? <span className="wa-bubble-badge" title="Fixada">📌</span> : null}
            {isStarred ? <span className="wa-bubble-badge" title="Favorita">★</span> : null}
          </div>
        </div>

        {reactionOpen && !isCall ? (
          <ReactionPicker
            reactionExpanded={reactionExpanded}
            reactionBusy={reactionBusy}
            apagadaParaTodos={msg?.apagada_para_todos}
            localReaction={localReaction}
            onReact={(emo) => onReact?.(msg, emo)}
            onRemoveReaction={() => onRemoveReaction?.(msg)}
            onExpandToggle={() => setReactionExpanded((v) => !v)}
            onPicked={() => {
              setReactionOpen(false);
              setReactionExpanded(false);
            }}
          />
        ) : null}

        <ReactionBadge localReaction={localReaction} />
      </div>
      </SwipeReplyTrack>

      <MessageMenu
        menuOpen={menuOpen}
        menuUsesBottomSheet={menuUsesBottomSheet}
        menuStyle={menuStyle}
        menuElRef={menuElRef}
        mobileMessageChrome={mobileMessageChrome}
        isCall={isCall}
        apagadaParaTodos={msg?.apagada_para_todos}
        out={out}
        isPinned={isPinned}
        isStarred={isStarred}
        canDeleteForEveryone={canDeleteForEveryone}
        canEdit={canEdit}
        reactionExpanded={reactionExpanded}
        reactionBusy={reactionBusy}
        localReaction={localReaction}
        onClose={() => setMenuOpen(false)}
        onAction={runAction}
        onReact={(emo) => onReact?.(msg, emo)}
        onRemoveReaction={() => onRemoveReaction?.(msg)}
        onExpandToggle={() => setReactionExpanded((v) => !v)}
        onReactionPicked={() => {
          setReactionOpen(false);
          setReactionExpanded(false);
          setMenuOpen(false);
        }}
      />
    </div>
  );
});

export default Bubble;
