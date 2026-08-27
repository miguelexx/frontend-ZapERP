import { createPortal } from "react-dom";
import { ReactionPicker } from "./MessageReactions";

export default function MessageMenu({
  menuOpen,
  menuUsesBottomSheet,
  menuStyle,
  menuElRef,
  mobileMessageChrome,
  isCall,
  apagadaParaTodos,
  out,
  isPinned,
  isStarred,
  canDeleteForEveryone,
  reactionExpanded,
  reactionBusy,
  localReaction,
  onClose,
  onAction,
  onReact,
  onRemoveReaction,
  onExpandToggle,
  onReactionPicked,
}) {
  if (!menuOpen) return null;

  return createPortal(
    <>
      <div
        className={`wa-msgMenuBackdrop${menuUsesBottomSheet ? " wa-msgMenuBackdrop--sheet" : ""}`}
        aria-hidden="true"
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          onClose?.();
        }}
      />
      <div
        ref={menuElRef}
        className={`wa-msgMenu${menuUsesBottomSheet ? " wa-msgMenu--sheet" : ""}`}
        style={menuStyle || { position: "fixed", top: -9999, left: -9999 }}
        role="menu"
        aria-label="Opções da mensagem"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {mobileMessageChrome && !isCall && !apagadaParaTodos ? (
          <>
            <ReactionPicker
              mobileSelected={false}
              menuInline
              reactionExpanded={reactionExpanded}
              reactionBusy={reactionBusy}
              apagadaParaTodos={apagadaParaTodos}
              localReaction={localReaction}
              onReact={onReact}
              onRemoveReaction={onRemoveReaction}
              onExpandToggle={onExpandToggle}
              onPicked={onReactionPicked}
            />
            <div className="wa-msgMenuSep" aria-hidden="true" />
          </>
        ) : null}
        {out ? (
          <>
            <button type="button" className="wa-msgMenuItem" onClick={() => onAction("info")} role="menuitem">
              Dados da mensagem
            </button>
            <div className="wa-msgMenuSep" aria-hidden="true" />
          </>
        ) : null}
        {!apagadaParaTodos ? (
          <button type="button" className="wa-msgMenuItem" onClick={() => onAction("reply")} role="menuitem">
            Responder
          </button>
        ) : null}
        <button type="button" className="wa-msgMenuItem" onClick={() => onAction("copy")} role="menuitem">
          Copiar
        </button>
        {!apagadaParaTodos ? (
          <>
            <button type="button" className="wa-msgMenuItem" onClick={() => onAction("forward")} role="menuitem">
              Encaminhar
            </button>
            <button type="button" className="wa-msgMenuItem" onClick={() => onAction("pin")} role="menuitem">
              {isPinned ? "Desafixar" : "Fixar"}
            </button>
            <button type="button" className="wa-msgMenuItem" onClick={() => onAction("star")} role="menuitem">
              {isStarred ? "Desfavoritar" : "Favoritar"}
            </button>
            <button type="button" className="wa-msgMenuItem" onClick={() => onAction("select")} role="menuitem">
              Selecionar
            </button>
          </>
        ) : null}
        <div className="wa-msgMenuSep" aria-hidden="true" />
        <button
          type="button"
          className="wa-msgMenuItem"
          onClick={() => onAction("deleteForMe")}
          role="menuitem"
        >
          Apagar para mim
        </button>
        {canDeleteForEveryone ? (
          <button
            type="button"
            className="wa-msgMenuItem wa-msgMenuItemDanger"
            onClick={() => onAction("deleteForEveryone")}
            role="menuitem"
          >
            Apagar para todos
          </button>
        ) : null}
      </div>
    </>,
    document.body
  );
}
