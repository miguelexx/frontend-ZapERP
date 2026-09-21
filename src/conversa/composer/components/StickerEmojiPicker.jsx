import { createPortal } from "react-dom";
import { IconEmoji, IconSticker } from "../../conversaComposerIcons";
import { COMPOSER_EMOJIS, safeString } from "../utils/composerUtils";

/**
 * Painel unificado de Emojis + Figurinhas com abas.
 * Um único botão no composer abre este painel; o usuário escolhe a aba.
 * A aba "Figurinhas" só aparece quando é possível enviar figurinha
 * (conversa ativa, fora de edição/nota).
 */
export default function StickerEmojiPicker({
  open,
  isRecording,
  panelRef,
  activeTab,
  onTabChange,
  canSendSticker,
  // emoji
  emojiSearchRef,
  emojiQuery,
  onEmojiQueryChange,
  onInsertEmoji,
  // sticker
  stickerSearchRef,
  stickerInputRef,
  stickerQuery,
  stickers,
  onStickerQueryChange,
  onSendStickerFile,
  showToast,
}) {
  if (isRecording || !open || typeof document === "undefined") return null;

  const tab = canSendSticker ? activeTab : "emoji";

  const emojis = COMPOSER_EMOJIS.filter(
    (emoji) => !safeString(emojiQuery) || emoji.includes(safeString(emojiQuery))
  );

  return createPortal(
    <div
      ref={panelRef}
      className="wa-stickerPanel wa-mediaPanel"
      role="dialog"
      aria-label="Emojis e figurinhas"
    >
      <div className="wa-mediaTabs" role="tablist" aria-label="Emojis e figurinhas">
        <button
          type="button"
          className={`wa-mediaTab ${tab === "emoji" ? "isActive" : ""}`}
          role="tab"
          aria-selected={tab === "emoji"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onTabChange("emoji")}
        >
          <IconEmoji width={17} height={17} />
          <span>Emojis</span>
        </button>
        {canSendSticker ? (
          <button
            type="button"
            className={`wa-mediaTab ${tab === "stickers" ? "isActive" : ""}`}
            role="tab"
            aria-selected={tab === "stickers"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onTabChange("stickers")}
          >
            <IconSticker width={17} height={17} />
            <span>Figurinhas</span>
          </button>
        ) : null}
      </div>

      {tab === "emoji" ? (
        <>
          <div className="wa-stickerHead">
            <input
              ref={emojiSearchRef}
              className="wa-stickerSearch"
              value={emojiQuery}
              onChange={(event) => onEmojiQueryChange(event.target.value)}
              placeholder="Buscar emoji..."
              aria-label="Buscar emoji"
            />
          </div>
          <div className="wa-emojiGrid" role="list">
            {emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="wa-emojiBtn"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onInsertEmoji(emoji)}
                role="listitem"
                aria-label={`Emoji ${emoji}`}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="wa-stickerHead">
            <input
              ref={stickerSearchRef}
              className="wa-stickerSearch"
              value={stickerQuery}
              onChange={(event) => onStickerQueryChange(event.target.value)}
              placeholder="Buscar figurinha..."
              aria-label="Buscar figurinha"
            />
          </div>
          <div className="wa-stickerGrid" role="list">
            <button
              type="button"
              className="wa-stickerCreate"
              onClick={() => stickerInputRef?.current?.click()}
              aria-label="Criar figurinha"
            >
              <span className="wa-stickerCreatePlus" aria-hidden="true">+</span>
              <span>Criar</span>
            </button>
            {stickers.map((item) => (
              <button
                key={String(item.id)}
                type="button"
                className="wa-stickerItem"
                onClick={async () => {
                  try {
                    const response = await fetch(item.dataUrl);
                    const blob = await response.blob();
                    const extension = String(item?.mimeType || "").includes("webp") ? "webp" : "png";
                    const file = new File([blob], item?.name || `sticker-${Date.now()}.${extension}`, {
                      type: item?.mimeType || blob.type || "image/webp",
                    });
                    await onSendStickerFile?.(file);
                  } catch {
                    showToast?.({
                      type: "error",
                      title: "Figurinha",
                      message: "Não foi possível enviar esta figurinha.",
                    });
                  }
                }}
                role="listitem"
                aria-label={`Enviar figurinha ${item?.name || ""}`.trim()}
                title={item?.name || "Figurinha"}
              >
                <img src={item.dataUrl} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
