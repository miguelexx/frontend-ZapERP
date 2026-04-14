import { Link } from "react-router-dom";
import { extractEvidenciasFromData } from "./extractEvidencias.js";

/**
 * @param {{ data: unknown }} props
 */
export default function IaEvidenciasChips({ data }) {
  const rows = extractEvidenciasFromData(data);
  if (!rows.length) return null;

  return (
    <div className="ia-evidencias" aria-label="Evidências">
      <div className="ia-evidencias-title">Evidências</div>
      <div className="ia-evidencias-chips">
        {rows.map((r, i) => {
          const k = `ev-${i}-${r.conversa_id}-${r.mensagem_id}-${r.internal_conversation_id}-${r.internal_message_id}`;
          if (r.conversa_id != null) {
            return (
              <Link
                key={k}
                className="ia-ev-chip ia-ev-chip--link"
                to="/atendimento"
                state={{ openConversaId: Number(r.conversa_id) }}
              >
                Conversa #{r.conversa_id}
                {r.mensagem_id != null ? <span className="ia-ev-sub">msg {r.mensagem_id}</span> : null}
              </Link>
            );
          }
          if (r.internal_conversation_id != null) {
            return (
              <Link
                key={k}
                className="ia-ev-chip ia-ev-chip--link"
                to="/chat-interno"
                state={{ openInternalConversationId: String(r.internal_conversation_id) }}
              >
                Chat interno #{r.internal_conversation_id}
                {r.internal_message_id != null ? <span className="ia-ev-sub">msg {r.internal_message_id}</span> : null}
              </Link>
            );
          }
          if (r.cliente_id != null) {
            return (
              <span key={k} className="ia-ev-chip" title={r.snippet || undefined}>
                Cliente #{r.cliente_id}
              </span>
            );
          }
          if (r.mensagem_id != null) {
            return (
              <span key={k} className="ia-ev-chip" title={r.snippet || undefined}>
                Mensagem #{r.mensagem_id}
              </span>
            );
          }
          if (r.internal_message_id != null) {
            return (
              <span key={k} className="ia-ev-chip" title={r.snippet || undefined}>
                Msg interna #{r.internal_message_id}
              </span>
            );
          }
          if (r.snippet) {
            return (
              <span key={k} className="ia-ev-chip ia-ev-chip--snippet" title="Trecho">
                “{r.snippet.slice(0, 48)}
                {r.snippet.length > 48 ? "…" : ""}”
              </span>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
