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
 * Produto inativo é avisado COM A CONSEQUÊNCIA: o contrato permite que a consulta por
 * identificador devolva um, e a preparação depois o recusa com `PRODUTO_INATIVO` e o índice do
 * item. Dizer isso aqui é o que evita montar o orçamento inteiro para tomar o erro no Calcular.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * "352,5 EM ESTOQUE" DE QUANDO?
 * ────────────────────────────────────────────────────────────────────────────
 * `meta.fonte: 'tempo_real'` diz que a CONSULTA foi ao vivo. Não diz que o número é de agora —
 * e a tela deixava as duas coisas parecerem a mesma. Medido no ERP real em 26/10/2026, em 36
 * produtos: a idade de `estoque_sincronizado_em` vinha em dois regimes, **0,2–2,5 h** ou **86,6
 * h (3,6 dias)**, com mediana de 86,6 h. Quem promete prazo de entrega ao cliente decide em cima
 * desse número, e as duas situações apareciam idênticas.
 *
 * Então o card diz a idade do saldo, em linguagem de gente ("agora", "há 3 dias"), calada até
 * 24 h e em âmbar a partir daí (`idadeDoSaldo`). Três detalhes a tornam verdadeira:
 *   · ela ANDA — o instante de referência vem de `useRelogioDeIdade`, porque o saldo é buscado
 *     uma vez e o relógio não para enquanto o drawer fica aberto;
 *   · ela acompanha o NÚMERO que está na tela: saldo e carimbo são lidos da mesma origem (o
 *     produto resolvido, ou a consulta do "ver preço"), nunca um de cada lado;
 *   · `sincronizado_em` é OUTRO carimbo — o do cadastro (descrição, preço, grupo) — e não entra
 *     aqui. Datar o saldo com a data do cadastro seria uma data certa sobre o número errado.
 *
 * Saldo NEGATIVO não é "sem estoque": medido na mesma amostra, 8 produtos vinham negativos
 * (`-908`, `-3943,5`) e 13 zerados. Zero é "acabou"; negativo é o inventário da loja errado. Os
 * dois diziam a mesma frase, e agora não (ver `textoEstoque` e `estoqueNegativo`).
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
 * ────────────────────────────────────────────────────────────────────────────
 * O RELEVANTE PRIMEIRO, O RUÍDO DEPOIS — E DITO
 * ────────────────────────────────────────────────────────────────────────────
 * A WM casa qualquer TRECHO da descrição, inclusive no meio de outra palavra. Medido no ERP
 * real em 25/10: `cimento` devolve 6 produtos e 5 são "ARREFECIMENTO"/"ARREFICIMENTO" — 83% de
 * lixo num termo central do vocabulário de quem atende (`tinta`, `oleo` e `cabo` não têm ruído
 * nenhum). A WM decide o que entra na página; aqui se decide a ORDEM em que ela é lida:
 * relevante (o termo INICIA uma palavra da descrição ou da marca) em cima, ruído embaixo de um
 * título que diz o que ele é. Nada some, nada é filtrado, a contagem e a paginação continuam
 * sendo as da WM — isto reordena só a página que já está na mão. A régua é do view model
 * (`separarCandidatosPorRelevancia`), e a correspondência exata segue acima de tudo.
 *
 * E cada card mostra POR QUE apareceu: o trecho casado vai dentro de um `<mark>`, na descrição
 * e na marca. "ARREFE**CIMENTO**" se explica sozinho, e a lista deixa de parecer quebrada.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DUAS PALAVRAS QUE NÃO ACHAM NADA
 * ────────────────────────────────────────────────────────────────────────────
 * A WM procura o trecho literal, então `filtro oleo` acha e `oleo filtro` não (medido). Quando
 * o resultado vem VAZIO e havia duas ou mais palavras, a busca é refeita UMA vez com a palavra
 * mais longa — e a tela diz, acima dos cards, que o termo mostrado não é o digitado, com a
 * volta à mão. Uma tentativa, nunca em cascata, nunca para melhorar resultado que já veio, e
 * nunca depois de ela pedir para ver só o que digitou. O estado vazio continua ensinando a
 * ordem das palavras quando a segunda tentativa também não acha.
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
  estoqueNegativo,
  formatMoedaOrcamento,
  idadeDoSaldo,
  precoNaoCadastrado,
  rotuloGrupoProduto,
  textoEstoque,
  textoOuSemValor,
  ETIQUETA_PRECO_NAO_CADASTRADO,
  TITULO_PRECO_NAO_CADASTRADO,
  TITULO_SALDO_NEGATIVO,
} from "./orcamentoFormat";
import {
  ESTADO_PRECO,
  procedenciaDosValores,
  produtoJaTemPreco,
  valorPresente,
  valoresDaRespostaPorCodigo,
} from "./precoItemCache";
import { lerProdutosFrequentes, registrarProdutoUsado } from "./produtosFrequentes";
import useRelogioDeIdade from "./useRelogioDeIdade";
import {
  agruparCandidatosProduto,
  fatiarDestaque,
  mensagemBuscaSemResultado,
  mensagemResgateBusca,
  rotuloFonte,
  termoCasaNoTexto,
  termoDeResgate,
  tituloCandidatosRuido,
} from "./orcamentoViewModel";

