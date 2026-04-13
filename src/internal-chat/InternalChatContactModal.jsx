import { useCallback, useEffect, useRef, useState } from "react";
import { listInternalClientContacts } from "../api/internalChatService";
import { resolveClientContactAvatarUrl } from "./mediaUrl.js";

const PAGE_LIMIT = 50;

/** Um número por linha ou separados por vírgula / ponto e vírgula */
function parsePhonesList(raw) {
  return String(raw || "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   disabled?: boolean;
 *   onSendContact: (payload: { name: string; phone?: string; phones?: string[]; organization?: string; caption?: string }) => Promise<void>;
 * }} props
 */
export default function InternalChatContactModal({ open, onClose, disabled = false, onSendContact }) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cOrg, setCOrg] = useState("");
  const [cCaption, setCCaption] = useState("");

  const [pickerRows, setPickerRows] = useState([]);
  const [pickerTotal, setPickerTotal] = useState(0);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState(/** @type {string | null} */ (null));

  const debounceRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      setDebouncedQ(searchInput.trim());
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput, open]);

  const resetForm = useCallback(() => {
    setSearchInput("");
    setDebouncedQ("");
    setCName("");
    setCPhone("");
    setCOrg("");
    setCCaption("");
    setPickerRows([]);
    setPickerTotal(0);
    setPickerError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setPickerLoading(true);
      setPickerError(null);
      try {
        const { contacts, total } = await listInternalClientContacts({
          q: debouncedQ,
          limit: PAGE_LIMIT,
          offset: 0,
        });
        if (cancelled) return;
        setPickerTotal(Number(total) || 0);
        setPickerRows(contacts);
      } catch (e) {
        if (!cancelled) {
          setPickerError(e?.response?.data?.error || e?.message || "Não foi possível carregar contatos.");
          setPickerRows([]);
          setPickerTotal(0);
        }
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, debouncedQ]);

  const handleLoadMore = useCallback(async () => {
    if (!open || pickerLoading || pickerRows.length === 0 || pickerRows.length >= pickerTotal) return;
    setPickerLoading(true);
    setPickerError(null);
    try {
      const { contacts, total } = await listInternalClientContacts({
        q: debouncedQ,
        limit: PAGE_LIMIT,
        offset: pickerRows.length,
      });
      setPickerTotal(Number(total) || 0);
      setPickerRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const merged = [...prev];
        for (const c of contacts) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            merged.push(c);
          }
        }
        return merged;
      });
    } catch (e) {
      setPickerError(e?.response?.data?.error || e?.message || "Falha ao carregar mais.");
    } finally {
      setPickerLoading(false);
    }
  }, [open, debouncedQ, pickerLoading, pickerRows.length, pickerTotal]);

  function applyPickerRow(row) {
    const display = row.name || row.phone;
    setCName(display);
    if (row.phonesList && row.phonesList.length > 1) {
      setCPhone(row.phonesList.join("\n"));
    } else {
      setCPhone(row.phone || "");
    }
  }

  async function submitContact() {
    const phones = parsePhonesList(cPhone);
    if (!cName.trim() || !phones.length) return;
    try {
      if (phones.length > 1) {
        await onSendContact({
          name: cName.trim(),
          phones,
          organization: cOrg.trim() || undefined,
          caption: cCaption.trim() || undefined,
        });
      } else {
        await onSendContact({
          name: cName.trim(),
          phone: phones[0],
          organization: cOrg.trim() || undefined,
          caption: cCaption.trim() || undefined,
        });
      }
      resetForm();
      onClose();
    } catch {
      /* erro no pai */
    }
  }

  const canLoadMore = pickerRows.length > 0 && pickerRows.length < pickerTotal;
  const canSubmit = cName.trim().length > 0 && parsePhonesList(cPhone).length > 0;

  if (!open) return null;

  return (
    <dialog
      className="ic-dialog"
      open
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ic-dialog-panel ic-dialog-panel--contact" role="document" onClick={(e) => e.stopPropagation()}>
        <h3 className="ic-dialog-title">Compartilhar contato</h3>

        <label className="ic-dialog-search-block">
          <span className="ic-dialog-search-title">Buscar na agenda</span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Nome ou telefone…"
            aria-label="Buscar contatos do cliente"
          />
        </label>

        <div className="ic-client-picker" aria-busy={pickerLoading}>
          {pickerError ? (
            <div className="ic-client-picker-err" role="alert">
              {pickerError}
            </div>
          ) : null}
          {pickerLoading && pickerRows.length === 0 ? (
            <div className="ic-client-picker-muted">Carregando…</div>
          ) : null}
          {!pickerLoading && pickerRows.length === 0 && !pickerError ? (
            <div className="ic-client-picker-muted">Nenhum contato encontrado.</div>
          ) : null}
          {pickerRows.length > 0 ? (
            <ul className="ic-client-picker-list">
              {pickerRows.map((row) => {
                const img = resolveClientContactAvatarUrl(row.avatar);
                const sub = [row.phone, row.pushname && row.pushname !== row.name ? row.pushname : ""].filter(Boolean).join(" · ");
                return (
                  <li key={row.id}>
                    <button type="button" className="ic-client-picker-row" disabled={disabled} onClick={() => applyPickerRow(row)}>
                      {img ? (
                        <img className="ic-client-picker-avatar" src={img} alt="" />
                      ) : (
                        <span className="ic-client-picker-avatar ic-client-picker-avatar--ph" aria-hidden />
                      )}
                      <div className="ic-client-picker-text">
                        <span className="ic-client-picker-name">{row.name}</span>
                        {sub ? <span className="ic-client-picker-phone">{sub}</span> : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {canLoadMore ? (
            <button type="button" className="ic-client-picker-more" disabled={disabled || pickerLoading} onClick={() => void handleLoadMore()}>
              {pickerLoading ? "Carregando…" : "Carregar mais"}
            </button>
          ) : null}
        </div>

        <div className="ic-dialog-divider">Ou edite manualmente</div>

        <div className="ic-dialog-fields">
          <label>
            Nome *
            <input value={cName} onChange={(e) => setCName(e.target.value)} />
          </label>
          <label>
            Telefone(s) *
            <textarea
              className="ic-dialog-textarea"
              rows={4}
              value={cPhone}
              onChange={(e) => setCPhone(e.target.value)}
              placeholder={"+5511999990000\n+5511888880000"}
            />
            <span className="ic-dialog-hint">Um por linha ou separados por vírgula.</span>
          </label>
          <label>
            Organização (opcional)
            <input value={cOrg} onChange={(e) => setCOrg(e.target.value)} />
          </label>
          <label>
            Legenda (opcional)
            <input value={cCaption} onChange={(e) => setCCaption(e.target.value)} />
          </label>
        </div>

        <div className="ic-dialog-actions">
          <button type="button" className="ic-dialog-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="ic-dialog-btn ic-dialog-btn--primary" disabled={disabled || !canSubmit} onClick={() => void submitContact()}>
            Enviar
          </button>
        </div>
      </div>
    </dialog>
  );
}
