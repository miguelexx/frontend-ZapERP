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
import { pauseOtherAudios, clearCurrentAudioIf, getCurrentAudio } from "../utils/audioSession";
import { logAudioPlayFailure } from "../utils/audioPlayerLog";

/**
 * Posição sã do elemento. A sonda de duração Infinity usa currentTime ~1e101; qualquer
 * leitura nesse estado não pode virar resumeAt/baseline (retomar "no fim infinito"
 * deixava o player mudo e o vigia sem referência de progresso).
 */
const sanePosition = (v) => {
  const t = Number(v) || 0;
  return Number.isFinite(t) && t >= 0 && t <= 24 * 3600 ? t : 0;
};

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

export function useAudioPlayback({ src, candidates, msgKey, initialDuration, reprocessMedia }) {
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
  // `playList` é a lista EM USO pelo elemento. Quando `sourceList` muda no meio da reprodução
  // (backend migra a URL do provedor → /uploads ou /uploads → /media/r2 e re-emite nova_mensagem),
  // trocar o src na hora resetava o <audio> e o áudio parava na metade. A lista nova fica em
  // `pendingListRef` e é adotada na pausa/fim — ou imediatamente pelas recuperações de stall/erro,
  // onde a URL nova é justamente o melhor candidato.
  const [playList, setPlayList] = useState(sourceList);
  const playListRef = useRef(sourceList);
  playListRef.current = playList;
  const pendingListRef = useRef(null);
  const playingRef = useRef(false);
  const durationFixCleanupRef = useRef(null);
  // Incrementado quando o usuário CANCELA um início em andamento (clique de pausa durante
  // recarga): invalida o autoplay pendente do `canplay` já agendado no efeito de reload.
  const playCancelSeqRef = useRef(0);
  const activeSrc = playList[sourceIdx] || "";
  const audioRef = useRef(null);
  const adoptPendingSourceList = useCallback(() => {
    const pend = pendingListRef.current;
    if (!pend) return false;
    pendingListRef.current = null;
    // Conteúdo idêntico ao em uso: nada a adotar — o caller segue com o reload normal.
    if (pend.join("\u0001") === playListRef.current.join("\u0001")) return false;
    setPlayList(pend);
    setSourceIdx(0);
    return true;
  }, []);
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
  // `expirado`: o backend confirmou que a mídia sumiu do provedor de vez — não adianta mais tentar,
  // então o player troca o botão por um aviso. `reprocessando`: recópia no backend em andamento.
  const [expirado, setExpirado] = useState(false);
  const [reprocessando, setReprocessando] = useState(false);
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

  const prevMsgKeyRef = useRef(msgKey);
  const initialDurationRef = useRef(initialDuration);
  initialDurationRef.current = initialDuration;
  useEffect(() => {
    const el = audioRef.current;
    const mesmaMensagem = prevMsgKeyRef.current === msgKey;
    prevMsgKeyRef.current = msgKey;
    // Mesma mensagem, nova lista de fontes, áudio tocando: NÃO resetar — pararia a
    // reprodução na metade (era o que acontecia quando a cópia p/ /uploads terminava
    // segundos depois de o atendente dar play). Guarda para adotar depois.
    if (mesmaMensagem && el && !el.paused && !el.ended) {
      pendingListRef.current = sourceList;
      return;
    }
    pendingListRef.current = null;
    setPlayList(sourceList);
    setSourceIdx(0);
    setPlaying(false);
    setCur(0);
    setDur(
      normalizeAudioDuration(initialDurationRef.current) ||
        readAudioDuration(msgKey)
    );
    setIndisponivel(false);
    setExpirado(false);
    setReprocessando(false);
    durationProbeRef.current = false;
    // "Tentar de novo"/clique abriu a janela de autoplay e ENTÃO a lista mudou (patch da URL
    // recuperada chega no mesmo ciclo): preservar o pedido em aberto — zerá-lo deixava o áudio
    // carregado mas mudo, exigindo um segundo clique. Mensagem diferente reseta tudo.
    const inicioEmAndamento =
      mesmaMensagem && (pendingPlayRef.current !== 0 || autoPlayRef.current.ate > Date.now());
    if (!inicioEmAndamento) {
      autoPlayRef.current = { ate: 0, tentativas: 0 };
      pendingPlayRef.current = 0;
      resumeWatchRecoveredRef.current = false;
    }
    // initialDuration fora das deps de propósito: a chegada tardia da duração não pode
    // resetar o player (o elemento seguia tocando com a UI em "pausado"). A semente
    // tardia é aplicada pelo efeito abaixo sem tocar na reprodução.
  }, [sourceList.join("\u0001"), msgKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const d = normalizeAudioDuration(initialDuration);
    if (d) setDur((prev) => (prev > 0 ? prev : d));
  }, [initialDuration]);

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
            if (durationFixCleanupRef.current === cleanupFix) durationFixCleanupRef.current = null;
            setDur(fixed);
            rememberAudioDuration(msgKey, fixed);
            // Volta ao início APENAS quando a posição é a da sonda (fim "infinito") ou o
            // player está parado. Um durationchange tardio no meio da reprodução não pode
            // teleportar o áudio para 0 — era o "não chega ao fim / volta ao início".
            const t = Number(el.currentTime || 0);
            const posicaoDaSonda = !Number.isFinite(t) || t >= fixed - 0.5;
            if (!playingRef.current || posicaoDaSonda) {
              try { el.currentTime = 0; } catch { /* ignore */ }
            }
          }
        };
        const cleanupFix = () => el.removeEventListener("durationchange", onDurationFix);
        durationFixCleanupRef.current = cleanupFix;
        el.addEventListener("durationchange", onDurationFix);
        try { el.currentTime = 1e101; } catch { /* ignore */ }
      }
      try {
        el.playbackRate = playbackRate;
      } catch {
        /* ignore */
      }
    };
    const onSeeked = () => setCur(sanePosition(el.currentTime));
    const onEnded = () => {
      playingRef.current = false;
      setPlaying(false);
      setCur(0);
      pendingPlayRef.current = 0;
      adoptPendingSourceList();
    };
    const onPlay = () => {
      playingRef.current = true;
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
    const onPause = () => {
      playingRef.current = false;
      setPlaying(false);
      // Pausado: hora segura de adotar a lista de fontes que chegou durante a reprodução.
      adoptPendingSourceList();
    };
    const onError = () => {
      const estavaTocando = playingRef.current;
      playingRef.current = false;
      setPlaying(false);
      const auto = autoPlayRef.current;
      // Erro NO MEIO da reprodução (ex.: range do proxy falhou, link expirou no provedor):
      // antes trocava de fonte em silêncio, SEM autoplay e SEM retomar a posição — o áudio
      // simplesmente parava na metade. Agora recupera pelo mesmo motor do stall: janela de
      // autoplay + vigília de início; o reload restaura a posição via loadedmetadata.
      if (estavaTocando && auto.ate <= Date.now()) {
        auto.ate = Date.now() + 10_000;
        auto.tentativas = auto.tentativas || 0;
        solicitarInicioPlayback(false);
      }
      if (auto.ate > Date.now()) {
        auto.tentativas += 1;
        if (shouldGiveUpOnError({ tentativas: auto.tentativas, sourceCount: playList.length })) {
          auto.ate = 0;
          setIndisponivel(true);
        }
      }
      // Lista nova pendente (ex.: /uploads chegou durante a reprodução) é o melhor candidato.
      if (adoptPendingSourceList()) return;
      setSourceIdx((curIdx) =>
        nextSourceIndexOnError({
          sourceIdx: curIdx,
          sourceCount: playList.length,
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
      // A sonda de Infinity registra um durationchange próprio; sem removê-lo aqui o
      // handler sobrevivia à troca de fonte e teleportava a reprodução para 0 depois.
      if (durationFixCleanupRef.current) {
        durationFixCleanupRef.current();
        durationFixCleanupRef.current = null;
      }
    };
  }, [activeSrc, playbackRate, playList.length, msgKey, adoptPendingSourceList, solicitarInicioPlayback]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !activeSrc) return;
    // sanePosition: durante a sonda de Infinity o currentTime é ~1e101 — "retomar" dali
    // deixava o player mudo (posição além do fim) e o vigia sem baseline de progresso.
    const resumeAt = sanePosition(el.currentTime);
    applyFreshSrc(el);
    try {
      el.load();
    } catch {
      /* ignore */
    }
    if (autoPlayRef.current.ate <= Date.now()) return;
    const cancelSeq = playCancelSeqRef.current;
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
      // Usuário cancelou este início (clique de pausa durante a recarga): não tocar.
      if (playCancelSeqRef.current !== cancelSeq) return;
      // Outro player tomou a sessão enquanto esta recarga carregava (usuário clicou em outro
      // áudio): não atropela a reprodução dele — antes este play() tardio tocava POR CIMA.
      const atual = getCurrentAudio();
      if (atual && atual !== el) {
        pendingPlayRef.current = 0;
        return;
      }
      pauseOtherAudios(el); // reivindica a sessão (cobre recarga do vigia/tentar de novo)
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
        setCur(sanePosition(audioRef.current.currentTime));
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
    let seekGraceUsada = false;
    let baseline = sanePosition(el.currentTime);
    const progressed = () => sanePosition(el.currentTime) > baseline + 0.2;
    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }
    };
    const recover = () => {
      clear();
      // Seek para trecho ainda não bufferizado: `seeking` fica true sem progresso e o dado pode
      // nunca chegar (antes isso virava "noop" e o timer nunca re-armava — congelado até F5).
      // 1ª vez dá mais uma janela de 4s (seek legítimo em rede lenta); persistindo, trata como
      // stall normal — o reload restaura a posição via `loadedmetadata` e retoma dali.
      const seekTravado = el.seeking && !progressed();
      if (seekTravado && !seekGraceUsada) {
        seekGraceUsada = true;
        timer = setTimeout(recover, 4000);
        return;
      }
      const decisao = classifyStallRecovery({
        paused: el.paused,
        ended: el.ended,
        seeking: seekTravado ? false : el.seeking,
        progressed: progressed(),
        alreadyRecovered: recovered,
      });
      if (decisao === "noop") return;
      if (decisao === "giveup") {
        try { el.pause(); } catch { /* ignore */ }
        setIndisponivel(true);
        return;
      }
      recovered = true;
      autoPlayRef.current = { ate: Date.now() + 10_000, tentativas: autoPlayRef.current.tentativas || 0 };
      // A recarga abaixo só confirma vida no `canplay`; se o fetch travar, NENHUM evento chega e
      // ninguém mais vigiava (o estado React `playing` segue true — `load()` pausa o elemento sem
      // disparar `pause` — e congelava até F5). Arma a vigília de início, a mesma do clique do
      // usuário, para escalonar/desistir sozinha se a recarga não engatar.
      solicitarInicioPlayback(false);
      // Lista nova pendente (URL migrada chegou durante a reprodução): é o melhor alvo
      // de recuperação — adota em vez de insistir na fonte antiga.
      if (adoptPendingSourceList()) return;
      const plano = planReloadOnStall({ sourceIdx, sourceCount: playList.length });
      if (plano.type === "advance") setSourceIdx(plano.sourceIdx);
      else setReloadNonce((n) => n + 1);
    };
    const armFromStall = () => {
      if (timer) return;
      baseline = sanePosition(el.currentTime);
      timer = setTimeout(recover, 4000);
    };
    const cancelIfMoving = () => {
      if (progressed()) {
        clear();
        baseline = sanePosition(el.currentTime);
        seekGraceUsada = false;
      }
    };
    el.addEventListener("waiting", armFromStall);
    el.addEventListener("stalled", armFromStall);
    el.addEventListener("playing", cancelIfMoving);
    el.addEventListener("timeupdate", cancelIfMoving);
    // `play` + `waiting` disparam na MESMA task quando o play() sai sem dado nenhum: o `waiting`
    // chega ANTES deste effect anexar os listeners (ele só roda após o re-render com playing=true)
    // e a vigia nunca armava — player "tocando" congelado no 0:00 até um F5. Se o elemento já está
    // faminto ao anexar, arma imediatamente; falso alarme é inofensivo (progresso cancela no
    // `timeupdate` e o `recover` re-checa tudo na hora de disparar).
    if (!el.paused && !el.ended && Number(el.readyState) < 3) armFromStall();
    return () => {
      clear();
      el.removeEventListener("waiting", armFromStall);
      el.removeEventListener("stalled", armFromStall);
      el.removeEventListener("playing", cancelIfMoving);
      el.removeEventListener("timeupdate", cancelIfMoving);
    };
  }, [playing, sourceIdx, playList.length, solicitarInicioPlayback, adoptPendingSourceList]);

  // Vigília de INÍCIO — a lacuna que forçava F5: o play foi pedido mas o áudio nunca engata e
  // nenhum evento vem. Cobre `await el.play()` que trava mudo (não dispara `play`/`error`, então o
  // vigia de stall acima — que exige `playing` — nunca arma) e a recarga cujo `canplay` não chega
  // (fetch do proxy engasgado) — tanto a disparada pelo clique do usuário quanto a disparada pelo
  // vigia de stall (token em `pendingPlayRef`). Desarma no instante em que o tempo anda ou o `play`
  // confirma; se disparar, escalona pelo MESMO motor já testado.
  useEffect(() => {
    // NÃO curto-circuita pelo estado React `playing`: na recarga pós-stall ele segue true obsoleto
    // (`load()` pausa o elemento sem disparar `pause`) e mascararia o travamento. O início real é
    // detectado pelo token — o evento `play` zera `pendingPlayRef` e o disparo abaixo vira no-op.
    const token = pendingPlayRef.current;
    if (!token) return; // nenhum pedido de início em aberto (ou já confirmado/cancelado)
    const el = audioRef.current;
    if (!el) return;
    const baseline = sanePosition(el.currentTime);
    const timer = setTimeout(() => {
      if (pendingPlayRef.current !== token) return; // substituído por novo pedido ou cancelado
      const a = audioRef.current;
      if (!a) return;
      const progressed = sanePosition(a.currentTime) > baseline + 0.2;
      // `playing` aqui vem do ELEMENTO no instante do disparo, nunca do estado React (obsoleto).
      const decisao = classifyStuckStart({
        playing: !a.paused && !a.ended && progressed,
        progressed,
        alreadyRecovered: resumeWatchRecoveredRef.current,
      });
      if (decisao === "noop") {
        pendingPlayRef.current = 0;
        return;
      }
      if (decisao === "giveup") {
        pendingPlayRef.current = 0;
        try { a.pause(); } catch { /* ignore */ }
        setPlaying(false);
        setIndisponivel(true);
        return;
      }
      resumeWatchRecoveredRef.current = true;
      autoPlayRef.current = { ate: Date.now() + 10_000, tentativas: autoPlayRef.current.tentativas || 0 };
      if (!adoptPendingSourceList()) {
        const plano = planReloadOnStall({ sourceIdx, sourceCount: playList.length });
        if (plano.type === "advance") setSourceIdx(plano.sourceIdx);
        else setReloadNonce((n) => n + 1);
      }
      solicitarInicioPlayback(false); // segue vigiando a nova tentativa, sem devolver o orçamento
    }, 6000);
    return () => clearTimeout(timer);
  }, [pendingPlaySeq, playing, sourceIdx, playList.length, solicitarInicioPlayback, adoptPendingSourceList]);

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
        // Clique com RECARGA em andamento (o estado da UI ainda é "tocando" — `load()` pausa
        // o elemento sem disparar `pause`): a intenção do usuário é PAUSAR. Antes este clique
        // era lido como play (el.paused=true) e disparava outra recarga — o áudio voltava a
        // tocar sozinho contra a vontade do usuário.
        if (playingRef.current && (pendingPlayRef.current || autoPlayRef.current.ate > Date.now())) {
          pendingPlayRef.current = 0;
          autoPlayRef.current.ate = 0;
          playCancelSeqRef.current += 1; // invalida o canplay→play pendente da recarga
          playingRef.current = false;
          setPlaying(false);
          adoptPendingSourceList();
          return;
        }
        // Lista de fontes nova chegou enquanto estava pausado no meio de uma recarga antiga:
        // adota antes de tocar — o efeito de reload toca sozinho com a janela aberta.
        solicitarInicioPlayback();
        if (pendingListRef.current && adoptPendingSourceList()) {
          autoPlayRef.current = { ate: Date.now() + 10_000, tentativas: 0 };
          return;
        }
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
      if (adoptPendingSourceList()) return;
      const plano = planReloadOnPlayFailure({ sourceIdx, sourceCount: playList.length });
      if (plano.type === "nonce") {
        setReloadNonce((n) => n + 1);
      } else {
        setSourceIdx(plano.sourceIdx);
      }
    }
  }, [playbackRate, sourceIdx, playList.length, solicitarInicioPlayback, adoptPendingSourceList]);

  const tentarNovamente = useCallback(async () => {
    setIndisponivel(false);
    // Recarga LOCAL (comportamento histórico): reabre a janela de autoplay e recarrega as fontes.
    const recargaLocal = () => {
      autoPlayRef.current = { ate: Date.now() + 10_000, tentativas: 0 };
      solicitarInicioPlayback(); // pedido explícito do usuário: reinicia o orçamento e revigia
      if (adoptPendingSourceList()) return; // URL nova (ex.: recém-copiada p/ /uploads) na frente
      if (sourceIdx !== 0) setSourceIdx(0);
      else setReloadNonce((n) => n + 1);
    };

    // Mídia recebida sem /uploads: primeiro pede ao backend uma nova cópia. Se recuperar, a bolha
    // se atualiza pelo socket (nova_mensagem) e a recarga local abaixo cobre a janela até lá; se o
    // link expirou de vez, troca para o aviso "expirou" e para de oferecer o botão.
    if (typeof reprocessMedia === "function") {
      setReprocessando(true);
      let resultado = null;
      try {
        resultado = await reprocessMedia();
      } catch {
        resultado = null;
      }
      setReprocessando(false);
      if (resultado?.definitivo) {
        setExpirado(true);
        return;
      }
      // ok (recuperou) OU falha transitória: em ambos vale tocar de novo localmente.
    }
    recargaLocal();
  }, [sourceIdx, solicitarInicioPlayback, reprocessMedia, adoptPendingSourceList]);

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
    expirado,
    reprocessando,
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
