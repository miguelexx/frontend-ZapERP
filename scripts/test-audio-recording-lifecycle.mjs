/**
 * Regressão de cleanupAudioRecording (src/media/audioRecordingLifecycle.js).
 *
 * Uso: node --import ./scripts/vite-env-shim.mjs scripts/test-audio-recording-lifecycle.mjs
 */
import assert from "node:assert/strict";
import { pickRecordedDurationMs } from "../src/conversa/composer/utils/recordedAudio.js";

function fakeTrack() {
  return {
    readyState: "live",
    stop() {
      this.readyState = "ended";
    },
  };
}

function fakeStream(track = fakeTrack()) {
  return {
    track,
    getAudioTracks: () => [track],
    getTracks: () => [track],
  };
}

function fakeRecorder({ state = "recording", stream = null } = {}) {
  const rec = {
    state,
    __zapStream: stream,
    __zapCanceled: false,
    __zapStopAt: 0,
    __zapDetachMicWatch: null,
    ondataavailable: () => {},
    onstop: () => {},
    onerror: () => {},
    requestData() {},
    stop() {
      this.state = "inactive";
      this.onstop?.();
    },
  };
  return rec;
}

let aberturas = 0;
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  writable: true,
  value: {
    permissions: { query: async () => ({ state: "granted" }) },
    mediaDevices: {
      getUserMedia: async () => {
        aberturas += 1;
        return fakeStream();
      },
    },
  },
});
globalThis.sessionStorage = globalThis.localStorage;
globalThis.URL = globalThis.URL || {
  createObjectURL: () => "blob:test",
  revokeObjectURL: () => {},
};

const { acquireMicStream, releaseMicStream, invalidateMicStream } = await import(
  "../src/media/micStreamService.js"
);
const { cleanupAudioRecording, areMicAudioTracksEnded } = await import(
  "../src/media/audioRecordingLifecycle.js"
);

invalidateMicStream();

// 1) cleanup para recorder + stream → tracks ended
{
  const stream = await acquireMicStream();
  const track = stream.getAudioTracks()[0];
  const rec = fakeRecorder({ stream });
  const mediaRecorderRef = { current: rec };
  const streamRef = { current: stream };
  const timerRef = { current: 1 };
  let notRecording = false;
  const result = cleanupAudioRecording({
    mediaRecorderRef,
    streamRef,
    timerRef,
    markCanceled: true,
    releaseMic: true,
    setNotRecording: () => {
      notRecording = true;
    },
  });
  assert.equal(track.readyState, "ended");
  assert.equal(areMicAudioTracksEnded(stream), true);
  assert.equal(result.tracksEnded, true);
  assert.equal(mediaRecorderRef.current, null);
  assert.equal(streamRef.current, null);
  assert.equal(timerRef.current, null);
  assert.equal(notRecording, true);
  assert.equal(rec.ondataavailable, null);
  assert.equal(rec.onerror, null);
}

// 2) idempotente
{
  cleanupAudioRecording({});
  cleanupAudioRecording({ mediaRecorderRef: { current: null }, streamRef: { current: null } });
}

// 3) preserveOnStop mantém envio: onstop síncrono roda e limpa handlers
{
  const stream = fakeStream();
  let onStopCalls = 0;
  let finalChunks = 0;
  const rec = fakeRecorder({ stream });
  rec.ondataavailable = () => {
    finalChunks += 1;
  };
  rec.requestData = function requestData() {
    this.ondataavailable?.({ data: { size: 2048 } });
  };
  rec.onstop = () => {
    onStopCalls += 1;
  };
  const mediaRecorderRef = { current: rec };
  cleanupAudioRecording({
    mediaRecorderRef,
    stream,
    requestDataBeforeStop: true,
    preserveOnStop: true,
    releaseMic: true,
  });
  assert.equal(finalChunks, 1, "chunk final de requestData não pode ser descartado antes do onstop");
  assert.equal(onStopCalls, 1, "onstop de envio deve rodar");
  assert.equal(rec.onstop, null, "handlers limpos após onstop síncrono");
  assert.equal(areMicAudioTracksEnded(stream), true);
}

