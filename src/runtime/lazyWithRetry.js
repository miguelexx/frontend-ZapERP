import { lazy } from "react";
import { isDynamicImportFetchError, triggerStaleChunkReload } from "./vitePreloadRecovery.js";

const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 300;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Importa um chunk dinâmico retentando falhas transitórias de rede antes de
 * propagar o erro para o React.lazy.
 *
 * Motivo: `React.lazy(() => import(...))` cacheia a promise da fábrica. Se o
 * primeiro request do chunk falhar por um soluço de rede (ex.: HTTP/3
 * `ERR_QUIC_PROTOCOL_ERROR`, `Failed to fetch dynamically imported module`), a
 * promise fica rejeitada para sempre — o componente nunca monta e o render
 * estoura `Cannot read properties of undefined (reading 'default')`.
 *
 * Ao retentar o `import()` DENTRO da fábrica, a primeira montagem já ganha
 * várias tentativas: o blip transitório se recupera sozinho e a tela carrega
 * normalmente. Só depois de esgotar as tentativas o erro é repropagado (o
 * ErrorBoundary então oferece "Recarregar").
 *
 * @template T
 * @param {() => Promise<T>} factory fábrica do import dinâmico
 * @param {{ retries?: number, backoffMs?: number }} [options]
 * @returns {Promise<T>}
 */
export function retryDynamicImport(factory, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : DEFAULT_RETRIES;
  const backoffMs = Number.isFinite(options.backoffMs) ? options.backoffMs : DEFAULT_BACKOFF_MS;

  const attempt = (remaining, delay) =>
    factory().catch((error) => {
      // Só retenta falhas de rede/carregamento de chunk. Erros reais de
      // execução do módulo devem subir na hora.
      if (remaining <= 0 || !isDynamicImportFetchError(error)) {
        throw error;
      }
      return wait(delay).then(() => attempt(remaining - 1, delay * 2));
    });

  return attempt(retries, backoffMs);
}

/**
 * Substituto direto de `React.lazy` com retentativa embutida de chunk.
 * Uso: `const View = lazyWithRetry(() => import("./View"));`
 *
 * @template {import("react").ComponentType<any>} T
 * @param {() => Promise<{ default: T }>} factory
 * @param {{ retries?: number, backoffMs?: number }} [options]
 */
export function lazyWithRetry(factory, options) {
  return lazy(() =>
    retryDynamicImport(factory, options).catch((error) => {
      // Chunk faltando de forma permanente (404 após deploy: a aba tem um
      // index.html antigo com hashes que não existem mais). Retentar não
      // adianta — recarrega a aba UMA vez para pegar o index.html novo.
      if (isDynamicImportFetchError(error) && triggerStaleChunkReload()) {
        // Reload em andamento: segura o Suspense até a navegação acontecer,
        // em vez de deixar o React.lazy estourar "reading 'default'".
        return new Promise(() => {});
      }
      // Já recarregou nesta janela (deploy realmente inconsistente) ou storage
      // bloqueado → propaga para o ErrorBoundary oferecer "Recarregar".
      throw error;
    })
  );
}

export const lazyWithRetryConstants = {
  DEFAULT_RETRIES,
  DEFAULT_BACKOFF_MS,
};
