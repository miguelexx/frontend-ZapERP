/**
 * Progresso de upload das mídias que EU estou enviando (26/11/2026).
 *
 * Por que fora do conversaStore: o progresso muda várias vezes por segundo. Na store das
 * mensagens cada mudança recriaria a linha da thread (threadRowCompare, virtualizer, memo das
 * bolhas). Aqui é um Map<tempId, job> com assinatura POR tempId: só a moldura da mídia que
 * mostra o anel (useSyncExternalStore) acorda — a bolha e a lista nem ficam sabendo.
 *
 * Um "job" é UM pedido HTTP. Lote (galeria/documentos) é um pedido só: os tempIds do lote
 * compartilham o mesmo job, logo o mesmo valor de progresso e o mesmo cancelamento.
 *
 * Ciclo de vida: `startUploadProgress` antes do POST → `onUploadProgress` do axios →
 * `finish()` no `finally` (sucesso, falha ou cancelamento). Nenhum estado sobrevive ao pedido.
 */

/** Intervalo mínimo entre publicações por job (o axios já limita a ~3/s; isto é a rede de segurança). */
export const UPLOAD_PROGRESS_THROTTLE_MS = 100;

/** tempId (string) → job */
const jobs = new Map();
/** tempId (string) → Set<listener> */
const listeners = new Map();

function keyOf(tempId) {
  if (tempId == null) return "";
  const k = String(tempId).trim();
  return k;
}

function notify(key) {
  const set = listeners.get(key);
  if (!set || set.size === 0) return;
  for (const fn of Array.from(set)) {
    try {
      fn();
    } catch {
      /* um assinante quebrado não pode travar os outros */
    }
  }
}

