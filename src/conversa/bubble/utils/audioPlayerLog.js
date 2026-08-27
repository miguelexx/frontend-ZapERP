/** Snapshot seguro do `<audio>` para diagnóstico de play() rejeitado (só DEV). */
export function snapshotAudioForPlayLog(el) {
  if (!el) return null;
  let buffered = null;
  try {
    const ranges = [];
    for (let i = 0; i < el.buffered.length; i += 1) {
      ranges.push([el.buffered.start(i), el.buffered.end(i)]);
    }
    buffered = ranges;
  } catch {
    buffered = null;
  }
  return {
    readyState: el.readyState,
    networkState: el.networkState,
    currentTime: el.currentTime,
    paused: el.paused,
    ended: el.ended,
    seeking: el.seeking,
    buffered,
    error: el.error ? { code: el.error.code, message: el.error.message } : null,
  };
}

export function logAudioPlayFailure(el, err) {
  if (!import.meta.env.DEV) return;
  try {
    console.warn("[AudioWavePlayer] play() falhou", {
      name: err?.name || null,
      message: err?.message || String(err || ""),
      audio: snapshotAudioForPlayLog(el),
    });
  } catch {
    /* ignore */
  }
}
