import { createPortal } from "react-dom";
import { ReactionPicker } from "./MessageReactions";
import useMotionPresence from "../../../components/ui/useMotionPresence";
import { Info, Reply, Copy, Forward, Pin, Star, CheckSquare, Pencil, Trash2 } from "lucide-react";

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
  canEdit,
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
  const motion = useMotionPresence(menuOpen);
  if (!motion.present) return null;

  return createPortal(
    <>
      <div
        className={`wa-msgMenuBackdrop${menuUsesBottomSheet ? " wa-msgMenuBackdrop--sheet" : ""}`}
        aria-hidden="true"
        style={!menuOpen ? { pointerEvents: "none" } : undefined}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          onClose?.();
        }}
      />
      <div
        ref={menuElRef}
        data-motion-state={motion.state}
        inert={!menuOpen ? "" : undefined}
        aria-hidden={!menuOpen || undefined}
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
              <Info aria-hidden="true" /> Dados da mensagem
            </button>
            <div className="wa-msgMenuSep" aria-hidden="true" />
          </>
        ) : null}
        {!apagadaParaTodos ? (
          <button type="button" className="wa-msgMenuItem" onClick={() => onAction("reply")} role="menuitem">
            <Reply aria-hidden="true" /> Responder
          </button>
        ) : null}
        <button type="button" className="wa-msgMenuItem" onClick={() => onAction("copy")} role="menuitem">
          <Copy aria-hidden="true" /> Copiar
        </button>
        {!apagadaParaTodos ? (
          <>
            <button type="button" className="wa-msgMenuItem" onClick={() => onAction("forward")} role="menuitem">
              <Forward aria-hidden="true" /> Encaminhar
            </button>
            <button type="button" className="wa-msgMenuItem" onClick={() => onAction("pin")} role="menuitem">
              <Pin aria-hidden="true" /> {isPinned ? "Desafixar" : "Fixar"}
            </button>
            <button type="button" className="wa-msgMenuItem" onClick={() => onAction("star")} role="menuitem">
              <Star aria-hidden="true" /> {isStarred ? "Desfavoritar" : "Favoritar"}
            </button>
            <button type="button" className="wa-msgMenuItem" onClick={() => onAction("select")} role="menuitem">
              <CheckSquare aria-hidden="true" /> Selecionar
            </button>
          </>
        ) : null}
        <div className="wa-msgMenuSep" aria-hidden="true" />
        {canEdit ? (
          <button type="button" className="wa-msgMenuItem" onClick={() => onAction("edit")} role="menuitem">
            <Pencil aria-hidden="true" /> Editar
          </button>
        ) : null}
        <button
          type="button"
          className="wa-msgMenuItem wa-msgMenuItemDanger"
          onClick={() => onAction("deleteForMe")}
          role="menuitem"
        >
          <Trash2 aria-hidden="true" /> Apagar para mim
        </button>
        {canDeleteForEveryone ? (
          <button
            type="button"
            className="wa-msgMenuItem wa-msgMenuItemDanger"
            onClick={() => onAction("deleteForEveryone")}
            role="menuitem"
          >
            <Trash2 aria-hidden="true" /> Apagar para todos
          </button>
        ) : null}
      </div>
    </>,
    document.body
  );
}