const MIN_CARACTERES = 3;
const DEBOUNCE_MS = 800;
/** Código do envelope quando a WM não acha o termo (`404 PRODUTO_NAO_ENCONTRADO` mapeado). */
const CODIGO_PRODUTO_NAO_ENCONTRADO = "WM_PRODUTO_NAO_ENCONTRADO";
/** Forma do agrupamento quando não há nada na tela. Congelada: nunca é mutada, só substituída. */
const SEM_RESULTADO = Object.freeze({
  exato: null,
  outros: [],
  lista: [],
  relevantes: [],
  ruido: [],
  paginacao: null,
  termo: "",
});
/** Quantos esqueletos pintar enquanto a primeira busca não volta. */
const ESQUELETOS = [0, 1, 2];

/**
 * UMA consulta à WM por um termo, já traduzida para a tela.
 *
 * É o ÚNICO lugar do componente que pede uma busca — o resgate (abaixo) reusa esta função em
 * vez de abrir um caminho novo para o servidor da loja.
 *
 * Busca que não acha nada NÃO é erro: é resultado vazio. A WM responde `404
 * PRODUTO_NAO_ENCONTRADO`, e a mensagem do envelope ("Um dos produtos do orçamento não foi
 * encontrado no ERP") foi escrita para o momento do cálculo — no campo de busca ela confunde, e
 * o alerta vermelho com "Tentar de novo" sugere falha onde houve resposta. Volta como vazio, e
 * quem exibe é o estado vazio da tela.
 */
async function pedirPagina(busca, paginaAlvo, signal) {
  try {
    const data = await consultarProdutosOrcamento({
      busca,
      pagina: paginaAlvo > 1 ? paginaAlvo : undefined,
      signal,
    });
    return { grupos: agruparCandidatosProduto(data, busca), erro: "", cancelado: false };
  } catch (err) {
    const { codigo, mensagem, cancelado } = extrairErroOrcamento(err);
    if (cancelado) return { grupos: SEM_RESULTADO, erro: "", cancelado: true };
    return {
      grupos: SEM_RESULTADO,
      erro: codigo === CODIGO_PRODUTO_NAO_ENCONTRADO ? "" : mensagem,
      cancelado: false,
    };
  }
}

/**
 * O texto em pedaços, com o trecho casado dentro de um `<mark>` — o "por que este apareceu".
 *
 * Sem casamento sai uma string só, idêntica ao que havia antes de existir destaque.
 */
