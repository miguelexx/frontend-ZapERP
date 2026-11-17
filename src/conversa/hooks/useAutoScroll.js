import { useLayoutEffect, useRef } from "react";
import { isNearBottom } from "../scrollUtils";
import { isOutgoingMessage } from "../utils/conversaViewHelpers";
import { isPendingOutgoingTemp } from "../conversaStore";

function scheduleFrame(fn) {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(fn);
  }
  if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
    return window.setTimeout(fn, 16);
  }
  return setTimeout(fn, 16);
}

function cancelFrame(id) {
  if (!id) return;
  if (typeof cancelAnimationFrame === "function") {
    try {
      cancelAnimationFrame(id);
      return;
    } catch {
      /* fallback abaixo */
    }
  }
  try {
    clearTimeout(id);
  } catch {
    /* ignore */
  }
}

/**
 * Imagens DENTRO da janela visível da thread que ainda não decodificaram. Na abertura a
 * máscara espera por elas: ao decodificar, a moldura troca para a proporção real e a bolha
 * muda de altura — com a thread já visível isso era um salto de ~150px na cara do utilizador.
 */
function countPendingVisibleMedia(container) {
  if (!container || typeof container.querySelectorAll !== "function") return 0;
  let viewport;
  try {
    viewport = container.getBoundingClientRect();
  } catch {
    return 0;
  }
  let pending = 0;
  const imgs = container.querySelectorAll("img");
  for (let i = 0; i < imgs.length; i += 1) {
    const img = imgs[i];
    if (img.complete) continue;
    if (img.loading === "lazy" && !img.currentSrc && !img.src) continue;
    const r = img.getBoundingClientRect();
    if (r.bottom <= viewport.top || r.top >= viewport.bottom || r.height === 0) continue;
    pending += 1;
  }
  return pending;
}

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** Teto da espera por mídia visível na abertura (a máscara não pode prender a thread). */
const OPEN_MEDIA_WAIT_MAX_MS = 650;
/** Frames seguidos sem mídia pendente nem mudança de altura para considerar assentado. */
const OPEN_QUIET_FRAMES = 2;

function canRunProgrammaticSnap(opts = {}) {
  if (typeof opts.canSnap === "function" && !opts.canSnap()) return false;
  return true;
}

export function snapThreadToBottom(container, virtualListRef, opts = {}) {
  if (!canRunProgrammaticSnap(opts)) return;

  const min = opts.min === true;
  const gentle = opts.gentle === true && !min;
  const nearThreshold = opts.nearThreshold ?? 120;
  const alreadyNear = container && isNearBottom(container, nearThreshold);
  const hasVirtualEnd =
    virtualListRef?.current && typeof virtualListRef.current.scrollToEnd === "function";
  const followUpFrame = opts.followUpFrame !== false;

  const scrollContainerToBottom = () => {
    if (!canRunProgrammaticSnap(opts)) return;
    if (!container) return;
    try {
      container.scrollTop = container.scrollHeight;
    } catch {
      /* ignore */
    }
  };
  const scrollVirtualToEnd = () => {
    if (!canRunProgrammaticSnap(opts)) return;
    if (!hasVirtualEnd) return;
    try {
      virtualListRef.current.scrollToEnd({ align: "end", behavior: "auto" });
    } catch {
      /* ignore */
    }
  };

  /** Envio otimista / abertura: um sync (+ opcional 1 rAF para medição do virtualizer). */
  if (min) {
    if (hasVirtualEnd) {
      scrollVirtualToEnd();
      scrollContainerToBottom();
      if (followUpFrame) {
        scheduleFrame(() => {
          scrollVirtualToEnd();
          scrollContainerToBottom();
        });
      }
    } else {
      scrollContainerToBottom();
      if (followUpFrame) scheduleFrame(scrollContainerToBottom);
    }
    return;
  }

  if (gentle && alreadyNear) {
    if (hasVirtualEnd) {
      scrollVirtualToEnd();
      scrollContainerToBottom();
    }
    else scrollContainerToBottom();
    return;
  }

  if (hasVirtualEnd) {
    scrollVirtualToEnd();
    scrollContainerToBottom();
    if (!gentle && followUpFrame) {
      scheduleFrame(() => {
        scrollVirtualToEnd();
        scrollContainerToBottom();
      });
    }
    return;
  }

  if (container) {
    const apply = () => {
      if (!canRunProgrammaticSnap(opts)) return;
      try {
        container.scrollTop = container.scrollHeight;
      } catch {
        /* ignore */
      }
    };
    apply();
    if (!gentle && followUpFrame) {
      scheduleFrame(apply);
    }
  }
}

