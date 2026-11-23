import { useEffect, useState } from "react";
import {
  IconBrandFacebook,
  IconBrandInstagram,
  IconExternalLink,
  IconLink,
  IconPlayerPlayFilled,
  IconSpeakerphone,
} from "@tabler/icons-react";
import { adDomain, adKicker, adPlatform, isRenderableAdImage, safeHttpUrl } from "../utils/adReferral";

const PLATFORM_LABEL = { instagram: "Instagram", facebook: "Facebook" };

/**
 * Cartão de ANÚNCIO "clique para WhatsApp" (Instagram/Facebook Ads), igual ao do WhatsApp:
 * criativo do anúncio + título + texto + origem, ACIMA da mensagem do cliente. Selo "Anúncio"
 * para o atendente saber de onde o lead veio. Clicar abre o anúncio. A miniatura vem do CDN da
 * Meta e expira com o tempo: sem ela, o cartão cai num fundo com a cor da plataforma.
 */
export default function AdReferralMessage({ ad }) {
  const a = ad && typeof ad === "object" ? ad : null;
  const img = a && isRenderableAdImage(a.image) ? a.image.trim() : null;
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, [img]);

  if (!a) return null;

  const platform = adPlatform(a);
  const url = safeHttpUrl(a.source_url);
  const title = String(a.title || "").trim();
  const body = String(a.body || "").trim();
  const domain = adDomain(a, platform);
  const isVideo = String(a.media_type || "").toLowerCase() === "video";
  const kicker = adKicker(a);
  const PlatformIcon = platform === "instagram" ? IconBrandInstagram
    : platform === "facebook" ? IconBrandFacebook
    : null;
  const mostraImagem = img && !failed;

  const open = (e) => {
    e?.stopPropagation?.();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const rotulo = `${kicker}${platform ? ` no ${PLATFORM_LABEL[platform]}` : ""}${title ? `: ${title}` : ""}`;

  return (
    <div
      className={`wa-linkPrev wa-adRef${platform ? ` wa-adRef--${platform}` : ""}`}
      aria-label={url ? `Abrir ${rotulo}` : rotulo}
      title={url || undefined}
      role={url ? "button" : undefined}
      tabIndex={url ? 0 : undefined}
      onClick={url ? open : undefined}
      onKeyDown={url ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e); } } : undefined}
    >
      <div className="wa-adRef-media">
        {mostraImagem ? (
          <img
            src={img}
            alt=""
            className="wa-adRef-img"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="wa-adRef-img wa-adRef-img--brand" aria-hidden="true">
            {PlatformIcon ? <PlatformIcon size={40} stroke={1.5} /> : <IconSpeakerphone size={36} stroke={1.5} />}
          </span>
        )}

        <span className="wa-adRef-kicker" aria-hidden="true">
          <IconSpeakerphone size={12} stroke={2} />
          {kicker}
        </span>

        {isVideo && mostraImagem ? (
          <span className="wa-adRef-play" aria-hidden="true"><IconPlayerPlayFilled size={20} /></span>
        ) : null}

        {PlatformIcon && mostraImagem ? (
          <span className="wa-adRef-platform" aria-hidden="true"><PlatformIcon size={20} stroke={1.8} /></span>
        ) : null}
      </div>

      <div className="wa-linkPrev-info">
        {title ? <strong className="wa-linkPrev-title" title={title}>{title}</strong> : null}
        {body ? <span className="wa-linkPrev-desc wa-adRef-body">{body}</span> : null}
        {domain || url ? (
          <span className="wa-adRef-foot">
            {domain ? (
              <span className="wa-linkPrev-domain"><IconLink size={12} stroke={1.8} /> {domain}</span>
            ) : <span />}
            {url ? (
              <span className="wa-adRef-cta">Ver anúncio <IconExternalLink size={12} stroke={2} /></span>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
