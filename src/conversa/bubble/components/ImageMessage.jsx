import { useEffect, useMemo, useRef, useState } from "react";
import { resolveBubbleMediaCandidates } from "../../utils/conversaViewHelpers";
import MessageCaption from "./MessageCaption";

/** Imagem na bolha com fallback: blob local → URL do servidor → proxy. */
export function BubbleImage({ msg, alt, className }) {
  const candidates = useMemo(() => resolveBubbleMediaCandidates(msg), [
    msg?._optimisticBlobUrl,
    msg?.url,
    msg?.url_absoluta,
    msg?.media_url,
    msg?.mediaUrl,
    msg?.file_url,
    msg?.fileUrl,
    msg?.download_url,
    msg?.downloadUrl,
  ]);
  const [idx, setIdx] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [retryRound, setRetryRound] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef(null);
  const retryTimerRef = useRef(null);

  useEffect(() => {
    setIdx(0);
    setExhausted(false);
    setRetryRound(0);
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    // Quando a lista de fontes muda mas a fonte exibida (candidates[0]) continua a mesma
    // — caso da reconciliação otimista, em que o servidor apenas ANEXA a URL definitiva
    // depois do blob local —, o <img> NÃO redispara `onLoad` (o src não mudou). Sem herdar
    // o estado real do elemento, `loaded` ficaria falso para sempre e a imagem manteria a
    // classe `is-loading` (min-height gigante, caixa cinza vazia). Derivamos `loaded` de
    // `img.complete`; para uma fonte de fato nova, `complete` é falso e o onLoad assume.
    const el = imgRef.current;
    const nextSrc = candidates[0] || "";
    const complete = !!(el && el.complete && el.naturalWidth > 0 && el.getAttribute("src") === nextSrc);
    setLoaded(complete);
    if (complete && el.naturalWidth > 0 && el.naturalHeight > 0) {
      el.style.setProperty("--wa-img-ar", `${el.naturalWidth} / ${el.naturalHeight}`);
    }
  }, [candidates.join("\u0001")]);

  useEffect(
    () => () => {
      if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current);
    },
    []
  );

  const src = candidates[idx] || "";
  if (!src || exhausted) return <span className="wa-bubble-text wa-muted">(imagem)</span>;

  return (
    <img
      key={`${src}:${retryRound}`}
      ref={imgRef}
      src={src}
      alt={alt}
      className={`${className || ""} ${loaded ? "is-loaded" : "is-loading"}`.trim()}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={(e) => {
        setLoaded(true);
        const el = e.currentTarget;
        if (el?.naturalWidth > 0 && el?.naturalHeight > 0) {
          /* Fixa a proporção real para reloads/cache da mesma bolha (menos CLS). */
          el.style.setProperty("--wa-img-ar", `${el.naturalWidth} / ${el.naturalHeight}`);
        }
      }}
      onError={() => {
        setLoaded(false);
        if (idx + 1 < candidates.length) {
          setIdx(idx + 1);
          return;
        }
        setExhausted(true);
        if (retryRound < 1 && retryTimerRef.current == null) {
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            setRetryRound((round) => round + 1);
            setIdx(0);
            setExhausted(false);
          }, 700);
        }
      }}
    />
  );
}

export default function ImageMessage({
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
        onPointerUp={(e) => onPointerUp?.(e, mediaUrl, "imagem")}
        onClick={(e) => onClick?.(e, mediaUrl, "imagem")}
      >
        <BubbleImage
          msg={msg}
          alt="imagem"
          className="wa-bubble-img"
        />
      </button>
      <MessageCaption texto={texto} show={showCaption} />
    </div>
  );
}
