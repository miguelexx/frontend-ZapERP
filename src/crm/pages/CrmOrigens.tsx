import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createOrigem, crmApiError, listOrigens, updateOrigem } from "../../api/crmService";
import type { CrmOrigem } from "../crmTypes";

export default function CrmOrigens() {
  const [items, setItems] = useState<CrmOrigem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      const data = await listOrigens();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(crmApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setBusy(true);
    try {
      await createOrigem({ nome: nome.trim(), ativo: true });
      setNome("");
      await load();
    } catch (err) {
      window.alert(crmApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="crm-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Nova origem</h3>
        <form onSubmit={criar} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="crm-field" style={{ flex: "1 1 220px" }}>
            <span className="crm-field-label">Nome</span>
            <input className="crm-input" style={{ width: "100%" }} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <button type="submit" className="crm-btn crm-btn--primary" disabled={busy}>
            Criar
          </button>
        </form>
      </div>

      {err ? <div className="crm-error" style={{ marginBottom: 12 }}>{err}</div> : null}

      {loading ? (
        <div className="crm-empty">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="crm-empty">Nenhuma origem.</div>
      ) : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Ativo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td>{o.nome}</td>
                  <td>{o.ativo === false ? "Não" : "Sim"}</td>
                  <td>
                    <OrigemEdit o={o} onSaved={load} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrigemEdit({ o, onSaved }: { o: CrmOrigem; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(o.nome);

  async function salvar() {
    try {
      await updateOrigem(o.id, { nome: nome.trim() });
      setOpen(false);
      await onSaved();
    } catch (e) {
      window.alert(crmApiError(e));
    }
  }

  if (!open) {
    return (
      <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setOpen(true)}>
        Editar
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input className="crm-input" value={nome} onChange={(e) => setNome(e.target.value)} />
      <button type="button" className="crm-btn crm-btn--primary" onClick={salvar}>
        Salvar
      </button>
      <button type="button" className="crm-btn crm-btn--outline" onClick={() => setOpen(false)}>
        Cancelar
      </button>
    </div>
  );
}
