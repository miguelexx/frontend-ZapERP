/**
 * Navegacao do service worker: o index.html NAO pode vir do cache heuristico do browser.
 * Executar: node scripts/test-sw-index-fresco.mjs
 *
 * POR QUE EXISTE (medido em producao 24/10):
 *   O index.html e' servido sem `Cache-Control` — so' com `Last-Modified` e `Etag`. O
 *   Chrome entao aplica cache HEURISTICO (~10% da idade do arquivo; medido ~57 min,
 *   crescendo para ~17 h uma semana depois do deploy) e serve o HTML VELHO **sem
 *   revalidar** (comprovado: transferSize === 0 na segunda visita). Esse HTML aponta
 *   para chunks com hash que o deploy seguinte apagou — 3 de 4 hashes antigos testados
 *   devolvem 404 — e o resultado e' erro de carregamento de chunk ao abrir o app.
 *
 *   O SW faz network-first na navegacao, mas `fetch(req)` passa pelo cache HTTP, logo
 *   "network-first" entregava o HTML velho. `cache: 'no-store'` fecha isso.
 *
 * O QUE ESTE TESTE TRAVA:
 *   1. a navegacao pede o index com `cache: 'no-store'`;
 *   2. resposta redirecionada -> cai para `fetch(req)` (comportamento anterior);
 *   3. resposta nao-ok -> cai para `fetch(req)`;
 *   4. excecao no fetch com no-store -> cai para `fetch(req)`;
 *   5. offline (os dois falham) -> serve o shell do cache. ABRIR O APP SEM INTERNET
 *      NAO PODE REGREDIR — e' o motivo pelo qual o guard existe.
 */

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const fonte = readFileSync(join(raiz, "public", "sw.js"), "utf8");

let falhas = 0;
function ok(condicao, rotulo) {
  if (condicao) {
    console.log(`  ok   ${rotulo}`);
  } else {
    console.log(`  FALHA ${rotulo}`);
    falhas++;
  }
}

/** Resposta minima no formato que o sw.js inspeciona. */
function resposta({ status = 200, redirected = false, type = "basic", corpo = "<html>" } = {}) {
  const r = {
    status,
    ok: status >= 200 && status < 300,
    redirected,
    type,
    headers: new Map(),
    corpo,
    clone: () => resposta({ status, redirected, type, corpo }),
    blob: async () => corpo,
  };
  return r;
}

/**
 * Carrega o sw.js real num escopo de service worker simulado e devolve o handler de
 * fetch registado, mais os espioes.
 */
function carregarSW({ respostasNoStore, respostasNormais, shellEmCache = null }) {
  const chamadas = [];
  const cacheShell = new Map();
  if (shellEmCache) cacheShell.set("/__zap_shell__", shellEmCache);

  const listeners = new Map();
  const sandbox = {
    console,
    URL,
    Response: class {
      constructor(corpo, init = {}) {
        Object.assign(this, resposta({ status: init.status || 200, corpo }));
      }
    },
    Request: class {},
    setTimeout,
    clearTimeout,
    caches: {
      open: async () => ({
        put: async (k, v) => void cacheShell.set(k, v),
        keys: async () => [],
        delete: async () => true,
        match: async (k) => cacheShell.get(k) || undefined,
      }),
      keys: async () => [],
      delete: async () => true,
      match: async (k) => cacheShell.get(typeof k === "string" ? k : k.url) || undefined,
    },
    fetch: async (entrada, init) => {
      const url = typeof entrada === "string" ? entrada : entrada.url;
      chamadas.push({ url, cache: init?.cache ?? null, comInit: init !== undefined });
      const fila = init?.cache === "no-store" ? respostasNoStore : respostasNormais;
      const proxima = fila.shift();
      if (proxima === undefined) throw new Error("fila de respostas vazia");
      if (proxima instanceof Error) throw proxima;
      return proxima;
    },
  };
  sandbox.self = {
    addEventListener: (nome, fn) => void listeners.set(nome, fn),
    location: { origin: "https://zaperp.wmsistemas.inf.br" },
    skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} },
    registration: { showNotification: async () => {}, pushManager: {} },
  };
  sandbox.clients = sandbox.self.clients;

  const ctx = createContext(sandbox);
  runInContext(fonte, ctx, { filename: "sw.js" });

  const handler = listeners.get("fetch");
  if (typeof handler !== "function") throw new Error("sw.js nao registou listener de fetch");
  return { handler, chamadas, cacheShell };
}