function destacar(texto, termo) {
  return fatiarDestaque(texto, termo).map((pedaco, i) =>
    pedaco.destaque ? (
      <mark className="wa-orc-destaque" key={`d${i}`}>
        {pedaco.texto}
      </mark>
    ) : (
      pedaco.texto
    )
  );
}

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
   * Resgate em curso: `{ digitado, usado }` quando o que está na tela NÃO é o termo digitado.
   * `null` é o caso normal — a esmagadora maioria das buscas.
   */
  const [resgate, setResgate] = useState(null);
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
   * Termo para o qual a pessoa DISPENSOU o resgate ("Voltar ao que digitei").
   *
   * Ela pediu para ver a busca dela, não uma parecida: insistir no resgate na próxima página
   * seria desfazer a escolha dela — e gastar uma chamada para isso.
   */
  const resgateRecusadoRef = useRef("");
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
        // O agrupamento (exata × relevantes × ruído) é do view model: aqui o componente só
        // imprime o que ele decidiu.
        let resposta = await pedirPagina(termoLimpo, paginaAlvo, controller?.signal);
        // Resposta de uma geração anterior: descarta sem tocar na tela.
        if (geracao !== geracaoRef.current || resposta.cancelado) return;

        /*
          O RESGATE DA BUSCA DE DUAS PALAVRAS — uma segunda tentativa, e só uma.

          A WM procura o trecho literal: `filtro oleo` acha e `oleo filtro` devolve zero
          (medido). Quem digitou duas palavras e não achou nada conclui que o produto não
          existe. Então, e SOMENTE quando o resultado veio vazio, refazemos a busca uma vez com
          a palavra mais longa — e dizemos na tela, em voz alta, que o termo mostrado não é o
          que ela digitou.

          Três limites, porque cada chamada à WM pode custar dinheiro (seção 11 do doc 36):
          nunca em cascata (a segunda resposta é final, dê no que der), nunca para "melhorar"
          um resultado que já veio, e nunca depois de a pessoa ter pedido para ver só o que
          digitou.
        */
        let resgatado = null;
        const vazioDeVerdade = !resposta.erro && resposta.grupos.lista.length === 0;
        if (vazioDeVerdade && resgateRecusadoRef.current !== termoLimpo) {
          const alternativo = termoDeResgate(termoLimpo);
          if (alternativo) {
            const segunda = await pedirPagina(alternativo, paginaAlvo, controller?.signal);
            if (geracao !== geracaoRef.current || segunda.cancelado) return;
            if (!segunda.erro && segunda.grupos.lista.length > 0) {
              resposta = segunda;
              resgatado = { digitado: termoLimpo, usado: alternativo };
            }
          }
        }

        termoConsultadoRef.current = `${termoLimpo}|${paginaAlvo}`;
        limparDetalhes();
        setGrupos(resposta.grupos);
        setResgate(resgatado);
        setErro(resposta.erro);
        setBuscou(true);
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
      setResgate(null);
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

  /**
   * "Voltar ao que digitei": desfaz o resgate e mostra o vazio do termo dela.
   *
   * Não gasta chamada nenhuma — o vazio do termo digitado já é conhecido (foi ele que disparou
   * o resgate). E fica anotado, para a próxima busca do mesmo termo não resgatar de novo.
   */
  const voltarAoTermoDigitado = useCallback(() => {
    if (resgate?.digitado) resgateRecusadoRef.current = resgate.digitado;
    setResgate(null);
    setGrupos(SEM_RESULTADO);
    limparDetalhes();
  }, [resgate, limparDetalhes]);

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
        {
          estado: ESTADO_PRECO.CARREGANDO,
          valores: null,
          classificacao: null,
          carimbos: null,
          meta: null,
        },
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
                // De quando é o saldo que acabou de chegar. Vem junto com ele, do mesmo
                // produto, para a idade nunca datar o número de outra consulta.
                carimbos: achado.carimbos,
                meta: achado.meta,
              }
            : {
                estado: ESTADO_PRECO.FALHOU,
                valores: null,
                classificacao: null,
                carimbos: null,
                meta: null,
              },
          geracao
        );
      } catch (err) {
        const { cancelado } = extrairErroOrcamento(err);
        // Cancelado é a busca tendo mudado: a entrada já foi descartada com o resto.
        if (cancelado) return;
        anotarDetalhe(
          codigo,
          {
            estado: ESTADO_PRECO.FALHOU,
            valores: null,
            classificacao: null,
            carimbos: null,
            meta: null,
          },
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
      setResgate(null);
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
   * Há carimbo de saldo em algum card da tela agora?
   *
   * É o que liga (e desliga) o relógio da idade. Card de lista não traz estoque — o preço é sob
   * demanda, um toque por produto —, então na maior parte do tempo não há idade nenhuma nesta
   * tela e um timer ligado seria um render por minuto no caminho da digitação.
   */
  const temCarimboNaTela = useMemo(() => {
    for (const p of grupos.lista) {
      if (valorPresente(p?.estoque_previsto) && p?.estoque_sincronizado_em) return true;
    }
    for (const entrada of Object.values(detalhes)) {
      if (entrada?.estado === ESTADO_PRECO.OK && entrada.carimbos?.estoque_sincronizado_em) {
        return true;
      }
    }
    return false;
  }, [grupos, detalhes]);

  /**
   * O instante contra o qual a idade do saldo é lida — e ele ANDA (ver `useRelogioDeIdade`).
   *
   * O saldo é buscado uma vez; a idade dele, não. Com o drawer aberto durante a conversa,
   * "atualizado há 40 min" congelado no instante do toque seria falso meia hora depois.
   */
  const agora = useRelogioDeIdade(temCarimboNaTela);

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
  const renderCandidato = (p, { exato = false, meta = null, casado = "" } = {}) => {
    const codigo = p.codigo_produto_erp;
    const descricao = textoOuSemValor(p.descricao);
    const detalhe = detalhes[codigo] || null;
    const valores = detalhe?.estado === ESTADO_PRECO.OK ? detalhe.valores : null;

    // O valor do próprio produto manda; o do "ver preço" preenche o que faltava. Nunca o
    // contrário, e nunca o valor de outro código.
    const preco = valorPresente(p.preco_unitario) ? p.preco_unitario : valores?.preco_unitario;
    // O SALDO E O CARIMBO DELE ANDAM JUNTOS, de propósito: a idade tem de descrever o número
    // que está na tela. Separar as duas leituras deixaria o estoque vir do produto e a data da
    // consulta (ou o contrário) — uma data verdadeira sobre o número errado.
    const estoqueDoProduto = valorPresente(p.estoque_previsto);
    const estoque = estoqueDoProduto ? p.estoque_previsto : valores?.estoque_previsto;
    const carimboDoSaldo = estoqueDoProduto
      ? p.estoque_sincronizado_em
      : detalhe?.carimbos?.estoque_sincronizado_em;
    const inativo = p.ativo === false || valores?.ativo === false;
    const grupo = rotuloGrupoProduto(p) || rotuloGrupoProduto(detalhe?.classificacao);
    const unidade = p.unidade || valores?.unidade || "";
    // Código do fabricante: o número impresso na caixa do fornecedor. Medido no ERP real em
    // 26/10, vem preenchido em 3 de 36 produtos — então é sinal, não ruído, e aparece só quando
    // existe. É por ele que se confere "é este mesmo?" contra a embalagem na prateleira.
    const fabricante =
      typeof p.codigo_fabricante === "string" && p.codigo_fabricante.trim()
        ? p.codigo_fabricante.trim()
        : "";

    const temPreco = valorPresente(preco);
    // Valor irrisório/nulo que a WM manda para produto sem preço no Icthus: é estado, não valor.
    const semPreco = temPreco && precoNaoCadastrado(preco);
    const carregando = detalhe?.estado === ESTADO_PRECO.CARREGANDO;
    const falhou = detalhe?.estado === ESTADO_PRECO.FALHOU;
    const oferecerPreco = !temPreco && !carregando;
    const estoqueTexto = textoEstoque(estoque, unidade);
    // Idade só onde há número para datar: idade solta não descreve nada, e carimbo ausente
    // (`null` da WM) não vira "atualizado agora" — vira nada.
    const idade = estoqueTexto ? idadeDoSaldo(carimboDoSaldo, agora) : null;

    // Marca e unidade podem faltar; o código nunca falta (candidato sem código não entra na
    // lista). Ausência de marca não vira texto: ela já se lê pela ausência.
    //
    // A marca sai do texto corrido para poder receber destaque: a WM casa descrição E marca,
    // então um item pode estar na lista por causa dela — e "MAHLE" aceso aqui é o que explica
    // uma descrição onde o termo não aparece em lugar nenhum.
    const secundaria = [unidade, `Cód. ${codigo}`, fabricante ? `Fab. ${fabricante}` : ""]
      .filter(Boolean)
      .join(" · ");

    /*
      O CÓDIGO DE BARRAS SÓ APARECE QUANDO FOI ELE QUE ACHOU O PRODUTO.

      O campo de busca convida a bipar ou colar o código ("bipe/cole o código de barras"), e
      isso funciona de verdade: medido no ERP real em 26/10, `2500209000002` resolve direto no
      produto `0000209`. O que a atendente via depois do bipe era "PISO (((PROMOÇÃO)))" — uma
      descrição onde os dígitos que ela acabou de passar não aparecem em lugar nenhum, sem nada
      ligando as duas coisas.

      Então ele entra no card exatamente nesse caso, com o trecho casado aceso como em qualquer
      outro campo. Nos outros trinta cards fica fora: todo produto do catálogo tem código de
      barras, e imprimi-lo sempre seria treze dígitos de ruído por linha.
    */
    const barras = typeof p.codigo_barras === "string" ? p.codigo_barras.trim() : "";
    const barrasAchouOProduto = Boolean(barras) && termoCasaNoTexto(barras, casado);

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
          <span className="wa-orc-candidato-titulo">{destacar(descricao, casado)}</span>
          <span className="wa-orc-candidato-valor wa-orc-candidato-valor--preco">
            {carregando ? (
              <>
                <span className="wa-orc-skelValor" aria-hidden="true" />
                <span className="wa-orc-srOnly">Consultando preço…</span>
              </>
            ) : semPreco ? (
              /*
                O que a WM mandou aqui não é preço (ver `precoNaoCadastrado`). Mostrar
                "R$ 0,01" nesta vaga seria oferecer um preço plausível — 5 de 24 produtos do
                catálogo da loja vêm assim. A vaga do dinheiro diz o estado; nada de moeda.
              */
              <span className="wa-orc-semPreco" title={TITULO_PRECO_NAO_CADASTRADO}>
                {ETIQUETA_PRECO_NAO_CADASTRADO}
              </span>
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
            {p.marca ? (
              <>
                {destacar(p.marca, casado)}
                {secundaria ? " · " : null}
              </>
            ) : null}
            {secundaria}
            {/* O código de barras, só quando foi ele que achou este produto (acima). */}
            {barrasAchouOProduto ? <> · Barras {destacar(barras, casado)}</> : null}
            {/*
              Grupo e subgrupo NÃO vêm na lista — só na resposta resolvida. A etiqueta aparece
              quando o dado existe e some quando não, sem reservar buraco: numa loja de peças
              ela é o que separa dois nomes quase iguais.
            */}
            {grupo ? <span className="wa-orc-candidato-grupo">{grupo}</span> : null}
          </span>
          <span className="wa-orc-candidato-valor">
            {estoqueTexto ? (
              <span
                className={classeEstoque(estoque)}
                title={estoqueNegativo(estoque) ? TITULO_SALDO_NEGATIVO : undefined}
              >
                {estoqueTexto}
              </span>
            ) : null}
          </span>
          {/*
            Produto inativo DIZ A CONSEQUÊNCIA, e não só o estado. O contrato é explícito: a
            preparação devolve `PRODUTO_INATIVO` com o índice do item, ou seja, o "Calcular" vai
            recusar este produto. Avisar aqui — no instante em que ela está olhando o card — é o
            que evita montar dez itens e tomar o erro com o cliente esperando.
          */}
          {inativo ? (
            <span className="wa-orc-candidato-inativo">
              Inativo no sistema da empresa — o cálculo vai recusar este produto
            </span>
          ) : null}
          {/*
            A IDADE DO SALDO. Medido na base real em 26/10: mediana de 86,6 h (3,6 dias), com
            alguns produtos em 0,1 h. As duas situações apareciam idênticas, e quem promete
            entrega ao cliente decide em cima disso.

            Calada até 24 h, âmbar a partir daí (`idadeDoSaldo`): saldo fresco não precisa de
            alarde, e alarme em toda linha é alarme em nenhuma. Sem carimbo, nada é escrito.
          */}
          {idade ? (
            <span
              className={
                idade.aviso ? "wa-orc-saldoIdade wa-orc-saldoIdade--aviso" : "wa-orc-saldoIdade"
              }
              title={idade.titulo || undefined}
            >
              {idade.texto}
            </span>
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
          : "Pesquise pelo nome ou pela marca, ou bipe/cole o código de barras."}
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
        {/*
          O resgate não pode passar por resultado normal: quem olha a lista precisa saber, antes
          de escolher, que ela é de OUTRO termo. Por isso a frase vem acima dos cards, nomeia os
          dois termos e traz a saída de volta.
        */}
        {resgate ? (
          <div className="wa-orc-resgate" role="status">
            <span>{mensagemResgateBusca(resgate.digitado, resgate.usado)}</span>
            <button
              type="button"
              className="wa-btn wa-btn-ghost wa-orc-btnSm"
              disabled={buscando}
              onClick={voltarAoTermoDigitado}
            >
              Voltar ao que digitei
            </button>
          </div>
        ) : null}
        {procedencia ? <p className="wa-orc-origem">{procedencia.texto}</p> : null}
        {/*
          O card exato vai SEM destaque: a descrição dele é o termo inteiro, acender tudo não
          explicaria nada — e o rótulo logo abaixo do nome já diz por que ele está em primeiro.
        */}
        {grupos.exato
          ? renderCandidato(grupos.exato, { exato: true, meta: grupos.metaDoPrecificado })
          : null}
        {grupos.exato && grupos.relevantes.length ? (
          <p className="wa-orc-grupoTitulo">Outros com essa palavra</p>
        ) : null}
        {grupos.relevantes.map((p) =>
          renderCandidato(p, { meta: grupos.metaDoPrecificado, casado: grupos.termo })
        )}
        {/*
          O ruído fica, e fica DITO: às vezes "arrefecimento" é exatamente o que ela queria.
          Sem ruído na página — o caso comum, como `tinta` e `oleo` — este título não existe e
          a tela é idêntica à de antes.
        */}
        {grupos.ruido.length ? (
          <p className="wa-orc-grupoTitulo wa-orc-grupoTitulo--ruido">
            {tituloCandidatosRuido(grupos.termo)}
          </p>
        ) : null}
        {grupos.ruido.map((p) =>
          renderCandidato(p, { meta: grupos.metaDoPrecificado, casado: grupos.termo })
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
