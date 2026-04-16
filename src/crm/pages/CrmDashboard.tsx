import { useCallback, useEffect, useMemo, useState } from "react";
import {
  crmApiError,
  getCrmDashboard,
  getCrmDashboardFunnel,
  getCrmDashboardOrigens,
  getCrmDashboardResponsaveis,
} from "../../api/crmService";
import {
  extractRanking,
  formatBRL,
  formatInt,
  formatPct,
  normalizeFunnelStages,
  rankingLabel,
  rankingTotalLeads,
  rankingValorPotencial,
} from "../crmFormatters";
import CrmPipelinePicker from "../components/CrmPipelinePicker.jsx";
import { useCrmStore } from "../crmStore";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatDashScalar(key: string, v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") {
    if (key.includes("valor") || key.includes("soma")) return formatBRL(v);
    if (key.includes("taxa") || key.includes("percent")) return formatPct(v);
    return formatInt(v);
  }
  if (typeof v === "object") return ""; // tratado à parte
  return String(v);
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

  const statCards = useMemo(() => {
    if (!dash) return [];
    const cards: { label: string; value: string; tone: "mint" | "amber" | "blue" | "rose" }[] = [];

    const totais = dash.totais;
    if (totais && typeof totais === "object") {
      const t = totais as Record<string, unknown>;
      cards.push({
        label: "Leads no funil",
        value: `${formatInt(t.ativos ?? t.ativo)} ativos · ${formatInt(t.todos ?? t.total)} total`,
        tone: "mint",
      });
    }

    const pushScalar = (key: string, label: string, tone: (typeof cards)[0]["tone"]) => {
      const v = dash[key];
      if (v == null || typeof v === "object") return;
      cards.push({ label, value: formatDashScalar(key, v), tone });
    };

    pushScalar("valor_estimado_soma_ativos", "Valor estimado (ativos)", "amber");
    pushScalar("valor_ganho_estimado", "Valor ganho estimado", "mint");
    pushScalar("taxa_conversao_ganho_vs_perdido", "Taxa conversão", "blue");

    const lsc = dash.leads_sem_contato;
    if (typeof lsc === "number") {
      cards.push({ label: "Leads sem contato", value: formatInt(lsc), tone: "rose" });
    } else if (lsc && typeof lsc === "object") {
      const o = lsc as Record<string, unknown>;
      cards.push({
        label: "Leads sem contato",
        value: `${formatInt(o.total ?? o.count)} (${String(o.sem_contato_dias ?? "—")} dias)`,
        tone: "rose",
      });
    }

    pushScalar("atividades_pendentes", "Atividades pendentes", "blue");

    return cards;
  }, [dash]);

  const funnelStages = useMemo(() => normalizeFunnelStages(funnel), [funnel]);
  const funnelMax = useMemo(() => Math.max(1, ...funnelStages.map((s) => s.value)), [funnelStages]);

  const rankingResponsaveis = useMemo(() => extractRanking(rankResp), [rankResp]);
  const rankingOrigens = useMemo(() => extractRanking(rankOrig), [rankOrig]);

  const funnelMeta = useMemo(() => {
    if (!funnel) return "";
    const parts: string[] = [];
    if (funnel.total_novos != null) parts.push(`${formatInt(funnel.total_novos)} novos no período`);
    const p = funnel.periodo;
    if (p && typeof p === "object") {
      const o = p as Record<string, unknown>;
      if (o.de || o.ate) parts.push(`${String(o.de ?? "").slice(0, 10)} → ${String(o.ate ?? "").slice(0, 10)}`);
    }
    return parts.join(" · ");
  }, [funnel]);

  if (loading && !dash) {
    return (
      <div>
        <div className="crm-toolbar crm-toolbar--premium">
          <CrmPipelinePicker />
        </div>
        <div className="crm-empty-soft">Carregando dashboard…</div>
      </div>
    );
  }

  return (
    <div>
      <div className="crm-page-head">
        <div>
          <h2>Visão geral</h2>
          <p>Indicadores e funil alinhados ao pipeline selecionado e ao período de criação dos leads.</p>
        </div>
      </div>

      <div className="crm-toolbar crm-toolbar--premium">
        <CrmPipelinePicker />
        <div className="crm-field">
          <span className="crm-field-label">Criados de</span>
          <input className="crm-input" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="crm-field">
          <span className="crm-field-label">Criados até</span>
          <input className="crm-input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <button type="button" className="crm-btn crm-btn--primary" onClick={load} disabled={loading}>
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {err ? <div className="crm-error" style={{ marginBottom: 16 }}>{err}</div> : null}

      <section className="crm-stat-grid">
        {statCards.map((c) => (
          <div key={c.label} className={`crm-stat-card crm-stat-card--${c.tone}`}>
            <div className="crm-stat-card__val">{c.value}</div>
            <div className="crm-stat-card__label">{c.label}</div>
          </div>
        ))}
      </section>

      <div className="crm-panel">
        <div className="crm-panel__head">
          <h3 className="crm-panel__title">Funil no período</h3>
          <span className="crm-panel__meta">{funnelMeta || "—"}</span>
        </div>
        {funnelStages.length === 0 ? (
          <div className="crm-empty-soft">Sem dados de estágios para o período selecionado.</div>
        ) : (
          <>
            {funnel?.total_novos != null ? (
              <div className="crm-funnel-total">Total de novos: {formatInt(funnel.total_novos)}</div>
            ) : null}
            <div className="crm-funnel-bars">
              {funnelStages.map((row) => (
                <div key={row.label} className="crm-funnel-row">
                  <div className="crm-funnel-name" title={row.label}>
                    {row.label}
                  </div>
                  <div className="crm-funnel-track">
                    <div
                      className="crm-funnel-fill"
                      style={{ width: `${Math.min(100, (row.value / funnelMax) * 100)}%` }}
                    />
                  </div>
                  <div className="crm-funnel-num">{formatInt(row.value)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="crm-rank-grid">
        <div className="crm-panel" style={{ marginBottom: 0 }}>
          <div className="crm-panel__head">
            <h3 className="crm-panel__title">Por responsável</h3>
            <span className="crm-panel__meta">Leads ativos</span>
          </div>
          {rankingResponsaveis.length === 0 ? (
            <div className="crm-empty-soft">Nenhum dado para exibir.</div>
          ) : (
            <ol className="crm-rank-list">
              {rankingResponsaveis.map((row, i) => (
                <li key={i} className="crm-rank-item">
                  <span className="crm-rank-pos">{i + 1}</span>
                  <div className="crm-rank-body">
                    <div className="crm-rank-name">{rankingLabel(row)}</div>
                    <div className="crm-rank-sub">
                      {formatInt(rankingTotalLeads(row))} leads · {formatBRL(rankingValorPotencial(row))} potencial
                    </div>
                  </div>
                  <span className="crm-rank-val">{formatBRL(rankingValorPotencial(row))}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="crm-panel" style={{ marginBottom: 0 }}>
          <div className="crm-panel__head">
            <h3 className="crm-panel__title">Por origem</h3>
            <span className="crm-panel__meta">Valor potencial</span>
          </div>
          {rankingOrigens.length === 0 ? (
            <div className="crm-empty-soft">Nenhum dado para exibir.</div>
          ) : (
            <ol className="crm-rank-list">
              {rankingOrigens.map((row, i) => (
                <li key={i} className="crm-rank-item">
                  <span className="crm-rank-pos">{i + 1}</span>
                  <div className="crm-rank-body">
                    <div className="crm-rank-name">{rankingLabel(row)}</div>
                    <div className="crm-rank-sub">{formatInt(rankingTotalLeads(row))} leads</div>
                  </div>
                  <span className="crm-rank-val">{formatBRL(rankingValorPotencial(row))}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
