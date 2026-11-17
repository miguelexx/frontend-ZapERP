import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useConversaStore } from "../conversa/conversaStore";
import { useEmpresaStore } from "../auth/empresaStore";
import { useAuthStore } from "../auth/authStore";
import { CHAT_LIST_ROW_GAP, estimateChatListRowSize } from "./chatListRowAtendimento";
import MemoChatRow from "./ChatListRow";
import { useWhatsappInstancesStore } from "./whatsappInstancesStore";
import { useWhatsappLabelsStore } from "./whatsappLabelsStore";
import { chatRowStableKey } from "./chatRowStableKey";
import { useCompanyTimezoneVersion } from "../utils/useCompanyTimezone";
import { companyDayKey } from "../utils/companyTimezone";

/** A partir deste tamanho, lista virtualizada (crítico na aba Todas no mobile). */
export const CHAT_LIST_VIRTUAL_THRESHOLD = 24;
/**
 * Histerese: depois de entrar no modo virtual, só sai abaixo disto. Com um limiar só, uma
 * lista a oscilar 23↔24 (chega uma, sai outra) trocava de árvore a cada evento e remontava
 * TODAS as linhas — avatar a piscar, foco e scroll perdidos.
 */
export const CHAT_LIST_VIRTUAL_EXIT_THRESHOLD = 16;

/** Quantas linhas do topo visível guardamos como âncora (ver efeito de âncora abaixo). */
const SCROLL_ANCHOR_CANDIDATES = 4;
/** Até aqui conta como "no topo": o card novo aparece em cima, como no WhatsApp. */
const SCROLL_ANCHOR_AT_TOP_PX = 2;

/** Mesma regra de `renderChatListRow`: linhas que ganham nó no DOM. */
function isRenderableChatRow(c) {
  const clienteSemConv = Boolean(c?.sem_conversa && c?.cliente_id);
  return clienteSemConv || (c?.id != null && c?.id !== "");
}

/** Topo de `node` em coordenadas do conteúdo rolável de `el` (independe do scroll atual). */
function contentTopOf(el, node) {
  return node.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientTop + el.scrollTop;
}

/**
 * Escolhe, entre os candidatos guardados, o que ficou "no lugar". O card que subiu para o
 * topo também pode ser um candidato — seguir esse levaria a lista com ele. Tomamos o
 * deslocamento de índice mais comum entre os candidatos encontrados (o card que subiu é o
 * ponto fora da curva) e, nesse grupo, o primeiro.
 */
function pickAnchorHit(candidates, lookup) {
  const found = [];
  for (const cand of candidates) {
    const hit = lookup.get(cand.key);
    if (hit) found.push({ cand, hit, delta: hit.index - cand.index });
  }
  if (!found.length) return null;
  const freq = new Map();
  for (const f of found) freq.set(f.delta, (freq.get(f.delta) || 0) + 1);
  let bestDelta = found[0].delta;
  let bestCount = 0;
  for (const f of found) {
    const n = freq.get(f.delta);
    if (n > bestCount) {
      bestCount = n;
      bestDelta = f.delta;
    }
  }
  if (bestCount === 1) {
    // Todos diferentes (raro): o primeiro que não subiu; senão o primeiro.
    return found.find((f) => f.delta >= 0) || found[0];
  }
  return found.find((f) => f.delta === bestDelta);
}

function renderChatListRow(c, selectedId, props) {
  const id = c?.id;
  const clienteSemConv = Boolean(c?.sem_conversa && c?.cliente_id);
  if (!isRenderableChatRow(c)) return null;
  const active =
    !clienteSemConv &&
    id != null &&
    selectedId != null &&
    String(selectedId) === String(id);

  const rowKey = chatRowStableKey(c);

  return (
    <MemoChatRow
      key={rowKey}
      chat={c}
      active={active}
      onSelect={props.onSelect}
      onOpenClienteSemConversa={props.onOpenClienteSemConversa}
      currentUserId={props.currentUserId}
      currentUserName={props.currentUserName}
      isMenuOpen={String(props.openConversationId) === String(c?.id)}
      onToggleMenu={props.onToggleMenu}
      pendentesFuncionarioSet={props.pendentesFuncionarioSet}
      minuteTick={props.minuteTick}
      showWhatsappInstanceUi={props.showWhatsappInstanceUi}
      showResponsavelAtendimento={props.showResponsavelAtendimento}
      tzVersion={props.tzVersion}
      dayKey={props.dayKey}
    />
  );
}

