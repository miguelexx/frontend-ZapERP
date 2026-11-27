import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { campoDoComposer, isPonteiroFino } from "../../../atendimento/useDialogFocus";
import { ReactionPicker } from "./MessageReactions";
import useMotionPresence from "../../../components/ui/useMotionPresence";
import { Info, Reply, Copy, Forward, Download, Pin, Star, CheckSquare, Pencil, Trash2 } from "lucide-react";
import { snippetFromMsg } from "../../utils/conversaMessageDisplay";
import { formatHora } from "../../utils/conversaViewHelpers";

/* Teclado no menu (26/11/2026): setas/Home/End andam entre os itens, como num menu de sistema. */
function handleMenuKeyDown(e) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const items = Array.from(e.currentTarget.querySelectorAll(".wa-msgMenuItem:not(:disabled)"));
  if (!items.length) return;
  e.preventDefault();
  const idx = items.indexOf(document.activeElement);
  let next = 0;
  if (e.key === "End") next = items.length - 1;
  else if (e.key === "ArrowDown") next = idx < 0 ? 0 : (idx + 1) % items.length;
  else if (e.key === "ArrowUp") next = idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length;
  items[next]?.focus();
}

function focavel(el) {
  if (!el || !el.isConnected || typeof el.focus !== "function" || el === document.body) return false;
  if (el.disabled) return false;
  if (typeof el.closest === "function" && el.closest("[inert]")) return false;
  return typeof el.getClientRects !== "function" || el.getClientRects().length > 0;
}

function ehCampoDeTexto(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName || "").toUpperCase();
  return tag === "TEXTAREA" || (tag === "INPUT" && !["button", "submit", "checkbox", "radio"].includes(String(el.type || "")));
}

function focarSemRolar(el) {
  try {
    el.focus({ preventScroll: true });
  } catch {
    try {
      el.focus();
    } catch {
      /* ignore */
    }
  }
}

/*
 * Para onde vai o foco quando o menu ancorado fecha (27/11/2026). O menu agora toma o foco ao
 * abrir (setas); ao fechar ele fica `inert` e desmonta — sem isto o foco caía no <body>: o Tab
 * seguinte recomeçava no topo da página e o que se digitava depois de "Copiar" ou de reagir não
 * ia para lugar nenhum.
 *  - Ação que já levou o foco a outro lugar (Responder/Editar → composer, confirmação, modal):
 *    não mexe.
 *  - Aberto pelo teclado (setinha com :focus-visible) ou a partir de um campo de texto: volta a
 *    quem abriu (padrão de botão de menu).
 *  - Aberto pelo rato: o composer, para continuar digitando; se ele não estiver disponível
 *    (modo seleção, conversa sem permissão), a setinha.
 *  - Toque (ponteiro grosso): nunca — focar o campo abriria o teclado do celular.
 * Roda no layout effect do FECHAMENTO, antes dos efeitos passivos: um diálogo aberto pela
 * ação (Apagar → confirmação, Dados da mensagem) registra esse destino como "quem abriu" e
 * devolve o foco a ele quando fechar.
 */
function devolverFocoAoFechar({ opener, viaTeclado, menuEl }) {
  if (typeof document === "undefined") return;
  const ativo = document.activeElement;
  const perdido =
    !ativo || ativo === document.body || ativo === document.documentElement || Boolean(menuEl && menuEl.contains(ativo));
  if (!perdido) return;
  if (!isPonteiroFino()) return;
  if (focavel(opener) && (viaTeclado || ehCampoDeTexto(opener))) {
    focarSemRolar(opener);
    return;
  }
  const campo = campoDoComposer();
  if (campo) {
    focarSemRolar(campo);
    return;
  }
  /* Selecionar/Encaminhar: o composer dá lugar à barra de seleção e a setinha some — o foco ia
     para o <body>. Vai para a barra: no encaminhar, direto ao botão Encaminhar. */
  const barra = botaoDaBarraDeSelecao();
  if (barra) {
    focarSemRolar(barra);
    return;
  }
  if (focavel(opener)) focarSemRolar(opener);
}

function botaoDaBarraDeSelecao() {
  if (typeof document === "undefined") return null;
  const candidatos = [
    ".wa-selectBar--forwardIntent .wa-selectBar-iconBtn--forward",
    ".wa-selectBar .wa-selectBar-close",
  ];
  for (const sel of candidatos) {
    const el = document.querySelector(sel);
    if (focavel(el)) return el;
  }
  return null;
}

