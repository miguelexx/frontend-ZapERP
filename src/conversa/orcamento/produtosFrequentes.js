/**
 * Produtos que ESTA atendente mais usa em orçamentos, por empresa + usuário.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (seção 11 — custo por chamada;
 * Sessão 5 — UX do drawer).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO VALE MAIS QUE UMA BUSCA MAIS ESPERTA
 * ────────────────────────────────────────────────────────────────────────────
 * Uma loja vende os mesmos itens todo dia. Hoje, para pôr cimento num orçamento, a atendente
 * digita três letras, espera 800 ms de debounce, espera a WM, lê trinta cards e toca num. Com o
 * atalho, o cimento está na tela antes de ela digitar — e o caminho inteiro vira um toque.
 *
 * Isso é o caminho PRINCIPAL numa loja de giro repetido, não enfeite: a busca passa a ser o que
 * se usa quando o item é novo. E custa **zero chamada à WM**: o que está aqui já foi escolhido
 * por ela antes, e o que se guarda é só o que a própria lista de candidatos já tinha na mão
 * (código, descrição, marca, unidade).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE NUNCA ENTRA AQUI
 * ────────────────────────────────────────────────────────────────────────────
 * Preço e estoque. Eles mudam no ERP sem avisar ninguém, e um valor guardado no navegador
 * voltando dias depois pareceria atual — é a mesma razão de o rascunho de `useOrcamentoDraft`
 * barrar preço na lista branca e de o cache de `precoItemCache` ser efêmero. Daqui sai
 * identificação de produto, nada mais; o valor se busca na hora, se for pedido.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESCOPO: EMPRESA + USUÁRIO, COMO TODO O RESTO DESTE PROJETO
 * ────────────────────────────────────────────────────────────────────────────
 * O isolamento entre empresas neste sistema é **exclusivamente app-layer** (não há RLS
 * compensando nada), e isso vale também dentro do navegador: num computador de balcão com dois
 * logins, o atalho de uma empresa não pode aparecer na outra. Daí a chave por
 * `empresa:usuário`, idêntica à do vendedor lembrado e à do rascunho.
 *
 * Como vive em `localStorage` (precisa atravessar dias e abas, senão o atalho nunca se forma),
 * ele NÃO morre sozinho no logout: `limparProdutosFrequentes` é chamada em
 * `authStore.clearSession` e remove TODAS as chaves do módulo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TODA LEITURA E ESCRITA EM try/catch
 * ────────────────────────────────────────────────────────────────────────────
 * Em janela privada, com storage bloqueado por política ou com a cota cheia, o simples ACESSO a
 * `localStorage` lança. O atalho é conveniência: qualquer falha é silenciosa e a busca continua
 * sendo o caminho, exatamente como antes de este módulo existir.
 */

const PREFIXO = "zap_orc_frequentes";

/**
 * 90 dias sem uso e o item sai. Não é segurança (a limpeza no logout é) — é não oferecer para
 * sempre o produto de uma campanha que acabou no trimestre passado.
 */
export const FREQUENTES_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Teto do que se GUARDA. Sem ele, a chave cresceria sem limite num balcão movimentado. */
export const MAX_GUARDADOS = 40;

/** Teto do que se MOSTRA: oito cabem na tela sem a lista virar uma segunda busca. */
export const MAX_SUGERIDOS = 8;

/**
 * Meia-vida da frequência, em dias.
 *
 * "Mais usados" sem decaimento premia para sempre quem foi usado muito uma vez: o item de uma
 * obra grande de março ficaria à frente do que ela vende hoje. Com meia-vida de 30 dias, usar
 * o dobro de vezes compensa exatamente um mês parado — "uso recente E frequência" numa conta só,
 * em vez de dois critérios brigando no desempate.
 */
export const MEIA_VIDA_DIAS = 30;

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const MAX_BYTES = 16 * 1024;
const MAX_CODIGO = 20;
const MAX_TEXTO = 200;
const MAX_CURTO = 40;

