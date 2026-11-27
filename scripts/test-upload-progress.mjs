/**
 * Regressão: anel de progresso + cancelar no envio de mídia, e classificação do `.webm`
 * (26/11/2026).
 *
 *   1) uploadProgressStore: progresso por tempId, monotônico, com limite de frequência;
 *      lote compartilha o mesmo valor; `finish()` limpa; cancelar aborta o signal e é
 *      recusado depois de o corpo inteiro subir (o servidor já pode estar enviando).
 *   2) isAudioFile / isVideoFile: o MIME manda; a extensão só decide com MIME vazio ou
 *      application/octet-stream (video/webm virava bolha de áudio; audio/webm ia com tipo=video).
 *   3) useConversationOutboundMedia: o cancelamento é tratado ANTES da classificação genérica
 *      (nunca vai para a outbox nem vira "incerto"), os três POSTs levam signal+progresso, e a
 *      nota de voz mantém o predicado antigo (`uploadEmSegundoPlano`) e fica sem signal.
 *
 * Executar: node --import ./scripts/vite-env-shim.mjs scripts/test-upload-progress.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  UPLOAD_PROGRESS_THROTTLE_MS,
  __resetUploadProgressForTest,
  cancelUpload,
  getUploadProgress,
  isUploadCancelable,
  ratioFromUploadEvent,
  startUploadProgress,
  subscribeUploadProgress,
  uploadBatchSize,
} from "../src/conversa/uploadProgressStore.js";
import { isAudioFile, isVideoFile } from "../src/conversa/utils/conversaViewHelpers.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 1. store ---------- */

assert.equal(ratioFromUploadEvent({ loaded: 50, total: 200 }), 0.25);
assert.equal(ratioFromUploadEvent({ loaded: 500, total: 200 }), 1, "clamp em 1");
assert.equal(ratioFromUploadEvent({ loaded: 10, total: undefined, progress: 0.4 }), 0.4);
assert.equal(ratioFromUploadEvent({ loaded: 10 }), null, "sem total: não inventa progresso");
assert.equal(ratioFromUploadEvent(null), null);

{
  __resetUploadProgressForTest();
  assert.equal(getUploadProgress("t1"), null, "sem upload: null");
  let avisos = 0;
  let avisosOutro = 0;
  const unsub = subscribeUploadProgress("t1", () => avisos++);
  const unsubOutro = subscribeUploadProgress("t-outro", () => avisosOutro++);

  const job = startUploadProgress("t1");
  assert.equal(getUploadProgress("t1"), 0, "começa em 0");
  assert.equal(avisos, 1, "registrar avisa o assinante");
  assert.ok(job.signal, "devolve o signal para o axios");
  assert.equal(job.signal.aborted, false);
  assert.equal(isUploadCancelable("t1"), true);

  // Rajada de eventos dentro da janela: só publica no fim da janela, com o último valor.
  await sleep(UPLOAD_PROGRESS_THROTTLE_MS + 10);
  job.onUploadProgress({ loaded: 10, total: 100 });
  assert.equal(getUploadProgress("t1"), 0.1, "1.º evento após a janela publica na hora");
  job.onUploadProgress({ loaded: 20, total: 100 });
  job.onUploadProgress({ loaded: 30, total: 100 });
  assert.equal(getUploadProgress("t1"), 0.1, "dentro da janela não publica a cada evento");
  await sleep(UPLOAD_PROGRESS_THROTTLE_MS + 20);
  assert.equal(getUploadProgress("t1"), 0.3, "publicação atrasada leva o último valor");

  // Monotônico.
  job.onUploadProgress({ loaded: 5, total: 100 });
  await sleep(UPLOAD_PROGRESS_THROTTLE_MS + 20);
  assert.equal(getUploadProgress("t1"), 0.3, "evento atrasado não faz o anel voltar");

  // Fim do corpo publica na hora e trava o cancelamento.
  job.onUploadProgress({ loaded: 100, total: 100 });
  assert.equal(getUploadProgress("t1"), 1, "100% publica sem esperar a janela");
  assert.equal(isUploadCancelable("t1"), false, "corpo inteiro enviado: não cancela mais");
  assert.equal(cancelUpload("t1"), false);
  assert.equal(job.signal.aborted, false, "não aborta depois de 100%");

  job.finish();
  assert.equal(getUploadProgress("t1"), null, "finish limpa");
  const antes = avisos;
  job.onUploadProgress({ loaded: 100, total: 100 });
  job.finish();
  assert.equal(avisos, antes, "depois do finish nada mais publica");
  assert.equal(avisosOutro, 0, "assinante de outro tempId nunca acorda");
  unsub();
  unsubOutro();
}

