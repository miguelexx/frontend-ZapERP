/**
 * Busca incremental de produto para o orçamento.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (Sessão 3 — "o que o contrato
 * diz dos candidatos de produto"; Sessão 5 — UX; seção 11 — custo).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTE PICKER NÃO MOSTRA PREÇO NEM ESTOQUE. NÃO É ESQUECIMENTO.
 * ────────────────────────────────────────────────────────────────────────────
 * `/produtos/consultar` devolve candidatos com APENAS `codigo_produto_erp`, `descricao`,
 * `marca` e `unidade` — o contrato não traz preço nem estoque aqui — e a descoberta vem do
 * **cache cloud** da WM, não do ERP ao vivo. Exibir um preço neste ponto exigiria inventá-lo,
 * e rotular qualquer coisa daqui como "atual" seria mentira sobre a origem do dado.
 *
 * Preço e estoque aparecem adiante: nos candidatos de `produto_ambiguo` da preparação (que os
 * trazem, em tempo real) e na prévia. Nos dois casos com indicação de origem.
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
 * Paginação é "Mostrar mais resultados" / "Voltar", nunca número de página, e **sem clamp**:
 * página além da última é `400` do contrato, não algo a corrigir em silêncio. Por isso os
 * botões só existem quando `tem_mais` / `tem_anterior` da própria WM autorizam.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { consultarProdutosOrcamento, extrairErroOrcamento } from "../../api/wmOrcamentosService";
import { textoOuSemValor } from "./orcamentoFormat";

const MIN_CARACTERES = 3;
const DEBOUNCE_MS = 800;

export default function ProdutoPicker({ onAdicionar, disabled = false, autoFocusRef = null }) {
  const [termo, setTermo] = useState("");
  const [pagina, setPagina] = useState(1);
  const [produtos, setProdutos] = useState([]);
  const [paginacao, setPaginacao] = useState(null);
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
        if (data?.status === "produto" && data?.produto) {
          setProdutos([data.produto]);
          setPaginacao(null);
        } else {
          setProdutos(Array.isArray(data?.produtos) ? data.produtos : []);
          setPaginacao(data?.paginacao || null);
        }
        setBuscou(true);
      } catch (err) {
        if (geracao !== geracaoRef.current) return;
        const { mensagem, cancelado } = extrairErroOrcamento(err);
        if (cancelado) return;
        setProdutos([]);
        setPaginacao(null);
        setBuscou(true);
        setErro(mensagem);
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
      setProdutos([]);
      setPaginacao(null);
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
      setProdutos([]);
      setPaginacao(null);
      setBuscou(false);
      termoConsultadoRef.current = "";
      inputRef.current?.focus();
    },
    [onAdicionar]
  );

  const curto = termo.trim().length > 0 && termo.trim().length < MIN_CARACTERES;

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
          : "Pesquise pelo nome. Não é preciso saber o código do ERP."}
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
        {!buscando && buscou && !erro && produtos.length === 0 ? (
          <p className="wa-orc-hint">Nenhum produto encontrado com esse nome.</p>
        ) : null}
        {produtos.map((p) => (
          <button
            type="button"
            key={p.codigo_produto_erp}
            className="wa-orc-candidato"
            disabled={disabled}
            onClick={() => adicionar(p)}
          >
            <span className="wa-orc-candidato-titulo">{textoOuSemValor(p.descricao)}</span>
            <span className="wa-orc-candidato-meta">
              {[p.marca, p.unidade].filter(Boolean).join(" · ") || "Sem marca informada"}
            </span>
            {/* Código ERP em área secundária: o caminho principal é concluir por nome. */}
            <span className="wa-orc-candidato-codigo">Cód. ERP {p.codigo_produto_erp}</span>
          </button>
        ))}
      </div>

      {paginacao && (paginacao.tem_anterior || paginacao.tem_mais) ? (
        <div className="wa-orc-paginacao">
          <button
            type="button"
            className="wa-btn wa-btn-ghost wa-orc-btnSm"
            disabled={!paginacao.tem_anterior || buscando || disabled}
            onClick={() => setPagina((v) => Math.max(1, v - 1))}
          >
            Voltar
          </button>
          <button
            type="button"
            className="wa-btn wa-btn-ghost wa-orc-btnSm"
            disabled={!paginacao.tem_mais || buscando || disabled}
            onClick={() => setPagina((v) => v + 1)}
          >
            Mostrar mais resultados
          </button>
        </div>
      ) : null}
    </section>
  );
}