// 3b) preserveOnStop com onstop assíncrono limpa após o await
{
  const stream = fakeStream();
  let onStopCalls = 0;
  const rec = fakeRecorder({ stream });
  rec.onstop = async () => {
    onStopCalls += 1;
    await Promise.resolve();
  };
  const mediaRecorderRef = { current: rec };
  cleanupAudioRecording({
    mediaRecorderRef,
    stream,
    requestDataBeforeStop: true,
    preserveOnStop: true,
    releaseMic: true,
  });
  assert.equal(onStopCalls, 1, "onstop async inicia");
  assert.notEqual(rec.onstop, null, "handlers ainda presentes durante await");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(rec.onstop, null, "handlers limpos após onstop async");
  assert.equal(areMicAudioTracksEnded(stream), true);
}

// 4) nova gravação após cleanup abre stream novo
{
  aberturas = 0;
  const a = await acquireMicStream();
  cleanupAudioRecording({ stream: a, releaseMic: true });
  const b = await acquireMicStream();
  assert.notEqual(a, b);
  assert.equal(aberturas, 2);
  releaseMicStream();
}

// --- Duração do áudio gravado (auditoria 10/10/2026) ---------------------------------
// Caso real medido: cronômetro 16 s, leitura do blob 14 s, arquivo verdadeiro 17 s.
// O guard antigo só rejeitava duração INFLADA, então os 14 s passavam e iam para a bolha.
{
  const S = 1000;

  // 1) O caso da auditoria: decodificado bem abaixo do cronômetro => usa o cronômetro.
  assert.equal(pickRecordedDurationMs({ rawDurationMs: 14 * S, elapsedMs: 16 * S }), 16 * S);

  // 2) Diferença pequena (atraso normal do microfone) => confia no arquivo.
  assert.equal(pickRecordedDurationMs({ rawDurationMs: 15.2 * S, elapsedMs: 16 * S }), 15.2 * S);

  // 3) Decodificado maior que o cronômetro, dentro do razoável => confia no arquivo.
  assert.equal(pickRecordedDurationMs({ rawDurationMs: 17 * S, elapsedMs: 16 * S }), 17 * S);

  // 4) Inflado (WebM cru devolvendo minutos) => cronômetro. Comportamento antigo preservado.
  assert.equal(pickRecordedDurationMs({ rawDurationMs: 70 * S, elapsedMs: 10 * S }), 10 * S);

  // 5) Sem leitura do arquivo (decode falhou/timeout) => cronômetro.
  assert.equal(pickRecordedDurationMs({ rawDurationMs: null, elapsedMs: 9 * S }), 9 * S);
  assert.equal(pickRecordedDurationMs({ rawDurationMs: NaN, elapsedMs: 9 * S }), 9 * S);
  assert.equal(pickRecordedDurationMs({ rawDurationMs: 0, elapsedMs: 9 * S }), 9 * S);

  // 6) Entrada degenerada não pode devolver lixo.
  assert.equal(pickRecordedDurationMs({ rawDurationMs: 5 * S, elapsedMs: 0 }), 5 * S);
  assert.equal(pickRecordedDurationMs({}), null);

  // 7) Invariante: o resultado nunca é menor que o cronômetro menos a tolerância.
  for (const [raw, el] of [[14 * S, 16 * S], [1 * S, 60 * S], [15 * S, 15 * S], [8 * S, 9 * S]]) {
    const out = pickRecordedDurationMs({ rawDurationMs: raw, elapsedMs: el });
    assert.ok(out >= el - 1500, `duração ${out} abaixo do piso para cronômetro ${el}`);
  }
}

console.log("OK — regressão de cleanupAudioRecording e duração do áudio gravado passou.");
