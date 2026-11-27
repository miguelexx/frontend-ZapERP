import "./mediaViewer.css";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, FileText, Forward, Paperclip, Printer, X } from "lucide-react";
import { getMediaPlaybackUrl, mediaViewerSupportsPrint } from "../utils/conversaViewHelpers";
import { URL_REGEX } from "../utils/conversaViewFormat";
import { useMobileOverlayBack } from "../../atendimento/useMobileOverlayBack";
import { useCompanyTimezoneVersion } from "../../utils/useCompanyTimezone";
import { formatMediaViewerWhen } from "../hooks/mediaViewerGallery";
import ZoomableImage, { ViewerFallbackImg } from "./MediaViewerZoomableImage";

/*
 * Visualizador de mídia em tela cheia, estilo WhatsApp Web (26/11/2026):
 *   barra de topo de ponta a ponta (quem enviou, quando, ações coladas à direita do ecrã) ·
 *   mídia grande ao centro · setas redondas nas bordas (desktop) · deslizar (celular) ·
 *   ←/→ no teclado · legenda em baixo (3 linhas, "Ver mais").
 *
 * - Portal no `body`: `.atendimento-chat-area` tem `isolation: isolate`.
 * - A raiz MANTÉM a classe `wa-mediaViewerOverlay`: o SidebarCliente usa-a para não fechar
 *   quando o clique cai aqui (`closest(".wa-mediaViewerOverlay")`).
 * - Escape: tratado aqui (listener no document com stopPropagation, antes do `useGlobalHotkeys`
 *   no window); a cadeia de `conversationEscapeOrder.js` já fecha o viewer primeiro de qualquer
 *   forma.
 * - "Voltar" do Android fecha só o viewer (`useMobileOverlayBack`).
 * - Diálogo modal acessível: foco entra ao abrir, Tab fica preso aqui, e volta ao elemento
 *   que abriu ao fechar.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, video[controls], [tabindex]:not([tabindex="-1"])';

function alvoEditavel(target) {
  if (!target || typeof target !== "object") return false;
  const tag = String(target.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable === true;
}

function ponteiroGrosso() {
  try {
    return window.matchMedia?.("(pointer: coarse)")?.matches === true;
  } catch {
    return false;
  }
}

function movimentoReduzido() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
}

function economiaDeDados() {
  try {
    return !!navigator?.connection?.saveData;
  } catch {
    return false;
  }
}

function focaveis(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]')
  );
}

function focarSemRolar(el) {
  if (!el || typeof el.focus !== "function") return;
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

function isImageViewerContent(item) {
  if (!item) return false;
  if (item.type === "imagem" || item.type === "figurinha") return true;
  if (item.type === "arquivo") {
    const fn = (item.fileName || "").toLowerCase();
    return /\.(jpg|jpeg|png|gif|webp|bmp|avif|svg)$/i.test(fn);
  }
  return false;
}

/** Legenda com links clicáveis. Telefones ficam texto: abrir outra conversa por trás do viewer confunde. */
function renderCaption(text) {
  const s = String(text || "");
  if (!s) return null;
  const parts = [];
  let last = 0;
  let m;
  URL_REGEX.lastIndex = 0;
  while ((m = URL_REGEX.exec(s)) !== null) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    parts.push(
      <a key={`l-${m.index}`} href={m[0]} target="_blank" rel="noreferrer" className="wa-mv-captionLink">
        {m[0]}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

function MediaViewerAvatar({ url, initials }) {
  const [erro, setErro] = useState(false);
  useEffect(() => setErro(false), [url]);
  if (url && !erro) {
    return (
      <span className="wa-mv-avatar">
        <img src={url} alt="" referrerPolicy="no-referrer" draggable={false} onError={() => setErro(true)} />
      </span>
    );
  }
  return (
    <span className="wa-mv-avatar wa-mv-avatar--initials" aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

function MediaViewerCaption({ text }) {
  const pRef = useRef(null);
  const [aberta, setAberta] = useState(false);
  const [cortada, setCortada] = useState(false);

  useLayoutEffect(() => {
    const p = pRef.current;
    if (!p || aberta) return;
    setCortada(p.scrollHeight > p.clientHeight + 1);
  }, [text, aberta]);

  if (!text) return null;
  return (
    <div className="wa-mv-captionBar">
      <div className={`wa-mv-caption${aberta ? " is-open" : ""}`}>
        <p ref={pRef} className="wa-mv-captionText">
          {renderCaption(text)}
        </p>
        {cortada || aberta ? (
          <button
            type="button"
            className="wa-mv-captionMore"
            aria-expanded={aberta ? "true" : "false"}
            onClick={() => setAberta((v) => !v)}
          >
            {aberta ? "Ver menos" : "Ver mais"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Visualizador de mídia em tela cheia. Monta só quando `mediaViewer` está definido.
 * Estados de PDF/impressão e a galeria vivem no hook (`useMediaViewer`).
 */
export default function MediaViewerOverlay({
  mediaViewer,
  mediaPdfBlobUrl,
  mediaPdfLoading,
  mediaPdfError,
  mediaPrintLoading,
  mediaDownloadLoading,
  mediaViewerImgRef,
  mediaViewerVideoRef,
  onClose,
  onPrint,
  onDownload,
  onForward,
}) {
  useCompanyTimezoneVersion();
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const slideRef = useRef(null);
  const bodyDownRef = useRef(false);
  const zoomScaleRef = useRef(1);
  const preloadRef = useRef({ urls: new Set(), imgs: [] });
  const returnFocusRef = useRef(mediaViewer?.gallery?.returnFocusEl || null);
  const whoId = useId();

  const gallery = mediaViewer?.gallery || null;
  const index = gallery?.index ?? 0;
  const total = gallery?.total ?? 1;
  const items = gallery?.items || null;
  const go = gallery?.go || null;
  const dir = gallery?.dir || 0;
  const hasPrev = !!go && index > 0;
  const hasNext = !!go && index < total - 1;

  /* Valores lidos pelos listeners nativos (teclado/toque) sem os recriar a cada item. */
  const navRef = useRef({ index, total, go });
  navRef.current = { index, total, go };
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const aberto = !!mediaViewer;
  useMobileOverlayBack(aberto, onClose, "viewer");

  const handleScaleChange = useCallback((s) => {
    zoomScaleRef.current = s;
  }, []);

  const handleBackdropClick = useCallback(() => {
    onCloseRef.current?.();
  }, []);

  /* Foco: entra no diálogo ao abrir; volta a quem abriu ao fechar. */
  useLayoutEffect(() => {
    if (!aberto) return undefined;
    const root = dialogRef.current;
    focarSemRolar(root);
    return () => {
      const el = returnFocusRef.current;
      if (!el || !el.isConnected || typeof el.focus !== "function") return;
      // No celular, devolver o foco ao campo de texto reabriria o teclado (e mexe no viewport).
      if (alvoEditavel(el) && ponteiroGrosso()) return;
      const active = document.activeElement;
      // Outra camada já pegou o foco (ex.: encaminhar abriu algo): não roubar.
      if (active && active !== document.body && root && !root.contains(active)) return;
      focarSemRolar(el);
    };
  }, [aberto]);

  /* Item mudou: zoom volta a 1 (o ZoomableImage remonta) e o foco não pode ficar no vazio
     (a seta que tinha o foco some no fim da galeria). */
  useEffect(() => {
    zoomScaleRef.current = 1;
    const root = dialogRef.current;
    if (!root) return;
    const active = document.activeElement;
    if (!active || active === document.body || !root.contains(active)) focarSemRolar(root);
  }, [index]);

  /* Teclado: Escape fecha, ←/→ navegam, Tab fica preso no diálogo. */
  useEffect(() => {
    if (!aberto) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const lista = focaveis(root);
        if (!lista.length) {
          e.preventDefault();
          focarSemRolar(root);
          return;
        }
        const first = lista[0];
        const last = lista[lista.length - 1];
        const active = document.activeElement;
        const dentro = root.contains(active);
        if (e.shiftKey) {
          if (!dentro || active === first || active === root) {
            e.preventDefault();
            focarSemRolar(last);
          }
        } else if (!dentro || active === last) {
          e.preventDefault();
          focarSemRolar(first);
        }
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (alvoEditavel(e.target)) return;
      // Vídeo com foco: ←/→ é o "avançar/recuar" nativo do player.
      if (String(e.target?.tagName || "").toUpperCase() === "VIDEO") return;
      if (zoomScaleRef.current > 1.01) return;
      const { index: i, total: n, go: ir } = navRef.current;
      if (!ir || n < 2) return;
      const delta = e.key === "ArrowRight" ? 1 : -1;
      const alvo = i + delta;
      if (alvo < 0 || alvo >= n) return;
      e.preventDefault();
      e.stopPropagation();
      ir(delta);
    };
    document.addEventListener("keydown", onKey);
    /*
     * Atalhos da página não furam o visualizador (27/11/2026). Com ele aberto (modal), Ctrl+K
     * levava o foco ao campo de mensagem escondido atrás — o Enter mandava o texto ao cliente
     * com a foto ainda na tela —, "?" abria a ajuda POR TRÁS roubando o foco (o 1.º Esc fechava
     * esse painel invisível) e Ctrl+Shift+F abria a busca por trás. Captura na window: corre
     * antes dos ouvintes da página (useGlobalHotkeys, lista de conversas). Só para a
     * propagação; o padrão do navegador (Ctrl+C, zoom, abas) segue intacto.
     */
    const onAtalhoDaPagina = (e) => {
      const comModificador = e.ctrlKey || e.metaKey;
      const ajuda = e.key === "?" && !comModificador && !e.altKey;
      if (!comModificador && !ajuda) return;
      e.stopPropagation();
      /* Os atalhos que a página toma para si (Ctrl+K, Ctrl+H, Ctrl+Shift+F) também não podem
         cair no navegador só porque a página não os ouviu: o Ctrl+H abria o Histórico do
         Chrome numa aba nova e o Ctrl+K levava o foco à barra de endereço. */
      const k = String(e.key || "").toLowerCase();
      if (comModificador && !e.altKey && (k === "k" || k === "h" || (e.shiftKey && k === "f"))) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onAtalhoDaPagina, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onAtalhoDaPagina, true);
    };
  }, [aberto]);

  /*
   * Deslizar horizontal (toque) troca de mídia — só com zoom = 1 e um dedo. A pinça (2 dedos)
   * e o arrastar com zoom continuam do ZoomableImage. O slide acompanha o dedo (transform
   * direto no DOM, sem render); nas pontas da galeria resiste.
   */
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    let t = null;

    const setX = (x, animar) => {
      const el = slideRef.current;
      if (!el) return;
      el.style.transition = animar && !movimentoReduzido() ? "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
      el.style.transform = x ? `translate3d(${x}px, 0, 0)` : "";
    };
    const cancelar = () => {
      if (t?.horizontal) setX(0, true);
      t = null;
    };
    const onStart = (e) => {
      if (navRef.current.total < 2) return;
      if (e.touches.length !== 1) {
        cancelar();
        return;
      }
      if (zoomScaleRef.current > 1.01) return;
      const target = e.target;
      if (target?.closest?.("button, a, iframe")) return;
      const touch = e.touches[0];
      if (String(target?.tagName || "").toUpperCase() === "VIDEO") {
        // A barra de controles nativa (tempo, volume) fica em baixo: ali o dedo é do player.
        const r = target.getBoundingClientRect();
        if (touch.clientY > r.bottom - 64) return;
      }
      t = { x0: touch.clientX, y0: touch.clientY, t0: performance.now(), dx: 0, horizontal: null };
    };
    const onMove = (e) => {
      if (!t) return;
      if (e.touches.length !== 1 || zoomScaleRef.current > 1.01) {
        cancelar();
        return;
      }
      const touch = e.touches[0];
      const dx = touch.clientX - t.x0;
      const dy = touch.clientY - t.y0;
      if (t.horizontal == null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        t.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
        if (!t.horizontal) {
          t = null;
          return;
        }
      }
      if (e.cancelable) e.preventDefault();
      const { index: i, total: n } = navRef.current;
      const naPonta = (dx > 0 && i <= 0) || (dx < 0 && i >= n - 1);
      t.dx = dx;
      setX(naPonta ? dx * 0.28 : dx, false);
    };
    const onEnd = () => {
      if (!t) return;
      const cur = t;
      t = null;
      if (!cur.horizontal) return;
      const { index: i, total: n, go: ir } = navRef.current;
      const largura = body.clientWidth || window.innerWidth || 1;
      const dt = Math.max(1, performance.now() - cur.t0);
      const rapido = Math.abs(cur.dx) > 40 && Math.abs(cur.dx) / dt > 0.45;
      const passou = Math.abs(cur.dx) > largura * 0.2 || rapido;
      const delta = cur.dx < 0 ? 1 : -1;
      const alvo = i + delta;
      if (passou && ir && alvo >= 0 && alvo < n) {
        ir(delta);
        return;
      }
      setX(0, true);
    };

    body.addEventListener("touchstart", onStart, { passive: true });
    body.addEventListener("touchmove", onMove, { passive: false });
    body.addEventListener("touchend", onEnd, { passive: true });
    body.addEventListener("touchcancel", cancelar, { passive: true });
    return () => {
      body.removeEventListener("touchstart", onStart);
      body.removeEventListener("touchmove", onMove);
      body.removeEventListener("touchend", onEnd);
      body.removeEventListener("touchcancel", cancelar);
    };
  }, [aberto]);

  /* Pré-carrega as fotos vizinhas: a próxima aparece já decodificada. */
  useEffect(() => {
    if (!items || items.length < 2 || economiaDeDados()) return;
    const cache = preloadRef.current;
    for (const i of [index + 1, index - 1, index + 2]) {
      const it = items[i];
      if (!it || it.type !== "imagem") continue;
      const src = String(it.url || "");
      if (!src || src.startsWith("blob:") || cache.urls.has(src)) continue;
      cache.urls.add(src);
      try {
        const img = new Image();
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.src = src;
        cache.imgs.push(img);
        if (cache.imgs.length > 8) cache.imgs.shift();
      } catch {
        /* best-effort */
      }
    }
  }, [index, items]);

  if (!mediaViewer) return null;

  const item = mediaViewer;
  const showZoomableImage = isImageViewerContent(item);
  const isVideo = item.type === "video";
  // Vídeo: a captura do quadro esbarra no CORS da mídia (canvas "tainted") e falhava quase
  // sempre — melhor não oferecer do que oferecer e falhar (auditoria B17).
  const canPrint = !isVideo && mediaViewerSupportsPrint(item.type, item.fileName);
  const author = item.author;
  const nome = item.isProfilePhoto ? item.fileName || "Foto do perfil" : author?.name || "Mídia";
  const avatarUrl = item.isProfilePhoto ? item.url : author?.avatarUrl || "";
  const iniciais = item.isProfilePhoto
    ? String(item.fileName || "?").trim().charAt(0).toUpperCase() || "?"
    : author?.initials || "?";
  const quando = item.isProfilePhoto ? "Foto do perfil" : formatMediaViewerWhen(item.at);
  const tipoRotulo = isVideo ? "Vídeo" : "Foto";
  const slideKey = `${index}:${item.key || item.url}`;
  const anuncio = dir !== 0 && total > 1 ? `${tipoRotulo} ${index + 1} de ${total}` : "";

  const onBodyClick = (e) => {
    // Clique de rato no fundo escuro (fora da mídia) fecha, como no WhatsApp Web. No toque não:
    // o toque que abriu o viewer (o `click` dele cai já sobre o overlay), ou um deslize curto,
    // não pode fechá-lo. Por isso também exige que o pointerdown tenha começado aqui.
    const comecouAqui = bodyDownRef.current;
    bodyDownRef.current = false;
    if (!comecouAqui) return;
    if (e.nativeEvent?.pointerType && e.nativeEvent.pointerType !== "mouse") return;
    const target = e.target;
    if (target === bodyRef.current || target === slideRef.current || target?.dataset?.mvBackdrop === "1") {
      onCloseRef.current?.();
    }
  };

  let content;
  if (isVideo) {
    content = (
      <video
        ref={mediaViewerVideoRef}
        src={item.url}
        controls
        autoPlay
        playsInline
        preload="auto"
        className="wa-mediaViewer-video"
      />
    );
  } else if (showZoomableImage) {
    content = (
      <ZoomableImage
        url={item.url}
        alt={item.originalType === "figurinha" ? "Figurinha" : item.fileName || (item.isProfilePhoto ? "Foto do perfil" : "Imagem")}
        imgRef={mediaViewerImgRef}
        sourceMsg={item.sourceMsg}
        onScaleChange={handleScaleChange}
        onBackdropClick={handleBackdropClick}
      />
    );
  } else if (item.type === "arquivo") {
    const fn = (item.fileName || "").toLowerCase();
    if (fn.endsWith(".pdf")) {
      const absUrl = getMediaPlaybackUrl(item.url, false) || item.url;
      if (mediaPdfLoading) {
        content = (
          <div className="wa-mediaViewer-iframe wa-mediaViewer-pdfState" role="status" aria-busy="true">
            Carregando documento…
          </div>
        );
      } else if (mediaPdfError) {
        content = (
          <div className="wa-mediaViewer-iframe wa-mediaViewer-pdfState">
            <FileText className="wa-mediaViewer-stateIcon" size={44} strokeWidth={1.5} aria-hidden="true" />
            <span>Não foi possível exibir o PDF nesta janela ({mediaPdfError}).</span>
            <a href={absUrl} target="_blank" rel="noreferrer" className="wa-btn wa-btn-primary">
              Abrir em nova aba
            </a>
          </div>
        );
      } else if (mediaPdfBlobUrl) {
        content = (
          <iframe src={mediaPdfBlobUrl} title={item.fileName || "Documento"} className="wa-mediaViewer-iframe" />
        );
      } else {
        content = (
          <div className="wa-mediaViewer-iframe wa-mediaViewer-pdfState" role="status">
            Preparando documento…
          </div>
        );
      }
    } else {
      content = (
        <div className="wa-mediaViewer-file">
          <Paperclip className="wa-mediaViewer-stateIcon" size={44} strokeWidth={1.5} aria-hidden="true" />
          <span className="wa-mediaViewer-fileName">{item.fileName || "Arquivo"}</span>
          <a href={item.url} target="_blank" rel="noreferrer" className="wa-btn wa-btn-primary">
            Abrir arquivo
          </a>
        </div>
      );
    }
  } else {
    content = (
      <ViewerFallbackImg
        url={item.url}
        alt={item.originalType === "figurinha" ? "Figurinha" : "Imagem"}
        imgRef={mediaViewerImgRef}
        sourceMsg={item.sourceMsg}
      />
    );
  }

  return createPortal(
    <div
      ref={dialogRef}
      className={`wa-mediaViewerOverlay wa-mv${showZoomableImage ? " wa-mediaViewerOverlay--image" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador de mídia"
      aria-describedby={`${whoId}-nome ${whoId}-quando${total > 1 ? ` ${whoId}-pos` : ""}`}
      tabIndex={-1}
      // Modal: cliques aqui não chegam aos "fechar ao clicar fora" do resto da página.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <header className={`wa-mv-topbar${total > 1 ? " wa-mv-topbar--counter" : ""}`}>
        <div className="wa-mv-who">
          <MediaViewerAvatar url={avatarUrl} initials={iniciais} />
          <div className="wa-mv-whoText">
            <span className="wa-mv-name" id={`${whoId}-nome`}>
              {nome}
            </span>
            <span className="wa-mv-sub">
              {quando ? (
                <span className="wa-mv-when" id={`${whoId}-quando`}>
                  {quando}
                </span>
              ) : null}
              {total > 1 ? (
                <span className="wa-mv-counter" id={`${whoId}-pos`}>
                  {index + 1} de {total}
                </span>
              ) : null}
            </span>
          </div>
        </div>
        <div className="wa-mediaViewer-actions" role="toolbar" aria-label="Ações da mídia">
          {item.sourceMsg && typeof onForward === "function" ? (
            <button
              type="button"
              className="wa-mv-action wa-mediaViewer-forward"
              onClick={onForward}
              title="Encaminhar"
              aria-label="Encaminhar"
            >
              <Forward size={22} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : null}
          {/*
            * Botão direito / long-press não alcançam a imagem do lightbox
            * (`.wa-mediaViewer-img--zoomable` tem `pointer-events: none` por causa do
            * zoom/pan), então salvar a mídia só existe por aqui.
            */}
          {typeof onDownload === "function" ? (
            <button
              type="button"
              className="wa-mv-action wa-mediaViewer-download"
              onClick={onDownload}
              disabled={mediaDownloadLoading}
              title="Salvar como…"
              aria-label="Salvar como…"
              aria-busy={mediaDownloadLoading ? "true" : undefined}
            >
              <Download size={22} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : null}
          {canPrint ? (
            <button
              type="button"
              className="wa-mv-action wa-mediaViewer-print"
              onClick={onPrint}
              disabled={mediaPrintLoading}
              title="Imprimir"
              aria-label="Imprimir"
              aria-busy={mediaPrintLoading ? "true" : undefined}
            >
              <Printer size={22} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="wa-mv-action wa-mediaViewer-close"
            onClick={onClose}
            title="Fechar (Esc)"
            aria-label="Fechar (Esc)"
          >
            <X size={24} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div
        ref={bodyRef}
        className="wa-mv-body"
        onPointerDown={(e) => {
          bodyDownRef.current = e.button === 0 && e.pointerType === "mouse";
        }}
        onClick={onBodyClick}
      >
        {hasPrev ? (
          <button
            type="button"
            className="wa-mv-nav wa-mv-nav--prev"
            onClick={() => go(-1)}
            title="Mídia anterior"
            aria-label="Mídia anterior"
          >
            <ChevronLeft size={26} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
        {/* Duas camadas: a de fora acompanha o dedo (transform inline); a de dentro faz a
            entrada animada. Na mesma camada a animação venceria o transform do deslize. */}
        <div key={slideKey} ref={slideRef} className="wa-mv-slide">
          <div
            className={`wa-mv-slideInner wa-mediaViewer${showZoomableImage ? " wa-mediaViewer--image" : ""}`}
            data-dir={dir > 0 ? "next" : dir < 0 ? "prev" : "open"}
            data-mv-backdrop="1"
          >
            {content}
          </div>
        </div>
        {hasNext ? (
          <button
            type="button"
            className="wa-mv-nav wa-mv-nav--next"
            onClick={() => go(1)}
            title="Próxima mídia"
            aria-label="Próxima mídia"
          >
            <ChevronRight size={26} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <MediaViewerCaption key={slideKey} text={item.caption} />

      <span className="wa-mv-srOnly" aria-live="polite">
        {anuncio}
      </span>
    </div>,
    document.body
  );
}
