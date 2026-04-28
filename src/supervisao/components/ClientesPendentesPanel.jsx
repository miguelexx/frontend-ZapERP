import EmptyState from "../../components/feedback/EmptyState";
import { formatTempoMinutos } from "../supervisaoUtils";

function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

export default function ClientesPendentesPanel({ clientes, onAbrirConversa }) {
  return (
    <div className="supervisao-panel">
      <h2>Clientes aguardando resposta</h2>
      {clientes.length === 0 ? (
        <EmptyState title="Nenhum cliente aguardando resposta no momento." description="" />
      ) : (
        <div className="supervisao-list">
          {clientes.map((item, index) => (
            <article key={String(item?.conversaId ?? index)} className={`supervisao-row is-${item.nivel}`}>
              <div className="supervisao-row-main">
                <strong>{item.clienteNome}</strong>
                <span>{item.telefone}</span>
                <p>{item.resumoConversa}</p>
                <small className="supervisao-row-datetime">
                  Última mensagem: {formatDateTime(item.ultimaMensagemEm)}
                </small>
              </div>
              <div className="supervisao-row-meta">
                <span>{item.funcionarioNome}</span>
                <span>{item.departamentoNome}</span>
                <span>{formatTempoMinutos(item.minutosAguardando)}</span>
                <span className={`badge badge-${item.nivel}`}>{item.nivel}</span>
                <button type="button" onClick={() => onAbrirConversa(item.conversaId)}>
                  Abrir conversa
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
