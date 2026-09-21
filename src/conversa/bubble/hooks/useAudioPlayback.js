import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clamp, makeWaveBars, refreshProxyMediaToken, seedFromAny } from "../../utils/conversaViewHelpers";
import {
  nextSourceIndexOnError,
  shouldGiveUpOnError,
  planReloadOnPlayFailure,
  classifyStallRecovery,
  planReloadOnStall,
  needsReloadBeforeResume,
  classifyStuckStart,
} from "../../utils/audioPlaybackRecovery";
import { normalizeAudioDuration, rememberAudioDuration, readAudioDuration } from "../utils/audioDuration";
import { pauseOtherAudios, clearCurrentAudioIf } from "../utils/audioSession";
import { logAudioPlayFailure } from "../utils/audioPlayerLog";

const isPositionBuffered = (el) => {
  try {
    const t = Number(el.currentTime) || 0;
    const b = el.buffered;
    for (let i = 0; i < b.length; i += 1) {
      if (t >= b.start(i) - 0.25 && t < b.end(i)) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
};

export function useAudioPlayback({ src, candidates, msgKey, initialDuration }) {
  const sourceList = useMemo(() => {
    const list = Array.isArray(candidates) && candidates.length ? candidates : src ? [src] : [];
    const seen = new Set();
    return list.filter((u) => {
      const s = String(u || "").trim();
      if (!s || seen.has(s)) return false;
      seen.add(s);
      return true;
    });
  }, [candidates, src]);
  const [sourceIdx, setSourceIdx] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  const activeSrc = sourceList[sourceIdx] || "";
  const audioRef = useRef(null);
  const applyFreshSrc = useCallback(
    (el) => {
      if (!el || !activeSrc) return;
      const fresh = refreshProxyMediaToken(activeSrc);
      if (fresh && fresh !== el.getAttribute("src")) {
        try {
          el.src = fresh;
        } catch {
          /* ignore */
        }
      }
    },
    [activeSrc]
  );

  const autoPlayRef = useRef({ ate: 0, tentativas: 0 });
  // Vigília de início: cobre o intervalo entre "cliquei em tocar" e "o áudio começou de fato".
  // `pendingPlayRef` guarda o token do pedido em aberto (0 = nenhum); `resumeWatchRecoveredRef`
  // marca que já gastamos a única recarga automática (2ª falha → indisponível). `pendingPlaySeq`
  // apenas re-arma o efeito do watchdog. Tudo isolado: não afeta os caminhos que já funcionam.
  const pendingPlayRef = useRef(0);
  const pendingTokenSeqRef = useRef(0);
  const resumeWatchRecoveredRef = useRef(false);
  const [pendingPlaySeq, setPendingPlaySeq] = useState(0);
  const solicitarInicioPlayback = useCallback((resetBudget = true) => {
    pendingTokenSeqRef.current += 1;
    pendingPlayRef.current = pendingTokenSeqRef.current;
    if (resetBudget) resumeWatchRecoveredRef.current = false;
    setPendingPlaySeq((n) => n + 1);
  }, []);
  const durationProbeRef = useRef(false);
  const waveMeasureRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false);
  const seedDuration =
    normalizeAudioDuration(initialDuration) ||
    readAudioDuration(msgKey);
  const [dur, setDur] = useState(seedDuration);
  const [cur, setCur] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [waveBarCount, setWaveBarCount] = useState(34);
  const rafRef = useRef(null);
  const rafLastRef = useRef(0);
  const pointerToggleRef = useRef(false);
  const pointerSpeedRef = useRef(false);
  const pointerSeekRef = useRef(false);

  useEffect(() => {
    setSourceIdx(0);
    setPlaying(false);
    setCur(0);
    setDur(
      normalizeAudioDuration(initialDuration) ||
        readAudioDuration(msgKey)
    );
    setIndisponivel(false);
    durationProbeRef.current = false;
    autoPlayRef.current = { ate: 0, tentativas: 0 };
    pendingPlayRef.current = 0;
    resumeWatchRecoveredRef.current = false;
  }, [sourceList.join("\u0001"), msgKey, initialDuration]);

  useLayoutEffect(() => {
    const el = waveMeasureRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      setWaveBarCount(34);
      return;
    }
    let rafId = 0;
    const update = () => {
      const w = el.getBoundingClientRect?.().width || el.offsetWidth || 200;
      const n = clamp(Math.floor(w / 4), 18, 56);
      setWaveBarCount((prev) => (prev === n ? prev : n));
    };
    const schedule = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        update();
      });
    };
    schedule();
    const ro = new ResizeObserver(() => schedule());
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [activeSrc]);

  const bars = useMemo(() => makeWaveBars(waveBarCount, seedFromAny(msgKey)), [msgKey, waveBarCount]);

  useEffect(() => {
    setPlaybackRate(1);
  }, [activeSrc]);

  useEffect(() => {
    const el = audioRef.current;
    return () => {
      if (!el) return;
      try {
        el.pause();
      } catch {
        /* ignore */
      }
      clearCurrentAudioIf(el);
    };
  }, [activeSrc]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    try {
      el.playbackRate = playbackRate;
    } catch {
      /* ignore */
    }
  }, [playbackRate, activeSrc]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onLoaded = () => {
      setIndisponivel(false);
      const d = Number(el.duration);
      if (Number.isFinite(d) && d > 0) {
        setDur(d);
        rememberAudioDuration(msgKey, d);
      } else if (d === Infinity && !durationProbeRef.current) {
        durationProbeRef.current = true;
        const onDurationFix = () => {
          const fixed = Number(el.duration);
          if (Number.isFinite(fixed) && fixed > 0) {
            el.removeEventListener("durationchange", onDurationFix);
            setDur(fixed);
            rememberAudioDuration(msgKey, fixed);
            try { el.currentTime = 0; } catch { /* ignore */ }
          }
        };
        el.addEventListener("durationchange", onDurationFix);
        try { el.currentTime = 1e101; } catch { /* ignore */ }
      }
      try {
        el.playbackRate = playbackRate;
      } catch {
        /* ignore */
      }
    };
    const onSeeked = () => setCur(Number(el.currentTime || 0));
    const onEnded = () => {
      setPlaying(false);
      setCur(0);
      pendingPlayRef.current = 0;
    };
    const onPlay = () => {
      setPlaying(true);
      setIndisponivel(false);
      autoPlayRef.current.ate = 0;
      // Início confirmado: encerra a vigília e devolve o orçamento de recarga.
      pendingPlayRef.current = 0;
      resumeWatchRecoveredRef.current = false;
      try {
        el.playbackRate = playbackRate;
      } catch {
        /* ignore */
      }
    };
    const onPause = () => setPlaying(false);
    const onError = () => {
      setPlaying(false);
      const auto = autoPlayRef.current;
      if (auto.ate > Date.now()) {
        auto.tentativas += 1;
        if (shouldGiveUpOnError({ tentativas: auto.tentativas, sourceCount: sourceList.length })) {
          auto.ate = 0;
          setIndisponivel(true);
        }
      }
      setSourceIdx((curIdx) =>
        nextSourceIndexOnError({
          sourceIdx: curIdx,
          sourceCount: sourceList.length,
          autoWindowOpen: autoPlayRef.current.ate > Date.now(),
        })
      );
    };

    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("seeked", onSeeked);
    el.addEventListener("ended", onEnded);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("seeked", onSeeked);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("error", onError);
    };
  }, [activeSrc, playbackRate, sourceList.length, msgKey]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !activeSrc) return;
    const resumeAt = Number(el.currentTime) || 0;
    applyFreshSrc(el);
    try {
      el.load();
    } catch {
      /* ignore */
    }
    if (autoPlayRef.current.ate <= Date.now()) return;
    let restaurarPosicao = null;
    if (resumeAt > 0.25) {
      restaurarPosicao = () => {
        el.removeEventListener("loadedmetadata", restaurarPosicao);
        try { el.currentTime = resumeAt; } catch { /* ignore */ }
      };
      el.addEventListener("loadedmetadata", restaurarPosicao);
    }
    const tocarQuandoPronto = () => {
      el.removeEventListener("canplay", tocarQuandoPronto);
      autoPlayRef.current.ate = 0;
      void Promise.resolve(el.play()).catch((err) => {
        if (import.meta.env.DEV && err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
          console.warn("[AudioWavePlayer] play() rejeitado na retomada:", err?.name, err?.message);
        }
      });
    };
    el.addEventListener("canplay", tocarQuandoPronto);
    return () => {
      el.removeEventListener("canplay", tocarQuandoPronto);
      if (restaurarPosicao) el.removeEventListener("loadedmetadata", restaurarPosicao);
    };
  }, [activeSrc, reloadNonce, applyFreshSrc]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !playing) return;

    const tick = (t) => {
      if (!audioRef.current) return;
      const last = rafLastRef.current || 0;
      if (!last || t - last >= 66) {
        rafLastRef.current = t;
        setCur(Number(audioRef.current.currentTime || 0));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      rafLastRef.current = 0;
    };
  }, [playing]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !playing) return;
    let timer = 0;
    let recovered = false;
    let baseline = Number(el.currentTime || 0);
    const progressed = () => Number(el.currentTime || 0) > baseline + 0.2;
    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }
    };
    const recover = () => {
      clear();
      const decisao = classifyStallRecovery({
        paused: el.paused,
        ended: el.ended,
        seeking: el.seeking,
        progressed: progressed(),
        alreadyRecovered: recovered,
      });
      if (decisao === "noop") return;
      if (decisao === "giveup") {
        setIndisponivel(true);
        return;
      }
      recovered = true;
      autoPlayRef.current = { ate: Date.now() + 10_000, tentativas: autoPlayRef.current.tentativas || 0 };
      const plano = planReloadOnStall({ sourceIdx, sourceCount: sourceList.length });
      if (plano.type === "advance") setSourceIdx(plano.sourceIdx);
      else setReloadNonce((n) => n + 1);
    };
    const armFromStall = () => {
      if (timer) return;
      baseline = Number(el.currentTime || 0);
      timer = setTimeout(recover, 4000);
    };
    const cancelIfMoving = () => {
      if (progressed()) {
        clear();
        baseline = Number(el.currentTime || 0);
      }
    };
    el.addEventListener("waiting", armFromStall);
    el.addEventListener("stalled", armFromStall);
    el.addEventListener("playing", cancelIfMoving);
    el.addEventListener("timeupdate", cancelIfMoving);
    return () => {
      clear();
      el.removeEventListener("waiting", armFromStall);
      el.removeEventListener("stalled", armFromStall);
      el.removeEventListener("playing", cancelIfMoving);
      el.removeEventListener("timeupdate", cancelIfMoving);
    };
  }, [playing, sourceIdx, sourceList.length]);

  // Vigília de INÍCIO — a lacuna que forçava F5: o usuário clica em tocar mas o áudio nunca engata
  // e nenhum evento vem. Cobre `await el.play()` que trava mudo (não dispara `play`/`error`, então o
  // vigia de stall acima — que exige `playing` — nunca arma) e a recarga cujo `canplay` não chega
  // (fetch do proxy engasgado). Só roda para play PEDIDO PELO usuário (token em `pendingPlayRef`);
  // desarma no instante em que o tempo anda; se disparar, escalona pelo MESMO motor já testado.
  useEffect(() => {
    if (playing) return; // já tocando: nada a vigiar
    const token = pendingPlayRef.current;
    if (!token) return; // nenhum pedido de início em aberto (ou já confirmado/cancelado)
    const el = audioRef.current;
    if (!el) return;
    const baseline = Number(el.currentTime || 0);
    const timer = setTimeout(() => {
      if (pendingPlayRef.current !== token) return; // substituído por novo pedido ou cancelado
      const a = audioRef.current;
      if (!a) return;
      const progressed = Number(a.currentTime || 0) > baseline + 0.2;
      const decisao = classifyStuckStart({
        playing,
        progressed,
        alreadyRecovered: resumeWatchRecoveredRef.current,
      });
      if (decisao === "noop") {
        pendingPlayRef.current = 0;
        return;
      }
      if (decisao === "giveup") {
        pendingPlayRef.current = 0;
        setIndisponivel(true);
        return;
      }
      resumeWatchRecoveredRef.current = true;
      autoPlayRef.current = { ate: Date.now() + 10_000, tentativas: autoPlayRef.current.tentativas || 0 };
      const plano = planReloadOnStall({ sourceIdx, sourceCount: sourceList.length });
      if (plano.type === "advance") setSourceIdx(plano.sourceIdx);
      else setReloadNonce((n) => n + 1);
      solicitarInicioPlayback(false); // segue vigiando a nova tentativa, sem devolver o orçamento
    }, 6000);
    return () => clearTimeout(timer);
  }, [pendingPlaySeq, playing, sourceIdx, sourceList.length, solicitarInicioPlayback]);

  const toggle = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      pauseOtherAudios(el);
      try {
        el.playbackRate = playbackRate;
      } catch {
        /* ignore */
      }
      if (el.paused) {
        // Arma a vigília de início ANTES de qualquer tentativa: se nada engatar, ela recupera
        // sozinha em vez de deixar o botão morto até um F5.
        solicitarInicioPlayback();
        if (
          needsReloadBeforeResume({
            hasError: !!el.error,
            readyState: el.readyState,
            positionCovered: isPositionBuffered(el),
            currentTime: el.currentTime,
          })
        ) {
          // Buffer liberado (mobile) ou erro: recarrega e retoma quando o elemento estiver
          // REALMENTE pronto. Delega ao efeito de reload (canplay → play, loadedmetadata →
          // restaura a posição) em vez de chamar play() logo após load(): esse play() dispara
          // ANTES do canplay e, com o seek concorrente da retomada, trava mudo ou para na
          // metade — só um F5 resolvia. Abrir a janela de autoplay + bump do nonce aciona o
          // mesmo caminho robusto já coberto pelo teste de regressão de pause/play.
          autoPlayRef.current = { ate: Date.now() + 10_000, tentativas: 0 };
          setReloadNonce((n) => n + 1);
          return;
        }
        await el.play();
      } else {
        // Pausa do usuário cancela a vigília de início em aberto.
        pendingPlayRef.current = 0;
        el.pause();
      }
    } catch (err) {
      logAudioPlayFailure(el, err);
      autoPlayRef.current = { ate: Date.now() + 10_000, tentativas: 0 };
      solicitarInicioPlayback(false); // continua vigiando a recarga disparada pela falha
      const plano = planReloadOnPlayFailure({ sourceIdx, sourceCount: sourceList.length });
      if (plano.type === "nonce") {
        setReloadNonce((n) => n + 1);
      } else {
        setSourceIdx(plano.sourceIdx);
      }
    }
  }, [playbackRate, sourceIdx, sourceList.length, solicitarInicioPlayback]);

  const tentarNovamente = useCallback(() => {
    setIndisponivel(false);
    autoPlayRef.current = { ate: Date.now() + 10_000, tentativas: 0 };
    solicitarInicioPlayback(); // pedido explícito do usuário: reinicia o orçamento e revigia
    if (sourceIdx !== 0) setSourceIdx(0);
    else setReloadNonce((n) => n + 1);
  }, [sourceIdx, solicitarInicioPlayback]);

  const keepMobileKeyboardOpen = useCallback((e) => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }, []);

  const applyPlaybackRate = useCallback((rate) => {
    setPlaybackRate(rate);
    const a = audioRef.current;
    if (a) {
      try {
        a.playbackRate = rate;
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handlePlayPointerUp = useCallback(
    (e) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      e.preventDefault();
      e.stopPropagation();
      pointerToggleRef.current = true;
      void toggle();
    },
    [toggle]
  );

  const handlePlayClick = useCallback(
    (e) => {
      e.stopPropagation();
      if (pointerToggleRef.current) {
        pointerToggleRef.current = false;
        return;
      }
      void toggle();
    },
    [toggle]
  );

  const seek = useCallback((e) => {
    const el = audioRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frac = rect.width > 0 ? clamp(x / rect.width, 0, 1) : 0;
    const target = (dur || el.duration || 0) * frac;
    if (Number.isFinite(target)) {
      el.currentTime = target;
      setCur(target);
    }
  }, [dur]);

  const handleSeekPointerUp = useCallback(
    (e) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      e.preventDefault();
      e.stopPropagation();
      pointerSeekRef.current = true;
      seek(e);
    },
    [seek]
  );

  const handleSeekClick = useCallback(
    (e) => {
      e.stopPropagation();
      if (pointerSeekRef.current) {
        pointerSeekRef.current = false;
        return;
      }
      seek(e);
    },
    [seek]
  );

  const frac = dur > 0 ? clamp(cur / dur, 0, 1) : 0;
  const playedBars = Math.round(frac * bars.length);
  const remaining = dur > 0 ? Math.max(0, dur - cur) : 0;
  const pLabel = `${Math.round(frac * 100)}%`;

  return {
    audioRef,
    waveMeasureRef,
    activeSrc,
    playing,
    indisponivel,
    dur,
    cur,
    playbackRate,
    bars,
    frac,
    playedBars,
    remaining,
    pLabel,
    pointerSpeedRef,
    keepMobileKeyboardOpen,
    handlePlayPointerUp,
    handlePlayClick,
    handleSeekPointerUp,
    handleSeekClick,
    applyPlaybackRate,
    tentarNovamente,
  };
}
