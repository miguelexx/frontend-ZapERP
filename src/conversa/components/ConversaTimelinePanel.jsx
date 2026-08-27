import { IconClose } from "../conversaViewIcons";
import { formatHoraCurta, timelineEventLabel } from "../utils/conversaViewHelpers";

/**
 * Painel "Histórico" do atendimento (timeline de eventos, transferências e notas).
 *
 * Extraído do JSX de ConversaView.jsx sem alterar classes CSS nem markup.
 * Os dados (`atendimentos`) continuam vindo do conversaStore; este componente
 * é puramente de apresentação.
 */
export default function ConversaTimelinePanel({
  open,
  atendimentos,
  atendimentosLoading,
  conversa,
  onClose,
}) {
  if (!open) return null;

  const list = atendimentos || [];

  return (
    <div className="wa-timeline" role="region" aria-label="Historico do atendimento">
      <div className="wa-timeline-head">
        <div className="wa-timeline-headLeft">
          <span className="wa-timeline-title">Histórico</span>
          <span className="wa-timeline-sub">Eventos, transferências e notas desta conversa (Esc para fechar)</span>
        </div>

        <button onClick={onClose} className="wa-iconBtn" title="Fechar (Esc)" type="button">
          <IconClose />
        </button>
      </div>

      <div className="wa-timeline-body">
        {atendimentosLoading ? (
          <div className="wa-muted">Carregando...</div>
        ) : list.length === 0 ? (
          <div className="wa-muted">Sem histórico ainda.</div>
        ) : (
          <div className="wa-timeline-list">
            {list.map((a) => (
              <div key={a.id || `${a.acao}-${a.criado_em}`} className="wa-timeline-card">
                <div className="wa-timeline-row">
                  <span className="wa-timeline-time">{formatHoraCurta(a.criado_em)}</span>
                  <span className="wa-timeline-label">{timelineEventLabel(a, conversa)}</span>
                </div>
                {a.observacao ? (
                  <div className="wa-timeline-nota">Nota interna: {a.observacao}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
