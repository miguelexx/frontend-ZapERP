import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buscarMensagensNaConversa } from "../conversaService";
import { IconClose, IconSearch } from "../conversaViewIcons";
import { formatDiaRelativo, formatHoraCurta, safeString } from "../utils/conversaViewHelpers";
import { useConversaStore } from "../conversaStore";
import { getDisplayName } from "../../chats/chatListDisplay";
import { isGroupConversation } from "../../utils/conversaUtils";
import { useMobileOverlayBack } from "../../atendimento/useMobileOverlayBack";
import "./conversaSearchPanel.css";

const SEARCH_DEBOUNCE_MS = 320;
const SEARCH_PAGE_LIMIT = 30;

/*
 * Painel encaixado como COLUNA (26/11/2026, C3) — como o WhatsApp Web. Flutuando por cima da
 * thread ele tapava as bolhas ENVIADAS (alinhadas à direita: a "Msg 60" ficava 63% escondida
 * sob o painel) e o composer inteiro. Encaixa quando a janela tem ≥1024px E a coluna da
 * conversa tem largura para ficar com ≥440px de mensagens ao lado do painel (320–400px, ver
 * conversaSearchPanel.css). Abaixo disso continua sobreposto, fecha ao escolher um resultado
 * (como no celular) e não cobre mais o composer.
 * A decisão é medida aqui e vira a classe `--dock`; quem estreita a thread é o CSS, por
 * `.wa-shell:has(> .wa-msgSearchPanel--dock)` — o ConversaView não precisa saber de nada.
 */
const DOCK_MEDIA = "(min-width: 1024px)";
const DOCK_PANEL_MIN_PX = 320;
const DOCK_MESSAGES_MIN_PX = 440;

