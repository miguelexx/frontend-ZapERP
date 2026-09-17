import { useState } from "react";
import { IconPhoto, IconShoppingBag } from "@tabler/icons-react";

function isRenderableImage(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function formatPrice(price, currency) {
  const value = Number(price);
  if (!Number.isFinite(value)) return "";
  const code = String(currency || "").trim().toUpperCase();
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: code || "BRL" }).format(value);
  } catch {
    return `${value.toFixed(2)}${code ? ` ${code}` : ""}`;
  }
}

/** Bolha de produto/catálogo enviado ao cliente (cartão premium, estilo WhatsApp). */
export default function ProductMessage({ product, catalog, texto }) {
  const [imgFailed, setImgFailed] = useState(false);
  const prod = product && typeof product === "object" ? product : null;

  // Catálogo completo (link) — cartão compacto.
  if (!prod) {
    const title = String(catalog?.title || "").trim();
    return (
      <div className="wa-productMsg wa-productMsg--catalog" aria-label="Catálogo">
        <span className="wa-productMsg-catalogIcon" aria-hidden="true">
          <IconShoppingBag size={22} stroke={1.7} />
        </span>
        <div className="wa-productMsg-catalogText">
          <strong>{title || "Catálogo de produtos"}</strong>
          <span>Ver no WhatsApp</span>
        </div>
      </div>
    );
  }

  const name = String(prod.name || "").trim();
  const image = isRenderableImage(prod.image) ? prod.image : null;
  const price = formatPrice(prod.price, prod.currency);

  return (
    <div className="wa-productMsg" aria-label="Produto">
      <div className="wa-productMsg-media">
        {image && !imgFailed ? (
          <img src={image} alt={name || ""} loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <span className="wa-productMsg-mediaEmpty" aria-hidden="true"><IconPhoto size={30} stroke={1.4} /></span>
        )}
        <span className="wa-productMsg-tag" aria-hidden="true">
          <IconShoppingBag size={13} stroke={1.9} /> Produto
        </span>
      </div>
      <div className="wa-productMsg-info">
        <strong className="wa-productMsg-name" title={name}>{name || "Produto"}</strong>
        {price ? <span className="wa-productMsg-price">{price}</span> : null}
      </div>
    </div>
  );
}
