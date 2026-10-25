/**
 * Cliente das rotas locais do orçamento manual × API WM (ERP Icthus).
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (seção 5 — contrato local;
 * seção 3, lacuna 1 — o toast global).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE TODA CHAMADA AQUI SILENCIA O INTERCEPTOR GLOBAL
 * ────────────────────────────────────────────────────────────────────────────
 * O interceptor de `api/http.js` mostra toast para TODO 5xx ("Erro no servidor"), para 429
 * ("Muitas requisições") e para timeout ("Demora na resposta"). O plano proíbe mensagem
 * técnica na tela do orçamento, e um toast genérico sobre o drawer é pior que inútil: o
 * backend já devolve um envelope pensado para o usuário final
 * (`{ ok:false, codigo, mensagem, estado, requestId }`), com a `mensagem` em português comum.
 * Dois avisos simultâneos — um genérico do interceptor e um específico do drawer — fazem o
 * atendente acreditar que houve dois problemas.
 *
 * Então cada request leva:
 *   · `skipGlobal500Toast`, `skipGlobalNetworkToast`, `skipGlobal403Toast` — os três flags que
 *     o interceptor consulta nominalmente;
 *   · `silent: true` — porque o toast de **429 não tem flag própria** no interceptor, e
 *     `silent` é o único curto-circuito que o cobre. Os três flags ficam explícitos mesmo
 *     assim: eles documentam a intenção e continuam valendo se a semântica de `silent` mudar.
 *
 * `silent` NÃO afeta o 401: o logout automático é tratado antes, e nós não o desabilitamos —
 * token expirado tem de deslogar normalmente. (O 401 da WM nunca chega aqui como 401: o
 * backend o mapeia para 503 com código de domínio, justamente para não deslogar o atendente.)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE NUNCA PODE APARECER NA TELA
 * ────────────────────────────────────────────────────────────────────────────
 * Status HTTP (400/409/502/504), código interno, `comando_id`, `RESULTADO_INCERTO`, `requestId`
 * ou stack. `extrairErroOrcamento` existe para garantir isso num lugar só: ela devolve a
 * `mensagem` humana do envelope e, quando não há envelope (rede caiu, proxy no meio, HTML de
 * erro), uma frase própria — nunca `err.message`, que é texto de biblioteca.
 *
 * O `codigo` volta junto, mas é para a LÓGICA da tela decidir o que oferecer (recalcular,
 * reabrir, procurar o suporte). Não é para exibir.
 */

import api from "./http";
import { resolveOrcamentoTimeoutMs } from "./httpTimeouts";

/** Prefixo único. Mudar aqui exige mexer em `resolveOrcamentoTimeoutMs`. */
const BASE = "/api/orcamentos";

/**
 * Config comum. `silent` + os três flags nominais (ver cabeçalho).
 * O timeout é resolvido pela URL em `httpTimeouts.js` e passado explicitamente porque o
 * `axios.create` já aplica 55 s por padrão — sem isto, o interceptor de request não chamaria
 * `resolveRequestTimeoutMs` e o `confirmar` abortaria antes do backend normalizar o estado.
 */
function configFor(url, extra = {}) {
  const timeout = resolveOrcamentoTimeoutMs(url);
  return {
    skipGlobal500Toast: true,
    skipGlobalNetworkToast: true,
    skipGlobal403Toast: true,
    silent: true,
    ...(timeout > 0 ? { timeout } : {}),
    ...extra,
  };
}

/* ------------------------------------------------------------------ *
 * Erros — um lugar só, para nenhuma tela improvisar texto
 * ------------------------------------------------------------------ */