/** Dispara uma navegacao pelo handler real e devolve a resposta servida. */
async function navegar(sw) {
  let servida;
  const event = {
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://zaperp.wmsistemas.inf.br/atendimento",
    },
    respondWith: (p) => void (servida = p),
  };
  sw.handler(event);
  if (servida === undefined) throw new Error("o handler nao respondeu a navegacao");
  return servida;
}

console.log("navegacao do SW: index sempre fresco\n");

// 1. caminho normal: usa no-store e serve a resposta fresca
{
  const fresca = resposta({ corpo: "<html>novo</html>" });
  const sw = carregarSW({ respostasNoStore: [fresca], respostasNormais: [] });
  const servida = await navegar(sw);
  ok(sw.chamadas.length === 1, "online: faz exatamente 1 requisicao");
  ok(sw.chamadas[0]?.cache === "no-store", "online: pede o index com cache 'no-store'");
  ok(servida === fresca, "online: serve a resposta da rede");
  // o shell e' guardado de forma assincrona (armazenarShell nao e' aguardado)
  await new Promise((r) => setImmediate(r));
  ok(sw.cacheShell.has("/__zap_shell__"), "online: guarda o shell para uso offline");
}

// 2. resposta redirecionada: cai para o comportamento anterior
{
  const redir = resposta({ redirected: true });
  const antiga = resposta({ corpo: "<html>via fetch(req)</html>" });
  const sw = carregarSW({ respostasNoStore: [redir], respostasNormais: [antiga] });
  const servida = await navegar(sw);
  ok(servida === antiga, "redirecionada: cai para fetch(req) e serve o resultado dele");
  ok(sw.chamadas[1]?.comInit === false, "redirecionada: o fallback NAO passa init");
}

// 3. resposta nao-ok: cai para o comportamento anterior
{
  const erro = resposta({ status: 503 });
  const antiga = resposta({ corpo: "<html>via fetch(req)</html>" });
  const sw = carregarSW({ respostasNoStore: [erro], respostasNormais: [antiga] });
  const servida = await navegar(sw);
  ok(servida === antiga, "nao-ok: cai para fetch(req)");
}

// 4. excecao no fetch com no-store: cai para o comportamento anterior
{
  const antiga = resposta({ corpo: "<html>via fetch(req)</html>" });
  const sw = carregarSW({
    respostasNoStore: [new Error("falha de rede")],
    respostasNormais: [antiga],
  });
  const servida = await navegar(sw);
  ok(servida === antiga, "excecao: cai para fetch(req)");
}

// 5. offline: os dois falham -> serve o shell guardado
{
  const shell = resposta({ corpo: "<html>shell offline</html>" });
  const sw = carregarSW({
    respostasNoStore: [new Error("offline")],
    respostasNormais: [new Error("offline")],
    shellEmCache: shell,
  });
  const servida = await navegar(sw);
  ok(servida === shell, "offline: serve o shell do cache (abrir o app sem internet)");
}

// 6. offline e sem shell: propaga o erro em vez de devolver resposta vazia
{
  const sw = carregarSW({
    respostasNoStore: [new Error("offline")],
    respostasNormais: [new Error("offline")],
  });
  let lancou = false;
  await navegar(sw).catch(() => void (lancou = true));
  ok(lancou, "offline sem shell: propaga o erro");
}

console.log(falhas === 0 ? "\nTODOS OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
