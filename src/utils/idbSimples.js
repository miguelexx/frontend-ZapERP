/**
 * Helper mínimo de IndexedDB (API nativa, sem dependência) para os caches offline.
 * Todas as operações degradam para no-op/null quando o IDB está indisponível
 * (modo privado, cota, browser antigo) — nunca lançam para o chamador.
 */

export function idbDisponivel() {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

const _dbs = new Map(); // nome -> Promise<IDBDatabase|null>

export function abrirIdb(nome, stores) {
  if (!idbDisponivel()) return Promise.resolve(null);
  if (_dbs.has(nome)) return _dbs.get(nome);
  const p = new Promise((resolve) => {
    try {
      const req = indexedDB.open(nome, 1);
      req.onupgradeneeded = () => {
        for (const s of stores) {
          try {
            req.result.createObjectStore(s, { keyPath: "chave" });
          } catch {
            /* já existe */
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  _dbs.set(nome, p);
  return p;
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb_error"));
  });
}

export async function idbGet(nome, stores, store, chave) {
  const db = await abrirIdb(nome, stores);
  if (!db) return null;
  try {
    return (await reqP(db.transaction(store, "readonly").objectStore(store).get(String(chave)))) ?? null;
  } catch {
    return null;
  }
}

export async function idbPut(nome, stores, store, valor) {
  const db = await abrirIdb(nome, stores);
  if (!db) return false;
  try {
    await reqP(db.transaction(store, "readwrite").objectStore(store).put(valor));
    return true;
  } catch {
    return false;
  }
}

export async function idbDelete(nome, stores, store, chave) {
  const db = await abrirIdb(nome, stores);
  if (!db) return false;
  try {
    await reqP(db.transaction(store, "readwrite").objectStore(store).delete(String(chave)));
    return true;
  } catch {
    return false;
  }
}

export async function idbGetAll(nome, stores, store) {
  const db = await abrirIdb(nome, stores);
  if (!db) return [];
  try {
    return (await reqP(db.transaction(store, "readonly").objectStore(store).getAll())) || [];
  } catch {
    return [];
  }
}

export async function idbClear(nome, stores, store) {
  const db = await abrirIdb(nome, stores);
  if (!db) return false;
  try {
    await reqP(db.transaction(store, "readwrite").objectStore(store).clear());
    return true;
  } catch {
    return false;
  }
}
