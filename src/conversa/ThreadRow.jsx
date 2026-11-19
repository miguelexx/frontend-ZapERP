import { memo, useState } from "react";
import { ArrowLeftRight, Bot, ChevronDown, EyeOff, Pencil, ShieldCheck, StickyNote, UserCheck } from "lucide-react";
import DaySeparator from "./DaySeparator";
import { threadRowPropsAreEqual } from "./threadRowCompare";
import { formatHora } from "./utils/conversaViewHelpers";
import { isInternalNote } from "./internalNote";
import { isInternalMovementMessage } from "./utils/internalMovement";
import { canEditMessage, isMessageEdited } from "./bubble/utils/bubbleClassify";

function InternalMovementCard({ item, zapAnimateIn }) {
  const meta = item?.movimentacao_interna && typeof item.movimentacao_interna === "object"
    ? item.movimentacao_interna
    : {};
  const rawText = String(item?.texto || "");
  const fallbackBody = rawText.split("\n").slice(1).join("\n").trim();
  const title = meta.titulo || "Movimentação interna";
  const body = meta.corpo || fallbackBody || "Este atendimento teve uma movimentação interna.";
  const footer = meta.rodape || "Mensagem invisível para o cliente.";
  const action = String(meta.acao || (body.toLowerCase().includes("assumiu") ? "assumiu" : "transferiu")).toLowerCase();
  const isAssume = action === "assumiu";
  const ActionIcon = isAssume ? UserCheck : ArrowLeftRight;

  return (
    <div
      className={`wa-row wa-row-internalMovement${zapAnimateIn ? " zap-message-enter" : ""}`}
      data-msg-id={item?.id}
      role="note"
      aria-label="Movimentação interna"
    >
      <div className={`wa-internalMovement-card ${isAssume ? "is-assume" : "is-transfer"}`}>
        <span className="wa-internalMovement-icon" aria-hidden="true">
          <ActionIcon size={15} strokeWidth={2.25} />
        </span>
        <div className="wa-internalMovement-content">
          <div className="wa-internalMovement-kicker">
            <ShieldCheck size={11} strokeWidth={2.2} />
            <span>Registro interno</span>
          </div>
          <div className="wa-internalMovement-title">{title}</div>
          <div className="wa-internalMovement-body">{body}</div>
          <div className="wa-internalMovement-footer">
            <span>{footer}</span>
            <span className="wa-internalMovement-time">{formatHora(item?.criado_em)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function InternalNoteCard({ item, zapAnimateIn, canEdit, onEdit }) {
  const nome = item?.usuario_nome || item?.remetente_nome || null;
  const texto = String(item?.texto || "");
  const edited = isMessageEdited(item);

  return (
    <div
      className={`wa-row wa-row-internalNote${zapAnimateIn ? " zap-message-enter" : ""}`}
      data-msg-id={item?.id}
      role="note"
      aria-label="Nota interna"
    >
      <div className="wa-internalNote-card">
        <div className="wa-internalNote-head">
          <span className="wa-internalNote-icon" aria-hidden="true">
            <StickyNote size={13} strokeWidth={2.2} />
          </span>
          <span className="wa-internalNote-kicker">NOTA INTERNA</span>
          {nome ? <span className="wa-internalNote-autor">· {nome}</span> : null}
          {edited ? <span className="wa-bubble-edited">Editada</span> : null}
          <span className="wa-internalNote-time">{formatHora(item?.criado_em)}</span>
          {canEdit ? (
            <button
              type="button"
              className="wa-internalNote-edit"
              onClick={() => onEdit?.(item)}
              title="Editar nota"
              aria-label="Editar nota interna"
            >
              <Pencil size={12} strokeWidth={2.2} />
              Editar
            </button>
          ) : null}
        </div>
        <div className="wa-internalNote-body">{texto}</div>
        <div className="wa-internalNote-footer">
          <EyeOff size={11} strokeWidth={2} />
          <span>O cliente não recebeu esta mensagem</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Triagem automática resumida (18/11/2026): o menu de setores e a confirmação do bot viram uma
 * pílula central, como os avisos de sistema do WhatsApp. Só visual — a mensagem é a mesma; um
 * toque abre a bolha original logo abaixo (copiar, dados da mensagem, etc. continuam lá).
 */
function BotTriageRow({ item, children }) {
  const [open, setOpen] = useState(false);
  const label = String(item?.__botCompact || "");
  const kind = item?.__botCompactKind === "menu" ? "menu" : "confirmacao";
  return (
    <div className={`wa-botTriage${open ? " is-open" : ""}`}>
      <div className="wa-row wa-row-botTriage" data-msg-id={item?.id}>
        <button
          type="button"
          className={`wa-botTriage-pill wa-botTriage-pill--${kind}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={open ? "Recolher mensagem automática" : "Ver a mensagem automática completa"}
        >
          <span className="wa-botTriage-icon" aria-hidden="true">
            <Bot size={13} strokeWidth={2.2} />
          </span>
          <span className="wa-botTriage-label">{label}</span>
          <span className="wa-botTriage-time">{formatHora(item?.criado_em)}</span>
          <ChevronDown className="wa-botTriage-chev" size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      {open ? children : null}
    </div>
  );
}

/**
 * Uma linha do thread virtualizado: separador de dia ou bolha de mensagem.
 * BubbleComponent vem do ConversaView (referência estável) para evitar mover ~800 linhas nesta etapa.
 */
function ThreadRow({
  item,
  messageKey,
  messageVisualSig: _messageVisualSigForMemo,
  allowEnterAnimation = false,
  BubbleComponent,
  zapSeenMsgKeysRef,
  zapMsgsInitialPassRef,
  isGroup,
  peerAvatarUrl,
  peerName,
  selectMode,
  isSelected,
  isPinned,
  isStarred,
  reactionForMessage,
  reactionFromPeer = false,
  reactionLoadingForMessage,
  showMobileReactionPicker,
  currentUserId,
  whatsappInstanceProvider,
  mostrarNomeAoCliente,
  swipeReplyEnabled,
  mobileMessageChrome,
  menuUsesBottomSheet,
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
  if (!item) return null;

  if (item.__type === "day") {
    return <DaySeparator label={item.label} />;
  }

  if (!BubbleComponent) return null;

  const seenMsgKeys = zapSeenMsgKeysRef?.current;
  const isInitialPass = zapMsgsInitialPassRef?.current === true;

  let zapAnimateIn = false;
  /* Só anima mensagens novas no fim do thread — histórico revelado no scroll não anima (evita jank).
     O mobile TAMBÉM anima: era a plataforma onde enviar uma mensagem não tinha retorno nenhum
     (a bolha surgia seca). A entrada é só transform+opacity, curta, limitada às 2 últimas linhas
     e suprimida durante o scroll (.wa-messages.is-scrolling), com will-change solto no
     animationend (.zap-anim-settled). */
  if (
    allowEnterAnimation &&
    !isInitialPass &&
    seenMsgKeys &&
    messageKey != null &&
    !seenMsgKeys.has(messageKey)
  ) {
    zapAnimateIn = true;
  }
  if (seenMsgKeys && messageKey != null) {
    seenMsgKeys.add(messageKey);
  }

  if (isInternalNote(item)) {
    return (
      <InternalNoteCard
        item={item}
        zapAnimateIn={zapAnimateIn}
        canEdit={canEditMessage(item, {
          out: false,
          currentUserId,
          provider: whatsappInstanceProvider,
        })}
        onEdit={onEdit}
      />
    );
  }

  if (isInternalMovementMessage(item)) {
    return <InternalMovementCard item={item} zapAnimateIn={zapAnimateIn} />;
  }

  const bubble = (
    <BubbleComponent
      msg={item}
      zapAnimateIn={zapAnimateIn}
      showRemetente={Boolean(item.__showRemetente)}
      isGroup={isGroup}
      peerAvatarUrl={peerAvatarUrl}
      peerName={peerName}
      selectMode={selectMode}
      selected={isSelected}
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
      isPinned={isPinned}
      isStarred={isStarred}
      currentUserId={currentUserId}
      whatsappInstanceProvider={whatsappInstanceProvider}
      onJumpToReply={onJumpToReply}
      onOpenMedia={onOpenMedia}
      onReenviarAudio={onReenviarAudio}
      onReenviarFalha={onReenviarFalha}
      localReaction={reactionForMessage}
      reactionFromPeer={reactionFromPeer}
      onReact={onReact}
      onRemoveReaction={onRemoveReaction}
      reactionBusy={reactionLoadingForMessage}
      showMobileReactionPicker={showMobileReactionPicker}
      onConversarContact={onConversarContact}
      onAdicionarGrupoContact={onAdicionarGrupoContact}
      mostrarNomeAoCliente={mostrarNomeAoCliente}
      swipeReplyEnabled={swipeReplyEnabled}
      captionBundleTop={Boolean(item.__captionBundleTop)}
      captionBundleFollow={Boolean(item.__captionBundleFollow)}
      mobileMessageChrome={mobileMessageChrome}
      menuUsesBottomSheet={menuUsesBottomSheet}
    />
  );

  /* No modo seleção a bolha aparece inteira: a pílula não tem caixa de seleção. */
  if (item.__botCompact && !selectMode) {
    return <BotTriageRow item={item}>{bubble}</BotTriageRow>;
  }

  return bubble;
}

export default memo(ThreadRow, threadRowPropsAreEqual);
