import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconCash,
  IconFileInvoice,
  IconReceipt2,
  IconRefresh,
  IconSearch,
  IconTrophy,
  IconX,
  IconChevronRight as IconGo,
} from "@tabler/icons-react";
import { listarHistoricoOrcamentos, extrairErroOrcamento } from "../api/wmOrcamentosService";
import OrcamentosChart from "./OrcamentosChart";
import OrcamentoDetalheDrawer from "./OrcamentoDetalheDrawer";
import {
  FILTROS_ESTADO,
  PERIODOS,
  corDoNome,
  formatDataHora,
  formatInteiro,
  formatMoeda,
  formatMoedaCompacta,
  formatTelefone,
  infoEstado,
  iniciais,
  tempoRelativo,
} from "./integracoesFormat";

function Kpi({ icon: Icon, rotulo, valor, sub, tom = "accent", carregando, i = 0 }) {
  return (
    <div className={`intg-kpi intg-kpi--${tom}`} style={{ "--i": i }}>
      <span className="intg-kpi-icon" aria-hidden="true">
        <Icon size={18} stroke={1.9} />
      </span>
      <span className="intg-kpi-label">{rotulo}</span>
      {carregando ? <span className="intg-skel intg-skel--kpi" /> : <strong className="intg-kpi-value">{valor}</strong>}
      <span className="intg-kpi-sub">{carregando ? " " : sub}</span>
    </div>
  );
}

function LinhaSkeleton() {
  return (
    <li className="intg-row intg-row--skel" aria-hidden="true">
      <span className="intg-skel intg-skel--avatar" />
      <span className="intg-skel intg-skel--line" />
      <span className="intg-skel intg-skel--short" />
    </li>
  );
}

