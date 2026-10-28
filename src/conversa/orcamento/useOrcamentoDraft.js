/**
 * Rascunho do orçamento em `sessionStorage`.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (Sessão 5 — "o rascunho
 * sobrevive a erro e a fechamento acidental").
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ENTRA E, SOBRETUDO, O QUE NÃO ENTRA
 * ────────────────────────────────────────────────────────────────────────────
 * Entra só a ESCOLHA do atendente: o texto que ele digitou para cliente e vendedor, o código
 * ERP que ele selecionou numa ambiguidade, os itens com descrição e quantidade.
 *
 * Não entra, nunca:
 *   · token, telefone (nem o da conversa, nem o autorizado da integração);
 *   · preço, subtotal ou total — preço oficial é do snapshot server-side e tem validade curta.
 *     Um preço guardado aqui voltaria "vivo" depois de expirar e alguém o leria como atual;
 *   · `preparacao_id`, `comando_id` ou qualquer estado de operação. Preparação expira em
 *     minutos no servidor; ressuscitar um id daqui só produziria erro confuso. Depois de um
 *     F5, a tela volta ao formulário e recalcula — é mais lento e é correto;
 *   · CPF/CNPJ/IE de candidatos. Eles vão à tela para distinguir homônimos e param ali (o
 *     backend também não os persiste).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESCOPO DA CHAVE E LIMPEZA
 * ────────────────────────────────────────────────────────────────────────────
 * A chave é `empresa + usuário + conversa`. Com isso, trocar de usuário no mesmo navegador
 * nunca lê o rascunho de outro — não por política, por construção: a chave não bate.
 *
 * Como reforço, toda montagem faz uma varredura que remove as chaves deste módulo que (a) são
 * de outro escopo de empresa+usuário ou (b) passaram do prazo. Isso cobre o logout e a sessão
 * que caiu por 401 sem o drawer saber, já que `sessionStorage` sobrevive ao `location.href`
 * do logout. (O gancho explícito em `authStore.clearSession` ficaria melhor ainda, mas
 * `authStore.js` não é ponto de registro desta sessão — fica anotado no relato.)
 *
 * Prazo curto de propósito: um rascunho de ontem tem preço e estoque de ontem na cabeça de
 * quem o abandonou.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TODA LEITURA E ESCRITA EM try/catch
 * ────────────────────────────────────────────────────────────────────────────
 * Em janela privada, com storage bloqueado por política, ou com a cota cheia, o simples
 * ACESSO a `sessionStorage` lança. O orçamento não pode ficar inutilizável por causa do
 * rascunho: qualquer falha aqui é silenciosa e o módulo segue funcionando sem persistência.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sugestaoDeBuscaCliente } from "./orcamentoFormat.js";
import { lerVendedorLembrado } from "./vendedorLembrado.js";

const PREFIXO = "zap_orc_draft";
/** 45 min: mais que um atendimento interrompido, menos que um turno. */
export const RASCUNHO_TTL_MS = 45 * 60 * 1000;
/** Teto defensivo de tamanho (itens são poucos; isto só barra corrupção). */
const MAX_BYTES = 24 * 1024;
const MAX_ITENS = 50;

/** `null` quando não há como escrever (SSR, storage bloqueado). */
function storage() {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

/** Pedaço de chave seguro: sem `:` para não embaralhar o escopo. */
function parte(valor) {
  return String(valor ?? "").replace(/[^A-Za-z0-9_-]/g, "") || "0";
}

export function escopoRascunho({ companyId, userId }) {
  return `${parte(companyId)}:${parte(userId)}`;
}

export function chaveRascunho({ companyId, userId, conversaId }) {
  return `${PREFIXO}:${escopoRascunho({ companyId, userId })}:${parte(conversaId)}`;
}

/**
 * Remove chaves deste módulo fora do escopo atual ou vencidas.
 * @returns {number} quantas removeu (usado em teste)
 */
export function limparRascunhosForaDeEscopo({ companyId, userId, agora = Date.now() } = {}) {
  const s = storage();
  if (!s) return 0;
  const prefixoEscopo = `${PREFIXO}:${escopoRascunho({ companyId, userId })}:`;
  let removidas = 0;
  try {
    const chaves = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (typeof k === "string" && k.startsWith(`${PREFIXO}:`)) chaves.push(k);
    }
    for (const k of chaves) {
      let remover = !k.startsWith(prefixoEscopo);
      if (!remover) {
        try {
          const salvo = JSON.parse(s.getItem(k) || "null");
          remover = !salvo || !(Number(salvo.expiraEm) > agora);
        } catch {
          remover = true;
        }
      }
      if (remover) {
        try {
          s.removeItem(k);
          removidas += 1;
        } catch {
          /* storage pode recusar a escrita; segue */
        }
      }
    }
  } catch {
    /* enumerar o storage pode lançar; a limpeza é best-effort */
  }
  return removidas;
}

