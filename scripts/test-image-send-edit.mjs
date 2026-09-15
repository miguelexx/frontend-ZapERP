/**
 * Editor de foto no envio (print/crop/filtro/desenho).
 * Roda: node scripts/test-image-send-edit.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  cropToNaturalPixels,
  FULL_IMAGE_CROP_PERCENT,
  getImageSendFilterCss,
  IMAGE_SEND_DRAW_COLORS,
  IMAGE_SEND_FILTERS,
} from "../src/conversa/utils/imageCropExport.js";

assert.equal(FULL_IMAGE_CROP_PERCENT.width, 100);
assert.equal(FULL_IMAGE_CROP_PERCENT.unit, "%");
assert.ok(IMAGE_SEND_FILTERS.some((f) => f.id === "none"));
assert.ok(IMAGE_SEND_FILTERS.some((f) => f.id === "mono"));
assert.equal(getImageSendFilterCss("mono"), "grayscale(1)");
assert.equal(getImageSendFilterCss("missing"), "none");
assert.ok(IMAGE_SEND_DRAW_COLORS.includes("#ef4444"));

const fakeImg = { width: 100, height: 50, naturalWidth: 1000, naturalHeight: 500 };
const px = cropToNaturalPixels({ unit: "%", x: 10, y: 10, width: 50, height: 40 }, fakeImg);
assert.equal(px.x, 100);
assert.equal(px.y, 50);
assert.equal(px.width, 500);
assert.equal(px.height, 200);

const previewSrc = await readFile(new URL("../src/conversa/components/PendingMediaPreview.jsx", import.meta.url), "utf8");
assert.match(previewSrc, /isEditableImageForSend\(pendingFile\)/);
assert.doesNotMatch(
  previewSrc,
  /headerCompact &&\s*pendingFile/,
  "editor de foto deve abrir também no desktop (print colado)"
);

const editorSrc = await readFile(new URL("../src/conversa/ImageSendPreviewMobile.jsx", import.meta.url), "utf8");
assert.match(editorSrc, /Cortar/);
assert.match(editorSrc, /Editar/);
assert.match(editorSrc, /Filtro/);
assert.match(editorSrc, /IMAGE_SEND_FILTERS/);
assert.match(editorSrc, /tool === "draw"/);
assert.match(editorSrc, /imageSrc: displayUrlRef\.current/);

const hookSrc = await readFile(new URL("../src/conversa/hooks/useConversationOutboundMedia.js", import.meta.url), "utf8");
assert.match(hookSrc, /exportEditedImageFile/);
assert.match(hookSrc, /filterId/);
assert.match(hookSrc, /strokes/);

const exportSrc = await readFile(new URL("../src/conversa/utils/imageCropExport.js", import.meta.url), "utf8");
assert.match(exportSrc, /export async function exportEditedImageFile/);
assert.match(exportSrc, /ctx\.filter/);

console.log("OK — Editor de foto no envio: crop, filtro, desenho e desktop.");