const ChatListRows = memo(function ChatListRows({
  chatsFiltrados,
  chatsLayoutKey,
  isMobileLayout,
  scrollRef,
  scrollSaveRef,
  scrollTopNoncePrevRef,
  chatListScrollToTopNonce,
  onSelect,
  onOpenClienteSemConversa,
  currentUserId,
  currentUserName,
  openConversationId,
  onToggleMenu,
  pendentesFuncionarioSet,
  showResponsavelAtendimento = false,
}) {
  const showWhatsappInstanceUi = useWhatsappInstancesStore((s) => s.hasMultiple);
  // Troca de estado da empresa (Configurações → Geral) muda o fuso de TODA hora exibida.
  // As linhas são memoizadas: sem esta prop elas continuariam com o horário antigo.
  const tzVersion = useCompanyTimezoneVersion();
  const showAssigneeNames = useEmpresaStore((s) => s.empresa?.exibir_atendentes_no_card === true);
  // Modo simples (visual WhatsApp): linhas coladas, altura fixa — ver chatList.whatsapp.css.
  const modoSimples = useAuthStore((s) => s.user?.atendimento_modo_simples === true);
  const mobileSelectedId = useConversaStore((s) => (isMobileLayout ? s.selectedId : null));
  const selectedIdHighlight = useConversaStore((s) => (isMobileLayout ? null : s.selectedId));
  const mobileConversaAberta = isMobileLayout && mobileSelectedId != null;
  // Modo atual lido do último commit (escrito num layout effect, nunca no render).
  const virtualModeRef = useRef(null);
  const listLen = chatsFiltrados.length;
  const useVirtual = virtualModeRef.current
    ? listLen >= CHAT_LIST_VIRTUAL_EXIT_THRESHOLD
    : listLen >= CHAT_LIST_VIRTUAL_THRESHOLD;

  const [minuteTick, setMinuteTick] = useState(() => Date.now());
  useEffect(() => {
    const ms = 60000 - (Date.now() % 60000) + 25;
    let intervalId;
    const timeoutId = setTimeout(() => {
      setMinuteTick(Date.now());
      intervalId = setInterval(() => setMinuteTick(Date.now()), 60000);
    }, ms);
    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // Dia civil corrente no fuso da empresa. Muda à meia-noite (pelo minuteTick) ou ao trocar
  // o fuso: as linhas repintam o rótulo "14:05" → "Ontem" → "Seg" (chatListTimeLabel.js).
  // `tzVersion` nas deps de propósito: companyDayKey lê o fuso global.
  const dayKey = useMemo(() => companyDayKey(new Date(minuteTick)), [minuteTick, tzVersion]);

  const onToggleMenuRef = useRef(onToggleMenu);
  onToggleMenuRef.current = onToggleMenu;
  const stableOnToggleMenu = useCallback((conversationId, triggerEl) => {
    onToggleMenuRef.current?.(conversationId, triggerEl);
  }, []);

  const rowProps = useMemo(
    () => ({
      onSelect,
      onOpenClienteSemConversa,
      currentUserId,
      currentUserName,
      openConversationId,
      onToggleMenu: stableOnToggleMenu,
      pendentesFuncionarioSet,
      minuteTick,
      showWhatsappInstanceUi,
      showResponsavelAtendimento,
      tzVersion,
      dayKey,
    }),
    [
      onSelect,
      onOpenClienteSemConversa,
      currentUserId,
      currentUserName,
      openConversationId,
      stableOnToggleMenu,
      pendentesFuncionarioSet,
      minuteTick,
      showWhatsappInstanceUi,
      showResponsavelAtendimento,
      tzVersion,
      dayKey,
    ]
  );

  const prevMobileSelectedRef = useRef(mobileSelectedId);

  /*
   * A lista estima a altura (sem measureElement). ATENÇÃO: trocar a identidade de
   * `estimateSize` NÃO re-mede nada no @tanstack/virtual-core 3.14 — o memo de
   * `getMeasurements` só depende de count/paddingStart/scrollMargin/getItemKey/enabled/lanes
   * e do `itemSizeCache`. Mudar `chatsFiltrados` re-mede por tabela (troca `getItemKey`); o
   * resto do que o estimador lê (etiquetas do WhatsApp, layout mobile, modo simples,
   * responsável, instâncias, pendentes) precisa do `virtualizer.measure()` explícito no
   * layout effect logo abaixo — sem ele a linha ficava cortada ou com buraco até o próximo
   * evento que mexesse na lista.
   */
  const waLabelsByConversa = useWhatsappLabelsStore((s) => s.byConversa);
  const estimateRowSize = useCallback(
    (index) =>
      estimateChatListRowSize(
        chatsFiltrados[index],
        isMobileLayout,
        pendentesFuncionarioSet,
        showAssigneeNames && showResponsavelAtendimento,
        showResponsavelAtendimento,
        modoSimples
      ),
    [chatsFiltrados, isMobileLayout, pendentesFuncionarioSet, showAssigneeNames, showResponsavelAtendimento, modoSimples]
  );

  // Identidade estável: getItemKey entra nas deps do memo de medidas do virtualizador
  // (@tanstack/virtual-core). Uma arrow inline nova a cada render invalidava o memo e
  // re-estimava TODAS as linhas em cada render (scroll, minuteTick, socket).
  const getItemKey = useCallback(
    (index) => {
      const c = chatsFiltrados[index];
      if (!c) return `row-${index}`;
      return chatRowStableKey(c);
    },
    [chatsFiltrados]
  );

  const virtualizer = useVirtualizer({
    count: chatsFiltrados.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimateRowSize,
    gap: CHAT_LIST_ROW_GAP,
    overscan: isMobileLayout ? 4 : 10,
    scrollPaddingStart: 4,
    scrollPaddingEnd: 8,
    /* Mobile: adia remeasure após o dedo soltar — reduz thrash sem desativar medição real. */
    isScrollingResetDelay: isMobileLayout ? 220 : 150,
    getItemKey,
  });
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  /** Algum layout effect deste commit já escreveu o scrollTop (topo por nonce / volta do mobile). */
  const scrollAppliedThisCommitRef = useRef(false);
  /** `virtualizer.measure()` foi chamado neste commit — posições mudaram sem a lista mudar. */
  const measuredThisCommitRef = useRef(false);

  // Re-medir quando muda o que o estimador lê fora de `chatsFiltrados` (ver comentário do
  // `estimateRowSize`). Pula a montagem: o primeiro cálculo já usa os valores atuais.
  const measureMountedRef = useRef(false);
  useLayoutEffect(() => {
    if (!measureMountedRef.current) {
      measureMountedRef.current = true;
      return;
    }
    measuredThisCommitRef.current = true;
    virtualizer.measure();
  }, [
    virtualizer,
    isMobileLayout,
    pendentesFuncionarioSet,
    showAssigneeNames,
    showResponsavelAtendimento,
    waLabelsByConversa,
    modoSimples,
    showWhatsappInstanceUi,
  ]);

  /*
   * Aplica a posição ANTES do paint e repete no frame seguinte. Antes era só
   * `requestAnimationFrame`: ao voltar da conversa no mobile a lista aparecia um frame
   * inteiro no topo e só depois saltava para onde o atendente estava — o "pulo" ao usar o
   * voltar do aparelho. O frame extra fica como rede de segurança, para o caso de a altura
   * do virtualizador ainda não estar assente quando a coluna deixa de estar `display:none`.
   */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    const aplicarScroll = (top, marcarCommit = true) => {
      const alvo = scrollRef.current;
      if (alvo) alvo.scrollTop = top;
      // A âncora de reordenação (efeito seguinte) não pode desfazer esta posição. O reforço
      // do rAF corre fora do commit e não marca nada (senão pularia a âncora do próximo).
      if (marcarCommit) scrollAppliedThisCommitRef.current = true;
    };

    const n = chatListScrollToTopNonce;
    if (n !== scrollTopNoncePrevRef.current) {
      scrollTopNoncePrevRef.current = n;
      prevMobileSelectedRef.current = mobileSelectedId;
      if (n > 0) {
        scrollSaveRef.current = 0;
        aplicarScroll(0);
        const frame = requestAnimationFrame(() => aplicarScroll(0, false));
        return () => cancelAnimationFrame(frame);
      }
      return undefined;
    }

    const prevMobile = prevMobileSelectedRef.current;
    prevMobileSelectedRef.current = mobileSelectedId;

    /* Só restaura scroll ao voltar da conversa no mobile — não a cada update da lista. */
    if (isMobileLayout && prevMobile != null && mobileSelectedId == null) {
      const saved = scrollSaveRef.current;
      aplicarScroll(saved);
      const frame = requestAnimationFrame(() => aplicarScroll(saved, false));
      return () => cancelAnimationFrame(frame);
    }

    return undefined;
  }, [
    chatListScrollToTopNonce,
    mobileSelectedId,
    isMobileLayout,
    scrollRef,
    scrollSaveRef,
    scrollTopNoncePrevRef,
  ]);

  /*
   * ÂNCORA DE SCROLL NA REORDENAÇÃO.
   *
   * Uma mensagem nova faz `sortChatListByRecent` subir o card para o topo: todos os índices
   * acima do lugar antigo andam uma linha e o TanStack não compensa (e o `.chat-list-scroll`
   * tem `overflow-anchor: none`, logo o browser também não). Quem rolava no meio via a lista
   * "andar" sob o dedo e podia clicar na conversa errada.
   *
   * Guardamos, a cada commit e a cada scroll, a chave e o deslocamento no viewport das
   * primeiras linhas visíveis; quando a lista (ou as alturas estimadas) muda, devolvemos o
   * `scrollTop` para que a mesma linha fique no mesmo pixel. No topo (scrollTop ≈ 0) não se
   * mexe: o card novo aparece em cima, como no WhatsApp.
   *
   * Referencial: o virtualizador corre com `scrollMargin` 0, e as linhas são pintadas em
   * `translateY(start)` dentro de `.chat-list-rows-virtual-inner`, que está em `innerOffset`
   * (padding do scroller) no conteúdo rolável. Logo: topo real = innerOffset + start. Fora do
   * modo virtual as linhas estão em fluxo e lemos o DOM. Escrevemos o `scrollTop` direto,
   * sem `scrollToIndex` (ver doc 14 sobre o laço de reconcile da v3.14).
   */
  const innerRef = useRef(null);
  const rowsRef = useRef(null);
  const anchorRef = useRef(null);
  const innerOffsetRef = useRef(0);
  const prevAnchorListRef = useRef(null);
  const prevAnchorModeRef = useRef(null);
  const anchorStateRef = useRef({ useVirtual, hidden: mobileConversaAberta, chatsFiltrados });
  anchorStateRef.current = { useVirtual, hidden: mobileConversaAberta, chatsFiltrados };

  /** Chaves das linhas no DOM do modo não virtual, na ordem dos filhos de `.chat-list-rows`. */
  const domRowKeys = useMemo(
    () => (useVirtual ? null : chatsFiltrados.filter(isRenderableChatRow).map(chatRowStableKey)),
    [useVirtual, chatsFiltrados]
  );
  const domRowKeysRef = useRef(domRowKeys);
  domRowKeysRef.current = domRowKeys;

  const captureScrollAnchor = useCallback(() => {
    const el = scrollRef.current;
    const st = anchorStateRef.current;
    if (!el || st.hidden) return;
    const top = el.scrollTop;
    const items = [];
    if (st.useVirtual) {
      // getMeasurements é memoizado: devolve o cache, ou recalcula se houve measure().
      const v = virtualizerRef.current;
      const ms = (typeof v?.getMeasurements === "function" ? v.getMeasurements() : v?.measurementsCache) || [];
      const innerOffset = innerOffsetRef.current;
      // Primeira linha cujo fim passa do topo do viewport (busca binária: lista grande).
      let lo = 0;
      let hi = ms.length - 1;
      let first = ms.length;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (innerOffset + (ms[mid]?.end ?? 0) > top) {
          first = mid;
          hi = mid - 1;
        } else {
          lo = mid + 1;
        }
      }
      for (let i = first; i < ms.length && items.length < SCROLL_ANCHOR_CANDIDATES; i++) {
        const m = ms[i];
        if (!m) break;
        items.push({ key: m.key, index: i, offset: innerOffset + m.start - top });
      }
    } else {
      const rowsEl = rowsRef.current;
      const keys = domRowKeysRef.current;
      if (!rowsEl || !keys || rowsEl.children.length !== keys.length) {
        anchorRef.current = null;
        return;
      }
      for (let i = 0; i < keys.length && items.length < SCROLL_ANCHOR_CANDIDATES; i++) {
        const node = rowsEl.children[i];
        const t = contentTopOf(el, node);
        if (!items.length && t + node.offsetHeight <= top) continue;
        items.push({ key: keys[i], index: i, offset: t - top });
      }
    }
    anchorRef.current = items.length ? { scrollTop: top, items } : null;
  }, [scrollRef]);

  // Scroll do utilizador → âncora atualizada (passivo; leitura barata, sem escrita).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    el.addEventListener("scroll", captureScrollAnchor, { passive: true });
    return () => el.removeEventListener("scroll", captureScrollAnchor);
  }, [scrollRef, captureScrollAnchor]);

  // Corre em TODO commit, depois do efeito de scroll acima (a ordem de declaração importa).
  useLayoutEffect(() => {
    virtualModeRef.current = useVirtual;
    const el = scrollRef.current;
    const listChanged = prevAnchorListRef.current !== null && prevAnchorListRef.current !== chatsFiltrados;
    const modeChanged = prevAnchorModeRef.current !== null && prevAnchorModeRef.current !== useVirtual;
    const measured = measuredThisCommitRef.current;
    const scrollApplied = scrollAppliedThisCommitRef.current;
    prevAnchorListRef.current = chatsFiltrados;
    prevAnchorModeRef.current = useVirtual;
    measuredThisCommitRef.current = false;
    scrollAppliedThisCommitRef.current = false;
    if (!el || mobileConversaAberta) return;

    if (useVirtual && innerRef.current) {
      innerOffsetRef.current = contentTopOf(el, innerRef.current);
    }

    const anchor = anchorRef.current;
    if (
      (listChanged || modeChanged || measured) &&
      !scrollApplied &&
      anchor &&
      anchor.scrollTop > SCROLL_ANCHOR_AT_TOP_PX &&
      // Alguém já mexeu no scroll fora daqui (ex.: troca de filtro zerou): não desfazer.
      Math.abs(el.scrollTop - anchor.scrollTop) <= 1
    ) {
      const wanted = new Set(anchor.items.map((it) => it.key));
      const lookup = new Map();
      if (useVirtual) {
        const ms = virtualizer.getMeasurements();
        const innerOffset = innerOffsetRef.current;
        for (let i = 0; i < ms.length && lookup.size < wanted.size; i++) {
          const m = ms[i];
          if (m && wanted.has(m.key)) lookup.set(m.key, { index: i, top: innerOffset + m.start });
        }
      } else if (rowsRef.current && domRowKeys && rowsRef.current.children.length === domRowKeys.length) {
        for (let i = 0; i < domRowKeys.length && lookup.size < wanted.size; i++) {
          if (wanted.has(domRowKeys[i])) {
            lookup.set(domRowKeys[i], { index: i, top: contentTopOf(el, rowsRef.current.children[i]) });
          }
        }
      }
      const pick = pickAnchorHit(anchor.items, lookup);
      if (pick) {
        const target = Math.max(0, pick.hit.top - pick.cand.offset);
        if (Math.abs(target - el.scrollTop) >= 1) el.scrollTop = target;
      }
    }
    captureScrollAnchor();
  });

  const rowsClassName = mobileConversaAberta
    ? "chat-list-rows chat-list-rows--conversa-aberta"
    : useVirtual
      ? "chat-list-rows chat-list-rows--virtual"
      : "chat-list-rows";

  if (useVirtual) {
    const virtualItems = virtualizer.getVirtualItems();
    return (
      <div ref={rowsRef} className={rowsClassName} aria-hidden={mobileConversaAberta ? true : undefined}>
        <div
          ref={innerRef}
          className="chat-list-rows-virtual-inner"
          style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}
        >
          {virtualItems.map((virtualRow) => {
            const c = chatsFiltrados[virtualRow.index];
            if (!c) return null;
            // key === getItemKey — evita reuso do DOM do avatar no bump ao enviar.
            const slotKey = virtualRow.key;
            return (
              <div
                key={slotKey}
                data-index={virtualRow.index}
                className="chat-list-row-virtual-slot"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {renderChatListRow(c, selectedIdHighlight, rowProps)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={rowsRef} className={rowsClassName} aria-hidden={mobileConversaAberta ? true : undefined}>
      {chatsFiltrados.map((c) => renderChatListRow(c, selectedIdHighlight, rowProps))}
    </div>
  );
}, (prev, next) => {
  return (
  prev.chatsFiltrados === next.chatsFiltrados &&
  prev.chatsLayoutKey === next.chatsLayoutKey &&
  prev.isMobileLayout === next.isMobileLayout &&
  prev.scrollRef === next.scrollRef &&
  prev.scrollSaveRef === next.scrollSaveRef &&
  prev.scrollTopNoncePrevRef === next.scrollTopNoncePrevRef &&
  prev.chatListScrollToTopNonce === next.chatListScrollToTopNonce &&
  prev.onSelect === next.onSelect &&
  prev.onOpenClienteSemConversa === next.onOpenClienteSemConversa &&
  prev.currentUserId === next.currentUserId &&
  prev.currentUserName === next.currentUserName &&
  prev.openConversationId === next.openConversationId &&
  prev.onToggleMenu === next.onToggleMenu &&
  prev.pendentesFuncionarioSet === next.pendentesFuncionarioSet &&
  prev.showResponsavelAtendimento === next.showResponsavelAtendimento
  );
});

export default ChatListRows;
