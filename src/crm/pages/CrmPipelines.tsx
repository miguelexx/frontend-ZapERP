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
import type { CrmPipeline, CrmStage } from "../crmTypes";

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
      <div className="crm-page-head">
        <div>
          <h2>Pipelines</h2>
          <p>Organize funis por equipe ou processo. Estágios aparecem como etapas do fluxo.</p>
        </div>
      </div>

      <div className="crm-form-card">
        <h3>Criar pipeline</h3>
        <form onSubmit={criar} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="crm-field" style={{ flex: "1 1 260px" }}>
            <span className="crm-field-label">Nome</span>
            <input className="crm-input" style={{ width: "100%" }} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Vendas B2B" />
          </div>
          <button type="submit" className="crm-btn crm-btn--primary" disabled={busy}>
            {busy ? "Criando…" : "Criar pipeline"}
          </button>
        </form>
      </div>

      {err ? <div className="crm-error" style={{ marginBottom: 16 }}>{err}</div> : null}

      {loading ? (
        <div className="crm-empty-soft">Carregando pipelines…</div>
      ) : items.length === 0 ? (
        <div className="crm-empty-soft">Nenhum pipeline cadastrado.</div>
      ) : (
        <div className="crm-pipeline-grid">
          {items.map((p) => (
            <PipelineCard key={p.id} pipeline={p} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function stageOrder(a: CrmStage, b: CrmStage) {
  return safeNum(a.ordem) - safeNum(b.ordem);
}

function safeNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function PipelineCard({ pipeline, onChanged }: { pipeline: CrmPipeline; onChanged: () => Promise<void> }) {
  const stages = Array.isArray(pipeline.stages) ? [...pipeline.stages].sort(stageOrder) : [];
  const cor = pipeline.cor && String(pipeline.cor).trim() ? String(pipeline.cor) : "var(--ds-accent)";

  return (
    <article className="crm-pipeline-card" style={{ borderTop: `3px solid ${cor}` }}>
      <div className="crm-pipeline-card__top">
        <div>
          <h4 className="crm-pipeline-card__name">{pipeline.nome}</h4>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span className={`crm-badge ${pipeline.ativo === false ? "crm-badge--muted" : "crm-badge--ok"}`}>
              {pipeline.ativo === false ? "Inativo" : "Ativo"}
            </span>
            {pipeline.padrao ? <span className="crm-badge crm-badge--accent">Padrão</span> : null}
          </div>
        </div>
      </div>

      <div>
        <span className="crm-field-label" style={{ display: "block", marginBottom: 6 }}>
          Estágios ({stages.length})
        </span>
        {stages.length === 0 ? (
          <span className="crm-muted">Nenhum estágio neste pipeline.</span>
        ) : (
          <div className="crm-stage-pills">
            {stages.slice(0, 12).map((s) => (
              <span key={s.id} className="crm-stage-pill" title={s.nome}>
                {s.nome}
              </span>
            ))}
            {stages.length > 12 ? <span className="crm-stage-pill">+{stages.length - 12}</span> : null}
          </div>
        )}
      </div>

      <div className="crm-pipeline-card__actions">
        <PipelineActions pipeline={pipeline} onChanged={onChanged} />
      </div>
    </article>
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
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", width: "100%" }}>
      {edit ? (
        <>
          <input className="crm-input" style={{ flex: "1 1 160px" }} value={nome} onChange={(e) => setNome(e.target.value)} />
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
            Renomear
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