/** Códigos locais do backend que a tela usa para decidir a próxima ação. */
export const ORCAMENTO_CODIGOS = Object.freeze({
  DADOS_INVALIDOS: "ORCAMENTO_DADOS_INVALIDOS",
  CONVERSA_NEGADA: "ORCAMENTO_CONVERSA_NEGADA",
  CONVERSA_NAO_INDIVIDUAL: "ORCAMENTO_CONVERSA_NAO_INDIVIDUAL",
  PREPARACAO_NAO_ENCONTRADA: "ORCAMENTO_PREPARACAO_NAO_ENCONTRADA",
  PREPARACAO_EXPIRADA: "ORCAMENTO_PREPARACAO_EXPIRADA",
  JA_CRIADO: "ORCAMENTO_JA_CRIADO",
  EM_ANDAMENTO: "ORCAMENTO_EM_ANDAMENTO",
  MODULO_DESLIGADO: "ORCAMENTO_WM_OFF",
  /** Só nosso: a requisição não chegou a ter resposta com envelope. */
  SEM_RESPOSTA: "ORCAMENTO_SEM_RESPOSTA_LOCAL",
  CANCELADO: "ORCAMENTO_CANCELADO_LOCAL",
});

/** Frases de último recurso. Nenhuma menciona status, código ou detalhe de transporte. */
const MENSAGEM_SEM_ENVELOPE = "Não foi possível falar com o sistema agora. Tente de novo em instantes.";
const MENSAGEM_DEMORA = "O sistema demorou demais para responder. Tente de novo em instantes.";
const MENSAGEM_SEM_PERMISSAO = "Você não tem permissão para usar o orçamento nesta empresa.";

function ehCancelamento(err) {
  return (
    err?.code === "ERR_CANCELED" ||
    err?.name === "CanceledError" ||
    err?.name === "AbortError" ||
    err?.message === "canceled"
  );
}

function ehTimeout(err) {
  return (
    err?.code === "ECONNABORTED" ||
    err?.code === "ETIMEDOUT" ||
    /timeout/i.test(String(err?.message || ""))
  );
}

function textoUtil(valor) {
  if (typeof valor !== "string") return "";
  const s = valor.trim();
  if (!s) return "";
  // Defesa contra envelope quebrado: nada de HTML, stack ou JSON cru na tela.
  if (s.length > 300) return "";
  if (/[<>{}]|\bat \w+\./.test(s)) return "";
  return s;
}

/**
 * Traduz qualquer falha numa forma exibível.
 *
 * @returns {{ codigo: string, mensagem: string, estado: string|null, campo: string|null,
 *            cancelado: boolean }}
 */
export function extrairErroOrcamento(err) {
  if (ehCancelamento(err)) {
    return { codigo: ORCAMENTO_CODIGOS.CANCELADO, mensagem: "", estado: null, campo: null, cancelado: true };
  }

  const envelope = err?.response?.data;
  const mensagem = textoUtil(envelope?.mensagem);
  if (mensagem) {
    return {
      codigo: textoUtil(envelope?.codigo) || ORCAMENTO_CODIGOS.SEM_RESPOSTA,
      mensagem,
      estado: textoUtil(envelope?.estado) || null,
      campo: textoUtil(envelope?.campo) || null,
      cancelado: false,
    };
  }

  // Sem envelope: 403 do gate de módulo/permissão responde `{ error }`, e o resto é transporte.
  const status = err?.response?.status;
  if (status === 403) {
    return {
      codigo: ORCAMENTO_CODIGOS.MODULO_DESLIGADO,
      mensagem: MENSAGEM_SEM_PERMISSAO,
      estado: "FALHA_SEGURA",
      campo: null,
      cancelado: false,
    };
  }
  return {
    codigo: ORCAMENTO_CODIGOS.SEM_RESPOSTA,
    mensagem: ehTimeout(err) ? MENSAGEM_DEMORA : MENSAGEM_SEM_ENVELOPE,
    estado: null,
    campo: null,
    cancelado: false,
  };
}

/* ------------------------------------------------------------------ *
 * Rotas
 * ------------------------------------------------------------------ */