/** `null` quando não há como ler/escrever (SSR, storage bloqueado, modo privado). */
function storage() {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Pedaço de chave seguro: sem `:` para não embaralhar o escopo (igual ao rascunho). */
function parte(valor) {
  return String(valor ?? "").replace(/[^A-Za-z0-9_-]/g, "") || "0";
}

export function chaveProdutosFrequentes({ companyId, userId } = {}) {
  return `${PREFIXO}:${parte(companyId)}:${parte(userId)}`;
}

function texto(valor, max) {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

/**
 * Quanto este item vale na hora de ordenar.
 *
 * `usos` decaindo por meia-vida desde o último uso. Exportada porque é a regra que o teste
 * precisa fixar: ela é o produto todo desta funcionalidade.
 */
export function pontuacaoFrequencia(entrada, agora = Date.now()) {
  const usos = Number(entrada?.usos);
  if (!Number.isFinite(usos) || usos <= 0) return 0;
  const ultimo = Number(entrada?.ultimoUso);
  if (!Number.isFinite(ultimo) || ultimo <= 0) return usos;
  const dias = Math.max(0, (agora - ultimo) / MS_POR_DIA);
  return usos * Math.pow(0.5, dias / MEIA_VIDA_DIAS);
}

/**
 * Uma entrada só é entrada se tiver código. Tudo o mais é opcional e aparado.
 * Entrada vencida (nenhum uso dentro do TTL) volta como `null` e some na próxima gravação.
 */
function sanear(bruta, agora) {
  if (!bruta || typeof bruta !== "object") return null;
  const codigo = texto(bruta.codigo, MAX_CODIGO);
  if (!codigo) return null;
  const usos = Number(bruta.usos);
  const ultimoUso = Number(bruta.ultimoUso);
  const quando = Number.isFinite(ultimoUso) && ultimoUso > 0 ? ultimoUso : 0;
  if (quando && quando + FREQUENTES_TTL_MS <= agora) return null;
  return {
    codigo,
    descricao: texto(bruta.descricao, MAX_TEXTO),
    marca: texto(bruta.marca, MAX_CURTO),
    unidade: texto(bruta.unidade, MAX_CURTO),
    usos: Number.isFinite(usos) && usos > 0 ? Math.min(Math.floor(usos), 9999) : 1,
    ultimoUso: quando,
  };
}

/** Lista crua do escopo, já saneada e sem vencidos. Nunca lança. */
function lerLista(s, chave, agora) {
  try {
    const raw = s.getItem(chave);
    if (!raw || raw.length > MAX_BYTES) return [];
    const salvo = JSON.parse(raw);
    const itens = Array.isArray(salvo?.itens) ? salvo.itens : [];
    const vistos = new Set();
    const limpos = [];
    for (const bruta of itens) {
      const entrada = sanear(bruta, agora);
      if (!entrada || vistos.has(entrada.codigo)) continue;
      vistos.add(entrada.codigo);
      limpos.push(entrada);
    }
    return limpos;
  } catch {
    return [];
  }
}

/**
 * Os produtos a oferecer antes de a atendente digitar, do mais provável para o menos.
 *
 * @returns {Array<{codigo: string, descricao: string, marca: string, unidade: string,
 *                  usos: number, ultimoUso: number}>} vazio quando não há nada ou o storage
 *   não responde — e lista vazia significa "mostre a busca como antes", nunca um erro
 */
export function lerProdutosFrequentes({
  companyId,
  userId,
  limite = MAX_SUGERIDOS,
  agora = Date.now(),
} = {}) {
  const s = storage();
  if (!s) return [];
  const lista = lerLista(s, chaveProdutosFrequentes({ companyId, userId }), agora);
  const teto = Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : MAX_SUGERIDOS;
  return lista
    .map((e) => ({ e, p: pontuacaoFrequencia(e, agora) }))
    .sort((a, b) => b.p - a.p || b.e.ultimoUso - a.e.ultimoUso)
    .slice(0, teto)
    .map(({ e }) => e);
}

/**
 * Registra que este produto foi posto num orçamento.
 *
 * Chamada no único momento em que isso é verdade: o item entrando no carrinho. Guarda só o que
 * identifica o produto — preço e estoque ficam de fora de propósito (ver cabeçalho).
 *
 * @returns {boolean} se conseguiu persistir (falso em storage bloqueado; não é erro)
 */
export function registrarProdutoUsado({ companyId, userId, produto, agora = Date.now() } = {}) {
  const s = storage();
  if (!s) return false;
  const codigo = texto(produto?.codigo_produto_erp, MAX_CODIGO);
  if (!codigo) return false;

  const chave = chaveProdutosFrequentes({ companyId, userId });
  try {
    const lista = lerLista(s, chave, agora);
    const anterior = lista.find((e) => e.codigo === codigo) || null;
    const atualizada = {
      codigo,
      // Descrição/marca/unidade da vez mais recente: o ERP pode ter corrigido o cadastro, e o
      // texto novo é o que ela acabou de ver na tela.
      descricao: texto(produto?.descricao, MAX_TEXTO) || anterior?.descricao || "",
      marca: texto(produto?.marca, MAX_CURTO) || anterior?.marca || "",
      unidade: texto(produto?.unidade, MAX_CURTO) || anterior?.unidade || "",
      usos: Math.min((anterior?.usos || 0) + 1, 9999),
      ultimoUso: agora,
    };
    // O mais recente primeiro: se um dia a chave for truncada por cota, o que sobra é o que
    // importa. A ordem de exibição não depende disto (`lerProdutosFrequentes` pontua).
    const itens = [atualizada, ...lista.filter((e) => e.codigo !== codigo)].slice(0, MAX_GUARDADOS);
    s.setItem(chave, JSON.stringify({ v: 1, itens }));
    return true;
  } catch {
    return false;
  }
}

/** Esquece um produto deste escopo (ele saiu de linha, ou foi parar ali por engano). */
export function esquecerProdutoFrequente({ companyId, userId, codigo, agora = Date.now() } = {}) {
  const s = storage();
  if (!s) return false;
  const alvo = texto(codigo, MAX_CODIGO);
  if (!alvo) return false;
  const chave = chaveProdutosFrequentes({ companyId, userId });
  try {
    const itens = lerLista(s, chave, agora).filter((e) => e.codigo !== alvo);
    if (itens.length) s.setItem(chave, JSON.stringify({ v: 1, itens }));
    else s.removeItem(chave);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove TODAS as chaves deste módulo. Chamada no logout (`authStore.clearSession`).
 *
 * Varre tudo, não só o escopo atual: `clearSession` roda depois de o usuário já ter saído do
 * estado da aplicação, então não há escopo confiável para preservar — e o histórico de compras
 * de uma empresa não pode ficar visível para quem logar depois num navegador de balcão.
 *
 * @returns {number} quantas removeu (usado em teste)
 */
export function limparProdutosFrequentes() {
  const s = storage();
  if (!s) return 0;
  let removidas = 0;
  try {
    const chaves = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (typeof k === "string" && k.startsWith(`${PREFIXO}:`)) chaves.push(k);
    }
    for (const k of chaves) {
      try {
        s.removeItem(k);
        removidas += 1;
      } catch {
        /* storage pode recusar a escrita; segue */
      }
    }
  } catch {
    /* enumerar o storage pode lançar; a limpeza é best-effort */
  }
  return removidas;
}

export default {
  FREQUENTES_TTL_MS,
  MAX_GUARDADOS,
  MAX_SUGERIDOS,
  MEIA_VIDA_DIAS,
  chaveProdutosFrequentes,
  pontuacaoFrequencia,
  lerProdutosFrequentes,
  registrarProdutoUsado,
  esquecerProdutoFrequente,
  limparProdutosFrequentes,
};
