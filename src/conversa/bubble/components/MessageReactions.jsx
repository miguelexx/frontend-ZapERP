import { IconEmoji } from "../../conversaViewIcons";
import { getReactionEmojiOptions } from "../utils/reactionEmojis";

export function ReactionPicker({
  mobileSelected = false,
  menuInline = false,
  reactionExpanded,
  reactionBusy,
  apagadaParaTodos,
  localReaction,
  onReact,
  onRemoveReaction,
  onExpandToggle,
  onPicked,
}) {
  const reactionEmojiOptions = getReactionEmojiOptions(reactionExpanded);

  return (
    <div
      className={`wa-reactionPicker${mobileSelected ? " wa-reactionPicker--selectedMobile" : ""}${
        menuInline ? " wa-reactionPicker--menuMobile" : ""
      }${
        reactionExpanded ? " isExpanded" : ""
      }`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {reactionEmojiOptions.map((emo) => (
        <button
          key={emo}
          type="button"
          className="wa-reactionPicker-btn"
          disabled={reactionBusy || !!apagadaParaTodos}
          onClick={() => {
            onReact?.(emo);
            onPicked?.();
          }}
          aria-label={`Reagir com ${emo}`}
        >
          {emo}
        </button>
      ))}
      {mobileSelected || menuInline ? (
        <button
          type="button"
          className="wa-reactionPicker-more"
          disabled={reactionBusy || !!apagadaParaTodos}
          onClick={() => onExpandToggle?.()}
          aria-label="Mais reações"
          aria-expanded={reactionExpanded}
        >
          +
        </button>
      ) : null}
      {localReaction ? (
        <button
          type="button"
          className="wa-reactionPicker-remove"
          disabled={reactionBusy || !!apagadaParaTodos}
          onClick={() => {
            onRemoveReaction?.();
            onPicked?.();
          }}
        >
          Remover reação
        </button>
      ) : null}
    </div>
  );
}

export function ReactionButton({
  reactionOpen,
  reactionBusy,
  apagadaParaTodos,
  onToggle,
}) {
  return (
    <button
      type="button"
      className={`wa-reactionBtn ${reactionOpen ? "isOpen" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle?.();
      }}
      title="Reagir"
      aria-label="Reagir à mensagem"
      disabled={reactionBusy || !!apagadaParaTodos}
    >
      <IconEmoji style={{ width: 12, height: 12 }} />
    </button>
  );
}

export function ReactionBadge({ localReaction }) {
  if (!localReaction) return null;
  return (
    <div className="wa-bubble-reaction" aria-label={`Sua reação: ${localReaction}`}>
      {localReaction}
    </div>
  );
}

export default function MessageReactions({
  localReaction,
  reactionOpen,
  reactionExpanded,
  reactionBusy,
  apagadaParaTodos,
  showButton,
  showPicker,
  pickerMobileSelected = false,
  pickerMenuInline = false,
  onToggle,
  onReact,
  onRemoveReaction,
  onExpandToggle,
  onPicked,
}) {
  return (
    <>
      {showButton ? (
        <ReactionButton
          reactionOpen={reactionOpen}
          reactionBusy={reactionBusy}
          apagadaParaTodos={apagadaParaTodos}
          onToggle={onToggle}
        />
      ) : null}
      {showPicker ? (
        <ReactionPicker
          mobileSelected={pickerMobileSelected}
          menuInline={pickerMenuInline}
          reactionExpanded={reactionExpanded}
          reactionBusy={reactionBusy}
          apagadaParaTodos={apagadaParaTodos}
          localReaction={localReaction}
          onReact={onReact}
          onRemoveReaction={onRemoveReaction}
          onExpandToggle={onExpandToggle}
          onPicked={onPicked}
        />
      ) : null}
      <ReactionBadge localReaction={localReaction} />
    </>
  );
}
