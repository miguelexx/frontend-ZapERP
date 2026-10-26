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

function productKey(product) {
  return String(product?.id ?? product?.product_id ?? product?.product_retailer_id ?? product?.name ?? "");
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
  sending,
  sendProgress,
  sendingCatalog,
  onClose,
  onReload,
  onSendProducts,
  onSendCatalogLink,
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    if (!open) return undefined;
    setSearch("");
    setSelected(new Set());
    function onKey(event) {
      if (event.key === "Escape" && !sending && !sendingCatalog) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, sending, sendingCatalog]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => `${p.name || ""} ${p.description || ""} ${p.product_retailer_id || ""}`.toLowerCase().includes(term));
  }, [products, search]);

  if (!open || typeof document === "undefined") return null;
  const busy = sending || sendingCatalog;

  function toggle(key) {
    if (busy) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filteredKeys = filtered.map(productKey);
  const allVisibleSelected = filteredKeys.length > 0 && filteredKeys.every((k) => selected.has(k));

  function toggleAllVisible() {
    if (busy) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filteredKeys.forEach((k) => next.delete(k));
      else filteredKeys.forEach((k) => next.add(k));
      return next;
    });
  }

  function handleSend() {
    if (busy || selected.size === 0) return;
    // Mantém a ordem original do catálogo.
    const chosen = products.filter((p) => selected.has(productKey(p)));
    // Remove da seleção cada produto já entregue → reenvio após falha parcial
    // manda só os que faltaram.
    onSendProducts(chosen, (sent) => {
      const key = productKey(sent);
      setSelected((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    });
  }

  const selectedCount = selected.size;
  const progressLabel = sendProgress
    ? `Enviando ${sendProgress.done} de ${sendProgress.total}…`
    : selectedCount > 0
      ? `Enviar ${selectedCount} ${selectedCount > 1 ? "produtos" : "produto"}`
      : "Selecione produtos para enviar";

  return createPortal(
    <div className="wa-catalogPicker-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="wa-catalogPicker" role="dialog" aria-modal="true" aria-label="Enviar do catálogo">
        <header className="wa-catalogPicker-head">
          <div>
            <h2>Catálogo</h2>
            <p>Selecione os produtos para enviar ao cliente</p>
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

        {!loading && !error && filtered.length > 0 ? (
          <div className="wa-catalogPicker-toolbar">
            <button type="button" className="wa-catalogPicker-selectAll" onClick={toggleAllVisible} disabled={busy}>
              {allVisibleSelected ? "Limpar seleção" : "Selecionar todos"}
            </button>
            {selectedCount > 0 ? <span className="wa-catalogPicker-selCount">{selectedCount} selecionado{selectedCount > 1 ? "s" : ""}</span> : null}
          </div>
        ) : null}

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
                const key = productKey(product);
                const price = formatPrice(product.price, product.currency);
                const isSelected = selected.has(key);
                return (
                  <li key={key || product.name} className={`wa-catalogPicker-item${isSelected ? " is-selected" : ""}`}>
                    <label className="wa-catalogPicker-row">
                      <input
                        type="checkbox"
                        className="wa-catalogPicker-check"
                        checked={isSelected}
                        onChange={() => toggle(key)}
                        disabled={busy}
                      />
                      <PickerThumb product={product} />
                      <div className="wa-catalogPicker-info">
                        <strong title={product.name}>{product.name || "Produto sem nome"}</strong>
                        {price ? <span className="wa-catalogPicker-price">{price}</span> : null}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="wa-catalogPicker-foot">
          <button
            type="button"
            className="wa-catalogPicker-sendBtn"
            onClick={handleSend}
            disabled={busy || selectedCount === 0 || loading || !!error}
            title="Enviar os produtos selecionados"
          >
            {sending ? <span className="wa-catalogPicker-spinner" /> : <IconSend size={16} />}
            <span>{progressLabel}</span>
          </button>
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
