import { useCallback, useEffect, useRef, useState } from "react";
import { IconClockHour4, IconTrophy } from "@tabler/icons-react";
import EmptyState from "../components/feedback/EmptyState";
import { SkeletonGrid } from "../components/feedback/Skeleton";
import { useAuthStore } from "../auth/authStore";
import { getRankingAtual } from "../api/rankingService";
import { useRankingStore } from "./rankingStore";
import {
  formatarDataHora,
  formatarPeriodo,
  formatarTempoRestante,
  juntarNomes,
  medalhaDaPosicao,
  rotuloAtendimentos,
} from "./rankingUtils";
import "./ranking.css";

const POLL_MS = 30 * 1000;
const DEBOUNCE_ENCERRADA_MS = 2500;

function isAdmin(user) {
  return ["admin", "administrador"].includes(String(user?.perfil || "").toLowerCase());
}

/** Contagem regressiva isolada: só ela re-renderiza a cada segundo. */
function ContagemRegressiva({ fimIso, offsetMs, onZerar }) {
  const [agora, setAgora] = useState(() => Date.now() + offsetMs);
  const zerouRef = useRef(false);
  const restante = new Date(fimIso).getTime() - agora;

  useEffect(() => {
    zerouRef.current = false;
    const id = setInterval(() => setAgora(Date.now() + offsetMs), 1000);
    return () => clearInterval(id);
  }, [fimIso, offsetMs]);

  useEffect(() => {
    if (restante <= 0 && !zerouRef.current) {
      zerouRef.current = true;
      onZerar?.();
    }
  }, [restante, onZerar]);

  return (
    <span className="rk-contagem" aria-live="off">
      {formatarTempoRestante(restante)}
    </span>
  );
}

function Avatar({ nome }) {
  const inicial = String(nome || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="rk-avatar" aria-hidden>
      {inicial}
    </span>
  );
}

function Podio({ itens, meuId }) {
  if (itens.length === 0) return null;
  return (
    <ol className="rk-podio" aria-label="Três primeiros colocados">
      {itens.map((item) => {
        const eu = Number(item.usuario_id) === Number(meuId);
        return (
          <li
            key={item.usuario_id}
            className={`rk-podio-card rk-podio-card--p${Math.min(item.posicao, 3)}${eu ? " is-eu" : ""}`}
          >
            <span className="rk-podio-medalha" aria-hidden>
              {medalhaDaPosicao(item.posicao)}
            </span>
            <Avatar nome={item.nome} />
            <span className="rk-podio-nome">
              {item.nome}
              {eu ? <span className="rk-tag-eu">você</span> : null}
            </span>
            <span className="rk-podio-total">
              <strong>{item.total}</strong> {item.total === 1 ? "atendimento" : "atendimentos"}
            </span>
            <span className="rk-podio-posicao">{item.posicao}º lugar</span>
          </li>
        );
      })}
    </ol>
  );
}

