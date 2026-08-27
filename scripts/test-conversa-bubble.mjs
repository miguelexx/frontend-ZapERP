/**
 * Regressão da bolha modular: tipos, status, retry, caption, reply, gestos e áudio.
 * Roda: node --import ./scripts/vite-env-shim.mjs scripts/test-conversa-bubble.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyBubbleMessage } from "../src/conversa/bubble/utils/bubbleClassify.js";
import { getRetryUiState, buildRetryPayload, buildAudioRetryPayload } from "../src/conversa/bubble/utils/bubbleRetry.js";
import { resolveOutgoingTick } from "../src/conversa/bubble/utils/bubbleStatus.js";
import { formatCoords, parseLocationText, buildStaticMapUrl } from "../src/conversa/bubble/utils/locationFormat.js";
import {
  normalizeAudioDuration,
  rememberAudioDuration,
  readAudioDuration,
  resetAudioDurationCacheForTests,
} from "../src/conversa/bubble/utils/audioDuration.js";
import { WA_AUDIO_SPEEDS } from "../src/conversa/bubble/utils/audioConstants.js";
import { getReactionEmojiOptions, WA_REACTION_EMOJIS } from "../src/conversa/bubble/utils/reactionEmojis.js";
import {
  LONG_PRESS_MS,
  LONG_PRESS_MOVE_PX,
  MEDIA_TAP_MOVE_PX,
} from "../src/conversa/bubble/utils/gestureConstants.js";
import { pauseOtherAudios, getCurrentAudio, setCurrentAudio, clearCurrentAudioIf } from "../src/conversa/bubble/utils/audioSession.js";
import { refreshProxyMediaToken } from "../src/conversa/utils/conversaViewHelpers.js";

const retryHandler = () => {};

function classify(msg, mediaUrl = msg?.url || msg?._optimisticBlobUrl || "") {
  return classifyBubbleMessage(msg, mediaUrl);
}

function retryOf(msg, extra = {}) {
  return getRetryUiState(msg, classify(msg, extra.mediaUrl ?? msg?.url ?? ""), {
    onReenviarFalha: extra.hasHandler === false ? undefined : retryHandler,
  });
}

// ── Fachada ──────────────────────────────────────────────────────────────────
const facade = await readFile(new URL("../src/conversa/ConversaBubble.jsx", import.meta.url), "utf8");
assert.match(facade, /export \{ default \} from "\.\/bubble\/ConversaBubbleShell";/);
assert.ok(facade.split(/\n/).length <= 5, "ConversaBubble.jsx deve permanecer fachada");

const shell = await readFile(new URL("../src/conversa/bubble/ConversaBubbleShell.jsx", import.meta.url), "utf8");
assert.match(shell, /memo\(function Bubble/);
assert.doesNotMatch(shell, /function AudioWavePlayer/);
assert.doesNotMatch(shell, /__waCurrentAudio/);

const audioHook = await readFile(new URL("../src/conversa/bubble/hooks/useAudioPlayback.js", import.meta.url), "utf8");
assert.match(audioHook, /el\.load\(\)/);
assert.match(audioHook, /refreshProxyMediaToken/);
assert.match(audioHook, /clearCurrentAudioIf/);
assert.match(audioHook, /pauseOtherAudios/);

const swipeSrc = await readFile(new URL("../src/conversa/SwipeReplyTrack.jsx", import.meta.url), "utf8");
assert.match(swipeSrc, /const MAX_SHIFT = 76/);
assert.match(swipeSrc, /const ACTIVATE_THRESHOLD = 52/);
assert.match(swipeSrc, /const VERT_ABORT_PX = 26/);

// ── Tipos ────────────────────────────────────────────────────────────────────
const texto = classify({ tipo: "texto", texto: "olá", direcao: "in" });
assert.equal(texto.hasText, true);
assert.equal(texto.isImg, false);
assert.equal(texto.isAudioOrVoice, false);

const imagem = classify({ tipo: "imagem", url: "https://cdn/x.jpg", texto: "legenda real" }, "https://cdn/x.jpg");
assert.equal(imagem.isImg, true);
assert.equal(imagem.showCaption, true);
assert.equal(imagem.mediaKind, "imagem");

const imagemNomeArquivo = classify(
  { tipo: "imagem", url: "https://cdn/x.jpg", texto: "IMG_6559.png", nome_arquivo: "IMG_6559.png" },
  "https://cdn/x.jpg"
);
assert.equal(imagemNomeArquivo.isImg, true);
assert.equal(imagemNomeArquivo.showCaption, false, "nome de arquivo não vira legenda");

const video = classify({ tipo: "video", url: "https://cdn/v.mp4" }, "https://cdn/v.mp4");
assert.equal(video.isVideo, true);
assert.equal(!!video.videoPlaybackUrl, true);

const doc = classify({ tipo: "documento", url: "/uploads/a.pdf", nome_arquivo: "contrato.pdf" }, "/uploads/a.pdf");
assert.equal(doc.isFile, true);

const contato = classify({
  tipo: "contact",
  contact_meta: { nome: "Ana", telefone: "5511999" },
});
assert.equal(contato.isContact, true);
assert.equal(contato.contactBubbleMeta?.nome, "Ana");

const sticker = classify({ tipo: "sticker", url: "https://cdn/s.webp" }, "https://cdn/s.webp");
assert.equal(sticker.isSticker, true);
assert.equal(sticker.mediaKind, "figurinha");

const audio = classify({ tipo: "audio", url: "https://cdn/a.ogg" }, "https://cdn/a.ogg");
assert.equal(audio.isAudio, true);
assert.equal(audio.isAudioOrVoice, true);

const voice = classify({ tipo: "ptt", url: "https://cdn/v.ogg" }, "https://cdn/v.ogg");
assert.equal(voice.isVoice, true);

const placeholderAudio = classify({ tipo: "audio", texto: "(áudio)" });
assert.equal(placeholderAudio.texto, "");
assert.equal(placeholderAudio.fallbackContentLabel, "🎤 Áudio");

const location = classify({ tipo: "location", texto: "Rua A • (-23.5, -46.6)" });
assert.equal(location.isLocation, true);

const call = classify({ tipo: "call", texto: "Ligação perdida" });
assert.equal(call.isCall, true);

// ── Temporária / sem duplicar tipo ───────────────────────────────────────────
const tempPending = classify({
  tempId: "tmp-1",
  client_temp_id: "tmp-1",
  direcao: "out",
  tipo: "texto",
  texto: "oi",
  status: "pending",
});
const tempSent = classify({
  id: 99,
  tempId: "tmp-1",
  direcao: "out",
  tipo: "texto",
  texto: "oi",
  status: "sent",
});
assert.equal(tempPending.hasText, tempSent.hasText);
assert.equal(tempPending.isImg, tempSent.isImg);
assert.equal(tempPending.isAudioOrVoice, false);

const blobThenServer = classify(
  { tipo: "imagem", _optimisticBlobUrl: "blob:local", url: "https://cdn/final.jpg", status: "delivered" },
  "blob:local"
);
const onlyBlob = classify(
  { tipo: "imagem", _optimisticBlobUrl: "blob:local", status: "pending" },
  "blob:local"
);
assert.equal(blobThenServer.isImg, true);
assert.equal(onlyBlob.isImg, true, "blob otimista continua imagem após status mudar");

// ── Status monotônico ────────────────────────────────────────────────────────
const pendingTick = resolveOutgoingTick({ direcao: "out", status: "pending" }, false);
const sentTick = resolveOutgoingTick({ direcao: "out", status: "sent" }, false);
const deliveredTick = resolveOutgoingTick({ direcao: "out", status: "delivered" }, false);
const readTick = resolveOutgoingTick({ direcao: "out", status: "read" }, false);
assert.equal(pendingTick.kind, "pending");
assert.equal(sentTick.kind, "sent");
assert.equal(deliveredTick.kind, "delivered");
assert.equal(readTick.kind, "read");
assert.equal(resolveOutgoingTick({ direcao: "in", status: "read" }, false), null);

const staleOffline = resolveOutgoingTick({
  direcao: "out",
  status: "delivered",
  aguardando_conexao: true,
}, false);
assert.equal(staleOffline.kind, "delivered", "flag offline stale não rebaixa tick confirmado");

const groupRead = resolveOutgoingTick({ direcao: "out", status: "read" }, true);
assert.equal(groupRead.kind, "sent", "string read em grupo: isRead é forçado false (comportamento atual)");
assert.equal(resolveOutgoingTick({ direcao: "out", status_mensagem: 3 }, true).kind, "delivered");

assert.equal(resolveOutgoingTick({ direcao: "out", status_mensagem: 0 }, false).kind, "pending");
assert.equal(resolveOutgoingTick({ direcao: "out", status_mensagem: 1 }, false).kind, "sent");
assert.equal(resolveOutgoingTick({ direcao: "out", status_mensagem: 2 }, false).kind, "delivered");
assert.equal(resolveOutgoingTick({ direcao: "out", status_mensagem: 3 }, false).kind, "read");

// ── Retry / falha ────────────────────────────────────────────────────────────
assert.equal(retryOf({ direcao: "out", id: 1, tipo: "texto", status: "erro" }).canShowRetry, true);
assert.equal(retryOf({ direcao: "out", id: 2, tipo: "audio", status: "erro", envio_erro: true }).canShowRetry, true);
assert.equal(retryOf({ direcao: "out", id: 3, tipo: "imagem", status: "failed", url: "https://x" }).canShowRetry, true);
assert.equal(retryOf({ direcao: "out", id: 4, tipo: "video", status: "erro" }).canShowRetry, true);
assert.equal(retryOf({ direcao: "out", id: 5, tipo: "arquivo", status: "erro" }).canShowRetry, true);
assert.equal(retryOf({ direcao: "out", id: 6, tipo: "texto", status: "pending" }).canShowRetry, false);
assert.equal(retryOf({ direcao: "out", id: 7, tipo: "texto", status: "sent" }).canShowRetry, false);
assert.equal(retryOf({ direcao: "out", id: 8, tipo: "texto", status: "delivered" }).canShowRetry, false);
assert.equal(retryOf({ direcao: "out", id: 9, tipo: "texto", status: "read" }).canShowRetry, false);
assert.equal(retryOf({ direcao: "out", id: 10, tipo: "texto", status: "status_indefinido" }).canShowRetry, false);
assert.equal(retryOf({ direcao: "out", tipo: "texto", status: "erro" }).canShowRetry, false);
assert.equal(retryOf({ direcao: "in", id: 11, tipo: "texto", status: "erro" }).canShowRetry, false);
assert.equal(retryOf({ direcao: "out", id: 12, tipo: "contact", status: "erro" }).canShowRetry, false);
assert.equal(retryOf({ direcao: "out", id: 13, tipo: "texto", status: "erro" }, { hasHandler: false }).canShowRetry, false);

const retryPayload = buildRetryPayload(
  { id: 1, tempId: "t1", tipo: "texto" },
  retryOf({ direcao: "out", id: 1, tipo: "texto", status: "erro" })
);
assert.equal(retryPayload.kind, "text");
assert.equal(retryPayload.mensagemId, 1);
assert.equal(retryPayload.tempId, "t1");

const audioRetry = buildAudioRetryPayload(
  { id: 2, client_temp_id: "c2", tipo: "audio" },
  retryOf({ direcao: "out", id: 2, tipo: "audio", status: "erro" })
);
assert.equal(audioRetry.kind, "media");
assert.equal(audioRetry.tempId, "c2");

// ── Reply / reações ──────────────────────────────────────────────────────────
const withReply = classify({
  tipo: "texto",
  texto: "resposta",
  reply_meta: { name: "Cliente", snippet: "original", replyToId: "wamid.1" },
});
assert.equal(withReply.hasReply, true);
assert.equal(withReply.replyMeta.replyToId, "wamid.1");

const revokedReply = classify({
  tipo: "texto",
  texto: "",
  apagada_para_todos: true,
  reply_meta: { name: "Cliente", snippet: "x" },
});
assert.equal(revokedReply.hasReply, false);

assert.deepEqual(getReactionEmojiOptions(false), WA_REACTION_EMOJIS);
assert.equal(getReactionEmojiOptions(true).length, WA_REACTION_EMOJIS.length + 6);

// ── Localização ──────────────────────────────────────────────────────────────
assert.equal(formatCoords(-23.55052, -46.633308), "-23.55052, -46.63331");
const parsed = parseLocationText("Av. Paulista • (-23.56, -46.65)");
assert.equal(parsed.address, "Av. Paulista");
assert.ok(buildStaticMapUrl(-23.5, -46.6).includes("staticmap.openstreetmap.de"));

// ── Gestos ───────────────────────────────────────────────────────────────────
assert.equal(LONG_PRESS_MS, 480);
assert.equal(LONG_PRESS_MOVE_PX, 14);
assert.equal(MEDIA_TAP_MOVE_PX, 12);

const menuSrc = await readFile(new URL("../src/conversa/bubble/components/MessageMenu.jsx", import.meta.url), "utf8");
assert.match(menuSrc, /createPortal/);
assert.match(menuSrc, /wa-msgMenuBtn|wa-msgMenuItem/);
assert.match(menuSrc, /Dados da mensagem/);
assert.match(menuSrc, /Responder/);

const gestureSrc = await readFile(new URL("../src/conversa/bubble/hooks/useMessageGestures.js", import.meta.url), "utf8");
assert.match(gestureSrc, /navigator\.vibrate/);
assert.match(gestureSrc, /setMenuOpen\(true\)/);

// ── Áudio: duração, sessão, token, velocidades ───────────────────────────────
assert.deepEqual(WA_AUDIO_SPEEDS, [1, 1.5, 2]);
assert.equal(normalizeAudioDuration("3.5"), 3.5);
assert.equal(normalizeAudioDuration(-1), 0);
resetAudioDurationCacheForTests();
rememberAudioDuration("m1", 8);
assert.equal(readAudioDuration("m1"), 8);
for (let i = 0; i < 1001; i += 1) rememberAudioDuration(`k${i}`, 1);
assert.equal(readAudioDuration("m1"), 0, "LRU descarta a entrada mais antiga");
resetAudioDurationCacheForTests();

const fakeA = { paused: true, pause() { this.paused = true; this.pausedBy = "a"; } };
const fakeB = { paused: true, pause() { this.paused = true; } };
setCurrentAudio(fakeA);
pauseOtherAudios(fakeB);
assert.equal(getCurrentAudio(), fakeB);
assert.equal(fakeA.paused, true);
clearCurrentAudioIf(fakeB);
assert.equal(getCurrentAudio(), null);

const proxied = "https://api.local/media/proxy?url=https%3A%2F%2Fcdn%2Fa.ogg&access_token=old";
const refreshed = refreshProxyMediaToken(proxied);
assert.equal(typeof refreshed, "string");

const audioMsgSrc = await readFile(new URL("../src/conversa/bubble/components/AudioMessage.jsx", import.meta.url), "utf8");
assert.match(audioMsgSrc, /data-testid="audio-indisponivel"/);
assert.match(audioMsgSrc, /wa-audioElHidden/);

console.log("OK — Bubble modular: tipos, status, retry, reply, gestos e áudio passaram.");