/**
 * `POST /api/orcamentos/produtos/consultar` — candidatos para o picker.
 *
 * `busca` XOR `codigo_produto_erp`; o backend recusa os dois juntos, nenhum dos dois, chave
 * desconhecida e qualquer identidade (`telefone`, `company_id`, `token`…). `pagina` só é
 * enviada quando informada: `tamanho_pagina` é fixo na WM e `limite` é obsoleto.
 *
 * A resposta traz `produtos[]` com apenas `codigo_produto_erp`, `descricao`, `marca` e
 * `unidade` — **sem preço e sem estoque**, e os candidatos vêm do cache cloud da WM
 * (`candidatos_origem: "cache_cloud"`). Quem exibir isto não pode rotular como "atual".
 *
 * @param {{busca?: string, codigo_produto_erp?: string, pagina?: number,
 *          signal?: AbortSignal}} params
 */
export async function consultarProdutosOrcamento({ busca, codigo_produto_erp, pagina, signal } = {}) {
  const url = `${BASE}/produtos/consultar`;
  const body = {};
  if (codigo_produto_erp != null && String(codigo_produto_erp).length > 0) {
    body.codigo_produto_erp = String(codigo_produto_erp);
  } else {
    body.busca = String(busca ?? "");
  }
  if (Number.isInteger(pagina) && pagina >= 1) body.pagina = pagina;

  const { data } = await api.post(url, body, configFor(url, signal ? { signal } : {}));
  return data;
}

/**
 * `POST /api/orcamentos/clientes/consultar` — auxílio para achar o cliente no ERP.
 *
 * `busca` XOR `codigo_cliente_erp`, mais `pagina` opcional. O backend apara as bordas do termo
 * (a busca do ERP é por PREFIXO: um espaço à esquerda garante zero resultado) e recusa chave
 * desconhecida e qualquer identidade no corpo.
 *
 * ESTA ROTA NÃO DECIDE O CLIENTE DO ORÇAMENTO, e a resposta diz isso em
 * `resolucao_definitiva: false`. Ela não aplica os filtros Inativo/Bloqueado e `preparar`
 * aplica (D11), então um cliente achado aqui ainda pode ser recusado no Calcular com
 * `CLIENTE_INVALIDO`. Quem exibe a lista tem de refletir isso.
 *
 * É REALTIME: fala com o sincronizador na máquina da loja e devolve `WM_SINCRONIZADOR_OFFLINE`
 * quando ele está fora do ar — enquanto a busca de produto, servida do acervo da WM, continua
 * respondendo. Indisponibilidade não é lista vazia (ver `traduzirErroBuscaCliente`).
 *
 * Resposta: `{ status: "multiplos_clientes", candidatos[], paginacao }` ou
 * `{ status: "cliente", cliente }`. Cada candidato traz `codigo_cliente_erp`, `nome`, `cpf`,
 * `cnpj` e `inscricao_estadual` — os documentos existem para distinguir homônimos.
 *
 * @param {{busca?: string, codigo_cliente_erp?: string, pagina?: number,
 *          signal?: AbortSignal}} params
 */
export async function consultarClientesOrcamento({ busca, codigo_cliente_erp, pagina, signal } = {}) {
  const url = `${BASE}/clientes/consultar`;
  const body = {};
  if (codigo_cliente_erp != null && String(codigo_cliente_erp).length > 0) {
    body.codigo_cliente_erp = String(codigo_cliente_erp);
  } else {
    body.busca = String(busca ?? "");
  }
  if (Number.isInteger(pagina) && pagina >= 1) body.pagina = pagina;

  const { data } = await api.post(url, body, configFor(url, signal ? { signal } : {}));
  return data;
}

