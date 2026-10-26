/**
 * Drawer "Novo orçamento" — orquestra formulário → ambiguidades → prévia.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (Sessão 5; D8; D11;
 * pendências 1 e 2 da seção 10).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE COMPONENTE É SEPARADO DO DRAWER DE PRODUTOS (D8)
 * ────────────────────────────────────────────────────────────────────────────
 * `ProdutoConsultaPanel` é montado em DOIS lugares: no cabeçalho da conversa e também na lista
 * de conversas (`chatList.jsx` / `ChatListHeaderBar.jsx`) — ali **sem conversa aberta e sem o
 * guarda `!isGroup`**. Transformar aquele painel em "Produtos | Novo orçamento" colocaria o
 * orçamento num contexto sem `conversa_id`, e `conversa_id` é justamente o que o backend usa
 * para revalidar acesso à conversa (`assertPermissaoConversa`) antes de falar com o ERP.
 * Por isso: painel de produtos intacto nos dois lugares, e este drawer só na conversa.
 *
 * O estilo segue o do painel de produtos (mesmo `wa-modalOverlay`, mesma gramática de classes),
 * mas nada é reaproveitado como componente.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O LAÇO DE AMBIGUIDADE
 * ────────────────────────────────────────────────────────────────────────────
 * A WM reporta UMA ambiguidade por vez, e a resposta devolve o RASCUNHO INTACTO — é ele que
 * se reenvia com a escolha ou com a página seguinte. Então o estado de negócio do laço é o
 * corpo que o servidor devolveu, não uma reconstrução nossa: reconstruir abriria a porta para
 * a tela e o servidor discordarem sobre o que está sendo orçado.
 *
 * Cada escolha é um clique explícito do atendente. Nada é selecionado automaticamente, nem
 * quando a lista tem um único candidato (o contrato é explícito a respeito).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ERROS
 * ────────────────────────────────────────────────────────────────────────────
 * Tudo que aparece na tela vem de `extrairErroOrcamento`, que devolve a `mensagem` humana do
 * envelope do backend. Nunca status HTTP, código interno, `comando_id`, `RESULTADO_INCERTO`,
 * `requestId` ou stack. O interceptor global está silenciado para estas rotas (ver
 * `api/wmOrcamentosService.js`), então não há toast genérico competindo com o aviso daqui.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * "A LOJA ESTÁ NO AR?" — O AVISO QUE CHEGA ANTES DO TRABALHO PERDIDO
 * ────────────────────────────────────────────────────────────────────────────
 * As portas da WM caem SEPARADAMENTE: com o sincronizador da loja fora do ar, a busca de
 * produto continua respondendo 200 (ela vem do acervo dentro da WM) enquanto cliente e
 * `preparar` devolvem 503. O atendente montava dez itens, digitava o cliente e só descobria no
 * Calcular que nada daquilo ia funcionar. `GET /erp/status` é consultado na abertura e o aviso
 * aparece quando souber — ver `sondarErp` e `erpDisponibilidade.js` para o resto das regras.
 *
 * O "Calcular" **continua habilitado** com a loja fora do ar, e isso é escolha. O veredito tem
 * até 30 s de cache no servidor, então ele pode estar velho justamente no instante bom: a loja
 * voltou e o botão ainda estaria travado por uma informação vencida. Além disso é o Calcular que
 * produz a verdade mais recente — e quando ele falha por queda, o drawer resonda. Desabilitar
 * trocaria um aviso honesto por um impedimento que a tela não tem como garantir.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE DRAWER NÃO FAZ
 * ────────────────────────────────────────────────────────────────────────────
 * Não escuta Socket.IO (o MVP é request/response + leitura de estado após F5, por custo), não
 * toca no scroll/teclado da conversa, não mexe no composer e **não envia mensagem**.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CRIAR E ENVIAR SÃO DUAS DECISÕES (Sessão 6)
 * ────────────────────────────────────────────────────────────────────────────
 * "Confirmar e criar no ERP" grava o orçamento e **para aí**. O envio ao cliente é outro
 * clique, em outra tela, e nem ele manda mensagem: entrega o texto ao composer da conversa,
 * onde o atendente revisa e aperta enviar como em qualquer outra mensagem. Nenhum `useEffect`
 * envia nada, e falhar no envio do WhatsApp não encosta no orçamento — ele já está criado, e
 * o texto continua disponível.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * INCERTO TRAVA A TELA (D10)
 * ────────────────────────────────────────────────────────────────────────────
 * Quando a resposta vem `INCERTO`, a criação pode ter acontecido no ERP. A tela não oferece
 * "tentar de novo" — oferecer seria produzir um `comando_id` novo e, com ele, o segundo
 * orçamento. Ela trava a confirmação e manda procurar o suporte, que tem o caminho de
 * reconciliação (reenvio do MESMO comando, nunca por aqui, nunca automático).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * MEMÓRIA DO VENDEDOR
 * ────────────────────────────────────────────────────────────────────────────
 * Este é o único lugar que GRAVA a memória de vendedor, e só com o vendedor que a WM resolveu
 * numa prévia `pronto_para_confirmacao`. Pré-preencher é sugestão; mapear usuário ZapERP →
 * vendedor ERP continua fora do MVP de propósito (doc 36 §6.2). Ver `vendedorLembrado.js`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TriangleAlert } from "lucide-react";
import {
  consultarProdutosOrcamento,
  consultarStatusErp,
  prepararOrcamento,
  confirmarOrcamento,
  extrairErroOrcamento,
} from "../../api/wmOrcamentosService";
import { avisoErpIndisponivel, erroSugereErpFora, lerStatusErp } from "./erpDisponibilidade";
import {
  ESTADO_PRECO,
  carimbosDoProduto,
  extrairValoresDoProduto,
  precisaConsultarPreco,
  produtoJaTemPreco,
  valoresDaRespostaPorCodigo,
} from "./precoItemCache";
import useOrcamentoDraft from "./useOrcamentoDraft";
import { normalizarQuantidadeParaEnvio } from "./orcamentoFormat";
import {
  assinaturaDoBody,
  assinaturaDoRascunho,
  dicaClienteEscolhidoRecusado,
  dicaClienteNaoEncontrado,
} from "./orcamentoViewModel";
import { gravarVendedorLembrado } from "./vendedorLembrado";
import OrcamentoForm from "./OrcamentoForm";
import AmbiguidadePicker from "./AmbiguidadePicker";
import OrcamentoPreview from "./OrcamentoPreview";
import OrcamentoResultado from "./OrcamentoResultado";
import "./orcamento.css";

const STATUS_AMBIGUIDADE = Object.freeze({
  CLIENTE: "multiplos_clientes",
  VENDEDOR: "multiplos_vendedores",
  PRODUTO: "produto_ambiguo",
});
const STATUS_PRONTO = "pronto_para_confirmacao";

const ETAPA = Object.freeze({
  FORM: "form",
  AMBIGUIDADE: "ambiguidade",
  PREVIA: "previa",
  RESULTADO: "resultado",
  /** Beco sem saída de propósito: a criação pode ter acontecido e ninguém tenta de novo. */
  INCERTO: "incerto",
});

