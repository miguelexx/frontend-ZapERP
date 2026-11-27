import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  printImageFromUrl,
  printImageBlob,
  captureVideoFrameToPngBlob,
} from "../mediaPrint";
import {
  fetchMediaBinaryAuthenticated,
  getMediaUrl,
  getMediaPlaybackUrl,
  mediaViewerSupportsPrint,
} from "../utils/conversaViewHelpers";
import { salvarMidiaComFeedback } from "../mediaDownload";
import { useConversaStore } from "../conversaStore";
import { buildMediaViewerGallery, normalizeViewerType, refreshViewerItem } from "./mediaViewerGallery";

function revokeObjectUrl(url) {
  if (!url || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

/** Elemento com foco no instante da abertura: é para ele que o foco volta ao fechar. */
function captureActiveElement() {
  try {
    const el = typeof document !== "undefined" ? document.activeElement : null;
    if (!el || el === document.body || el === document.documentElement) return null;
    return el;
  } catch {
    return null;
  }
}

/**
 * Visualizador de mídia em tela cheia (imagem, vídeo, PDF), galeria e impressão.
 * UI em MediaViewerOverlay; lógica concentrada neste hook.
 *
 * `mediaViewer` continua a ser o item EXIBIDO ({ url, type, fileName, sourceMsg, ... }): o
 * ConversaView lê `sourceMsg` para encaminhar e a cadeia de Escape lê `!!mediaViewer`. A galeria
 * viaja dentro dele (`mediaViewer.gallery`) porque o overlay recebe as props por um caminho fixo
 * (ConversaViewOverlays) — assim a navegação não exige mexer nos dois coordenadores.
 */
export function useMediaViewer({ showToast }) {
  /** { items, index, dir, returnFocusEl } | null */
  const [viewerState, setViewerState] = useState(null);
  const [mediaPdfBlobUrl, setMediaPdfBlobUrl] = useState(null);
  const [mediaPdfLoading, setMediaPdfLoading] = useState(false);
  const [mediaPdfError, setMediaPdfError] = useState(null);
  const [mediaPrintLoading, setMediaPrintLoading] = useState(false);
  const [mediaDownloadLoading, setMediaDownloadLoading] = useState(false);
  const mediaViewerImgRef = useRef(null);
  const mediaViewerVideoRef = useRef(null);
  const mediaPdfBlobUrlRef = useRef(null);

  useEffect(() => {
    mediaPdfBlobUrlRef.current = mediaPdfBlobUrl;
  }, [mediaPdfBlobUrl]);

  useEffect(
    () => () => {
      revokeObjectUrl(mediaPdfBlobUrlRef.current);
      mediaPdfBlobUrlRef.current = null;
    },
    []
  );

  /**
   * Aceita a assinatura de sempre `(url, type, fileName, sourceMsg)` e também um objeto
   * `{ src | url, name | fileName, type, sourceMsg }` — o SidebarGrupo chama assim
   * (`onOpenAvatar({ src, name })`), e antes a foto do grupo abria com `url` = objeto.
   */
  const openMediaViewer = useCallback((urlOrSpec, type = "imagem", fileName, sourceMsg) => {
    let url = urlOrSpec;
    let tipo = type;
    let nome = fileName;
    let msg = sourceMsg;
    if (urlOrSpec && typeof urlOrSpec === "object") {
      url = urlOrSpec.src ?? urlOrSpec.url ?? "";
      tipo = urlOrSpec.type ?? type ?? "imagem";
      nome = urlOrSpec.fileName ?? urlOrSpec.name ?? fileName;
      msg = urlOrSpec.sourceMsg ?? sourceMsg;
    }
    url = typeof url === "string" ? url.trim() : "";
    if (!url) return;
    const returnFocusEl = captureActiveElement();
    let gallery;
    try {
      gallery = buildMediaViewerGallery({ url, type: tipo, fileName: nome, sourceMsg: msg });
    } catch (err) {
      console.error(err);
      gallery = null;
    }
    if (!gallery?.items?.length) return;
    setViewerState({ items: gallery.items, index: gallery.index, dir: 0, returnFocusEl });
  }, []);

  const closeMediaViewer = useCallback(() => {
    setViewerState(null);
  }, []);

  /*
   * A galeria é da conversa em que abriu. O ConversaView não remonta ao trocar de conversa
   * (notificação, atalho, desktop com a lista ao lado): sem isto o viewer ficava por cima da
   * conversa nova mostrando as fotos da anterior.
   */
  const viewerAberto = viewerState != null;
  useEffect(() => {
    if (!viewerAberto) return undefined;
    return useConversaStore.subscribe((state, prev) => {
      if (String(state?.selectedId ?? "") !== String(prev?.selectedId ?? "")) setViewerState(null);
    });
  }, [viewerAberto]);

  /** Navega na galeria: `delta` = +1 (próxima) / -1 (anterior). Fora dos limites não faz nada. */
  const goToMedia = useCallback((delta) => {
    setViewerState((v) => {
      if (!v) return v;
      const next = v.index + (delta > 0 ? 1 : -1);
      if (next < 0 || next >= v.items.length) return v;
      const alvo = v.items[next];
      const fresco = refreshViewerItem(alvo);
      const items = fresco === alvo ? v.items : v.items.map((it, i) => (i === next ? fresco : it));
      return { ...v, items, index: next, dir: delta > 0 ? 1 : -1 };
    });
  }, []);

  const mediaViewer = useMemo(() => {
    if (!viewerState) return null;
    const item = viewerState.items[viewerState.index];
    if (!item) return null;
    return {
      ...item,
      gallery: {
        index: viewerState.index,
        total: viewerState.items.length,
        items: viewerState.items,
        dir: viewerState.dir,
        go: goToMedia,
        returnFocusEl: viewerState.returnFocusEl,
      },
    };
  }, [viewerState, goToMedia]);

  /**
   * "Salvar como…" do lightbox. Mesmo caminho do menu da bolha (binário autenticado +
   * recuperação da cópia quando o link do provedor expirou).
   */
  const handleMediaViewerDownload = useCallback(async () => {
    if (!mediaViewer?.url || mediaDownloadLoading) return;
    setMediaDownloadLoading(true);
    try {
      await salvarMidiaComFeedback({
        msg: mediaViewer.downloadMsg || null,
        url: mediaViewer.url,
        fileName: mediaViewer.fileName || undefined,
        tipo: mediaViewer.downloadMsg?.tipo || mediaViewer.originalType || mediaViewer.type,
        showToast,
      });
    } finally {
      setMediaDownloadLoading(false);
    }
  }, [mediaViewer, mediaDownloadLoading, showToast]);

  const handleMediaViewerPrint = useCallback(async () => {
    if (!mediaViewer?.url || mediaPrintLoading) return;

    const viewerType = normalizeViewerType(mediaViewer.type, mediaViewer.fileName);

    if (!mediaViewerSupportsPrint(viewerType, mediaViewer.fileName)) {
      showToast({
        type: "info",
        title: "Impressão",
        message: "Use Abrir arquivo no navegador e imprima a partir de lá.",
      });
      return;
    }

    setMediaPrintLoading(true);
    try {
      /*
       * Vídeo: o overlay não oferece mais "Imprimir" (o `<video>` da API vem de outra origem
       * sem CORS, o canvas sai "tainted" e a captura falhava quase sempre). O ramo fica para
       * quem chamar este handler direto com um vídeo local (blob:).
       */
      if (viewerType === "video") {
        const v = mediaViewerVideoRef.current;
        if (!v) {
          showToast({ type: "error", title: "Impressão", message: "Vídeo indisponível no visualizador." });
          return;
        }
        if (v.readyState < 2) {
          showToast({
            type: "warning",
            title: "Aguarde",
            message: "Carregue o vídeo antes de imprimir.",
          });
          return;
        }
        let blob;
        try {
          blob = await captureVideoFrameToPngBlob(v);
        } catch (e) {
          const msg = String(e?.message || "");
          if (msg === "VIDEO_FRAME_TAINTED" || msg === "VIDEO_NOT_READY") {
            showToast({
              type: "error",
              title: "Não foi possível capturar o quadro",
              message:
                msg === "VIDEO_NOT_READY"
                  ? "O vídeo ainda não tem dimensões. Aguarde um instante."
                  : "Limitação do navegador com esta origem de mídia. Baixe o arquivo e imprima localmente, se necessário.",
            });
            return;
          }
          throw e;
        }
        printImageBlob(blob);
        return;
      }

      await printImageFromUrl(mediaViewer.url);
    } catch (err) {
      if (err?.code === "POPUP_BLOCKED") {
        showToast({
          type: "warning",
          title: "Pop-up bloqueado",
          message: "Permita pop-ups para este site para abrir a janela de impressão.",
        });
        return;
      }
      console.error(err);
      showToast({
        type: "error",
        title: "Falha ao imprimir",
        message: "Não foi possível preparar a impressão. Tente de novo.",
      });
    } finally {
      setMediaPrintLoading(false);
    }
  }, [mediaViewer, mediaPrintLoading, showToast]);

  /* O PDF só depende do item exibido: trocar de foto na galeria não refaz o pedido. */
  const pdfSourceKey = useMemo(() => {
    if (!mediaViewer) return null;
    const viewerType = normalizeViewerType(mediaViewer.type, mediaViewer.fileName);
    const fn = String(mediaViewer.fileName || "").toLowerCase();
    const isPdf = viewerType === "arquivo" && (fn.endsWith(".pdf") || mediaViewer.originalType === "pdf");
    return isPdf ? mediaViewer.url : null;
  }, [mediaViewer]);

  useEffect(() => {
    let cancelled = false;
    let createdPdfUrl = null;

    if (!pdfSourceKey) {
      setMediaPdfBlobUrl((prev) => {
        revokeObjectUrl(prev);
        return null;
      });
      setMediaPdfLoading(false);
      setMediaPdfError(null);
      return undefined;
    }

    setMediaPdfLoading(true);
    setMediaPdfError(null);
    setMediaPdfBlobUrl((prev) => {
      revokeObjectUrl(prev);
      return null;
    });

    const abs = getMediaPlaybackUrl(pdfSourceKey, false) || getMediaUrl(pdfSourceKey, false);

    (async () => {
      try {
        const blob = await fetchMediaBinaryAuthenticated(abs);
        const pdfBlob =
          blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
        createdPdfUrl = URL.createObjectURL(pdfBlob);

        if (cancelled) {
          revokeObjectUrl(createdPdfUrl);
          createdPdfUrl = null;
          return;
        }

        setMediaPdfBlobUrl(createdPdfUrl);
      } catch (e) {
        if (!cancelled) {
          setMediaPdfError(String(e?.message || e || "Erro ao carregar o documento."));
        }
      } finally {
        if (!cancelled) setMediaPdfLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfSourceKey]);

  return {
    mediaViewer,
    mediaPdfBlobUrl,
    mediaPdfLoading,
    mediaPdfError,
    mediaPrintLoading,
    mediaDownloadLoading,
    mediaViewerImgRef,
    mediaViewerVideoRef,
    openMediaViewer,
    closeMediaViewer,
    goToMedia,
    handleMediaViewerPrint,
    handleMediaViewerDownload,
  };
}
