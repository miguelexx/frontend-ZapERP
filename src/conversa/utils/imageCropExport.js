/**
 * Pipeline de imagem do envio (câmera, galeria, print colado).
 *
 * Regra de ouro de desempenho no celular: NUNCA manter um raster na resolução
 * nativa da câmera (12–48 MP) vivo na tela nem encostar nele duas vezes.
 *   - `prepareImageForSend` cria UMA cópia de trabalho já no teto de envio; o
 *     editor, os filtros e o export passam a operar nela (≈2 MP em vez de 48).
 *   - `exportEditedImageFile` desenha filtro + recorte + traços em UM canvas no
 *     tamanho final (antes eram dois canvas em resolução nativa; no iOS um
 *     canvas acima de ~16 MP volta em branco).
 *   - decode preferencialmente via `createImageBitmap` (fora da main thread).
 */

/** Teto do lado maior no envio (igual ao WhatsApp: nitidez boa, upload leve). */
export const IMAGE_SEND_MAX_EDGE = 1920;
/** Qualidade JPEG do envio. 0.92 gerava ~1,2 MB por foto — 4x mais upload. */
export const IMAGE_SEND_QUALITY = 0.86;
/** Lado do thumbnail usado nos chips de filtro. */
export const IMAGE_SEND_THUMB_EDGE = 128;

/** @param {string} url */
export function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (e) => reject(e));
    image.crossOrigin = "anonymous";
    image.src = url;
  });
}

function sourceSize(source) {
  const w = source?.naturalWidth || source?.width || 0;
  const h = source?.naturalHeight || source?.height || 0;
  return { width: w, height: h };
}

function closeSource(source) {
  if (source && typeof source.close === "function") {
    try {
      source.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Decodifica para desenhar no canvas. `createImageBitmap` roda fora da main
 * thread (não trava o scroll/toque enquanto a foto de 12 MP é decodificada);
 * HEIC do iPhone e navegadores antigos caem no `<img>`.
 * @param {string|Blob} src
 * @returns {Promise<ImageBitmap|HTMLImageElement>}
 */
export async function decodeImageSource(src) {
  const canBitmap = typeof createImageBitmap === "function";
  if (canBitmap) {
    try {
      const blob = src instanceof Blob ? src : await fetch(src).then((r) => r.blob());
      return await createImageBitmap(blob);
    } catch {
      /* cai no <img> */
    }
  }
  const url = src instanceof Blob ? URL.createObjectURL(src) : src;
  try {
    return await loadImageElement(url);
  } finally {
    if (src instanceof Blob) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }
  }
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao exportar imagem."))),
      mimeType,
      quality
    );
  });
}

function outputMimeFor(mimeType) {
  return String(mimeType || "").toLowerCase() === "image/png" ? "image/png" : "image/jpeg";
}

function withExtension(fileName, outputMime) {
  const ext = outputMime === "image/png" ? ".png" : outputMime === "image/webp" ? ".webp" : ".jpg";
  return String(fileName || "foto").replace(/\.[^.]+$/, "") + ext;
}

/** Fator para caber no teto do lado maior (nunca amplia). */
export function fitScale(width, height, maxEdge) {
  const edge = Number(maxEdge) > 0 ? Number(maxEdge) : IMAGE_SEND_MAX_EDGE;
  return Math.min(1, edge / Math.max(width, height, 1));
}

/**
 * Cópia de trabalho da foto já no teto de envio. É ela que vai para o editor,
 * para os filtros e (quando o atendente não edita nada) direto para o upload —
 * sem segundo encode.
 *
 * @param {File|Blob} file
 * @param {{ maxEdge?: number, quality?: number, mimeType?: string }} [opts]
 * @returns {Promise<{ file: File, url: string, width: number, height: number, downscaled: boolean }>}
 */
