import { useEffect, useState } from "react";
import { crmApiError, listPipelines } from "../../api/crmService";
import { useCrmStore } from "../crmStore";

/** Seletor de pipeline sincronizado com o store global do CRM. */
export default function CrmPipelinePicker({ className = "" }) {
  const { pipelineId, setPipelineId } = useCrmStore();
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const data = await listPipelines({ ativo: true, include: "stages" });
        if (cancelled) return;
        setList(Array.isArray(data) ? data : []);
        if (useCrmStore.getState().pipelineId == null && data?.length) {
          const padrao = data.find((p) => p.padrao) ?? data[0];
          if (padrao?.id != null) setPipelineId(padrao.id);
        }
      } catch (e) {
        if (!cancelled) setErr(crmApiError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setPipelineId]);

  return (
    <div className={`crm-field ${className}`}>
      <span className="crm-field-label">Pipeline</span>
      <select
        className="crm-select"
        aria-label="Pipeline"
        disabled={loading || !!err}
        value={pipelineId ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          setPipelineId(v === "" ? null : Number(v));
        }}
      >
        <option value="">{loading ? "Carregando…" : "Selecione"}</option>
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
            {p.padrao ? " (padrão)" : ""}
          </option>
        ))}
      </select>
      {err ? <span className="crm-muted">{err}</span> : null}
    </div>
  );
}
