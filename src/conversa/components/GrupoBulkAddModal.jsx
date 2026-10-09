import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconX, IconUsersPlus } from "@tabler/icons-react";
import ContatosPicker from "../../components/ContatosPicker";

const soDigitos = (s) => String(s || "").replace(/\D/g, "");

/**
 * Modal de adição em massa a um grupo EXISTENTE. Reusa a fila protegida (ritmo conservador).
 * `group` é o objeto do hook useGroupWhatsapp (addMany / loadFila / cancelFila / grupo).
 */
export default function GrupoBulkAddModal({ open, onClose, group }) {
  const [phones, setPhones] = useState([]);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [ops, setOps] = useState([]);
  const timerRef = useRef(null);

  const alreadyIn = useMemo(() => {
    const set = new Set();
    for (const p of group?.grupo?.participants || []) {
      const d = soDigitos(p?.phone || p?.id);
      if (d) set.add(d);
    }
    return set;
  }, [group?.grupo]);

  const refreshOps = useCallback(async () => {
    if (!group?.loadFila) return;
    const list = await group.loadFila();
    setOps(list);
  }, [group]);

  useEffect(() => {
    if (!open) return;
    refreshOps();
    timerRef.current = setInterval(refreshOps, 5000);
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    document.addEventListener("keydown", onKey, true);
    return () => { clearInterval(timerRef.current); document.removeEventListener("keydown", onKey, true); };
  }, [open, refreshOps, busy, onClose]);

  if (!open) return null;

  async function enfileirar() {
    if (!phones.length) return;
    setBusy(true);
    try {
      const r = await group.addMany(phones);
      if (r) { setResultado(r); setPhones([]); refreshOps(); }
    } finally { setBusy(false); }
  }

  return createPortal(
    <div className="wa-modalOverlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div className="wa-modal" role="dialog" aria-modal="true" aria-label="Adicionar em massa" onMouseDown={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)", maxHeight: "min(680px, 92vh)" }}>
        <div className="wa-modal-head">
          <span className="wa-modal-title"><IconUsersPlus size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />Adicionar em massa</span>
          <button className="wa-iconBtn" onClick={() => !busy && onClose?.()} aria-label="Fechar"><IconX size={20} /></button>
        </div>
        <div className="wa-modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12.5, color: "var(--ds-info, #0284c7)", background: "var(--ds-info-soft, rgba(2,132,199,0.1))", padding: "10px 12px", borderRadius: 10 }}>
            Puxe contatos da base ou cole números. A adição é feita <b>aos poucos</b> (ritmo ultra-conservador, com
            backoff e pausa automática) para proteger o número. Quem já está no grupo é ignorado.
          </div>

          <ContatosPicker onPhonesChange={setPhones} alreadyIn={alreadyIn} maxHeight={220} />

          {resultado ? (
            <div style={{ fontSize: 13, background: "var(--ds-success-soft, rgba(22,163,74,0.12))", color: "var(--ds-text-secondary,#334155)", padding: "10px 12px", borderRadius: 10 }}>
              <b style={{ color: "var(--ds-success, #16a34a)" }}>{resultado.total || 0} na fila.</b>
              {resultado.ignorados ? ` ${resultado.ignorados} já estavam no grupo.` : ""}
              {resultado.eta?.diasEstimados ? ` ~${resultado.eta.diasEstimados} dia(s).` : ""}
            </div>
          ) : null}

          {ops.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Adições em andamento</div>
              {ops.map((op) => {
                const total = Number(op.total) || 0;
                const done = (Number(op.concluidos) || 0) + (Number(op.falhados) || 0);
                const pct = total ? Math.round((done / total) * 100) : 0;
                const label = op.status === "pausada" ? "Pausada" : op.status === "concluida" ? "Concluída" : op.status === "concluida_com_erros" ? "Concluída c/ erros" : op.status === "cancelada" ? "Cancelada" : "Em andamento";
                const ativa = op.status === "em_execucao" || op.status === "pausada";
                return (
                  <div key={op.id} style={{ border: "1px solid var(--ds-border,#e2e8f0)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                      <span>{done}/{total} · {op.concluidos || 0} ok · {op.falhados || 0} falha</span>
                      <span style={{ fontWeight: 600 }}>{label}</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 999, background: "var(--ds-surface-3,#e2e8f0)", overflow: "hidden", margin: "6px 0" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: op.falhados > 0 ? "var(--ds-warning,#d97706)" : "var(--ds-accent,#1e6fe8)", transition: "width .4s" }} />
                    </div>
                    {op.pausa_motivo ? <div style={{ fontSize: 11.5, color: "var(--ds-text-tertiary,#64748b)" }}>Pausada automaticamente: {op.pausa_motivo}.</div> : null}
                    {ativa ? <button type="button" className="wa-btn" style={{ marginTop: 4, fontSize: 12 }} onClick={() => group.cancelFila(op.id).then(refreshOps)}>Cancelar</button> : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="wa-modal-foot" style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 16px", borderTop: "1px solid var(--ds-border,#e2e8f0)" }}>
          <button type="button" className="wa-btn" onClick={() => onClose?.()} disabled={busy}>Fechar</button>
          <button type="button" className="wa-btn wa-btn-primary" onClick={enfileirar} disabled={busy || !phones.length}>
            {busy ? "Enfileirando…" : `Adicionar ${phones.length || ""}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
