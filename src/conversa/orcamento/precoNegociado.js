/**
 * Preço negociado por item e desconto no total do orçamento.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md`, Anexo A (item 1). Medido ATIVO
 * contra o ERP real da MARGRE em 27/10/2026: a WM aceita e aplica `preco_negociado` por item no
 * `preparar` (prévia) e no `criar`. O cadastro do produto NÃO muda — o `preco_unitario` oficial
 * continua intacto; o valor do atendente vira o `preco_negociado` daquela linha.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A FONTE DA VERDADE DO TOTAL É SEMPRE A PRÉVIA DA WM
 * ────────────────────────────────────────────────────────────────────────────
 * Este módulo PRODUZ o `preco_negociado` que viaja para a WM. Ele NÃO decide o total: depois de
 * mexer no preço, o atendente calcula, e a prévia da WM devolve `valor_total_bruto`,
 * `valor_total` e `valor_desconto_unit` por linha — é isso que a tela mostra (ver
 * `OrcamentoPreview`). A conta daqui serve só para DISTRIBUIR um desconto global entre os itens;
 * o número conferido é o da loja, nunca o nosso.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DESCONTO FINAL × PREÇO POR ITEM — A REGRA (a menos surpreendente)
 * ────────────────────────────────────────────────────────────────────────────
 * Só existe UM campo por linha: `preco_negociado`. O "desconto no total" é um atalho que
 * DISTRIBUI o desconto entre as linhas e grava o `preco_negociado` de cada uma — ou seja, ele
 * SOBRESCREVE as negociações por item (recalcula tudo a partir do preço oficial). Depois de
 * aplicar, o atendente ainda pode ajustar o preço de uma linha específica (muda só aquela linha).
 * "Remover desconto" limpa o `preco_negociado` de todas as linhas e volta tudo ao oficial. Como
 * há um só conceito (o preço negociado da linha), não há estado global que possa ficar velho.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * REGRA INQUEBRÁVEL: dinheiro é string decimal (doc 36)
 * ────────────────────────────────────────────────────────────────────────────
 * O `preco_negociado` sai daqui como string decimal com ponto (`"10.00"`), byte a byte como vai
 * para a WM. A vírgula do teclado BR é aceita na entrada e convertida. A distribuição trabalha em
 * CENTAVOS inteiros (nada de float acumulando) e ajusta o resíduo de arredondamento na última
 * linha para a soma bater exatamente com o desconto pedido.
 */

import { normalizarQuantidadeParaEnvio, precoNaoCadastrado } from "./orcamentoFormat.js";
import { ESTADO_PRECO } from "./precoItemCache.js";

/** Mesmo padrão decimal da WM (ponto, sem sinal). */
const PADRAO_DECIMAL = /^\d+(?:\.\d+)?$/;
const MAX_LEN = 20;

/**
 * Normaliza o preço que o atendente digitou para a string decimal da WM.
 *
 * Aceita vírgula (teclado BR) e a converte para ponto. Recusa vazio, zero e negativo com
 * mensagem gentil — a mesma guarda do backend, para o erro aparecer antes de gastar a chamada.
 *
 * @param {string|number|null|undefined} bruto
 * @returns {{ok: true, value: string} | {ok: false, motivo: string}}
 */
export function normalizarPrecoNegociado(bruto) {
  if (bruto === null || bruto === undefined) return { ok: false, motivo: "Digite um preço." };
  const s = String(bruto).trim().replace(",", ".");
  if (!s) return { ok: false, motivo: "Digite um preço." };
  if (s.length > MAX_LEN) return { ok: false, motivo: "Preço longo demais." };
  if (!PADRAO_DECIMAL.test(s)) {
    return { ok: false, motivo: "Use só números, com vírgula para os centavos." };
  }
  // Checagem textual, como o backend: `0`, `0.00`, `0.000` não têm nenhum dígito 1-9.
  if (!/[1-9]/.test(s)) return { ok: false, motivo: "O preço precisa ser maior que zero." };
  return { ok: true, value: s };
}

/**
 * Preço unitário OFICIAL da linha, em número, lido do cache de preços (`precoItemCache`).
 * `null` quando não há preço utilizável: item sem consulta OK, ou preço "não cadastrado" no ERP
 * (valor irrisório) — nenhum dos dois serve de base para distribuir desconto.
 */
