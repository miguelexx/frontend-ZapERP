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
 * O QUE ESTE DRAWER NÃO FAZ
 * ────────────────────────────────────────────────────────────────────────────
 * Não escuta Socket.IO (o MVP é request/response + leitura de estado após F5, por custo), não
 * toca no scroll/teclado da conversa, não mexe no composer e não envia mensagem.
 *
 * O **despacho** da criação é Sessão 6 e ainda não existe. A tela de revisão
 * (`OrcamentoPreview`) e a de sucesso (`OrcamentoResultado`) estão implementadas contra o shape
 * real do backend, e o botão "Confirmar e criar no ERP" aparece desabilitado com frase honesta
 * enquanto `onConfirmar` não for passado — ver o comentário no ponto de ligação, no JSX.
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
import { prepararOrcamento, extrairErroOrcamento } from "../../api/wmOrcamentosService";
import useOrcamentoDraft from "./useOrcamentoDraft";
import { normalizarQuantidadeParaEnvio } from "./orcamentoFormat";
import { assinaturaDoBody, assinaturaDoRascunho } from "./orcamentoViewModel";
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
  /** Sessão 6: só é alcançada depois que o despacho da criação existir (ver `confirmar`). */
  RESULTADO: "resultado",
});

/** Frase única para resposta que não bate com nenhum status conhecido. */
const MENSAGEM_RESPOSTA_ESTRANHA =
  "Não foi possível calcular o orçamento agora. Tente de novo em instantes.";

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
  vendedorNomeSugerido = "",
}) {
  const [etapa, setEtapa] = useState(ETAPA.FORM);
  const [ambiguidade, setAmbiguidade] = useState(null);
  const [preparacao, setPreparacao] = useState(null);
  /**
   * Sessão 6. `{ resultado, jaEstavaCriado }` — e `jaEstavaCriado` sai do NOSSO estado da
   * operação antes da chamada, nunca da resposta da WM (§11.1 proíbe inferir pela resposta).
   */
  const [resultadoOperacao, setResultadoOperacao] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState("");
  const [avisoCampo, setAvisoCampo] = useState("");

  const abortRef = useRef(null);
  const produtoFocusRef = useRef(null);

  const { rascunho, patch, limpar, carregado } = useOrcamentoDraft({
    companyId,
    userId,
    conversaId,
    ativo: open,
    clienteNomeSugerido,
    vendedorNomeSugerido,
  });

  // Trocar de conversa com o drawer aberto reinicia o fluxo: a preparação do servidor está
  // amarrada a uma conversa, e reaproveitá-la em outra seria orçar para o cliente errado.
  useEffect(() => {
    setEtapa(ETAPA.FORM);
    setAmbiguidade(null);
    setPreparacao(null);
    setResultadoOperacao(null);
    setErro("");
    setAvisoCampo("");
  }, [conversaId, open]);

  useEffect(
    () => () => {
      try {
        abortRef.current?.abort();
      } catch {
        /* ignore */
      }
    },
    []
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
      const { mensagem, cancelado, campo } = extrairErroOrcamento(err);
      if (cancelado) return;
      setEtapa(ETAPA.FORM);
      setErro(mensagem);
      if (campo) setAvisoCampo("Revise os dados informados e calcule de novo.");
    } finally {
      setCalculando(false);
    }
  }, [companyId, userId, patch]);

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

  const descricaoItemAmbiguo = useMemo(() => {
    if (ambiguidade?.status !== STATUS_AMBIGUIDADE.PRODUTO) return "";
    const idx = ambiguidade?.indice_item;
    const item = Array.isArray(rascunho?.itens) ? rascunho.itens[idx] : null;
    return item?.descricao || item?.busca || "";
  }, [ambiguidade, rascunho]);

  if (!open) return null;

  return createPortal(
    <div
      className="wa-modalOverlay"
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
        ) : etapa === ETAPA.RESULTADO ? (
          <OrcamentoResultado
            resultado={resultadoOperacao?.resultado}
            jaEstavaCriado={resultadoOperacao?.jaEstavaCriado === true}
            onFechar={onClose}
            /*
              Sessão 6 liga `onEnviarAoCliente={(texto) => ...}` ao envio normal da conversa
              (composer com texto revisável). Sem ele o botão fica desabilitado e a tela oferece
              "Copiar resumo" — nunca envia nada sozinha.
            */
          />
        ) : etapa === ETAPA.PREVIA ? (
          <OrcamentoPreview
            preparacao={preparacao}
            onVoltar={voltarAoFormulario}
            previaDesatualizada={previaDesatualizada}
            /*
              ────────────────────────────────────────────────────────────────────────
              AQUI É O PONTO DE LIGAÇÃO DA SESSÃO 6
              ────────────────────────────────────────────────────────────────────────
              Falta passar `onConfirmar` e `confirmando`. O que a Sessão 6 tem de fazer:

                1. `onConfirmar`: ler se a operação JÁ ESTAVA `CRIADO` (estado local, antes da
                   chamada) e então `await confirmarOrcamento(preparacao.preparacao_id)`;
                2. com o `resultado` sanitizado da resposta:
                   `setResultadoOperacao({ resultado, jaEstavaCriado })` e
                   `setEtapa(ETAPA.RESULTADO)`;
                3. `confirmando`: o booleano do envio em curso — o botão já se desabilita e não
                   muda de posição com ele;
                4. erro: `extrairErroOrcamento(err)` e `setErro(mensagem)`, como em `preparar`.
                   `RESULTADO_INCERTO` não vira "falhou": é "não crie outro".

              Enquanto `onConfirmar` não vier, o botão aparece desabilitado com frase honesta
              (ver `OrcamentoPreview`), e NÃO se chama `verificarOrcamento` em laço nem em
              `useEffect` — verificar duplica orçamento se feito com UUID novo.
            */
          />
        ) : (
          <OrcamentoForm
            rascunho={rascunho}
            onPatch={patch}
            onCalcular={calcular}
            calculando={calculando}
            erro={erro}
            avisoCampo={avisoCampo}
            produtoFocusRef={produtoFocusRef}
          />
        )}

        {etapa === ETAPA.FORM && !calculando ? (
          <div className="wa-orc-rodapeSecundario">
            <button type="button" className="wa-btn wa-btn-ghost wa-orc-btnSm" onClick={limpar}>
              Limpar rascunho
            </button>
          </div>
        ) : null}
      </aside>
    </div>,
    document.body
  );
}
