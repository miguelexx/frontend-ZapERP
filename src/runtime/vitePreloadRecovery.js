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