/**
 * `POST /api/orcamentos/preparar` — resolve cliente, vendedor e itens e devolve OU a próxima
 * ambiguidade OU a preparação pronta.
 *
 * A WM reporta **uma ambiguidade por vez** (`dados.status` é um valor único): resolve-se uma,
 * reprepara-se, pode vir a próxima. O rascunho volta intacto na resposta de ambiguidade — é
 * ele que se reenvia com a escolha ou com a página seguinte, e a tela não reconstrói estado
 * de negócio por conta própria.
 *
 * `quantidade` vai como **string decimal** (`"1"`, `"1.500"`), sempre. Quem monta o rascunho
 * é responsável pelo `trim()`: o validador do backend recusa `" 2 "` por formato, de propósito.
 *
 * @param {object} rascunho `{ conversa_id, cliente_busca|cliente_codigo_erp,
 *   vendedor_busca|vendedor_codigo_erp, itens:[{busca|codigo_produto_erp, quantidade}],
 *   cliente_pagina?, vendedor_pagina?, itens[].produto_pagina? }`
 */
export async function prepararOrcamento(rascunho, { signal } = {}) {
  const url = `${BASE}/preparar`;
  const { data } = await api.post(url, rascunho, configFor(url, signal ? { signal } : {}));
  return data;
}

/**
 * `POST /api/orcamentos/:preparacaoId/confirmar` — corpo VAZIO, e isso é essencial.
 *
 * Preço e códigos canônicos vivem no snapshot server-side; se viessem daqui, dariam para
 * adulterar no DevTools. O backend recusa nominalmente `preco_confirmado` e `comando_id`.
 *
 * **Esta chamada CRIA o orçamento no ERP.** Ela é o único ponto do frontend que escreve em
 * sistema de terceiro, e por isso não é chamada em `useEffect`, não é repetida por timer e não
 * entra em nenhum retry: um `comando_id` novo significaria um segundo orçamento. Chamá-la de
 * novo para a MESMA preparação é seguro (o servidor devolve o estado em vez de redespachar),
 * mas quem recebe `estado: "INCERTO"` não deve oferecer "tentar de novo" ao usuário.
 *
 * Sucesso devolve `{ estado: "CRIADO", resultado: {...}, despachado: true, ja_criado }`, onde
 * `ja_criado` é a afirmação do SERVIDOR sobre o estado anterior da operação — a resposta da WM
 * não distingue "criado agora" de "resultado idempotente" (§11.1), e nada aqui tenta inferir.
 */
export async function confirmarOrcamento(preparacaoId) {
  const url = `${BASE}/${encodeURIComponent(preparacaoId)}/confirmar`;
  const { data } = await api.post(url, {}, configFor(url));
  return data;
}

/**
 * `POST /api/orcamentos/:operacaoId/verificar` — corpo VAZIO.
 *
 * Verificar é reenviar o payload byte a byte idêntico com o MESMO `comando_id`. Só por ação
 * explícita do usuário: **nunca** automático, **nunca** em laço, **nunca** com UUID novo (isso
 * duplicaria orçamento no ERP). Nenhuma tela deve chamar isto num `useEffect` nem num retry.
 *
 * Hoje **nenhuma tela do atendente chama esta função**: reconciliar um incerto é operação de
 * suporte (runbook da Sessão 6 no doc 36). O cliente HTTP existe para quando houver uma tela
 * de suporte; a do atendente trava e manda procurar ajuda, justamente para que ninguém
 * transforme um incerto num segundo orçamento por impaciência.
 */
export async function verificarOrcamento(operacaoId) {
  const url = `${BASE}/${encodeURIComponent(operacaoId)}/verificar`;
  const { data } = await api.post(url, {}, configFor(url));
  return data;
}

/**
 * `GET /api/orcamentos/:operacaoId` — estado da operação da própria empresa.
 * É como a tela se recupera de um F5 no meio do caminho (o MVP é request/response + leitura
 * de estado; não há listener de Socket.IO neste módulo, por decisão de custo).
 */
export async function obterOrcamento(operacaoId) {
  const url = `${BASE}/${encodeURIComponent(operacaoId)}`;
  const { data } = await api.get(url, configFor(url));
  return data;
}

export default {
  consultarProdutosOrcamento,
  consultarClientesOrcamento,
  prepararOrcamento,
  confirmarOrcamento,
  verificarOrcamento,
  obterOrcamento,
  extrairErroOrcamento,
  ORCAMENTO_CODIGOS,
};
