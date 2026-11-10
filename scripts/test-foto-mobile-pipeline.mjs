/**
 * Velocidade de tirar foto no celular (auditoria 10/11/2026).
 *
 * Trava as decisões que tornaram o caminho da foto rápido no mobile:
 *  1. cópia de trabalho única no teto de envio (nada opera no raster nativo);
 *  2. export em UMA passada de canvas, já no tamanho final;
 *  3. envio sem edição não reencoda nada;
 *  4. desenho pintado direto no canvas (sem setState por movimento do dedo);
 *  5. chips de filtro em thumbnail, não na foto inteira;
 *  6. câmera: prefetch do editor, espera do 1º frame, resolução pedida.
 *
 * Roda: node scripts/test-foto-mobile-pipeline.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  fitScale,
  FULL_IMAGE_CROP_PERCENT,
  IMAGE_SEND_MAX_EDGE,
  IMAGE_SEND_QUALITY,
  IMAGE_SEND_THUMB_EDGE,
  isFullFrameCrop,
  isUneditedImageSend,
} from "../src/conversa/utils/imageCropExport.js";

const read = (rel) => readFile(new URL(rel, import.meta.url), "utf8");

/* ---------- 1. teto de envio ---------- */

assert.ok(
  IMAGE_SEND_MAX_EDGE > 0 && IMAGE_SEND_MAX_EDGE <= 2048,
  "lado maior do envio precisa ter teto (upload de celular)"
);
assert.ok(
  IMAGE_SEND_QUALITY > 0.7 && IMAGE_SEND_QUALITY < 0.92,
  "0.92 gerava ~1,2 MB por foto: 4x mais upload no 4G"
);
assert.ok(IMAGE_SEND_THUMB_EDGE <= 256, "thumb de filtro tem de ser minúsculo");

// Nunca amplia; reduz exatamente no fator do lado maior.
assert.equal(fitScale(800, 600, 1920), 1);
assert.equal(fitScale(4000, 3000, 2000), 0.5);
assert.equal(fitScale(3000, 4000, 2000), 0.5);

/* ---------- 2. "não editei nada" => zero reencode ---------- */

assert.equal(isFullFrameCrop(FULL_IMAGE_CROP_PERCENT), true);
assert.equal(isFullFrameCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 }), true);
assert.equal(isFullFrameCrop({ unit: "%", x: 10, y: 0, width: 80, height: 100 }), false);
assert.equal(isFullFrameCrop({ unit: "px", x: 0, y: 0, width: 100, height: 100 }), false);

assert.equal(
  isUneditedImageSend({ crop: FULL_IMAGE_CROP_PERCENT, filterId: "none", strokes: [] }),
  true,
  "quadro inteiro, sem filtro e sem traço: o arquivo preparado já é o final"
);
assert.equal(
  isUneditedImageSend({ crop: FULL_IMAGE_CROP_PERCENT, filterId: "mono", strokes: [] }),
  false
);
assert.equal(
  isUneditedImageSend({
    crop: FULL_IMAGE_CROP_PERCENT,
    filterId: "none",
    strokes: [{ points: [{ x: 0.1, y: 0.1 }] }],
  }),
  false
);
assert.equal(
  isUneditedImageSend({ crop: FULL_IMAGE_CROP_PERCENT, filterId: "none", strokes: [], rotated: true }),
  false
);
assert.equal(
  isUneditedImageSend({ crop: { unit: "%", x: 5, y: 5, width: 60, height: 60 }, filterId: "none" }),
  false
);

/* ---------- 3. pipeline: cópia de trabalho + export single-pass ---------- */

const exportSrc = await read("../src/conversa/utils/imageCropExport.js");
assert.match(exportSrc, /export async function prepareImageForSend/);
assert.match(exportSrc, /export async function decodeImageSource/);
assert.match(exportSrc, /createImageBitmap/, "decode deve sair da main thread quando possível");
assert.match(exportSrc, /export async function createFilterThumbUrl/);
assert.match(exportSrc, /export async function exportEditedImageFile/);
assert.match(exportSrc, /ctx\.filter/);

// Uma passada só: o canvas de saída recebe a região recortada direto no
// tamanho final. Dois canvas em resolução nativa estouravam memória (e no iOS
// um canvas acima de ~16 MP volta em branco).
assert.match(
  exportSrc,
  /ctx\.drawImage\(source, sx, sy, sw, sh, 0, 0, outW, outH\)/,
  "export tem de recortar e reduzir em um único drawImage"
);
assert.doesNotMatch(
  exportSrc,
  /work\.width = nw/,
  "não recriar o canvas intermediário em resolução nativa"
);
assert.match(exportSrc, /imageSmoothingQuality = "high"/);