export async function prepareImageForSend(file, opts = {}) {
  const maxEdge = Number(opts.maxEdge) > 0 ? Number(opts.maxEdge) : IMAGE_SEND_MAX_EDGE;
  const quality = Number.isFinite(opts.quality) ? opts.quality : IMAGE_SEND_QUALITY;
  const source = await decodeImageSource(file);
  try {
    const { width: nw, height: nh } = sourceSize(source);
    if (!nw || !nh) throw new Error("Imagem inválida.");

    const scale = fitScale(nw, nh, maxEdge);
    const outW = Math.max(1, Math.round(nw * scale));
    const outH = Math.max(1, Math.round(nh * scale));

    const inputMime = String(file?.type || opts.mimeType || "").toLowerCase();
    const alreadySmall = scale === 1;
    const knownSafeMime = inputMime === "image/jpeg" || inputMime === "image/png";
    // Já está pequena e num formato que o WhatsApp aceita: não reencoda (encode
    // de JPEG no celular custa 150–600 ms e degrada a imagem sem necessidade).
    if (alreadySmall && knownSafeMime && file instanceof File) {
      return { file, url: URL.createObjectURL(file), width: nw, height: nh, downscaled: false };
    }

    const canvas = createCanvas(outW, outH);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, nw, nh, 0, 0, outW, outH);

    const outputMime = inputMime === "image/png" ? "image/png" : "image/jpeg";
    const blob = await canvasToBlob(canvas, outputMime, outputMime === "image/jpeg" ? quality : undefined);
    const name = withExtension(file?.name || `foto-${Date.now()}`, outputMime);
    const out = new File([blob], name, { type: outputMime, lastModified: Date.now() });
    return { file: out, url: URL.createObjectURL(out), width: outW, height: outH, downscaled: true };
  } finally {
    closeSource(source);
  }
}

/**
 * Thumbnail minúsculo para os 7 chips de filtro. Antes cada chip usava
 * `background-image` apontando para a foto inteira: 7 reescalas da imagem
 * nativa só para pintar 56 px — era o travamento ao abrir a aba "Filtro".
 * @param {string|Blob} src
 * @param {number} [edge]
 * @returns {Promise<string>} blob URL (revogar no componente)
 */
