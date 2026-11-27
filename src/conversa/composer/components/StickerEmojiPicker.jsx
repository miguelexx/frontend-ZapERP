import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconEmoji, IconSticker } from "../../conversaComposerIcons";
import { campoDoComposer, isPonteiroFino } from "../../../atendimento/useDialogFocus";
import {
  EMOJI_CATEGORIES,
  pushRecentEmoji,
  readRecentEmojis,
  searchEmojis,
} from "../utils/emojiCatalog";

/**
 * Painel unificado de Emojis + Figurinhas no estilo do WhatsApp:
 * - topo: ícones das categorias (rolam até a seção; acompanham a rolagem)
 * - busca em pílula, por nome em português ("coração", "joinha", "rindo")
 * - corpo: seções com título ("Recentes", "Smileys e pessoas", ...)
 * - rodapé: alternador Emoji | Figurinhas
 *
 * A aba "Figurinhas" só aparece quando é possível enviar figurinha
 * (conversa ativa, fora de edição/nota).
 */

const SPY_LOCK_MS = 480;

/*
 * Primeira abertura sem travar (27/11/2026). As ~390 teclas de emoji eram montadas e
 * rasterizadas de uma vez (glifo colorido é caro na 1.ª pintura): ~620 ms de thread presa
 * antes de o painel aparecer. Agora o painel abre com o que cabe na tela (recentes + o
 * começo da 1.ª categoria) e o resto entra em fatias, nos intervalos ociosos. Pular para uma
 * categoria ainda não montada monta tudo antes de rolar.
 */
// ~uma tela de painel (10 colunas x 6-7 linhas); fatias pequenas mantêm cada tarefa perto de
// 50 ms (o glifo colorido de 28px custa ~1-1,5 ms na 1.ª pintura).
const EMOJI_BUDGET_INICIAL = 64;
const EMOJI_BUDGET_FATIA = 32;

function agendarOcioso(fn) {
  if (typeof window === "undefined") return () => {};
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: 160 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 32);
  return () => window.clearTimeout(id);
}

/*
 * Aquecimento dos glifos (27/11/2026). O grosso do custo da 1.ª abertura não é o React: é o
 * navegador achar a fonte de emoji e formar cada glifo colorido de 28px (cache por fonte e
 * tamanho; a 2.ª abertura é instantânea). O composer chama isto num momento ocioso: os emojis
 * são formados num bloco invisível fora da tela, poucos por janela ociosa, e o bloco sai do
 * DOM no fim. Uma vez por sessão da página.
 */
let glifosAquecidos = false;
export function aquecerGlifosEmoji() {
  if (glifosAquecidos || typeof document === "undefined" || !document.body) return;
  glifosAquecidos = true;
  let lista = [];
  try {
    lista = Array.from(new Set([...readRecentEmojis(), ...EMOJI_CATEGORIES.flatMap((c) => c.emojis)]));
  } catch {
    return;
  }
  const bloco = document.createElement("div");
  bloco.setAttribute("aria-hidden", "true");
  Object.assign(bloco.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "440px",
    visibility: "hidden",
    pointerEvents: "none",
    fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif',
    fontSize: "28px",
    lineHeight: "1",
  });
  document.body.appendChild(bloco);
  let i = 0;
  const passo = (deadline) => {
    let primeiro = true;
    while (i < lista.length && (primeiro || (deadline?.timeRemaining?.() ?? 0) > 8)) {
      primeiro = false;
      const fatia = lista.slice(i, i + 6);
      const linha = document.createElement("span");
      // Um emoji por "palavra": é a chave do cache de forma, igual a cada tecla do painel.
      linha.textContent = `${fatia.join(" ")} `;
      bloco.appendChild(linha);
      void bloco.offsetHeight; // forma os glifos AQUI, dentro da janela ociosa
      i += 6;
    }
    if (i < lista.length) agendarOcioso(passo);
    else bloco.remove();
  };
  agendarOcioso(passo);
}

