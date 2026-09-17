import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconX } from "@tabler/icons-react";

function currentIds(collection) {
  const list = Array.isArray(collection?.products) ? collection.products : [];
  return list.map((p) => String(p?.id ?? p ?? "")).filter(Boolean);
}

export default function CollectionFormModal({ open, collection, products, saving, onClose, onSubmit }) {
  const editing = !!collection?.id;
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setName(String(collection?.name || ""));
    setSelected(new Set(currentIds(collection)));
    setSearch("");
    setError("");
    closeRef.current?.focus();
  }, [open, collection]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === "Escape" && !saving) onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    const arr = Array.isArray(products) ? products : [];
    if (!term) return arr;
    return arr.filter((p) => `${p.name || ""} ${p.product_retailer_id || ""}`.toLowerCase().includes(term));
  }, [products, search]);

  if (!open) return null;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Informe o nome da coleção.");
    setError("");
    const selectedIds = [...selected];
    if (editing) {
      const before = new Set(currentIds(collection));
      const add_products = selectedIds.filter((id) => !before.has(id));
      const remove_products = [...before].filter((id) => !selected.has(id));
      onSubmit({ mode: "edit", id: collection.id, name: trimmed, add_products, remove_products });
    } else {
      onSubmit({ mode: "create", name: trimmed, products: selectedIds });
    }
  }

  return (
    <div className="wb-catalog-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <form className="wb-catalog-form wb-catalog-form--collection" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label={editing ? "Editar coleção" : "Nova coleção"}>
        <button type="button" className="wb-catalog-modal__close" onClick={onClose} ref={closeRef} disabled={saving} aria-label="Fechar">
          <IconX size={18} />
        </button>

        <div className="wb-catalog-form__head">
          <span className="wb-section-kicker">Catálogo</span>
          <h2>{editing ? "Editar coleção" : "Nova coleção"}</h2>
        </div>

        {error ? <div className="wb-inline-alert wb-inline-alert--error" role="alert">{error}</div> : null}

        <label className="wb-field wb-field--full">
          <span>Nome da coleção</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={saving} placeholder="Ex.: Casas para locação" />
        </label>

        <div className="wb-catalog-form__pick">
          <div className="wb-catalog-form__pickHead">
            <span className="wb-field-label">Produtos na coleção</span>
            <input className="wb-catalog-form__pickSearch" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" disabled={saving} aria-label="Buscar produtos" />
          </div>
          <div className="wb-catalog-form__pickList">
            {list.length === 0 ? (
              <p className="wb-catalog-form__pickEmpty">Nenhum produto disponível.</p>
            ) : (
              list.map((p) => {
                const id = String(p.id);
                const on = selected.has(id);
                return (
                  <button type="button" key={id} className={`wb-catalog-form__pickItem${on ? " is-on" : ""}`} onClick={() => toggle(id)} disabled={saving}>
                    <span className={`wb-catalog-form__pickCheck${on ? " is-on" : ""}`} aria-hidden="true">{on ? <IconCheck size={13} /> : null}</span>
                    <span className="wb-catalog-form__pickName">{p.name || "Produto"}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="wb-catalog-form__actions">
          <button type="button" className="wb-secondary-button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="wb-primary-button" disabled={saving}>
            {saving ? <span className="wb-button-spinner" /> : null}
            {saving ? "Salvando…" : editing ? "Salvar coleção" : "Criar coleção"}
          </button>
        </div>
      </form>
    </div>
  );
}