function matchesMedia(query) {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/*
 * Encaixar depende de `:has()` — é ele que estreita a thread e o composer
 * (`.wa-shell:has(> .wa-msgSearchPanel--dock)`). Sem suporte (Firefox <121, Safari <15.4) a
 * classe `--dock` virava um painel sem largura definida POR CIMA da thread e do composer, e
 * ainda ficava aberto depois de escolher. Sem `:has()` o painel fica sobreposto (R5-09).
 */
let hasSelectorSupport = null;
function supportsHasSelector() {
  if (hasSelectorSupport !== null) return hasSelectorSupport;
  try {
    hasSelectorSupport =
      typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("selector(:has(*))") === true;
  } catch {
    hasSelectorSupport = false;
  }
  return hasSelectorSupport;
}

/* "Hoje" / "Ontem" / "Segunda-feira" / "03/11/2026" — fuso da empresa, como o resto da tela. */
function formatSearchDate(value) {
  return formatDiaRelativo(value);
}

/**
 * Nome do contato da conversa INDIVIDUAL aberta, para assinar as mensagens recebidas
 * (27/11/2026, A1-15): numa conversa 1:1 a mensagem não traz `remetente_nome` e o resultado
 * dizia "Contato". Grupo devolve "" — lá cada mensagem traz o participante.
 */
function contactNameOfConversa(conversa, conversaId) {
  if (!conversa || conversaId == null || String(conversa.id ?? "") !== String(conversaId)) return "";
  if (isGroupConversation(conversa)) return "";
  const nome = safeString(getDisplayName(conversa));
  if (!nome || nome === "Contato" || nome.toLowerCase().startsWith("lid:")) return "";
  return nome;
}

/**
 * Dobra acento e caixa CARÁCTER A CARÁCTER, guardando de onde veio cada posição dobrada —
 * para achar "orcamento" em "Orçamento" e marcar o trecho ORIGINAL (26/11/2026, C8).
 * Marca combinante solta (texto já decomposto) cola-se ao carácter anterior.
 */
function foldWithMap(text) {
  let norm = "";
  const starts = [];
  const ends = [];
  let i = 0;
  for (const ch of text) {
    const folded = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (!folded) {
      if (ends.length) ends[ends.length - 1] = i + ch.length;
    } else {
      for (let k = 0; k < folded.length; k += 1) {
        starts.push(i);
        ends.push(i + ch.length);
      }
      norm += folded;
    }
    i += ch.length;
  }
  return { norm, starts, ends };
}

function foldQuery(q) {
  return safeString(q).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function highlightedText(text, query) {
  const raw = safeString(text);
  const q = foldQuery(query).trim();
  if (!raw) return "(mensagem sem texto)";
  if (!q) return raw;
  const { norm, starts, ends } = foldWithMap(raw);
  const parts = [];
  let from = 0;
  let cursor = 0;
  while (from <= norm.length - q.length) {
    const hit = norm.indexOf(q, from);
    if (hit < 0) break;
    const a = starts[hit];
    const b = ends[hit + q.length - 1];
    if (a > cursor) parts.push(<span key={`t${cursor}`}>{raw.slice(cursor, a)}</span>);
    parts.push(
      <mark key={`m${a}`} className="wa-msgSearch-match">
        {raw.slice(a, b)}
      </mark>
    );
    cursor = b;
    from = hit + q.length;
  }
  if (!parts.length) return raw;
  if (cursor < raw.length) parts.push(<span key={`t${cursor}`}>{raw.slice(cursor)}</span>);
  return parts;
}

function resultSenderLabel(msg, contactName) {
  if (msg?.direcao === "out") return safeString(msg?.usuario_nome) || "Atendente";
  if (msg?.direcao === "interna") return safeString(msg?.usuario_nome) || "Nota interna";
  // Conversa individual: o mesmo nome do cabeçalho, não o pushname de cada mensagem.
  if (contactName) return contactName;
  return safeString(msg?.remetente_nome) || safeString(msg?.remetente_telefone) || "Contato";
}

/**
 * Texto de erro para o atendente — NUNCA o `err.message` do axios ("Network Error").
 * 4xx com `error` do backend é mensagem nossa, em português (permissão, conversa de outro).
 */
function searchErrorMessage(err) {
  const status = Number(err?.response?.status) || 0;
  const apiMsg = err?.response?.data?.error;
  if (status >= 400 && status < 500 && typeof apiMsg === "string" && apiMsg.trim() && apiMsg.length <= 160) {
    return apiMsg.trim();
  }
  if (!err?.response) return "Não foi possível pesquisar. Verifique a conexão e tente de novo.";
  return "Não foi possível pesquisar agora. Tente de novo em instantes.";
}

function resultCountLabel(n, hasMore) {
  if (hasMore) return `Mais de ${n} resultados`;
  return n === 1 ? "1 resultado" : `${n} resultados`;
}

/**
 * @param {{ open: boolean, conversaId: any, onClose: Function, onSelectResult: Function, contactName?: string }} props
 *   `contactName` (opcional): nome do contato de uma conversa individual; sem ele o painel
 *   lê da conversa aberta na store.
 */
function ConversaMessageSearchPanel({ open, conversaId, onClose, onSelectResult, contactName: contactNameProp }) {
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const abortRef = useRef(null);
  const requestSeqRef = useRef(0);
  const lastRequestRef = useRef({ append: false });
  const selectFirstWhenReadyRef = useRef(false);
  /* Termo da última busca que FECHOU o painel ao escolher um resultado (sobreposto/celular):
     reabrir na mesma conversa devolve o termo, em vez de obrigar a digitar de novo. */
  const reopenQueryRef = useRef(null);
  const baseId = useId();
  const listId = `${baseId}-lista`;

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState([]);
  const [resultsQuery, setResultsQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [nextCursorId, setNextCursorId] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [docked, setDocked] = useState(false);
  const [overlayBottom, setOverlayBottom] = useState(null);

  // String (comparação por valor): só re-renderiza se o NOME mudar. Fechado não calcula nada.
  const storeContactName = useConversaStore((s) => (open ? contactNameOfConversa(s.conversa, conversaId) : ""));
  const contactName = safeString(contactNameProp) || storeContactName;

  /*
   * Celular: o painel é ecrã inteiro por cima da thread. O "voltar" do Android fecha a BUSCA,
   * não a conversa (R5-04 / A2-04). Fechar pelo X, Esc ou ao escolher um resultado consome a
   * entrada sozinho (o hook só age ≤640px; desktop e encaixe não mexem no histórico).
   */
  useMobileOverlayBack(Boolean(open), onClose, "msgSearch");

  /* Debounce próprio (não o hook genérico) para o Enter poder ADIANTAR a busca. */
  useEffect(() => {
    if (query === debouncedQuery) return undefined;
    const t = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, debouncedQuery]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus?.(), 80);
    return () => window.clearTimeout(t);
  }, [open]);

  /*
   * Esc (R5-03 / R6-05). NÃO há mais ouvinte na `window`: ele corria antes do de
   * useGlobalHotkeys e fechava a busca por baixo de resposta, edição, seleção, Dados da
   * mensagem, Encaminhar… — contra ESCAPE_PANEL_ORDER, em que a busca é a ÚLTIMA camada.
   * Com o foco FORA do painel, a cadeia global fecha o que estiver por cima e só depois a
   * busca. Com o foco DENTRO do painel (campo, X, limpar), o Esc é do painel: fecha a busca
   * aqui e o stopPropagation do React impede a cadeia global de fechar mais uma camada.
   */
  const handlePanelKeyDown = useCallback(
    (e) => {
      if (e.key !== "Escape" || e.nativeEvent?.isComposing) return;
      // Um modal em captura já tratou este Esc: a busca não fecha junto (uma camada por Esc).
      if (e.nativeEvent?.defaultPrevented) return;
      /*
       * Encaixado, com um painel aberto POR CIMA da thread e o foco ainda aqui — o Ctrl+H abre
       * o Histórico sem tirar o foco do campo: o Esc é desse painel. Sem stopPropagation, a
       * cadeia global (ESCAPE_PANEL_ORDER) fecha o Histórico / Dados do contato e só depois a
       * busca. Sobreposto não se aplica: aí é a busca que está por cima deles.
       */
      if (docked) {
        const shell = panelRef.current?.closest?.(".wa-shell");
        if (shell?.querySelector?.(":scope > .wa-timeline, :scope > .wa-sideCliente")) return;
      }
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    },
    [docked, onClose]
  );

  // Layout effect: ao reabrir, o termo restaurado já está no 1.º quadro (sem piscar vazio).
  useLayoutEffect(() => {
    if (!open) {
      abortRef.current?.abort?.();
      selectFirstWhenReadyRef.current = false;
      setQuery("");
      setDebouncedQuery("");
      setResults([]);
      setResultsQuery("");
      setError(null);
      setNextCursor(null);
      setNextCursorId(null);
      setHasMore(false);
      setActiveIndex(-1);
      return;
    }
    const memo = reopenQueryRef.current;
    reopenQueryRef.current = null;
    if (memo && String(memo.conversaId) === String(conversaId ?? "") && memo.query) {
      setQuery(memo.query);
      setDebouncedQuery(memo.query);
    }
    // conversaId fora das deps de propósito: só a ABERTURA restaura o termo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /*
   * Encaixe (C3). Mede a coluna da conversa (`.wa-shell`), não a janela: a lista de conversas
   * come uma parte variável da largura. Medir o shell não realimenta — o encaixe muda o
   * espaço INTERNO dele (margens dos filhos), não a largura do próprio shell.
   * Layout effect: o 1.º quadro do painel já sai encaixado, sem piscar sobreposto.
   */
  useLayoutEffect(() => {
    if (!open) {
      setDocked(false);
      return undefined;
    }
    const panel = panelRef.current;
    const shell = panel?.parentElement?.closest?.(".wa-shell") || panel?.closest?.(".wa-shell");
    if (!shell) return undefined;
    const decide = () => {
      const width = shell.clientWidth || 0;
      const panelW = Math.min(400, Math.max(DOCK_PANEL_MIN_PX, width * 0.32));
      setDocked(supportsHasSelector() && matchesMedia(DOCK_MEDIA) && width - panelW >= DOCK_MESSAGES_MIN_PX);
    };
    decide();
    let ro = null;
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(() => decide());
      ro.observe(shell);
    }
    const mq = typeof window.matchMedia === "function" ? window.matchMedia(DOCK_MEDIA) : null;
    mq?.addEventListener?.("change", decide);
    return () => {
      ro?.disconnect();
      mq?.removeEventListener?.("change", decide);
    };
  }, [open]);

  /*
   * Sobreposto acima do celular (641px+): o painel acaba ACIMA do composer, que continua à
   * vista e utilizável com a busca aberta (antes Enviar/Gravar ficavam tapados).
   */
  useLayoutEffect(() => {
    if (!open || docked || matchesMedia("(max-width: 640px)")) {
      setOverlayBottom(null);
      return undefined;
    }
    const shell = panelRef.current?.closest?.(".wa-shell");
    const stack = shell?.querySelector?.(":scope > .wa-composerStack");
    if (!stack) return undefined;
    const sync = () => setOverlayBottom(Math.round(stack.getBoundingClientRect().height || 0));
    sync();
    let ro = null;
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(sync);
      ro.observe(stack);
    }
    return () => ro?.disconnect();
  }, [open, docked]);

  const runSearch = useCallback(
    async ({ append = false, cursor = null, cursorId = null } = {}) => {
      const q = safeString(debouncedQuery);
      abortRef.current?.abort?.();
      const abortController = new AbortController();
      abortRef.current = abortController;
      const seq = ++requestSeqRef.current;
      lastRequestRef.current = { append, cursor, cursorId };

      if (!open || !conversaId || !q) {
        setResults([]);
        setResultsQuery("");
        setError(null);
        setNextCursor(null);
        setNextCursorId(null);
        setHasMore(false);
        setLoading(false);
        setLoadingMore(false);
        setActiveIndex(-1);
        return;
      }

      // Os resultados anteriores FICAM na tela (esmaecidos) enquanto a busca refinada não volta.
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const data = await buscarMensagensNaConversa(conversaId, {
          q,
          cursor,
          cursorId,
          limit: SEARCH_PAGE_LIMIT,
          signal: abortController.signal,
        });
        if (seq !== requestSeqRef.current) return;
        const page = Array.isArray(data?.resultados) ? data.resultados : [];
        setResults((prev) => (append ? [...prev, ...page] : page));
        setResultsQuery(q);
        if (!append) setActiveIndex(-1);
        setNextCursor(data?.next_cursor || null);
        setNextCursorId(data?.next_cursor_id ?? null);
        setHasMore(Boolean(data?.has_more && data?.next_cursor));
      } catch (err) {
        if (err?.name === "CanceledError" || err?.name === "AbortError") return;
        if (seq !== requestSeqRef.current) return;
        selectFirstWhenReadyRef.current = false;
        if (!append) {
          // Resultados de OUTRO termo não podem ficar à vista como se fossem deste.
          setResults([]);
          setResultsQuery("");
          setHasMore(false);
          setActiveIndex(-1);
        }
        setError({ append, message: searchErrorMessage(err) });
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [conversaId, debouncedQuery, open]
  );

  useEffect(() => {
    runSearch({ append: false });
    return () => abortRef.current?.abort?.();
  }, [runSearch]);

  const retry = useCallback(() => {
    const last = lastRequestRef.current || {};
    runSearch(last.append ? last : { append: false });
  }, [runSearch]);

  const selectResult = useCallback(
    (msg, index) => {
      if (!msg) return;
      if (typeof index === "number") setActiveIndex(index);
      // Fecha ao escolher quando NÃO está encaixado (sobreposto ou celular): guarda o termo.
      if (!docked) reopenQueryRef.current = { conversaId, query: safeString(query) };
      onSelectResult?.(msg, { docked });
    },
    [conversaId, docked, onSelectResult, query]
  );

  /* Enter antes do debounce: a busca do termo atual sai já e o 1.º resultado abre quando chegar. */
  useEffect(() => {
    if (!selectFirstWhenReadyRef.current || loading) return;
    if (safeString(resultsQuery) !== safeString(debouncedQuery) || !safeString(debouncedQuery)) return;
    selectFirstWhenReadyRef.current = false;
    if (results.length) selectResult(results[0], 0);
  }, [debouncedQuery, loading, results, resultsQuery, selectResult]);

  const scrollActiveIntoView = useCallback((index) => {
    const list = resultsRef.current;
    const item = list?.querySelector?.(`[data-result-index="${index}"]`);
    if (!list || !item) return;
    // Sem scrollIntoView: ele também rolaria o shell (overflow hidden ainda é rolável).
    const lr = list.getBoundingClientRect();
    const ir = item.getBoundingClientRect();
    if (ir.top < lr.top) list.scrollTop -= lr.top - ir.top + 4;
    else if (ir.bottom > lr.bottom) list.scrollTop += ir.bottom - lr.bottom + 4;
  }, []);

  const handleInputKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        /*
         * Lista velha (termo ainda no debounce ou a caminho): as setas não andam sobre ela —
         * o Enter abriria o 1.º resultado do termo NOVO, não o destacado (R5-07). Sem
         * preventDefault: o cursor só anda no campo. As setas voltam quando o termo chega.
         */
        const typed = safeString(query);
        if (!results.length || !typed || safeString(resultsQuery) !== typed) return;
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        const current = activeIndex >= 0 && activeIndex < results.length ? activeIndex : step > 0 ? -1 : results.length;
        const next = Math.min(results.length - 1, Math.max(0, current + step));
        setActiveIndex(next);
        window.requestAnimationFrame(() => scrollActiveIntoView(next));
        return;
      }
      if (e.key === "Enter") {
        if (e.nativeEvent?.isComposing) return;
        e.preventDefault();
        const typed = safeString(query);
        if (!typed) return;
        const stale = typed !== safeString(debouncedQuery) || safeString(resultsQuery) !== typed;
        if (stale) {
          selectFirstWhenReadyRef.current = true;
          // Termo igual ao que falhou: setDebouncedQuery não mudaria nada — tenta de novo já.
          if (error && !error.append && typed === safeString(debouncedQuery)) retry();
          else setDebouncedQuery(query);
          return;
        }
        if (!results.length) return;
        const index = activeIndex >= 0 && activeIndex < results.length ? activeIndex : 0;
        selectResult(results[index], index);
      }
    },
    [activeIndex, debouncedQuery, error, query, results, resultsQuery, retry, scrollActiveIntoView, selectResult]
  );

  const typedQuery = safeString(query);
  const hasQuery = typedQuery.length > 0;
  const pending = hasQuery && typedQuery !== safeString(debouncedQuery);
  const busy = loading || pending;
  const showResults = hasQuery && results.length > 0;
  const stateLabel = useMemo(() => {
    if (!hasQuery) return "Digite uma palavra para pesquisar nesta conversa.";
    if (showResults) return "";
    if (error && !error.append) return error.message;
    if (busy) return "Pesquisando…";
    if (safeString(resultsQuery) === typedQuery) return "Nenhuma mensagem encontrada";
    return "Pesquisando…";
  }, [busy, error, hasQuery, resultsQuery, showResults, typedQuery]);

  if (!open) return null;

  const activeId = activeIndex >= 0 && activeIndex < results.length ? `${baseId}-r${activeIndex}` : undefined;
  const panelStyle = overlayBottom != null ? { "--wa-msgsearch-overlay-bottom": `${overlayBottom}px` } : undefined;

  return (
    <aside
      ref={panelRef}
      className={`wa-msgSearchPanel${docked ? " wa-msgSearchPanel--dock" : ""}`}
      style={panelStyle}
      role={docked ? "region" : "dialog"}
      aria-label="Pesquisar mensagens"
      onKeyDown={handlePanelKeyDown}
    >
      <div className="wa-msgSearch-head">
        <button type="button" className="wa-msgSearch-close" onClick={onClose} aria-label="Fechar busca" title="Fechar (Esc)">
          <IconClose />
        </button>
        <span className="wa-msgSearch-title">Pesquisar mensagens</span>
      </div>

      <div className="wa-msgSearch-box">
        <IconSearch />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            // Continuou a digitar depois do Enter: desiste de abrir o 1.º resultado sozinho.
            selectFirstWhenReadyRef.current = false;
            // O destaque das setas era da lista do termo anterior: some até o termo novo chegar.
            setActiveIndex(-1);
            setQuery(e.target.value);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="Pesquisar na conversa"
          autoComplete="off"
          enterKeyHint="search"
          aria-label="Pesquisar mensagens da conversa"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls={showResults ? listId : undefined}
          aria-activedescendant={activeId}
        />
        {query ? (
          <button
            type="button"
            className="wa-msgSearch-clear"
            onClick={() => {
              selectFirstWhenReadyRef.current = false;
              setActiveIndex(-1);
              setQuery("");
              inputRef.current?.focus?.();
            }}
            aria-label="Limpar busca"
          >
            <IconClose />
          </button>
        ) : null}
      </div>

      <div className={`wa-msgSearch-progress${busy && hasQuery ? " is-active" : ""}`} aria-hidden="true" />

      {showResults ? (
        <div className="wa-msgSearch-status" role="status" aria-live="polite">
          {busy ? "Pesquisando…" : resultCountLabel(results.length, hasMore)}
          {!busy && results.length > 1 ? <span className="wa-msgSearch-statusHint"> · ↑ ↓ e Enter para abrir</span> : null}
        </div>
      ) : null}

      <div
        ref={resultsRef}
        className={`wa-msgSearch-results${showResults && busy ? " is-refreshing" : ""}`}
        aria-busy={busy || undefined}
      >
        {stateLabel ? (
          <div className={`wa-msgSearch-state${error && !error.append && !showResults ? " isError" : ""}`} role="status" aria-live="polite">
            <span>{stateLabel}</span>
            {error && !error.append && !showResults ? (
              <button type="button" className="wa-msgSearch-retry" onClick={retry}>
                Tentar de novo
              </button>
            ) : null}
          </div>
        ) : (
          <div id={listId} className="wa-msgSearch-list" role="listbox" aria-label="Resultados da pesquisa">
            {results.map((msg, idx) => (
              <button
                key={msg.id}
                id={`${baseId}-r${idx}`}
                type="button"
                role="option"
                aria-selected={idx === activeIndex}
                tabIndex={-1}
                data-result-index={idx}
                className={`wa-msgSearch-result${idx === activeIndex ? " is-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectResult(msg, idx)}
              >
                <span className="wa-msgSearch-resultDate">{formatSearchDate(msg.criado_em)}</span>
                <span className="wa-msgSearch-resultText">{highlightedText(msg.texto, resultsQuery || debouncedQuery)}</span>
                <span className="wa-msgSearch-resultMeta">
                  {resultSenderLabel(msg, contactName)}
                  {formatHoraCurta(msg.criado_em) ? ` · ${formatHoraCurta(msg.criado_em)}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
        {showResults && error?.append ? (
          <div className="wa-msgSearch-state wa-msgSearch-state--inline isError" role="status">
            <span>{error.message}</span>
            <button type="button" className="wa-msgSearch-retry" onClick={retry}>
              Tentar de novo
            </button>
          </div>
        ) : null}
        {hasMore && showResults && !error ? (
          <button
            type="button"
            className="wa-msgSearch-more"
            onClick={() => runSearch({ append: true, cursor: nextCursor, cursorId: nextCursorId })}
            disabled={loadingMore || busy}
          >
            {loadingMore ? "Carregando…" : "Carregar mais resultados"}
          </button>
        ) : null}
      </div>
    </aside>
  );
}

export default memo(ConversaMessageSearchPanel);
