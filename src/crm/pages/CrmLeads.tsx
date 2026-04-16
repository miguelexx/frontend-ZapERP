import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  crmApiError,
  createLead,
  exportLeadsCsv,
  listLeads,
  listStages,
} from "../../api/crmService";
import type { CrmLeadListItem, LeadPrioridade } from "../crmTypes";
import CrmPipelinePicker from "../components/CrmPipelinePicker.jsx";
import { useCrmStore } from "../crmStore";

const PRIORIDADES: LeadPrioridade[] = ["baixa", "normal", "alta", "urgente"];

export default function CrmLeads() {
  const pipelineId = useCrmStore((s) => s.pipelineId);
  const refreshTick = useCrmStore((s) => s.refreshTick);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState<{ items: CrmLeadListItem[]; total: number; page: number; page_size: number } | null>(
    null
  );
  const [q, setQ] = useState("");
  const [stageId, setStageId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("atualizado_em");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [stages, setStages] = useState<{ id: number; nome: string }[]>([]);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    let c = false;
    (async () => {
      if (pipelineId == null) {
        setStages([]);
        return;
      }
      try {
        const s = await listStages({ pipeline_id: pipelineId, ativo: true });
        if (c) return;
        setStages((Array.isArray(s) ? s : []).map((x) => ({ id: x.id, nome: x.nome })));
      } catch {
        setStages([]);
      }
    })();
    return () => {
      c = true;
    };
  }, [pipelineId]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      const params: Record<string, string | number | undefined> = {
        page,
        page_size: 20,
        sort,
        dir,
      };
      if (pipelineId != null) params.pipeline_id = pipelineId;
      if (q.trim()) params.q = q.trim();
      if (stageId) params.stage_id = Number(stageId);
      if (status) params.status = status;
      const res = await listLeads(params);
      setData(res);
    } catch (e) {
      setErr(crmApiError(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [pipelineId, page, q, sort, dir, stageId, status]);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  async function onExport() {
    try {
      const params: Record<string, string | number | undefined> = { max: 5000 };
      if (pipelineId != null) params.pipeline_id = pipelineId;
      if (q.trim()) params.q = q.trim();
      if (stageId) params.stage_id = Number(stageId);
      if (status) params.status = status;
      const blob = await exportLeadsCsv(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(crmApiError(e));
    }
  }

  const items = data?.items ?? [];

  return (
    <div>
      <div className="crm-page-head">
        <div>
          <h2>Leads</h2>
          <p>Lista enriquecida com filtros do pipeline, exportação CSV e acesso ao detalhe.</p>
        </div>
      </div>

      <div className="crm-toolbar crm-toolbar--premium" style={{ alignItems: "flex-end" }}>
        <CrmPipelinePicker />
        <div className="crm-field">
          <span className="crm-field-label">Busca</span>
          <input
            className="crm-input"
            placeholder="Nome, empresa, telefone, e-mail"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
        </div>
        <div className="crm-field">
          <span className="crm-field-label">Estágio</span>
          <select className="crm-select" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            <option value="">Todos</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="crm-field">
          <span className="crm-field-label">Status</span>
          <select className="crm-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="ativo">Ativo</option>
            <option value="ganho">Ganho</option>
            <option value="perdido">Perdido</option>
            <option value="arquivado">Arquivado</option>
          </select>
        </div>
        <div className="crm-field">
          <span className="crm-field-label">Ordenar</span>
          <select className="crm-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="atualizado_em">Atualizado</option>
            <option value="criado_em">Criado</option>
            <option value="nome">Nome</option>
            <option value="valor_estimado">Valor</option>
            <option value="ultima_interacao_em">Última interação</option>
            <option value="data_proximo_contato">Próximo contato</option>
          </select>
        </div>
        <div className="crm-field">
          <span className="crm-field-label">Direção</span>
          <select className="crm-select" value={dir} onChange={(e) => setDir(e.target.value as "asc" | "desc")}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
        <button type="button" className="crm-btn crm-btn--primary" onClick={load} disabled={loading}>
          Filtrar
        </button>
        <button type="button" className="crm-btn crm-btn--outline" onClick={onExport}>
          Exportar CSV
        </button>
        <button type="button" className="crm-btn crm-btn--primary" onClick={() => setShowNew(true)}>
          Novo lead
        </button>
      </div>

      {err ? <div className="crm-error" style={{ marginBottom: 12 }}>{err}</div> : null}

      {loading && !data ? (
        <div className="crm-empty-soft">Carregando leads…</div>
      ) : items.length === 0 ? (
        <div className="crm-empty-soft">Nenhum lead encontrado.</div>
      ) : (
        <div className="crm-panel" style={{ padding: 0, overflow: "hidden" }}>
        <div className="crm-table-wrap" style={{ border: "none", borderRadius: 0 }}>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Empresa</th>
                <th>Estágio</th>
                <th>Responsável</th>
                <th>Valor</th>
                <th>Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link to={`/crm/leads/${row.id}`}>{row.nome}</Link>
                  </td>
                  <td>{row.empresa ?? "—"}</td>
                  <td>{row.stage?.nome ?? "—"}</td>
                  <td>{row.responsavel?.nome ?? "—"}</td>
                  <td>
                    {row.valor_estimado != null
                      ? Number(row.valor_estimado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : "—"}
                  </td>
                  <td>{row.atualizado_em ? String(row.atualizado_em).slice(0, 16).replace("T", " ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {data && data.total > data.page_size ? (
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="crm-btn crm-btn--outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className="crm-muted">
            Página {data.page} · {data.total} registros
          </span>
          <button
            type="button"
            className="crm-btn crm-btn--outline"
            disabled={page * data.page_size >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      ) : null}

      {showNew ? (
        <LeadCreateModal
          pipelineId={pipelineId}
          stages={stages}
          onClose={() => setShowNew(false)}
          onSaved={(id) => {
            setShowNew(false);
            window.location.href = `/crm/leads/${id}`;
          }}
        />
      ) : null}
    </div>
  );
}

function LeadCreateModal({
  pipelineId,
  stages,
  onClose,
  onSaved,
}: {
  pipelineId: number | null;
  stages: { id: number; nome: string }[];
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [valor, setValor] = useState("");
  const [stage_id, setStageId] = useState<number | "">("");
  const [prioridade, setPrioridade] = useState<LeadPrioridade>("normal");
  const [saving, setSaving] = useState(false);
  const [localErr, setLocalErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      setLocalErr("Informe o nome.");
      return;
    }
    try {
      setSaving(true);
      setLocalErr("");
      const payload: Parameters<typeof createLead>[0] = {
        nome: nome.trim(),
        prioridade,
      };
      if (empresa.trim()) payload.empresa = empresa.trim();
      if (telefone.trim()) payload.telefone = telefone.trim();
      if (email.trim()) payload.email = email.trim();
      if (valor) payload.valor_estimado = Number(valor.replace(",", "."));
      if (pipelineId != null) payload.pipeline_id = pipelineId;
      if (stage_id !== "") payload.stage_id = stage_id;
      const res = await createLead(payload);
      const id = (res as { id?: number }).id;
      if (id != null) onSaved(id);
    } catch (err) {
      setLocalErr(crmApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="crm-modal-overlay" role="dialog" aria-modal>
      <div className="crm-modal">
        <h3>Novo lead</h3>
        {localErr ? <div className="crm-error" style={{ marginBottom: 12 }}>{localErr}</div> : null}
        <form onSubmit={submit}>
          <div className="crm-form-row">
            <label>Nome *</label>
            <input className="crm-input" style={{ width: "100%" }} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="crm-form-row">
            <label>Empresa</label>
            <input className="crm-input" style={{ width: "100%" }} value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
          </div>
          <div className="crm-form-row">
            <label>Telefone</label>
            <input className="crm-input" style={{ width: "100%" }} value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
          <div className="crm-form-row">
            <label>E-mail</label>
            <input className="crm-input" style={{ width: "100%" }} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="crm-form-row">
            <label>Valor estimado</label>
            <input className="crm-input" style={{ width: "100%" }} value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <div className="crm-form-row">
            <label>Estágio</label>
            <select
              className="crm-select"
              style={{ width: "100%" }}
              value={stage_id === "" ? "" : String(stage_id)}
              onChange={(e) => setStageId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Automático / primeiro</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-form-row">
            <label>Prioridade</label>
            <select
              className="crm-select"
              style={{ width: "100%" }}
              value={prioridade}
              onChange={(e) => setPrioridade(e.target.value as LeadPrioridade)}
            >
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-form-actions">
            <button type="button" className="crm-btn crm-btn--outline" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn crm-btn--primary" disabled={saving}>
              {saving ? "Salvando…" : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
