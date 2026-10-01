import { useCallback, useState } from "react";
import { formatHora } from "../../utils/conversaViewHelpers";
import {
  looksLikeDocumentFilenameOnly,
  resolveDownloadFilename,
  getFileExt,
  formatFileSize,
  buildMediaOpenHref,
  buildMediaDownloadHref,
  fetchMediaBinaryAuthenticated,
} from "../../utils/conversaViewHelpers";
import MessageStatus from "./MessageStatus";
import EditedLabel from "./EditedLabel";
import MessageCaption from "./MessageCaption";
import { getEditableComposerText } from "../utils/bubbleClassify";
import {
  canReprocessInboundMedia,
  requestInboundMediaReprocess,
} from "../utils/inboundMediaReprocess";
import { useNotificationStore } from "../../../notifications/notificationStore";

function toast(payload) {
  try {
    useNotificationStore?.getState()?.showToast?.(payload);
  } catch {
    /* toast é best-effort; nunca deve derrubar o clique */
  }
}

/** Dispara o "salvar como" a partir de bytes já em memória (blob), com o nome real do arquivo. */
function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "arquivo";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }, 60000);
  }
}

const TOAST_EXPIRADO = {
  type: "warning",
  title: "Arquivo expirou",
  message:
    "Este arquivo não está mais disponível no WhatsApp e não pôde ser recuperado.",
};
const TOAST_FALHA = {
  type: "error",
  title: "Não foi possível abrir",
  message: "Falha ao recuperar o arquivo. Tente novamente em instantes.",
};

/**
 * Card de arquivo estilo WhatsApp: ícone com extensão, nome, tipo/tamanho,
 * timestamp, ticks e links "Abrir" / "Salvar como..."
 *
 * Dois caminhos:
 *  - Arquivo já em /uploads (ou mídia nossa): `<a>` nativo — rápido, sem pop-up
 *    bloqueado, download nativo. Comportamento intocado.
 *  - Arquivo RECEBIDO ainda apontando para a URL do provedor (UltraMSG/Whapi/S3):
 *    a URL tem TTL curto e pode já ter expirado — clicar num `<a>` morto abria
 *    aba em branco (502 do proxy) ou nada (href vazio). Aqui usamos os mesmos
 *    ganchos do áudio (`reprocessar-midia`): tentamos abrir direto; se falhar,
 *    pedimos ao backend uma cópia fresca para /uploads e abrimos dela; se o link
 *    expirou de vez, avisamos com clareza em vez de deixar a aba branca.
 */
