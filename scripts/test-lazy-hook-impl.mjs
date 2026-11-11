/**
 * Guarda da FASE 1 do corte do chunk ConversaView (doc 40 §3.8, 12-PERFORMANCE "Hooks lazy").
 *
 * Os modais da conversa já eram lazy, mas os hooks que os alimentam entravam no chunk
 * crítico por import estático. Agora cada hook é uma casca (estado + disparador) e o
 * corpo vive em `*.impl.js`, carregado por `useLazyHookImpl` na primeira invocação.
 *
 * O que este arquivo trava:
 *   1) a fronteira: nenhuma casca nem o ConversaView importa um `.impl` estaticamente
 *      (uma linha `import ... from "./useX.impl"` devolveria os 70 KB ao chunk principal);
 *   2) `loadHookImpl` deduplica chamadas em voo, cacheia o módulo e deixa tentar de novo
 *      depois de uma falha;
 *   3) `prefetchChunk` dispara uma vez e libera a retentativa se o prefetch falhar;
 *   4) a fila de UMA ação do `withImpl`: enquanto o chunk desce, a segunda chamada é
 *      descartada (anti-duplo-envio) e, com o chunk em cache, a chamada é síncrona.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (rel) => readFileSync(join(raiz, rel), "utf8");

let falhas = 0;
const checar = (ok, msg) => {
  if (!ok) {
    falhas++;
    console.error(`FALHOU: ${msg}`);
  }
};
const virarMicrotasks = () => new Promise((r) => setTimeout(r, 0));

const HOOKS = [
  "useSendCatalog",
  "useSendPoll",
  "useShareContact",
  "useShareLocation",
  "useAddToGroup",
  "useConversationCall",
  "usePixConfig",
  "useForwardFlow",
];

/* ------------------------------ 1) fronteira ------------------------------ */

