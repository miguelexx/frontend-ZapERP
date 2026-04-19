import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./admin-atendente-filter.css";

function ChevronDown({ className }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Dropdown premium para filtrar conversas por `atendente_id` (somente admins; uso em ChatList).
 */
export default function AdminAtendenteFilter({
  usuarios,
  selectedUserId,
  open,
  onOpenChange,
  onSelectUser,
  onClear,
  onBeforeOpen,
}) {
  const triggerRef = useRef(null);
  const panelWrapRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const sorted = useMemo(() => {
    const list = Array.isArray(usuarios) ? [...usuarios] : [];
    list.sort((a, b) => {
      const na = String(a?.nome ?? a?.name ?? a?.email ?? "").trim();
      const nb = String(b?.nome ?? b?.name ?? b?.email ?? "").trim();
      return na.localeCompare(nb, "pt-BR", { sensitivity: "base" });
    });
    return list.filter((u) => u?.ativo !== false);
  }, [usuarios]);

  const selected = useMemo(
    () => sorted.find((u) => String(u?.id) === String(selectedUserId)),
    [sorted, selectedUserId]
  );

  const label = selected
    ? String(selected.nome ?? selected.name ?? selected.email ?? "Funcionário").trim()
    : "Por funcionário";

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pw = panelWrapRef.current?.offsetWidth ?? 260;
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - pw - 8));
    setCoords({ top: r.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;

    function onMouseDown(e) {
      const t = e.target;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (panelWrapRef.current?.contains(t)) return;
      onOpenChange(false);
    }

    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [open, onOpenChange]);

  function handleTrigger(e) {
    if (e?.target?.closest?.(".admin-atendente-filter__clear")) return;
    onBeforeOpen?.();
    onOpenChange(!open);
  }

  function handleClear(e) {
    e.stopPropagation();
    onClear?.();
    onOpenChange(false);
  }

  function handlePick(u) {
    onSelectUser?.(u);
    onOpenChange(false);
  }

  const panel = (
    <div
      ref={panelWrapRef}
      className={`admin-atendente-filter__panel-wrap ${open ? "is-visible" : ""}`}
      style={{ top: coords.top, left: coords.left }}
      role="presentation"
      aria-hidden={!open}
    >
      <div
        className="admin-atendente-filter__panel"
        role="listbox"
        aria-label="Funcionários da empresa"
      >
        <div className="admin-atendente-filter__panel-head">Ver conversas por responsável</div>
        <div className="admin-atendente-filter__list">
          {sorted.length === 0 ? (
            <div className="admin-atendente-filter__option" style={{ cursor: "default", opacity: 0.75 }}>
              <span className="admin-atendente-filter__option-name">Nenhum utilizador encontrado</span>
            </div>
          ) : (
            sorted.map((u) => {
              const id = u?.id;
              const isSel = selectedUserId != null && String(selectedUserId) === String(id);
              const name = String(u?.nome ?? u?.name ?? u?.email ?? "—").trim();
              return (
                <button
                  key={String(id)}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  className={`admin-atendente-filter__option ${isSel ? "is-selected" : ""}`}
                  onClick={() => handlePick(u)}
                >
                  <span className="admin-atendente-filter__option-name">{name}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="admin-atendente-filter">
      <button
        ref={triggerRef}
        type="button"
        className="admin-atendente-filter__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={
          selected
            ? `Filtrando conversas por ${label}. Limpar filtro ou escolher outro funcionário.`
            : "Filtrar conversas por funcionário"
        }
        onClick={handleTrigger}
      >
        <span className="admin-atendente-filter__trigger-label">{label}</span>
        {selectedUserId != null && (
          <span
            className="admin-atendente-filter__clear"
            role="button"
            tabIndex={-1}
            title="Limpar filtro por funcionário"
            aria-label="Limpar filtro por funcionário"
            onClick={handleClear}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
        )}
        <span className="admin-atendente-filter__chev-wrap" aria-hidden>
          <ChevronDown className={`admin-atendente-filter__chev ${open ? "is-open" : ""}`} />
        </span>
      </button>
      {typeof document !== "undefined" ? createPortal(panel, document.body) : null}
    </div>
  );
}
