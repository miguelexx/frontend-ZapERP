/**
 * Guarda do CORTE DAS 3 ARESTAS que punham o motor de conversas no boot.
 *
 * Medido em 23/10/2026 (`docs/audits/boot-mobile-2026-10-23.md`): o chunk de entrada
 * tinha 82 modulos / 858 kB de fonte, e ~59% era `conversa/` + `chats/` + `socket/` —
 * tudo parseado e EXECUTADO antes do primeiro render, no celular.
 *
 * Entrava por tres arestas que ninguem suspeitava:
 *   api/http.js      -> socket/socket.js       (so' `disconnectSocket()` no 401)
 *   api/http.js      -> conversa/conversaStore (so' `clearConversaSessionCaches()`)
 *   push/swBridge.js -> conversa/conversaStore (so' ler `selectedId`)
 *   auth/authStore   -> socket + chatsStore + conversaStore
 *
 * `api/http.js` e' importado por quase tudo, logo o motor entrava por um caminho
 * invisivel. Tentar `import()` dinamico DENTRO do handler de 401 nao serve: ali
 * logo a seguir vem `location.href = "/login"` e a recarga pode chegar antes do
 * modulo — a limpeza ficaria por fazer, as vezes.
 *
 * A solucao foi INVERTER a dependencia: quem e' pesado regista-se em
 * `runtime/sessionRuntime.js` ao carregar; quem e' leve so' chama o que estiver
 * registado. Se um modulo nunca carregou, nao ha estado dele para limpar — o no-op
 * e' a resposta CORRETA.
 *
 * O que este teste trava:
 *   1. `sessionRuntime` NAO pode importar nada (e' isso que o deixa entrar no boot);
 *   2. o registo funciona: executa, isola erro, remove;
 *   3. `lerDoMotor` devolve o padrao quando o motor nao carregou;
 *   4. as 3 arestas continuam cortadas (import estatico nao pode voltar);
 *   5. os modulos pesados continuam a REGISTAR-SE (senao o 401 deixa de limpar);
 *   6. o fecho estatico de `main.jsx` nao contem mais o motor.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(RAIZ, "src");
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");

// ---------------------------------------------------------------------------
// 1. O arquivo-ponte nao pode importar NADA
// ---------------------------------------------------------------------------
{
  const txt = ler("src/runtime/sessionRuntime.js");
  const imports = txt.match(/^\s*import\s[^\n]*/gm) || [];
  assert.equal(
    imports.length,
    0,
    `runtime/sessionRuntime.js tem de ficar SEM imports — e' isso que o deixa entrar no chunk de entrada sem arrastar nada. Encontrado: ${imports.join(" | ")}`
  );
}

// ---------------------------------------------------------------------------
// 2 + 3. Comportamento do registo
// ---------------------------------------------------------------------------
{
  const rt = await import("../src/runtime/sessionRuntime.js");
  rt.__resetSessionRuntime();

  // lerDoMotor sem registo -> padrao
  assert.equal(rt.lerDoMotor("conversaSelecionada"), null, "sem motor carregado, lerDoMotor devolve null");
  assert.equal(rt.lerDoMotor("qualquer", "padrao"), "padrao", "o padrao informado e' respeitado");

  // executar sem nada registado nao pode estourar
  assert.doesNotThrow(() => rt.executarLimpezaDeSessao(), "limpeza sem registos tem de ser no-op");

  const ordem = [];
  rt.registrarLimpezaDeSessao("a", () => ordem.push("a"));
  rt.registrarLimpezaDeSessao("estoura", () => {
    throw new Error("falha de proposito");
  });
  rt.registrarLimpezaDeSessao("b", () => ordem.push("b"));

  rt.executarLimpezaDeSessao();
  assert.deepEqual(
    ordem,
    ["a", "b"],
    "uma limpeza que estoura NAO pode impedir as outras — no 401 isto corre antes de location.href"
  );

  // registar com o mesmo nome substitui (HMR nao duplica)
  ordem.length = 0;
  rt.registrarLimpezaDeSessao("a", () => ordem.push("a2"));
  rt.executarLimpezaDeSessao();
  assert.ok(!ordem.includes("a"), "registar com o mesmo nome tem de substituir, nao somar");
  assert.ok(ordem.includes("a2"), "a substituicao tem de valer");

  // remover
  const remover = rt.registrarLimpezaDeSessao("c", () => ordem.push("c"));
  remover();
  ordem.length = 0;
  rt.executarLimpezaDeSessao();
  assert.ok(!ordem.includes("c"), "a funcao devolvida tem de remover o registo");

  // leitor
  rt.registrarLeitor("conversaSelecionada", () => 42);
  assert.equal(rt.lerDoMotor("conversaSelecionada"), 42, "leitor registado tem de ser usado");
  rt.registrarLeitor("explode", () => {
    throw new Error("x");
  });
  assert.equal(rt.lerDoMotor("explode", "padrao"), "padrao", "leitor que estoura cai no padrao");

  rt.__resetSessionRuntime();
}

