import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createStage,
  crmApiError,
  deleteStage,
  listPipelines,
  listStages,
  updateStage,
} from "../../api/crmService";
import type { CrmPipeline, CrmStage, StageTipoFechamento } from "../crmTypes";

export default function CrmStages() {
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<number | "">("");
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [nome, setNome] = useState("");
  const [tipoFechamento, setTipoFechamento] = useState<StageTipoFechamento | "">("");
  const [exigeMotivo, setExigeMotivo] = useState(false);
  const [inicial, setInicial] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadPipelines = useCallback(async () => {
    const data = await listPipelines({ ativo: true, include: "stages" });
    setPipelines(Array.isArray(data) ? data : []);
  }, []);

  const loadStages = useCallback(async () => {
    if (pipelineId === "") {
      setStages([]);
      return;
    }
    try {
      setLoading(true);
      setErr("");
      const s = await listStages({ pipeline_id: Number(pipelineId), ativo: true });
      setStages(Array.isArray(s) ? s : []);
    } catch (e) {
      setErr(crmApiError(e));
    } finally {
      setLoading(false);
    }
  }, [pipelineId]);

  useEffect(() => {
    loadPipelines().catch(() => {});
  }, [loadPipelines]);

  useEffect(() => {
    loadStages();
  }, [loadStages]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (pipelineId === "" || !nome.trim()) return;
    setBusy(true);
    try {
      await createStage({
        pipeline_id: Number(pipelineId),
        nome: nome.trim(),
        ...(tipoFechamento !== "" ? { tipo_fechamento: tipoFechamento } : {}),
        exige_motivo_perda: exigeMotivo,
        inicial,
        ativo: true,
      });
      setNome("");
      setTipoFechamento("");
      setExigeMotivo(false);
      setInicial(false);
      await loadStages();
    } catch (err) {
      window.alert(crmApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="crm-field" style={{ marginBottom: 16, maxWidth: 400 }}>
        <span className="crm-field-label">Pipeline</span>
        <select
          className="crm-select"
          style={{ width: "100%" }}
          value={pipelineId === "" ? "" : String(pipelineId)}
          onChange={(e) => setPipelineId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Selecione um pipeline</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      {pipelineId !== "" ? (
        <div className="crm-card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Novo estágio</h3>
          <form onSubmit={criar}>
            <div className="crm-form-row">
              <label>Nome *</label>
              <input className="crm-input" style={{ width: "100%" }} value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="crm-form-row">
              <label>Tipo fechamento</label>
              <select
                className="crm-select"
                style={{ width: "100%" }}
                value={tipoFechamento === "" ? "" : String(tipoFechamento)}
                onChange={(e) => {
                  const v = e.target.value;
                  setTipoFechamento(v === "" ? "" : (v as "ganho" | "perdido"));
                }}
              >
                <option value="">Nenhum</option>
                <option value="ganho">Ganho</option>
                <option value="perdido">Perdido</option>
              </select>
            </div>
            <div className="crm-form-row">
              <label>
                <input type="checkbox" checked={exigeMotivo} onChange={(e) => setExigeMotivo(e.target.checked)} /> Exige
                motivo de perda
              </label>
            </div>
            <div className="crm-form-row">
              <label>
                <input type="checkbox" checked={inicial} onChange={(e) => setInicial(e.target.checked)} /> Estágio inicial
              </label>
            </div>
            <button type="submit" className="crm-btn crm-btn--primary" disabled={busy}>
              Adicionar estágio
            </button>
          </form>
        </div>
      ) : null}

      {err ? <div className="crm-error" style={{ marginBottom: 12 }}>{err}</div> : null}

      {pipelineId === "" ? (
        <div className="crm-empty">Escolha um pipeline para listar estágios.</div>
      ) : loading ? (
        <div className="crm-empty">Carregando estágios…</div>
      ) : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Inicial</th>
                <th>Fechamento</th>
                <th>Motivo perda</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.id}>
                  <td>{s.nome}</td>
                  <td>{s.inicial ? "Sim" : "—"}</td>
                  <td>{s.tipo_fechamento ?? "—"}</td>
                  <td>{s.exige_motivo_perda ? "Sim" : "—"}</td>
                  <td>
                    <StageRowActions stage={s} onChanged={loadStages} />
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

function StageRowActions({ stage, onChanged }: { stage: CrmStage; onChanged: () => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [nome, setNome] = useState(stage.nome);

  async function salvar() {
    try {
      await updateStage(stage.id, { nome: nome.trim() });
      setEdit(false);
      await onChanged();
    } catch (e) {
      window.alert(crmApiError(e));
    }
  }

  async function remover() {
    if (!window.confirm("Excluir estágio?")) return;
    try {
      await deleteStage(stage.id);
      await onChanged();
    } catch (e) {
      window.alert(crmApiError(e));
    }
  }

  if (edit) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <input className="crm-input" value={nome} onChange={(e) => setNome(e.target.value)} />
        <button type="button" className="crm-btn crm-btn--primary" onClick={salvar}>
          OK
        </button>
        <button type="button" className="crm-btn crm-btn--outline" onClick={() => setEdit(false)}>
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setEdit(true)}>
        Renomear
      </button>
      <button type="button" className="crm-btn crm-btn--danger" onClick={remover}>
        Excluir
      </button>
    </div>
  );
}
