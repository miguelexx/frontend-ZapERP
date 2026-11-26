import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { getMessageListReactKey } from "./conversaStore";
// Profiler de scroll — só é referenciado dentro de blocos `import.meta.env.DEV`,
// portanto o Vite remove o import e o módulo do bundle de produção.
import { scrollProfiler } from "./dev/scrollProfiler";

/*
 * Chamado pelo `estimateSize` \u2014 ou seja, por item, a cada passagem de medi\u00e7\u00e3o do
 * virtualizador. Ver a nota g\u00e9mea em ThreadRow.jsx: recorta a 1.\u00aa linha sem partir o corpo
 * todo e s\u00f3 faz `normalize("NFD")` se a linha j\u00e1 contiver "movimenta".
 */
function isInternalMovementEstimate(item) {
  if (!item) return false;
  if (item?.mensagem_interna === true) return true;
  if (String(item?.tipo || "").toLowerCase() === "movimentacao_interna_atendimento") return true;
  const raw = String(item?.texto ?? item?.conteudo ?? "").trim();
  if (!raw) return false;
  const nl = raw.indexOf("\n");
  const lower = (nl === -1 ? raw : raw.slice(0, nl)).toLowerCase();
  if (!lower.includes("movimenta")) return false;
  return lower
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .includes("movimentacao interna");
}

function estimateThreadRowSize(item, mobileThread) {
  if (!item) return mobileThread ? 112 : 96;
  if (item.__type === "day") return mobileThread ? 34 : 32;
  /* Pílula da triagem automática (recolhida). Expandida, a medição real corrige. */
  if (item.__botCompact) return mobileThread ? 40 : 38;
  if (isInternalMovementEstimate(item)) return mobileThread ? 116 : 98;
  const tipo = String(item.tipo || "").toLowerCase();
  /* Caixa fixa da figurinha (120/160px) + 2px de respiro em cima e embaixo. */
  if (tipo === "sticker") return mobileThread ? 124 : 164;
  /* Imagem usa uma moldura quadrada estável e vídeo usa 16:9. A estimativa fica perto da
     caixa real para reduzir o trabalho de correção quando a linha entra no overscan. */
  if (["imagem", "image"].includes(tipo)) return mobileThread ? 356 : 372;
  if (tipo === "video") return mobileThread ? 230 : 246;
  if (["audio", "ptt", "voice"].includes(tipo)) return mobileThread ? 72 : 68;
  if (["documento", "document", "arquivo", "file"].includes(tipo)) return mobileThread ? 76 : 72;
  if (tipo === "poll" || tipo === "enquete") {
    const opts = Array.isArray(item?.reply_meta?.poll?.options) ? item.reply_meta.poll.options.length : 2;
    return Math.min(mobileThread ? 320 : 340, (mobileThread ? 88 : 80) + Math.max(2, opts) * (mobileThread ? 40 : 38));
  }
  const text = String(item.texto ?? item.conteudo ?? item.message ?? item.body ?? "");
  const lines = Math.max(1, Math.ceil(text.length / (mobileThread ? 38 : 44)));
  return Math.min(mobileThread ? 320 : 360, (mobileThread ? 52 : 48) + lines * (mobileThread ? 18 : 20));
}

/*
 * Scroller da thread (.wa-messages) a partir do ref do pai OU da própria raiz da lista
 * (25/11/2026). No celular o ConversaView remonta a cada toque na lista, e com mensagens em
 * cache o scroller e esta lista montam no MESMO commit: o React liga o ref do pai DEPOIS dos
 * layout effects dos filhos. O virtualizer não achava o scroller no 1.º `_willUpdate`, ligava-se
 * num commit qualquer mais tarde (às vezes o da revelação) e fazia `scrollTo(0)` POR CIMA do
 * snap de abertura — a conversa aparecia no topo, descia 18px/frame e saltava 64–149px. A margem
 * (offsetTop da raiz) também ficava em 0 até a contagem mudar: a 1.ª mensagem enviada/recebida
 * derrubava a thread 137px e devolvia. O ref da raiz (filho) já está ligado nos layout effects
 * deste componente, e a raiz é filha direta do scroller (o ConversaThread devolve fragmento).
 */
