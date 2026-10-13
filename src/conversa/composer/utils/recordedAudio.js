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
    // Guardado no `loadedmetadata`: em formatos com cabeçalho íntegro (m4a/mp4) esse valor
    // já é correto. Se a varredura forçada abaixo não terminar a tempo, caímos nele em vez
    // de devolver null — assim o resultado nunca fica PIOR que o comportamento anterior.
    let duracaoNoMetadata = null;
    const timeoutId = setTimeout(() => {
      finish({ durationSec: duracaoNoMetadata, error: null, timedOut: true });
    }, RECORDED_AUDIO_METADATA_TIMEOUT_MS);
    audio.preload = "metadata";
    const finishComDuracaoAtual = () => {
      const d = Number(audio.duration);
      const valida = Number.isFinite(d) && d > 0 ? d : null;
      finish({ durationSec: valida ?? duracaoNoMetadata, error: null, timedOut: false });
    };
    audio.onloadedmetadata = () => {
      /*
       * Blob do MediaRecorder (WebM/Opus) não traz duração no cabeçalho, então em
       * `loadedmetadata` o `duration` pode vir Infinity OU, pior, um valor PARCIAL que
       * parece válido: a auditoria de 10/10/2026 gravou 16 s e leu 14 s aqui, enquanto o
       * arquivo real tinha 17 s. Buscar além do fim força o navegador a varrer o stream e
       * recalcular a duração real; `timeupdate` avisa quando terminou. Se nada disso
       * acontecer, o timeout existente devolve null e quem chama usa o tempo cronometrado.
       */
      const d0 = Number(audio.duration);
      if (Number.isFinite(d0) && d0 > 0) duracaoNoMetadata = d0;
      try {
        audio.ontimeupdate = () => {
          audio.ontimeupdate = null;
          try {
            audio.currentTime = 0;
          } catch {
            /* ignore */
          }
          finishComDuracaoAtual();
        };
        audio.currentTime = 1e101;
      } catch {
        finishComDuracaoAtual();
      }
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

/**
 * Decide a duração que vai para a bolha: valor decodificado do arquivo x tempo cronometrado.
 *
 * A duração decodificada é a verdade do ARQUIVO e tem precedência. O cronômetro
 * (`elapsedMs`) só entra quando não há decodificação, ou quando ela vem absurdamente
 * inflada (bug conhecido do WebM cru devolvendo minutos para segundos de áudio).
 *
 * NÃO existe guard de "subestimado". Teste em produção (13/10/2026) mostrou por que: um
 * áudio com 12,97 s de conteúdo cronometrou 17 s, porque o cronômetro começa no clique e a
 * captura só começa depois que o microfone é adquirido. O cronômetro é um TETO, não um piso.
 * Um guard desses descartava a duração correta e publicava a inflada.
 */
export function pickRecordedDurationMs({ rawDurationMs, elapsedMs } = {}) {
  const bruto = Number(rawDurationMs);
  const medido = Number(elapsedMs);
  if (!Number.isFinite(medido) || medido <= 0) {
    return Number.isFinite(bruto) && bruto > 0 ? bruto : null;
  }
  if (!Number.isFinite(bruto) || bruto <= 0) return medido;
  // Inflado (ex.: WebM sem cabeçalho devolvendo minutos para segundos de áudio).
  if (bruto > medido * 2 + 5000) return medido;
  return bruto;
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