export const RASCUNHO_VAZIO = Object.freeze({
  clienteBusca: "",
  clienteCodigoErp: "",
  clienteNome: "",
  vendedorBusca: "",
  vendedorCodigoErp: "",
  vendedorNome: "",
  /**
   * `true` enquanto o vendedor do rascunho vier da MEMÓRIA do usuário e ainda não tiver sido
   * confirmado pela WM nesta preparação. Existe para a tela não pintar uma lembrança com a
   * mesma cara de um vendedor que a WM acabou de resolver — a diferença é exatamente a que o
   * doc 36 §6.2 preserva, porque vendedor mexe com comissão.
   *
   * Vive no rascunho (e não só no componente) para sobreviver ao F5: depois de recarregar, o
   * código voltaria do storage e, sem esta marca, apareceria como confirmado.
   */
  vendedorDeMemoria: false,
  itens: [],
});

/**
 * Pré-preenchimento de um rascunho NOVO (não há nada salvo para esta conversa).
 *
 * Função pura e exportada porque é aqui que mora a decisão delicada: o vendedor lembrado entra
 * como código **marcado como memória**, e nunca como seleção canônica. A WM revalida esse
 * código em `preparar` e pode recusá-lo; até lá ele é palpite informado, não fato.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O `user.nome` DO ZapERP NÃO ENTRA AQUI — MEDIDO CONTRA O ERP REAL
 * ────────────────────────────────────────────────────────────────────────────
 * Até a Sessão 6 este campo nascia com o nome do usuário logado como texto de busca. A
 * conferência contra o Icthus da empresa piloto derrubou a ideia: os vendedores cadastrados
 * são `FINANCEIRO`, `MARKONY`, `RAFAEL LUIZ SILVA`, `ROBSON DO NASCIMENTO LOURES` e `SAMUEL`
 * (`total: 5`, sem outras páginas) — nome de atendente não está entre eles. O palpite,
 * portanto, não era neutro: ele garantia um `VENDEDOR_NAO_ENCONTRADO` na primeira tentativa de
 * todo atendente novo, gastando uma chamada e começando o fluxo com um erro.
 *
 * O que ficou é a parte que funciona: a memória do último vendedor que a WM **confirmou**
 * (`vendedorLembrado.js`). Sem memória, o campo nasce vazio — e vazio é honesto.
 *
 * @param {{clienteNomeSugerido?: string,
 *          vendedorLembrado?: {codigo: string, nome: string}|null}} args
 */
export function prefillRascunho({
  clienteNomeSugerido = "",
  vendedorLembrado = null,
} = {}) {
  const prefill = {
    ...RASCUNHO_VAZIO,
    // Título que é só telefone não vira sugestão: a busca da WM é por nome (ver
    // `sugestaoDeBuscaCliente`).
    clienteBusca: sugestaoDeBuscaCliente(clienteNomeSugerido),
  };

  const codigo = typeof vendedorLembrado?.codigo === "string" ? vendedorLembrado.codigo.trim() : "";
  if (codigo) {
    prefill.vendedorCodigoErp = codigo;
    prefill.vendedorNome = typeof vendedorLembrado?.nome === "string" ? vendedorLembrado.nome : "";
    prefill.vendedorDeMemoria = true;
    return prefill;
  }

  // Sem memória confirmada pela WM, o campo nasce vazio (ver o cabeçalho desta função).
  return prefill;
}