/** Frase única para resposta que não bate com nenhum status conhecido. */
const MENSAGEM_RESPOSTA_ESTRANHA =
  "Não foi possível calcular o orçamento agora. Tente de novo em instantes.";

/** Frase de último recurso do incerto — a do backend vem pronta e é a preferida. */
const MENSAGEM_INCERTO =
  "Não foi possível confirmar se este orçamento foi criado no sistema da empresa. Não crie outro — procure o suporte.";

/** `estado` do envelope do backend que significa "pode ter gravado no ERP". */
const ESTADO_INCERTO = "INCERTO";

/**
 * Monta o corpo de `POST /api/orcamentos/preparar` a partir do rascunho da tela.
 *
 * `quantidade` vai como string decimal COM `trim()`: o validador do backend recusa `" 2 "` por
 * formato, de propósito (ele não conserta entrada, para que o valor validado seja exatamente o
 * que chega à WM). Sem o trim, um valor colado de planilha queimaria uma chamada.
 *
 * `cliente_*` e `vendedor_*` são exclusivos: código quando já resolvido numa ambiguidade,
 * busca por nome caso contrário — o backend recusa os dois juntos.
 */
function montarBodyPreparar({ rascunho, conversaId }) {
  const body = { conversa_id: Number(conversaId) };

  if (rascunho.clienteCodigoErp) body.cliente_codigo_erp = rascunho.clienteCodigoErp;
  else body.cliente_busca = String(rascunho.clienteBusca || "").trim();

  if (rascunho.vendedorCodigoErp) body.vendedor_codigo_erp = rascunho.vendedorCodigoErp;
  else body.vendedor_busca = String(rascunho.vendedorBusca || "").trim();

  const itens = [];
  for (const item of rascunho.itens || []) {
    const q = normalizarQuantidadeParaEnvio(item.quantidade);
    if (!q.ok) return { ok: false, motivo: q.motivo };
    if (item.codigo_produto_erp) {
      itens.push({ codigo_produto_erp: item.codigo_produto_erp, quantidade: q.value });
    } else {
      itens.push({ busca: String(item.busca || "").trim(), quantidade: q.value });
    }
  }
  if (!itens.length) return { ok: false, motivo: "Adicione ao menos um produto." };
  body.itens = itens;

  return { ok: true, body };
}

/**
 * Aplica a escolha do atendente ao corpo devolvido pelo servidor.
 *
 * Trabalha sobre `ambiguidade.rascunho` (o corpo intacto que o backend devolveu), trocando
 * busca por código e **removendo a página** daquela dimensão: a página só faz sentido enquanto
 * há ambiguidade, e mandá-la de volta junto com o código resolvido seria enviar um estado que
 * não existe mais.
 */
