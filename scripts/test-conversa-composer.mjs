import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildAutoCorrectStorageKey,
  buildStickerStorageKey,
  getSlashContext,
  isImageFile,
  safeString,
} from "../src/conversa/composer/utils/composerUtils.js";
import { getComposerEnterIntent } from "../src/conversa/composer/utils/composerKeyboard.js";
import { createTypingSession } from "../src/conversa/composer/utils/typingSession.js";
import {
  attachRecordedAudioMetadata,
  audioExtensionFromMime,
} from "../src/conversa/composer/utils/recordedAudio.js";

const storage = new Map();
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const {
  clearComposerDraft,
  loadComposerDraft,
  saveComposerDraft,
} = await import("../src/conversa/composerDraftStore.js");

assert.equal(safeString(null), "");
assert.equal(safeString(42), "42");
assert.deepEqual(getSlashContext("olá /financeiro", 15), {
  start: 4,
  end: 15,
  query: "financeiro",
});
assert.equal(getSlashContext("email/teste", 11), null);
assert.equal(isImageFile({ type: "image/png" }), true);
assert.equal(isImageFile({ type: "video/mp4" }), false);

const identity = { id: 7, company_id: 3 };
assert.equal(buildStickerStorageKey(identity), "wa_stickers_recent_3_7");
assert.equal(buildAutoCorrectStorageKey(identity), "wa_autocorrect_enabled_3_7");

saveComposerDraft(101, "rascunho da conversa A");
saveComposerDraft(202, "rascunho da conversa B");
assert.equal(loadComposerDraft(101), "rascunho da conversa A");
assert.equal(loadComposerDraft(202), "rascunho da conversa B");
clearComposerDraft(101);
assert.equal(loadComposerDraft(101), "");
assert.equal(loadComposerDraft(202), "rascunho da conversa B");
clearComposerDraft(202);

assert.equal(getComposerEnterIntent({ key: "Enter" }), "send");
assert.equal(getComposerEnterIntent({ key: "Enter", shiftKey: true }), "newline");
assert.equal(
  getComposerEnterIntent({ key: "Enter", composerEnterInsertsNewline: true }),
  "newline"
);
assert.equal(getComposerEnterIntent({ key: "Escape" }), null);

const emitted = [];
const typing = createTypingSession();
const emit = (event, payload) => emitted.push({ event, payload });
assert.equal(typing.start(55, emit), true);
assert.equal(typing.start(55, emit), false);
assert.equal(typing.stop(99, emit), false);
assert.equal(typing.stop(55, emit), true);
assert.equal(typing.stop(55, emit), false);
assert.deepEqual(emitted, [
  { event: "typing_start", payload: { conversa_id: 55 } },
  { event: "typing_stop", payload: { conversa_id: 55 } },
]);

assert.equal(audioExtensionFromMime("audio/ogg;codecs=opus"), "ogg");
assert.equal(audioExtensionFromMime("audio/mp4"), "m4a");
assert.equal(audioExtensionFromMime("audio/webm"), "webm");
const audioFile = new File([new Uint8Array(1024)], "audio.webm", { type: "audio/webm" });
attachRecordedAudioMetadata(audioFile, {
  durationMs: 1200,
  elapsedMs: 1250,
  mimeType: "audio/webm",
  bytes: 1024,
});
assert.equal(audioFile.__zaperpAudioDurationMs, 1200);
assert.equal(audioFile.__zaperpAudioBytes, 1024);

const facade = await readFile(new URL("../src/conversa/ConversaComposer.jsx", import.meta.url), "utf8");
assert.match(facade, /export \{ default \} from "\.\/composer\/ConversaComposerShell";/);
const attachmentInputs = await readFile(
  new URL("../src/conversa/composer/components/AttachmentInputs.jsx", import.meta.url),
  "utf8"
);
assert.match(attachmentInputs, /accept="image\/jpeg,[^"]+video\/quicktime/);
assert.match(attachmentInputs, /accept="\.pdf,[^"]+application\/json/);

console.log("OK — Composer modular: helpers, drafts, teclado, typing, anexos e áudio passaram.");