for (const nome of HOOKS) {
  const casca = `src/conversa/hooks/${nome}.js`;
  const impl = `src/conversa/hooks/${nome}.impl.js`;
  checar(existsSync(join(raiz, impl)), `${impl} existe`);
  const src = ler(casca);
  checar(
    !/^\s*import[^;]*from\s+["'][^"']*\.impl["']/m.test(src),
    `${casca}: NÃO pode importar o .impl estaticamente (voltaria ao chunk principal)`
  );
  checar(
    new RegExp(`import\\(\\s*["']\\./${nome}\\.impl["']\\s*\\)`).test(src),
    `${casca}: carrega o corpo por import() dinâmico de ./${nome}.impl`
  );
  checar(src.includes("useLazyHookImpl("), `${casca}: usa useLazyHookImpl`);
  const implSrc = ler(impl);
  checar(!/from\s+["']react["']/.test(implSrc), `${impl}: corpo é módulo puro (sem hooks do React)`);
}
const conversaView = ler("src/conversa/ConversaView.jsx");
checar(!/\.impl["']/.test(conversaView), "ConversaView.jsx não referencia nenhum .impl");
const overlays = ler("src/conversa/components/ConversaViewOverlays.jsx");
checar(!/\.impl["']/.test(overlays), "ConversaViewOverlays.jsx não referencia nenhum .impl");

/* ------------------------- 2) loadHookImpl / getHookImpl ------------------------- */

const { loadHookImpl, getHookImpl, prefetchChunk, useLazyHookImpl } = await import(
  "../src/conversa/hooks/lazyHookImpl.js"
);

{
  let chamadas = 0;
  let resolver;
  const modulo = { corpo: () => "ok" };
  const loader = () => {
    chamadas++;
    return new Promise((r) => {
      resolver = r;
    });
  };
  checar(getHookImpl(loader) === null, "antes de carregar, getHookImpl é null");
  const p1 = loadHookImpl(loader);
  const p2 = loadHookImpl(loader);
  checar(chamadas === 1, "duas chamadas em voo disparam o loader UMA vez");
  checar(p1 === p2, "a mesma promise é compartilhada enquanto desce");
  resolver(modulo);
  const [m1, m2] = await Promise.all([p1, p2]);
  checar(m1 === modulo && m2 === modulo, "as duas chamadas recebem o mesmo módulo");
  checar(getHookImpl(loader) === modulo, "depois de carregar, getHookImpl devolve o módulo SÍNCRONO");
  await loadHookImpl(loader);
  checar(chamadas === 1, "com o módulo em cache o loader não roda de novo");
}

{
  // Falha que não é de rede: retryDynamicImport não retenta; o inflight precisa ser limpo
  // para a PRÓXIMA ação poder tentar de novo (senão a função morre até o F5).
  let chamadas = 0;
  const loader = () => {
    chamadas++;
    return chamadas === 1 ? Promise.reject(new Error("SyntaxError no módulo")) : Promise.resolve({ ok: true });
  };
  let erro = null;
  try {
    await loadHookImpl(loader);
  } catch (e) {
    erro = e;
  }
  checar(erro?.message === "SyntaxError no módulo", "a falha do loader sobe para quem chamou");
  checar(getHookImpl(loader) === null, "falha não entra no cache");
  const m = await loadHookImpl(loader);
  checar(m?.ok === true && chamadas === 2, "depois da falha, a próxima chamada tenta de novo");
}

/* ------------------------------ 3) prefetchChunk ------------------------------ */

{
  let chamadas = 0;
  const loader = () => {
    chamadas++;
    return Promise.resolve({});
  };
  prefetchChunk(loader);
  prefetchChunk(loader);
  checar(chamadas === 1, "prefetchChunk dispara o import UMA vez");
  prefetchChunk(undefined);
  prefetchChunk(null);
  checar(true, "prefetchChunk sem loader não explode");

  let falhasPrefetch = 0;
  const loaderRuim = () => {
    falhasPrefetch++;
    return Promise.reject(new Error("offline"));
  };
  prefetchChunk(loaderRuim);
  await virarMicrotasks();
  prefetchChunk(loaderRuim);
  await virarMicrotasks();
  checar(falhasPrefetch === 2, "prefetch que falhou libera a retentativa na próxima vez");
}

/* ------------------------- 4) withImpl: fila de UMA ação ------------------------- */

{
  // renderToString roda o corpo do hook (useState/useRef/useCallback) sem efeitos — basta
  // para capturar `withImpl` e exercitar a fila fora do React.
  let capturado = null;
  const toasts = [];
  let resolver;
  const modulo = { acao: (ctx) => `rodou:${ctx}` };
  const loader = () =>
    new Promise((r) => {
      resolver = r;
    });
  function Sonda() {
    capturado = useLazyHookImpl(loader, { showToast: (t) => toasts.push(t), label: "Teste" });
    return null;
  }
  renderToString(React.createElement(Sonda));
  checar(capturado && typeof capturado.withImpl === "function", "useLazyHookImpl devolve withImpl");

  const resultados = [];
  const r1 = capturado.withImpl((impl) => {
    resultados.push(impl.acao("primeiro"));
    return "r1";
  });
  const r2 = capturado.withImpl((impl) => {
    resultados.push(impl.acao("segundo"));
    return "r2";
  });
  checar(typeof r1?.then === "function", "sem cache, withImpl devolve promise (chunk descendo)");
  checar(r2 === undefined, "enquanto o chunk desce, a SEGUNDA ação é descartada (anti-duplo-envio)");
  checar(resultados.length === 0, "nada roda antes do chunk chegar");
  resolver(modulo);
  const v1 = await r1;
  checar(v1 === "r1" && resultados.length === 1 && resultados[0] === "rodou:primeiro", "a primeira ação roda quando o chunk chega");

  const r3 = capturado.withImpl((impl) => impl.acao("terceiro"));
  checar(r3 === "rodou:terceiro", "com o chunk em cache, withImpl é SÍNCRONO e devolve o valor");
  checar(toasts.length === 0, "sem falha, nenhum toast");
}

{
  // Falha definitiva do chunk: toast de erro + onError (quem chamou devolve flags como busy).
  let capturado = null;
  const toasts = [];
  const loader = () => Promise.reject(new Error("TypeError: módulo quebrado"));
  function Sonda() {
    capturado = useLazyHookImpl(loader, { showToast: (t) => toasts.push(t), label: "Pix" });
    return null;
  }
  renderToString(React.createElement(Sonda));
  let onErrorChamado = 0;
  // O helper loga a falha com console.error (útil em produção, ruído aqui).
  const consoleErrorOriginal = console.error;
  console.error = () => {};
  let r;
  try {
    r = await capturado.withImpl(() => "nunca", () => {
      onErrorChamado++;
    });
  } finally {
    console.error = consoleErrorOriginal;
  }
  checar(r === undefined, "falha de carga: withImpl resolve undefined (não roda a ação)");
  checar(onErrorChamado === 1, "falha de carga: onError roda uma vez (devolve busy/sending)");
  checar(toasts.length === 1 && toasts[0]?.type === "error" && toasts[0]?.title === "Pix", "falha de carga: toast de erro com o label do hook");
  console.error = () => {};
  try {
    const r2 = capturado.withImpl(() => "de novo");
    checar(typeof r2?.then === "function", "depois da falha a fila libera e dá para tentar de novo");
    await r2;
  } finally {
    console.error = consoleErrorOriginal;
  }
}

if (falhas) {
  console.error(`test-lazy-hook-impl: ${falhas} falha(s)`);
  process.exit(1);
}
console.log("test-lazy-hook-impl: OK");
