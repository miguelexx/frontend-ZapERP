import { BubbleImage } from "./ImageMessage";
import MessageCaption from "./MessageCaption";

export default function StickerMessage({
  msg,
  mediaUrl,
  texto,
  showCaption,
  onPointerDown,
  onPointerUp,
  onClick,
}) {
  return (
    <div className="wa-bubble-mediaStack">
      <button
        type="button"
        className="wa-bubble-imgLink"
        onPointerDown={onPointerDown}
        onPointerUp={(e) => onPointerUp?.(e, mediaUrl, "figurinha")}
        onClick={(e) => onClick?.(e, mediaUrl, "figurinha")}
      >
        <BubbleImage
          msg={msg}
          alt="figurinha"
          className="wa-bubble-img"
        />
      </button>
      <MessageCaption texto={texto} show={showCaption} />
    </div>
  );
}
