import { createPortal } from "react-dom";

export default function StickerPicker({
  open,
  isRecording,
  panelRef,
  searchRef,
  inputRef,
  query,
  stickers,
  onQueryChange,
  onSendStickerFile,
  showToast,
}) {
  if (isRecording || !open || typeof document === "undefined") return null;

  return createPortal(
    <div ref={panelRef} className="wa-stickerPanel" role="dialog" aria-label="Figurinhas">
      <div className="wa-stickerTabs" role="tablist" aria-label="Categorias de figurinhas">
        <button type="button" className="wa-stickerTab isActive" role="tab" aria-selected="true">
          Recentes
        </button>
      </div>
      <div className="wa-stickerHead">
        <input
          ref={searchRef}
          className="wa-stickerSearch"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar figurinha..."
          aria-label="Buscar figurinha"
        />
      </div>
      <div className="wa-stickerGrid" role="list">
        <button
          type="button"
          className="wa-stickerCreate"
          onClick={() => inputRef.current?.click()}
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
    </div>,
    document.body
  );
}
