import { useCallback, useEffect, useRef, useState } from "react";
// Extensão explícita: o teste Node (scripts/test-lazy-hook-impl.mjs) importa este módulo direto.
import { retryDynamicImport } from "../../runtime/lazyWithRetry.js";
import { isDynamicImportFetchError, triggerStaleChunkReload } from "../../runtime/vitePreloadRecovery.js";

/**
 * Corpo pesado de um hook atrás de uma fronteira dinâmica (doc 40 §3.8, fase 1).
 *
 * Os modais da conversa já são lazy, mas os hooks que os alimentam eram importados
 * estaticamente pelo ConversaView — a lógica de encaminhar/enquete/Pix/etc. entrava no
 * chunk crítico da thread mesmo sem o modal abrir. Aqui o hook "casca" fica no chunk
 * principal com o estado mínimo (useState/useRef) e os disparadores; o módulo `*.impl.js`
 * com os corpos (API, toasts, efeitos de busca) só desce na primeira invocação.
 *
 * Regras do hook casca (as armadilhas de cada um estão no doc 12-PERFORMANCE):
 * - Tudo o que precisa acontecer DENTRO do clique (fechar painéis do composer, pedir
 *   geolocalização, validar seleção, trocar estado que o modal usa para abrir) fica na
 *   casca — nunca atrás do import().
 * - O impl recebe um SNAPSHOT do contexto do momento do clique (estado + setters + refs),
 *   equivalente ao closure que o useCallback original capturava.
 * - Enquanto o chunk desce, só a PRIMEIRA ação fica na fila; as demais são descartadas
 *   (mesmo efeito da guarda `sending` que cada corpo já tinha). Com o chunk em cache a
 *   chamada é 100% síncrona.
 */

const loadedByLoader = new Map();
const inflightByLoader = new Map();
const prefetchStarted = new Set();

export function getHookImpl(loader) {
  return loadedByLoader.get(loader) || null;
}

export function loadHookImpl(loader) {
  const cached = loadedByLoader.get(loader);
  if (cached) return Promise.resolve(cached);
  let inflight = inflightByLoader.get(loader);
  if (!inflight) {
    inflight = retryDynamicImport(loader).then(
      (mod) => {
        loadedByLoader.set(loader, mod);
        inflightByLoader.delete(loader);
        return mod;
      },
      (err) => {
        inflightByLoader.delete(loader);
        throw err;
      }
    );
    inflightByLoader.set(loader, inflight);
  }
  return inflight;
}

/**
 * Aquece o chunk de um modal lazy em paralelo com o impl. O `import()` nativo deduplica
 * pela URL, então o `React.lazy` do modal reaproveita a requisição em voo.
 */
export function prefetchChunk(loader) {
  if (typeof loader !== "function" || prefetchStarted.has(loader)) return;
  prefetchStarted.add(loader);
  try {
    Promise.resolve(loader()).catch(() => {
      // Falhou (offline/404): deixa o React.lazy do modal tentar de novo com retry próprio.
      prefetchStarted.delete(loader);
    });
  } catch (_) {
    prefetchStarted.delete(loader);
  }
}

/**
 * @param {() => Promise<object>} loader `() => import("./useX.impl")` — constante de módulo.
 * @param {{ showToast?: Function, label?: string, prefetch?: () => Promise<any> }} [options]
 * @returns {{ impl: object|null, ensureImpl: () => void, withImpl: (fn: (impl: object) => any, onError?: (err: any) => void) => any }}
 */
export function useLazyHookImpl(loader, options = {}) {
  const { showToast, label, prefetch } = options;
  const [impl, setImpl] = useState(() => getHookImpl(loader));
  const mountedRef = useRef(false);
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  /** Uma ação adiada por vez enquanto o chunk desce (ver cabeçalho). */
  const gateRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleLoadError = useCallback(
    (err) => {
      // Offline: a falha do import() é de rede, não de deploy. Recarregar aqui jogaria fora a
      // thread que o atendente está lendo (o app suporta leitura offline) por causa de uma
      // ação secundária. Só avisa; com a rede de volta o próximo clique tenta de novo.
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      // Chunk sumiu de vez (404 após deploy: index.html antigo). Mesma regra do
      // lazyWithRetry: recarrega UMA vez para pegar os hashes novos.
      if (!offline && isDynamicImportFetchError(err) && triggerStaleChunkReload()) return;
      console.error(`[lazyHookImpl] falha ao carregar ${label || "módulo"}:`, err);
      showToastRef.current?.({
        type: "error",
        title: label || "Recurso indisponível",
        message: "Não foi possível carregar esta função. Verifique a conexão e tente de novo.",
      });
    },
    [label]
  );

  const start = useCallback(() => {
    prefetchChunk(prefetch);
    return loadHookImpl(loader).then((mod) => {
      if (mountedRef.current) setImpl(mod);
      return mod;
    });
  }, [loader, prefetch]);

  const ensureImpl = useCallback(() => {
    if (getHookImpl(loader)) return;
    start().catch(() => {
      /* só aquecimento: o erro aparece quando uma ação de verdade precisar do impl */
    });
  }, [loader, start]);

  const withImpl = useCallback(
    (fn, onError) => {
      const cached = getHookImpl(loader);
      if (cached) return fn(cached);
      if (gateRef.current) return undefined;
      gateRef.current = true;
      return start().then(
        (mod) => {
          gateRef.current = false;
          return fn(mod);
        },
        (err) => {
          gateRef.current = false;
          handleLoadError(err);
          onError?.(err);
          return undefined;
        }
      );
    },
    [loader, start, handleLoadError]
  );

  return { impl, ensureImpl, withImpl };
}