function ListaClassificacao({ itens, meuId, maxTotal }) {
  if (itens.length === 0) return null;
  return (
    <ol className="rk-lista" aria-label="Demais colocados">
      {itens.map((item) => {
        const eu = Number(item.usuario_id) === Number(meuId);
        const pct = maxTotal > 0 ? Math.max(4, Math.round((item.total / maxTotal) * 100)) : 0;
        return (
          <li key={item.usuario_id} className={`rk-lista-item${eu ? " is-eu" : ""}`}>
            <span className="rk-lista-pos">{item.posicao}º</span>
            <Avatar nome={item.nome} />
            <span className="rk-lista-corpo">
              <span className="rk-lista-nome">
                {item.nome}
                {eu ? <span className="rk-tag-eu">você</span> : null}
              </span>
              <span className="rk-barra" aria-hidden>
                <span style={{ width: `${pct}%` }} />
              </span>
            </span>
            <span className="rk-lista-total">{item.total}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Ranking da competição em andamento — aba "Ranking" de IA / Bot / Automação
 * (src/ia/IaShell.jsx). A configuração fica logo abaixo (RankingConfigPanel, só admin).
 */
export default function RankingPainel() {
  const user = useAuthStore((s) => s.user);
  const tick = useRankingStore((s) => s.tick);
  const admin = isAdmin(user);
  const [dados, setDados] = useState(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [erro, setErro] = useState("");
  const carregandoRef = useRef(false);

  const carregar = useCallback(async () => {
    if (carregandoRef.current) return;
    carregandoRef.current = true;
    try {
      const antes = Date.now();
      const r = await getRankingAtual();
      // Relógio do servidor manda na contagem regressiva (relógio do PC pode estar errado).
      if (r?.agora) setOffsetMs(new Date(r.agora).getTime() - Math.round((antes + Date.now()) / 2));
      setDados(r);
      setErro("");
      useRankingStore.getState().setResumo({ ...r, classificacao: undefined });
    } catch (e) {
      setErro(e?.response?.data?.error || "Não foi possível carregar o ranking.");
    } finally {
      carregandoRef.current = false;
    }
  }, []);

  // Carga inicial + atualização periódica só com a aba visível.
  useEffect(() => {
    void carregar();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [carregar]);

  // Conversa encerrada / campeão anunciado (via ponte global) → recarrega com debounce.
  useEffect(() => {
    if (tick === 0) return undefined;
    const t = setTimeout(() => void carregar(), DEBOUNCE_ENCERRADA_MS);
    return () => clearTimeout(t);
  }, [tick, carregar]);

  // Contagem zerou: o backend apura no primeiro pedido após o fim.
  const onZerar = useCallback(() => {
    setTimeout(() => void carregar(), 3000);
  }, [carregar]);

  if (!dados && !erro) {
    return (
      <div className="rk-page rk-page--aba">
        <SkeletonGrid count={4} />
      </div>
    );
  }

  if (erro && !dados) {
    return (
      <div className="rk-page rk-page--aba">
        <div className="ia-error-banner" role="alert">
          {erro}
          <button type="button" onClick={() => void carregar()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!dados?.ativo) {
    return (
      <div className="rk-page rk-page--aba">
        <EmptyState
          icon={<IconTrophy size={56} stroke={1.2} />}
          title="O ranking de atendimentos não está ativo"
          description={
            dados?.indisponivel
              ? "A estrutura do ranking ainda não foi instalada no banco de dados."
              : admin
                ? "Ative a competição semanal logo abaixo para motivar a equipe."
                : "Quando o administrador ativar a competição, a classificação da semana aparece aqui."
          }
        />
      </div>
    );
  }

  const ciclo = dados.ciclo;
  const tz = ciclo?.timezone || "America/Sao_Paulo";
  const classificacao = Array.isArray(dados.classificacao) ? dados.classificacao : [];
  const podio = classificacao.filter((i) => i.posicao <= 3);
  const resto = classificacao.filter((i) => i.posicao > 3);
  const maxTotal = classificacao[0]?.total || 0;
  const eu = dados.eu || { posicao: null, total: 0 };
  const lideres = Array.isArray(dados.lideres) ? dados.lideres : [];
  const ultimo = dados.ultimo_resultado;

  return (
    <div className="rk-page rk-page--aba">
      <header className="rk-header">
        <div>
          <p className="rk-eyebrow">Competição semanal</p>
          <h1>
            <IconTrophy size={26} stroke={1.7} className="rk-header-icone" aria-hidden /> Ranking da semana
          </h1>
          {ciclo ? (
            <p className="rk-header-desc">
              Período: {formatarDataHora(ciclo.inicio, tz)} → {formatarDataHora(ciclo.fim, tz)}
            </p>
          ) : null}
        </div>
      </header>

      <section className="rk-resumo" aria-label="Resumo da competição">
        <div className="rk-resumo-card rk-resumo-card--tempo">
          <span className="rk-resumo-rotulo">
            <IconClockHour4 size={15} stroke={1.8} aria-hidden /> Encerra em
          </span>
          {ciclo ? <ContagemRegressiva fimIso={ciclo.fim} offsetMs={offsetMs} onZerar={onZerar} /> : "—"}
          <span className="rk-resumo-sub">
            Próxima premiação: {ciclo?.encerramento_descricao || dados.config?.encerramento_descricao}
          </span>
        </div>
        <div className={`rk-resumo-card${eu.posicao ? " rk-resumo-card--eu" : ""}`}>
          <span className="rk-resumo-rotulo">Sua posição</span>
          <span className="rk-resumo-valor">
            {eu.posicao ? `${medalhaDaPosicao(eu.posicao) || ""} ${eu.posicao}º`.trim() : "—"}
          </span>
          <span className="rk-resumo-sub">
            {eu.posicao ? rotuloAtendimentos(eu.total) : "Finalize um atendimento para entrar no ranking."}
          </span>
        </div>
        <div className="rk-resumo-card">
          <span className="rk-resumo-rotulo">{lideres.length > 1 ? "Líderes" : "Líder"}</span>
          <span className="rk-resumo-valor rk-resumo-valor--nome">{lideres.length ? juntarNomes(lideres.map((l) => l.nome)) : "—"}</span>
          <span className="rk-resumo-sub">
            {lideres.length ? rotuloAtendimentos(lideres[0].total) : "Ninguém pontuou ainda nesta semana."}
          </span>
        </div>
      </section>

      {dados.proximo_ciclo_com_nova_regra ? (
        <p className="rk-aviso" role="note">
          A partir da próxima competição, o encerramento passa a ser {dados.config?.encerramento_descricao}.
        </p>
      ) : null}

      <section className="rk-painel" aria-labelledby="rk-classificacao-titulo">
        <div className="rk-painel-head">
          <h2 id="rk-classificacao-titulo">Classificação</h2>
          {classificacao.length > 0 ? (
            <span className="rk-painel-count">{rotuloAtendimentos(dados.total_atendimentos)} na semana</span>
          ) : null}
        </div>
        {classificacao.length === 0 ? (
          <EmptyState
            icon={<IconTrophy size={48} stroke={1.2} />}
            title="A disputa está aberta"
            description="Nenhum atendimento finalizado nesta competição ainda. O primeiro a finalizar assume a liderança."
          />
        ) : (
          <div className="rk-painel-corpo">
            <Podio itens={podio} meuId={user?.id} />
            <ListaClassificacao itens={resto} meuId={user?.id} maxTotal={maxTotal} />
          </div>
        )}
        <p className="rk-rodape">
          Conta cada atendimento finalizado por você — a mesma regra de “Finalizadas” da Supervisão. Mensagens
          não contam. Empates dividem a posição.
        </p>
      </section>

      {ultimo ? (
        <section className="rk-painel rk-ultimo" aria-labelledby="rk-ultimo-titulo">
          <div className="rk-painel-head">
            <h2 id="rk-ultimo-titulo">Última competição</h2>
            <span className="rk-painel-count">{formatarPeriodo(ultimo.inicio, ultimo.fim, ultimo.timezone)}</span>
          </div>
          <div className="rk-ultimo-corpo">
            {ultimo.vencedores?.length ? (
              <>
                <span className="rk-ultimo-trofeu" aria-hidden>
                  🏆
                </span>
                <div>
                  <p className="rk-ultimo-nome">{juntarNomes(ultimo.vencedores.map((v) => v.nome))}</p>
                  <p className="rk-ultimo-sub">
                    {ultimo.vencedores.length > 1 ? "Campeões empatados · " : "Campeão · "}
                    {rotuloAtendimentos(ultimo.total_vencedor)}
                  </p>
                </div>
              </>
            ) : (
              <p className="rk-ultimo-sub">Encerrada sem atendimentos finalizados.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