export default function DocumentMessage({ msg, mediaUrl, selectMode, isGroup, out }) {
  const nome = resolveDownloadFilename(
    msg?.nome_arquivo ?? msg?.n ?? (looksLikeDocumentFilenameOnly(msg?.texto) ? msg?.texto : null),
    mediaUrl
  );
  const ext = getFileExt(nome);
  const bytes = msg?.tamanho ?? msg?.tamanho_bytes;
  const size = formatFileSize(bytes);
  const typeSize = size ? `${ext} · ${size}` : ext;
  const caption = getEditableComposerText(msg);
  const encaminhado = !!msg?.encaminhado || (typeof msg?.texto === "string" && msg.texto.trimStart().startsWith("[Encaminhado]"));
  const openHref = buildMediaOpenHref(msg?.url, msg?.url_absoluta, nome) || mediaUrl;
  const downloadHref = buildMediaDownloadHref(msg?.url, msg?.url_absoluta, nome) || mediaUrl;

  // Recebido e ainda fora de /uploads → precisa da rede de recuperação (reprocess).
  const needsRecovery = canReprocessInboundMedia(msg, out);
  const [busy, setBusy] = useState(false);

  const handleCardClick = (e) => {
    if (!selectMode) e.stopPropagation();
  };

  /**
   * Pede ao backend uma cópia fresca em /uploads e devolve os hrefs prontos.
   * Lança { code: 'expired' } quando o link morreu de vez e { code: 'transient' }
   * para falhas passageiras (rede/lock/allowlist) — o chamador decide a mensagem.
   */
  const recuperarHrefs = useCallback(async () => {
    const r = await requestInboundMediaReprocess(msg);
    if (r?.ok && typeof r.url === "string" && r.url.startsWith("/uploads/")) {
      return {
        openHref: buildMediaOpenHref(r.url, null, nome),
        downloadHref: buildMediaDownloadHref(r.url, null, nome),
      };
    }
    const err = new Error(r?.definitivo ? "expired" : "transient");
    err.code = r?.definitivo ? "expired" : "transient";
    throw err;
  }, [msg, nome]);

  const handleOpen = useCallback(async () => {
    if (selectMode || busy) return;
    // Abre a aba SÍNCRONO (no gesto do usuário) para não ser bloqueada como pop-up.
    // IMPORTANTE: sem "noopener" — com essa flag o window.open devolve null e perdíamos o
    // controle da aba (ela ficava presa em about:blank, exatamente o bug do comprovante branco).
    const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
    if (win) {
      try {
        win.document.write(
          "<!doctype html><title>Abrindo…</title><p style='font-family:system-ui,sans-serif;padding:24px;color:#334155'>Abrindo arquivo…</p>"
        );
        win.document.close();
      } catch {
        /* ignore */
      }
    }
    setBusy(true);
    try {
      let blob = null;
      // 1) Caminho rápido: a URL atual (proxy) ainda pode estar viva.
      if (openHref) {
        try {
          blob = await fetchMediaBinaryAuthenticated(openHref);
        } catch {
          blob = null;
        }
      }
      // 2) Recuperação: pede cópia fresca ao backend e abre dela.
      if (!blob) {
        const fresh = await recuperarHrefs();
        blob = await fetchMediaBinaryAuthenticated(fresh.openHref);
      }
      const url = URL.createObjectURL(blob);
      if (win) {
        win.location.replace(url);
      } else {
        // Pop-up bloqueado de vez: baixa o arquivo para o usuário não ficar sem nada.
        triggerBlobDownload(blob, nome);
      }
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }, 60000);
    } catch (err) {
      if (win) {
        try {
          win.close();
        } catch {
          /* ignore */
        }
      }
      toast(err?.code === "expired" ? TOAST_EXPIRADO : TOAST_FALHA);
    } finally {
      setBusy(false);
    }
  }, [selectMode, busy, openHref, recuperarHrefs, nome]);

  const handleDownload = useCallback(async () => {
    if (selectMode || busy) return;
    setBusy(true);
    try {
      let blob = null;
      if (downloadHref) {
        try {
          blob = await fetchMediaBinaryAuthenticated(downloadHref);
        } catch {
          blob = null;
        }
      }
      if (!blob) {
        const fresh = await recuperarHrefs();
        blob = await fetchMediaBinaryAuthenticated(fresh.downloadHref);
      }
      triggerBlobDownload(blob, nome);
    } catch (err) {
      toast(
        err?.code === "expired"
          ? TOAST_EXPIRADO
          : { ...TOAST_FALHA, title: "Não foi possível salvar" }
      );
    } finally {
      setBusy(false);
    }
  }, [selectMode, busy, downloadHref, recuperarHrefs, nome]);

  const abrirLabel = busy ? "Abrindo…" : "Abrir";
  const salvarLabel = busy ? "Salvando…" : "Salvar como...";
  const showSave = Boolean(mediaUrl) || needsRecovery;

  return (
    <div className={`wa-bubble-fileCard ${out ? "wa-bubble-fileCard--out" : ""}`} onClick={handleCardClick}>
      {encaminhado ? <div className="wa-bubble-encaminhado">[Encaminhado]</div> : null}
      <div className="wa-bubble-fileTop">
        <div className={`wa-bubble-fileIconWrap wa-bubble-fileIconWrap--${ext.toLowerCase()}`} aria-hidden="true">
          <span className="wa-bubble-fileExt">{ext}</span>
        </div>
        <div className="wa-bubble-fileMain">
          <span className="wa-bubble-fileName">{nome}</span>
          <span className="wa-bubble-fileTypeSize">{typeSize}</span>
        </div>
        <span className="wa-bubble-fileTimeMeta">
          <EditedLabel msg={msg} />
          <span className="wa-bubble-fileTime">{formatHora(msg?.criado_em)}</span>
          <MessageStatus msg={msg} isGroup={Boolean(isGroup)} />
        </span>
      </div>
      <MessageCaption texto={caption} show={Boolean(caption)} />
      <div className="wa-bubble-fileActions">
        {/*
         * "Abrir" abre o arquivo INLINE em nova aba, para qualquer tipo. O navegador
         * renderiza o que sabe (PDF, XML, imagens, texto) e baixa os que não sabe
         * (zip, exe, Office) — download imposto pelo navegador, nenhum site evita.
         *
         * Arquivo em /uploads (ou mídia nossa): `<a>` nativo. Arquivo recebido que
         * ainda depende da URL do provedor: botão que abre com recuperação (evita a
         * aba em branco quando o link do provedor já expirou).
         */}
        {needsRecovery ? (
          <button
            type="button"
            className="wa-bubble-fileAction"
            onClick={(e) => {
              e.stopPropagation();
              handleOpen();
            }}
            disabled={selectMode || busy}
            aria-busy={busy ? "true" : undefined}
          >
            {abrirLabel}
          </button>
        ) : (
          <a
            href={selectMode ? undefined : openHref}
            target="_blank"
            rel="noreferrer"
            className="wa-bubble-fileAction"
            aria-disabled={selectMode || !openHref}
            onClick={(e) => {
              e.stopPropagation();
              if (selectMode || !openHref) e.preventDefault();
            }}
          >
            Abrir
          </a>
        )}
        {showSave ? (
          <>
            <span className="wa-bubble-fileActionSep" aria-hidden="true">·</span>
            {needsRecovery ? (
              <button
                type="button"
                className="wa-bubble-fileAction"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload();
                }}
                disabled={selectMode || busy}
                aria-busy={busy ? "true" : undefined}
              >
                {salvarLabel}
              </button>
            ) : (
              <a
                href={downloadHref || mediaUrl}
                download={nome}
                className="wa-bubble-fileAction"
                onClick={(e) => e.stopPropagation()}
                target="_blank"
                rel="noreferrer"
              >
                Salvar como...
              </a>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