function resolveThreadScroller(scrollRef, rootEl) {
  const fromRef = scrollRef?.current;
  if (fromRef) return fromRef;
  const parent = rootEl?.parentElement;
  return parent && parent.classList?.contains("wa-messages") ? parent : null;
}

function getVirtualRowKey(item, index, conversaId) {
  if (!item) return `row-${index}`;
  /* Separadores podem mudar de índice quando uma página é inserida no início. */
  if (item.__type === "day") return `day-${String(item.label ?? item.id ?? index)}`;
  if (conversaId != null && conversaId !== "") return getMessageListReactKey(item, conversaId);
  const id = item.id ?? item.tempId ?? item.whatsapp_id ?? index;
  return `msg-${String(id)}`;
}

/**
 * Thread de mensagens com virtualização dinâmica (altura medida por linha).
 * O scroll fica no elemento pai (.wa-messages).
 */
export const ConversaMessageVirtualList = forwardRef(function ConversaMessageVirtualList(
  { items, scrollRef, overscan = 12, mobileThread = false, renderItem, onVirtualContentResize, conversaId },
  ref
) {
  const innerRootRef = useRef(null);
  const scrollMarginRef = useRef(0);
  const [scrollMargin, setScrollMargin] = useState(0);
  const isScrollingRef = useRef(false);
  const pendingScrollMarginRef = useRef(null);
  const applyMarginFnRef = useRef(null);
  const contentResizePendingRef = useRef(false);
  const contentResizeFrameRef = useRef(0);
  const flushContentResizeRef = useRef(null);
  const count = Array.isArray(items) ? items.length : 0;

  // Identidade estável: getItemKey/estimateSize entram nas deps do memo de medidas do
  // @tanstack/virtual-core. Arrows inline novas a cada render invalidavam o memo e
  // recalculavam as posições de TODAS as linhas em cada render (inclusive durante o scroll).
  const getItemKey = useCallback(
    (index) => getVirtualRowKey(items[index], index, conversaId),
    [items, conversaId]
  );
  const estimateSize = useCallback(
    (index) => estimateThreadRowSize(items[index], mobileThread),
    [items, mobileThread]
  );

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => resolveThreadScroller(scrollRef, innerRootRef.current),
    estimateSize,
    overscan,
    scrollMargin,
    scrollPaddingStart: 12,
    scrollPaddingEnd: 16,
    isScrollingResetDelay: mobileThread ? 280 : 200,
    useAnimationFrameWithResizeObserver: mobileThread,
    getItemKey,
  });

  // DEV: ref estável que mede a linha e registra o delta estimativa×altura real.
  // Em produção, `import.meta.env.DEV` é false e o Vite mantém apenas
  // `virtualizer.measureElement`, sem custo extra.
  const measureCtxRef = useRef({ items, mobileThread });
  measureCtxRef.current = { items, mobileThread };
  const measureElement = useMemo(() => {
    if (!import.meta.env.DEV) return virtualizer.measureElement;
    return (el) => {
      virtualizer.measureElement(el);
      if (el) {
        const { items: it, mobileThread: mt } = measureCtxRef.current;
        scrollProfiler.recordRow(el, it, mt, estimateThreadRowSize);
      }
    };
  }, [virtualizer]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const scrollEl = scrollRef?.current;
    if (!scrollEl) return undefined;
    scrollProfiler.attach(scrollEl);
    return () => scrollProfiler.detach();
  }, [scrollRef]);

  useLayoutEffect(() => {
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) => {
      const scrollEl = resolveThreadScroller(scrollRef, innerRootRef.current);
      if (!scrollEl) return false;
      const margin = scrollMarginRef.current;
      const scrollTop = scrollEl.scrollTop;
      const viewportBottom = scrollTop + scrollEl.clientHeight;
      const distanceToBottom = scrollEl.scrollHeight - viewportBottom;
      const readingHistory = distanceToBottom > 120;
      if (readingHistory) {
        /*
         * Esta compensação também precisa ocorrer DURANTE wheel/touch. É justamente
         * nesse momento que linhas de mídia entram no overscan e trocam a estimativa
         * pela altura medida. Bloqueá-la enquanto `isScrolling` fazia cada diferença
         * acumulada deslocar o conteúdo para uma posição aparentemente aleatória.
         */
        /*
         * Basta a linha COMEÇAR acima do topo visível. Antes exigia-se a linha inteira
         * acima (`item.end <= scrollTop`): a linha que cruza a dobra — justamente a foto
         * que acabou de decodificar e trocou a moldura quadrada pela proporção real —
         * ficava de fora e empurrava tudo o que vinha depois dela (~100px de salto ao
         * subir por um histórico com fotos). Crescendo ou encolhendo acima da dobra, o
         * conteúdo visível tem de ficar no mesmo pixel.
         */
        const itemStart = item.start + margin;
        const willAdjust = itemStart < scrollTop;
        if (import.meta.env.DEV && willAdjust) {
          const estimated = estimateThreadRowSize(items[item.index], mobileThread);
          scrollProfiler.correction((item.size ?? estimated) - estimated, "size-change");
        }
        return willAdjust;
      }
      /*
       * Perto do fim, o ConversaView é o único responsável por manter a âncora inferior.
       * Se o virtualizer também compensar cada medição de bolha, as duas correções se
       * somam e produzem o "pulo" visível (principalmente em envio otimista e mídia).
       */
      return false;
    };
  }, [virtualizer, scrollRef]);

  useLayoutEffect(() => {
    const root = innerRootRef.current;
    const scrollEl = resolveThreadScroller(scrollRef, root);
    if (!scrollEl || !root) return undefined;

    let marginTimer = 0;
    const applyMargin = (next) => {
      const prev = scrollMarginRef.current;
      if (prev === next) return;
      if (scrollEl && !isScrollingRef.current) {
        const delta = next - prev;
        if (delta !== 0) {
          /*
           * Perto do fim, o ConversaView/useAutoScroll é dono da âncora inferior.
           * Compensar scrollTop aqui + snapIfStickBottom somava dois ajustes e
           * gerava “pulo” na abertura (banner/load-older mudam o offsetTop).
           */
          const distanceToBottom =
            scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
          if (distanceToBottom > 120) {
            if (import.meta.env.DEV) scrollProfiler.correction(delta, "margin");
            try {
              scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop + delta);
            } catch {
              /* ignore */
            }
          }
        }
      }
      scrollMarginRef.current = next;
      setScrollMargin((prevState) => (prevState === next ? prevState : next));
    };

    applyMarginFnRef.current = applyMargin;

    const syncMargin = (immediate = false) => {
      const next = Math.max(0, Math.round(root.offsetTop));
      if (isScrollingRef.current) {
        pendingScrollMarginRef.current = next;
        return;
      }
      /* Celular: só as mudanças POSTERIORES esperam 48ms (teclado/visualViewport redimensionam
         o scroller várias vezes seguidas). A 1.ª medição de cada montagem é aplicada já neste
         commit — antes ficava 0 durante o debounce e o restoreAfterPrepend/âncoras liam a
         margem errada (thread a deslocar 137px depois da revelação). */
      if (mobileThread && !immediate) {
        window.clearTimeout(marginTimer);
        marginTimer = window.setTimeout(() => applyMargin(next), 48);
        return;
      }
      applyMargin(next);
    };

    syncMargin(true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => syncMargin()) : null;
    ro?.observe(scrollEl);
    return () => {
      window.clearTimeout(marginTimer);
      ro?.disconnect();
      if (applyMarginFnRef.current === applyMargin) applyMarginFnRef.current = null;
    };
  }, [scrollRef, count, mobileThread]);

  /*
   * Desde a v3.14 o `scrollToIndex` do TanStack abre um laço de "reconcile" (rAF, até 5 s)
   * que, a cada remedição de linha, volta a aplicar o alvo DELE. Quando nós sobrescrevemos o
   * scrollTop logo a seguir (restaurar âncora após histórico, fundo real), os dois alvos
   * divergem: qualquer foto/áudio que mede nesses 5 s puxava a tela para o alvo do
   * virtualizer e o nosso snap devolvia — o "sobe um pouco, desce" sem o utilizador tocar.
   * Este corte encerra o laço; chamado quando o scroll é nosso ou quando o utilizador mexe.
   */
  const stopVirtualReconcile = useCallback(() => {
    try {
      virtualizer.scrollState = null;
    } catch {
      /* ignore */
    }
  }, [virtualizer]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index, options) => {
        if (index < 0 || index >= count) return;
        virtualizer.scrollToIndex(index, options);
      },
      /** Interrompe qualquer scrollToIndex em curso (wheel/touch do utilizador). */
      cancelProgrammaticScroll: stopVirtualReconcile,
      scrollToEnd: () => {
        if (count <= 0) return;
        /*
         * Fundo = scrollHeight − clientHeight, o mesmo que o virtualizer calcularia para a
         * última linha com align "end". Aplicado direto, sem abrir o laço de reconcile, que
         * podia arrastar o utilizador de volta ao fim se ele subisse logo a seguir a um snap.
         */
        stopVirtualReconcile();
        const scrollEl = scrollRef?.current;
        if (scrollEl) {
          try {
            scrollEl.scrollTop = scrollEl.scrollHeight;
          } catch {
            /* ignore */
          }
        }
      },
      getScrollAnchor: () => {
        const scrollEl = scrollRef?.current;
        const virtualItems = virtualizer.getVirtualItems();
        if (!scrollEl || !virtualItems.length) return null;
        const margin = scrollMarginRef.current;
        const scrollTop = scrollEl.scrollTop;
        const visibleItems = virtualItems.filter((item) => item.end + margin >= scrollTop + 1);
        /* Mensagem tem identidade estável; separador de dia pode mover-se quando o lote
           novo começa no mesmo dia do lote anterior. */
        const first =
          visibleItems.find((item) => items[item.index]?.__type !== "day") ??
          visibleItems[0] ??
          virtualItems[0];
        return {
          index: first.index,
          key: getVirtualRowKey(items[first.index], first.index, conversaId),
          offset: first.start + margin - scrollEl.scrollTop,
          scrollTop: scrollEl.scrollTop,
          itemStart: first.start,
          margin,
        };
      },
      restoreAfterPrepend: (anchor, prependedCount) => {
        const scrollEl = scrollRef?.current;
        if (!scrollEl || !anchor || prependedCount <= 0) return false;
        let newIndex = -1;
        if (anchor.key != null) {
          for (let index = 0; index < count; index += 1) {
            if (getVirtualRowKey(items[index], index, conversaId) === anchor.key) {
              newIndex = index;
              break;
            }
          }
        }
        if (newIndex < 0) newIndex = anchor.index + prependedCount;
        if (newIndex < 0 || newIndex >= count) return false;
        const prevOffsetInViewport = Number.isFinite(Number(anchor.offset))
          ? Number(anchor.offset)
          : anchor.itemStart + anchor.margin - anchor.scrollTop;
        /*
         * Posição lida de `measurementsCache` (todas as linhas, medidas ou estimadas) em vez
         * de `getVirtualItems()` (só as renderizadas — a linha-âncora, deslocada pelo lote
         * novo, quase nunca estava lá no 1.º apply). E SEM `scrollToIndex`: o alvo dele
         * (align start − 12px) diverge do offset que restauramos, e o laço de reconcile
         * puxava a tela para lá a cada foto do lote novo que medisse.
         */
        stopVirtualReconcile();
        const margin = anchor.margin ?? scrollMarginRef.current;
        const apply = () => {
          const row = virtualizer.measurementsCache?.[newIndex];
          if (!row) return;
          /* Mesmo referencial de getScrollAnchor: as linhas são pintadas em translate(start)
             dentro da raiz que já está em offsetTop = margin. */
          const next = Math.max(0, row.start + margin - prevOffsetInViewport);
          if (Math.abs(scrollEl.scrollTop - next) >= 1) scrollEl.scrollTop = next;
        };
        apply();
        /* Uma confirmação no frame seguinte cobre a montagem do novo range. As
           remedições posteriores são preservadas pelo callback de size change acima. */
        requestAnimationFrame(apply);
        return true;
      },
    }),
    [virtualizer, count, items, conversaId, stopVirtualReconcile]
  );

  useEffect(() => {
    const scrollEl = resolveThreadScroller(scrollRef, innerRootRef.current);
    if (!scrollEl) return undefined;

    let scrollEndTimer = 0;
    const flushResizeAfterScroll = () => {
      if (pendingScrollMarginRef.current != null) {
        applyMarginFnRef.current?.(pendingScrollMarginRef.current);
        pendingScrollMarginRef.current = null;
      }
      flushContentResizeRef.current?.();
    };

    const onScroll = () => {
      if (!isScrollingRef.current) {
        isScrollingRef.current = true;
        /* Com a thread mascarada (abertura), o scroll é só dos snaps programáticos: a classe
           (que só mexe em pintura/hover) não serve a ninguém e cada liga/desliga recalculava
           o estilo da thread inteira. A lógica de isScrollingRef continua igual. */
        if (!scrollEl.classList.contains("wa-messages--opening")) {
          scrollEl.classList.add("is-scrolling");
        }
      }
      window.clearTimeout(scrollEndTimer);
      scrollEndTimer = window.setTimeout(() => {
        isScrollingRef.current = false;
        scrollEl.classList.remove("is-scrolling");
        flushResizeAfterScroll();
      }, mobileThread ? 80 : 180);
    };

    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      window.clearTimeout(scrollEndTimer);
      scrollEl.classList.remove("is-scrolling");
      // Sem isto, um re-bind no meio do scroll deixava isScrollingRef=true sem timer:
      // o flush de margem/resize pendente ficava preso até o próximo gesto de scroll.
      if (isScrollingRef.current) {
        isScrollingRef.current = false;
        flushResizeAfterScroll();
      }
    };
    // `onVirtualContentResize` não é usado aqui — mantê-lo nas deps re-registrava o
    // listener exatamente ao terminar o carregamento de histórico (loadingMore muda).
  }, [scrollRef, mobileThread]);

  const prevCountRef = useRef(0);
  useLayoutEffect(() => {
    /*
     * O snap de abertura pertence exclusivamente ao useAutoScroll (ConversaView).
     * Antes, ao aparecer o 1º lote (prev === 0 && count > 0), este componente também
     * disparava scrollToIndex(count-1) + scrollTop = scrollHeight — no desktop os dois
     * snaps corriam juntos e, reagindo às remedições do virtualizer, produziam o "pulo"
     * (ir ao topo e voltar ao fim). O mobile já pulava este trecho; agora o desktop
     * também, deixando uma única fonte de âncora na abertura.
     */
    prevCountRef.current = count;
  }, [count]);

  useLayoutEffect(() => {
    if (!onVirtualContentResize) return undefined;
    const el = innerRootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;

    const schedule = () => {
      /*
       * Uma página com dezenas de mídias pode emitir várias notificações no mesmo
       * frame. Consolidá-las evita snaps/reflows repetidos disputando o scroll.
      */
      contentResizePendingRef.current = true;
      const scrollEl = resolveThreadScroller(scrollRef, innerRootRef.current);
      const distanceToBottom = scrollEl
        ? Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight - scrollEl.scrollTop)
        : Number.POSITIVE_INFINITY;
      // Scrolls programáticos de abertura/envio também disparam `scroll`. Perto do
      // rodapé não devemos reter a remedição por 80/180 ms: isso deixa o espaço da
      // nova altura visível. Longe do fim, continuamos adiando para não disputar com
      // a leitura manual do histórico.
      if (distanceToBottom <= 120 && !contentResizeFrameRef.current) {
        contentResizePendingRef.current = false;
        onVirtualContentResize();
        return;
      }
      if (isScrollingRef.current || contentResizeFrameRef.current) return;
      contentResizeFrameRef.current = requestAnimationFrame(() => {
        contentResizeFrameRef.current = 0;
        if (!contentResizePendingRef.current) return;
        contentResizePendingRef.current = false;
        onVirtualContentResize();
      });
    };

    flushContentResizeRef.current = schedule;

    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    schedule();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(contentResizeFrameRef.current);
      contentResizeFrameRef.current = 0;
      contentResizePendingRef.current = false;
      if (flushContentResizeRef.current === schedule) flushContentResizeRef.current = null;
    };
  }, [onVirtualContentResize, count, mobileThread]);

  /*
   * Reancoragem NO MESMO frame em que a altura total muda (16/11/2026). O ResizeObserver da
   * raiz acima não chega a tempo: quem dispara a mudança é o RO das LINHAS (mais fundas), e a
   * spec adia para o frame seguinte observações de elementos mais rasos do que os já
   * processados. Resultado medido: 1 frame pintado com a última bolha empurrada 80–120px para
   * baixo e depois puxada de volta ("bug visual rápido" ao abrir). Este layout effect corre
   * antes do paint do re-render que trouxe a altura nova. O RO continua como rede de
   * segurança; o `snapIfStickBottom` ignora a 2.ª chamada (sem delta de altura).
   */
  const totalSize = virtualizer.getTotalSize();
  const prevTotalSizeRef = useRef(totalSize);
  useLayoutEffect(() => {
    if (prevTotalSizeRef.current === totalSize) return;
    prevTotalSizeRef.current = totalSize;
    onVirtualContentResize?.();
  }, [totalSize, onVirtualContentResize]);

  if (count === 0) return null;

  return (
    <div
      ref={innerRootRef}
      className="wa-messages-virtual-root"
      style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}
    >
      {virtualizer.getVirtualItems().map((vRow) => (
        <div
          key={vRow.key}
          data-index={vRow.index}
          ref={measureElement}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            maxWidth: "100%",
            /* translateY (2D), não translate3d: o 3D promovia cada linha a camada de
               composição (13+ camadas recompostas por frame). O scroller já é composto
               inteiro; as linhas não precisam de camada própria. */
            transform: `translateY(${vRow.start}px)`,
          }}
        >
          {renderItem(items[vRow.index], vRow.index)}
        </div>
      ))}
    </div>
  );
});

