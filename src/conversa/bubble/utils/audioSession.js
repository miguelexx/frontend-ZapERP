let currentAudio = null;

export function getCurrentAudio() {
  return currentAudio;
}

export function setCurrentAudio(el) {
  currentAudio = el || null;
}

export function pauseOtherAudios(el) {
  if (currentAudio && currentAudio !== el) {
    try {
      currentAudio.pause();
    } catch {
      /* ignore */
    }
  }
  currentAudio = el || null;
}

export function clearCurrentAudioIf(el) {
  if (currentAudio === el) currentAudio = null;
}
