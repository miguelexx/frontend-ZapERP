/**
 * Rascunhos do composer por conversa (memória + sessionStorage).
 * Não altera status/atendimento — só texto digitado.
 */

export const FLUSH_COMPOSER_DRAFT_EVENT = "zaperp:flush-composer-draft";

const memoryDrafts = new Map();
const STORAGE_PREFIX = "zap:composerDraft:";
const SESSION_PERSIST_DEBOUNCE_MS = 250;

function normalizeId(conversaId) {
  if (conversaId == null || conversaId === "") return null;
  return String(conversaId);
}

function storageKey(id) {
  return `${STORAGE_PREFIX}${id}`;
}

function writeSession(id, value) {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(storageKey(id), value);
    }
  } catch {
    /* quota / private mode */
  }
}

/*
 * A cópia em memória (`memoryDrafts`) é a fonte de verdade durante a sessão e é
 * gravada em toda tecla — instantânea. O sessionStorage é só o backup para F5, e
 * escrevê-lo a cada tecla causava micro-jank ao digitar (setItem é síncrono,
 * pior com textos longos no mobile). Agora ele é adiado e coalescido; qualquer
 * momento de "saída" real (troca de conversa, pagehide, flush) grava na hora via
 * `immediate: true`, então não há risco de perder rascunho.
 */
const pendingPersist = new Map(); // id -> value
let persistTimer = null;

function flushPendingPersist() {
  persistTimer = null;
  if (pendingPersist.size === 0) return;
  for (const [id, value] of pendingPersist) writeSession(id, value);
  pendingPersist.clear();
}

function schedulePersist(id, value) {
  pendingPersist.set(id, value);
  if (persistTimer != null) return;
  if (typeof setTimeout !== "function") {
    flushPendingPersist();
    return;
  }
  persistTimer = setTimeout(flushPendingPersist, SESSION_PERSIST_DEBOUNCE_MS);
}

export function saveComposerDraft(conversaId, text, { immediate = false } = {}) {
  const id = normalizeId(conversaId);
  if (!id) return;
  const value = String(text ?? "");
  if (!value.trim()) {
    clearComposerDraft(id);
    return;
  }
  memoryDrafts.set(id, value);
  if (immediate) {
    pendingPersist.delete(id);
    writeSession(id, value);
  } else {
    schedulePersist(id, value);
  }
}

export function loadComposerDraft(conversaId) {
  const id = normalizeId(conversaId);
  if (!id) return "";
  if (memoryDrafts.has(id)) return String(memoryDrafts.get(id) ?? "");
  try {
    if (typeof sessionStorage !== "undefined") {
      const raw = sessionStorage.getItem(storageKey(id));
      if (raw != null) {
        memoryDrafts.set(id, raw);
        return raw;
      }
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function clearComposerDraft(conversaId) {
  const id = normalizeId(conversaId);
  if (!id) return;
  memoryDrafts.delete(id);
  pendingPersist.delete(id);
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(storageKey(id));
    }
  } catch {
    /* ignore */
  }
}