export async function createFilterThumbUrl(src, edge = IMAGE_SEND_THUMB_EDGE) {
  const source = await decodeImageSource(src);
  try {
    const { width: nw, height: nh } = sourceSize(source);
    if (!nw || !nh) throw new Error("Imagem inválida.");
    const scale = fitScale(nw, nh, edge);
    const canvas = createCanvas(nw * scale, nh * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(source, 0, 0, nw, nh, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.74);
    return URL.createObjectURL(blob);
  } finally {
    closeSource(source);
  }
}

/** Crop em % ou px (coordenadas da imagem exibida) → pixels da imagem original. */
export function cropToNaturalPixels(crop, imageEl) {
  if (!crop || !imageEl?.width || !imageEl?.height) return null;
  const { width: dw, height: dh, naturalWidth: nw, naturalHeight: nh } = imageEl;
  let x;
  let y;
  let w;
  let h;
  if (crop.unit === "%") {
    x = ((crop.x || 0) / 100) * dw;
    y = ((crop.y || 0) / 100) * dh;
    w = ((crop.width || 0) / 100) * dw;
    h = ((crop.height || 0) / 100) * dh;
  } else {
    x = crop.x || 0;
    y = crop.y || 0;
    w = crop.width || 0;
    h = crop.height || 0;
  }
  if (w <= 0 || h <= 0) return null;
  const scaleX = nw / dw;
  const scaleY = nh / dh;
  return {
    x: Math.max(0, Math.round(x * scaleX)),
    y: Math.max(0, Math.round(y * scaleY)),
    width: Math.min(nw, Math.round(w * scaleX)),
    height: Math.min(nh, Math.round(h * scaleY)),
  };
}

export const FULL_IMAGE_CROP_PERCENT = { unit: "%", x: 0, y: 0, width: 100, height: 100 };

/**
 * Tolerância (em %) para tratar o quadro como "a foto inteira". Minúscula de
 * propósito: só absorve ruído de float. Quadro que o atendente mexeu, por
 * pouco que seja, TEM de ser recortado — margem larga aqui silenciaria o corte.
 */
const FULL_CROP_EPSILON = 0.05;

/** O recorte cobre a foto inteira? Serve para pular o export por completo. */
export function isFullFrameCrop(crop) {
  if (!crop) return true;
  if (crop.unit !== "%") return false;
  const x = Number(crop.x) || 0;
  const y = Number(crop.y) || 0;
  const w = Number(crop.width) || 0;
  const h = Number(crop.height) || 0;
  return (
    Math.abs(x) <= FULL_CROP_EPSILON &&
    Math.abs(y) <= FULL_CROP_EPSILON &&
    Math.abs(w - 100) <= FULL_CROP_EPSILON &&
    Math.abs(h - 100) <= FULL_CROP_EPSILON
  );
}

/**
 * Nada foi editado? Então o arquivo de trabalho já é o arquivo final: o envio
 * sai sem decode + canvas + encode (economiza ~0,5–2 s por foto no celular).
 * @param {{ crop?: any, filterId?: string, strokes?: any[], rotated?: boolean }} state
 */
export function isUneditedImageSend(state = {}) {
  if (state.rotated) return false;
  if (Array.isArray(state.strokes) && state.strokes.length > 0) return false;
  const filterCss = getImageSendFilterCss(state.filterId);
  if (filterCss && filterCss !== "none") return false;
  return isFullFrameCrop(state.crop);
}

export const IMAGE_SEND_FILTERS = Object.freeze([
  { id: "none", label: "Original", css: "none" },
  { id: "vivid", label: "Vívido", css: "saturate(1.5) contrast(1.08)" },
  { id: "warm", label: "Quente", css: "sepia(0.28) saturate(1.25) hue-rotate(-12deg)" },
  { id: "cool", label: "Frio", css: "saturate(0.92) hue-rotate(14deg) brightness(1.05)" },
  { id: "mono", label: "P&B", css: "grayscale(1)" },
  { id: "contrast", label: "Contraste", css: "contrast(1.28) saturate(1.12)" },
  { id: "fade", label: "Suave", css: "contrast(0.88) brightness(1.08) saturate(0.72)" },
]);

export const IMAGE_SEND_DRAW_COLORS = Object.freeze([
  "#ef4444",
  "#fbbf24",
  "#22c55e",
  "#2E86FF",
  "#ffffff",
  "#0f172a",
]);

export function getImageSendFilterCss(filterId) {
  const found = IMAGE_SEND_FILTERS.find((f) => f.id === filterId);
  return found?.css || "none";
}

/**
 * Gira 90° e devolve nova URL blob (revogar a anterior no componente).
 * Cópia única no teto de envio — girar não volta à resolução nativa.
 */
export async function rotateImageBlobUrl(imageSrc, opts = {}) {
  const maxEdge = Number(opts.maxEdge) > 0 ? Number(opts.maxEdge) : IMAGE_SEND_MAX_EDGE;
  const quality = Number.isFinite(opts.quality) ? opts.quality : IMAGE_SEND_QUALITY;
  const source = await decodeImageSource(imageSrc);
  try {
    const { width: nw, height: nh } = sourceSize(source);
    if (!nw || !nh) throw new Error("Imagem inválida.");
    const scale = fitScale(nw, nh, maxEdge);
    const drawW = Math.max(1, Math.round(nw * scale));
    const drawH = Math.max(1, Math.round(nh * scale));
    const canvas = createCanvas(drawH, drawW);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(source, 0, 0, nw, nh, -drawW / 2, -drawH / 2, drawW, drawH);
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    return URL.createObjectURL(blob);
  } finally {
    closeSource(source);
  }
}

/**
 * Pinta os traços normalizados ([0,1] sobre a foto exibida) no canvas de saída.
 * `offsetX/offsetY` descontam o recorte e `scale` leva para o tamanho final.
 */
function paintStrokesOnCtx(ctx, strokes, imageW, imageH, geom = {}) {
  if (!Array.isArray(strokes) || !strokes.length) return;
  const scale = Number.isFinite(geom.scale) && geom.scale > 0 ? geom.scale : 1;
  const offsetX = Number(geom.offsetX) || 0;
  const offsetY = Number(geom.offsetY) || 0;
  const toX = (nx) => (nx * imageW - offsetX) * scale;
  const toY = (ny) => (ny * imageH - offsetY) * scale;
  const minEdge = Math.min(imageW, imageH);
  for (const stroke of strokes) {
    const points = Array.isArray(stroke?.points) ? stroke.points : [];
    if (!points.length) continue;
    const color = stroke.color || "#ef4444";
    const lineWidth = Math.max(1.5, Number(stroke.widthNorm || 0) * minEdge * scale);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(toX(points[0].x), toY(points[0].y), lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(toX(points[0].x), toY(points[0].y));
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(toX(points[i].x), toY(points[i].y));
    }
    ctx.stroke();
  }
}

/**
 * Exporta a foto com filtro, traços e recorte em UMA passada de canvas, já no
 * tamanho final. Rotação deve estar aplicada em `imageSrc`.
 */
export async function exportEditedImageFile(opts) {
  const {
    imageSrc,
    pixelCrop = null,
    filterCss = "none",
    strokes = [],
    fileName = `foto-${Date.now()}.jpg`,
    mimeType = "image/jpeg",
    maxEdge = IMAGE_SEND_MAX_EDGE,
    quality = IMAGE_SEND_QUALITY,
  } = opts;

  const source = await decodeImageSource(imageSrc);
  try {
    const { width: nw, height: nh } = sourceSize(source);
    if (!nw || !nh) throw new Error("Imagem inválida.");

    const crop =
      pixelCrop && pixelCrop.width > 0 && pixelCrop.height > 0
        ? pixelCrop
        : { x: 0, y: 0, width: nw, height: nh };
    const sx = Math.max(0, Math.min(nw - 1, Math.round(crop.x || 0)));
    const sy = Math.max(0, Math.min(nh - 1, Math.round(crop.y || 0)));
    const sw = Math.max(1, Math.min(nw - sx, Math.round(crop.width || nw)));
    const sh = Math.max(1, Math.min(nh - sy, Math.round(crop.height || nh)));

    const scale = fitScale(sw, sh, maxEdge);
    const outW = Math.max(1, Math.round(sw * scale));
    const outH = Math.max(1, Math.round(sh * scale));

    const out = createCanvas(outW, outH);
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const wantsFilter = filterCss && filterCss !== "none";
    if (wantsFilter && "filter" in ctx) ctx.filter = filterCss;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
    if ("filter" in ctx) ctx.filter = "none";
    // Traço é anotação: nunca passa pelo filtro da foto.
    paintStrokesOnCtx(ctx, strokes, nw, nh, { offsetX: sx, offsetY: sy, scale: outW / sw });

    const outputMime = outputMimeFor(mimeType);
    const blob = await canvasToBlob(out, outputMime, outputMime === "image/jpeg" ? quality : undefined);
    return new File([blob], withExtension(fileName, outputMime), {
      type: outputMime,
      lastModified: Date.now(),
    });
  } finally {
    closeSource(source);
  }
}

/** @param {number} degree */
function toRadians(degree) {
  return (degree * Math.PI) / 180;
}

/**
 * Gera File recortado (com rotação opcional) a partir do crop em pixels.
 *
 * NOTA: ninguém chama esta função (verificado em `src/`, `e2e/` e `scripts/`).
 * Ficou tal como estava de propósito — a reescrita de desempenho de 10/11/2026
 * tocou só o que está no caminho da foto. Se algum dia voltar a ser usada,
 * passe por `exportEditedImageFile`: esta aqui cria dois canvas em resolução
 * nativa e o Safari devolve canvas em branco acima de ~16 MP.
 *
 * @param {{
 *   imageSrc: string;
 *   pixelCrop: { x: number; y: number; width: number; height: number };
 *   rotation?: number;
 *   fileName?: string;
 *   mimeType?: string;
 *   maxEdge?: number;
 * }} opts
 */
export async function exportCroppedImageFile(opts) {
  const {
    imageSrc,
    pixelCrop,
    rotation = 0,
    fileName = `foto-${Date.now()}.jpg`,
    mimeType = "image/jpeg",
    maxEdge = 2048,
  } = opts;

  const image = await loadImageElement(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");

  const rotRad = toRadians(rotation);
  const bBoxWidth = Math.abs(Math.cos(rotRad) * image.width) + Math.abs(Math.sin(rotRad) * image.height);
  const bBoxHeight = Math.abs(Math.sin(rotRad) * image.width) + Math.abs(Math.cos(rotRad) * image.height);

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  const croppedCanvas = document.createElement("canvas");
  const croppedCtx = croppedCanvas.getContext("2d");
  if (!croppedCtx) throw new Error("Canvas indisponível.");

  let outW = pixelCrop.width;
  let outH = pixelCrop.height;
  const scale = Math.min(1, maxEdge / Math.max(outW, outH, 1));
  outW = Math.max(1, Math.round(outW * scale));
  outH = Math.max(1, Math.round(outH * scale));

  croppedCanvas.width = outW;
  croppedCanvas.height = outH;

  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outW,
    outH
  );

  const outputMime = mimeType === "image/png" ? "image/png" : "image/jpeg";
  const quality = outputMime === "image/jpeg" ? 0.92 : undefined;

  const blob = await new Promise((resolve, reject) => {
    croppedCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao exportar imagem."))),
      outputMime,
      quality
    );
  });

  const ext =
    outputMime === "image/png"
      ? ".png"
      : outputMime === "image/webp"
        ? ".webp"
        : ".jpg";
  const safeName = String(fileName || "foto").replace(/\.[^.]+$/, "") + ext;

  return new File([blob], safeName, { type: outputMime, lastModified: Date.now() });
}
