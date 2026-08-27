const RECORDED_AUDIO_METADATA_TIMEOUT_MS = 1500;

export const RECORDED_AUDIO_MIN_MS = 800;
export const RECORDED_AUDIO_MAX_MS = 10 * 60 * 1000;
export const RECORDED_AUDIO_MIN_BYTES = 512;

const RECORDED_AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
];

export function pickRecordingMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return null;
  return RECORDED_AUDIO_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || null;
}

export function audioExtensionFromMime(type) {
  const base = String(type || "").toLowerCase().split(";")[0].trim();
  if (base.includes("ogg")) return "ogg";
  if (base.includes("mpeg") || base.includes("mp3")) return "mp3";
  if (base.includes("mp4") || base.includes("aac") || base.includes("m4a")) return "m4a";
  if (base.includes("wav")) return "wav";
  return "webm";
}

export function inspectRecordedAudioBlob(blob) {
  if (
    !blob ||
    typeof Audio === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return Promise.resolve({ durationSec: null, error: null, timedOut: false });
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timeoutId);
      audio.removeAttribute("src");
      try {
        audio.load();
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timeoutId = setTimeout(() => {
      finish({ durationSec: null, error: null, timedOut: true });
    }, RECORDED_AUDIO_METADATA_TIMEOUT_MS);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const durationSec = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
      finish({ durationSec, error: null, timedOut: false });
    };
    audio.onerror = () => {
      finish({ durationSec: null, error: "decode_error", timedOut: false });
    };
    audio.src = url;
    try {
      audio.load();
    } catch {
      finish({ durationSec: null, error: "decode_error", timedOut: false });
    }
  });
}

export function attachRecordedAudioMetadata(file, meta) {
  try {
    Object.defineProperties(file, {
      __zaperpAudioDurationMs: { value: meta.durationMs, enumerable: false },
      __zaperpAudioElapsedMs: { value: meta.elapsedMs, enumerable: false },
      __zaperpAudioMimeType: { value: meta.mimeType, enumerable: false },
      __zaperpAudioBytes: { value: meta.bytes, enumerable: false },
    });
  } catch {
    /* ignore */
  }
  return file;
}