function aplicarEscolhaNoBody(bodyServidor, { status, candidato, indice_item }) {
  const body = { ...bodyServidor };
  if (status === STATUS_AMBIGUIDADE.CLIENTE) {
    delete body.cliente_busca;
    delete body.cliente_pagina;
    body.cliente_codigo_erp = candidato.codigo_cliente_erp;
    return body;
  }
  if (status === STATUS_AMBIGUIDADE.VENDEDOR) {
    delete body.vendedor_busca;
    delete body.vendedor_pagina;
    body.vendedor_codigo_erp = candidato.codigo_vendedor_erp;
    return body;
  }
  // produto_ambiguo: `indice_item` é zero-based e sobrevive à ida e à volta sem deslocamento.
  const itens = Array.isArray(body.itens) ? body.itens.slice() : [];
  const alvo = itens[indice_item];
  if (!alvo) return body;
  itens[indice_item] = {
    codigo_produto_erp: candidato.codigo_produto_erp,
    quantidade: alvo.quantidade,
  };
  body.itens = itens;
  return body;
}

/** Página absoluta na dimensão da ambiguidade atual, sem clamp (contrato não corrige página). */
function aplicarPaginaNoBody(bodyServidor, { status, indice_item }, pagina) {
  const body = { ...bodyServidor };
  if (status === STATUS_AMBIGUIDADE.CLIENTE) {
    body.cliente_pagina = pagina;
    return body;
  }
  if (status === STATUS_AMBIGUIDADE.VENDEDOR) {
    body.vendedor_pagina = pagina;
    return body;
  }
  const itens = Array.isArray(body.itens) ? body.itens.slice() : [];
  if (!itens[indice_item]) return body;
  itens[indice_item] = { ...itens[indice_item], produto_pagina: pagina };
  body.itens = itens;
  return body;
}

