import { Link } from "react-router-dom";
import { isPlainObject } from "./aiAskTypes.js";

/**
 * @param {{ data: unknown }} props
 */
export default function IaConversasEnvolvidas({ data }) {
  if (!isPlainObject(data) || !Array.isArray(data.conversas_envolvidas)) return null;
  const list = data.conversas_envolvidas.filter(isPlainObject).slice(0, 8);
  if (!list.length) return null;

  return (
    <div className="ia-analitica-conversas" aria-label="Conversas envolvidas">
      <div className="ia-analitica-conversas-title">Conversas envolvidas</div>
      <div className="ia-analitica-conversas-chips">
        {list
          .map((c, i) => {
            const id = c.id ?? c.conversa_id;
            if (id == null) return null;
            const st = c.status_atendimento != null ? String(c.status_atendimento) : "";
            return (
              <Link
                key={`${id}-${i}`}
                className="ia-analitica-conv-chip"
                to="/atendimento"
                state={{ openConversaId: Number(id) }}
              >
                #{id}
                {st ? <span className="ia-analitica-conv-chip-meta">{st}</span> : null}
              </Link>
            );
          })
          .filter(Boolean)}
      </div>
    </div>
  );
}
