import { useCallback } from "react";
import * as cfg from "../../api/configService";
import SectionState from "../components/SectionState";
import { useSectionResource } from "../hooks/useSectionResource";

export function SecaoAuditoria({ auditoria, onRefresh }) {
return (
  <div className="ia-section">
    <h4>Logs / Auditoria</h4>
    <button className="ia-btn ia-btn--outline" onClick={onRefresh} style={{ marginBottom: 12 }}>Atualizar</button>
    <div style={{ maxHeight: 400, overflowY: "auto" }}>
      {auditoria.map((a, i) => (
        <div key={a.tipo + "-" + a.id + "-" + i} className="ia-log-item" style={{ padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
          <strong>{a.acao}</strong> — {a.usuario_nome || a.para_nome || "Sistema"} — {a.observacao || ""} — {a.criado_em ? new Date(a.criado_em).toLocaleString("pt-BR") : ""}
        </div>
      ))}
    </div>
  </div>
);
}

export default function AuditoriaSection() {
  const load = useCallback(() => cfg.getAuditoria(100), []);
  const resource = useSectionResource(load, [], "Erro ao carregar auditoria.");
  const refresh = () => resource.reload().catch(() => {});

  return (
    <SectionState loading={resource.loading} error={resource.error} onRetry={refresh}>
      <SecaoAuditoria auditoria={resource.data} onRefresh={refresh} />
    </SectionState>
  );
}