{
  __resetUploadProgressForTest();
  const job = startUploadProgress(["a", "b", "c"]);
  assert.equal(uploadBatchSize("b"), 3, "lote = um pedido só");
  await sleep(UPLOAD_PROGRESS_THROTTLE_MS + 10);
  job.onUploadProgress({ loaded: 40, total: 100 });
  assert.equal(getUploadProgress("a"), 0.4);
  assert.equal(getUploadProgress("c"), 0.4, "o lote compartilha o mesmo valor");
  assert.equal(job.isCanceled(), false);
  assert.equal(cancelUpload("c"), true, "X de qualquer bolha cancela o lote");
  assert.equal(job.signal.aborted, true, "cancelar aborta o signal do pedido");
  assert.equal(job.isCanceled(), true);
  assert.equal(cancelUpload("a"), false, "cancelar duas vezes é no-op");
  job.onUploadProgress({ loaded: 90, total: 100 });
  await sleep(UPLOAD_PROGRESS_THROTTLE_MS + 20);
  assert.equal(getUploadProgress("a"), 0.4, "cancelado não avança");
  job.finish();
  for (const k of ["a", "b", "c"]) assert.equal(getUploadProgress(k), null);
}

{
  // Retry reaproveitando o tempId enquanto o pedido antigo ainda fecha: o antigo não apaga o novo.
  __resetUploadProgressForTest();
  const velho = startUploadProgress("r1");
  const novo = startUploadProgress("r1");
  velho.finish();
  assert.equal(getUploadProgress("r1"), 0, "finish do pedido velho não derruba o anel do novo");
  novo.finish();
  assert.equal(getUploadProgress("r1"), null);
  __resetUploadProgressForTest();
}

/* ---------- 2. classificação de arquivo (B03) ---------- */

const f = (type, name) => ({ type, name, size: 1 });
const casos = [
  // [descrição, arquivo, áudio?, vídeo?]
  ["video/webm é vídeo", f("video/webm", "clip.webm"), false, true],
  ["video/webm;codecs=vp9 é vídeo", f("video/webm;codecs=vp9", "gravacao.webm"), false, true],
  ["audio/webm é áudio", f("audio/webm", "nota.webm"), true, false],
  ["audio/webm;codecs=opus (nota de voz do Chrome) não é vídeo", f("audio/webm;codecs=opus", "audio-1732600000000.webm"), true, false],
  ["MIME vazio + .webm: extensão decide (os dois casam, como antes)", f("", "arquivo.webm"), true, true],
  ["octet-stream + .mp4: vídeo pela extensão", f("application/octet-stream", "VID.mp4"), false, true],
  ["octet-stream + .ogg: áudio pela extensão", f("application/octet-stream", "voz.ogg"), true, false],
  ["audio/mp4 com nome .mp4 não é vídeo", f("audio/mp4", "gravacao.mp4"), true, false],
  ["audio/3gpp com nome .3gp não é vídeo", f("audio/3gpp", "memo.3gp"), true, false],
  ["video/mp4 normal", f("video/mp4", "VID-2026.mp4"), false, true],
  ["audio/mpeg normal", f("audio/mpeg", "musica.mp3"), true, false],
  ["imagem com nome .webm não é áudio nem vídeo", f("image/webp", "figurinha.webm"), false, false],
  ["PDF não é mídia", f("application/pdf", "nota.pdf"), false, false],
  ["MIME vazio + .pdf não é mídia", f("", "nota.pdf"), false, false],
  ["MIME em maiúsculas", f("VIDEO/WEBM", "x.webm"), false, true],
];
for (const [nome, arquivo, audio, video] of casos) {
  assert.equal(isAudioFile(arquivo), audio, `isAudioFile: ${nome}`);
  assert.equal(isVideoFile(arquivo), video, `isVideoFile: ${nome}`);
}
assert.equal(isAudioFile(null), false);
assert.equal(isVideoFile(undefined), false);

