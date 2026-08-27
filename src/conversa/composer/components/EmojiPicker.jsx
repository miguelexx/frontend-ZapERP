import { createPortal } from "react-dom";
import { IconClose } from "../../conversaComposerIcons";
import { COMPOSER_EMOJIS, safeString } from "../utils/composerUtils";

export default function EmojiPicker({
  open,
  isRecording,
  panelRef,
  searchRef,
  query,
  onQueryChange,
  onClose,
  onInsert,
}) {
  if (isRecording || !open || typeof document === "undefined") return null;

  const emojis = COMPOSER_EMOJIS.filter(
    (emoji) => !safeString(query) || emoji.includes(safeString(query))
  );

  return createPortal(
    <div ref={panelRef} className="wa-emojiPanel" role="dialog" aria-label="Selecionar emoji">
      <div className="wa-emojiHead">
        <input
          ref={searchRef}
          className="wa-emojiSearch"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar emoji..."
          aria-label="Buscar emoji"
        />
        <button
          type="button"
          className="wa-iconBtn"
          onClick={onClose}
          title="Fechar"
          aria-label="Fechar"
        >
          <IconClose />
        </button>
      </div>
      <div className="wa-emojiGrid" role="list">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="wa-emojiBtn"
            onClick={() => onInsert(emoji)}
            role="listitem"
            aria-label={`Emoji ${emoji}`}
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="wa-emojiFoot">
        <span className="wa-muted">Dica: clique para inserir no cursor.</span>
      </div>
    </div>,
    document.body
  );
}
