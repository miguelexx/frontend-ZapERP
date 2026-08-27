export const WA_AUDIO_DURATION_CACHE_MAX = 1000;

const durationCache = new Map();

export function normalizeAudioDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

export function rememberAudioDuration(msgKey, value) {
  const duration = normalizeAudioDuration(value);
  const key = msgKey == null ? "" : String(msgKey);
  if (!key || !duration) return duration;
  durationCache.delete(key);
  durationCache.set(key, duration);
  while (durationCache.size > WA_AUDIO_DURATION_CACHE_MAX) {
    const oldest = durationCache.keys().next().value;
    if (oldest == null) break;
    durationCache.delete(oldest);
  }
  return duration;
}

export function readAudioDuration(msgKey) {
  return normalizeAudioDuration(durationCache.get(String(msgKey ?? "")));
}

/** Só testes: esvazia o LRU sem expor o Map. */
export function resetAudioDurationCacheForTests() {
  durationCache.clear();
}
