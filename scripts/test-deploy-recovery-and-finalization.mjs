import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeFinalizationMessage } from "../src/pages/iaConfigPayload.js";
import { FLUSH_COMPOSER_DRAFT_EVENT } from "../src/conversa/composerDraftStore.js";
import {
  installVitePreloadRecovery,
  isDynamicImportFetchError,
  recoverFromVitePreloadError,
  vitePreloadRecoveryConstants,
} from "../src/runtime/vitePreloadRecovery.js";

assert.deepEqual(normalizeFinalizationMessage(true, "  Atendimento encerrado  "), {
  enviarMensagemFinalizacao: true,
  mensagemFinalizacao: "Atendimento encerrado",
});
assert.deepEqual(normalizeFinalizationMessage(true, "   "), {
  enviarMensagemFinalizacao: false,
  mensagemFinalizacao: "",
});
assert.deepEqual(normalizeFinalizationMessage(false, "Mensagem preservada"), {
  enviarMensagemFinalizacao: false,
  mensagemFinalizacao: "Mensagem preservada",
});

assert.equal(
  vitePreloadRecoveryConstants.FLUSH_COMPOSER_DRAFT_EVENT,
  FLUSH_COMPOSER_DRAFT_EVENT
);

const storage = new Map();
const replacedUrls = [];
const dispatched = [];
const runtime = {
  location: {
    href: "https://zaperp.wmsistemas.inf.br/ia",
    replace(url) {
      replacedUrls.push(url);
    },
  },
  sessionStorage: {
    getItem(key) {
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      storage.set(key, value);
    },
  },
  dispatchEvent(event) {
    dispatched.push(event?.type);
    return true;
  },
};

let prevented = 0;
const event = { preventDefault: () => { prevented += 1; } };
assert.equal(recoverFromVitePreloadError(event, runtime, 100_000), false);
assert.equal(prevented, 1);
assert.equal(replacedUrls.length, 0);
assert.deepEqual(dispatched, [FLUSH_COMPOSER_DRAFT_EVENT]);

assert.equal(recoverFromVitePreloadError(event, runtime, 100_100), false);
assert.equal(prevented, 2);
assert.equal(replacedUrls.length, 0);

const runtimeWithoutStorage = {
  location: {
    href: "https://zaperp.wmsistemas.inf.br/ia?__zaperp_chunk_reload=100000",
    replace() {
      throw new Error("nao deveria recarregar automaticamente");
    },
  },
  sessionStorage: {
    getItem() {
      throw new Error("storage bloqueado");
    },
  },
  dispatchEvent() {
    throw new Error("dispatch bloqueado");
  },
};
assert.equal(recoverFromVitePreloadError(event, runtimeWithoutStorage, 100_100), false);
assert.equal(prevented, 3);
assert.equal(replacedUrls.length, 0);

const afterGuard = 100_000 + vitePreloadRecoveryConstants.RELOAD_GUARD_MS;
assert.equal(recoverFromVitePreloadError(event, runtime, afterGuard), false);
assert.equal(prevented, 4);
assert.equal(replacedUrls.length, 0);

assert.equal(
  isDynamicImportFetchError(
    new TypeError(
      "Failed to fetch dynamically imported module: https://zaperp.wmsistemas.inf.br/assets/IA-SaSgE-fB.js"
    )
  ),
  true
);
assert.equal(isDynamicImportFetchError(new Error("Network Error")), false);

const sourceIndexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(
  sourceIndexHtml,
  /http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/
);
assert.match(sourceIndexHtml, /http-equiv="Pragma" content="no-cache"/);
assert.match(sourceIndexHtml, /http-equiv="Expires" content="0"/);

const listeners = new Map();
const installedRuntime = {
  location: {
    href: "https://zaperp.wmsistemas.inf.br/ia",
    replace() {
      throw new Error("nao deveria recarregar automaticamente");
    },
  },
  sessionStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  addEventListener(type, listener) {
    listeners.set(type, listener);
  },
  dispatchEvent() {
    return true;
  },
};
installVitePreloadRecovery(installedRuntime);
assert.deepEqual([...listeners.keys()].sort(), ["error", "unhandledrejection", "vite:preloadError"]);

let unrelatedPrevented = 0;
listeners.get("unhandledrejection")({
  reason: new Error("Falha comum da API"),
  preventDefault() {
    unrelatedPrevented += 1;
  },
});
assert.equal(unrelatedPrevented, 0);

let dynamicImportPrevented = 0;
listeners.get("unhandledrejection")({
  reason: new TypeError(
    "Failed to fetch dynamically imported module: https://zaperp.wmsistemas.inf.br/assets/IA-antigo.js"
  ),
  preventDefault() {
    dynamicImportPrevented += 1;
  },
});
assert.equal(dynamicImportPrevented, 1);
assert.equal(installedRuntime.location.href.includes("__zaperp_chunk_reload="), false);

// --- retryDynamicImport: retenta soluços de rede antes de propagar o erro ---
const { retryDynamicImport } = await import("../src/runtime/lazyWithRetry.js");

// 1) Sucesso após uma falha transitória de chunk (ex.: ERR_QUIC → "Failed to fetch")
let flakyAttempts = 0;
const flakyModule = { default: "ConversaView" };
const flakyResult = await retryDynamicImport(
  () => {
    flakyAttempts += 1;
    if (flakyAttempts < 2) {
      return Promise.reject(
        new TypeError(
          "Failed to fetch dynamically imported module: /assets/ConversaView-abc.js"
        )
      );
    }
    return Promise.resolve(flakyModule);
  },
  { backoffMs: 0 }
);
assert.equal(flakyAttempts, 2);
assert.equal(flakyResult, flakyModule);

// 2) Erro de execução do módulo NÃO é retentado (sobe na primeira tentativa)
let runtimeAttempts = 0;
await assert.rejects(
  () =>
    retryDynamicImport(
      () => {
        runtimeAttempts += 1;
        return Promise.reject(new ReferenceError("x is not defined"));
      },
      { backoffMs: 0 }
    ),
  /x is not defined/
);
assert.equal(runtimeAttempts, 1);

// 3) Falha persistente de chunk esgota as tentativas e propaga o erro
let persistentAttempts = 0;
await assert.rejects(
  () =>
    retryDynamicImport(
      () => {
        persistentAttempts += 1;
        return Promise.reject(new TypeError("error loading dynamically imported module"));
      },
      { retries: 2, backoffMs: 0 }
    ),
  /error loading dynamically imported module/
);
assert.equal(persistentAttempts, 3); // 1 inicial + 2 retentativas

console.log("deploy recovery and finalization config: ok");
