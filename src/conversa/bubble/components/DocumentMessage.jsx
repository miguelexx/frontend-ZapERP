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
import { salvarMidiaComFeedback, saveBlobAs } from "../../mediaDownload";
import { cancelUpload, isUploadCancelable, uploadBatchSize } from "../../uploadProgressStore";
import UploadProgressRing, { uploadTempIdOf, useUploadProgress } from "./UploadProgressRing";

function toast(payload) {
  try {
    useNotificationStore?.getState()?.showToast?.(payload);
  } catch {
    /* toast é best-effort; nunca deve derrubar o clique */
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
  /* Qual ação está em curso: "open" | "save" | null. Um booleano só mostrava "Abrindo… ·
     Salvando…" ao mesmo tempo ao clicar em qualquer uma (26/11/2026). As duas continuam
     travadas enquanto uma corre; só o rótulo da que corre muda. */
  const [busyAction, setBusyAction] = useState(null);
  const busy = busyAction != null;
  /* Documento ainda subindo: anel no ícone e "Enviando… 42% · Cancelar" no lugar de
     "Abrir · Salvar como..." (abrir/salvar um arquivo que nem chegou ao servidor não faz sentido). */
  const uploadProgress = useUploadProgress(msg);
  const uploadTempId = uploadTempIdOf(msg);

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
    // /media/r2/: mídia migrada ao Cloudflare R2 — o backend responde ja_persistido com
    // essa URL (tão válida quanto /uploads); antes ela era tratada como "expirou".
    if (
      r?.ok &&
      typeof r.url === "string" &&
      (r.url.startsWith("/uploads/") || r.url.startsWith("/media/r2/"))
    ) {
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
    setBusyAction("open");
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
        saveBlobAs(blob, nome);
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
      setBusyAction(null);
    }
  }, [selectMode, busy, openHref, recuperarHrefs, nome]);

  /*
   * Salvar passa pelo salvador compartilhado (conversa/mediaDownload.js): mesma busca
   * autenticada + recuperação da cópia que já existia aqui, mais a folha nativa do iOS —
   * no iPhone/iPad o Safari ignora `<a download>` em `blob:` e o clique não gravava nada.
   */
  const handleDownload = useCallback(async () => {
    if (selectMode || busy) return;
    setBusyAction("save");
    try {
      await salvarMidiaComFeedback({
        msg,
        url: mediaUrl,
        fileName: nome,
        tipo: "arquivo",
        hrefs: downloadHref ? [downloadHref] : [],
        showToast: toast,
        toasts: {
          expirado: TOAST_EXPIRADO,
          falha: { ...TOAST_FALHA, title: "Não foi possível salvar" },
        },
      });
    } finally {
      setBusyAction(null);
    }
  }, [selectMode, busy, downloadHref, msg, mediaUrl, nome]);

  const abrirLabel = busyAction === "open" ? "Abrindo…" : "Abrir";
  const salvarLabel = busyAction === "save" ? "Salvando…" : "Salvar como...";
  const showSave = Boolean(mediaUrl) || needsRecovery;
  const uploading = uploadProgress != null;
  const uploadPct = uploading && uploadProgress < 1 ? Math.round(uploadProgress * 100) : null;
  const podeCancelarUpload = uploading && uploadPct != null && isUploadCancelable(uploadTempId);
  /* Lote = um pedido só: cancelar um documento cancela todos (27/11/2026). O botão diz isso
     na tela — antes era só "Cancelar" e o lote inteiro sumia sem aviso. */
  const loteUpload = podeCancelarUpload ? uploadBatchSize(uploadTempId) : 0;

  return (
    <div className={`wa-bubble-fileCard ${out ? "wa-bubble-fileCard--out" : ""}`} onClick={handleCardClick}>
      {encaminhado ? <div className="wa-bubble-encaminhado">[Encaminhado]</div> : null}
      <div className="wa-bubble-fileTop">
        <div className={`wa-bubble-fileIconWrap wa-bubble-fileIconWrap--${ext.toLowerCase()}`} aria-hidden="true">
          <span className="wa-bubble-fileExt">{ext}</span>
          {/* Absoluto no ícone (já `position: relative`): não muda o tamanho do card. O X fica
              na linha de ações ("Cancelar"), alvo maior que o anel de 36px. */}
          {uploading ? (
            <span className="wa-uploadOverlay wa-uploadOverlay--doc">
              <UploadProgressRing
                tempId={uploadTempId}
                progress={uploadProgress}
                variant="doc"
                showCancel={false}
              />
            </span>
          ) : null}
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
        {uploading ? (
          <>
            <span className="wa-bubble-fileUploadStatus">
              {uploadPct != null ? `Enviando… ${uploadPct}%` : "Enviando…"}
            </span>
            {podeCancelarUpload ? (
              <>
                <span className="wa-bubble-fileActionSep" aria-hidden="true">·</span>
                <button
                  type="button"
                  className="wa-bubble-fileAction"
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelUpload(uploadTempId);
                  }}
                  disabled={selectMode}
                  title={loteUpload > 1 ? `Cancela o envio dos ${loteUpload} arquivos` : undefined}
                >
                  {loteUpload > 1 ? `Cancelar todos (${loteUpload})` : "Cancelar"}
                </button>
              </>
            ) : null}
          </>
        ) : (
          <>
            {/*
             * "Abrir" abre o arquivo INLINE em nova aba, para qualquer tipo. O navegador
             * renderiza o que sabe (PDF, XML, imagens, texto) e baixa os que não sabe
             * (zip, exe, Office) — download imposto pelo navegador, nenhum site evita.
             *
             * Sempre botão + busca autenticada (nunca `<a href>` com o token na URL).
             * O href carregava o JWT de sessão inteiro na query — e esse JWT é de 30 dias,
             * com o perfil do usuário dentro. Como "Abrir"/"Salvar como..." são exatamente
             * os controles que o atendente copia e repassa ("segue o arquivo"), o link virava
             * uma credencial compartilhável, além de entrar no histórico e na barra de
             * endereços. `handleOpen` já baixava o binário autenticado e abria por blob:
             * aqui só deixamos de ter os dois caminhos (auditoria 10/10/2026).
             */}
            <button
              type="button"
              className="wa-bubble-fileAction"
              onClick={(e) => {
                e.stopPropagation();
                handleOpen();
              }}
              disabled={selectMode || busy || (!openHref && !needsRecovery)}
              aria-busy={busyAction === "open" ? "true" : undefined}
            >
              {abrirLabel}
            </button>
            {showSave ? (
              <>
                <span className="wa-bubble-fileActionSep" aria-hidden="true">·</span>
                {/* Mesmo motivo do "Abrir": `<a href>` expunha o token de sessão na URL. */}
                <button
                  type="button"
                  className="wa-bubble-fileAction"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload();
                  }}
                  disabled={selectMode || busy}
                  aria-busy={busyAction === "save" ? "true" : undefined}
                >
                  {salvarLabel}
                </button>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
