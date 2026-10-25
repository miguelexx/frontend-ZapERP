/**
 * Poda do cache de assets do service worker.
 * Executar: node scripts/test-sw-asset-cache-prune.mjs
 *
 * POR QUE EXISTE (auditoria de producao 24/10):
 *   O `activate` do sw.js removia caches `zap-*` cujo NOME nao estava em `manter`, mas os
 *   nomes sao fixos (`zap-shell-v1`, `zap-assets-v1`) — logo nada saia nunca. Cada deploy
 *   acrescentava chunks com hash novo e os antigos ficavam para sempre. Medido: o build
 *   tem 152 arquivos / 4,1 MB, e o historico tem 22.160 caminhos distintos em 839 deploys.
 *
 *   O risco nao e' o espaco e sim a COTA da origem, partilhada com o outbox em IndexedDB
 *   (mensagens pendentes que precisam sobreviver ao F5) e com o cache de audios offline:
 *   ao bater na cota, o browser pode despejar a origem inteira e perder mensagem pendente.
 *
 * O QUE ESTE TESTE TRAVA:
 *   1. abaixo do teto nao remove nada;
 *   2. acima do teto remove exatamente o excedente, os MAIS ANTIGOS primeiro;
 *   3. assets referenciados pelo shell (o caminho do boot) NUNCA sao podados;
 *   4. a limpeza por NOME de cache antigo continua a funcionar (nao regredir);
 *   5. falha do storage nao derruba o activate — `clients.claim()` tem de correr.
 */

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const fonte = readFileSync(join(raiz, "public", "sw.js"), "utf8");

const TETO = Number(/const MAX_ASSETS_EM_CACHE = (\d+)/.exec(fonte)?.[1]);
if (!Number.isFinite(TETO)) throw new Error("nao consegui ler MAX_ASSETS_EM_CACHE do sw.js");

let falhas = 0;
function ok(condicao, rotulo) {
  if (condicao) console.log(`  ok   ${rotulo}`);
  else {
    console.log(`  FALHA ${rotulo}`);
    falhas++;
  }
}

const ORIGEM = "https://zaperp.wmsistemas.inf.br";

/** Cache que preserva ORDEM DE INSERCAO, como a Cache API real. */
function criarCache(urls = []) {
  const itens = new Map(); // Map preserva ordem de insercao
  for (const u of urls) itens.set(u, { corpo: u });
  return {
    itens,
    keys: async () => [...itens.keys()].map((u) => ({ url: ORIGEM + u })),
    delete: async (req) => itens.delete(typeof req === "string" ? req : new URL(req.url).pathname),
    put: async (req, v) => void itens.set(typeof req === "string" ? req : new URL(req.url).pathname, v),
    match: async (req) => itens.get(typeof req === "string" ? req : new URL(req.url).pathname),
  };
}

function textoResposta(txt) {
  const r = { ok: true, status: 200, redirected: false, type: "basic" };
  r.clone = () => ({ ...r, text: async () => txt, clone: r.clone });
  r.text = async () => txt;
  return r;
}

/**
 * Carrega o sw.js real e dispara o `activate`.
 * `caches` simulado com varios caches nomeados, como no browser.
 */
async function ativar({ assets = [], shellHtml = null, outrosCaches = [], storageQuebrado = false }) {
  const listeners = new Map();
  const cacheAssets = criarCache(assets);
  const cacheShell = criarCache();
  if (shellHtml !== null) cacheShell.itens.set("/__zap_shell__", textoResposta(shellHtml));

  const porNome = new Map([
    ["zap-shell-v1", cacheShell],
    ["zap-assets-v1", cacheAssets],
  ]);
  for (const n of outrosCaches) porNome.set(n, criarCache(["/assets/velho.js"]));
  const apagados = [];
  let claimChamado = false;
  let leiturasDoShell = 0;

  const sandbox = {
    console,
    URL,
    setTimeout,
    clearTimeout,
    Response: class {},
    Request: class {},
    fetch: async () => textoResposta("<html></html>"),
    caches: {
      open: async (n) => {
        if (storageQuebrado) throw new Error("storage indisponivel");
        if (!porNome.has(n)) porNome.set(n, criarCache());
        return porNome.get(n);
      },
      keys: async () => {
        if (storageQuebrado) throw new Error("storage indisponivel");
        return [...porNome.keys()];
      },
      delete: async (n) => {
        apagados.push(n);
        return porNome.delete(n);
      },
      match: async (k) => {
        if (storageQuebrado) throw new Error("storage indisponivel");
        const chave = typeof k === "string" ? k : new URL(k.url).pathname;
        if (chave === "/__zap_shell__") leiturasDoShell++;
        for (const c of porNome.values()) {
          const hit = await c.match(chave);
          if (hit) return hit;
        }
        return undefined;
      },
    },
  };
  sandbox.self = {
    addEventListener: (nome, fn) => void listeners.set(nome, fn),
    location: { origin: ORIGEM },
    skipWaiting: async () => {},
    clients: {
      claim: async () => void (claimChamado = true),
      matchAll: async () => [],
      openWindow: async () => {},
    },
    registration: { showNotification: async () => {}, pushManager: {} },
  };
  sandbox.clients = sandbox.self.clients;

  runInContext(fonte, createContext(sandbox), { filename: "sw.js" });

  const handler = listeners.get("activate");
  if (typeof handler !== "function") throw new Error("sw.js nao registou listener de activate");
  let espera;
  handler({ waitUntil: (p) => void (espera = p) });
  await espera;

  return { restantes: [...cacheAssets.itens.keys()], apagados, claimChamado, leiturasDoShell };
}