/** Decimal da WM (ponto, sem sinal), para o preço negociado persistido. */
const PADRAO_DECIMAL_DRAFT = /^\d+(?:\.\d+)?$/;

/**
 * Item do carrinho: identidade do produto, quantidade e o preço NEGOCIADO pelo atendente.
 *
 * Preço CONSULTADO (o oficial do cadastro) continua fora daqui de propósito — um valor velho
 * voltando do storage pareceria atual. O `preco_negociado` é DIFERENTE: é escolha do atendente
 * (um desconto), não uma leitura do ERP, então sobreviver ao F5 é o comportamento certo. Entra só
 * quando é decimal > 0; qualquer outra coisa é descartada (a linha volta ao preço oficial).
 */
function sanearItem(bruto) {
  if (!bruto || typeof bruto !== "object") return null;
  const codigo = typeof bruto.codigo_produto_erp === "string" ? bruto.codigo_produto_erp.trim() : "";
  const busca = typeof bruto.busca === "string" ? bruto.busca.trim() : "";
  if (!codigo && !busca) return null;
  const quantidade = typeof bruto.quantidade === "string" ? bruto.quantidade.trim() : "1";
  const item = {
    codigo_produto_erp: codigo.slice(0, 7),
    busca: codigo ? "" : busca.slice(0, 100),
    descricao: typeof bruto.descricao === "string" ? bruto.descricao.slice(0, 200) : "",
    unidade: typeof bruto.unidade === "string" ? bruto.unidade.slice(0, 20) : "",
    marca: typeof bruto.marca === "string" ? bruto.marca.slice(0, 80) : "",
    quantidade: quantidade || "1",
  };
  const pn = typeof bruto.preco_negociado === "string" ? bruto.preco_negociado.trim() : "";
  if (pn && pn.length <= 20 && PADRAO_DECIMAL_DRAFT.test(pn) && /[1-9]/.test(pn)) {
    item.preco_negociado = pn;
  }
  return item;
}

/**
 * Lista branca na leitura: o que não está aqui não volta do storage, mesmo que alguém tenha
 * escrito na chave. É o que impede um rascunho adulterado de injetar preço ou id de operação.
 */
function sanearRascunho(bruto) {
  if (!bruto || typeof bruto !== "object") return { ...RASCUNHO_VAZIO };
  const texto = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  const itens = Array.isArray(bruto.itens)
    ? bruto.itens.map(sanearItem).filter(Boolean).slice(0, MAX_ITENS)
    : [];
  return {
    clienteBusca: texto(bruto.clienteBusca, 100),
    clienteCodigoErp: texto(bruto.clienteCodigoErp, 20).trim(),
    clienteNome: texto(bruto.clienteNome, 200),
    vendedorBusca: texto(bruto.vendedorBusca, 100),
    vendedorCodigoErp: texto(bruto.vendedorCodigoErp, 20).trim(),
    vendedorNome: texto(bruto.vendedorNome, 200),
    // Só `true` literal passa. Ausente vira `false`, e isso está certo para o rascunho escrito
    // pela versão anterior deste módulo: lá o código de vendedor só podia vir de uma escolha de
    // ambiguidade, ou seja, já era confirmado pela WM.
    vendedorDeMemoria: bruto.vendedorDeMemoria === true,
    itens,
  };
}

/** Rascunho "em branco" não merece uma chave no storage. */
function temConteudo(r) {
  if (!r) return false;
  return Boolean(
    r.clienteBusca?.trim() ||
      r.clienteCodigoErp ||
      r.vendedorBusca?.trim() ||
      r.vendedorCodigoErp ||
      (Array.isArray(r.itens) && r.itens.length > 0)
  );
}

export function lerRascunho(chave, { agora = Date.now() } = {}) {
  const s = storage();
  if (!s || !chave) return null;
  try {
    const raw = s.getItem(chave);
    if (!raw || raw.length > MAX_BYTES) return null;
    const salvo = JSON.parse(raw);
    if (!salvo || typeof salvo !== "object") return null;
    if (!(Number(salvo.expiraEm) > agora)) {
      try {
        s.removeItem(chave);
      } catch {
        /* ignore */
      }
      return null;
    }
    return sanearRascunho(salvo.rascunho);
  } catch {
    return null;
  }
}