/* ---------- 3. hook de envio ---------- */

const hookSrc = await readFile(
  new URL("../src/conversa/hooks/useConversationOutboundMedia.js", import.meta.url),
  "utf8"
);
const posts = hookSrc.match(/api\.post\(`\/chats\/\$\{conversaId\}\/arquivo`[\s\S]*?\}\);/g) || [];
assert.equal(posts.length, 3, "os três POSTs de mídia continuam lá");
for (const post of posts) {
  assert.match(post, /signal/, "POST de mídia leva signal (cancelar)");
  assert.match(post, /onUploadProgress/, "POST de mídia publica progresso");
}
// Nota de voz: sem job (sem signal/progresso) e com o predicado antigo nos dois pontos.
assert.match(
  hookSrc,
  /const uploadJob = !isAudioSend && !opts\.forceStickerType \? startUploadProgress\(tempId\) : null;/,
  "áudio/figurinha não ganham signal nem progresso"
);
assert.match(hookSrc, /const uploadEmSegundoPlano = isVideoSend \|\| \/\\\.webm\$\/i\.test\(file\?\.name \|\| ""\);/);
assert.match(hookSrc, /if \(!uploadEmSegundoPlano\) setSendingTracked\(true\);/);
assert.match(hookSrc, /if \(!uploadEmSegundoPlano\) setSendingTracked\(false\);/);
assert.match(hookSrc, /skipPendingStatusRefresh: uploadEmSegundoPlano/);
assert.doesNotMatch(hookSrc, /if \(!isVideoSend\) setSendingTracked/, "gates não voltam a ler isVideoSend");

// Em cada catch, o cancelamento vem antes de qualquer classificação/outbox.
const catches = hookSrc.split("} catch (err) {").slice(1).map((s) => s.slice(0, s.indexOf("} finally {")));
assert.equal(catches.length, 3, "três catches de envio de mídia");
for (const bloco of catches) {
  const iCancel = bloco.indexOf("envioCanceladoPeloAtendente(uploadJob, err)");
  assert.ok(iCancel >= 0, "catch trata o cancelamento");
  for (const generico of [
    "applyOutboundSendFailure",
    "classifyOutboundAxiosError",
    "persistirMidiaNaOutboxSeRetryavel",
    "extractArquivoApiFailures",
  ]) {
    const i = bloco.indexOf(generico);
    if (i >= 0) assert.ok(iCancel < i, `cancelamento antes de ${generico}`);
  }
  const ramo = bloco.slice(iCancel, bloco.indexOf("return;", iCancel));
  assert.match(ramo, /removerMensagemTemp/, "cancelar descarta a bolha");
  assert.doesNotMatch(ramo, /enqueueMediaOutboxItem|persistirMidia|marcarMensagem|refresh/, "cancelar não vai para outbox nem marca erro");
}
const finallies = hookSrc.split("} finally {").slice(1).map((s) => s.slice(0, 400));
assert.ok(
  finallies.filter((s) => /uploadJob\??\.finish\(\)/.test(s)).length >= 3,
  "todo envio com job limpa o progresso no finally"
);

console.log("OK — Upload de mídia: anel de progresso, cancelar sem outbox, .webm classificado pelo MIME.");
