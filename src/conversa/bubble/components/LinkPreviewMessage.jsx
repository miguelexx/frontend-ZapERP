import { useState } from "react";
import { IconLink, IconPhoto } from "@tabler/icons-react";

function isRenderableImage(value) {
  return typeof value === "string" && /^(https?:\/\/|data:image\/)/i.test(value.trim());
}

function domainOf(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./i, "");
  } catch {
    const m = raw.match(/^(?:https?:\/\/)?([^/?#]+)/i);
    return m ? m[1].replace(/^www\./i, "") : "";
  }
}

/**
 * Cartão de pré-visualização de link (igual ao do WhatsApp): foto + título + descrição + domínio.
 * Renderiza ACIMA do texto da mensagem. Clicar abre o link em nova aba.
 */
export default function LinkPreviewMessage({ meta }) {
  const [failed, setFailed] = useState(false);
  const m = meta && typeof meta === "object" ? meta : null;
  if (!m) return null;

  const url = typeof m.url === "string" ? m.url.trim() : "";
  const title = String(m.title || "").trim();
  const desc = String(m.description || "").trim();
  const domain = domainOf(url);
  const img = isRenderableImage(m.preview) ? m.preview : null;

  const open = (e) => {
    e?.stopPropagation?.();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="wa-linkPrev"
      aria-label="Pré-visualização de link"
      title={url || undefined}
      role={url ? "button" : undefined}
      tabIndex={url ? 0 : undefined}
      onClick={url ? open : undefined}
      onKeyDown={url ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e); } } : undefined}
    >
      {img && !failed ? (
        <img
          src={img}
          alt=""
          className="wa-linkPrev-img"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="wa-linkPrev-img wa-linkPrev-img--empty" aria-hidden="true">
          <IconPhoto size={26} stroke={1.4} />
        </span>
      )}
      <div className="wa-linkPrev-info">
        {title ? <strong className="wa-linkPrev-title" title={title}>{title}</strong> : null}
        {desc ? <span className="wa-linkPrev-desc">{desc}</span> : null}
        {domain ? (
          <span className="wa-linkPrev-domain"><IconLink size={12} stroke={1.8} /> {domain}</span>
        ) : null}
      </div>
    </div>
  );
}
