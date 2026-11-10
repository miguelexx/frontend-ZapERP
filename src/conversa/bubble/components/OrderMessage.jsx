import { useState } from "react";
import { IconPhoto, IconShoppingCart } from "@tabler/icons-react";

function isRenderableImage(value) {
  return typeof value === "string" && /^(https?:\/\/|data:image\/)/i.test(value.trim());
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

/** Miniatura de um item (imagem do item → preview do pedido → ícone). */
function ItemThumb({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed && isRenderableImage(src)) {
    return (
      <img
        src={src}
        alt={alt || ""}
        className="wa-orderMsg-itemImg"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="wa-orderMsg-itemImg wa-orderMsg-itemImg--empty" aria-hidden="true">
      <IconPhoto size={22} stroke={1.4} />
    </span>
  );
}

/**
 * Bolha de PEDIDO (carrinho) recebido do cliente pelo catálogo WhatsApp Business.
 * Mostra cada item (foto + nome + qtd × preço) e o total. Quando os itens não vieram
 * (busca falhou/sem token), cai na miniatura do pedido (preview) + contagem + total.
 */
export default function OrderMessage({ order }) {
  const o = order && typeof order === "object" ? order : null;
  if (!o) {
    return (
      <div className="wa-orderMsg" aria-label="Pedido">
        <div className="wa-orderMsg-head">
          <span className="wa-orderMsg-tag" aria-hidden="true"><IconShoppingCart size={14} stroke={1.9} /></span>
          <strong>Pedido recebido</strong>
        </div>
      </div>
    );
  }

  const items = Array.isArray(o.items) ? o.items.filter((it) => it && typeof it === "object") : [];
  const itemCount = Number(o.item_count);
  const countLabel = Number.isFinite(itemCount) && itemCount > 0
    ? `${itemCount} ${itemCount > 1 ? "itens" : "item"}`
    : (items.length ? `${items.length} ${items.length > 1 ? "itens" : "item"}` : null);
  const total = formatPrice(o.total_price, o.currency);
  const curr = o.currency;

  return (
    <div className="wa-orderMsg" aria-label="Pedido">
      <div className="wa-orderMsg-head">
        <span className="wa-orderMsg-tag" aria-hidden="true"><IconShoppingCart size={14} stroke={1.9} /></span>
        <strong>Pedido recebido</strong>
        {countLabel ? <span className="wa-orderMsg-count">{countLabel}</span> : null}
      </div>

      {items.length ? (
        <ul className="wa-orderMsg-items">
          {items.map((it, i) => {
            const name = String(it.name || "").trim() || "Produto";
            const qty = Number(it.quantity);
            const unit = formatPrice(it.price, it.currency || curr);
            return (
              <li className="wa-orderMsg-item" key={it.product_retailer_id || `${name}-${i}`}>
                <ItemThumb src={it.image || o.preview} alt={name} />
                <div className="wa-orderMsg-itemInfo">
                  <span className="wa-orderMsg-itemName" title={name}>{name}</span>
                  <span className="wa-orderMsg-itemMeta">
                    {Number.isFinite(qty) && qty > 0 ? `${qty}× ` : ""}{unit || ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="wa-orderMsg-previewOnly">
          <ItemThumb src={o.preview} alt="Pedido" />
          <span className="wa-orderMsg-previewHint">Itens no WhatsApp</span>
        </div>
      )}

      {total ? (
        <div className="wa-orderMsg-total">
          <span>Total</span>
          <strong>{total}</strong>
        </div>
      ) : null}
    </div>
  );
}