export default function OrcamentoDrawer({
  open,
  onClose,
  conversaId,
  companyId,
  userId,
  clienteNomeSugerido = "",
  onEnviarAoCliente,
}) {
  const [etapa, setEtapa] = useState(ETAPA.FORM);
  const [ambiguidade, setAmbiguidade] = useState(null);
  const [preparacao, setPreparacao] = useState(null);
  /**
   * `{ resultado, previa, jaEstavaCriado }` — e `jaEstavaCriado` sai do NOSSO estado da
   * operação (o backend devolve `ja_criado`), nunca de um campo da resposta da WM: §11.1
   * proíbe inferir "criado agora" × "resultado idempotente" pelo corpo dela.
   */
  const [resultadoOperacao, setResultadoOperacao] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [mensagemIncerto, setMensagemIncerto] = useState("");
  const [erro, setErro] = useState("");
  const [avisoCampo, setAvisoCampo] = useState("");
  /** Explicação do "busca por prefixo" quando a WM não acha o cliente digitado. */
  const [dicaCliente, setDicaCliente] = useState("");

  /**
   * Preço e estoque por código, só em memória (ver `precoItemCache.js`). Preço não entra no
   * rascunho de `sessionStorage`: um valor velho voltando do storage pareceria atual.
   */
  const [precos, setPrecos] = useState({});
  /**
   * Espelho SÍNCRONO de `precos`. Ele existe porque a decisão "vale gastar uma chamada?" não
   * pode sair de dentro de um atualizador de estado: o atualizador roda quando o React quer, e
   * ler o resultado dele na linha seguinte ora funcionava, ora deixava o item preso em
   * "Consultando preço…" para sempre (visto ao vivo). O ref decide; o estado só pinta.
   */
  const precosRef = useRef({});

  /**
   * Veredito da sonda de disponibilidade do ERP — `{ alcancavel, motivo }` ou `null`.
   *
   * `null` é "não sabemos", e é o estado inicial E o estado depois de uma sonda que falhou. A
   * tela desenha aviso só a partir de um veredito; silêncio é a resposta certa para o que não
   * se sabe (ver `erpDisponibilidade.js`).
   */
  const [statusErp, setStatusErp] = useState(null);
  const [verificandoErp, setVerificandoErp] = useState(false);
  const statusAbortRef = useRef(null);

  const abortRef = useRef(null);
  const produtoFocusRef = useRef(null);
  /** Consultas de preço em voo, por código — abortadas ao fechar o drawer. */
  const precoAbortsRef = useRef(new Map());

  const { rascunho, patch, limpar, carregado } = useOrcamentoDraft({
    companyId,
    userId,
    conversaId,
    ativo: open,
    clienteNomeSugerido,
  });

  // Trocar de conversa com o drawer aberto reinicia o fluxo: a preparação do servidor está
  // amarrada a uma conversa, e reaproveitá-la em outra seria orçar para o cliente errado.
  useEffect(() => {
    setEtapa(ETAPA.FORM);
    setAmbiguidade(null);
    setPreparacao(null);
    setResultadoOperacao(null);
    setConfirmando(false);
    setMensagemIncerto("");
    setErro("");
    setAvisoCampo("");
    setDicaCliente("");
    precosRef.current = {};
    setPrecos({});
  }, [conversaId, open]);

  /*
    A dica de cliente fala do cliente que estava no campo quando o Calcular recusou. Mexer no
    cliente — digitar outro nome, escolher outro na busca, tocar em "Trocar" — torna a frase
    obsoleta, e uma explicação obsoleta passa a descrever o cliente errado.
  */
  useEffect(() => {
    setDicaCliente("");
  }, [rascunho?.clienteCodigoErp, rascunho?.clienteBusca]);

  useEffect(
    () => () => {
      try {
        abortRef.current?.abort();
      } catch {
        /* ignore */
      }
      try {
        statusAbortRef.current?.abort();
      } catch {
        /* ignore */
      }
      for (const controller of precoAbortsRef.current.values()) {
        try {
          controller?.abort();
        } catch {
          /* ignore */
        }
      }
      precoAbortsRef.current.clear();
    },
    []
  );

  /**
   * "Dá para orçar agora?" — uma consulta, e ela NUNCA atrasa a abertura do drawer.
   *
   * ────────────────────────────────────────────────────────────────────────────
   * POR QUE ISTO NÃO PODE BLOQUEAR A TELA
   * ────────────────────────────────────────────────────────────────────────────
   * Com a loja fora do ar a sonda leva ~2,5 s (medido em produção). Pôr um spinner na frente do
   * drawer por isso seria cobrar de TODA abertura — inclusive das que vão dar certo — o preço do
   * caso ruim, e numa tela que a atendente abre com o cliente esperando. Então o drawer abre na
   * hora, a consulta corre ao lado, e o aviso aparece quando souber.
   *
   * ────────────────────────────────────────────────────────────────────────────
   * QUANDO SE CONSULTA — E POR QUE NÃO EM LAÇO
   * ────────────────────────────────────────────────────────────────────────────
   * Na abertura; quando a pessoa pede ("Verificar de novo"); e quando o Calcular falha por um
   * código que diz que a porta realtime caiu (`erroSugereErpFora`) — aí o veredito da tela
   * acabou de ser desmentido pela realidade e insistir nele seria pior que não ter nenhum.
   * Nada de `setInterval`: a sonda do backend já tem cache de 30 s e é coalescida, então um laço
   * não traria notícia nova — só ruído e bateria.
   *
   * ────────────────────────────────────────────────────────────────────────────
   * FALHAR AQUI É CALAR, NÃO ACUSAR
   * ────────────────────────────────────────────────────────────────────────────
   * Exceção, timeout, forma inesperada: o estado fica como estava. Na primeira consulta isso é
   * `null` e a tela não desenha nada. Numa reconsulta, o veredito anterior permanece — ele veio
   * de uma resposta de verdade, e uma chamada que não respondeu não é motivo para esquecê-lo.
   * O que não se faz, em nenhum dos dois casos, é inventar "a loja está fora do ar" por causa
   * de uma requisição nossa que não voltou.
   */
  const sondarErp = useCallback(async () => {
    try {
      statusAbortRef.current?.abort();
    } catch {
      /* ignore */
    }
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    statusAbortRef.current = controller;
    setVerificandoErp(true);
    try {
      const data = await consultarStatusErp({ signal: controller?.signal });
      const lido = lerStatusErp(data);
      if (lido) setStatusErp(lido);
    } catch {
      /* Silêncio deliberado: ver o parágrafo acima. */
    } finally {
      setVerificandoErp(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void sondarErp();
    // O veredito é da EMPRESA, não da conversa: trocar de conversa com o drawer aberto não
    // muda se a loja está no ar, e resondar por isso só gastaria uma chamada.
  }, [open, sondarErp]);

  /**
   * Preço do item que a atendente ACABOU de escolher — uma consulta, por código.
   *
   * Por que aqui e não na lista: a lista de candidatos da WM não traz preço, e buscá-lo para os
   * 30 da página seriam 30 consultas em tempo real no SQL Server da loja a cada busca (seção
   * 11). No toque é uma só, e é o instante em que o valor importa — ela está decidindo.
   *
   * Regras que não se negociam aqui:
   *   · produto que já veio com preço não gasta chamada; o valor é copiado como veio;
   *   · um código só é consultado uma vez por abertura do drawer, mesmo que tenha falhado
   *     (repetir sozinho queimaria chamada no servidor do cliente);
   *   · falhar NUNCA bloqueia: a linha fica sem preço e o "Calcular" resolve no servidor;
   *   · nenhum erro aqui vira alerta na tela — o atendente não pediu esta consulta, e um
   *     vermelho sobre ela faria parecer que o orçamento está impedido.
   */
  const anotarPreco = useCallback((codigo, entrada) => {
    precosRef.current = { ...precosRef.current, [codigo]: entrada };
    setPrecos(precosRef.current);
  }, []);

  const consultarPrecoDoItem = useCallback(
    async (produto, meta) => {
      const codigo = produto?.codigo_produto_erp;
      if (typeof codigo !== "string" || !codigo) return;

      // Ramo resolvido: o preço já está na mão, com a procedência que veio com ele.
      if (produtoJaTemPreco(produto)) {
        const valores = extrairValoresDoProduto(produto);
        // O carimbo do saldo viaja junto com o saldo: é ele que a linha do carrinho usa para
        // dizer de quando é o número (ver `idadeDoSaldo`). Do MESMO produto, nunca de outro.
        if (valores) {
          anotarPreco(codigo, {
            estado: ESTADO_PRECO.OK,
            valores,
            carimbos: carimbosDoProduto(produto),
            meta: meta ?? null,
          });
        }
        return;
      }

      if (!precisaConsultarPreco(precosRef.current, produto)) return;
      anotarPreco(codigo, {
        estado: ESTADO_PRECO.CARREGANDO,
        valores: null,
        carimbos: null,
        meta: null,
      });

      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      precoAbortsRef.current.set(codigo, controller);
      try {
        const data = await consultarProdutosOrcamento({
          codigo_produto_erp: codigo,
          signal: controller?.signal,
        });
        const achado = valoresDaRespostaPorCodigo(data, codigo);
        anotarPreco(
          codigo,
          achado
            ? {
                estado: ESTADO_PRECO.OK,
                valores: achado.valores,
                carimbos: achado.carimbos,
                meta: achado.meta,
              }
            : { estado: ESTADO_PRECO.FALHOU, valores: null, carimbos: null, meta: null }
        );
      } catch (err) {
        const { cancelado } = extrairErroOrcamento(err);
        // Cancelado é o drawer fechando: a entrada fica como está e morre com o cache.
        if (cancelado) return;
        anotarPreco(codigo, {
          estado: ESTADO_PRECO.FALHOU,
          valores: null,
          carimbos: null,
          meta: null,
        });
      } finally {
        precoAbortsRef.current.delete(codigo);
      }
    },
    [anotarPreco]
  );

  const preparar = useCallback(async (body) => {
    try {
      abortRef.current?.abort();
    } catch {
      /* ignore */
    }
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    abortRef.current = controller;
    setCalculando(true);
    setErro("");
    setAvisoCampo("");
    setDicaCliente("");
    try {
      const data = await prepararOrcamento(body, { signal: controller?.signal });
      if (data?.status === STATUS_PRONTO) {
        // A prévia vale para ESTE conjunto de dados. Guardar a assinatura do corpo enviado é o
        // que permite, depois, barrar o "Confirmar" se cliente, vendedor, produto ou quantidade
        // mudar — em vez de gravar no ERP um preço que já não é o da tela.
        setPreparacao({ ...data, assinatura: assinaturaDoBody(body) });
        setAmbiguidade(null);
        setEtapa(ETAPA.PREVIA);

        // Único lugar que alimenta a memória de vendedor: o vendedor que a WM RESOLVEU. Nunca
        // um candidato de lista, nunca `user.nome` (doc 36 §6.2 — vendedor mexe com comissão).
        const vendedor = data?.previa?.vendedor;
        if (typeof vendedor?.codigo_vendedor_erp === "string" && vendedor.codigo_vendedor_erp) {
          gravarVendedorLembrado({
            companyId,
            userId,
            codigo: vendedor.codigo_vendedor_erp,
            nome: vendedor.nome || "",
          });
          // Confirmado agora: deixa de ser lembrança e a tela pode mostrá-lo como canônico.
          patch({ vendedorDeMemoria: false });
        }
        return;
      }
      const status = data?.status;
      if (
        status === STATUS_AMBIGUIDADE.CLIENTE ||
        status === STATUS_AMBIGUIDADE.VENDEDOR ||
        status === STATUS_AMBIGUIDADE.PRODUTO
      ) {
        setAmbiguidade(data);
        setEtapa(ETAPA.AMBIGUIDADE);
        return;
      }
      // Forma desconhecida: não se adivinha tela (o backend já recusa resposta fora do
      // contrato antes de chegar aqui; isto é a rede de segurança).
      setEtapa(ETAPA.FORM);
      setErro(MENSAGEM_RESPOSTA_ESTRANHA);
    } catch (err) {
      const { mensagem, cancelado, campo, codigo } = extrairErroOrcamento(err);
      if (cancelado) return;
      setEtapa(ETAPA.FORM);
      setErro(mensagem);
      if (campo) setAvisoCampo("Revise os dados informados e calcule de novo.");
      /*
        O Calcular acabou de falhar por queda/demora da porta realtime. Seja o aviso ausente
        (sonda disse "de pé" e a realidade discordou) ou presente e velho, é o momento em que
        resondar vale: uma chamada, por um fato que acabou de acontecer na tela. Não é retry do
        orçamento — nada do cálculo é refeito aqui.
      */
      if (erroSugereErpFora(codigo)) void sondarErp();
      /*
        Duas dicas de cliente, e o que decide entre elas é o que a pessoa fez:

        · digitou o nome e não achou → quase sempre é o PREFIXO (a WM casa cliente pelo começo
          do nome, então sobrenome não acha);
        · escolheu na busca e levou `CLIENTE_INVALIDO` → o cliente existe, mas está inativo ou
          bloqueado. Sem explicação, "Escolha outro" depois de escolher de uma lista que o
          próprio sistema mostrou parece defeito — é a consequência de tela do
          `resolucao_definitiva: false` (D11).

        As duas são TEXTO: nenhuma dispara consulta nova.
      */
      setDicaCliente(
        dicaClienteNaoEncontrado(codigo, body?.cliente_busca) ||
          dicaClienteEscolhidoRecusado(codigo, body?.cliente_codigo_erp)
      );
    } finally {
      setCalculando(false);
    }
  }, [companyId, userId, patch, sondarErp]);

  const calcular = useCallback(() => {
    const montado = montarBodyPreparar({ rascunho, conversaId });
    if (!montado.ok) {
      setErro(montado.motivo);
      return;
    }
    void preparar(montado.body);
  }, [rascunho, conversaId, preparar]);

  const escolherCandidato = useCallback(
    (escolha) => {
      if (!ambiguidade?.rascunho) return;
      // Espelha a escolha no rascunho local para que ela sobreviva a um F5 ou a um fechamento
      // acidental — só o código e o nome; documento de candidato nunca é guardado.
      if (escolha.status === STATUS_AMBIGUIDADE.CLIENTE) {
        patch({
          clienteCodigoErp: escolha.candidato.codigo_cliente_erp,
          clienteNome: escolha.candidato.nome || "",
        });
      } else if (escolha.status === STATUS_AMBIGUIDADE.VENDEDOR) {
        patch({
          vendedorCodigoErp: escolha.candidato.codigo_vendedor_erp,
          vendedorNome: escolha.candidato.nome || "",
          // Escolha explícita do atendente numa lista da WM: não é mais a lembrança.
          vendedorDeMemoria: false,
        });
      } else if (escolha.status === STATUS_AMBIGUIDADE.PRODUTO) {
        const idx = escolha.indice_item;
        patch((atual) => {
          const lista = Array.isArray(atual.itens) ? atual.itens.slice() : [];
          if (!lista[idx]) return {};
          lista[idx] = {
            ...lista[idx],
            codigo_produto_erp: escolha.candidato.codigo_produto_erp,
            busca: "",
            descricao: escolha.candidato.descricao || lista[idx].descricao || "",
            unidade: escolha.candidato.unidade || lista[idx].unidade || "",
          };
          return { itens: lista };
        });
      }
      void preparar(aplicarEscolhaNoBody(ambiguidade.rascunho, escolha));
    },
    [ambiguidade, patch, preparar]
  );

  const trocarPaginaAmbiguidade = useCallback(
    (pagina) => {
      if (!ambiguidade?.rascunho) return;
      void preparar(
        aplicarPaginaNoBody(
          ambiguidade.rascunho,
          { status: ambiguidade.status, indice_item: ambiguidade.indice_item },
          pagina
        )
      );
    },
    [ambiguidade, preparar]
  );

  /**
   * "Limpar rascunho" e a limpeza pós-criação levam o cache de preço junto: rascunho zerado é
   * começo de outro orçamento, e preço guardado de um item que não está mais na tela não tem
   * por que sobreviver a ele.
   */
  const limparTudo = useCallback(() => {
    limpar();
    precosRef.current = {};
    setPrecos({});
  }, [limpar]);

  /**
   * "Confirmar e criar no ERP" — a única ação desta tela que escreve em sistema de terceiro.
   *
   * Uma chamada por clique, e o botão fica desabilitado enquanto ela corre (`confirmando`), o
   * que fecha a porta do duplo clique no navegador. A porta que importa, porém, é a do
   * servidor: o `comando_id` nasce e é persistido lá, pela transição atômica, e um segundo
   * POST da mesma preparação não vira segundo orçamento. Por isso aqui não há timer, não há
   * retentativa e não há `verificarOrcamento` — nada automático toca a criação.
   *
   * A resposta de erro NÃO é tratada toda igual: `INCERTO` não é "falhou", é "pode ter dado
   * certo". Esse ramo leva à tela travada, não a uma mensagem de erro com o botão de volta.
   */
  const confirmar = useCallback(async () => {
    const preparacaoId = preparacao?.preparacao_id;
    if (!preparacaoId || confirmando) return;
    setConfirmando(true);
    setErro("");
    try {
      const data = await confirmarOrcamento(preparacaoId);
      setResultadoOperacao({
        resultado: data?.resultado ?? null,
        // Os itens do resumo saem da prévia que acabou de ser confirmada — o `200` da criação
        // não os traz (§10). É o mesmo conjunto que virou `payload_hash` no servidor.
        previa: preparacao?.previa ?? null,
        // Afirmação sobre a NOSSA operação, vinda do backend, nunca lida da resposta da WM.
        jaEstavaCriado: data?.ja_criado === true,
      });
      setEtapa(ETAPA.RESULTADO);
      // O rascunho morre com a criação. Deixá-lo vivo faria o drawer reabrir com o orçamento
      // inteiro preenchido e um "Calcular" à mão — que é o caminho curto para um segundo
      // orçamento no Icthus sem ninguém ter decidido isso. O que foi criado continua na tela.
      limparTudo();
    } catch (err) {
      const { mensagem, cancelado, estado } = extrairErroOrcamento(err);
      if (cancelado) return;
      if (estado === ESTADO_INCERTO) {
        setMensagemIncerto(mensagem || MENSAGEM_INCERTO);
        setEtapa(ETAPA.INCERTO);
        return;
      }
      // Falha segura: nada foi gravado. Fica na prévia, com o erro à vista — recalcular ou
      // voltar e editar são as saídas, e as duas passam por uma preparação nova.
      setErro(mensagem);
    } finally {
      setConfirmando(false);
    }
  }, [preparacao, confirmando, limparTudo]);

  /**
   * "Enviar ao cliente" — ação separada, explícita e posterior à criação.
   *
   * Não envia: entrega o texto ao composer da conversa (o mesmo caminho do painel de
   * produtos), onde o atendente revisa e envia. Se o WhatsApp falhar depois disso, o problema
   * é de envio de mensagem — o orçamento já existe no ERP e nada aqui o recria.
   */
  const enviarAoCliente = useCallback(
    (texto) => {
      if (typeof onEnviarAoCliente !== "function" || !texto) return;
      onEnviarAoCliente(texto);
      onClose?.();
    },
    [onEnviarAoCliente, onClose]
  );

  const voltarAoFormulario = useCallback(() => {
    setEtapa(ETAPA.FORM);
    setAmbiguidade(null);
    // A prévia morre junto: voltar para editar é, por definição, abrir mão dos valores que a WM
    // calculou para o conjunto anterior. Só um novo "Calcular" traz prévia de volta.
    setPreparacao(null);
    setErro("");
  }, []);

  /**
   * A prévia na tela ainda corresponde ao que está no rascunho?
   *
   * Hoje o formulário e a prévia não convivem (são etapas distintas, e `voltarAoFormulario`
   * descarta a preparação), então na prática isto é `false`. Existe porque o acoplamento
   * inverso é o perigoso: no dia em que algo patchar o rascunho com a prévia aberta — a Sessão
   * 6, um eco de ambiguidade, uma restauração de rascunho — o botão "Confirmar e criar no ERP"
   * criaria no ERP um orçamento diferente do que o atendente leu. Com a assinatura, ele
   * desabilita e pede novo cálculo.
   */
  const previaDesatualizada = useMemo(() => {
    if (!preparacao?.assinatura) return false;
    return preparacao.assinatura !== assinaturaDoRascunho(rascunho);
  }, [preparacao, rascunho]);

  const avisoErp = useMemo(() => avisoErpIndisponivel(statusErp), [statusErp]);

  /**
   * O aviso aparece onde o trabalho é MONTADO, e só ali.
   *
   * Nas etapas de prévia, resultado e incerto ele não acrescenta nada e tira espaço do que
   * importa: quem chegou à prévia já calculou (a loja respondeu), e quem está no resultado já
   * criou. O aviso existe para chegar ANTES do trabalho perdido — depois dele é só ruído.
   */
  const mostrarAvisoErp =
    Boolean(avisoErp) && carregado && (etapa === ETAPA.FORM || etapa === ETAPA.AMBIGUIDADE);

  const descricaoItemAmbiguo = useMemo(() => {
    if (ambiguidade?.status !== STATUS_AMBIGUIDADE.PRODUTO) return "";
    const idx = ambiguidade?.indice_item;
    const item = Array.isArray(rascunho?.itens) ? rascunho.itens[idx] : null;
    return item?.descricao || item?.busca || "";
  }, [ambiguidade, rascunho]);

  if (!open) return null;

  return createPortal(
    <div
      className="wa-modalOverlay wa-orcOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Novo orçamento"
      onMouseDown={onClose}
    >
      <aside className="wa-orcDrawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wa-orcDrawer-head">
          <div>
            <h3 className="wa-orcDrawer-title">Novo orçamento</h3>
            <p className="wa-orcDrawer-subtitle">
              Pesquise cliente, vendedor e produtos por nome. Os valores são do sistema da empresa.
            </p>
          </div>
          <button type="button" className="wa-iconBtn" onClick={onClose} title="Fechar">
            ✕
          </button>
        </div>

        {/*
          Faixa de indisponibilidade do ERP. Fica FORA do corpo rolável, logo abaixo do
          cabeçalho: dentro do scroll ela sairia de vista depois de dois produtos adicionados, e
          é justamente a pessoa que está montando a cesta que precisa continuar vendo o aviso.

          `role="status"` (e não `alert`): a notícia chega sozinha, segundos depois da abertura, e
          interromper quem está digitando o nome do cliente com um anúncio assertivo atrapalharia
          a tarefa que o próprio aviso diz que ainda pode ser feita.
        */}
        {mostrarAvisoErp ? (
          <div className="wa-orc-erpAviso" role="status">
            <TriangleAlert className="wa-orc-erpAviso-icone" size={18} strokeWidth={2.25} aria-hidden="true" />
            <div className="wa-orc-erpAviso-texto">
              <strong className="wa-orc-erpAviso-titulo">{avisoErp.titulo}</strong>
              <span>{avisoErp.explicacao}</span>
              <span className="wa-orc-erpAviso-acao">{avisoErp.recuperacao}</span>
            </div>
            {/*
              Sem botão quando resondar não pode mudar nada (`nao_configurado`): até alguém
              configurar a integração, o veredito é o mesmo, e um botão que só gira ensina a
              atendente a não confiar nos botões desta tela.
            */}
            {avisoErp.oferecerVerificar ? (
              <button
                type="button"
                className="wa-btn wa-btn-ghost wa-orc-btnSm wa-orc-erpAviso-btn"
                disabled={verificandoErp}
                onClick={() => void sondarErp()}
              >
                {verificandoErp ? "Verificando…" : "Verificar de novo"}
              </button>
            ) : null}
          </div>
        ) : null}

        {!carregado ? (
          <div className="wa-orc-body">
            <p className="wa-orc-hint">Abrindo…</p>
          </div>
        ) : etapa === ETAPA.AMBIGUIDADE ? (
          <AmbiguidadePicker
            ambiguidade={ambiguidade}
            onEscolher={escolherCandidato}
            onTrocarPagina={trocarPaginaAmbiguidade}
            onCancelar={voltarAoFormulario}
            ocupado={calculando}
            itemDescricao={descricaoItemAmbiguo}
          />
        ) : etapa === ETAPA.INCERTO ? (
          /*
            Tela terminal do incerto. Um único botão, e ele fecha — não existe aqui nenhum
            caminho que crie outro orçamento, porque este pode já ter sido criado.
          */
          <>
            <div className="wa-orc-body">
              <section className="wa-orc-section" aria-label="Resultado não confirmado">
                <div className="wa-orc-alert wa-orc-alert--aviso" role="alert">
                  <span>{mensagemIncerto || MENSAGEM_INCERTO}</span>
                </div>
                <p className="wa-orc-hint">
                  O suporte consegue conferir no sistema da empresa se este orçamento foi
                  gravado. Enquanto isso, não monte o mesmo orçamento de novo.
                </p>
              </section>
            </div>
            <footer className="wa-orc-foot wa-orc-foot--unico">
              <button
                type="button"
                className="wa-btn wa-btn-primary wa-orc-btnPrincipal"
                onClick={onClose}
              >
                Fechar
              </button>
            </footer>
          </>
        ) : etapa === ETAPA.RESULTADO ? (
          <OrcamentoResultado
            resultado={resultadoOperacao?.resultado}
            previa={resultadoOperacao?.previa}
            jaEstavaCriado={resultadoOperacao?.jaEstavaCriado === true}
            onEnviarAoCliente={typeof onEnviarAoCliente === "function" ? enviarAoCliente : undefined}
            onFechar={onClose}
          />
        ) : etapa === ETAPA.PREVIA ? (
          <OrcamentoPreview
            preparacao={preparacao}
            onVoltar={voltarAoFormulario}
            previaDesatualizada={previaDesatualizada}
            onConfirmar={confirmar}
            confirmando={confirmando}
            erro={erro}
          />
        ) : (
          <OrcamentoForm
            rascunho={rascunho}
            onPatch={patch}
            onCalcular={calcular}
            calculando={calculando}
            erro={erro}
            avisoCampo={avisoCampo}
            dicaCliente={dicaCliente}
            produtoFocusRef={produtoFocusRef}
            precos={precos}
            onProdutoEscolhido={consultarPrecoDoItem}
            companyId={companyId}
            userId={userId}
            onLimpar={limparTudo}
          />
        )}

      </aside>
    </div>,
    document.body
  );
}
