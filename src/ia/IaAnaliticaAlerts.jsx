import { resolveAlertasParaUi } from "./collectAnaliticaAlertas.js";

function iconForSeveridade(sev) {
  if (sev === "erro") return "⛔";
  if (sev === "aviso") return "⚠️";
  return "ℹ️";
}

/**
 * @param {{ data: unknown }} props
 */
export default function IaAnaliticaAlerts({ data }) {
  const alertas = resolveAlertasParaUi(data);
  if (!alertas.length) return null;

  return (
    <ul className="ia-analitica-alerts" aria-label="Alertas analíticos">
      {alertas.map((a, i) => (
        <li
          key={`${a.codigo}-${i}`}
          className={`ia-analitica-alert ia-analitica-alert--${a.severidade}`}
          data-origem={a.origem || undefined}
        >
          <span className="ia-analitica-alert-ico" aria-hidden="true">
            {iconForSeveridade(a.severidade)}
          </span>
          <div className="ia-analitica-alert-body">
            <div className="ia-analitica-alert-title">{a.titulo}</div>
            {a.mensagem ? <div className="ia-analitica-alert-msg">{a.mensagem}</div> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
