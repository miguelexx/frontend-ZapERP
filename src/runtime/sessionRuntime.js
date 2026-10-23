/**
 * Ponte entre os módulos LEVES do boot e o MOTOR DE CONVERSAS, que é pesado.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O PROBLEMA QUE ISTO RESOLVE
 * ─────────────────────────────────────────────────────────────────────────
 * Medido em 23/10/2026 (`docs/audits/boot-mobile-2026-10-23.md`): o chunk de
 * entrada tinha 82 módulos / 858 kB de fonte, e ~59% disso era o motor de
 * conversas — `conversa/`, `chats/` e `socket/` — que o celular tinha de
 * descomprimir, parsear e EXECUTAR antes do primeiro render.
 *
 * Ele entrava por três arestas que pareciam inocentes:
 *
 *   api/http.js      → socket/socket.js        (só para `disconnectSocket()` no 401)
 *   api/http.js      → conversa/conversaStore  (só para `clearConversaSessionCaches()`)
 *   push/swBridge.js → conversa/conversaStore  (só para ler `selectedId`)
 *   auth/authStore   → socket + chatsStore + conversaStore
 *
 * `api/http.js` é importado por praticamente tudo, então o motor entrava no
 * boot por um caminho que ninguém suspeitava. Trocar o import estático por
 * `import()` dinâmico dentro do handler de 401 NÃO serve: ali logo a seguir
 * vem `location.href = "/login"`, e a recarga pode acontecer antes de o
 * módulo chegar — a limpeza ficaria por fazer, às vezes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O DESENHO: inversão de dependência, não import tardio
 * ─────────────────────────────────────────────────────────────────────────
 * Quem é pesado REGISTA-SE aqui quando carrega. Quem é leve só chama o que
 * estiver registado — e nunca importa o pesado.
 *
 * A propriedade que torna isto seguro **por construção**: se um módulo nunca
 * carregou, não existe estado dele para limpar nem valor dele para ler. O
 * no-op é a resposta CORRETA, não uma falha silenciosa. Exemplos:
 *
 *   • socket nunca carregou  → não há socket ligado para desligar;
 *   • conversaStore nunca carregou → não há conversa aberta nem cache de
 *     sessão para apagar, e `conversaSelecionada` é null (push é mostrado,
 *     que é o comportamento seguro).
 *
 * Este arquivo NÃO PODE IMPORTAR NADA. É essa ausência de dependências que
 * o deixa entrar no chunk de entrada sem arrastar nada atrás. Se um dia
 * alguém puser um `import` aqui, o ganho todo se desfaz em silêncio — há um
 * teste que falha nesse caso (`scripts/test-session-runtime.mjs`).
 */

/** @type {Map<string, () => void>} */
const limpezas = new Map();
/** @type {Map<string, () => unknown>} */
const leitores = new Map();

/**
 * O motor regista aqui o que tem de ser desfeito quando a sessão acaba
 * (logout, 401, troca de utilizador).
 *
 * @param {string} nome chave estável; registar de novo substitui (HMR não duplica)
 * @param {() => void} fn
 * @returns {() => void} remove o registo
 */
export function registrarLimpezaDeSessao(nome, fn) {
  if (!nome || typeof fn !== "function") return () => {};
  limpezas.set(nome, fn);
  return () => {
    if (limpezas.get(nome) === fn) limpezas.delete(nome);
  };
}

/**
 * Executa todas as limpezas registadas. Uma que estoure não pode impedir as
 * outras — no 401 isto corre logo antes de `location.href`, e falhar no meio
 * deixaria estado da sessão anterior para o próximo utilizador.
 */
export function executarLimpezaDeSessao() {
  for (const fn of limpezas.values()) {
    try {
      fn();
    } catch (_) {
      /* uma limpeza não derruba as demais */
    }
  }
}

/**
 * O motor expõe aqui leituras que módulos leves precisam sem o importar.
 *
 * @param {string} nome
 * @param {() => unknown} fn
 * @returns {() => void} remove o registo
 */
export function registrarLeitor(nome, fn) {
  if (!nome || typeof fn !== "function") return () => {};
  leitores.set(nome, fn);
  return () => {
    if (leitores.get(nome) === fn) leitores.delete(nome);
  };
}

/**
 * Lê um valor do motor. Devolve `padrao` se o motor ainda não carregou —
 * o que, para quem chama, significa "não há" e não "erro".
 *
 * @param {string} nome
 * @param {unknown} [padrao]
 */
export function lerDoMotor(nome, padrao = null) {
  const fn = leitores.get(nome);
  if (!fn) return padrao;
  try {
    const v = fn();
    return v === undefined ? padrao : v;
  } catch (_) {
    return padrao;
  }
}

/** Só para teste: esvazia os registos. */
export function __resetSessionRuntime() {
  limpezas.clear();
  leitores.clear();
}
