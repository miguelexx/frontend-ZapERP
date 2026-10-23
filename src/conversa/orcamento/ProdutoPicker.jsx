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
 * `preco_unitario`, `estoque_previsto`, `ativo`, `grupo` e `subgrupo`, normalmente com
 * `meta.fonte: 'tempo_real'`. Esse dado já chegava e era descartado, e a atendente escolhia às
 * cegas. Agora aparece no card — impresso COMO VEIO (nada de recalcular ou reformatar), com
 * ausência virando "—" e com a procedência dita em voz alta: cópia nunca é chamada de "atual".
 *
 * Produto inativo é avisado: o contrato permite que a consulta por identificador devolva um.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * "VER PREÇO": UMA CHAMADA, E SÓ A PEDIDO
 * ────────────────────────────────────────────────────────────────────────────
 * Buscar o preço dos 30 candidatos da página seriam 30 consultas em TEMPO REAL no SQL Server da
 * própria loja a cada busca — fora de questão (seção 11). Mas escolher sem ver o preço é
 * escolher no escuro, e a atendente está com o cliente esperando.
 *
 * Então o card ganha uma afordância: um toque em "ver preço" consulta **aquele** produto por
 * código e preenche o próprio card com preço, estoque e grupo, sem adicionar nada ao carrinho.
 * Uma chamada por produto que ela de fato quis ver, no instante em que ela quis.
 *
 * Três regras sustentam isso:
 *   · o resultado fica guardado ENQUANTO A BUSCA NÃO MUDA — tocar duas vezes no mesmo card não
 *     gasta duas chamadas, e busca nova começa limpa (preço de outra busca não se herda);
 *   · nada aqui roda sozinho: não há consulta em `useEffect`, em laço nem por timer. Só toque;
 *   · falhar não impede NADA. O card volta a oferecer a consulta e o produto continua podendo
 *     ser adicionado — o "Calcular" resolve preço no servidor para o orçamento inteiro.
 *
 * E o preço já consultado VIAJA junto quando o produto é adicionado: o drawer reconhece o ramo
 * resolvido e não gasta uma segunda chamada pelo mesmo código.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CADA TECLA PODE CUSTAR DINHEIRO
 * ────────────────────────────────────────────────────────────────────────────
 * A WM pode cobrar por chamada (seção 11, pendência 7 aberta). Daí:
 *   · mínimo de 3 caracteres e debounce de 800 ms — busca só com intenção;
 *   · uma requisição por termo estável, e a anterior é ABORTADA quando o termo muda;
 *   · resposta fora de ordem é descartada por geração, não só pelo abort (abort pode chegar
 *     tarde, e a resposta antiga sobrescreveria a lista nova);
 *   · zero prefetch, zero busca ao abrir, zero repetição automática em erro;
 *   · os produtos mais usados (abaixo) não custam chamada nenhuma.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O ATALHO QUE ELIMINA A BUSCA NA MAIORIA DOS CASOS
 * ────────────────────────────────────────────────────────────────────────────
 * Uma loja vende os mesmos itens todo dia. Antes de qualquer tecla, o picker mostra os produtos
 * que ESTA atendente mais usou em orçamentos (`produtosFrequentes.js`, só no navegador dela,
 * por empresa + usuário) — prontos para um toque, sem chamada à WM. A busca continua inteira,
 * para quando o item é novo.
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { consultarProdutosOrcamento, extrairErroOrcamento } from "../../api/wmOrcamentosService";
import {
  classeEstoque,
  formatMoedaOrcamento,
  rotuloGrupoProduto,
  textoEstoque,
  textoOuSemValor,
} from "./orcamentoFormat";
import {
  ESTADO_PRECO,
  procedenciaDosValores,
  produtoJaTemPreco,
  valorPresente,
  valoresDaRespostaPorCodigo,
} from "./precoItemCache";
import { lerProdutosFrequentes, registrarProdutoUsado } from "./produtosFrequentes";
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
/** Quantos esqueletos pintar enquanto a primeira busca não volta. */
const ESQUELETOS = [0, 1, 2];

