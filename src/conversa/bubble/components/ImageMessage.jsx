import { useEffect, useMemo, useRef, useState } from "react";
import { pickLoadedMediaSrcFromEvent, resolveBubbleMediaCandidates } from "../../utils/conversaViewHelpers";
import { canReprocessInboundMedia, requestInboundMediaReprocess } from "../utils/inboundMediaReprocess";
import MessageCaption from "./MessageCaption";

/** Imagem na bolha com fallback: blob local → URL do servidor → proxy. */
export function BubbleImage({ msg, alt, className, out }) {
  // StickerMessage não passa `out`: deriva da própria mensagem — o backend só
  // reprocessa mídia recebida, então mídia nossa não deve ganhar o botão.
  const ehOut = out !== undefined ? !!out : String(msg?.direcao || "").toLowerCase() === "out";
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
  const [reprocessando, setReprocessando] = useState(false);
  const [reprocessDefinitivo, setReprocessDefinitivo] = useState(false);
  const imgRef = useRef(null);
  const retryTimerRef = useRef(null);
  const reprocessAutoTriedRef = useRef(false);
  const reprocessInFlightRef = useRef(false);

  useEffect(() => {
    setIdx(0);
    setExhausted(false);
    setRetryRound(0);
    // Lista de fontes mudou (ex.: URL recuperada pelo reprocesso entrou na store):
    // libera uma nova tentativa automática para o novo conjunto.
    reprocessAutoTriedRef.current = false;
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

  const dispararReprocesso = () => {
    if (reprocessInFlightRef.current) return;
    if (!canReprocessInboundMedia(msg, ehOut)) return;
    reprocessInFlightRef.current = true;
    setReprocessando(true);
    requestInboundMediaReprocess(msg)
      .then((r) => {
        if (r?.ok) {
          // URL recuperada já foi aplicada na store (candidates mudam e o efeito acima
          // rearma tudo). Se a URL for a mesma (arquivo restaurado no disco), força uma
          // nova rodada local — o <img> volta a tentar as mesmas fontes.
          setIdx(0);
          setExhausted(false);
          setRetryRound(0);
        } else if (r?.definitivo) {
          setReprocessDefinitivo(true);
        }
      })
      .finally(() => {
        reprocessInFlightRef.current = false;
        setReprocessando(false);
      });
  };

  // Esgotou as fontes mesmo após a rodada local de retry: pede ao backend uma nova cópia
  // da mídia UMA vez, sozinho (link do provedor pode estar vivo; só a cópia local falhou).
  useEffect(() => {
    if (!exhausted || retryRound < 1) return;
    if (reprocessAutoTriedRef.current) return;
    if (!canReprocessInboundMedia(msg, ehOut)) return;
    reprocessAutoTriedRef.current = true;
    dispararReprocesso();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhausted, retryRound]);

  const src = candidates[idx] || "";
  if (!src || exhausted) {
    // Dentro de <button class="wa-bubble-imgLink"> — usar <span role="button"> (botão
    // aninhado é HTML inválido) e segurar o clique para não abrir o viewer quebrado.
    if (canReprocessInboundMedia(msg, ehOut) && !reprocessDefinitivo) {
      return (
        <span
          role="button"
          tabIndex={0}
          className="wa-bubble-text wa-muted wa-bubble-imgRetry"
          aria-busy={reprocessando ? "true" : undefined}
          onPointerDown={(e) => {
            // Sem isto, no mobile o onPointerUp do botão pai (wa-bubble-imgLink) abriria o
            // viewer quebrado ANTES do onClick do chip — o tap deve só tentar recuperar.
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!reprocessando) dispararReprocesso();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            e.stopPropagation();
            if (!reprocessando) dispararReprocesso();
          }}
          title={reprocessando ? "Recuperando a imagem…" : "Não foi possível carregar. Clique para tentar de novo."}
        >
          {reprocessando ? "Recuperando imagem…" : "Imagem indisponível — tentar de novo"}
        </span>
      );
    }
    return (
      <span className="wa-bubble-text wa-muted">
        {reprocessDefinitivo ? "Imagem expirou no WhatsApp" : "(imagem)"}
      </span>
    );
  }

  return (
    <img
      key={`${src}:${retryRound}`}
      ref={imgRef}
      src={src}
      alt={alt}
      className={`${className || ""} ${loaded ? "is-loaded" : "is-loading"}`.trim()}
      loading="eager"
      decoding="async"
      draggable={false}
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
  out,
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
        onPointerUp={(e) => onPointerUp?.(e, pickLoadedMediaSrcFromEvent(e) || mediaUrl, "imagem")}
        onClick={(e) => onClick?.(e, pickLoadedMediaSrcFromEvent(e) || mediaUrl, "imagem")}
      >
        <BubbleImage
          msg={msg}
          alt="imagem"
          className="wa-bubble-img"
          out={out}
        />
      </button>
      <MessageCaption texto={texto} show={showCaption} />
    </div>
  );
}
