import { formatHora } from "../../utils/conversaViewHelpers";
import {
  looksLikeDocumentFilenameOnly,
  resolveDownloadFilename,
  getFileExt,
  formatFileSize,
  buildMediaOpenHref,
  buildMediaDownloadHref,
} from "../../utils/conversaViewHelpers";
import MessageStatus from "./MessageStatus";

/**
 * Card de arquivo estilo WhatsApp: ícone com extensão, nome, tipo/tamanho,
 * timestamp, ticks e links "Abrir" / "Salvar como..."
 */
export default function DocumentMessage({ msg, mediaUrl, selectMode, onOpenMedia, isGroup, out }) {
  const nome = resolveDownloadFilename(
    msg?.nome_arquivo ?? msg?.n ?? (looksLikeDocumentFilenameOnly(msg?.texto) ? msg?.texto : null),
    mediaUrl
  );
  const ext = getFileExt(nome);
  const bytes = msg?.tamanho ?? msg?.tamanho_bytes;
  const size = formatFileSize(bytes);
  const typeSize = size ? `${ext} · ${size}` : ext;
  const encaminhado = !!msg?.encaminhado || (typeof msg?.texto === "string" && msg.texto.trimStart().startsWith("[Encaminhado]"));
  const openHref = buildMediaOpenHref(msg?.url, msg?.url_absoluta, nome) || mediaUrl;

  const handleCardClick = (e) => {
    if (!selectMode) e.stopPropagation();
  };

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
          <span className="wa-bubble-fileTime">{formatHora(msg?.criado_em)}</span>
          <MessageStatus msg={msg} isGroup={Boolean(isGroup)} />
        </span>
      </div>
      <div className="wa-bubble-fileActions">
        {ext === "PDF" ? (
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
        ) : (
          <button
            type="button"
            className="wa-bubble-fileAction"
            disabled={!!selectMode}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!selectMode && openHref) onOpenMedia?.(openHref, "arquivo", nome);
            }}
          >
            Abrir
          </button>
        )}
        {mediaUrl ? (
          <>
            <span className="wa-bubble-fileActionSep" aria-hidden="true">·</span>
            <a
              href={buildMediaDownloadHref(msg?.url, msg?.url_absoluta, nome) || mediaUrl}
              download={nome}
              className="wa-bubble-fileAction"
              onClick={(e) => e.stopPropagation()}
              target="_blank"
              rel="noreferrer"
            >
              Salvar como...
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}