// ---------------------------------------------------------------------------
// 4. As 3 arestas continuam cortadas
// ---------------------------------------------------------------------------
const PROIBIDO = [
  ["src/api/http.js", /^import[^\n]*["']\.\.\/socket\/socket["']/m, "api/http.js nao pode importar socket/socket: e' importado por quase tudo e arrasta o motor inteiro"],
  ["src/api/http.js", /^import[^\n]*conversa\/conversaStore/m, "api/http.js nao pode importar conversaStore"],
  ["src/push/swBridge.js", /^import[^\n]*conversa\/conversaStore/m, "push/swBridge.js nao pode importar conversaStore — use lerDoMotor('conversaSelecionada')"],
  ["src/auth/authStore.js", /^import[^\n]*["']\.\.\/socket\/socket["']/m, "authStore nao pode importar socket estaticamente — initSocket entra por import() dinamico"],
  ["src/auth/authStore.js", /^import[^\n]*chats\/chatsStore/m, "authStore nao pode importar chatsStore"],
  ["src/auth/authStore.js", /^import[^\n]*conversa\/conversaStore/m, "authStore nao pode importar conversaStore"],
];
for (const [arq, re_, msg] of PROIBIDO) {
  assert.ok(!re_.test(ler(arq)), msg);
}

// O prefetch do boot FICA estatico de proposito (e' o GET /chats; adia-lo atrasa a lista).
assert.ok(
  /^import[^\n]*chats\/prefetchDefaultChatList/m.test(ler("src/auth/authStore.js")),
  "prefetchDefaultChatList tem de continuar ESTATICO no authStore: e' o GET /chats do boot"
);

// ---------------------------------------------------------------------------
// 5. Os modulos pesados continuam a registar-se
// ---------------------------------------------------------------------------
const REGISTOS = [
  ["src/socket/socket.js", 'registrarLimpezaDeSessao("socket"', "sem isto o 401 deixa de desligar o socket"],
  ["src/chats/chatsStore.js", 'registrarLimpezaDeSessao("chatsStore"', "sem isto o logout deixa lista da sessao anterior"],
  ["src/chats/chatListSidebarCache.js", 'registrarLimpezaDeSessao("chatListSidebarCache"', "sem isto o cache da sidebar sobrevive ao logout"],
  ["src/conversa/conversaStore.js", 'registrarLimpezaDeSessao("conversaStore"', "sem isto o 401 deixa caches de conversa"],
  ["src/conversa/conversaStore.js", 'registrarLeitor("conversaSelecionada"', "sem isto o swBridge nunca suprime push de conversa aberta"],
];
for (const [arq, trecho, msg] of REGISTOS) {
  const txt = ler(arq);
  assert.ok(txt.includes(trecho), `${arq}: falta \`${trecho}\` — ${msg}`);
  assert.ok(
    /^import[^\n]*runtime\/sessionRuntime/m.test(txt),
    `${arq}: regista mas NAO importa sessionRuntime — seria ReferenceError em producao`
  );
}

// E quem consome tem de chamar
assert.ok(ler("src/api/http.js").includes("executarLimpezaDeSessao()"), "http.js tem de executar a limpeza no 401");
assert.ok(ler("src/auth/authStore.js").includes("executarLimpezaDeSessao()"), "clearSession tem de executar a limpeza");
assert.ok(ler("src/push/swBridge.js").includes('lerDoMotor("conversaSelecionada")'), "swBridge tem de ler pelo registo");

// ---------------------------------------------------------------------------
// 6. O motor saiu do fecho estatico de main.jsx
// ---------------------------------------------------------------------------
{
  const exts = ["", ".js", ".jsx", ".ts", ".tsx", "/index.js", "/index.jsx"];
  const RE = /(?:^|\n)[ \t]*import[ \t]+(?:[^;'"]*?from[ \t]*)?['"]([^'"]+)['"]/g;
  const resolver = (spec, from) => {
    if (!spec.startsWith(".")) return null;
    const base = path.resolve(path.dirname(from), spec);
    for (const e of exts) {
      const p = base + e;
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch {}
    }
    return null;
  };
  const vistos = new Set();
  const pilha = [path.join(SRC, "main.jsx")];
  let bytes = 0;
  while (pilha.length) {
    const f = pilha.pop();
    if (vistos.has(f)) continue;
    vistos.add(f);
    let txt = "";
    try {
      txt = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    bytes += txt.length;
    for (const m of txt.matchAll(RE)) {
      if (m[1].endsWith(".css")) continue;
      const r = resolver(m[1], f);
      if (r) pilha.push(r);
    }
  }
  const rel = (f) => path.relative(SRC, f).split(path.sep).join("/");
  const nomes = [...vistos].map(rel);

  for (const pesado of [
    "conversa/conversaStore.js",
    "socket/socket.js",
    "chats/chatsStore.js",
    "conversa/conversaOutboundMediaMerge.js",
    "conversa/utils/conversaViewHelpers.js",
  ]) {
    assert.ok(
      !nomes.includes(pesado),
      `${pesado} voltou para o chunk de entrada — o celular passa a parsea-lo antes do primeiro render`
    );
  }

  const kb = bytes / 1024;
  assert.ok(
    kb < 450,
    `o chunk de entrada cresceu para ${kb.toFixed(0)} kB de fonte (era 858 antes do corte, 328 depois). Teto do teste: 450 kB.`
  );
}

console.log("OK — corte das 3 arestas: registo, limpeza do 401 e motor fora do boot.");