/**
 * Lista natural para mobile: evita transforms/medição dinâmica da virtualização durante toque.
 * O lote atual é pequeno o bastante para render direto e o scroll nativo fica mais previsível.
 * Renderiza no máximo MOBILE_STATIC_MAX itens para evitar acúmulo de nós DOM em sessões longas.
 */
const MOBILE_STATIC_MAX = 60;

export const ConversaMessageStaticList = forwardRef(function ConversaMessageStaticList(
  { items, scrollRef, renderItem, onVirtualContentResize, conversaId },
  ref
) {
  const rootRef = useRef(null);
  const count = Array.isArray(items) ? items.length : 0;

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const scrollEl = scrollRef?.current;
    if (!scrollEl) return undefined;
    scrollProfiler.attach(scrollEl);
    return () => scrollProfiler.detach();
  }, [scrollRef]);

  const offset = count > MOBILE_STATIC_MAX ? count - MOBILE_STATIC_MAX : 0;
  const visibleItems = useMemo(
    () => (offset > 0 ? items.slice(offset) : items),
    [items, offset]
  );

  const getRowByIndex = (index) => rootRef.current?.querySelector?.(`[data-index="${index}"]`) ?? null;
  const getRowByKey = (key) => {
    if (!key || !rootRef.current) return null;
    return Array.from(rootRef.current.children || []).find(
      (row) => row.getAttribute("data-row-key") === String(key)
    ) ?? null;
  };

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index, options = {}) => {
        const scrollEl = scrollRef?.current;
        const root = rootRef.current;
        const row = getRowByIndex(index);
        if (!scrollEl || !root || !row) return;
        const align = options?.align || "start";
        const rowTop = row.offsetTop - root.offsetTop;
        let top = rowTop;
        if (align === "end") {
          top = rowTop + row.offsetHeight - scrollEl.clientHeight;
        } else if (align === "center") {
          top = rowTop - (scrollEl.clientHeight - row.offsetHeight) / 2;
        }
        try {
          scrollEl.scrollTo({ top: Math.max(0, top), behavior: options?.behavior || "auto" });
        } catch {
          scrollEl.scrollTop = Math.max(0, top);
        }
      },
      scrollToEnd: () => {
        const scrollEl = scrollRef?.current;
        if (!scrollEl) return;
        try {
          scrollEl.scrollTop = scrollEl.scrollHeight;
        } catch {
          /* ignore */
        }
      },
      getScrollAnchor: () => {
        const scrollEl = scrollRef?.current;
        const root = rootRef.current;
        if (!scrollEl || !root) return null;
        const viewport = scrollEl.getBoundingClientRect();
        const rows = Array.from(root.children || []);
        const visibleRows = rows.filter(
          (row) => row.getBoundingClientRect().bottom >= viewport.top + 1
        );
        const first =
          visibleRows.find((row) => {
            const index = Number(row.getAttribute("data-index"));
            return items[index]?.__type !== "day";
          }) ?? visibleRows[0] ?? rows[0];
        if (!first) return null;
        return {
          index: Number(first.getAttribute("data-index")) || 0,
          key: first.getAttribute("data-row-key") || null,
          offset: first.getBoundingClientRect().top - viewport.top,
          scrollTop: scrollEl.scrollTop,
          scrollHeight: scrollEl.scrollHeight,
        };
      },
      restoreAfterPrepend: (anchor, prependedCount) => {
        const scrollEl = scrollRef?.current;
        if (!scrollEl || !anchor || prependedCount <= 0) return false;
        let newIndex = -1;
        if (anchor.key != null) {
          for (let index = 0; index < count; index += 1) {
            if (getVirtualRowKey(items[index], index, conversaId) === anchor.key) {
              newIndex = index;
              break;
            }
          }
        }
        if (newIndex < 0) newIndex = anchor.index + prependedCount;
        if (newIndex < 0 || newIndex >= count) return false;
        const apply = () => {
          const row = getRowByKey(anchor.key) || getRowByIndex(newIndex);
          if (!row) return;
          const viewport = scrollEl.getBoundingClientRect();
          const currentOffset = row.getBoundingClientRect().top - viewport.top;
          scrollEl.scrollTop += currentOffset - (anchor.offset ?? 0);
        };
        apply();
        requestAnimationFrame(apply);
        requestAnimationFrame(apply);
        return true;
      },
    }),
    [count, scrollRef, items, conversaId]
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !onVirtualContentResize || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      onVirtualContentResize();
    });
    ro.observe(root);
    return () => {
      ro.disconnect();
    };
  }, [onVirtualContentResize, count]);

  if (count === 0) return null;

  return (
    <div ref={rootRef} className="wa-messages-static-root">
      {visibleItems.map((item, i) => {
        const absIndex = offset + i;
        const rowKey = getVirtualRowKey(item, absIndex, conversaId);
        return (
          <div
            key={rowKey}
            data-index={absIndex}
            data-row-key={rowKey}
            className="wa-messages-static-row"
          >
            {renderItem(item, absIndex)}
          </div>
        );
      })}
    </div>
  );
});
