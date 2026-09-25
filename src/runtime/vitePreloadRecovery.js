const RELOAD_MARKER_KEY = "zaperp:vite-preload-reload-at";
const RELOAD_QUERY_PARAM = "__zaperp_chunk_reload";
const RELOAD_GUARD_MS = 60_000;
const FLUSH_COMPOSER_DRAFT_EVENT = "zaperp:flush-composer-draft";

const DYNAMIC_IMPORT_ERROR_PATTERNS = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "chunkloaderror",
  "loading chunk",
];

function getErrorMessage(value) {
  if (typeof value === "string") return value;
  if (typeof value?.message === "string") return value.message;
  return "";
}

export function isDynamicImportFetchError(value) {
  const message = getErrorMessage(value).toLowerCase();
  return DYNAMIC_IMPORT_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function flushComposerDraft(runtime = window) {
  try {
    runtime.dispatchEvent?.(new Event(FLUSH_COMPOSER_DRAFT_EVENT));
  } catch (_) {
    /* ignore */
  }
}

/**
 * Trata falha de chunk/preload do Vite sem recarregar a aba.
 * location.reload/replace apagava o texto que o atendente ainda digitava.
 * @returns {false} nunca navega; o preventDefault evita o overlay do Vite relançar o erro.
 */
export function recoverFromVitePreloadError(event, runtime = window, _now = Date.now()) {
  event?.preventDefault?.();
  flushComposerDraft(runtime);
  return false;
}

/**
 * Recarrega a aba UMA vez quando um chunk lazy falha de forma permanente
 * (tipicamente 404 após deploy: a aba ainda tem o `index.html` antigo apontando
 * para hashes de chunk que não existem mais no servidor). Retentar o mesmo
 * `import()` não resolve — só um reload busca o `index.html` novo com os hashes
 * corretos.
 *
 * Diferente do handler global (`recoverFromVitePreloadError`), que NUNCA
 * recarrega para não apagar o texto que o atendente digita: aqui o reload só é
 * disparado quando uma TELA lazy não consegue montar (navegação), depois de
 * esgotadas as retentativas de rede — não durante digitação.
 *
 * Guarda anti-loop: grava o instante no `sessionStorage` e só recarrega de novo
 * após `RELOAD_GUARD_MS`. Se o chunk continuar faltando após o reload (deploy
 * realmente inconsistente) ou o storage estiver bloqueado, retorna `false` e o
 * ErrorBoundary assume ("Recarregar").
 *
 * @returns {boolean} true se iniciou o reload; false se a guarda bloqueou.
 */
export function triggerStaleChunkReload(runtime = window, now = Date.now()) {
  let store;
  try {
    store = runtime?.sessionStorage;
    const last = Number(store?.getItem(RELOAD_MARKER_KEY)) || 0;
    if (last && now - last < RELOAD_GUARD_MS) return false;
    store?.setItem(RELOAD_MARKER_KEY, String(now));
  } catch (_) {
    // Sem sessionStorage confiável não há como impedir loop → não arrisca.
    return false;
  }
  flushComposerDraft(runtime);
  try {
    runtime?.location?.reload?.();
  } catch (_) {
    return false;
  }
  return true;
}

export function installVitePreloadRecovery(runtime = window) {
  runtime.addEventListener("vite:preloadError", (event) => {
    recoverFromVitePreloadError(event, runtime);
  });

  // Fallback para navegadores/fluxos em que a falha do import() chega como
  // rejeicao global sem passar pelo evento especifico do Vite.
  runtime.addEventListener("unhandledrejection", (event) => {
    if (!isDynamicImportFetchError(event?.reason)) return;
    recoverFromVitePreloadError(event, runtime);
  });

  runtime.addEventListener("error", (event) => {
    const error = event?.error || event?.message;
    if (!isDynamicImportFetchError(error)) return;
    recoverFromVitePreloadError(event, runtime);
  });

  const url = new URL(runtime.location.href);
  if (!url.searchParams.has(RELOAD_QUERY_PARAM)) return;
  // URLs antigas ainda podem trazer o query de recuperação; só limpa a barra.
  runtime.setTimeout?.(() => {
    const cleanUrl = new URL(runtime.location.href);
    cleanUrl.searchParams.delete(RELOAD_QUERY_PARAM);
    runtime.history.replaceState(runtime.history.state, "", cleanUrl.toString());
  }, RELOAD_GUARD_MS);
}

export const vitePreloadRecoveryConstants = {
  RELOAD_MARKER_KEY,
  RELOAD_QUERY_PARAM,
  RELOAD_GUARD_MS,
  DYNAMIC_IMPORT_ERROR_PATTERNS,
  FLUSH_COMPOSER_DRAFT_EVENT,
};