/* ---------- 4. envio pula o export quando nada foi editado ---------- */

const viewSrc = await read("../src/conversa/ConversaView.jsx");
const outboundSrc = await read("../src/conversa/hooks/useConversationOutboundMedia.js");
assert.match(outboundSrc, /unedited === true \? false :/, "flag do editor tem de curto-circuitar o export");
assert.match(
  outboundSrc,
  /sendAsOriginal \? pendingFile : workFile/,
  '"Original" continua enviando o arquivo como veio da câmera/galeria'
);
// A cópia de trabalho vive num ref: trocar `pendingFile` reexecutaria os
// efeitos de foco do PendingMediaPreview no meio da abertura do preview.
assert.doesNotMatch(
  viewSrc,
  /setPendingFile\(prepared\.file\)/,
  "a cópia de trabalho não pode substituir o pendingFile"
);

/* ---------- 5. editor: desenho sem re-render ---------- */

const editorSrc = await read("../src/conversa/ImageSendPreviewMobile.jsx");
assert.match(editorSrc, /const moveStroke = useCallback\(\(e\) => \{[\s\S]*?\}, \[\]\)/);
const moveBody = editorSrc.slice(
  editorSrc.indexOf("const moveStroke"),
  editorSrc.indexOf("const endStroke")
);
assert.doesNotMatch(
  moveBody,
  /setStrokes|setCurrentStroke|setState/,
  "pointermove não pode disparar render: era isso que travava o desenho"
);
assert.match(moveBody, /ctx\.stroke\(\)/, "pointermove pinta direto no canvas");
assert.match(editorSrc, /createFilterThumbUrl/, "chips de filtro usam thumbnail");
assert.match(editorSrc, /isUneditedImageSend/);
assert.match(editorSrc, /imageSrc: displayUrlRef\.current/);

/* ---------- 6. ConversaView prepara a cópia de trabalho ---------- */

assert.match(viewSrc, /prepareImageForSend/);
assert.match(viewSrc, /pendingWorkFileRef/);
assert.match(
  viewSrc,
  /mediaPrepareGenerationRef/,
  "trocar de foto/conversa tem de descartar a cópia em voo"
);

/* ---------- 7. câmera: abre rápido e responde ao toque ---------- */

const pickerSrc = await read("../src/conversa/composer/hooks/useAttachmentPicker.js");
assert.match(pickerSrc, /function prefetchPhotoPipeline/);
assert.match(
  pickerSrc,
  /ImageSendPreviewMobile\.jsx/,
  "o chunk do editor tem de carregar enquanto o atendente enquadra"
);
assert.match(pickerSrc, /function waitFirstFrame/, "disparador só libera com frame na tela");
assert.match(pickerSrc, /CAMERA_IDEAL_WIDTH/);
assert.match(pickerSrc, /navigator\.vibrate/);
assert.match(pickerSrc, /facingMode: \{ exact: facing \}/, "traseira garantida no celular");
// enumerateDevices não pode ficar na frente do getUserMedia.
const openBody = pickerSrc.slice(
  pickerSrc.indexOf("const openCamera = useCallback"),
  pickerSrc.indexOf("/** Alterna traseira/frontal")
);
assert.ok(
  openBody.indexOf("await startStream") < openBody.indexOf("enumerateDevices"),
  "o stream tem de começar antes de enumerar dispositivos"
);

const cameraSrc = await read("../src/conversa/composer/components/CameraCapture.jsx");
assert.match(cameraSrc, /wa-cameraCapture-flash/);
assert.match(cameraSrc, /wa-cameraCapture-flip/);
assert.match(cameraSrc, /wa-cameraCapture-torch/);

const cssSrc = await read("../src/conversa/conversa.css");
assert.match(cssSrc, /\.wa-cameraCapture-flash \{/);
assert.match(cssSrc, /@keyframes wa-cameraShotFlash/);
assert.match(cssSrc, /\.wa-cameraCapture-flip \{/);
assert.match(cssSrc, /\.wa-cameraCapture-torch \{/);

console.log("OK — Foto no celular: cópia de trabalho, export single-pass, envio sem reencode, câmera ágil.");
