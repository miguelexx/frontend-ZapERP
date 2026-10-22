/**
 * Busca incremental de produto para o orçamento.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (Sessão 3 — "o que o contrato
 * diz dos candidatos de produto"; Sessão 5 — UX; seção 11 — custo).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PREÇO E ESTOQUE: SÓ ONDE A WM OS MANDA. NUNCA DERIVADOS.
 * ────────────────────────────────────────────────────────────────────────────
 * A LISTA de candidatos (`multiplos_produtos`) traz, pelo contrato, apenas
 * `codigo_produto_erp`, `descricao`, `marca` e `unidade`, e vem do **cache cloud** da WM.
 * Card de lista é card sem preço — inventar um, ou reaproveitar o de outra busca, seria
 * mentira sobre dinheiro.
 *
 * O produto RESOLVIDO é outro caso: medido no ERP real em 22/10, a WM devolve nele
 * `preco_unitario`, `estoque_previsto` e `ativo`, normalmente com `meta.fonte: 'tempo_real'`.
 * Esse dado já chegava e era descartado, e a atendente escolhia às cegas. Agora aparece no
 * card — impresso COMO VEIO (nada de recalcular ou reformatar), com ausência virando "—" e
 * com a procedência dita em voz alta: cópia nunca é chamada de "atual".
 *
 * Produto inativo é avisado: o contrato permite que a consulta por identificador devolva um.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CADA TECLA PODE CUSTAR DINHEIRO
 * ────────────────────────────────────────────────────────────────────────────
 * A WM pode cobrar por chamada (seção 11, pendência 7 aberta). Daí:
 *   · mínimo de 3 caracteres e debounce de 800 ms — busca só com intenção;
 *   · uma requisição por termo estável, e a anterior é ABORTADA quando o termo muda;
 *   · resposta fora de ordem é descartada por geração, não só pelo abort (abort pode chegar
 *     tarde, e a resposta antiga sobrescreveria a lista nova);
 *   · zero prefetch, zero busca ao abrir, zero repetição automática em erro.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DOIS GRUPOS: O NOME IGUAL E "OUTROS COM ESSA PALAVRA"
 * ────────────────────────────────────────────────────────────────────────────
 * A WM resolve a busca direto num produto quando o termo digitado é IGUAL à descrição
 * normalizada dele — e aí ela NÃO lista os outros que contêm a palavra. Medido na empresa 20:
 * `filtro` devolvia 1 e `filtr` devolvia 468. O backend passou a revelar os escondidos e marca
 * quem é a correspondência exata (doc 36, seção 10, pendência 15); aqui ela aparece primeiro,
 * com rótulo, e os demais sob um título. A escolha continua sendo um toque, como antes.
 *
 * O estado vazio de busca com DUAS OU MAIS palavras explica a ordem: a WM procura o trecho
 * literal, então `filtro oleo` acha e `oleo filtro` não (medido). É só texto — nenhuma busca
 * alternativa é disparada por conta própria.
 *
 * Paginação é "Mostrar mais resultados" / "Voltar", nunca número de página, e **sem clamp**:
 * página além da última é `400` do contrato, não algo a corrigir em silêncio. Por isso os
 * botões só existem quando `tem_mais` / `tem_anterior` da própria WM autorizam.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { consultarProdutosOrcamento, extrairErroOrcamento } from "../../api/wmOrcamentosService";
import {
  formatMoedaOrcamento,
  formatQuantidadeOrcamento,
  textoOuSemValor,
} from "./orcamentoFormat";
import {
  agruparCandidatosProduto,
  mensagemBuscaSemResultado,
  rotuloFonte,
} from "./orcamentoViewModel";

const MIN_CARACTERES = 3;
const DEBOUNCE_MS = 800;
/** Código do envelope quando a WM não acha o termo (`404 PRODUTO_NAO_ENCONTRADO` mapeado). */
const CODIGO_PRODUTO_NAO_ENCONTRADO = "WM_PRODUTO_NAO_ENCONTRADO";
/** Forma do agrupamento quando não há nada na tela. Congelada: nunca é mutada, só substituída. */
const SEM_RESULTADO = Object.freeze({ exato: null, outros: [], lista: [], paginacao: null });

