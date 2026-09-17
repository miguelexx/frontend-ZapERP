/*
 * Profiler de scroll da thread — SÓ desenvolvimento.
 *
 * Objetivo: achar a causa real do "trava/pula" ao abrir a conversa e ao rolar o
 * histórico, sem chutar. Mede três coisas que são as suspeitas do caminho quente:
 *
 *   1. Frames longos durante o scroll (jank real percebido pelo usuário).
 *   2. Correções de scrollTop feitas pelo virtualizer/âncora (o "pulo").
 *   3. Delta entre a altura ESTIMADA (estimateSize) e a altura MEDIDA de cada
 *      linha, agrupado por tipo — quanto maior o delta, mais correção na 1.ª
 *      exibição, que é justamente o engasgo ao revelar histórico.
 *
 * TODO o código vive atrás de `import.meta.env.DEV`. No build de produção o Vite
 * substitui isso por `false` e remove as chamadas + este módulo do bundle.
 *
 * Uso (console do navegador, em dev):
 *   __zapScroll.report()   → imprime o resumo agora
 *   __zapScroll.reset()    → zera os contadores
 *   __zapScroll.enabled = false  → desliga sem recarregar
 */

const isDev = Boolean(import.meta.env && import.meta.env.DEV);

function makeStats() {
  return { count: 0, sumAbs: 0, sum: 0, max: 0, maxSigned: 0, over24: 0 };
}

function pushStat(stats, signedDelta) {
  const abs = Math.abs(signedDelta);
  stats.count += 1;
  stats.sumAbs += abs;
  stats.sum += signedDelta;
  if (abs > stats.max) stats.max = abs;
  if (abs > Math.abs(stats.maxSigned)) stats.maxSigned = signedDelta;
  if (abs > 24) stats.over24 += 1;
}

const state = {
  enabled: isDev,
  attachedEl: null,
  // frames
  longFrames: 0, // > 50ms
  jankFrames: 0, // 32–50ms
  worstFrame: 0,
  framesSampled: 0,
  rafId: 0,
  lastFrameTs: 0,
  scrolling: false,
  scrollEndTimer: 0,
  // correções de scrollTop
  corrections: 0,
  correctionPx: 0,
  worstCorrectionPx: 0,
  // long tasks
  longTasks: 0,
  longTaskMs: 0,
  worstLongTaskMs: 0,
  ltObserver: null,
  // estimativa x medida, por tipo
  estimateByType: new Map(),
  reportTimer: 0,
};

function ensureLongTaskObserver() {
  if (!isDev || state.ltObserver || typeof PerformanceObserver === "undefined") return;
  try {
    state.ltObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.longTasks += 1;
        state.longTaskMs += entry.duration;
        if (entry.duration > state.worstLongTaskMs) state.worstLongTaskMs = entry.duration;
      }
    });
    state.ltObserver.observe({ entryTypes: ["longtask"] });
  } catch {
    /* longtask não suportado (Safari) — seguimos com frames/correções */
  }
}

function frameLoop(ts) {
  if (!state.scrolling) {
    state.rafId = 0;
    return;
  }
  if (state.lastFrameTs) {
    const gap = ts - state.lastFrameTs;
    state.framesSampled += 1;
    if (gap > state.worstFrame) state.worstFrame = gap;
    if (gap > 50) state.longFrames += 1;
    else if (gap > 32) state.jankFrames += 1;
  }
  state.lastFrameTs = ts;
  state.rafId = requestAnimationFrame(frameLoop);
}

function onScroll() {
  if (!state.enabled) return;
  if (!state.scrolling) {
    state.scrolling = true;
    state.lastFrameTs = 0;
    if (!state.rafId) state.rafId = requestAnimationFrame(frameLoop);
  }
  window.clearTimeout(state.scrollEndTimer);
  state.scrollEndTimer = window.setTimeout(() => {
    state.scrolling = false;
    // Resumo automático pouco depois de parar de rolar.
    window.clearTimeout(state.reportTimer);
    state.reportTimer = window.setTimeout(() => scrollProfiler.report("auto após scroll"), 400);
  }, 180);
}