const gerarAssets = (n, prefixo = "chunk") =>
  Array.from({ length: n }, (_, i) => `/assets/${prefixo}-${String(i).padStart(4, "0")}.js`);

console.log(`poda do cache de assets do SW (teto lido do sw.js: ${TETO})\n`);

// 1. abaixo do teto: nao remove nada
{
  const assets = gerarAssets(TETO - 5);
  const r = await ativar({ assets });
  ok(r.restantes.length === assets.length, "abaixo do teto: nao remove nada");
  ok(r.claimChamado, "abaixo do teto: clients.claim() correu");
}

// 2. exatamente no teto: nao remove nada (limite inclusivo)
{
  const r = await ativar({ assets: gerarAssets(TETO) });
  ok(r.restantes.length === TETO, "no teto exato: nao remove nada");
  // O retorno antecipado (`excedente <= 0`) existe para NAO pagar a leitura do shell em
  // cada activate quando nao ha nada a podar. Sem esta assercao, remover o guard seria um
  // mutante indetectavel (Math.min com negativo ja deixa o laco sem iteracoes).
  ok(r.leiturasDoShell === 0, "no teto exato: nao le o shell (sai antes)");
}

// 3. acima do teto: remove exatamente o excedente, os mais antigos primeiro
{
  const assets = gerarAssets(TETO + 30);
  const r = await ativar({ assets });
  ok(r.restantes.length === TETO, `acima do teto: fica exatamente ${TETO} (ficaram ${r.restantes.length})`);
  const removidos = assets.filter((a) => !r.restantes.includes(a));
  ok(
    removidos.length === 30 && removidos.every((a, i) => a === assets[i]),
    "acima do teto: removeu os 30 MAIS ANTIGOS (ordem de insercao)"
  );
  ok(r.restantes[r.restantes.length - 1] === assets[assets.length - 1], "acima do teto: o mais recente sobreviveu");
}

// 4. o caminho do boot nunca e podado, mesmo sendo o mais antigo
{
  const bootAssets = ["/assets/index-BEYLyeJg.js", "/assets/vendor-react-DOBzNqAb.js", "/assets/index-C7V_APnN.css"];
  // os do boot entram PRIMEIRO, logo seriam os primeiros candidatos sem a protecao
  const assets = [...bootAssets, ...gerarAssets(TETO + 40)];
  const shellHtml = `<!doctype html><html><head>
    <link rel="stylesheet" href="/assets/index-C7V_APnN.css">
    <link rel="modulepreload" href="/assets/vendor-react-DOBzNqAb.js">
    </head><body><script type="module" src="/assets/index-BEYLyeJg.js"></script></body></html>`;
  const r = await ativar({ assets, shellHtml });
  ok(
    bootAssets.every((a) => r.restantes.includes(a)),
    "shell: os assets do boot sobreviveram apesar de serem os mais antigos"
  );
  ok(r.restantes.length === TETO, `shell: mesmo assim respeitou o teto (${r.restantes.length})`);
}

// 5. nao regredir: caches com NOME antigo continuam a ser apagados
{
  const r = await ativar({ assets: gerarAssets(3), outrosCaches: ["zap-assets-v0", "zap-shell-antigo"] });
  ok(
    r.apagados.includes("zap-assets-v0") && r.apagados.includes("zap-shell-antigo"),
    "nomes antigos: caches zap-* de versoes anteriores continuam apagados"
  );
  ok(!r.apagados.includes("zap-assets-v1"), "nomes antigos: o cache ATUAL nao e apagado");
}

// 6. storage quebrado: activate nao lanca e clients.claim() ainda corre
{
  let lancou = false;
  let r = null;
  try {
    r = await ativar({ assets: gerarAssets(TETO + 10), storageQuebrado: true });
  } catch (_) {
    lancou = true;
  }
  ok(!lancou, "storage quebrado: activate nao lanca");
  ok(r?.claimChamado === true, "storage quebrado: clients.claim() ainda correu");
}

console.log(falhas === 0 ? "\nTODOS OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
