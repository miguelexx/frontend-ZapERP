/**
 * Regras puras do cartão de ANÚNCIO "clique para WhatsApp" (AdReferralMessage) — sem React,
 * para o teste de bolhas (Node) cobrir a lógica de verdade.
 */

/** Só http(s) é aberto: o link vem do webhook e vira window.open. */
export function safeHttpUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^https?:\/\//i.test(raw) ? raw : "";
}

export function isRenderableAdImage(value) {
  return typeof value === "string" && /^(https?:\/\/|data:image\/)/i.test(value.trim());
}

export function hostOf(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    const m = raw.match(/^(?:https?:\/\/)?([^/?#]+)/i);
    return m ? m[1].replace(/^www\./i, "").toLowerCase() : "";
  }
}

/** Instagram × Facebook pela origem do anúncio (link, mídia ou miniatura); null se não der p/ saber. */
export function adPlatform(ad) {
  const hosts = [ad?.source_url, ad?.media_url, ad?.image].map(hostOf).join(" ");
  if (/instagram\.com|instagr\.am|cdninstagram/.test(hosts)) return "instagram";
  if (/facebook\.com|fb\.me|fb\.com|fbcdn|fb\.watch/.test(hosts)) return "facebook";
  return null;
}

/** Domínio do rodapé, como o WhatsApp mostra: instagram.com / facebook.com / host do link. */
export function adDomain(ad, platform = adPlatform(ad)) {
  if (platform === "instagram") return "instagram.com";
  if (platform === "facebook") return "facebook.com";
  return hostOf(safeHttpUrl(ad?.source_url));
}

/** "Anúncio" ou "Publicação" (anúncio impulsionado a partir de um post). */
export function adKicker(ad) {
  return String(ad?.source_type || "").toLowerCase() === "post" ? "Publicação" : "Anúncio";
}