export default function ProdutoPicker({
  onAdicionar,
  disabled = false,
  autoFocusRef = null,
  companyId = null,
  userId = null,
}) {
  const [termo, setTermo] = useState("");
  const [pagina, setPagina] = useState(1);
  const [grupos, setGrupos] = useState(SEM_RESULTADO);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const [buscou, setBuscou] = useState(false);
  /**
   * Preço, estoque e grupo pedidos card a card, por código — ver "VER PREÇO" no cabeçalho.
   * Vive só enquanto a busca é a mesma: valor de uma busca velha não pode pintar card novo.
   */
  const [detalhes, setDetalhes] = useState({});
  /**
   * Produtos mais usados por esta atendente. Lidos do navegador dela, zero chamada à WM.
   *
   * Lidos JÁ no primeiro render (inicializador preguiçoso) e não num efeito: o atalho é o
   * caminho principal numa loja de giro repetido, e carregá-lo depois faria a tela piscar uma
   * busca vazia antes de mostrar o que ela usa todo dia.
   */
  const [frequentes, setFrequentes] = useState(() =>
    lerProdutosFrequentes({ companyId, userId })
  );

  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const geracaoRef = useRef(0);
  /** Último termo efetivamente consultado — evita repetir a mesma chamada. */
  const termoConsultadoRef = useRef("");
  /**
   * Espelho SÍNCRONO de `detalhes`. A decisão "vale gastar uma chamada?" não pode sair de dentro
   * de um atualizador de estado: ele roda quando o React quer, e ler o resultado na linha
   * seguinte deixaria o card preso em "consultando" (já aconteceu no carrinho — ver
   * `OrcamentoDrawer`). O ref decide; o estado só pinta.
   */
  const detalhesRef = useRef({});
  /** Consultas de card em voo, por código — abortadas quando a busca muda ou o picker sai. */
  const detalheAbortsRef = useRef(new Map());
  /**
   * Geração da BUSCA a que os detalhes pertencem.
   *
   * Abortar não basta: o abort pode chegar depois de a resposta já estar no caminho de volta, e
   * uma resposta da busca anterior escreveria preço num card da busca nova — o preço de um
   * produto aparecendo em outro. Toda escrita confere a geração antes de pintar.
   */
  const detalhesGeracaoRef = useRef(0);

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

  /** Busca nova começa sem valor nenhum na mão: preço de outra busca não se herda. */
  const limparDetalhes = useCallback(() => {
    const tinha = detalheAbortsRef.current.size > 0;
    for (const controller of detalheAbortsRef.current.values()) {
      try {
        controller?.abort();
      } catch {
        /* ignore */
      }
    }
    detalheAbortsRef.current.clear();
    detalhesGeracaoRef.current += 1;
    // Já vazio: não troca o objeto à toa (cada troca é um render a mais por tecla digitada).
    if (!tinha && Object.keys(detalhesRef.current).length === 0) return;
    detalhesRef.current = {};
    setDetalhes(detalhesRef.current);
  }, []);

  useEffect(
    () => () => {
      cancelarEmVoo();
      for (const controller of detalheAbortsRef.current.values()) {
        try {
          controller?.abort();
        } catch {
          /* ignore */
        }
      }
      detalheAbortsRef.current.clear();
    },
    [cancelarEmVoo]
  );

  const recarregarFrequentes = useCallback(() => {
    setFrequentes(lerProdutosFrequentes({ companyId, userId }));
  }, [companyId, userId]);

  // O primeiro render já leu (acima). Daqui em diante só relê se o escopo mudar — reler a cada
  // render pintaria a mesma lista num objeto novo e dispararia render de novo.
  const escopoLidoRef = useRef(`${companyId}|${userId}`);
  useEffect(() => {
    const escopo = `${companyId}|${userId}`;
    if (escopoLidoRef.current === escopo) return;
    escopoLidoRef.current = escopo;
    recarregarFrequentes();
  }, [companyId, userId, recarregarFrequentes]);

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
        limparDetalhes();
        // O agrupamento (correspondência exata × "outros com essa palavra") é do view model:
        // aqui o componente só imprime o que ele decidiu.
        setGrupos(agruparCandidatosProduto(data));
        setBuscou(true);
      } catch (err) {
        if (geracao !== geracaoRef.current) return;
        const { codigo, mensagem, cancelado } = extrairErroOrcamento(err);
        if (cancelado) return;
        limparDetalhes();
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
    [cancelarEmVoo, limparDetalhes]
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
      limparDetalhes();
      return undefined;
    }
    if (termoConsultadoRef.current === `${limpo}|${pagina}`) return undefined;
    const t = setTimeout(() => {
      void buscar(limpo, pagina);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [termo, pagina, buscar, cancelarEmVoo, limparDetalhes]);

  const trocarTermo = useCallback((valor) => {
    setTermo(valor);
    setPagina(1);
  }, []);

  /** Escreve só se a busca ainda for a mesma (ver `detalhesGeracaoRef`). */
  const anotarDetalhe = useCallback((codigo, entrada, geracao) => {
    if (geracao !== detalhesGeracaoRef.current) return;
    detalhesRef.current = { ...detalhesRef.current, [codigo]: entrada };
    setDetalhes(detalhesRef.current);
  }, []);

  /**
   * "Ver preço" deste card — UMA consulta, por código, e só porque alguém tocou.
   *
   * Nada daqui é automático: esta função não é chamada em `useEffect`, em laço, por timer nem
   * em retentativa. O único chamador é o `onClick` do botão do card.
   */
  const verPreco = useCallback(
    async (produto) => {
      const codigo = produto?.codigo_produto_erp;
      if (typeof codigo !== "string" || !codigo) return;
      const atual = detalhesRef.current[codigo];
      // Em voo, ou já respondeu com valor: nenhuma chamada nova. Uma falha anterior pode ser
      // retentada — mas só por toque, nunca sozinha.
      if (atual?.estado === ESTADO_PRECO.CARREGANDO || atual?.estado === ESTADO_PRECO.OK) return;

      const geracao = detalhesGeracaoRef.current;
      anotarDetalhe(
        codigo,
        { estado: ESTADO_PRECO.CARREGANDO, valores: null, classificacao: null, meta: null },
        geracao
      );
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      detalheAbortsRef.current.set(codigo, controller);
      try {
        const data = await consultarProdutosOrcamento({
          codigo_produto_erp: codigo,
          signal: controller?.signal,
        });
        const achado = valoresDaRespostaPorCodigo(data, codigo);
        anotarDetalhe(
          codigo,
          achado
            ? {
                estado: ESTADO_PRECO.OK,
                valores: achado.valores,
                classificacao: achado.classificacao,
                meta: achado.meta,
              }
            : { estado: ESTADO_PRECO.FALHOU, valores: null, classificacao: null, meta: null },
          geracao
        );
      } catch (err) {
        const { cancelado } = extrairErroOrcamento(err);
        // Cancelado é a busca tendo mudado: a entrada já foi descartada com o resto.
        if (cancelado) return;
        anotarDetalhe(
          codigo,
          { estado: ESTADO_PRECO.FALHOU, valores: null, classificacao: null, meta: null },
          geracao
        );
      } finally {
        // Só apaga o controller se ainda for o DESTA chamada: uma consulta nova para o mesmo
        // código já pode ter tomado o lugar, e apagá-la aqui a deixaria sem como ser abortada.
        if (detalheAbortsRef.current.get(codigo) === controller) {
          detalheAbortsRef.current.delete(codigo);
        }
      }
    },
    [anotarDetalhe]
  );

  const adicionar = useCallback(
    (produto, meta) => {
      const codigo = produto?.codigo_produto_erp;
      const detalhe = codigo ? detalhesRef.current[codigo] : null;
      const resolvido =
        detalhe?.estado === ESTADO_PRECO.OK && detalhe.valores
          ? { ...produto, ...detalhe.valores }
          : produto;
      // A procedência vai junto só quando o PRÓPRIO produto tem preço (ramo resolvido, ou o
      // "ver preço" deste card): é dele que ela fala. Candidato de lista não tem preço, e quem
      // o escolher vai receber a procedência da consulta por código que o drawer dispara.
      const procedencia = detalhe?.estado === ESTADO_PRECO.OK && detalhe.valores ? detalhe.meta : meta;
      // O que ela escolhe hoje é o atalho dela amanhã. Só identificação do produto entra —
      // preço e estoque jamais (ver `produtosFrequentes.js`).
      registrarProdutoUsado({ companyId, userId, produto: resolvido });
      onAdicionar?.(resolvido, produtoJaTemPreco(resolvido) ? procedencia ?? null : null);
      // Limpa SÓ a busca de produto e devolve o foco: o carrinho e o resto do formulário ficam.
      setTermo("");
      setPagina(1);
      setGrupos(SEM_RESULTADO);
      setBuscou(false);
      termoConsultadoRef.current = "";
      limparDetalhes();
      recarregarFrequentes();
      inputRef.current?.focus();
    },
    [onAdicionar, companyId, userId, limparDetalhes, recarregarFrequentes]
  );

  /**
   * Enter adiciona o primeiro resultado, sem tirar a mão do teclado.
   *
   * Só dispara com resultado na tela, com a busca parada e com os resultados sendo DO TERMO QUE
   * ESTÁ NO CAMPO: quem digitou mais algumas letras e apertou Enter antes de o debounce correr
   * estaria adicionando o primeiro resultado do termo anterior — o produto errado, em silêncio.
   */
  const aoTeclarNaBusca = useCallback(
    (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (buscando || disabled) return;
      const limpo = termo.trim();
      if (!limpo || !termoConsultadoRef.current.startsWith(`${limpo}|`)) return;
      const primeiro = grupos.exato || grupos.lista[0] || null;
      if (!primeiro) return;
      adicionar(primeiro, grupos.metaDoPrecificado);
    },
    [adicionar, buscando, disabled, grupos, termo]
  );

  const curto = termo.trim().length > 0 && termo.trim().length < MIN_CARACTERES;
  const vazio = !buscando && buscou && !erro && grupos.lista.length === 0;
  // Esqueleto só quando não há nada na tela: trocar resultados visíveis por caixas cinzentas
  // tiraria da atendente o card que ela já estava mirando.
  const esqueleto = buscando && grupos.lista.length === 0;
  const mostrarFrequentes = !buscando && !buscou && !erro && frequentes.length > 0;
  const podeEnter = !buscando && !disabled && grupos.lista.length > 0;

  /**
   * Procedência dos VALORES na tela, e ela vale pela mais fraca.
   *
   * Dois caminhos trazem valor para cá: o produto resolvido da própria busca e cada "ver preço".
   * Uma frase só precisa valer para todos, então basta um valor de cópia para o conjunto não
   * poder ser chamado de "consultado agora" — mesma régua do carrinho.
   */
  const procedencia = useMemo(() => {
    const mapa = { ...detalhes };
    const comPreco = grupos.lista.filter((p) => valorPresente(p?.preco_unitario));
    for (const p of comPreco) {
      mapa[`lista:${p.codigo_produto_erp}`] = {
        estado: ESTADO_PRECO.OK,
        valores: { preco_unitario: p.preco_unitario },
        meta: grupos.metaDoPrecificado ?? null,
      };
    }
    const combinada = procedenciaDosValores(mapa);
    if (combinada) return rotuloFonte(combinada);
    // Sem preço nenhum, mas com estoque do ramo resolvido: a frase ainda descreve um valor.
    const temEstoque = grupos.lista.some((p) => valorPresente(p?.estoque_previsto));
    return temEstoque ? rotuloFonte(grupos.metaDoPrecificado) : null;
  }, [detalhes, grupos]);

  /**
   * Um candidato — e um candidato é um BOTÃO que adiciona ao orçamento.
   *
   * Que o toque adiciona precisa estar dito, não adivinhado: o `aria-label` nomeia a ação com o
   * produto ("Adicionar FILTRO AR … ao orçamento") e o sinal de mais à direita a mostra. A
   * descrição é a linha que manda e aparece INTEIRA (ela é o que distingue um item do outro —
   * "FILTRO AR EXT/INT MOTOR YUNNEI BRT15/20/23" perde a identidade se cortada), com marca,
   * unidade, código e grupo recolhidos numa única linha secundária.
   *
   * À direita de cada linha, uma coluna de largura fixa: preço em cima, estoque embaixo. Fixa
   * porque é ela que deixa a lista ser varrida de cima a baixo comparando valores — com
   * `tabular-nums`, as casas caem umas sobre as outras. Onde não há valor, a coluna fica
   * reservada e calada: "R$ 0,00" seria um preço plausível e falso.
   *
   * `exato` só é `true` quando a WM resolveu a busca nele E existem outros produtos com a mesma
   * palavra logo abaixo — o rótulo explica por que ele está em primeiro, não enfeita linha solta.
   *
   * ────────────────────────────────────────────────────────────────────────────
   * POR QUE O CARD DEIXOU DE SER UM `<button>` E CONTINUA SENDO UM BOTÃO
   * ────────────────────────────────────────────────────────────────────────────
   * "Ver preço" precisa ficar EXATAMENTE onde o preço vai ficar — é o mesmo lugar, antes e
   * depois —, e botão dentro de botão não existe em HTML. Encolher o alvo de adicionar para
   * caber os dois tiraria da atendente o toque grande que ela usa o dia inteiro.
   *
   * Então o card virou um `<div>` que escuta o toque, e o sinal de mais virou um `<button>` de
   * verdade, com o mesmo nome acessível que o card tinha ("Adicionar … ao orçamento"). Quem usa
   * teclado ou leitor de tela chega nele e o aciona como antes — o clique dele sobe para o card
   * —, e quem usa o dedo continua podendo tocar a linha inteira. Nenhum caminho foi perdido.
   */
  const renderCandidato = (p, { exato = false, meta = null } = {}) => {
    const codigo = p.codigo_produto_erp;
    const descricao = textoOuSemValor(p.descricao);
    const detalhe = detalhes[codigo] || null;
    const valores = detalhe?.estado === ESTADO_PRECO.OK ? detalhe.valores : null;

    // O valor do próprio produto manda; o do "ver preço" preenche o que faltava. Nunca o
    // contrário, e nunca o valor de outro código.
    const preco = valorPresente(p.preco_unitario) ? p.preco_unitario : valores?.preco_unitario;
    const estoque = valorPresente(p.estoque_previsto)
      ? p.estoque_previsto
      : valores?.estoque_previsto;
    const inativo = p.ativo === false || valores?.ativo === false;
    const grupo = rotuloGrupoProduto(p) || rotuloGrupoProduto(detalhe?.classificacao);
    const unidade = p.unidade || valores?.unidade || "";

    const temPreco = valorPresente(preco);
    const carregando = detalhe?.estado === ESTADO_PRECO.CARREGANDO;
    const falhou = detalhe?.estado === ESTADO_PRECO.FALHOU;
    const oferecerPreco = !temPreco && !carregando;
    const estoqueTexto = textoEstoque(estoque, unidade);

    // Marca e unidade podem faltar; o código nunca falta (candidato sem código não entra na
    // lista). Ausência de marca não vira texto: ela já se lê pela ausência.
    const secundaria = [p.marca, unidade, `Cód. ${codigo}`].filter(Boolean).join(" · ");

    const aoAdicionar = () => {
      if (!disabled) adicionar(p, meta);
    };

    return (
      <div
        className={[
          "wa-orc-candidatoCard",
          exato ? "wa-orc-candidatoCard--exato" : "",
          disabled ? "wa-orc-candidatoCard--off" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        key={codigo}
        onClick={aoAdicionar}
      >
        <span className="wa-orc-candidato-corpo">
          <span className="wa-orc-candidato-titulo">{descricao}</span>
          <span className="wa-orc-candidato-valor wa-orc-candidato-valor--preco">
            {carregando ? (
              <>
                <span className="wa-orc-skelValor" aria-hidden="true" />
                <span className="wa-orc-srOnly">Consultando preço…</span>
              </>
            ) : temPreco ? (
              <strong className="wa-orc-candidato-preco">{formatMoedaOrcamento(preco)}</strong>
            ) : oferecerPreco ? (
              <button
                type="button"
                className={falhou ? "wa-orc-verPreco wa-orc-verPreco--falhou" : "wa-orc-verPreco"}
                disabled={disabled}
                aria-label={
                  falhou
                    ? `O preço de ${descricao} não veio. Tentar de novo`
                    : `Ver preço de ${descricao}`
                }
                onClick={(e) => {
                  // O toque é só para ver o preço: não pode também jogar o item no carrinho.
                  e.stopPropagation();
                  void verPreco(p);
                }}
              >
                {falhou ? "tentar de novo" : "ver preço"}
              </button>
            ) : null}
          </span>
          {exato ? (
            <span className="wa-orc-candidato-tag">Nome igual ao que você pesquisou</span>
          ) : null}
          <span className="wa-orc-candidato-meta">
            {secundaria}
            {/*
              Grupo e subgrupo NÃO vêm na lista — só na resposta resolvida. A etiqueta aparece
              quando o dado existe e some quando não, sem reservar buraco: numa loja de peças
              ela é o que separa dois nomes quase iguais.
            */}
            {grupo ? <span className="wa-orc-candidato-grupo">{grupo}</span> : null}
          </span>
          <span className="wa-orc-candidato-valor">
            {estoqueTexto ? (
              <span className={classeEstoque(estoque)}>{estoqueTexto}</span>
            ) : null}
          </span>
          {inativo ? (
            <span className="wa-orc-candidato-inativo">Inativo no sistema da empresa</span>
          ) : null}
        </span>
        {/* O clique deste botão sobe para o card — ele é o mesmo gesto, com nome acessível. */}
        <button
          type="button"
          className="wa-orc-candidato-acao"
          disabled={disabled}
          aria-label={`Adicionar ${descricao} ao orçamento`}
        >
          <Plus size={18} strokeWidth={2.25} />
        </button>
      </div>
    );
  };

  return (
    <section className="wa-orc-section wa-orc-section--divisa" aria-label="Pesquisar produto">
      <h4 className="wa-orc-sectionTitle">
        <label htmlFor="wa-orc-produtoBusca">Pesquisar produto</label>
      </h4>
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
        onKeyDown={aoTeclarNaBusca}
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

      {/*
        Os mais usados vêm ANTES da busca na tela porque vêm antes dela no uso: numa loja de giro
        repetido, o item já está aqui e o campo acima nem precisa ser tocado.
      */}
      {mostrarFrequentes ? (
        <div className="wa-orc-frequentes">
          <p className="wa-orc-grupoTitulo">Usados com frequência</p>
          <div className="wa-orc-resultados">
            {frequentes.map((f) =>
              renderCandidato({
                codigo_produto_erp: f.codigo,
                descricao: f.descricao,
                marca: f.marca,
                unidade: f.unidade,
              })
            )}
          </div>
        </div>
      ) : null}

      <div className="wa-orc-resultados" aria-busy={buscando}>
        {/*
          Faixa de estado SEMPRE presente (altura reservada no CSS): entrar em "Pesquisando…"
          com resultados na tela não pode empurrar a lista para baixo — a atendente estaria com
          o dedo a caminho de um card.
        */}
        {buscando || buscou ? (
          <div className="wa-orc-buscaStatus">
            <span role="status">{buscando ? "Pesquisando…" : ""}</span>
            {/* Atalho de teclado, escondido onde não há teclado (`pointer: coarse`). */}
            {podeEnter ? <span className="wa-orc-atalho">Enter adiciona o primeiro</span> : null}
          </div>
        ) : null}
        {esqueleto
          ? ESQUELETOS.map((i) => (
              <div className="wa-orc-skelCard" key={`skel-${i}`} aria-hidden="true">
                <span className="wa-orc-skelLinha wa-orc-skelLinha--titulo" />
                <span className="wa-orc-skelLinha wa-orc-skelLinha--meta" />
              </div>
            ))
          : null}
        {vazio ? <p className="wa-orc-hint">{mensagemBuscaSemResultado(termo)}</p> : null}
        {procedencia ? <p className="wa-orc-origem">{procedencia.texto}</p> : null}
        {grupos.exato ? (
          <>
            {renderCandidato(grupos.exato, { exato: true, meta: grupos.metaDoPrecificado })}
            <p className="wa-orc-grupoTitulo">Outros com essa palavra</p>
            {grupos.outros.map((p) => renderCandidato(p, { meta: grupos.metaDoPrecificado }))}
          </>
        ) : (
          grupos.lista.map((p) => renderCandidato(p, { meta: grupos.metaDoPrecificado }))
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