export default function OrcamentosTab({ podeVerEmpresa, onAbrirConversa }) {
  const [periodo, setPeriodo] = useState("30");
  const [estado, setEstado] = useState("registrados");
  const [buscaTxt, setBuscaTxt] = useState("");
  const [busca, setBusca] = useState("");
  const [apenasMeus, setApenasMeus] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [selecionado, setSelecionado] = useState(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef(null);
  const fecharDetalhe = useCallback(() => setSelecionado(null), []);

  // Debounce da busca.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusca(buscaTxt.trim());
      setPagina(1);
    }, 320);
    return () => clearTimeout(t);
  }, [buscaTxt]);

  const carregar = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setCarregando(true);
    setErro("");
    try {
      const r = await listarHistoricoOrcamentos({ estado, periodo, busca, pagina, apenas_meus: apenasMeus, signal: ac.signal });
      if (ac.signal.aborted) return;
      setDados(r);
    } catch (err) {
      const e = extrairErroOrcamento(err);
      if (e.cancelado) return;
      setErro(e.mensagem || "Não foi possível carregar os orçamentos agora.");
    } finally {
      if (!ac.signal.aborted) setCarregando(false);
    }
  }, [estado, periodo, busca, pagina, apenasMeus]);

  useEffect(() => {
    void carregar();
    return () => abortRef.current?.abort();
  }, [carregar, tick]);

  const resumo = dados?.resumo || null;
  const itens = dados?.itens || [];
  const pag = dados?.paginacao || { pagina: 1, total_paginas: 1, total: 0 };
  const primeiraCarga = carregando && !dados;
  const rotuloPeriodo = PERIODOS.find((p) => p.id === periodo)?.rotulo || "";

  return (
    <div className="intg-orc">
      <div className="intg-toolbar">
        <div className="intg-seg" role="tablist" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={periodo === p.id}
              className={periodo === p.id ? "is-on" : ""}
              onClick={() => {
                setPeriodo(p.id);
                setPagina(1);
              }}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="intg-icon-btn"
          onClick={() => setTick((n) => n + 1)}
          aria-label="Atualizar"
          title="Atualizar"
          disabled={carregando}
        >
          <IconRefresh size={17} className={carregando && dados ? "intg-spin" : ""} />
        </button>
      </div>

      <div className="intg-kpis">
        <Kpi
          i={0}
          icon={IconFileInvoice}
          rotulo="Orçamentos criados"
          valor={formatInteiro(resumo?.criados ?? 0)}
          sub={resumo?.taxa_sucesso != null ? `${String(resumo.taxa_sucesso).replace(".", ",")}% gravados de primeira` : `nos últimos ${rotuloPeriodo}`}
          carregando={primeiraCarga}
        />
        <Kpi
          i={1}
          icon={IconCash}
          tom="ok"
          rotulo="Valor orçado"
          valor={formatMoedaCompacta(resumo?.valor_criado ?? 0)}
          sub="soma dos criados no ERP"
          carregando={primeiraCarga}
        />
        <Kpi
          i={2}
          icon={IconReceipt2}
          tom="violet"
          rotulo="Ticket médio"
          valor={formatMoedaCompacta(resumo?.ticket_medio ?? 0)}
          sub="por orçamento"
          carregando={primeiraCarga}
        />
        <Kpi
          i={3}
          icon={IconAlertTriangle}
          tom={resumo?.atencao ? "warn" : "muted"}
          rotulo="Precisam de atenção"
          valor={formatInteiro(resumo?.atencao ?? 0)}
          sub={resumo?.atencao ? "confira no Icthus" : "tudo certo"}
          carregando={primeiraCarga}
        />
      </div>

      <div className="intg-insights">
        <section className="intg-card intg-card--chart" aria-labelledby="intg-chart-title">
          <header className="intg-card-head">
            <div>
              <h3 id="intg-chart-title">Valor criado por dia</h3>
              <p>Linha: valor · barras: quantidade</p>
            </div>
            {resumo ? <span className="intg-chip-num">{formatMoeda(resumo.valor_criado)}</span> : null}
          </header>
          {primeiraCarga ? <div className="intg-skel intg-skel--chart" /> : <OrcamentosChart serie={resumo?.serie || []} />}
        </section>

        <section className="intg-card intg-card--top" aria-labelledby="intg-top-title">
          <header className="intg-card-head">
            <div>
              <h3 id="intg-top-title">
                <IconTrophy size={17} stroke={1.9} className="intg-top-trophy" /> Quem mais orçou
              </h3>
              <p>{podeVerEmpresa && !apenasMeus ? "Equipe" : "Você"} · {rotuloPeriodo}</p>
            </div>
          </header>
          {primeiraCarga ? (
            <div className="intg-skel intg-skel--list" />
          ) : resumo?.top_usuarios?.length ? (
            <ol className="intg-top">
              {(() => {
                const max = Math.max(1, ...resumo.top_usuarios.map((u) => u.valor));
                return resumo.top_usuarios.map((u, i) => (
                  <li key={u.usuario_id} style={{ "--p": `${Math.max(6, (u.valor / max) * 100)}%`, "--i": i }}>
                    <span className="intg-top-pos">{i + 1}</span>
                    <span className="intg-avatar intg-avatar--sm" style={{ "--c": corDoNome(u.nome) }} aria-hidden="true">
                      {iniciais(u.nome)}
                    </span>
                    <span className="intg-top-name">
                      <strong>{u.nome || "Usuário removido"}</strong>
                      <small>
                        {formatInteiro(u.quantidade)} orçamento{u.quantidade === 1 ? "" : "s"}
                      </small>
                    </span>
                    <span className="intg-top-val">{formatMoedaCompacta(u.valor)}</span>
                    <i className="intg-top-bar" aria-hidden="true" />
                  </li>
                ));
              })()}
            </ol>
          ) : (
            <p className="intg-muted-empty">Ninguém criou orçamento neste período.</p>
          )}
        </section>
      </div>

      <section className="intg-card intg-card--list" aria-labelledby="intg-list-title">
        <header className="intg-list-head">
          <h3 id="intg-list-title">
            Orçamentos <span className="intg-count">{formatInteiro(pag.total)}</span>
          </h3>
          <div className="intg-filters">
            <label className="intg-search">
              <IconSearch size={16} aria-hidden="true" />
              <input
                type="search"
                value={buscaTxt}
                onChange={(e) => setBuscaTxt(e.target.value)}
                placeholder="Buscar cliente ou nº do orçamento"
                aria-label="Buscar orçamentos"
              />
              {buscaTxt ? (
                <button type="button" onClick={() => setBuscaTxt("")} aria-label="Limpar busca">
                  <IconX size={14} />
                </button>
              ) : null}
            </label>
            {podeVerEmpresa ? (
              <label className="intg-switch">
                <input
                  type="checkbox"
                  checked={apenasMeus}
                  onChange={(e) => {
                    setApenasMeus(e.target.checked);
                    setPagina(1);
                  }}
                />
                <span aria-hidden="true" />
                Só os meus
              </label>
            ) : null}
          </div>
        </header>

        <div className="intg-chips" role="tablist" aria-label="Situação">
          {FILTROS_ESTADO.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={estado === f.id}
              className={`intg-chip${estado === f.id ? " is-on" : ""}${f.id === "atencao" && resumo?.atencao ? " has-dot" : ""}`}
              onClick={() => {
                setEstado(f.id);
                setPagina(1);
              }}
            >
              {f.rotulo}
              {f.id === "atencao" && resumo?.atencao ? <span className="intg-chip-badge">{resumo.atencao}</span> : null}
            </button>
          ))}
        </div>

        {erro ? (
          <div className="intg-state intg-state--erro">
            <IconAlertTriangle size={22} />
            <p>{erro}</p>
            <button type="button" className="intg-btn intg-btn--soft" onClick={() => setTick((n) => n + 1)}>
              Tentar de novo
            </button>
          </div>
        ) : primeiraCarga ? (
          <ul className="intg-rows">
            {Array.from({ length: 6 }).map((_, i) => (
              <LinhaSkeleton key={i} />
            ))}
          </ul>
        ) : itens.length === 0 ? (
          <div className="intg-state">
            <span className="intg-state-art" aria-hidden="true">
              <IconFileInvoice size={26} stroke={1.6} />
            </span>
            <strong>{busca ? "Nada encontrado" : "Nenhum orçamento por aqui ainda"}</strong>
            <p>
              {busca
                ? `Nenhum orçamento combina com “${busca}” neste período.`
                : "Abra uma conversa individual e toque em Orçamento na barra de ações para criar o primeiro."}
            </p>
          </div>
        ) : (
          <>
            <div className="intg-rows-head" aria-hidden="true">
              <span>Orçamento</span>
              <span>Cliente</span>
              <span>Feito por</span>
              <span className="intg-r">Valor</span>
              <span>Situação</span>
            </div>
            <ul className={`intg-rows${carregando ? " is-loading" : ""}`}>
              {itens.map((o, i) => {
                const est = infoEstado(o.estado);
                return (
                  <li key={o.operacao_id} style={{ "--i": i }}>
                    <button type="button" className="intg-row" onClick={() => setSelecionado(o)}>
                      <span className="intg-row-id">
                        <span className={`intg-row-icon intg-row-icon--${est.tom}`} aria-hidden="true">
                          <IconFileInvoice size={17} stroke={1.8} />
                        </span>
                        <span>
                          {o.numero_erp ? <strong className="intg-mono">#{o.numero_erp}</strong> : <strong className="intg-muted">Sem número</strong>}
                          <small title={formatDataHora(o.concluido_em || o.criado_em)}>
                            {tempoRelativo(o.concluido_em || o.criado_em)} · {o.qtd_itens} {o.qtd_itens === 1 ? "item" : "itens"}
                          </small>
                        </span>
                      </span>
                      <span className="intg-row-cli">
                        <strong>{o.cliente?.nome || "—"}</strong>
                        <small>
                          {o.contato?.nome || (o.contato?.telefone ? formatTelefone(o.contato.telefone) : o.vendedor?.nome ? `Vend. ${o.vendedor.nome}` : "")}
                        </small>
                      </span>
                      <span className="intg-row-who">
                        {o.usuario?.nome ? (
                          <>
                            <span className="intg-avatar intg-avatar--sm" style={{ "--c": corDoNome(o.usuario.nome) }} aria-hidden="true">
                              {iniciais(o.usuario.nome)}
                            </span>
                            <span className="intg-ellipsis">{o.usuario.nome}</span>
                          </>
                        ) : (
                          <span className="intg-muted">—</span>
                        )}
                      </span>
                      <span className="intg-row-val">{formatMoeda(o.valor_total)}</span>
                      <span className="intg-row-st">
                        <span className={`intg-pill intg-pill--${est.tom}`}>
                          <i aria-hidden="true" />
                          {est.curto}
                        </span>
                        <IconGo size={16} className="intg-row-go" aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {pag.total_paginas > 1 ? (
              <nav className="intg-pager" aria-label="Paginação">
                <button type="button" className="intg-icon-btn" disabled={pag.pagina <= 1 || carregando} onClick={() => setPagina((p) => p - 1)} aria-label="Página anterior">
                  <IconChevronLeft size={17} />
                </button>
                <span>
                  Página <strong>{pag.pagina}</strong> de {pag.total_paginas}
                </span>
                <button
                  type="button"
                  className="intg-icon-btn"
                  disabled={pag.pagina >= pag.total_paginas || carregando}
                  onClick={() => setPagina((p) => p + 1)}
                  aria-label="Próxima página"
                >
                  <IconChevronRight size={17} />
                </button>
              </nav>
            ) : null}
          </>
        )}
      </section>

      <OrcamentoDetalheDrawer orcamento={selecionado} onFechar={fecharDetalhe} onAbrirConversa={onAbrirConversa} />
    </div>
  );
}