export const scrollProfiler = {
  get enabled() {
    return state.enabled;
  },
  set enabled(v) {
    state.enabled = Boolean(v) && isDev;
  },

  attach(scrollEl) {
    if (!isDev || !state.enabled || !scrollEl || state.attachedEl === scrollEl) return;
    this.detach();
    state.attachedEl = scrollEl;
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    ensureLongTaskObserver();
  },

  detach() {
    if (!isDev) return;
    if (state.attachedEl) {
      state.attachedEl.removeEventListener("scroll", onScroll);
      state.attachedEl = null;
    }
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
    state.scrolling = false;
    window.clearTimeout(state.scrollEndTimer);
  },

  /** Chamado quando o virtualizer/âncora vai corrigir a posição do scroll. */
  correction(deltaPx, _reason) {
    if (!isDev || !state.enabled) return;
    const px = Math.abs(Number(deltaPx) || 0);
    if (px < 0.5) return;
    state.corrections += 1;
    state.correctionPx += px;
    if (px > state.worstCorrectionPx) state.worstCorrectionPx = px;
  },

  /** Compara altura estimada x medida de uma linha renderizada. */
  recordRow(el, items, mobileThread, estimateFn) {
    if (!isDev || !state.enabled || !el) return;
    const index = Number(el.getAttribute("data-index"));
    if (!Number.isInteger(index)) return;
    const item = Array.isArray(items) ? items[index] : null;
    if (!item) return;
    const measured = el.offsetHeight;
    if (!measured) return;
    const estimated = estimateFn ? estimateFn(item, mobileThread) : 0;
    let tipo = item.__type === "day" ? "day" : String(item.tipo || "texto").toLowerCase();
    if (["ptt", "voice"].includes(tipo)) tipo = "audio";
    if (["image"].includes(tipo)) tipo = "imagem";
    let stats = state.estimateByType.get(tipo);
    if (!stats) {
      stats = makeStats();
      state.estimateByType.set(tipo, stats);
    }
    pushStat(stats, measured - estimated);
  },

  reset() {
    if (!isDev) return;
    state.longFrames = 0;
    state.jankFrames = 0;
    state.worstFrame = 0;
    state.framesSampled = 0;
    state.corrections = 0;
    state.correctionPx = 0;
    state.worstCorrectionPx = 0;
    state.longTasks = 0;
    state.longTaskMs = 0;
    state.worstLongTaskMs = 0;
    state.estimateByType.clear();
    // eslint-disable-next-line no-console
    console.info("[zapScroll] contadores zerados");
  },

  report(motivo) {
    if (!isDev) return;
    /* eslint-disable no-console */
    const hasSignal =
      state.framesSampled || state.corrections || state.longTasks || state.estimateByType.size;
    if (!hasSignal) {
      console.info("[zapScroll] sem dados ainda — role a conversa por alguns segundos");
      return;
    }
    console.groupCollapsed(
      `%c[zapScroll] resumo${motivo ? ` (${motivo})` : ""}`,
      "color:#3b82f6;font-weight:600"
    );
    console.table({
      "frames amostrados": state.framesSampled,
      "frames >32ms (jank)": state.jankFrames,
      "frames >50ms (long)": state.longFrames,
      "pior frame (ms)": Math.round(state.worstFrame),
      "correções de scrollTop": state.corrections,
      "px corrigidos (total)": Math.round(state.correctionPx),
      "pior correção (px)": Math.round(state.worstCorrectionPx),
      "long tasks (>50ms)": state.longTasks,
      "tempo em long tasks (ms)": Math.round(state.longTaskMs),
      "pior long task (ms)": Math.round(state.worstLongTaskMs),
    });
    const byType = {};
    for (const [tipo, s] of state.estimateByType.entries()) {
      byType[tipo] = {
        linhas: s.count,
        "erro médio (px)": s.count ? Math.round(s.sumAbs / s.count) : 0,
        "viés (px, +=maior que estimado)": s.count ? Math.round(s.sum / s.count) : 0,
        "pior erro (px)": Math.round(s.maxSigned),
        "linhas c/ erro >24px": s.over24,
      };
    }
    if (Object.keys(byType).length) {
      console.info("estimativa × altura real (delta por tipo de mensagem):");
      console.table(byType);
    }
    console.info("Copie estas duas tabelas e me mande. `__zapScroll.reset()` zera.");
    console.groupEnd();
    /* eslint-enable no-console */
  },
};

if (isDev && typeof window !== "undefined") {
  window.__zapScroll = scrollProfiler;
}
