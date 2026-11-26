import { useEffect, useState } from "react";
import { IconLink, IconPhoto } from "@tabler/icons-react";
import {
  LINK_PREVIEW_AR_MAX,
  LINK_PREVIEW_AR_MIN,
  applyAspectRatioVar,
  clampAspectRatio,
  recallAspectRatio,
  rememberAspectRatio,
} from "../utils/mediaAspectRatio";

/** Abaixo disto a miniatura não sustenta o cartão grande — o WhatsApp cai no cartão compacto. */
const MIN_HERO_SIDE = 180;
/*
 * Valor no cache de proporções que significa "cartão compacto" (25/11/2026). O cache persistido
 * só aceita números 0 < v < 10 e as proporções do cartão ficam entre 0.92 e 1.91, então 9 não
 * colide. Sem lembrar o compacto, o cartão nascia grande e encolhia ~140px depois de a miniatura
 * decodificar — em toda abertura e remontagem.
 */
const COMPACT_SENTINEL = 9;

/** Chave por MENSAGEM (`m:` persiste entre recargas); sem id, a URL http (só em memória). */
function linkPreviewCacheKey(msg, img) {
  const id = msg && (msg.tempId || msg.client_temp_id || msg.id || msg.whatsapp_id);
  if (id) return `m:lp:${id}`;
  return img && /^https?:\/\//i.test(img) ? `lp:${img}` : "";
}

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
 *
 * A foto ocupa a largura inteira do cartão e o cartão ocupa a largura inteira da bolha — a altura
 * sai da proporção real da miniatura (limitada entre quase quadrada e 1.91/1, como o WhatsApp),
 * e não de uma moldura fixa que cortava retrato no meio. Miniatura pequena (favicon, ícone de
 * app) não vira "foto gigante borrada": cai no layout compacto, com a imagem ao lado do texto.
 */
export default function LinkPreviewMessage({ meta, msg }) {
  const m = meta && typeof meta === "object" ? meta : null;
  const url = m && typeof m.url === "string" ? m.url.trim() : "";
  const img = m && isRenderableImage(m.preview) ? m.preview.trim() : null;
  const ratioKey = img ? linkPreviewCacheKey(msg, img) : "";

  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState(() => {
    const v = recallAspectRatio(ratioKey);
    return v === COMPACT_SENTINEL ? 0 : v;
  });
  const [compact, setCompact] = useState(() => recallAspectRatio(ratioKey) === COMPACT_SENTINEL);

  /* Miniatura nova: o layout volta a ser decidido por ela. */
  const imgSig = img ? `${img.length}:${img.slice(0, 96)}:${img.slice(-32)}` : "";
  useEffect(() => {
    setFailed(false);
  }, [imgSig]);
  /* Chave nova (id chegando depois): herda o que já se sabia, como a foto (`|| prev`). */
  useEffect(() => {
    const v = recallAspectRatio(ratioKey);
    if (v === COMPACT_SENTINEL) {
      setCompact(true);
      return;
    }
    if (v > 0) {
      setCompact(false);
      setRatio(v);
    }
  }, [ratioKey]);

  if (!m) return null;

  const title = String(m.title || "").trim();
  const desc = String(m.description || "").trim();
  const domain = domainOf(url);

  const open = (e) => {
    e?.stopPropagation?.();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const aoCarregar = (e) => {
    const el = e?.currentTarget;
    const w = Number(el?.naturalWidth || 0);
    const h = Number(el?.naturalHeight || 0);
    if (!(w > 0) || !(h > 0)) return;
    if (w < MIN_HERO_SIDE || h < MIN_HERO_SIDE) {
      rememberAspectRatio(ratioKey, COMPACT_SENTINEL);
      setCompact(true);
      return;
    }
    const r = clampAspectRatio(w, h, LINK_PREVIEW_AR_MIN, LINK_PREVIEW_AR_MAX);
    if (!(r > 0)) return;
    rememberAspectRatio(ratioKey, r);
    /* Mesma regra da foto: visível com a conversa no fim desliza; fora da tela troca na hora.
       Aplicado na própria miniatura (é ela que tem a proporção animável). */
    if (!compact) applyAspectRatioVar(el, r);
    setCompact(false);
    setRatio((atual) => (atual === r ? atual : r));
  };

  const mostraImagem = img && !failed;

  return (
    <div
      className={`wa-linkPrev${compact ? " wa-linkPrev--compact" : ""}`}
      style={!compact && ratio > 0 ? { "--wa-media-ar": ratio } : undefined}
      aria-label={`Abrir link${domain ? ` em ${domain}` : ""}`}
      title={url || undefined}
      role={url ? "button" : undefined}
      tabIndex={url ? 0 : undefined}
      onClick={url ? open : undefined}
      onKeyDown={url ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e); } } : undefined}
    >
      {mostraImagem ? (
        <img
          src={img}
          alt=""
          className="wa-linkPrev-img"
          /* eager (como a foto): miniatura rápida resolve sob a máscara de abertura. */
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={aoCarregar}
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
