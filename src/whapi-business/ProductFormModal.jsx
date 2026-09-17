import { useEffect, useMemo, useRef, useState } from "react";
import { IconPhoto, IconPlus, IconTrash, IconX } from "@tabler/icons-react";

const CURRENCIES = ["BRL", "USD", "EUR", "GBP", "ARS", "PYG", "CLP", "UYU"];

function isRenderableImage(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function toForm(product) {
  return {
    name: String(product?.name || ""),
    description: String(product?.description || ""),
    price: product?.price != null ? String(product.price) : "",
    currency: String(product?.currency || "BRL").toUpperCase(),
    availability: String(product?.availability || "in stock").toLowerCase().includes("out") ? "out of stock" : "in stock",
    images: Array.isArray(product?.images) && product.images.length
      ? product.images.map((v) => String(v || ""))
      : [""],
    product_retailer_id: String(product?.product_retailer_id || ""),
    url: String(product?.url || ""),
    is_hidden: product?.is_hidden === true,
  };
}

export default function ProductFormModal({ open, product, saving, onClose, onSubmit }) {
  const editing = !!product?.id;
  const [form, setForm] = useState(() => toForm(product));
  const [error, setError] = useState("");
  const closeRef = useRef(null);

  useEffect(() => {
    if (open) {
      setForm(toForm(product));
      setError("");
      closeRef.current?.focus();
    }
  }, [open, product]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === "Escape" && !saving) onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  const previewImage = useMemo(() => form.images.find(isRenderableImage) || null, [form.images]);

  if (!open) return null;

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setImageAt(i, value) {
    setForm((f) => ({ ...f, images: f.images.map((img, idx) => (idx === i ? value : img)) }));
  }

  function addImage() {
    setForm((f) => (f.images.length >= 10 ? f : { ...f, images: [...f.images, ""] }));
  }

  function removeImage(i) {
    setForm((f) => (f.images.length <= 1 ? f : { ...f, images: f.images.filter((_, idx) => idx !== i) }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const name = form.name.trim();
    const description = form.description.trim();
    const priceNum = Number(String(form.price).replace(",", "."));
    const images = form.images.map((v) => v.trim()).filter(Boolean);

    if (!name) return setError("Informe o nome do produto.");
    if (!description) return setError("Informe a descrição do produto.");
    if (!Number.isFinite(priceNum) || priceNum < 0) return setError("Informe um preço válido.");
    if (!images.length) return setError("Adicione ao menos 1 imagem (URL http/https).");
    if (images.some((u) => !isRenderableImage(u))) return setError("As imagens devem ser URLs começando com http:// ou https://.");

    setError("");
    onSubmit({
      name,
      description,
      price: priceNum,
      currency: form.currency,
      availability: form.availability,
      images,
      product_retailer_id: form.product_retailer_id.trim() || undefined,
      url: form.url.trim() || undefined,
      is_hidden: form.is_hidden,
    });
  }

  return (
    <div className="wb-catalog-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <form className="wb-catalog-form" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label={editing ? "Editar produto" : "Novo produto"}>
        <button type="button" className="wb-catalog-modal__close" onClick={onClose} ref={closeRef} disabled={saving} aria-label="Fechar">
          <IconX size={18} />
        </button>

        <div className="wb-catalog-form__head">
          <span className="wb-section-kicker">Catálogo</span>
          <h2>{editing ? "Editar produto" : "Novo produto"}</h2>
        </div>

        {error ? <div className="wb-inline-alert wb-inline-alert--error" role="alert">{error}</div> : null}

        <div className="wb-catalog-form__grid">
          <div className="wb-catalog-form__preview" aria-hidden="true">
            {previewImage ? <img src={previewImage} alt="" /> : <span><IconPhoto size={34} stroke={1.3} /></span>}
          </div>

          <div className="wb-catalog-form__fields">
            <label className="wb-field wb-field--full">
              <span>Nome</span>
              <input value={form.name} onChange={(e) => setField("name", e.target.value)} maxLength={120} disabled={saving} placeholder="Ex.: Casa no Bairro Centro" />
            </label>
            <label className="wb-field wb-field--full">
              <span>Descrição</span>
              <textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={3} maxLength={600} disabled={saving} placeholder="Detalhes do produto/imóvel" />
            </label>
            <div className="wb-fields-row">
              <label className="wb-field">
                <span>Preço</span>
                <input inputMode="decimal" value={form.price} onChange={(e) => setField("price", e.target.value)} disabled={saving} placeholder="0,00" />
              </label>
              <label className="wb-field">
                <span>Moeda</span>
                <select value={form.currency} onChange={(e) => setField("currency", e.target.value)} disabled={saving}>
                  {CURRENCIES.includes(form.currency) ? null : <option value={form.currency}>{form.currency}</option>}
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="wb-field">
                <span>Disponibilidade</span>
                <select value={form.availability} onChange={(e) => setField("availability", e.target.value)} disabled={saving}>
                  <option value="in stock">Disponível</option>
                  <option value="out of stock">Sem estoque</option>
                </select>
              </label>
            </div>

            <div className="wb-catalog-form__images">
              <span className="wb-field-label">Imagens (URLs)</span>
              {form.images.map((img, i) => (
                <div className="wb-catalog-form__imageRow" key={i}>
                  <input value={img} onChange={(e) => setImageAt(i, e.target.value)} disabled={saving} placeholder="https://..." />
                  <button type="button" className="wb-icon-button" onClick={() => removeImage(i)} disabled={saving || form.images.length <= 1} aria-label="Remover imagem">
                    <IconTrash size={16} />
                  </button>
                </div>
              ))}
              {form.images.length < 10 ? (
                <button type="button" className="wb-catalog-form__addImage" onClick={addImage} disabled={saving}>
                  <IconPlus size={15} /> Adicionar imagem
                </button>
              ) : null}
            </div>

            <div className="wb-fields-row">
              <label className="wb-field">
                <span>Código / SKU (opcional)</span>
                <input value={form.product_retailer_id} onChange={(e) => setField("product_retailer_id", e.target.value)} disabled={saving} placeholder="SKU-123" />
              </label>
              <label className="wb-field">
                <span>Link (opcional)</span>
                <input value={form.url} onChange={(e) => setField("url", e.target.value)} disabled={saving} placeholder="https://sua-loja.com/item" />
              </label>
            </div>

            <label className="wb-switch wb-switch--inline">
              <input type="checkbox" checked={form.is_hidden} onChange={(e) => setField("is_hidden", e.target.checked)} disabled={saving} />
              <span aria-hidden="true" />
              <b>Ocultar do catálogo público</b>
            </label>
          </div>
        </div>

        <div className="wb-catalog-form__actions">
          <button type="button" className="wb-secondary-button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="wb-primary-button" disabled={saving}>
            {saving ? <span className="wb-button-spinner" /> : null}
            {saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar produto"}
          </button>
        </div>
      </form>
    </div>
  );
}