function prefersReducedMotion() {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/**
 * Desliza a thread até ao fim com desaceleração suave (estilo app nativo).
 *
 * - Incremental: cada frame anda uma fração do que FALTA até ao fundo atual, por isso segue
 *   o conteúdo que cresce (linhas medidas pelo virtualizer) e respeita as compensações de
 *   scrollTop que o virtualizer faça a meio, em vez de as sobrescrever com uma curva fixa.
 * - Distância longa: salta primeiro para ~1 ecrã acima do fim — animar 40 ecrãs de histórico
 *   seria lento e obrigaria o virtualizer a montar/medir tudo pelo caminho.
 * - `canContinue()` falso (wheel/touch do utilizador) aborta na hora.
 * - prefers-reduced-motion → salto direto.
 *
 * Devolve uma função que cancela a animação.
 */
export function smoothScrollThreadToBottom(container, { canContinue, onDone, maxMs = 650 } = {}) {
  if (!container) return () => {};
  const maxTop = () => Math.max(0, (container.scrollHeight || 0) - (container.clientHeight || 0));
  let finished = false;
  let raf = 0;
  const finish = (completed) => {
    if (finished) return;
    finished = true;
    cancelFrame(raf);
    try {
      onDone?.(completed);
    } catch {
      /* ignore */
    }
  };

  if (prefersReducedMotion()) {
    try {
      container.scrollTop = container.scrollHeight;
    } catch {
      /* ignore */
    }
    finish(true);
    return () => {};
  }

  const viewport = container.clientHeight || 600;
  const lead = viewport * 1.1;
  if (maxTop() - container.scrollTop > lead) {
    try {
      container.scrollTop = maxTop() - lead;
    } catch {
      /* ignore */
    }
  }

  const now = () =>
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const startedAt = now();
  let last = startedAt;

  const step = () => {
    if (finished) return;
    if (typeof canContinue === "function" && !canContinue()) {
      finish(false);
      return;
    }
    const t = now();
    const dt = Math.min(48, Math.max(1, t - last));
    last = t;
    const target = maxTop();
    const cur = container.scrollTop;
    const remaining = target - cur;
    if (Math.abs(remaining) <= 1 || t - startedAt >= maxMs) {
      try {
        container.scrollTop = container.scrollHeight;
      } catch {
        /* ignore */
      }
      finish(true);
      return;
    }
    /* ~18% do restante por frame a 60 fps, normalizado pelo dt real (120 Hz anda o mesmo). */
    const alpha = 1 - Math.pow(1 - 0.18, dt / 16.67);
    const delta = remaining * alpha;
    const minStep = Math.sign(remaining) * Math.min(Math.abs(remaining), 1.5);
    try {
      container.scrollTop = cur + (Math.abs(delta) < 1.5 ? minStep : delta);
    } catch {
      finish(false);
      return;
    }
    raf = scheduleFrame(step);
  };

  raf = scheduleFrame(step);
  return () => finish(false);
}

export function useAutoScroll({
  conversaId,
  loading,
  lastMsgKey,
  lastMsg,
  myUserId,
  messagesContainerRef,
  shouldStickToBottomRef,
  virtualListRef,
  mensagensCount = 0,
  suppressAutoScrollRef,
  userScrollLockRef,
  cancelOpenSnapPendingRef,
  onOpenSnapReady,
}) {
  const prevConversaIdRef = useRef(null);
  const prevLastKeyRef = useRef(null);
  const pendingJumpToBottomRef = useRef(false);
  const anchorLatestUntilMsgsRef = useRef(false);
  const prevLoadingForSnapRef = useRef(loading);
  const prevSnapConversaKeyRef = useRef(null);
  const openSnapInProgressRef = useRef(false);
  const openSnapUserCancelledRef = useRef(false);
  const onOpenSnapReadyRef = useRef(onOpenSnapReady);
  onOpenSnapReadyRef.current = onOpenSnapReady;
  /*
   * Boolean (há mensagens?) em vez do count bruto: o merge cache→API muda o número de
   * itens e, com deps em mensagensCount, o cleanup cancelava o settle a meio sem
   * reiniciar o snap (pending já limpo) — conversa abria no sítio errado.
   */
  const hasMessages = mensagensCount > 0;

  function notifyOpenSnapReady() {
    try {
      onOpenSnapReadyRef.current?.();
    } catch {
      /* ignore */
    }
  }

  function isUserScrollLocked() {
    return userScrollLockRef?.current === true;
  }

  function snapGuardOpts(extra = {}) {
    return {
      canSnap: () => !isUserScrollLocked() && !suppressAutoScrollRef?.current,
      ...extra,
    };
  }

  function cancelOpenSnapPending() {
    pendingJumpToBottomRef.current = false;
    anchorLatestUntilMsgsRef.current = false;
    openSnapInProgressRef.current = false;
    openSnapUserCancelledRef.current = true;
  }

  useLayoutEffect(() => {
    if (cancelOpenSnapPendingRef) {
      cancelOpenSnapPendingRef.current = cancelOpenSnapPending;
    }
    return () => {
      if (cancelOpenSnapPendingRef) cancelOpenSnapPendingRef.current = null;
    };
  }, [cancelOpenSnapPendingRef]);

  useLayoutEffect(() => {
    if (suppressAutoScrollRef?.current) return;
    const conversaIdAtual = conversaId ? String(conversaId) : null;
    const container = messagesContainerRef?.current;

    if (!conversaIdAtual) {
      prevConversaIdRef.current = null;
      prevLastKeyRef.current = null;
      pendingJumpToBottomRef.current = false;
      anchorLatestUntilMsgsRef.current = false;
      openSnapInProgressRef.current = false;
      return;
    }

    if (!prevConversaIdRef.current) {
      prevConversaIdRef.current = conversaIdAtual;
      prevLastKeyRef.current = lastMsgKey;
      shouldStickToBottomRef.current = true;
      pendingJumpToBottomRef.current = true;
      anchorLatestUntilMsgsRef.current = true;
      openSnapInProgressRef.current = false;
      openSnapUserCancelledRef.current = false;
      return;
    }

    if (prevConversaIdRef.current !== conversaIdAtual) {
      prevConversaIdRef.current = conversaIdAtual;
      prevLastKeyRef.current = lastMsgKey;
      shouldStickToBottomRef.current = true;
      pendingJumpToBottomRef.current = true;
      anchorLatestUntilMsgsRef.current = true;
      openSnapInProgressRef.current = false;
      openSnapUserCancelledRef.current = false;
      return;
    }

    if (lastMsgKey && lastMsgKey !== prevLastKeyRef.current) {
      if (isUserScrollLocked()) {
        prevLastKeyRef.current = lastMsgKey;
        return;
      }
      const fromMe =
        isOutgoingMessage(lastMsg) ||
        lastMsg?.fromMe === true ||
        (myUserId != null && lastMsg?.autor_usuario_id != null && String(lastMsg.autor_usuario_id) === String(myUserId));
      const pendingOwn = fromMe && isPendingOutgoingTemp(lastMsg);
      const shouldAutoScroll = Boolean(shouldStickToBottomRef.current || fromMe);
      if (shouldAutoScroll && container && !isUserScrollLocked()) {
        const near = isNearBottom(container, 200);
        const guard = snapGuardOpts({ followUpFrame: !pendingOwn });
        if (pendingOwn && near) {
          snapThreadToBottom(container, virtualListRef, { min: true, ...guard });
        } else if (shouldStickToBottomRef.current || (fromMe && near)) {
          snapThreadToBottom(container, virtualListRef, {
            gentle: Boolean(fromMe && near),
            nearThreshold: 200,
            followUpFrame: false,
            ...guard,
          });
        }
      }
    }

    prevLastKeyRef.current = lastMsgKey;
  }, [
    conversaId,
    lastMsgKey,
    lastMsg,
    myUserId,
    messagesContainerRef,
    shouldStickToBottomRef,
    virtualListRef,
    suppressAutoScrollRef,
    userScrollLockRef,
  ]);

  useLayoutEffect(() => {
    if (suppressAutoScrollRef?.current) return;
    if (!conversaId) return;
    const convKey = String(conversaId);
    if (prevSnapConversaKeyRef.current !== convKey) {
      prevSnapConversaKeyRef.current = convKey;
      prevLoadingForSnapRef.current = loading;
    }
    const becameReady = prevLoadingForSnapRef.current === true && loading === false;
    prevLoadingForSnapRef.current = loading;
    if (loading) return;

    const shouldSnapLatest =
      pendingJumpToBottomRef.current ||
      anchorLatestUntilMsgsRef.current ||
      (becameReady && hasMessages);

    if (!shouldSnapLatest) return;
    if (!hasMessages) {
      pendingJumpToBottomRef.current = false;
      anchorLatestUntilMsgsRef.current = false;
      notifyOpenSnapReady();
      return;
    }

    const userReadingHistory = isUserScrollLocked();

    if (userReadingHistory) {
      cancelOpenSnapPending();
      notifyOpenSnapReady();
      return;
    }

    if (pendingJumpToBottomRef.current) pendingJumpToBottomRef.current = false;
    anchorLatestUntilMsgsRef.current = false;

    shouldStickToBottomRef.current = true;
    const mobileLike =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 640px)").matches;

    openSnapInProgressRef.current = true;
    let cancelled = false;
    let rafChain = 0;
    let rafOnce = 0;
    let t1 = 0;
    let t2 = 0;
    let finished = false;

    const finishOpenSnap = () => {
      if (finished || cancelled) return;
      finished = true;
      openSnapInProgressRef.current = false;
      notifyOpenSnapReady();
    };

    const guard = snapGuardOpts();
    const snap = ({ force = false } = {}) => {
      if (cancelled || isUserScrollLocked()) return;
      if (force && openSnapUserCancelledRef.current) return;
      if (!force && !shouldStickToBottomRef.current) return;
      const c = messagesContainerRef?.current;
      /* 48px: fallbacks pós-máscara não devem puxar por 1 linha de remediação. */
      if (force && c && isNearBottom(c, 48)) return;
      snapThreadToBottom(c, virtualListRef, { followUpFrame: false, ...guard });
    };

    if (mobileLike) {
      const snapHard = () => {
        if (cancelled || isUserScrollLocked()) return;
        if (!shouldStickToBottomRef.current) return;
        const c = messagesContainerRef?.current;
        snapThreadToBottom(c, virtualListRef, { min: true, followUpFrame: false, ...guard });
      };
      snapHard();
      const startedAt = nowMs();
      let quiet = 0;
      let lastHeight = -1;
      /* Revela só quando a mídia visível decodificou e a altura parou (teto 650ms). */
      const waitSettled = () => {
        if (cancelled) return;
        snapHard();
        const c = messagesContainerRef?.current;
        const h = c ? c.scrollHeight : 0;
        const pending = countPendingVisibleMedia(c);
        quiet = pending === 0 && h === lastHeight ? quiet + 1 : 0;
        lastHeight = h;
        if (quiet >= OPEN_QUIET_FRAMES || nowMs() - startedAt >= OPEN_MEDIA_WAIT_MAX_MS || isUserScrollLocked()) {
          finishOpenSnap();
          return;
        }
        rafOnce = scheduleFrame(waitSettled);
      };
      rafOnce = scheduleFrame(waitSettled);
      return () => {
        cancelled = true;
        cancelFrame(rafOnce);
        openSnapInProgressRef.current = false;
      };
    }

    /*
     * Abertura (desktop): 1 snap síncrono + poucos frames de acomodação enquanto o
     * virtualizer mede as bolhas + 2 fallbacks tardios (medição/fonte/mídia que assenta
     * depois). Antes: 6 rAF + 5 timers (até 1400 ms) + um loop de até 12 tentativas, todos
     * re-snapando em paralelo — a maior parte do "pulo" residual na abertura vinha dessa
     * competição. Com a mídia já reservada (aspect-ratio no CSS) e as estimativas alinhadas,
     * a diferença estimativa↔medição é pequena e poucos frames bastam para assentar.
     */
    const SETTLE_FRAMES = 6;
    let settleFrame = 0;
    const startedAt = nowMs();
    let quiet = 0;
    let lastHeight = -1;

    snap();
    /*
     * Depois dos frames mínimos de acomodação, a máscara só cai quando a mídia visível já
     * decodificou e a altura ficou parada OPEN_QUIET_FRAMES frames (teto 650ms). Assim a troca
     * da moldura das fotos acontece por baixo da máscara, não na frente do utilizador.
     */
    const settle = () => {
      if (cancelled) return;
      if (isUserScrollLocked() || !shouldStickToBottomRef.current) {
        finishOpenSnap();
        return;
      }
      settleFrame += 1;
      snap();
      const c = messagesContainerRef?.current;
      const h = c ? c.scrollHeight : 0;
      const pending = countPendingVisibleMedia(c);
      quiet = pending === 0 && h === lastHeight ? quiet + 1 : 0;
      lastHeight = h;
      const minFramesDone = settleFrame >= SETTLE_FRAMES;
      const timedOut = nowMs() - startedAt >= OPEN_MEDIA_WAIT_MAX_MS;
      if (minFramesDone && (quiet >= OPEN_QUIET_FRAMES || timedOut)) {
        finishOpenSnap();
        return;
      }
      rafChain = scheduleFrame(settle);
    };
    rafChain = scheduleFrame(settle);

    // Fallbacks tardios: cobrem medição de bolha/fonte/mídia que assenta após os frames
    // iniciais. `force` mantém a âncora mesmo se um scroll programático tiver mexido no ref.
    t1 = window.setTimeout(() => {
      if (!cancelled) snap({ force: true });
    }, 320);
    t2 = window.setTimeout(() => {
      if (!cancelled) {
        snap({ force: true });
        finishOpenSnap();
      }
    }, 760);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      cancelFrame(rafChain);
      cancelFrame(rafOnce);
      openSnapInProgressRef.current = false;
    };
  }, [
    conversaId,
    loading,
    hasMessages,
    messagesContainerRef,
    shouldStickToBottomRef,
    virtualListRef,
    suppressAutoScrollRef,
    userScrollLockRef,
    cancelOpenSnapPendingRef,
  ]);
}