export function gravarRascunho(chave, rascunho, { agora = Date.now() } = {}) {
  const s = storage();
  if (!s || !chave) return false;
  try {
    if (!temConteudo(rascunho)) {
      s.removeItem(chave);
      return true;
    }
    const corpo = JSON.stringify({
      v: 1,
      expiraEm: agora + RASCUNHO_TTL_MS,
      rascunho: sanearRascunho(rascunho),
    });
    if (corpo.length > MAX_BYTES) return false;
    s.setItem(chave, corpo);
    return true;
  } catch {
    // Cota cheia / modo privado: o drawer segue funcionando sem rascunho persistido.
    return false;
  }
}

export function apagarRascunho(chave) {
  const s = storage();
  if (!s || !chave) return;
  try {
    s.removeItem(chave);
  } catch {
    /* ignore */
  }
}

/**
 * Hook do rascunho. Devolve o estado e um `patch` que já persiste.
 *
 * @param {{companyId: any, userId: any, conversaId: any, ativo?: boolean,
 *          clienteNomeSugerido?: string}} params
 *   `clienteNomeSugerido` é o nome da conversa: entra como SUGESTÃO EDITÁVEL no campo de busca
 *   de cliente quando não há rascunho — e só quando é nome de verdade (título que é telefone
 *   não sugere nada). Nunca vira seleção canônica: só a WM resolve o `codigo_cliente_erp`, e
 *   por isso o nome da conversa nunca preenche `clienteCodigoErp`.
 *
 *   O vendedor não tem sugestão equivalente: o único ponto de partida é a memória do último
 *   vendedor confirmado pela WM. Ver `prefillRascunho`.
 */
export default function useOrcamentoDraft({
  companyId,
  userId,
  conversaId,
  ativo = true,
  clienteNomeSugerido = "",
} = {}) {
  const chave = useMemo(
    () => (conversaId ? chaveRascunho({ companyId, userId, conversaId }) : ""),
    [companyId, userId, conversaId]
  );

  const [rascunho, setRascunho] = useState(() => ({ ...RASCUNHO_VAZIO }));
  const [carregado, setCarregado] = useState(false);
  const chaveRef = useRef(chave);

  // Carrega (e varre o storage) ao abrir ou ao trocar de conversa/usuário.
  useEffect(() => {
    chaveRef.current = chave;
    if (!ativo || !chave) {
      setCarregado(false);
      return;
    }
    limparRascunhosForaDeEscopo({ companyId, userId });
    const salvo = lerRascunho(chave);
    if (salvo) {
      setRascunho(salvo);
    } else {
      setRascunho(
        prefillRascunho({
          clienteNomeSugerido,
          // Lido só agora, na abertura: a memória é ponto de partida, e reler depois
          // sobrescreveria o que o atendente já escolheu nesta tela.
          vendedorLembrado: lerVendedorLembrado({ companyId, userId }),
        })
      );
    }
    setCarregado(true);
    // As sugestões ficam fora das deps de propósito: elas só valem na abertura; se o nome da
    // conversa mudar no meio da digitação, não se sobrescreve o que o usuário escreveu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, chave, companyId, userId]);

  /** Aplica um patch (objeto ou função) e persiste no mesmo passo. */
  const patch = useCallback((mudanca) => {
    setRascunho((atual) => {
      const proximo =
        typeof mudanca === "function" ? { ...atual, ...mudanca(atual) } : { ...atual, ...mudanca };
      const limpo = sanearRascunho(proximo);
      gravarRascunho(chaveRef.current, limpo);
      return limpo;
    });
  }, []);

  const limpar = useCallback(() => {
    apagarRascunho(chaveRef.current);
    setRascunho({ ...RASCUNHO_VAZIO });
  }, []);

  return { rascunho, patch, limpar, carregado, chave };
}