export default function ProdutoPicker({ onAdicionar, disabled = false, autoFocusRef = null }) {
  const [termo, setTermo] = useState("");
  const [pagina, setPagina] = useState(1);
  const [grupos, setGrupos] = useState(SEM_RESULTADO);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const [buscou, setBuscou] = useState(false);

  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const geracaoRef = useRef(0);
  /** Último termo efetivamente consultado — evita repetir a mesma chamada. */
  const termoConsultadoRef = useRef("");

  useEffect(() => {
    if (autoFocusRef) autoFocusRef.current = () => inputRef.current?.focus();
  }, [autoFocusRef]);

  const cancelarEmVoo = useCallback(() => {
    try {
      abortRef.current?.abort();
    } catch {
      /* ignore */
    }
    abortRef.current = null;
  }, []);

  useEffect(() => cancelarEmVoo, [cancelarEmVoo]);

  const buscar = useCallback(
    async (termoLimpo, paginaAlvo) => {
      cancelarEmVoo();
      const geracao = (geracaoRef.current += 1);
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      abortRef.current = controller;
      setBuscando(true);
      setErro("");
      try {
        const data = await consultarProdutosOrcamento({
          busca: termoLimpo,
          pagina: paginaAlvo > 1 ? paginaAlvo : undefined,
          signal: controller?.signal,
        });
        // Resposta de uma geração anterior: descarta sem tocar na tela.
        if (geracao !== geracaoRef.current) return;
        termoConsultadoRef.current = `${termoLimpo}|${paginaAlvo}`;
        // O agrupamento (correspondência exata × "outros com essa palavra") é do view model:
        // aqui o componente só imprime o que ele decidiu.
        setGrupos(agruparCandidatosProduto(data));
        setBuscou(true);
      } catch (err) {
        if (geracao !== geracaoRef.current) return;
        const { codigo, mensagem, cancelado } = extrairErroOrcamento(err);
        if (cancelado) return;
        setGrupos(SEM_RESULTADO);
        setBuscou(true);
        // Busca que não acha nada NÃO é erro: é resultado vazio. A WM responde `404
        // PRODUTO_NAO_ENCONTRADO`, e a mensagem do envelope ("Um dos produtos do orçamento não
        // foi encontrado no ERP") foi escrita para o momento do cálculo — no campo de busca ela
        // confunde, e o alerta vermelho com "Tentar de novo" sugere falha onde houve resposta.
        // Cai no estado vazio que já existe logo abaixo.
        setErro(codigo === CODIGO_PRODUTO_NAO_ENCONTRADO ? "" : mensagem);
      } finally {
        if (geracao === geracaoRef.current) setBuscando(false);
      }
    },
    [cancelarEmVoo]
  );

  // Debounce: o termo muda → cancela o que estava em voo e agenda uma busca só.
  useEffect(() => {
    const limpo = termo.trim();
    if (limpo.length < MIN_CARACTERES) {
      cancelarEmVoo();
      geracaoRef.current += 1; // invalida resposta em trânsito
      setGrupos(SEM_RESULTADO);
      setBuscando(false);
      setBuscou(false);
      setErro("");
      termoConsultadoRef.current = "";
      return undefined;
    }
    if (termoConsultadoRef.current === `${limpo}|${pagina}`) return undefined;
    const t = setTimeout(() => {
      void buscar(limpo, pagina);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [termo, pagina, buscar, cancelarEmVoo]);

  const trocarTermo = useCallback((valor) => {
    setTermo(valor);
    setPagina(1);
  }, []);

  const adicionar = useCallback(
    (produto) => {
      onAdicionar?.(produto);
      // Limpa SÓ a busca de produto e devolve o foco: o carrinho e o resto do formulário ficam.
      setTermo("");
      setPagina(1);
      setGrupos(SEM_RESULTADO);
      setBuscou(false);
      termoConsultadoRef.current = "";
      inputRef.current?.focus();
    },
    [onAdicionar]
  );

  const curto = termo.trim().length > 0 && termo.trim().length < MIN_CARACTERES;
  // Procedência dos VALORES (só existe quando algum card tem preço). `rotuloFonte` é quem
  // decide se dá para falar em "agora" — cópia nunca vira "atual".
  const temValor = grupos.lista.some((p) => p?.preco_unitario || p?.estoque_previsto);
  const procedencia = temValor ? rotuloFonte(grupos.metaDoPrecificado) : null;

  /**
   * Um candidato. `exato` só é `true` quando a WM resolveu a busca nele E existem outros
   * produtos com a mesma palavra logo abaixo — o rótulo existe para explicar por que ele está
   * em primeiro, não para enfeitar linha solta.
   *
   * Preço, estoque e `ativo` aparecem só quando vêm no próprio produto, o que hoje acontece
   * no ramo resolvido. Candidato de lista não tem esses campos e o card simplesmente não os
   * desenha — nada é derivado, nada é herdado do card de cima.
   */
  const renderCandidato = (p, exato) => (
    <button
      type="button"
      key={p.codigo_produto_erp}
      className={exato ? "wa-orc-candidato wa-orc-candidato--exato" : "wa-orc-candidato"}
      disabled={disabled}
      onClick={() => adicionar(p)}
    >
      <span className="wa-orc-candidato-titulo">{textoOuSemValor(p.descricao)}</span>
      {exato ? <span className="wa-orc-candidato-tag">Nome igual ao que você pesquisou</span> : null}
      <span className="wa-orc-candidato-meta">
        {[p.marca, p.unidade].filter(Boolean).join(" · ") || "Sem marca informada"}
      </span>
      {/*
        Preço e estoque só existem no produto RESOLVIDO. Quando não vierem, a linha inteira
        some: um "R$ 0,00" ou um "0" inventado aqui seria lido como preço e estoque reais.
      */}
      {p.preco_unitario || p.estoque_previsto ? (
        <span className="wa-orc-candidato-valores">
          {p.preco_unitario ? (
            <strong className="wa-orc-candidato-preco">{formatMoedaOrcamento(p.preco_unitario)}</strong>
          ) : null}
          {p.estoque_previsto ? (
            <span>Estoque {formatQuantidadeOrcamento(p.estoque_previsto)}</span>
          ) : null}
        </span>
      ) : null}
      {p.ativo === false ? (
        <span className="wa-orc-candidato-inativo">Produto inativo no sistema da empresa</span>
      ) : null}
      {/* Código ERP em área secundária: o caminho principal é concluir por nome. */}
      <span className="wa-orc-candidato-codigo">Cód. ERP {p.codigo_produto_erp}</span>
    </button>
  );

  return (
    <section className="wa-orc-section" aria-label="Pesquisar produto">
      <label className="wa-orc-label" htmlFor="wa-orc-produtoBusca">
        Pesquisar produto
      </label>
      <input
        id="wa-orc-produtoBusca"
        ref={inputRef}
        className="wa-input wa-orc-input"
        type="text"
        inputMode="search"
        autoComplete="off"
        placeholder="Nome do produto (ex.: notebook)"
        value={termo}
        maxLength={100}
        disabled={disabled}
        onChange={(e) => trocarTermo(e.target.value)}
      />
      <p className="wa-orc-hint">
        {curto
          ? `Digite ao menos ${MIN_CARACTERES} letras para pesquisar.`
          : "Pesquise pelo nome, ou bipe/cole o código de barras."}
      </p>

      {erro ? (
        <div className="wa-orc-alert wa-orc-alert--erro" role="alert">
          <span>{erro}</span>
          <button
            type="button"
            className="wa-btn wa-btn-ghost wa-orc-btnSm"
            onClick={() => {
              termoConsultadoRef.current = "";
              void buscar(termo.trim(), pagina);
            }}
            disabled={buscando || termo.trim().length < MIN_CARACTERES}
          >
            Tentar de novo
          </button>
        </div>
      ) : null}

      <div className="wa-orc-resultados" aria-busy={buscando}>
        {buscando ? <p className="wa-orc-hint">Pesquisando…</p> : null}
        {!buscando && buscou && !erro && grupos.lista.length === 0 ? (
          <p className="wa-orc-hint">{mensagemBuscaSemResultado(termo)}</p>
        ) : null}
        {procedencia ? <p className="wa-orc-origem">{procedencia.texto}</p> : null}
        {grupos.exato ? (
          <>
            {renderCandidato(grupos.exato, true)}
            <p className="wa-orc-grupoTitulo">Outros com essa palavra</p>
            {grupos.outros.map((p) => renderCandidato(p, false))}
          </>
        ) : (
          grupos.lista.map((p) => renderCandidato(p, false))
        )}
      </div>

      {grupos.paginacao && (grupos.paginacao.tem_anterior || grupos.paginacao.tem_mais) ? (
        <div className="wa-orc-paginacao">
          <button
            type="button"
            className="wa-btn wa-btn-ghost wa-orc-btnSm"
            disabled={!grupos.paginacao.tem_anterior || buscando || disabled}
            onClick={() => setPagina((v) => Math.max(1, v - 1))}
          >
            Voltar
          </button>
          <button
            type="button"
            className="wa-btn wa-btn-ghost wa-orc-btnSm"
            disabled={!grupos.paginacao.tem_mais || buscando || disabled}
            onClick={() => setPagina((v) => v + 1)}
          >
            Mostrar mais resultados
          </button>
        </div>
      ) : null}
    </section>
  );
}
