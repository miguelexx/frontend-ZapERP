import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconLink,
  IconPackage,
  IconPhoto,
  IconRefresh,
  IconSearch,
  IconSend,
  IconX,
} from "@tabler/icons-react";

function isRenderableImage(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function productImage(product) {
  if (isRenderableImage(product?.image)) return product.image;
  const images = Array.isArray(product?.images) ? product.images : [];
  return images.find(isRenderableImage) || null;
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

function PickerThumb({ product }) {
  const [failed, setFailed] = useState(false);
  const src = productImage(product);
  if (!src || failed) {
    return <span className="wa-catalogPicker-thumb wa-catalogPicker-thumb--empty" aria-hidden="true"><IconPhoto size={20} /></span>;
  }
  return (
    <span className="wa-catalogPicker-thumb">
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </span>
  );
}

export default function CatalogPickerModal({
  open,
  products,
  loading,
  error,
  sendingId,
  sendingCatalog,
  onClose,
  onReload,
  onSendProduct,
  onSendCatalogLink,
}) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    setSearch("");
    function onKey(event) {
      if (event.key === "Escape" && !sendingId && !sendingCatalog) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, sendingId, sendingCatalog]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => `${p.name || ""} ${p.description || ""} ${p.product_retailer_id || ""}`.toLowerCase().includes(term));
  }, [products, search]);

  if (!open || typeof document === "undefined") return null;
  const busy = !!sendingId || sendingCatalog;

  return createPortal(
    <div className="wa-catalogPicker-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="wa-catalogPicker" role="dialog" aria-modal="true" aria-label="Enviar do catálogo">
        <header className="wa-catalogPicker-head">
          <div>
            <h2>Catálogo</h2>
            <p>Escolha um item para enviar ao cliente</p>
          </div>
          <div className="wa-catalogPicker-headActions">
            <button type="button" className="wa-catalogPicker-icon" onClick={onReload} disabled={loading || busy} title="Atualizar" aria-label="Atualizar catálogo">
              <IconRefresh size={17} className={loading ? "wa-catalogPicker-spin" : ""} />
            </button>
            <button type="button" className="wa-catalogPicker-icon" onClick={onClose} disabled={busy} title="Fechar" aria-label="Fechar">
              <IconX size={18} />
            </button>
          </div>
        </header>

        <div className="wa-catalogPicker-search">
          <IconSearch size={16} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto"
            aria-label="Buscar produto"
            disabled={loading}
          />
        </div>

        <div className="wa-catalogPicker-body">
          {error ? (
            <div className="wa-catalogPicker-msg wa-catalogPicker-msg--error">
              <span>{error}</span>
              <button type="button" onClick={onReload}>Tentar novamente</button>
            </div>
          ) : loading ? (
            <div className="wa-catalogPicker-msg">
              <span className="wa-catalogPicker-spinner" /> Carregando catálogo…
            </div>
          ) : filtered.length === 0 ? (
            <div className="wa-catalogPicker-empty">
              <IconPackage size={26} />
              <p>{search.trim() ? "Nenhum produto encontrado." : "Nenhum produto no catálogo deste canal."}</p>
            </div>
          ) : (
            <ul className="wa-catalogPicker-list">
              {filtered.map((product) => {
                const price = formatPrice(product.price, product.currency);
                const isSending = sendingId === product.id;
                return (
                  <li key={product.id || product.product_retailer_id || product.name} className="wa-catalogPicker-item">
                    <PickerThumb product={product} />
                    <div className="wa-catalogPicker-info">
                      <strong title={product.name}>{product.name || "Produto sem nome"}</strong>
                      {price ? <span className="wa-catalogPicker-price">{price}</span> : null}
                    </div>
                    <button
                      type="button"
                      className="wa-catalogPicker-send"
                      onClick={() => onSendProduct(product)}
                      disabled={busy}
                      title="Enviar este produto"
                    >
                      {isSending ? <span className="wa-catalogPicker-spinner" /> : <IconSend size={16} />}
                      <span>{isSending ? "Enviando…" : "Enviar"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="wa-catalogPicker-foot">
          <button type="button" className="wa-catalogPicker-catalogBtn" onClick={onSendCatalogLink} disabled={busy || loading || !!error}>
            {sendingCatalog ? <span className="wa-catalogPicker-spinner" /> : <IconLink size={16} />}
            <span>{sendingCatalog ? "Enviando…" : "Enviar link do catálogo completo"}</span>
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
