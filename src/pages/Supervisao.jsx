import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmptyState from "../components/feedback/EmptyState";
import {
  getClientesPendentesSupervisao,
  getMovimentacaoFuncionarioSupervisao,
  getResumoSupervisao,
} from "../api/supervisaoService";
import "./supervisao.css";

function getArray(value, fallbackKeys = []) {
  if (Array.isArray(value)) return value;
  for (let i = 0; i < fallbackKeys.length; i++) {
    const item = value?.[fallbackKeys[i]];
    if (Array.isArray(item)) return item;
  }
  return [];
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getNivelByMinutes(minutes, slaMinutes = 30) {
  const limit = toNumber(slaMinutes, 30);
  if (minutes >= limit) return "critico";
  if (minutes >= Math.max(15, Math.floor(limit * 0.7))) return "atencao";
  return "normal";
}

function formatTempo(mins) {
  const total = toNumber(mins, 0);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m}min`;
}

function getPendentesOrdenados(clientesPendentes, slaMinutos) {
  const rows = clientesPendentes.map((item) => {
    const tempoAguardandoMinutos = toNumber(
      item?.tempo_aguardando_minutos ??
        item?.tempoAguardandoMinutos ??
        item?.tempo_espera_minutos ??
        item?.minutes_waiting ??
        0
    );
    const nivel =
      String(item?.nivel ?? "").toLowerCase() || getNivelByMinutes(tempoAguardandoMinutos, slaMinutos);
    return { ...item, tempoAguardandoMinutos, nivel };
  });

  return rows.sort((a, b) => {
    const peso = { critico: 0, atencao: 1, normal: 2 };
    const pA = peso[a.nivel] ?? 3;
    const pB = peso[b.nivel] ?? 3;
    if (pA !== pB) return pA - pB;
    return b.tempoAguardandoMinutos - a.tempoAguardandoMinutos;
  });
}

export default function Supervisao() {
  const navigate = useNavigate();
  const [resumo, setResumo] = useState(null);
  const [clientesPendentes, setClientesPendentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [funcionarioAtivo, setFuncionarioAtivo] = useState(null);
  const [movimentacao, setMovimentacao] = useState(null);
  const [loadingMovimentacao, setLoadingMovimentacao] = useState(false);

  const carregarDados = useCallback(async () => {
    try {
      setError("");
      const [resumoData, pendentesData] = await Promise.all([
        getResumoSupervisao(),
        getClientesPendentesSupervisao(),
      ]);
      setResumo(resumoData || {});
      setClientesPendentes(Array.isArray(pendentesData) ? pendentesData : []);
    } catch (err) {
      setError(err?.response?.data?.error || "Nao foi possivel carregar a central de supervisao.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
    const timer = setInterval(() => {
      carregarDados();
    }, 30000);
    return () => clearInterval(timer);
  }, [carregarDados]);

  const slaMinutos = toNumber(resumo?.sla_minutos ?? resumo?.slaMinutos ?? 30, 30);

  const cards = useMemo(() => {
    return [
      {
        label: "Atendimentos abertos",
        valor: toNumber(resumo?.atendimentos_abertos ?? resumo?.atendimentosAbertos ?? 0),
      },
      {
        label: "Aguardando funcionario",
        valor: toNumber(resumo?.aguardando_funcionario ?? resumo?.aguardandoFuncionario ?? 0),
      },
      {
        label: "Atrasados",
        valor: toNumber(resumo?.atrasados ?? 0),
      },
      {
        label: "Tempo medio de resposta",
        valor: formatTempo(toNumber(resumo?.tempo_medio_resposta_minutos ?? resumo?.tempoMedioRespostaMinutos ?? 0)),
      },
    ];
  }, [resumo]);

  const pendentesOrdenados = useMemo(
    () => getPendentesOrdenados(clientesPendentes, slaMinutos),
    [clientesPendentes, slaMinutos]
  );

  const equipeHoje = useMemo(
    () => getArray(resumo, ["equipe_hoje", "equipeHoje", "funcionarios", "atendentes"]),
    [resumo]
  );

  const avisos = useMemo(() => {
    const criticos = pendentesOrdenados.filter((item) => item.nivel === "critico");
    return criticos.slice(0, 8);
  }, [pendentesOrdenados]);

  async function abrirMovimentacao(funcionario) {
    if (!funcionario?.id) return;
    setFuncionarioAtivo(funcionario);
    setLoadingMovimentacao(true);
    try {
      const data = await getMovimentacaoFuncionarioSupervisao(funcionario.id);
      setMovimentacao(data);
    } catch {
      setMovimentacao(null);
    } finally {
      setLoadingMovimentacao(false);
    }
  }

  function abrirConversa(conversaId) {
    if (!conversaId) return;
    navigate("/atendimento", { state: { openConversaId: conversaId } });
  }

  if (loading) {
    return <div className="supervisao-page">Carregando supervisao...</div>;
  }

  if (error) {
    return (
      <div className="supervisao-page">
        <div className="supervisao-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="supervisao-page">
      <header className="supervisao-header">
        <h1>Supervisao</h1>
        <p>Acompanhe clientes aguardando resposta e o desempenho da equipe em tempo real.</p>
      </header>

      <section className="supervisao-cards">
        {cards.map((card) => (
          <article key={card.label} className="supervisao-card">
            <strong>{card.valor}</strong>
            <span>{card.label}</span>
          </article>
        ))}
      </section>

      <section className="supervisao-grid">
        <div className="supervisao-panel">
          <div className="supervisao-panel-header">
            <h2>Clientes aguardando resposta</h2>
          </div>
          {pendentesOrdenados.length === 0 ? (
            <EmptyState title="Nenhum cliente aguardando resposta no momento." description="" />
          ) : (
            <div className="supervisao-list">
              {pendentesOrdenados.map((item, index) => (
                <article key={String(item?.conversa_id ?? item?.id ?? `pendente-${index}`)} className={`supervisao-row is-${item.nivel}`}>
                  <div className="supervisao-row-main">
                    <strong>{item?.cliente_nome ?? item?.cliente?.nome ?? "Cliente sem nome"}</strong>
                    <span>{item?.telefone ?? item?.cliente_telefone ?? "-"}</span>
                    <p>{item?.ultima_mensagem_resumo ?? item?.ultimaMensagemResumo ?? "Sem resumo de mensagem"}</p>
                  </div>
                  <div className="supervisao-row-meta">
                    <span>{item?.funcionario_nome ?? item?.responsavel_nome ?? "Sem responsavel"}</span>
                    <span>{item?.departamento_nome ?? item?.setor ?? "Sem departamento"}</span>
                    <span>{formatTempo(item.tempoAguardandoMinutos)}</span>
                    <span className={`badge badge-${item.nivel}`}>{item.nivel}</span>
                    <button type="button" onClick={() => abrirConversa(item?.conversa_id ?? item?.conversaId)}>
                      Abrir conversa
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="supervisao-panel">
          <h2>Equipe hoje</h2>
          {equipeHoje.length === 0 ? (
            <EmptyState title="Sem dados de equipe hoje." description="" />
          ) : (
            <div className="supervisao-team-grid">
              {equipeHoje.map((funcionario) => (
                <button
                  key={String(funcionario?.id ?? funcionario?.usuario_id)}
                  type="button"
                  className="supervisao-team-card"
                  onClick={() => abrirMovimentacao(funcionario)}
                >
                  <strong>{funcionario?.nome ?? "Funcionario"}</strong>
                  <span>{toNumber(funcionario?.assumidos_hoje ?? funcionario?.assumidosHoje ?? 0)} assumidos hoje</span>
                  <span>{toNumber(funcionario?.sem_resposta ?? funcionario?.clientes_sem_resposta ?? 0)} sem resposta</span>
                  <span>{toNumber(funcionario?.atrasados ?? 0)} atrasados</span>
                  <span>Tempo medio: {formatTempo(toNumber(funcionario?.tempo_medio_resposta_minutos ?? 0))}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="supervisao-panel">
        <h2>Avisos de prioridade</h2>
        {avisos.length === 0 ? (
          <p className="supervisao-empty-note">Todos os atendimentos estao dentro do prazo.</p>
        ) : (
          <ul className="supervisao-alerts">
            {avisos.map((item, index) => (
              <li key={`alert-${String(item?.conversa_id ?? item?.id ?? index)}`}>
                <span>
                  {item?.cliente_nome ?? "Cliente"} aguardando ha {formatTempo(item.tempoAguardandoMinutos)} -{" "}
                  {item?.funcionario_nome ?? "Sem responsavel"} ({item?.departamento_nome ?? "Sem departamento"})
                </span>
                <button type="button" onClick={() => abrirConversa(item?.conversa_id ?? item?.conversaId)}>
                  Abrir conversa
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {funcionarioAtivo ? (
        <div className="supervisao-modal-backdrop" onClick={() => setFuncionarioAtivo(null)}>
          <div className="supervisao-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>Movimentacao do funcionario</h3>
              <p>{funcionarioAtivo?.nome ?? ""}</p>
            </header>
            {loadingMovimentacao ? (
              <p>Carregando detalhes...</p>
            ) : (
              <>
                <div className="supervisao-modal-grid">
                  <div>
                    <strong>Resumo do dia</strong>
                    <p>{movimentacao?.resumo ?? "Sem resumo disponivel."}</p>
                  </div>
                  <div>
                    <strong>Conversas em aberto</strong>
                    <p>{toNumber(movimentacao?.conversas_em_aberto ?? movimentacao?.conversasEmAberto ?? 0)}</p>
                  </div>
                </div>
                <div>
                  <strong>Eventos importantes</strong>
                  <ul className="supervisao-eventos">
                    {getArray(movimentacao, ["eventos", "movimentacoes"]).map((evento, idx) => (
                      <li key={`${String(evento?.id ?? idx)}`}>
                        {evento?.descricao ?? evento?.tipo ?? "Evento"}{" "}
                        <small>{evento?.hora ?? evento?.criado_em ?? ""}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
