import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactCrop from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Crop, Maximize2, Pencil, RotateCw, Sparkles, Undo2, X } from "lucide-react";
import {
  cropToNaturalPixels,
  FULL_IMAGE_CROP_PERCENT,
  getImageSendFilterCss,
  IMAGE_SEND_DRAW_COLORS,
  IMAGE_SEND_FILTERS,
  rotateImageBlobUrl,
} from "./utils/imageCropExport.js";

const DRAW_WIDTH_NORM = 0.018;

function clientToNorm(clientX, clientY, img) {
  const r = img.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return {
    x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
  };
}

function paintStrokes(canvas, width, height, strokes, current) {
  if (!canvas || width <= 0 || height <= 0) return;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const all = current ? [...strokes, current] : strokes;
  for (const stroke of all) {
    const points = stroke?.points || [];
    if (!points.length) continue;
    const color = stroke.color || "#ef4444";
    const lineWidth = Math.max(1.5, (stroke.widthNorm || DRAW_WIDTH_NORM) * Math.min(width, height));
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x * width, points[0].y * height, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x * width, points[0].y * height);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x * width, points[i].y * height);
    }
    ctx.stroke();
  }
}

/**
 * Preview unificado (mobile e desktop): cortar, desenhar, filtro e girar
 * antes de enviar a foto (print colado incluso).
 */
