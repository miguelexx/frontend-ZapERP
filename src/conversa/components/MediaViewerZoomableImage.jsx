import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { buildViewerImageCandidates, getMediaUrl } from "../utils/conversaViewHelpers";
import {
  canReprocessInboundMedia,
  requestInboundMediaReprocess,
} from "../bubble/utils/inboundMediaReprocess";

const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.18;
/** Duplo toque (celular). */
const ZOOM_DBLTAP = 2.5;
/** Clique simples com rato (desktop): o cursor de lupa prometia isto e não fazia nada. */
const ZOOM_CLICK = 2;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function ViewerFallbackImg({ url, alt, imgRef, style, className, sourceMsg }) {
  const [recoveredUrl, setRecoveredUrl] = useState(null);
  const candidates = useMemo(
    () => buildViewerImageCandidates(recoveredUrl || url),
    [recoveredUrl, url]
  );
  const [idx, setIdx] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [reprocessando, setReprocessando] = useState(false);
  const [definitivo, setDefinitivo] = useState(false);
  const reprocessInFlightRef = useRef(false);
  useEffect(() => {
    setIdx(0);
    setExhausted(false);
    setRecoveredUrl(null);
    setDefinitivo(false);
  }, [url]);

  // O backend só reprocessa mídia RECEBIDA; espelha a regra aqui para não oferecer
  // um botão que sempre falharia em imagem enviada por nós.
  const sourceEhOut = String(sourceMsg?.direcao || "").toLowerCase() === "out";

  const tentarRecuperar = () => {
    if (reprocessInFlightRef.current) return;
    if (!canReprocessInboundMedia(sourceMsg, sourceEhOut)) return;
    reprocessInFlightRef.current = true;
    setReprocessando(true);
    requestInboundMediaReprocess(sourceMsg)
      .then((r) => {
        if (r?.ok) {
          const abs = r?.url ? getMediaUrl(r.url, null) || r.url : null;
          if (abs && abs !== (recoveredUrl || url)) setRecoveredUrl(abs);
          setIdx(0);
          setExhausted(false);
        } else if (r?.definitivo) {
          setDefinitivo(true);
        }
      })
      .finally(() => {
        reprocessInFlightRef.current = false;
        setReprocessando(false);
      });
  };

  const src = candidates[idx] || "";
  if (!src || exhausted) {
    const podeRecuperar = canReprocessInboundMedia(sourceMsg, sourceEhOut) && !definitivo;
    return (
      <div className="wa-mediaViewer-imgError" role="status">
        <ImageOff className="wa-mediaViewer-stateIcon" size={44} strokeWidth={1.5} aria-hidden="true" />
        <span>
          {definitivo
            ? "Esta imagem não está mais disponível no WhatsApp."
            : "Não foi possível carregar esta imagem."}
        </span>
        {podeRecuperar ? (
          <button
            type="button"
            className="wa-btn wa-btn-primary"
            disabled={reprocessando}
            aria-busy={reprocessando ? "true" : undefined}
            onClick={tentarRecuperar}
          >
            {reprocessando ? "Recuperando…" : "Tentar de novo"}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={className || "wa-mediaViewer-img"}
      style={style}
      loading="eager"
      decoding="async"
      fetchPriority="high"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => {
        if (idx + 1 < candidates.length) {
          setIdx(idx + 1);
          return;
        }
        setExhausted(true);
      }}
    />
  );
}

/**
 * Zoom + pan para imagens do lightbox.
 * - Rato: clique alterna 2x no ponto clicado (clique fora da foto fecha), roda aproxima, arrastar
 *   desloca com zoom.
 * - Toque: pinça e duplo toque; arrastar com zoom desloca. Com zoom = 1 o deslizar horizontal é
 *   do overlay (galeria) — `onScaleChange` informa a escala para ele saber quando pode.
 *
 * Monta de novo a cada item (o overlay usa `key`), então zoom/pan sempre começam do zero.
 */
export default function ZoomableImage({ url, alt, imgRef, sourceMsg, onScaleChange, onBackdropClick }) {
  const stageRef = useRef(null);
  const localImgRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const suppressClickRef = useRef(false);
  const lastPointerTypeRef = useRef(null);
  /* O clique só conta se o pointerdown começou AQUI: no celular o toque que abre o viewer
     termina com um `click` que já cai sobre o palco recém-montado — sem esta guarda ele
     contava como "clique fora da foto" e fechava o viewer na hora. */
  const downOnStageRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const setImgEl = useCallback(
    (el) => {
      localImgRef.current = el;
      if (imgRef && typeof imgRef === "object") imgRef.current = el;
      else if (typeof imgRef === "function") imgRef(el);
    },
    [imgRef]
  );

  useEffect(() => {
    scaleRef.current = scale;
    onScaleChange?.(scale);
  }, [scale, onScaleChange]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => () => onScaleChange?.(1), [onScaleChange]);

  const applyZoomAt = useCallback((nextScale, clientX, clientY) => {
    const stage = stageRef.current;
    if (!stage) {
      const s = clamp(nextScale, ZOOM_MIN, ZOOM_MAX);
      setScale(s);
      if (s <= ZOOM_MIN) setOffset({ x: 0, y: 0 });
      return;
    }
    const rect = stage.getBoundingClientRect();
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;
    const prev = scaleRef.current;
    const s = clamp(nextScale, ZOOM_MIN, ZOOM_MAX);
    if (s <= ZOOM_MIN) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      return;
    }
    const ratio = s / prev;
    const prevOff = offsetRef.current;
    setScale(s);
    setOffset({
      x: cx - (cx - prevOff.x) * ratio,
      y: cy - (cy - prevOff.y) * ratio,
    });
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const direction = e.deltaY < 0 ? 1 : -1;
      const next = scaleRef.current * (1 + direction * ZOOM_STEP);
      applyZoomAt(next, e.clientX, e.clientY);
    };

    const onTouchMoveNative = (e) => {
      const pinch = pinchRef.current;
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      applyZoomAt(dist / pinch.startDist * pinch.startScale, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("touchmove", onTouchMoveNative, { passive: false });
    return () => {
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("touchmove", onTouchMoveNative);
    };
  }, [applyZoomAt]);

  /** O ponto está sobre a foto desenhada? (a `<img>` tem pointer-events: none) */
  const pointOnImage = (clientX, clientY) => {
    const el = localImgRef.current;
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  };

  const onPointerDown = (e) => {
    lastPointerTypeRef.current = e.pointerType || "mouse";
    suppressClickRef.current = false;
    downOnStageRef.current = e.button === 0;
    if (e.button !== 0) return;
    if (scaleRef.current <= ZOOM_MIN) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: offsetRef.current.x,
      origY: offsetRef.current.y,
      moved: false,
    };
    setDragging(true);
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      // Cursor de lupa só sobre a foto; fora dela o clique fecha (cursor normal).
      if (e.pointerType === "mouse" && scaleRef.current <= ZOOM_MIN) {
        const stage = stageRef.current;
        if (stage) stage.classList.toggle("is-overImage", pointOnImage(e.clientX, e.clientY));
      }
      return;
    }
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
    setOffset({ x: drag.origX + dx, y: drag.origY + dy });
  };

  const endDrag = (e) => {
    const drag = dragRef.current;
    if (!drag || (e && drag.pointerId !== e.pointerId)) return;
    if (drag.moved) suppressClickRef.current = true;
    dragRef.current = null;
    setDragging(false);
  };

  const onClick = (e) => {
    const comecouAqui = downOnStageRef.current;
    downOnStageRef.current = false;
    if (!comecouAqui) return;
    // Toque usa duplo toque/pinça; o toque simples não pode aproximar nem fechar.
    const tipo = e.nativeEvent?.pointerType || lastPointerTypeRef.current;
    if (tipo && tipo !== "mouse") return;
    // Clique no estado de erro (botão "Tentar de novo") não é clique na foto.
    if (e.target !== e.currentTarget) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    // 2.º clique de um duplo clique: o 1.º já alternou o zoom.
    if (e.detail > 1) return;
    if (scaleRef.current > 1.01) {
      resetZoom();
      return;
    }
    if (pointOnImage(e.clientX, e.clientY)) {
      applyZoomAt(ZOOM_CLICK, e.clientX, e.clientY);
      stageRef.current?.classList.remove("is-overImage");
      return;
    }
    onBackdropClick?.();
  };

  const onDoubleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Rato: o clique simples já alterna o zoom (o duplo clique dá o mesmo resultado).
    const tipo = e.nativeEvent?.pointerType || lastPointerTypeRef.current;
    if (tipo === "mouse") return;
    if (scaleRef.current > 1.05) {
      resetZoom();
      return;
    }
    applyZoomAt(ZOOM_DBLTAP, e.clientX, e.clientY);
  };

  const onTouchStart = (e) => {
    lastPointerTypeRef.current = "touch";
    if (e.touches.length === 2) {
      dragRef.current = null;
      setDragging(false);
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = {
        startDist: dist || 1,
        startScale: scaleRef.current,
        midX: (a.clientX + b.clientX) / 2,
        midY: (a.clientY + b.clientY) / 2,
      };
    }
  };

  const onTouchEnd = (e) => {
    if (e.touches.length < 2) pinchRef.current = null;
  };

  const zoomed = scale > 1.01;
  const imgStyle = {
    transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
  };

  return (
    <div
      ref={stageRef}
      className={`wa-mediaViewer-stage${zoomed ? " is-zoomed" : ""}${dragging ? " is-dragging" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") stageRef.current?.classList.remove("is-overImage");
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <ViewerFallbackImg
        url={url}
        alt={alt}
        imgRef={setImgEl}
        className="wa-mediaViewer-img wa-mediaViewer-img--zoomable"
        style={imgStyle}
        sourceMsg={sourceMsg}
      />
      {zoomed ? (
        <div className="wa-mediaViewer-zoomBadge" aria-hidden="true">
          {Math.round(scale * 100)}%
        </div>
      ) : null}
    </div>
  );
}
