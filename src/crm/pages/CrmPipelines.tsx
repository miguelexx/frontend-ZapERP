import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  clonePipeline,
  crmApiError,
  createPipeline,
  deletePipeline,
  listPipelines,
  setPipelinePadrao,
  updatePipeline,
} from "../../api/crmService";
import type { CrmPipeline } from "../crmTypes";

export default function CrmPipelines() {
  const [items, setItems] = useState<CrmPipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      const data = await listPipelines({ include: "stages" });
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
      await createPipeline({ nome: nome.trim() });
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
        <h3 style={{ marginTop: 0 }}>Novo pipeline</h3>
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
        <div className="crm-empty">Nenhum pipeline.</div>
      ) : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Ativo</th>
                <th>Padrão</th>
                <th>Estágios</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>{p.nome}</td>
                  <td>{p.ativo === false ? "Não" : "Sim"}</td>
                  <td>{p.padrao ? "Sim" : "—"}</td>
                  <td>{Array.isArray(p.stages) ? p.stages.length : "—"}</td>
                  <td>
                    <PipelineActions pipeline={p} onChanged={load} />
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

function PipelineActions({ pipeline, onChanged }: { pipeline: CrmPipeline; onChanged: () => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [nome, setNome] = useState(pipeline.nome);

  async function padrao() {
    try {
      await setPipelinePadrao(pipeline.id);
      await onChanged();
    } catch (e) {
      window.alert(crmApiError(e));
    }
  }

  async function clonar() {
    const n = window.prompt("Nome do novo pipeline", `${pipeline.nome} (cópia)`);
    if (!n) return;
    try {
      await clonePipeline(pipeline.id, { nome: n });
      await onChanged();
    } catch (e) {
      window.alert(crmApiError(e));
    }
  }

  async function salvar() {
    try {
      await updatePipeline(pipeline.id, { nome: nome.trim() });
      setEdit(false);
      await onChanged();
    } catch (e) {
      window.alert(crmApiError(e));
    }
  }

  async function remover() {
    if (!window.confirm("Excluir pipeline? Só é permitido se não houver leads.")) return;
    try {
      await deletePipeline(pipeline.id);
      await onChanged();
    } catch (e) {
      window.alert(crmApiError(e));
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {edit ? (
        <>
          <input className="crm-input" value={nome} onChange={(e) => setNome(e.target.value)} />
          <button type="button" className="crm-btn crm-btn--primary" onClick={salvar}>
            Salvar
          </button>
          <button type="button" className="crm-btn crm-btn--outline" onClick={() => setEdit(false)}>
            Cancelar
          </button>
        </>
      ) : (
        <>
          <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setEdit(true)}>
            Editar
          </button>
          <button type="button" className="crm-btn crm-btn--outline" onClick={padrao}>
            Definir padrão
          </button>
          <button type="button" className="crm-btn crm-btn--outline" onClick={clonar}>
            Clonar
          </button>
          <button type="button" className="crm-btn crm-btn--danger" onClick={remover}>
            Excluir
          </button>
        </>
      )}
    </div>
  );
}