export default function ImageSendPreviewMobile({
  rootRef,
  captionRef,
  imageUrl,
  fileName,
  mimeType,
  caption,
  onCaptionChange,
  sending,
  onCancel,
  onSend,
  sendIcon,
}) {
  const imgRef = useRef(null);
  const stageRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const displayUrlRef = useRef(imageUrl);
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef(null);
  const [displayUrl, setDisplayUrl] = useState(imageUrl);
  const [crop, setCrop] = useState(FULL_IMAGE_CROP_PERCENT);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [sendAsOriginal, setSendAsOriginal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [tool, setTool] = useState("crop");
  const [filterId, setFilterId] = useState("none");
  const [drawColor, setDrawColor] = useState(IMAGE_SEND_DRAW_COLORS[0]);
  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState(null);

  const busy = sending || exporting || rotating;
  const filterCss = getImageSendFilterCss(filterId);
  const cropEnabled = !sendAsOriginal && tool !== "draw";
  const drawEnabled = !sendAsOriginal && tool === "draw";

  const syncPixelCrop = useCallback((nextCrop) => {
    const img = imgRef.current;
    if (!img) return;
    const pixels = cropToNaturalPixels(nextCrop, img);
    if (pixels) setCroppedAreaPixels(pixels);
  }, []);

  const syncDrawOverlay = useCallback(() => {
    const img = imgRef.current;
    const stage = stageRef.current;
    const canvas = drawCanvasRef.current;
    if (!img || !stage || !canvas) return;
    const ir = img.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    canvas.style.left = `${ir.left - sr.left}px`;
    canvas.style.top = `${ir.top - sr.top}px`;
    paintStrokes(canvas, ir.width, ir.height, strokes, currentStroke);
  }, [currentStroke, strokes]);

  const onImageLoad = useCallback(
    (e) => {
      imgRef.current = e.currentTarget;
      setCrop((cur) => {
        const next = cur?.width ? cur : FULL_IMAGE_CROP_PERCENT;
        requestAnimationFrame(() => {
          syncPixelCrop(next);
          syncDrawOverlay();
        });
        return next;
      });
    },
    [syncDrawOverlay, syncPixelCrop]
  );

  const onCropChange = useCallback(
    (nextCrop) => {
      setCrop(nextCrop);
      syncPixelCrop(nextCrop);
    },
    [syncPixelCrop]
  );

  const handleResetCrop = useCallback(() => {
    setCrop(FULL_IMAGE_CROP_PERCENT);
    syncPixelCrop(FULL_IMAGE_CROP_PERCENT);
    setFilterId("none");
    setStrokes([]);
    setCurrentStroke(null);
    setTool("crop");
  }, [syncPixelCrop]);

  const handleRotate = useCallback(async () => {
    if (rotating || sendAsOriginal) return;
    setRotating(true);
    try {
      const prev = displayUrlRef.current;
      const next = await rotateImageBlobUrl(prev);
      if (prev && prev !== imageUrl && prev.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(prev);
        } catch {
          /* ignore */
        }
      }
      displayUrlRef.current = next;
      setDisplayUrl(next);
      setCrop(FULL_IMAGE_CROP_PERCENT);
      setStrokes([]);
      setCurrentStroke(null);
    } catch (err) {
      console.error("[ImageSendPreview] rotate:", err);
    } finally {
      setRotating(false);
    }
  }, [imageUrl, rotating, sendAsOriginal]);

  useEffect(() => {
    displayUrlRef.current = imageUrl;
    setDisplayUrl(imageUrl);
    setCrop(FULL_IMAGE_CROP_PERCENT);
    setFilterId("none");
    setStrokes([]);
    setCurrentStroke(null);
    setTool("crop");
  }, [imageUrl]);

  useEffect(
    () => () => {
      const u = displayUrlRef.current;
      if (u && u !== imageUrl && String(u).startsWith("blob:")) {
        try {
          URL.revokeObjectURL(u);
        } catch {
          /* ignore */
        }
      }
    },
    [imageUrl]
  );

  useLayoutEffect(() => {
    syncDrawOverlay();
    const img = imgRef.current;
    if (!img || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => syncDrawOverlay());
    ro.observe(img);
    window.addEventListener("resize", syncDrawOverlay);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncDrawOverlay);
    };
  }, [syncDrawOverlay, displayUrl, cropEnabled, sendAsOriginal]);

  const beginStroke = useCallback(
    (e) => {
      if (!drawEnabled || busy) return;
      const img = imgRef.current;
      if (!img) return;
      const pt = clientToNorm(e.clientX, e.clientY, img);
      if (!pt) return;
      e.preventDefault();
      drawingRef.current = true;
      const stroke = { color: drawColor, widthNorm: DRAW_WIDTH_NORM, points: [pt] };
      currentStrokeRef.current = stroke;
      setCurrentStroke(stroke);
    },
    [busy, drawColor, drawEnabled]
  );

  const moveStroke = useCallback((e) => {
    if (!drawingRef.current) return;
    const img = imgRef.current;
    if (!img) return;
    const pt = clientToNorm(e.clientX, e.clientY, img);
    if (!pt) return;
    e.preventDefault();
    const prev = currentStrokeRef.current;
    if (!prev) return;
    const next = { ...prev, points: [...prev.points, pt] };
    currentStrokeRef.current = next;
    setCurrentStroke(next);
  }, []);

  const endStroke = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const done = currentStrokeRef.current;
    currentStrokeRef.current = null;
    setCurrentStroke(null);
    if (done?.points?.length) {
      setStrokes((list) => [...list, done]);
    }
  }, []);

  useEffect(() => {
    if (!drawEnabled) return undefined;
    const onMove = (e) => moveStroke(e);
    const onUp = () => endStroke();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drawEnabled, endStroke, moveStroke]);

  const handleSend = useCallback(async () => {
    if (busy) return;
    setExporting(true);
    try {
      let pixels = croppedAreaPixels;
      if (!sendAsOriginal && imgRef.current && crop) {
        pixels = cropToNaturalPixels(crop, imgRef.current) || pixels;
      }
      await onSend({
        sendAsOriginal,
        croppedAreaPixels: pixels,
        rotation: 0,
        imageSrc: displayUrlRef.current,
        filterId,
        strokes,
        fileName: fileName || "foto.jpg",
        mimeType: mimeType || "image/jpeg",
      });
    } catch (err) {
      console.error("[ImageSendPreview] envio:", err);
    } finally {
      setExporting(false);
    }
  }, [busy, crop, croppedAreaPixels, fileName, filterId, mimeType, onSend, sendAsOriginal, strokes]);

  const photo = (
    <img
      ref={imgRef}
      src={displayUrl}
      alt={cropEnabled ? "Ajuste o quadro para recortar a foto" : "Foto a enviar"}
      className={`wa-imageSend-photo${sendAsOriginal ? " wa-imageSend-photo--full" : ""}`}
      draggable={false}
      onLoad={onImageLoad}
      style={{ filter: filterCss === "none" ? undefined : filterCss }}
    />
  );

  return (
    <div
      ref={rootRef}
      className="wa-mediaPreview wa-mediaPreview--imageUnified"
      role="dialog"
      aria-modal="true"
      aria-label="Editar e enviar foto"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="wa-mediaPreview-head wa-mediaPreview-head--overlay">
        <button
          type="button"
          className="wa-mediaPreview-close wa-imageSend-closeBtn"
          onClick={onCancel}
          disabled={busy}
          aria-label="Cancelar envio"
          title="Cancelar"
        >
          <X size={22} strokeWidth={2} aria-hidden="true" />
        </button>
        <span className="wa-mediaPreview-title">Enviar foto</span>
        <span className="wa-mediaPreview-spacer" aria-hidden="true" />
      </div>

      <div className="wa-mediaPreview-stage wa-mediaPreview-stage--crop">
        <div className="wa-imageSend-canvas">
          <div ref={stageRef} className="wa-imageSend-photoStage">
            {cropEnabled ? (
              <ReactCrop
                className="wa-imageSend-reactCrop ReactCrop--no-animate"
                crop={crop}
                ruleOfThirds
                onChange={(_, percentCrop) => onCropChange(percentCrop)}
                onComplete={(_, percentCrop) => onCropChange(percentCrop)}
              >
                {photo}
              </ReactCrop>
            ) : (
              photo
            )}
            <canvas
              ref={drawCanvasRef}
              className={`wa-imageSend-drawCanvas${drawEnabled ? " is-draw" : ""}`}
              onPointerDown={drawEnabled ? beginStroke : undefined}
            />
          </div>
        </div>

        {!sendAsOriginal ? (
          <div className="wa-imageSendFloatTools" role="toolbar" aria-label="Ferramentas de edição">
            <button
              type="button"
              className={`wa-imageSendTool${tool === "crop" ? " is-active" : ""}`}
              onClick={() => setTool("crop")}
              disabled={busy}
              aria-pressed={tool === "crop"}
              title="Cortar"
            >
              <Crop size={18} strokeWidth={1.9} aria-hidden="true" />
              <span className="wa-imageSendTool-label">Cortar</span>
            </button>
            <button
              type="button"
              className={`wa-imageSendTool${tool === "draw" ? " is-active" : ""}`}
              onClick={() => setTool("draw")}
              disabled={busy}
              aria-pressed={tool === "draw"}
              title="Desenhar"
            >
              <Pencil size={18} strokeWidth={1.9} aria-hidden="true" />
              <span className="wa-imageSendTool-label">Editar</span>
            </button>
            <button
              type="button"
              className={`wa-imageSendTool${tool === "filter" ? " is-active" : ""}`}
              onClick={() => setTool("filter")}
              disabled={busy}
              aria-pressed={tool === "filter"}
              title="Filtros"
            >
              <Sparkles size={18} strokeWidth={1.9} aria-hidden="true" />
              <span className="wa-imageSendTool-label">Filtro</span>
            </button>
          </div>
        ) : (
          <span className="wa-imageSend-originalBadge" aria-live="polite">
            Foto original
          </span>
        )}
      </div>

      {tool === "filter" && !sendAsOriginal ? (
        <div className="wa-imageSendFilters" role="listbox" aria-label="Filtros">
          {IMAGE_SEND_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`wa-imageSendFilter${filterId === f.id ? " is-active" : ""}`}
              onClick={() => setFilterId(f.id)}
              disabled={busy}
              aria-pressed={filterId === f.id}
            >
              <span
                className="wa-imageSendFilter-thumb"
                style={{ backgroundImage: `url(${displayUrl})`, filter: f.css === "none" ? undefined : f.css }}
              />
              <span className="wa-imageSendFilter-label">{f.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {tool === "draw" && !sendAsOriginal ? (
        <div className="wa-imageSendColors" role="toolbar" aria-label="Cor do desenho">
          {IMAGE_SEND_DRAW_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`wa-imageSendColor${drawColor === color ? " is-active" : ""}`}
              style={{ background: color }}
              onClick={() => setDrawColor(color)}
              disabled={busy}
              aria-label={`Cor ${color}`}
              aria-pressed={drawColor === color}
            />
          ))}
        </div>
      ) : null}

      <div className="wa-imageSendEditBar" role="toolbar" aria-label="Ferramentas de recorte">
        <button
          type="button"
          className="wa-imageSendEditBar-btn"
          onClick={() => setStrokes((list) => list.slice(0, -1))}
          disabled={busy || sendAsOriginal || strokes.length === 0}
          aria-label="Desfazer traço"
          title="Desfazer"
        >
          <Undo2 size={22} strokeWidth={1.75} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="wa-imageSendEditBar-btn"
          onClick={handleRotate}
          disabled={busy || sendAsOriginal}
          aria-label="Girar imagem"
          title="Girar"
        >
          <RotateCw size={22} strokeWidth={1.75} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="wa-imageSendEditBar-reset"
          onClick={handleResetCrop}
          disabled={busy || sendAsOriginal}
        >
          Redefinir
        </button>

        <button
          type="button"
          className={`wa-imageSendEditBar-btn wa-imageSendEditBar-btn--end${sendAsOriginal ? " is-active" : ""}`}
          disabled={busy}
          onClick={() => setSendAsOriginal((v) => !v)}
          aria-label={sendAsOriginal ? "Voltar à edição" : "Enviar foto original sem edição"}
          aria-pressed={sendAsOriginal}
          title={sendAsOriginal ? "Editar" : "Original"}
        >
          <Maximize2 size={22} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className="wa-mediaPreview-composer">
        <div className="wa-mediaPreview-inputWrap">
          <textarea
            ref={captionRef}
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!busy) handleSend();
              }
            }}
            placeholder="Adicionar legenda (opcional)…"
            rows={1}
            className="wa-mediaPreview-input"
            disabled={busy}
            aria-label="Legenda ou comentário junto ao envio"
            enterKeyHint="send"
            maxLength={1024}
          />
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={busy}
          className="wa-mediaPreview-sendBtn"
          title="Enviar"
          aria-label="Confirmar envio"
        >
          {busy ? <span className="wa-spinner" aria-hidden="true" /> : sendIcon}
        </button>
      </div>
    </div>
  );
}
