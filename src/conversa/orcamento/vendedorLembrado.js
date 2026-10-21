/**
 * Memória do último vendedor CONFIRMADO, por empresa + usuário.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` §6.2.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A LINHA QUE ESTE MÓDULO NÃO CRUZA
 * ────────────────────────────────────────────────────────────────────────────
 * Isto é SUGESTÃO DE TEXTO, não mapeamento usuário ZapERP → vendedor ERP. O doc 36 mantém o
 * mapeamento automático fora do MVP de propósito, porque vendedor tem efeito comercial
 * (comissão): escolher o vendedor errado tira dinheiro de uma pessoa real.
 *
 * Portanto, e isto é invariante:
 *   · só entra aqui vendedor que a **WM resolveu** numa prévia bem-sucedida — nunca um
 *     candidato de lista, nunca `user.nome`, nunca "o único resultado da busca";
 *   · o que volta daqui é PRÉ-PREENCHIMENTO. Ele viaja ao backend como `vendedor_codigo_erp` e
 *     a WM **revalida** em `preparar`; se o vendedor foi inativado, a preparação recusa e o
 *     atendente troca. Um vendedor lembrado NÃO é um vendedor válido;
 *   · nada aqui seleciona sozinho. Quem exibe mostra o nome com opção de trocar, e marca que a
 *     origem é a memória — não a confirmação desta vez.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE `localStorage` (e não `sessionStorage`, como o rascunho)
 * ────────────────────────────────────────────────────────────────────────────
 * O rascunho é de um atendimento e morre com a aba — é disso que ele serve. "O vendedor que eu
 * sou" atravessa dias e abas; em `sessionStorage` a memória se perderia a cada aba nova e a
 * melhoria simplesmente não existiria.
 *
 * Isso tem um preço: `localStorage` NÃO morre no logout por conta própria. Daí a limpeza
 * explícita (`limparVendedoresLembrados`) chamada em `authStore.clearSession`, que remove TODAS
 * as chaves deste módulo — não só as do escopo que estava logado —, porque depois do logout não
 * se sabe mais de quem era cada escopo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TODA LEITURA E ESCRITA EM try/catch
 * ────────────────────────────────────────────────────────────────────────────
 * Em janela privada, com storage bloqueado por política ou com a cota cheia, o simples ACESSO a
 * `localStorage` lança. A memória é conveniência: qualquer falha é silenciosa e o campo de
 * vendedor volta a nascer vazio, como antes. Mesmo espírito do `useOrcamentoDraft`.
 */

const PREFIXO = "zap_orc_vendedor";

/**
 * 60 dias. Não é segurança (a limpeza no logout é) — é não carregar para sempre o vendedor de
 * alguém que saiu da empresa num navegador compartilhado de balcão.
 */
export const VENDEDOR_TTL_MS = 60 * 24 * 60 * 60 * 1000;

const MAX_BYTES = 2 * 1024;
const MAX_CODIGO = 20;
const MAX_NOME = 200;

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

export function chaveVendedorLembrado({ companyId, userId } = {}) {
  return `${PREFIXO}:${parte(companyId)}:${parte(userId)}`;
}

/**
 * Último vendedor confirmado deste escopo, ou `null`.
 * @returns {{ codigo: string, nome: string }|null}
 */
export function lerVendedorLembrado({ companyId, userId, agora = Date.now() } = {}) {
  const s = storage();
  if (!s) return null;
  const chave = chaveVendedorLembrado({ companyId, userId });
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
    const codigo = typeof salvo.codigo === "string" ? salvo.codigo.trim().slice(0, MAX_CODIGO) : "";
    if (!codigo) return null;
    const nome = typeof salvo.nome === "string" ? salvo.nome.trim().slice(0, MAX_NOME) : "";
    return { codigo, nome };
  } catch {
    return null;
  }
}

/**
 * Guarda o vendedor que a WM resolveu.
 *
 * Chamar isto com um candidato de lista, com `user.nome` ou com qualquer coisa que a WM não
 * tenha confirmado é o único jeito de este módulo virar o mapeamento automático que o doc 36
 * proíbe. O chamador é a prévia `pronto_para_confirmacao` — e só ela.
 *
 * @returns {boolean} se conseguiu persistir (falso em storage bloqueado; não é erro)
 */
export function gravarVendedorLembrado({ companyId, userId, codigo, nome, agora = Date.now() } = {}) {
  const s = storage();
  if (!s) return false;
  const cod = typeof codigo === "string" ? codigo.trim().slice(0, MAX_CODIGO) : "";
  if (!cod) return false;
  const chave = chaveVendedorLembrado({ companyId, userId });
  try {
    s.setItem(
      chave,
      JSON.stringify({
        v: 1,
        expiraEm: agora + VENDEDOR_TTL_MS,
        codigo: cod,
        nome: typeof nome === "string" ? nome.trim().slice(0, MAX_NOME) : "",
      })
    );
    return true;
  } catch {
    return false;
  }
}

/** Esquece o vendedor deste escopo (o atendente clicou em "Trocar"). */
export function esquecerVendedorLembrado({ companyId, userId } = {}) {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(chaveVendedorLembrado({ companyId, userId }));
  } catch {
    /* ignore */
  }
}

/**
 * Remove TODAS as chaves deste módulo. Chamada no logout (`authStore.clearSession`).
 *
 * Varre tudo, não só o escopo atual: `clearSession` roda depois de o usuário já ter saído do
 * estado da aplicação, então não há escopo confiável para preservar — e deixar a memória de
 * outro login num navegador compartilhado é exatamente o que não pode acontecer.
 *
 * @returns {number} quantas removeu (usado em teste)
 */
export function limparVendedoresLembrados() {
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
  VENDEDOR_TTL_MS,
  chaveVendedorLembrado,
  lerVendedorLembrado,
  gravarVendedorLembrado,
  esquecerVendedorLembrado,
  limparVendedoresLembrados,
};
