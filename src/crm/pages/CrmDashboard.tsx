import { useCallback, useEffect, useMemo, useState } from "react";
import {
  crmApiError,
  getCrmDashboard,
  getCrmDashboardFunnel,
  getCrmDashboardOrigens,
  getCrmDashboardResponsaveis,
} from "../../api/crmService";
import CrmPipelinePicker from "../components/CrmPipelinePicker.jsx";
import { useCrmStore } from "../crmStore";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function CrmDashboard() {
  const pipelineId = useCrmStore((s) => s.pipelineId);
  const refreshTick = useCrmStore((s) => s.refreshTick);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [dash, setDash] = useState<Record<string, unknown> | null>(null);
  const [funnel, setFunnel] = useState<Record<string, unknown> | null>(null);
  const [rankResp, setRankResp] = useState<unknown>(null);
  const [rankOrig, setRankOrig] = useState<unknown>(null);

  const [de, setDe] = useState(() => {
    const x = new Date();
    x.setDate(x.getDate() - 30);
    return isoDate(x);
  });
  const [ate, setAte] = useState(() => isoDate(new Date()));

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      const [d, f, rr, ro] = await Promise.all([
        getCrmDashboard(pipelineId != null ? { pipeline_id: pipelineId } : {}),
        getCrmDashboardFunnel({
          criado_de: de,
          criado_ate: ate,
          ...(pipelineId != null ? { pipeline_id: pipelineId } : {}),
        }),
        getCrmDashboardResponsaveis(pipelineId != null ? { pipeline_id: pipelineId } : {}),
        getCrmDashboardOrigens(pipelineId != null ? { pipeline_id: pipelineId } : {}),
      ]);
      setDash(d);
      setFunnel(f);
      setRankResp(rr);
      setRankOrig(ro);
    } catch (e) {
      setErr(crmApiError(e));
    } finally {
      setLoading(false);
    }
  }, [pipelineId, de, ate]);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  const kpi = useMemo(() => {
    if (!dash || typeof dash !== "object") return [];
    const rows: { label: string; value: string }[] = [];
    const pick = (k: string, label: string) => {
      const v = dash[k];
      if (v == null) return;
      rows.push({ label, value: typeof v === "object" ? JSON.stringify(v) : String(v) });
    };
    pick("totais", "Totais");
    pick("valor_estimado_soma_ativos", "Valor estimado (ativos)");
    pick("valor_ganho_estimado", "Valor ganho estimado");
    pick("taxa_conversao_ganho_vs_perdido", "Taxa conversão ganho vs perdido");
    pick("leads_sem_contato", "Leads sem contato");
    pick("atividades_pendentes", "Atividades pendentes");
    return rows;
  }, [dash]);

  if (loading && !dash) {
    return (
      <div className="crm-empty">
        <CrmPipelinePicker />
        <p style={{ marginTop: 16 }}>Carregando dashboard…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="crm-toolbar" style={{ marginBottom: 16 }}>
        <CrmPipelinePicker />
        <div className="crm-field">
          <span className="crm-field-label">De</span>
          <input className="crm-input" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="crm-field">
          <span className="crm-field-label">Até</span>
          <input className="crm-input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <button type="button" className="crm-btn crm-btn--outline" onClick={load} disabled={loading}>
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {err ? <div className="crm-error" style={{ marginBottom: 12 }}>{err}</div> : null}

      <section className="crm-kpi-grid">
        {kpi.map((x) => (
          <div key={x.label} className="crm-kpi">
            <div className="crm-kpi-val">{x.value}</div>
            <div className="crm-kpi-label">{x.label}</div>
          </div>
        ))}
      </section>

      <div className="crm-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Funil (período)</h3>
        <pre
          style={{
            margin: 0,
            fontSize: "0.8rem",
            overflow: "auto",
            maxHeight: 280,
            color: "var(--ds-text-secondary)",
          }}
        >
          {funnel ? JSON.stringify(funnel, null, 2) : "—"}
        </pre>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="crm-dashboard-split">
        <div className="crm-card">
          <h3 style={{ marginTop: 0 }}>Por responsável</h3>
          <pre style={{ margin: 0, fontSize: "0.8rem", overflow: "auto", maxHeight: 240 }}>
            {rankResp ? JSON.stringify(rankResp, null, 2) : "—"}
          </pre>
        </div>
        <div className="crm-card">
          <h3 style={{ marginTop: 0 }}>Por origem</h3>
          <pre style={{ margin: 0, fontSize: "0.8rem", overflow: "auto", maxHeight: 240 }}>
            {rankOrig ? JSON.stringify(rankOrig, null, 2) : "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}
