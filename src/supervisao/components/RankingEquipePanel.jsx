import EmptyState from "../../components/feedback/EmptyState";
import { formatTempoMinutos, toNumber } from "../supervisaoUtils";

export default function RankingEquipePanel({ equipe, onAbrirMovimentacao }) {
  return (
    <div className="supervisao-panel">
      <h2>Ranking da equipe</h2>
      {equipe.length === 0 ? (
        <EmptyState title="Sem dados de equipe hoje." description="" />
      ) : (
        <div className="supervisao-team-grid">
          {equipe.map((funcionario, index) => (
            <button
              key={String(funcionario?.id ?? funcionario?.usuario_id ?? index)}
              type="button"
              className="supervisao-team-card"
              onClick={() => onAbrirMovimentacao(funcionario)}
            >
              <strong>{funcionario?.nome ?? "Funcionário"}</strong>
              <span>
                {toNumber(funcionario?.assumidos_hoje ?? funcionario?.assumidosHoje ?? funcionario?.total_assumidos ?? 0)} assumidos hoje
              </span>
              <span>
                {toNumber(funcionario?.sem_resposta ?? funcionario?.clientes_sem_resposta ?? funcionario?.pendentes ?? 0)} sem resposta
              </span>
              <span>
                Maior tempo sem responder:{" "}
                {formatTempoMinutos(
                  toNumber(funcionario?.maior_tempo_sem_responder_minutos ?? funcionario?.maior_tempo_espera_minutos ?? 0)
                )}
              </span>
              <span>
                Tempo médio:{" "}
                {formatTempoMinutos(
                  toNumber(funcionario?.tempo_medio_resposta_minutos ?? funcionario?.tempoMedioRespostaMinutos ?? 0)
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
