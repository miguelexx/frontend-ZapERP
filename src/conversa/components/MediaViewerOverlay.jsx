import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildViewerImageCandidates,
  getMediaPlaybackUrl,
  mediaViewerSupportsPrint,
} from "../utils/conversaViewHelpers";
import { IconClose, IconPrint } from "../conversaViewIcons";

const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.18;
const ZOOM_DBLCLICK = 2.5;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function ViewerFallbackImg({ url, alt, imgRef, style, className, onDoubleClick }) {
  const candidates = useMemo(() => buildViewerImageCandidates(url), [url]);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
  }, [url]);
  const src = candidates[idx] || "";
  if (!src) return null;
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
      onDoubleClick={onDoubleClick}
      onError={() => {
        setIdx((n) => (n + 1 < candidates.length ? n + 1 : n));
      }}
    />
  );
}

/**
 * Zoom + pan para imagens do lightbox (roda do mouse, arrastar, pinch, duplo clique).
 */
function ZoomableImage({ url, alt, imgRef }) {
  const stageRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    dragRef.current = null;
    pinchRef.current = null;
    setDragging(false);
  }, [url]);

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

  const onPointerDown = (e) => {
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
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
    setOffset({ x: drag.origX + dx, y: drag.origY + dy });
  };

  const endDrag = (e) => {
    const drag = dragRef.current;
    if (!drag || (e && drag.pointerId !== e.pointerId)) return;
    dragRef.current = null;
    setDragging(false);
  };

  const onDoubleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (scaleRef.current > 1.05) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      return;
    }
    applyZoomAt(ZOOM_DBLCLICK, e.clientX, e.clientY);
  };

  const onTouchStart = (e) => {
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
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onDoubleClick={onDoubleClick}
    >
      <ViewerFallbackImg
        url={url}
        alt={alt}
        imgRef={imgRef}
        className="wa-mediaViewer-img wa-mediaViewer-img--zoomable"
        style={imgStyle}
        onDoubleClick={onDoubleClick}
      />
      {zoomed ? (
        <div className="wa-mediaViewer-zoomBadge" aria-hidden="true">
          {Math.round(scale * 100)}%
        </div>
      ) : null}
    </div>
  );
}

function isImageViewerContent(mediaViewer) {
  if (!mediaViewer) return false;
  if (mediaViewer.type === "imagem" || mediaViewer.type === "figurinha") return true;
  if (mediaViewer.type === "arquivo") {
    const fn = (mediaViewer.fileName || "").toLowerCase();
    return /\.(jpg|jpeg|png|gif|webp|bmp|avif|svg)$/i.test(fn);
  }
  return false;
}

/**
 * Visualizador de mídia em tela cheia. Monta só quando `mediaViewer` está definido.
 * Estados de PDF/impressão e efeitos de carregamento permanecem no pai.
 */
export default function MediaViewerOverlay({
  mediaViewer,
  mediaPdfBlobUrl,
  mediaPdfLoading,
  mediaPdfError,
  mediaPrintLoading,
  mediaViewerImgRef,
  mediaViewerVideoRef,
  onClose,
  onPrint,
}) {
  useEffect(() => {
    if (!mediaViewer) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mediaViewer, onClose]);

  if (!mediaViewer) return null;

  const showZoomableImage = isImageViewerContent(mediaViewer);

  return createPortal(
    <div
      className={`wa-modalOverlay wa-mediaViewerOverlay${showZoomableImage ? " wa-mediaViewerOverlay--image" : ""}`}
      role="dialog"
      aria-label="Visualizar mídia"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className={`wa-mediaViewer${showZoomableImage ? " wa-mediaViewer--image" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="wa-mediaViewer-actions">
          {mediaViewerSupportsPrint(mediaViewer.type, mediaViewer.fileName) ? (
            <button
              type="button"
              className="wa-mediaViewer-print"
              onClick={onPrint}
              disabled={mediaPrintLoading}
              title="Imprimir"
              aria-label="Imprimir"
              aria-busy={mediaPrintLoading}
            >
              <IconPrint />
            </button>
          ) : null}
          <button
            type="button"
            className="wa-mediaViewer-close"
            onClick={onClose}
            title="Fechar (Esc)"
            aria-label="Fechar"
          >
            <IconClose />
          </button>
        </div>
        {mediaViewer.type === "video" ? (
          <div className="wa-mediaViewer-videoWrap">
            <video
              ref={mediaViewerVideoRef}
              src={mediaViewer.url}
              controls
              autoPlay
              playsInline
              preload="auto"
              className="wa-mediaViewer-video"
            />
            <p className="wa-mediaViewer-videoPrintHint" role="note">
              A impressão usa o quadro exibido no momento. Navegadores costumam não imprimir o elemento de vídeo
              diretamente; usamos a imagem do frame atual.
            </p>
          </div>
        ) : showZoomableImage ? (
          <ZoomableImage
            url={mediaViewer.url}
            alt={
              mediaViewer.type === "figurinha"
                ? "Figurinha"
                : mediaViewer.fileName || "Imagem"
            }
            imgRef={mediaViewerImgRef}
          />
        ) : mediaViewer.type === "arquivo" ? (
          (() => {
            const fn = (mediaViewer.fileName || "").toLowerCase();
            const isPdf = fn.endsWith(".pdf");
            if (isPdf) {
              const absUrl = getMediaPlaybackUrl(mediaViewer.url, false) || mediaViewer.url;
              if (mediaPdfLoading) {
                return (
                  <div className="wa-mediaViewer-iframe wa-mediaViewer-pdfState" role="status" aria-busy="true">
                    Carregando documento…
                  </div>
                );
              }
              if (mediaPdfError) {
                return (
                  <div className="wa-mediaViewer-iframe wa-mediaViewer-pdfState">
                    <span className="wa-mediaViewer-fileIcon" aria-hidden="true">
                      📎
                    </span>
                    <span>Não foi possível exibir o PDF nesta janela ({mediaPdfError}).</span>
                    <a href={absUrl} target="_blank" rel="noreferrer" className="wa-btn wa-btn-primary">
                      Abrir em nova aba
                    </a>
                  </div>
                );
              }
              if (mediaPdfBlobUrl) {
                return (
                  <iframe
                    src={mediaPdfBlobUrl}
                    title={mediaViewer.fileName || "Documento"}
                    className="wa-mediaViewer-iframe"
                  />
                );
              }
              return (
                <div className="wa-mediaViewer-iframe wa-mediaViewer-pdfState" role="status">
                  Preparando documento…
                </div>
              );
            }
            return (
              <div className="wa-mediaViewer-file">
                <span className="wa-mediaViewer-fileIcon">📎</span>
                <span className="wa-mediaViewer-fileName">{mediaViewer.fileName || "Arquivo"}</span>
                <a href={mediaViewer.url} target="_blank" rel="noreferrer" className="wa-btn wa-btn-primary">
                  Abrir arquivo
                </a>
              </div>
            );
          })()
        ) : (
          <ViewerFallbackImg
            url={mediaViewer.url}
            alt={mediaViewer.type === "figurinha" ? "Figurinha" : "Imagem"}
            imgRef={mediaViewerImgRef}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
