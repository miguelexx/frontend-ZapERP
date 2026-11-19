import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Switch from "../../components/ui/Switch";
import ConfirmDialog from "../../components/feedback/ConfirmDialog";
import SectionState from "../components/SectionState";
import { useSectionResource } from "../hooks/useSectionResource";
import { useNotificationStore } from "../../notifications/notificationStore";
import { getRankingConfig, getRankingHistorico, salvarRankingConfig } from "../../api/rankingService";
import {
  DIAS_SEMANA,
  formatarDataHora,
  formatarPeriodo,
  juntarNomes,
  medalhaDaPosicao,
  rotuloAtendimentos,
} from "../../ranking/rankingUtils";
import "../../ranking/ranking.css";

async function carregarTudo() {
  const [painel, historico] = await Promise.all([
    getRankingConfig(),
    getRankingHistorico({ limit: 20 }).catch(() => []),
  ]);
  return { painel, historico };
}

function HistoricoItem({ item }) {
  const vencedores = Array.isArray(item.vencedores) ? item.vencedores : [];
  const classificacao = Array.isArray(item.classificacao) ? item.classificacao : [];
  return (
    <li className="rk-hist-item">
      <details>
        <summary>
          <span className="rk-hist-periodo">{formatarPeriodo(item.inicio, item.fim, item.timezone)}</span>
          <span className="rk-hist-vencedor">
            {vencedores.length ? `🏆 ${juntarNomes(vencedores.map((v) => v.nome))}` : "Sem vencedor"}
          </span>
          <span className="rk-hist-total">{vencedores.length ? rotuloAtendimentos(item.total_vencedor) : "—"}</span>
        </summary>
        <div className="rk-hist-detalhe">
          <p className="rk-hist-meta">
            Início: {formatarDataHora(item.inicio, item.timezone)} · Encerramento: {formatarDataHora(item.fim, item.timezone)}
          </p>
          {classificacao.length === 0 ? (
            <p className="rk-hist-meta">Nenhum atendimento finalizado neste período.</p>
          ) : (
            <ol className="rk-hist-classificacao">
              {classificacao.map((c) => (
                <li key={c.usuario_id}>
                  <span className="rk-hist-pos">{medalhaDaPosicao(c.posicao) || `${c.posicao}º`}</span>
                  <span className="rk-hist-nome">{c.nome}</span>
                  <span className="rk-hist-qtd">{c.total}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </details>
    </li>
  );
}

export default function RankingSection() {
  const showToast = useNotificationStore((s) => s.showToast);
  const resource = useSectionResource(carregarTudo, null, "Erro ao carregar o ranking.");
  const painel = resource.data?.painel;
  const historico = resource.data?.historico || [];

  const [form, setForm] = useState({ ativo: false, dia_semana: 5, horario: "18:00" });
  const [salvando, setSalvando] = useState(false);
  const [confirmarDesligar, setConfirmarDesligar] = useState(false);

  useEffect(() => {
    if (painel?.config) {
      setForm({
        ativo: painel.config.ativo === true,
        dia_semana: Number(painel.config.dia_semana),
        horario: painel.config.horario || "18:00",
      });
    }
  }, [painel]);

  const salvo = painel?.config;
  const alterado =
    !!salvo &&
    (form.ativo !== salvo.ativo || form.dia_semana !== Number(salvo.dia_semana) || form.horario !== salvo.horario);
  const desligandoComCompeticao = !!salvo?.ativo && !form.ativo && !!painel?.ciclo_atual;

  const salvar = useCallback(async () => {
    setConfirmarDesligar(false);
    setSalvando(true);
    try {
      await salvarRankingConfig(form);
      await resource.reload();
      showToast?.({
        type: "success",
        title: form.ativo ? "Ranking salvo" : "Ranking desativado",
        message: form.ativo
          ? "A competição está ativa. Mudanças de dia/horário valem a partir da próxima competição."
          : "A competição atual foi encerrada sem vencedor. Nenhum atendimento foi alterado.",
      });
    } catch (e) {
      showToast?.({
        type: "error",
        title: "Erro",
        message: e?.response?.data?.error || "Não foi possível salvar o ranking.",
      });
    } finally {
      setSalvando(false);
    }
  }, [form, resource, showToast]);

  const onSalvar = () => {
    if (salvando || !alterado) return;
    if (desligandoComCompeticao) setConfirmarDesligar(true);
    else void salvar();
  };

  return (
    <SectionState loading={resource.loading && !resource.data} error={resource.error} onRetry={() => resource.reload().catch(() => {})}>
      <div className="config-geral-section">
        <header className="config-geral-header">
          <span className="ia-auto-reply-eyebrow">Equipe</span>
          <h4 className="config-geral-title">Ranking de atendimentos</h4>
          <p className="config-geral-lead">
            Competição semanal entre atendentes. Conta os atendimentos finalizados — a mesma regra de “Finalizadas” da
            Supervisão. O vencedor é anunciado automaticamente no dia e horário escolhidos.
          </p>
        </header>

        {painel?.indisponivel ? (
          <div className="ia-error-banner" role="alert">
            O ranking ainda não está instalado no banco de dados (migration pendente). Fale com o suporte.
          </div>
        ) : null}

        <div className="config-geral-grid">
          <section className="config-geral-card config-geral-card--wide" aria-labelledby="rk-cfg-titulo">
            <h5 id="rk-cfg-titulo" className="config-geral-card-title">Competição semanal</h5>
            <div className="config-geral-toggle">
              <div className="config-geral-toggle-text">
                <span className="config-geral-toggle-label">Ranking ativo</span>
                <span className="config-geral-toggle-hint">
                  Desligar não afeta os atendimentos; apenas encerra a competição corrente sem vencedor.
                </span>
              </div>
              <Switch
                checked={form.ativo}
                onChange={(on) => setForm((f) => ({ ...f, ativo: on }))}
                disabled={salvando || painel?.indisponivel}
                aria-label="Ranking ativo"
              />
            </div>

            <div className="rk-cfg-campos">
              <div className="ia-field">
                <label htmlFor="rk-cfg-dia">Dia da divulgação do vencedor</label>
                <select
                  id="rk-cfg-dia"
                  className="ia-input"
                  value={form.dia_semana}
                  disabled={salvando || painel?.indisponivel}
                  onChange={(e) => setForm((f) => ({ ...f, dia_semana: Number(e.target.value) }))}
                >
                  {DIAS_SEMANA.map((nome, i) => (
                    <option key={nome} value={i}>
                      {nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ia-field">
                <label htmlFor="rk-cfg-hora">Horário do encerramento</label>
                <input
                  id="rk-cfg-hora"
                  className="ia-input"
                  type="time"
                  step={60}
                  value={form.horario}
                  disabled={salvando || painel?.indisponivel}
                  onChange={(e) => setForm((f) => ({ ...f, horario: e.target.value }))}
                />
              </div>
            </div>
            <p className="config-geral-toggle-hint">
              Horário no fuso da empresa ({painel?.fuso?.timezone_label || "Horário de Brasília"}) — o mesmo definido em
              Configurações → Geral.
            </p>

            {painel?.ciclo_atual ? (
              <p className="rk-cfg-ciclo">
                Competição atual: {formatarDataHora(painel.ciclo_atual.inicio, painel.ciclo_atual.timezone)} →{" "}
                <strong>{formatarDataHora(painel.ciclo_atual.fim, painel.ciclo_atual.timezone)}</strong>.{" "}
                {alterado && form.ativo
                  ? "O novo dia/horário vale a partir da próxima competição."
                  : null}{" "}
                <Link to="/ranking">Ver ranking</Link>
              </p>
            ) : null}

            <div className="rk-cfg-acoes">
              <button type="button" className="rk-btn" onClick={onSalvar} disabled={salvando || !alterado || painel?.indisponivel}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </section>

          <section className="config-geral-card config-geral-card--wide" aria-labelledby="rk-hist-titulo">
            <h5 id="rk-hist-titulo" className="config-geral-card-title">Vencedores anteriores</h5>
            {historico.length === 0 ? (
              <p className="config-geral-toggle-hint">Nenhuma competição encerrada ainda.</p>
            ) : (
              <ul className="rk-hist">
                {historico.map((item) => (
                  <HistoricoItem key={item.id} item={item} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <ConfirmDialog
          open={confirmarDesligar}
          title="Desativar o ranking?"
          confirmLabel="Desativar"
          danger
          onConfirm={() => void salvar()}
          onCancel={() => setConfirmarDesligar(false)}
        >
          A competição em andamento será encerrada <strong>sem vencedor</strong>. Os atendimentos não são alterados e o
          histórico de competições anteriores continua disponível.
        </ConfirmDialog>
      </div>
    </SectionState>
  );
}