export function baseOficialDoItem(item, precos) {
  const codigo = item?.codigo_produto_erp;
  if (!codigo) return null;
  const entrada = precos?.[codigo];
  if (!entrada || entrada.estado !== ESTADO_PRECO.OK) return null;
  const bruto = entrada.valores?.preco_unitario;
  if (precoNaoCadastrado(bruto)) return null;
  const n = Number(String(bruto).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Dá para distribuir um desconto global agora? Só quando TODO item tem quantidade válida e um
 * preço oficial utilizável — sem isso a distribuição proporcional não teria base honesta.
 */
export function podeDistribuirDesconto(itens, precos) {
  const lista = Array.isArray(itens) ? itens : [];
  if (!lista.length) return false;
  return lista.every(
    (it) => normalizarQuantidadeParaEnvio(it?.quantidade).ok && baseOficialDoItem(it, precos) != null
  );
}

/** Soma do valor oficial do orçamento (em centavos), para exibir "de quanto é o desconto". */
export function totalOficialCentavos(itens, precos) {
  const lista = Array.isArray(itens) ? itens : [];
  let total = 0;
  for (const it of lista) {
    const q = normalizarQuantidadeParaEnvio(it?.quantidade);
    const pu = baseOficialDoItem(it, precos);
    if (!q.ok || pu == null) return null;
    total += Math.round(pu * 100 * Number(q.value.replace(",", ".")));
  }
  return total;
}

/**
 * Distribui um desconto no TOTAL entre os itens, virando o `preco_negociado` de cada linha.
 *
 * Proporcional ao valor de cada item; resíduo de arredondamento na última linha para a soma bater
 * exatamente com o desconto pedido. Trabalha em centavos inteiros. Barra desconto que zere ou
 * negative qualquer linha (a WM recusaria), e desconto que zere o orçamento inteiro.
 *
 * @param {object} args
 * @param {Array<object>} args.itens itens do rascunho
 * @param {object} args.precos cache de preços por código
 * @param {"reais"|"percent"} args.tipo
 * @param {string|number} args.valor desconto digitado (R$ ou %)
 * @returns {{ok: true, precosNegociados: string[], descontoCentavos: number}
 *   | {ok: false, motivo: string}}
 */
export function distribuirDescontoFinal({ itens, precos, tipo, valor }) {
  const lista = Array.isArray(itens) ? itens : [];
  if (!lista.length) return { ok: false, motivo: "Adicione itens antes de aplicar um desconto." };

  const qtys = [];
  const grossos = [];
  let G = 0;
  for (const it of lista) {
    const q = normalizarQuantidadeParaEnvio(it?.quantidade);
    const pu = baseOficialDoItem(it, precos);
    if (!q.ok || pu == null) {
      return {
        ok: false,
        motivo: "Todos os itens precisam de preço e quantidade para distribuir um desconto.",
      };
    }
    const qty = Number(q.value.replace(",", "."));
    const gross = Math.round(pu * 100 * qty); // valor da linha em centavos
    qtys.push(qty);
    grossos.push(gross);
    G += gross;
  }
  if (G <= 0) return { ok: false, motivo: "Não há valor para descontar." };

  const vnum = Number(String(valor).replace(",", "."));
  if (!Number.isFinite(vnum) || vnum <= 0) {
    return { ok: false, motivo: "Informe um desconto maior que zero." };
  }

  let D;
  if (tipo === "percent") {
    if (vnum >= 100) return { ok: false, motivo: "O desconto não pode chegar a 100%." };
    D = Math.round((G * vnum) / 100);
  } else {
    D = Math.round(vnum * 100);
  }
  if (D <= 0) return { ok: false, motivo: "Informe um desconto maior que zero." };
  if (D >= G) return { ok: false, motivo: "O desconto não pode zerar o orçamento." };

  // Proporcional, com o resíduo na última linha: Σ descontos == D, exato.
  const descontos = new Array(grossos.length).fill(0);
  let acumulado = 0;
  for (let i = 0; i < grossos.length - 1; i++) {
    descontos[i] = Math.round((D * grossos[i]) / G);
    acumulado += descontos[i];
  }
  descontos[grossos.length - 1] = D - acumulado;

  const precosNegociados = [];
  for (let i = 0; i < grossos.length; i++) {
    const net = grossos[i] - descontos[i];
    if (net <= 0) {
      return { ok: false, motivo: "Esse desconto zera o preço de um item. Reduza o valor." };
    }
    // Preço unitário negociado = total líquido da linha ÷ quantidade, em centavos, a 2 casas.
    const pnCentavos = Math.round(net / qtys[i]);
    if (pnCentavos <= 0) {
      return { ok: false, motivo: "Esse desconto zera o preço de um item. Reduza o valor." };
    }
    precosNegociados.push((pnCentavos / 100).toFixed(2));
  }
  return { ok: true, precosNegociados, descontoCentavos: D };
}

export default {
  normalizarPrecoNegociado,
  baseOficialDoItem,
  podeDistribuirDesconto,
  totalOficialCentavos,
  distribuirDescontoFinal,
};