function notifyJob(job) {
  for (const key of job.keys) notify(key);
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/**
 * Fração 0..1 a partir do evento do axios (`{ loaded, total, progress }`) ou de um número.
 * Sem total conhecido devolve null (o anel fica no último valor publicado).
 */
export function ratioFromUploadEvent(evt) {
  if (typeof evt === "number") return clamp01(evt);
  if (!evt || typeof evt !== "object") return null;
  const total = Number(evt.total);
  const loaded = Number(evt.loaded);
  if (Number.isFinite(total) && total > 0 && Number.isFinite(loaded)) return clamp01(loaded / total);
  const p = Number(evt.progress);
  if (Number.isFinite(p)) return clamp01(p);
  return null;
}

function emit(job, now) {
  if (job.timer != null) {
    clearTimeout(job.timer);
    job.timer = null;
  }
  if (job.done) return;
  job.lastEmit = now;
  if (job.progress === job.pending) return;
  job.progress = job.pending;
  notifyJob(job);
}

function report(job, ratio) {
  if (job.done || job.canceled || ratio == null) return;
  // Monotônico: um evento atrasado nunca faz o anel andar para trás.
  if (ratio <= job.pending) return;
  job.pending = ratio;
  // Corpo inteiro entregue: o servidor assumiu o envio — já não há o que perder ao sair.
  if (ratio >= 1) syncBeforeUnloadGuard();
  const now = Date.now();
  // Fim do upload publica na hora: o anel troca para "processando" e o X some sem esperar.
  if (ratio >= 1 || now - job.lastEmit >= UPLOAD_PROGRESS_THROTTLE_MS) {
    emit(job, now);
    return;
  }
  if (job.timer == null) {
    job.timer = setTimeout(() => {
      job.timer = null;
      emit(job, Date.now());
    }, Math.max(0, UPLOAD_PROGRESS_THROTTLE_MS - (now - job.lastEmit)));
  }
}

function finishJob(job) {
  if (job.done) return;
  job.done = true;
  if (job.timer != null) {
    clearTimeout(job.timer);
    job.timer = null;
  }
  for (const key of job.keys) {
    if (jobs.get(key) === job) {
      jobs.delete(key);
      notify(key);
    }
  }
  activeJobs.delete(job);
  syncBeforeUnloadGuard();
}

/*
 * Aviso ao sair com upload em curso (27/11/2026). Foto/vídeo/documento só entram na outbox
 * durável DEPOIS de uma falha classificada — recarregar (o ⟳ da lista é um clique) ou fechar a
 * aba no meio do upload abortava o pedido e a mídia sumia sem rastro. Enquanto houver bytes a
 * subir o navegador pergunta "Sair do site?". Com o corpo inteiro entregue o servidor já
 * assumiu o envio: sem aviso. O listener só existe enquanto há upload (nada fica pendurado).
 */
/** Jobs ainda não finalizados (inclui o antigo cuja chave um reenvio assumiu). */
const activeJobs = new Set();
let beforeUnloadRegistrado = false;

function temUploadComBytesPendentes() {
  for (const job of activeJobs) {
    if (!job.done && !job.canceled && job.pending < 1) return true;
  }
  return false;
}

function onBeforeUnloadComUpload(event) {
  if (!temUploadComBytesPendentes()) return undefined;
  event.preventDefault();
  // Chrome/Edge ainda exigem returnValue para mostrar o diálogo nativo.
  event.returnValue = "";
  return "";
}

function syncBeforeUnloadGuard() {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  const precisa = temUploadComBytesPendentes();
  if (precisa && !beforeUnloadRegistrado) {
    window.addEventListener("beforeunload", onBeforeUnloadComUpload);
    beforeUnloadRegistrado = true;
  } else if (!precisa && beforeUnloadRegistrado) {
    window.removeEventListener("beforeunload", onBeforeUnloadComUpload);
    beforeUnloadRegistrado = false;
  }
}

/** Há upload com bytes ainda a subir (sair da página agora perderia o arquivo)? */
export function hasPendingUploadBytes() {
  return temUploadComBytesPendentes();
}

/**
 * Cancela só enquanto há bytes a subir. Com o corpo inteiro entregue o backend já pode estar
 * mandando ao WhatsApp — abortar o pedido aí não desfaz o envio, só mentiria na tela.
 */
function cancelJob(job) {
  if (job.done || job.canceled) return false;
  if (job.pending >= 1) return false;
  job.canceled = true;
  try {
    job.controller?.abort();
  } catch {
    /* ignore */
  }
  syncBeforeUnloadGuard();
  return true;
}

/**
 * Registra o upload de um pedido. Devolve o que o chamador passa ao axios e o que usa no
 * `catch`/`finally`.
 *
 * @param {Array<string|number>|string|number} tempIds  um tempId ou os tempIds do lote
 * @returns {{
 *   signal: AbortSignal|undefined,
 *   onUploadProgress: (evt: any) => void,
 *   cancel: () => boolean,
 *   isCanceled: () => boolean,
 *   finish: () => void,
 * }}
 */
export function startUploadProgress(tempIds) {
  const keys = Array.from(new Set((Array.isArray(tempIds) ? tempIds : [tempIds]).map(keyOf).filter(Boolean)));
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const job = {
    keys,
    controller,
    progress: 0,
    pending: 0,
    lastEmit: Date.now(),
    timer: null,
    canceled: false,
    done: false,
  };
  for (const key of keys) {
    const prev = jobs.get(key);
    // Mesmo tempId reaproveitado (retry por item) enquanto um pedido antigo ainda fecha:
    // o novo assume a chave; o antigo, ao terminar, não apaga o que não é mais dele.
    if (prev && prev !== job) prev.keys = prev.keys.filter((k) => k !== key);
    jobs.set(key, job);
    notify(key);
  }
  activeJobs.add(job);
  syncBeforeUnloadGuard();
  return {
    signal: controller?.signal,
    onUploadProgress: (evt) => report(job, ratioFromUploadEvent(evt)),
    cancel: () => cancelJob(job),
    /* Só este job aborta o próprio signal: abortado ⇒ foi o atendente que cancelou. */
    isCanceled: () => job.canceled === true || controller?.signal?.aborted === true,
    finish: () => finishJob(job),
  };
}

/** Fração 0..1 publicada para o tempId, ou null quando não há upload em curso. */
export function getUploadProgress(tempId) {
  const key = keyOf(tempId);
  if (!key) return null;
  const job = jobs.get(key);
  return job ? job.progress : null;
}

/** Ainda dá para cancelar (há upload em curso e o corpo não terminou de subir)? */
export function isUploadCancelable(tempId) {
  const key = keyOf(tempId);
  const job = key ? jobs.get(key) : null;
  return !!job && !job.done && !job.canceled && job.pending < 1 && !!job.controller;
}

/** Quantas mídias o cancelamento deste tempId leva junto (lote = um pedido só). */
export function uploadBatchSize(tempId) {
  const key = keyOf(tempId);
  const job = key ? jobs.get(key) : null;
  return job ? job.keys.length : 0;
}

/** Cancela o pedido que carrega este tempId (o lote inteiro, se for lote). */
export function cancelUpload(tempId) {
  const key = keyOf(tempId);
  const job = key ? jobs.get(key) : null;
  return job ? cancelJob(job) : false;
}

/** Assinatura por tempId (formato do useSyncExternalStore). */
export function subscribeUploadProgress(tempId, listener) {
  const key = keyOf(tempId);
  if (!key || typeof listener !== "function") return () => {};
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    const cur = listeners.get(key);
    if (!cur) return;
    cur.delete(listener);
    if (cur.size === 0) listeners.delete(key);
  };
}

/** Só para testes. */
export function __resetUploadProgressForTest() {
  for (const job of jobs.values()) {
    if (job.timer != null) clearTimeout(job.timer);
    job.done = true;
  }
  jobs.clear();
  listeners.clear();
  activeJobs.clear();
  syncBeforeUnloadGuard();
}