export default function MessageMenu({
  menuOpen,
  menuUsesBottomSheet,
  menuStyle,
  menuElRef,
  mobileMessageChrome,
  showReactionBar = false,
  isCall,
  apagadaParaTodos,
  out,
  isPinned,
  isStarred,
  canDeleteForEveryone,
  canEdit,
  canForward = true,
  canDownload = false,
  canCopy = true,
  previewMsg = null,
  previewAuthor = "",
  downloadBusy = false,
  reactionExpanded,
  reactionBusy,
  localReaction,
  onClose,
  onAction,
  onReact,
  onRemoveReaction,
  onExpandToggle,
  onReactionPicked,
}) {
  const motion = useMotionPresence(menuOpen);
  const openerRef = useRef(null);
  const viaTecladoRef = useRef(false);
  const estavaAbertoRef = useRef(menuOpen);
  /* Foco no menu ao abrir: as setas já funcionam e o Tab não cai em controles invisíveis
     atrás dele. O próprio contêiner recebe o foco (sem anel visível no clique de rato). */
  useEffect(() => {
    if (!menuOpen || menuUsesBottomSheet) return undefined;
    const ativo = typeof document !== "undefined" ? document.activeElement : null;
    const menuEl = menuElRef?.current;
    const valido =
      ativo instanceof HTMLElement && ativo !== document.body && !(menuEl && menuEl.contains(ativo));
    openerRef.current = valido ? ativo : null;
    let teclado = false;
    try {
      teclado = valido && ativo.matches(":focus-visible");
    } catch {
      teclado = false;
    }
    viaTecladoRef.current = teclado;
    const id = requestAnimationFrame(() => {
      try {
        menuElRef?.current?.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [menuOpen, menuUsesBottomSheet, menuElRef]);
  useLayoutEffect(() => {
    const estavaAberto = estavaAbertoRef.current;
    estavaAbertoRef.current = menuOpen;
    if (!estavaAberto || menuOpen || menuUsesBottomSheet) return;
    const opener = openerRef.current;
    openerRef.current = null;
    devolverFocoAoFechar({ opener, viaTeclado: viaTecladoRef.current, menuEl: menuElRef?.current });
  }, [menuOpen, menuUsesBottomSheet, menuElRef]);
  if (!motion.present) return null;
  const previewSnippet = previewMsg ? snippetFromMsg(previewMsg) : "";

  return createPortal(
    <>
      <div
        className={`wa-msgMenuBackdrop${menuUsesBottomSheet ? " wa-msgMenuBackdrop--sheet" : ""}`}
        data-motion-state={motion.state}
        aria-hidden="true"
        style={!menuOpen ? { pointerEvents: "none" } : undefined}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          /* Rato fecha já. No toque o fecho espera o clique: fechando no pointerdown o fundo
             perdia o pointer-events antes do clique, e o toque "atravessava" para o que estava
             por baixo (a seta do cabeçalho fechava a conversa junto com a folha). */
          if (e.pointerType === "mouse") onClose?.();
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          onClose?.();
        }}
      />
      <div
        ref={menuElRef}
        data-motion-state={motion.state}
        inert={!menuOpen ? "" : undefined}
        aria-hidden={!menuOpen || undefined}
        className={`wa-msgMenu${menuUsesBottomSheet ? " wa-msgMenu--sheet" : ""}${
          !menuUsesBottomSheet && showReactionBar ? " wa-msgMenu--ctx" : ""
        }`}
        style={menuStyle || { position: "fixed", top: -9999, left: -9999 }}
        role="menu"
        aria-label="Opções da mensagem"
        tabIndex={-1}
        onKeyDown={(e) => {
          /* Tab gira dentro do menu (reações + itens): ele vive num portal no fim do body e o
             Tab seguinte sairia da conversa, com o menu ainda aberto. */
          if (e.key === "Tab" && !menuUsesBottomSheet) {
            const focaveis = Array.from(
              e.currentTarget.querySelectorAll("button:not(:disabled), [tabindex]:not([tabindex='-1'])")
            ).filter((el) => el.getClientRects().length > 0);
            if (!focaveis.length) return;
            const i = focaveis.indexOf(document.activeElement);
            const ultimo = focaveis.length - 1;
            if (e.shiftKey && i <= 0) {
              e.preventDefault();
              focaveis[ultimo].focus();
            } else if (!e.shiftKey && (i === -1 || i === ultimo)) {
              e.preventDefault();
              focaveis[0].focus();
            }
            return;
          }
          handleMenuKeyDown(e);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/*
         * Bottom-sheet do celular: qual mensagem foi pressionada (26/11/2026). O sheet cobria a
         * bolha e o fundo desfocava tudo — antes de apagar/encaminhar não dava para conferir.
         */}
        {menuUsesBottomSheet && previewMsg ? (
          <div className="wa-msgMenu-preview" aria-hidden="true">
            <div className="wa-msgMenu-previewHead">
              <span className="wa-msgMenu-previewAuthor">{previewAuthor}</span>
              <span className="wa-msgMenu-previewTime">{formatHora(previewMsg?.criado_em)}</span>
            </div>
            {previewSnippet ? <div className="wa-msgMenu-previewText">{previewSnippet}</div> : null}
          </div>
        ) : null}
        {showReactionBar && !isCall && !apagadaParaTodos ? (
          <>
            <ReactionPicker
              mobileSelected={false}
              menuInline
              reactionExpanded={reactionExpanded}
              reactionBusy={reactionBusy}
              apagadaParaTodos={apagadaParaTodos}
              localReaction={localReaction}
              onReact={onReact}
              onRemoveReaction={onRemoveReaction}
              onExpandToggle={onExpandToggle}
              onPicked={onReactionPicked}
            />
            <div className="wa-msgMenuSep" aria-hidden="true" />
          </>
        ) : null}
        {out ? (
          <>
            <button type="button" className="wa-msgMenuItem" onClick={() => onAction("info")} role="menuitem">
              <Info aria-hidden="true" /> Dados da mensagem
            </button>
            <div className="wa-msgMenuSep" aria-hidden="true" />
          </>
        ) : null}
        {!apagadaParaTodos ? (
          <button type="button" className="wa-msgMenuItem" onClick={() => onAction("reply")} role="menuitem">
            <Reply aria-hidden="true" /> Responder
          </button>
        ) : null}
        {canCopy ? (
          <button type="button" className="wa-msgMenuItem" onClick={() => onAction("copy")} role="menuitem">
            <Copy aria-hidden="true" /> Copiar
          </button>
        ) : null}
        {!apagadaParaTodos && canForward ? (
          <button type="button" className="wa-msgMenuItem" onClick={() => onAction("forward")} role="menuitem">
            <Forward aria-hidden="true" /> Encaminhar
          </button>
        ) : null}
        {/*
         * Única forma de salvar foto/vídeo/áudio/figurinha: o menu nativo do navegador não
         * alcança a mídia (pointer-events/touch-callout desligados de propósito para o
         * long-press abrir este menu). Ver conversa/mediaDownload.js.
         */}
        {!apagadaParaTodos && canDownload ? (
          <button
            type="button"
            className="wa-msgMenuItem"
            onClick={() => onAction("download")}
            role="menuitem"
            disabled={downloadBusy}
            aria-busy={downloadBusy ? "true" : undefined}
          >
            <Download aria-hidden="true" /> {downloadBusy ? "Salvando…" : "Salvar como…"}
          </button>
        ) : null}
        {!apagadaParaTodos ? (
          <>
            <button type="button" className="wa-msgMenuItem" onClick={() => onAction("pin")} role="menuitem">
              <Pin aria-hidden="true" /> {isPinned ? "Desafixar" : "Fixar"}
            </button>
            <button type="button" className="wa-msgMenuItem" onClick={() => onAction("star")} role="menuitem">
              <Star aria-hidden="true" /> {isStarred ? "Desfavoritar" : "Favoritar"}
            </button>
            <button type="button" className="wa-msgMenuItem" onClick={() => onAction("select")} role="menuitem">
              <CheckSquare aria-hidden="true" /> Selecionar
            </button>
          </>
        ) : null}
        <div className="wa-msgMenuSep" aria-hidden="true" />
        {canEdit ? (
          <button type="button" className="wa-msgMenuItem" onClick={() => onAction("edit")} role="menuitem">
            <Pencil aria-hidden="true" /> Editar
          </button>
        ) : null}
        <button
          type="button"
          className="wa-msgMenuItem wa-msgMenuItemDanger"
          onClick={() => onAction("deleteForMe")}
          role="menuitem"
        >
          <Trash2 aria-hidden="true" /> Apagar para mim
        </button>
        {canDeleteForEveryone ? (
          <button
            type="button"
            className="wa-msgMenuItem wa-msgMenuItemDanger"
            onClick={() => onAction("deleteForEveryone")}
            role="menuitem"
          >
            <Trash2 aria-hidden="true" /> Apagar para todos
          </button>
        ) : null}
      </div>
    </>,
    document.body
  );
}
