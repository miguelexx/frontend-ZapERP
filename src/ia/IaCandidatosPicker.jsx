import { resolveAlertasParaUi } from "./collectAnaliticaAlertas.js";
import { isPlainObject } from "./aiAskTypes.js";

function isUsuarioCand(c) {
  return isPlainObject(c) && (c.usuario_id != null || c.user_id != null);
}

/**
 * @param {{ data: unknown, onPick: (suggestion: string) => void, disabled?: boolean }} props
 */
export default function IaCandidatosPicker({ data, onPick, disabled }) {
  const alertas = resolveAlertasParaUi(data);
  const blocks = alertas
    .map((a) => ({ alert: a, candidatos: Array.isArray(a.candidatos) ? a.candidatos : [] }))
    .filter((b) => b.candidatos.length > 0);
  if (!blocks.length) return null;

  return (
    <div className="ia-candidatos" aria-label="Desambiguação">
      <div className="ia-candidatos-title">Refinar pergunta</div>
      <p className="ia-candidatos-hint">Toque numa opção para colocar o texto sugerido no campo de pergunta.</p>
      {blocks.map((b, bi) => (
        <div key={bi} className="ia-candidatos-block">
          <div className="ia-candidatos-block-title">{b.alert.titulo}</div>
          <div className="ia-candidatos-chips">
            {b.candidatos.map((c, ci) => {
              if (!isPlainObject(c)) return null;
              const clienteId = c.cliente_id ?? c.clienteId;
              if (clienteId != null) {
                const id = clienteId;
                const nome = String(c.nome || "").trim() || `Cliente ${id}`;
                const tel = c.telefone ? String(c.telefone).trim() : "";
                const suggestion = tel
                  ? `${nome} — telefone ${tel} (cliente id ${id})`
                  : `${nome} (cliente id ${id})`;
                return (
                  <button
                    key={`c-${ci}-${id}`}
                    type="button"
                    className="ia-candidatos-chip"
                    disabled={disabled}
                    onClick={() => onPick(suggestion)}
                  >
                    {nome}
                    {tel ? <span className="ia-candidatos-chip-tel">{tel}</span> : null}
                    <span className="ia-candidatos-chip-id">#{id}</span>
                  </button>
                );
              }
              if (isUsuarioCand(c)) {
                const id = c.usuario_id ?? c.user_id;
                const nome = String(c.nome || "").trim() || `Utilizador ${id}`;
                const suggestion = `${nome} (utilizador id ${id})`;
                return (
                  <button
                    key={`u-${ci}-${id}`}
                    type="button"
                    className="ia-candidatos-chip"
                    disabled={disabled}
                    onClick={() => onPick(suggestion)}
                  >
                    {nome}
                    <span className="ia-candidatos-chip-id">#{id}</span>
                  </button>
                );
              }
              return null;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
