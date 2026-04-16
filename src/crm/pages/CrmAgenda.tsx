import { useCallback, useEffect, useState } from "react";
import { crmApiError, getAgenda, getAgendaResumo } from "../../api/crmService";
import CrmPipelinePicker from "../components/CrmPipelinePicker.jsx";
import { useCrmStore } from "../crmStore";

function isoRangeWeek() {
  const de = new Date();
  const day = de.getDay();
  const diff = de.getDate() - day + (day === 0 ? -6 : 1);
  de.setDate(diff);
  de.setHours(0, 0, 0, 0);
  const ate = new Date(de);
  ate.setDate(ate.getDate() + 6);
  ate.setHours(23, 59, 59, 999);
  return { de: de.toISOString(), ate: ate.toISOString() };
}

export default function CrmAgenda() {
  const pipelineId = useCrmStore((s) => s.pipelineId);
  const refreshTick = useCrmStore((s) => s.refreshTick);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [resumo, setResumo] = useState<Record<string, unknown> | null>(null);
  const [agenda, setAgenda] = useState<Record<string, unknown> | null>(null);
  const [{ de, ate }, setRange] = useState(() => isoRangeWeek());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      const [r, a] = await Promise.all([
        getAgendaResumo(),
        getAgenda({
          de,
          ate,
          ...(pipelineId != null ? { pipeline_id: pipelineId } : {}),
        }),
      ]);
      setResumo(r as Record<string, unknown>);
      setAgenda(a as Record<string, unknown>);
    } catch (e) {
      setErr(crmApiError(e));
    } finally {
      setLoading(false);
    }
  }, [de, ate, pipelineId]);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  const porDia = agenda && typeof agenda === "object" && agenda.por_dia ? agenda.por_dia : null;

  return (
    <div>
      <div className="crm-toolbar" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <CrmPipelinePicker />
        <div className="crm-field">
          <span className="crm-field-label">De (ISO)</span>
          <input
            className="crm-input"
            type="datetime-local"
            value={de.slice(0, 16)}
            onChange={(e) => setRange((x) => ({ ...x, de: new Date(e.target.value).toISOString() }))}
          />
        </div>
        <div className="crm-field">
          <span className="crm-field-label">Até (ISO)</span>
          <input
            className="crm-input"
            type="datetime-local"
            value={ate.slice(0, 16)}
            onChange={(e) => setRange((x) => ({ ...x, ate: new Date(e.target.value).toISOString() }))}
          />
        </div>
        <button type="button" className="crm-btn crm-btn--outline" onClick={load} disabled={loading}>
          {loading ? "Carregando…" : "Atualizar"}
        </button>
      </div>

      {err ? <div className="crm-error" style={{ marginBottom: 12 }}>{err}</div> : null}

      <div className="crm-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Resumo</h3>
        <pre style={{ margin: 0, fontSize: "0.85rem", overflow: "auto" }}>
          {resumo ? JSON.stringify(resumo, null, 2) : loading ? "…" : "—"}
        </pre>
      </div>

      <div className="crm-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Agenda completa</h3>
        <pre style={{ margin: 0, fontSize: "0.8rem", overflow: "auto", maxHeight: 360 }}>
          {agenda ? JSON.stringify(agenda, null, 2) : "—"}
        </pre>
      </div>

      {porDia && typeof porDia === "object" ? (
        <div className="crm-card">
          <h3 style={{ marginTop: 0 }}>Por dia</h3>
          <pre style={{ margin: 0, fontSize: "0.8rem", overflow: "auto", maxHeight: 280 }}>
            {JSON.stringify(porDia, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