const stroke = {
  viewBox: "0 0 24 24",
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

const CATEGORY_ICONS = {
  recent: (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  smileys: (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14s1.3 2 3.5 2 3.5-2 3.5-2" />
      <path d="M9.2 9.8h.01M14.8 9.8h.01" strokeWidth="2.4" />
    </svg>
  ),
  nature: (
    <svg {...stroke}>
      <path d="M7 6.5c0-1.4 1.1-2.5 2.5-2.5h5C15.9 4 17 5.1 17 6.5" />
      <circle cx="6.5" cy="7" r="2" />
      <circle cx="17.5" cy="7" r="2" />
      <path d="M5 13a7 7 0 0 1 14 0c0 3.9-3.1 6-7 6s-7-2.1-7-6Z" />
      <path d="M10 13h.01M14 13h.01" strokeWidth="2.4" />
      <path d="M11 16h2" />
    </svg>
  ),
  food: (
    <svg {...stroke}>
      <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Z" />
      <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8.5 3.5v2.5M11.5 3.5v2.5" />
    </svg>
  ),
  activities: (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.6 10.2c3.2.2 6.3 1.6 8.4 4.1 1.6 1.9 2.5 4 2.7 6.1" />
      <path d="M12.6 3.6c.3 3-.6 6-2.7 8.2-1.6 1.8-3.8 2.9-6 3.2" />
      <path d="M20.3 13.2c-2.6-1-5.5-.8-8 .7" />
    </svg>
  ),
  travel: (
    <svg {...stroke}>
      <path d="M5 16v-4l1.6-4.3A2 2 0 0 1 8.5 6.4h7a2 2 0 0 1 1.9 1.3L19 12v4" />
      <path d="M4 16.5h16v1.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1M7.5 18v.1A1 1 0 0 1 6.5 19H5a1 1 0 0 1-1-1v-1.5" />
      <path d="M5 12h14" />
      <path d="M7.5 14.3h.01M16.5 14.3h.01" strokeWidth="2.4" />
    </svg>
  ),
  objects: (
    <svg {...stroke}>
      <path d="M9 17h6M10 20h4" />
      <path d="M12 3.5a6 6 0 0 0-3.6 10.8c.4.3.6.8.6 1.3v1.4h6v-1.4c0-.5.2-1 .6-1.3A6 6 0 0 0 12 3.5Z" />
    </svg>
  ),
  symbols: (
    <svg {...stroke}>
      <path d="M8 4.5 6 11h3l-1.5 6" />
      <path d="M13.5 6h6M16.5 3.5v5" />
      <path d="M13 19.5 20 13" />
      <circle cx="14" cy="13.8" r=".9" />
      <circle cx="19" cy="18.8" r=".9" />
    </svg>
  ),
  flags: (
    <svg {...stroke}>
      <path d="M5.5 20.5V4.5" />
      <path d="M5.5 5c1.4-.9 2.9-1.2 4.5-.8 1.8.5 3 1.5 4.8 1.6 1.4.1 2.6-.2 3.7-.8v8.5c-1.1.6-2.3.9-3.7.8-1.8-.1-3-1.1-4.8-1.6-1.6-.4-3.1-.1-4.5.8" />
    </svg>
  ),
};

function SearchIcon() {
  return (
    <svg {...stroke} width={18} height={18}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg {...stroke} width={16} height={16} strokeWidth={2}>
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  );
}

const preventFocusSteal = (event) => event.preventDefault();

export default function StickerEmojiPicker(props) {
  if (props.isRecording || !props.open || typeof document === "undefined") return null;
  return createPortal(<PickerPanel {...props} />, document.body);
}

/*
 * Posição do painel no desktop (26/11/2026). Ele vai num portal para o body (o
 * `.atendimento-chat-area` tem `isolation: isolate`) com `left: 70px` fixo — a largura da barra
 * de navegação —, o que o desenhava em cima da LISTA de conversas, ~470px longe do botão. Agora
 * ancora no botão de emoji, preso à área da conversa, logo acima do composer. Celular (≤520px)
 * mantém as regras do CSS (esquerda/direita 10px acima do composer).
 */
function useAnchoredPanelPosition(panelRef, anchorRef) {
  useLayoutEffect(() => {
    const place = () => {
      const panel = panelRef?.current;
      if (!panel) return;
      const narrow = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 520px)").matches;
      const btn = anchorRef?.current;
      if (narrow || !btn) {
        panel.style.removeProperty("--wa-mp-left");
        panel.style.removeProperty("--wa-mp-bottom");
        return;
      }
      const b = btn.getBoundingClientRect();
      const stack = btn.closest(".wa-composerStack")?.getBoundingClientRect();
      const chat = btn.closest(".atendimento-chat-area")?.getBoundingClientRect();
      const width = panel.offsetWidth || 360;
      const minLeft = (chat?.left ?? 0) + 8;
      const maxLeft = Math.max(minLeft, window.innerWidth - width - 8);
      const left = Math.round(Math.min(maxLeft, Math.max(minLeft, b.left - 8)));
      const top = stack ? stack.top : b.top;
      const bottom = Math.round(Math.max(8, window.innerHeight - top + 8));
      panel.style.setProperty("--wa-mp-left", `${left}px`);
      panel.style.setProperty("--wa-mp-bottom", `${bottom}px`);
    };
    place();
    window.addEventListener("resize", place);
    const stackEl = anchorRef?.current?.closest?.(".wa-composerStack");
    const ro = stackEl && typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    ro?.observe(stackEl);
    return () => {
      window.removeEventListener("resize", place);
      ro?.disconnect();
    };
  }, [panelRef, anchorRef]);
}

function PickerPanel({
  panelRef,
  anchorRef,
  activeTab,
  onTabChange,
  canSendSticker,
  // emoji
  emojiSearchRef,
  emojiQuery,
  onEmojiQueryChange,
  onInsertEmoji,
  // sticker
  stickerSearchRef,
  stickerInputRef,
  stickerQuery,
  stickers,
  onStickerQueryChange,
  onSendStickerFile,
  showToast,
}) {
  const tab = canSendSticker ? activeTab : "emoji";
  useAnchoredPanelPosition(panelRef, anchorRef);

  /* Fechou com o foco dentro do painel (ESC na busca, por exemplo): no desktop o foco volta ao
     campo de mensagem — antes caía no <body> e o que se digitava sumia. Toque: nunca (abriria o
     teclado do celular). Layout effect: na desmontagem o painel ainda está no DOM. */
  useLayoutEffect(() => {
    const painel = panelRef?.current || null;
    return () => {
      const ativo = typeof document !== "undefined" ? document.activeElement : null;
      if (!painel || !ativo || !painel.contains(ativo)) return;
      if (!isPonteiroFino()) return;
      const campo = campoDoComposer();
      if (!campo) return;
      try {
        campo.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    };
  }, [panelRef]);

  // Recentes congelados na abertura (como no WhatsApp): inserir um emoji não pode
  // empurrar a grade enquanto a pessoa ainda está escolhendo.
  const [shownRecents] = useState(readRecentEmojis);
  const recentsRef = useRef(shownRecents);

  const bodyRef = useRef(null);
  const sectionRefs = useRef(new Map());
  const spyLockUntilRef = useRef(0);
  const spyFrameRef = useRef(0);

  const emojiSections = useMemo(() => {
    const list = [];
    if (shownRecents.length) list.push({ id: "recent", label: "Recentes", emojis: shownRecents });
    return list.concat(EMOJI_CATEGORIES);
  }, [shownRecents]);

  const [activeCat, setActiveCat] = useState(() => emojiSections[0]?.id || "smileys");

  const totalEmojis = useMemo(
    () => emojiSections.reduce((n, section) => n + section.emojis.length, 0),
    [emojiSections]
  );
  const [emojiBudget, setEmojiBudget] = useState(() => shownRecents.length + EMOJI_BUDGET_INICIAL);
  const tudoMontado = emojiBudget >= totalEmojis;
  const pendingMountJumpRef = useRef(null);
  useEffect(() => {
    if (tudoMontado) return undefined;
    return agendarOcioso(() => setEmojiBudget((b) => b + EMOJI_BUDGET_FATIA));
  }, [emojiBudget, tudoMontado]);

  const query = String(emojiQuery || "");
  const searching = tab === "emoji" && query.trim().length > 0;
  const results = useMemo(() => (searching ? searchEmojis(query) : []), [query, searching]);

  const pendingJumpRef = useRef(null);

  const scrollToSection = useCallback((id, smooth) => {
    const body = bodyRef.current;
    const el = sectionRefs.current.get(id);
    if (!body || !el) return;
    spyLockUntilRef.current = Date.now() + SPY_LOCK_MS;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    // .wa-mpBody é position:relative → offsetTop já é relativo ao corpo rolável.
    body.scrollTo({ top: Math.max(0, el.offsetTop), behavior: smooth && !reduce ? "smooth" : "auto" });
  }, []);

  // Troca de aba / entrada e saída da busca: volta ao topo — ou vai direto à
  // categoria clicada enquanto a busca estava aberta.
  useEffect(() => {
    const pending = pendingJumpRef.current;
    pendingJumpRef.current = null;
    if (pending && !searching) {
      setActiveCat(pending);
      scrollToSection(pending, false);
      return;
    }
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    if (!searching) setActiveCat(emojiSections[0]?.id || "smileys");
  }, [tab, searching, emojiSections, scrollToSection]);

  useEffect(() => () => cancelAnimationFrame(spyFrameRef.current), []);

  const handleScroll = useCallback(() => {
    if (tab !== "emoji" || searching) return;
    if (Date.now() < spyLockUntilRef.current) return;
    cancelAnimationFrame(spyFrameRef.current);
    spyFrameRef.current = requestAnimationFrame(() => {
      const body = bodyRef.current;
      if (!body) return;
      const top = body.scrollTop;
      let current = emojiSections[0]?.id;
      if (tudoMontado && top + body.clientHeight >= body.scrollHeight - 2) {
        current = emojiSections[emojiSections.length - 1]?.id;
      } else {
        for (const section of emojiSections) {
          const el = sectionRefs.current.get(section.id);
          if (el && el.offsetTop <= top + 12) current = section.id;
        }
      }
      if (current) setActiveCat((prev) => (prev === current ? prev : current));
    });
  }, [emojiSections, searching, tab, tudoMontado]);

  const jumpToCategory = useCallback((id) => {
    if (searching) {
      setEmojiBudget(Infinity);
      pendingJumpRef.current = id;
      onEmojiQueryChange?.("");
      return;
    }
    setActiveCat(id);
    if (!tudoMontado) {
      // As seções abaixo ainda não existem: monta tudo e rola no layout effect seguinte.
      pendingMountJumpRef.current = id;
      setEmojiBudget(Infinity);
      return;
    }
    scrollToSection(id, true);
  }, [onEmojiQueryChange, scrollToSection, searching, tudoMontado]);

  useLayoutEffect(() => {
    const id = pendingMountJumpRef.current;
    if (!id || !tudoMontado) return;
    pendingMountJumpRef.current = null;
    scrollToSection(id, true);
  }, [tudoMontado, scrollToSection]);

  const insertEmoji = useCallback((emoji) => {
    recentsRef.current = pushRecentEmoji(emoji, recentsRef.current);
    onInsertEmoji?.(emoji);
  }, [onInsertEmoji]);

  const sendSticker = useCallback(async (item) => {
    try {
      const response = await fetch(item.dataUrl);
      const blob = await response.blob();
      const extension = String(item?.mimeType || "").includes("webp") ? "webp" : "png";
      const file = new File([blob], item?.name || `sticker-${Date.now()}.${extension}`, {
        type: item?.mimeType || blob.type || "image/webp",
      });
      await onSendStickerFile?.(file);
    } catch {
      showToast?.({
        type: "error",
        title: "Figurinha",
        message: "Não foi possível enviar esta figurinha.",
      });
    }
  }, [onSendStickerFile, showToast]);

  const setSectionRef = (id) => (el) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  };

  /* Sem role="list"/"listitem": o papel explícito no <button> apagava o "botão" — o leitor de
     tela anunciava cada emoji como item de lista, não como algo clicável (27/11/2026). */
  const renderEmojiGrid = (list, keyPrefix) => (
    <div className="wa-mpEmojiGrid">
      {list.map((emoji) => (
        <button
          key={`${keyPrefix}-${emoji}`}
          type="button"
          className="wa-mpEmoji"
          onMouseDown={preventFocusSteal}
          onClick={() => insertEmoji(emoji)}
          aria-label={`Emoji ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );

  const isEmoji = tab === "emoji";
  const searchValue = isEmoji ? query : String(stickerQuery || "");
  const setSearchValue = isEmoji ? onEmojiQueryChange : onStickerQueryChange;

  return (
    <div
      ref={panelRef}
      className="wa-stickerPanel wa-mediaPanel wa-mp"
      role="dialog"
      aria-label={isEmoji ? "Emojis" : "Figurinhas"}
    >
      {isEmoji ? (
        <nav className="wa-mpCats" aria-label="Categorias de emoji">
          {emojiSections.map((section) => {
            const active = !searching && activeCat === section.id;
            return (
              <button
                key={section.id}
                type="button"
                className={`wa-mpCat ${active ? "isActive" : ""}`}
                onMouseDown={preventFocusSteal}
                onClick={() => jumpToCategory(section.id)}
                aria-label={section.label}
                aria-current={active ? "true" : undefined}
                title={section.label}
              >
                {CATEGORY_ICONS[section.id]}
              </button>
            );
          })}
        </nav>
      ) : (
        <div className="wa-mpTitleBar">
          <span className="wa-mpTitle">Figurinhas</span>
          <button
            type="button"
            className="wa-mpCreateLink"
            onMouseDown={preventFocusSteal}
            onClick={() => stickerInputRef?.current?.click()}
          >
            <span aria-hidden="true">+</span> Criar figurinha
          </button>
        </div>
      )}

      <div className="wa-mpSearchRow">
        <label className="wa-mpSearch">
          <span className="wa-mpSearchIcon"><SearchIcon /></span>
          <input
            key={tab}
            ref={isEmoji ? emojiSearchRef : stickerSearchRef}
            value={searchValue}
            onChange={(event) => setSearchValue?.(event.target.value)}
            placeholder={isEmoji ? "Pesquisar emoji" : "Pesquisar figurinha"}
            aria-label={isEmoji ? "Pesquisar emoji" : "Pesquisar figurinha"}
            autoComplete="off"
            spellCheck={false}
          />
          {searchValue ? (
            <button
              type="button"
              className="wa-mpSearchClear"
              onMouseDown={preventFocusSteal}
              onClick={() => setSearchValue?.("")}
              aria-label="Limpar pesquisa"
            >
              <ClearIcon />
            </button>
          ) : null}
        </label>
      </div>

      <div className="wa-mpBody" ref={bodyRef} onScroll={handleScroll}>
        {isEmoji ? (
          searching ? (
            results.length ? (
              <section className="wa-mpSection">
                <h3 className="wa-mpSectionTitle">Resultados</h3>
                {renderEmojiGrid(results, "res")}
              </section>
            ) : (
              <div className="wa-mpEmpty">
                <span className="wa-mpEmptyIcon" aria-hidden="true">🔍</span>
                <strong>Nenhum emoji encontrado</strong>
                <span>Tente outra palavra, como “coração” ou “joinha”.</span>
              </div>
            )
          ) : (
            (() => {
              let restante = emojiBudget;
              return emojiSections.map((section) => {
                if (restante <= 0) return null;
                const visiveis =
                  restante >= section.emojis.length ? section.emojis : section.emojis.slice(0, restante);
                restante -= section.emojis.length;
                return (
                  <section key={section.id} className="wa-mpSection" ref={setSectionRef(section.id)}>
                    <h3 className="wa-mpSectionTitle">{section.label}</h3>
                    {renderEmojiGrid(visiveis, section.id)}
                  </section>
                );
              });
            })()
          )
        ) : (
          <section className="wa-mpSection">
            <h3 className="wa-mpSectionTitle">{searchValue ? "Resultados" : "Recentes"}</h3>
            <div className="wa-mpStickerGrid">
              {!searchValue ? (
                <button
                  type="button"
                  className="wa-mpStickerCreate"
                  onMouseDown={preventFocusSteal}
                  onClick={() => stickerInputRef?.current?.click()}
                  aria-label="Criar figurinha a partir de uma imagem"
                  title="Criar figurinha"
                >
                  <span className="wa-mpStickerCreatePlus" aria-hidden="true">+</span>
                  <span>Criar</span>
                </button>
              ) : null}
              {stickers.map((item) => (
                <button
                  key={String(item.id)}
                  type="button"
                  className="wa-mpSticker"
                  onMouseDown={preventFocusSteal}
                  onClick={() => sendSticker(item)}
                  aria-label={`Enviar figurinha ${item?.name || ""}`.trim()}
                  title={item?.name || "Figurinha"}
                >
                  <img src={item.dataUrl} alt="" loading="lazy" draggable={false} />
                </button>
              ))}
            </div>
            {!stickers.length ? (
              <p className="wa-mpHint">
                {searchValue
                  ? "Nenhuma figurinha com esse nome."
                  : "As figurinhas que você enviar aparecem aqui. Use “Criar” para transformar uma imagem em figurinha."}
              </p>
            ) : null}
          </section>
        )}
      </div>

      {canSendSticker ? (
        <div className="wa-mpFoot">
          <div className="wa-mpSwitch" role="tablist" aria-label="Emojis e figurinhas">
            <button
              type="button"
              role="tab"
              aria-selected={isEmoji}
              aria-label="Emojis"
              title="Emojis"
              className={`wa-mpSwitchBtn ${isEmoji ? "isActive" : ""}`}
              onMouseDown={preventFocusSteal}
              onClick={() => onTabChange("emoji")}
            >
              <IconEmoji width={20} height={20} />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isEmoji}
              aria-label="Figurinhas"
              title="Figurinhas"
              className={`wa-mpSwitchBtn ${!isEmoji ? "isActive" : ""}`}
              onMouseDown={preventFocusSteal}
              onClick={() => onTabChange("stickers")}
            >
              <IconSticker width={20} height={20} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
