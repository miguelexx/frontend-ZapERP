import { formatMessageTime, getContactRowsFromMessage, isMessageMine, documentKindLabel } from "./messageUtils";
import { internalMediaAbsoluteUrl } from "./mediaUrl.js";

function BubbleMeta({ createdAt }) {
  const time = formatMessageTime(createdAt);
  return (
    <div className="ic-thread-bubble-meta">
      <time className="ic-thread-bubble-time" dateTime={createdAt ? String(createdAt) : undefined}>
        {time}
      </time>
    </div>
  );
}

/** @param {{ message: Record<string, unknown> }} p */
function MessageBody({ message }) {
  const type = String(message.messageType || "text").toLowerCase();
  const content = String(message.content || "").trim();
  const payload = message.payload && typeof message.payload === "object" ? message.payload : {};
  const lat = payload.latitude ?? payload.lat;
  const lng = payload.longitude ?? payload.lng;
  const address = payload.address != null ? String(payload.address) : "";
  const duration = payload.duration != null ? Number(payload.duration) : null;

  const mediaUrl = message.mediaUrl ? internalMediaAbsoluteUrl(message.mediaUrl) : null;
  const fileName = message.fileName ? String(message.fileName) : "arquivo";
  const mime = message.mimeType ? String(message.mimeType) : "";

  if (type === "image" || type === "sticker") {
    if (!mediaUrl) {
      return <p className="ic-thread-bubble-text ic-thread-muted">Imagem indisponível</p>;
    }
    return (
      <div className="ic-thread-bubble-media">
        <img
          src={mediaUrl}
          alt={type === "sticker" ? "Figurinha" : content || "Imagem"}
          className={type === "sticker" ? "ic-thread-media-img ic-thread-media-img--sticker" : "ic-thread-media-img"}
          loading="lazy"
        />
        {content ? (
          <p className="ic-thread-bubble-text ic-thread-bubble-caption">{content}</p>
        ) : null}
      </div>
    );
  }

  if (type === "audio") {
    if (!mediaUrl) {
      return <p className="ic-thread-bubble-text ic-thread-muted">Áudio indisponível</p>;
    }
    return (
      <div className="ic-thread-bubble-media">
        <audio className="ic-thread-audio" controls src={mediaUrl} preload="metadata">
          Áudio
        </audio>
        {duration != null && !Number.isNaN(duration) && duration > 0 ? (
          <span className="ic-thread-audio-dur">{Math.round(duration)}s</span>
        ) : null}
        {content ? <p className="ic-thread-bubble-text ic-thread-bubble-caption">{content}</p> : null}
      </div>
    );
  }

  if (type === "video") {
    if (!mediaUrl) {
      return <p className="ic-thread-bubble-text ic-thread-muted">Vídeo indisponível</p>;
    }
    return (
      <div className="ic-thread-bubble-media">
        <video className="ic-thread-video" controls src={mediaUrl} playsInline preload="metadata">
          Vídeo
        </video>
        {content ? <p className="ic-thread-bubble-text ic-thread-bubble-caption">{content}</p> : null}
      </div>
    );
  }

  if (type === "document") {
    const label = documentKindLabel(mime);
    const href = mediaUrl || "#";
    return (
      <div className="ic-thread-bubble-doc">
        <span className="ic-thread-doc-icon" aria-hidden>
          📄
        </span>
        <div className="ic-thread-doc-body">
          <span className="ic-thread-doc-kind">{label}</span>
          <span className="ic-thread-doc-name">{fileName}</span>
        </div>
        {mediaUrl ? (
          <a className="ic-thread-doc-link" href={href} download={fileName} target="_blank" rel="noopener noreferrer">
            Baixar
          </a>
        ) : (
          <span className="ic-thread-muted">Indisponível</span>
        )}
        {content ? <p className="ic-thread-bubble-text ic-thread-bubble-caption">{content}</p> : null}
      </div>
    );
  }

  if (type === "location") {
    const hasCoords = lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng));
    const mapsUrl = hasCoords ? `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}` : null;
    return (
      <div className="ic-thread-bubble-loc">
        {address ? <p className="ic-thread-loc-addr">{address}</p> : <p className="ic-thread-muted">Localização</p>}
        {mapsUrl ? (
          <a className="ic-thread-loc-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">
            Abrir no mapa
          </a>
        ) : null}
        {content ? <p className="ic-thread-bubble-text ic-thread-bubble-caption">{content}</p> : null}
      </div>
    );
  }

  if (type === "contact") {
    const rows = getContactRowsFromMessage(message);
    if (!rows.length) {
      return <p className="ic-thread-bubble-text ic-thread-muted">Contato indisponível</p>;
    }
    const multi = rows.length > 1;
    return (
      <div className={`ic-thread-bubble-contacts${multi ? " ic-thread-bubble-contacts--multi" : ""}`}>
        {multi ? <div className="ic-thread-contacts-title">Contatos compartilhados ({rows.length})</div> : null}
        <ul className="ic-thread-contacts-list">
          {rows.map((row, idx) => {
            const tel = row.phone.replace(/\s/g, "");
            const telHref = tel ? `tel:${encodeURIComponent(tel)}` : null;
            const key = `${row.phone}-${idx}`;
            return (
              <li key={key} className="ic-thread-contact-card">
                {row.name ? <div className="ic-thread-card-title">{row.name}</div> : <div className="ic-thread-card-title">Contato</div>}
                {row.phone ? (
                  telHref ? (
                    <a className="ic-thread-card-phone" href={telHref}>
                      {row.phone}
                    </a>
                  ) : (
                    <span className="ic-thread-card-phone">{row.phone}</span>
                  )
                ) : null}
                {row.organization ? <div className="ic-thread-card-org">{row.organization}</div> : null}
                {row.phone ? (
                  <button
                    type="button"
                    className="ic-thread-card-copy"
                    onClick={() => {
                      void navigator.clipboard?.writeText(row.phone).catch(() => {});
                    }}
                  >
                    Copiar telefone
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {content ? <p className="ic-thread-bubble-text ic-thread-bubble-caption">{content}</p> : null}
      </div>
    );
  }

  /* text e fallback */
  return (
    <p className="ic-thread-bubble-text">
      {content ? (
        content
      ) : (
        <span className="ic-thread-muted">(sem texto)</span>
      )}
    </p>
  );
}

/**
 * Bolha de mensagem — alinhamento e cores controlados por CSS (.ic-thread-msg--mine).
 */
export default function InternalChatMessageBubble({ message, myUserId, otherUserId, cluster }) {
  const mine = isMessageMine(message, myUserId, otherUserId);
  const deleted = Boolean(message.isDeleted);

  return (
    <li
      className={`ic-thread-msg${mine ? " ic-thread-msg--mine" : ""}${cluster ? " ic-thread-msg--cluster" : ""}`}
    >
      <div className={`ic-thread-bubble${deleted ? " ic-thread-bubble--deleted" : ""}`}>
        {deleted ? (
          <>
            <p className="ic-thread-bubble-text">
              <span className="ic-thread-muted">Mensagem apagada</span>
            </p>
            <BubbleMeta createdAt={message.createdAt} />
          </>
        ) : (
          <>
            <MessageBody message={message} />
            <BubbleMeta createdAt={message.createdAt} />
          </>
        )}
      </div>
    </li>
  );
}
