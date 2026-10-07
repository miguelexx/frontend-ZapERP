/**
 * Cache OFFLINE de áudios recebidos/enviados (IndexedDB, API nativa).
 *
 * O <audio> usa preload="metadata" e o cache do /media/proxy vive no SERVIDOR — nada disso
 * garante reprodução sem internet. Aqui o áudio é baixado COMPLETO em segundo plano enquanto
 * a conversa está aberta e online, e vira o primeiro candidato do player quando offline.
 *
 * Garantias:
 *  - só entra no cache um download completo (status 200 + Content-Length conferido);
 *    arquivo parcial/queda no meio = rejeitado — nunca é anunciado como disponível;
 *  - chave com namespace por empresa+usuário (`c<id>:u<id>:<msgKey>`): nunca há reuso entre
 *    tenants; entradas de OUTRA identidade são purgadas no load do índice; logout limpa tudo;
 *  - nenhum JWT/URL autenticada é persistido — só o Blob + identidade da mensagem;
 *  - LRU com teto global (default 100 MB, ajustável em localStorage
 *    `zap:offline:audio:max_mb`, reduzido se navigator.storage.estimate() indicar pouca cota)
 *    e teto por arquivo (15 MB); concorrência de prefetch = 2; dedupe de download em voo;
 *  - IndexedDB indisponível → tudo vira no-op (comportamento online intacto).
 */

import { useAuthStore } from "../auth/authStore";
import { idbDisponivel, idbGet, idbPut, idbDelete, idbGetAll, idbClear } from "../utils/idbSimples";
import { refreshProxyMediaToken, credentialedFetchMode } from "./utils/conversaViewHelpers";

const DB = "zap_offline_audio_v1";
const STORES = ["audios"];
const STORE = "audios";

const MAX_ITEM_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_BYTES_DEFAULT = 100 * 1024 * 1024;
const PREFETCH_CONCORRENCIA = 2;
const PREFETCH_MAX_POR_CONVERSA = 15;

let indicePromise = null; // Promise<Map<chave, meta>>
const indice = new Map(); // chave -> { chave, msgKey, bytes, mime, usadoEm }
const urlPorChave = new Map(); // chave -> objectURL
const baixando = new Map(); // chave -> Promise
const filaPrefetch = [];
let prefetchAtivos = 0;
let limiteTotalCache = null;

function identidadeAtual() {
  try {
    const u = useAuthStore.getState()?.user;
    const companyId = Number(u?.company_id);
    const userId = Number(u?.id);
    if (!Number.isFinite(companyId) || !Number.isFinite(userId)) return null;
    return { companyId, userId, prefixo: `c${companyId}:u${userId}:` };
  } catch {
    return null;
  }
}

function chaveDe(msgKey) {
  const id = identidadeAtual();
  const k = String(msgKey ?? "").trim();
  if (!id || !k) return null;
  return `${id.prefixo}${k}`;
}

/** msgKey persistida da mensagem (nunca tempId — otimista não tem áudio final). */
export function audioMsgKey(msg) {
  const wa = msg?.whatsapp_id != null ? String(msg.whatsapp_id).trim() : "";
  if (wa) return `wa:${wa}`;
  const id = msg?.id != null ? String(msg.id).trim() : "";
  return id ? `id:${id}` : null;
}

async function limiteTotalBytes() {
  if (limiteTotalCache != null) return limiteTotalCache;
  let limite = MAX_TOTAL_BYTES_DEFAULT;
  try {
    const raw = Number(localStorage.getItem("zap:offline:audio:max_mb"));
    if (Number.isFinite(raw) && raw >= 20 && raw <= 500) limite = raw * 1024 * 1024;
  } catch {
    /* ignore */
  }
  try {
    if (navigator?.storage?.estimate) {
      const { quota, usage } = await navigator.storage.estimate();
      const livre = Number(quota) - Number(usage || 0);
      if (Number.isFinite(livre) && livre > 0) limite = Math.min(limite, Math.floor(livre * 0.4));
    }
  } catch {
    /* ignore */
  }
  limiteTotalCache = Math.max(10 * 1024 * 1024, limite);
  return limiteTotalCache;
}

/** Índice em memória (1x por aba). Purga entradas de OUTRA identidade (privacidade). */
function carregarIndice() {
  if (indicePromise) return indicePromise;
  indicePromise = (async () => {
    if (!idbDisponivel()) return indice;
    const id = identidadeAtual();
    const itens = await idbGetAll(DB, STORES, STORE);
    for (const item of itens) {
      const chave = String(item?.chave || "");
      if (!chave) continue;
      if (!id || !chave.startsWith(id.prefixo)) {
        // Entrada de outro usuário/empresa neste navegador: remove (nunca reutiliza).
        void idbDelete(DB, STORES, STORE, chave);
        continue;
      }
      const { blob, ...meta } = item;
      indice.set(chave, { ...meta, bytes: Number(meta.bytes) || Number(blob?.size) || 0 });
    }
    return indice;
  })();
  return indicePromise;
}

export function temAudioOfflineSync(msgKey) {
  const chave = chaveDe(msgKey);
  return !!(chave && indice.has(chave));
}

/** objectURL do áudio cacheado (cria sob demanda; null se ausente). Marca uso p/ LRU. */
export async function ensureAudioOfflineUrl(msgKey) {
  const chave = chaveDe(msgKey);
  if (!chave) return null;
  await carregarIndice();
  const existente = urlPorChave.get(chave);
  if (existente) return existente;
  if (!indice.has(chave)) return null;
  const item = await idbGet(DB, STORES, STORE, chave);
  if (!(item?.blob instanceof Blob) || item.blob.size <= 0) {
    indice.delete(chave);
    void idbDelete(DB, STORES, STORE, chave);
    return null;
  }
  let url = null;
  try {
    url = URL.createObjectURL(item.blob);
  } catch {
    return null;
  }
  urlPorChave.set(chave, url);
  const agora = Date.now();
  const meta = { ...indice.get(chave), usadoEm: agora };
  indice.set(chave, meta);
  // Touch de LRU persistido com THROTTLE (1h): regravar o item (com o Blob) a cada play
  // seria custo de escrita desnecessário no IndexedDB.
  if (agora - (Number(item.usadoEm) || 0) > 3600_000) {
    void idbPut(DB, STORES, STORE, { ...item, usadoEm: agora });
  }
  return url;
}

function totalBytes() {
  let t = 0;
  for (const m of indice.values()) t += Number(m.bytes) || 0;
  return t;
}

async function evictLruAteCaber(bytesNovos) {
  const limite = await limiteTotalBytes();
  while (indice.size > 0 && totalBytes() + bytesNovos > limite) {
    let maisAntigo = null;
    for (const m of indice.values()) {
      if (!maisAntigo || (m.usadoEm || 0) < (maisAntigo.usadoEm || 0)) maisAntigo = m;
    }
    if (!maisAntigo) break;
    indice.delete(maisAntigo.chave);
    // URL em uso não é revogada aqui (poderia estar tocando); só sai do mapa — o browser
    // libera quando a página soltar a referência. Entradas evictadas raramente têm URL viva.
    urlPorChave.delete(maisAntigo.chave);
    await idbDelete(DB, STORES, STORE, maisAntigo.chave);
  }
}

/** Download COMPLETO com validação explícita (status 200 + Content-Length quando presente). */
async function baixarCompleto(urlAutenticavel) {
  const headers = {};
  try {
    const raw = localStorage.getItem("zap_erp_auth");
    const token = raw ? JSON.parse(raw)?.token : null;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* ignore */
  }
  // Timeout: uma conexão pendurada não pode prender um dos 2 slots de prefetch para sempre.
  let signal;
  try {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      signal = AbortSignal.timeout(45_000);
    }
  } catch {
    /* sem suporte: segue sem timeout */
  }
  const res = await fetch(refreshProxyMediaToken(urlAutenticavel), {
    method: "GET",
    headers,
    credentials: credentialedFetchMode(),
    ...(signal ? { signal } : {}),
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const esperado = Number(res.headers.get("content-length"));
  // Grande demais: aborta ANTES de baixar o corpo inteiro (economia de banda/slot).
  if (Number.isFinite(esperado) && esperado > MAX_ITEM_BYTES) {
    try {
      await res.body?.cancel?.();
    } catch {
      /* ignore */
    }
    throw new Error("arquivo_grande_demais");
  }
  const blob = await res.blob();
  if (!(blob instanceof Blob) || blob.size <= 0) throw new Error("corpo_vazio");
  if (Number.isFinite(esperado) && esperado > 0 && blob.size !== esperado) {
    throw new Error("download_incompleto");
  }
  return blob;
}

async function executarPrefetch({ msgKey, url }) {
  const chave = chaveDe(msgKey);
  if (!chave || !url) return;
  await carregarIndice();
  if (indice.has(chave)) return;
  if (baixando.has(chave)) return baixando.get(chave);
  const p = (async () => {
    const blob = await baixarCompleto(url);
    if (blob.size > MAX_ITEM_BYTES) return; // grande demais para o cache offline
    await evictLruAteCaber(blob.size);
    const agora = Date.now();
    const item = {
      chave,
      msgKey: String(msgKey),
      bytes: blob.size,
      mime: String(blob.type || ""),
      blob,
      criadoEm: agora,
      usadoEm: agora,
    };
    const ok = await idbPut(DB, STORES, STORE, item);
    if (ok) indice.set(chave, { chave, msgKey: item.msgKey, bytes: item.bytes, mime: item.mime, usadoEm: agora });
  })();
  baixando.set(chave, p);
  try {
    await p;
  } catch {
    /* parcial/erro: nada entra no cache; o prefetch de outra abertura tenta de novo */
  } finally {
    baixando.delete(chave);
  }
}

function drenarFila() {
  while (prefetchAtivos < PREFETCH_CONCORRENCIA && filaPrefetch.length > 0) {
    const job = filaPrefetch.shift();
    prefetchAtivos += 1;
    void executarPrefetch(job).finally(() => {
      prefetchAtivos -= 1;
      drenarFila();
    });
  }
}

/** Agenda o download em baixa prioridade (idle). No-op offline/sem identidade/sem IDB. */
export function agendarPrefetchAudio({ msgKey, url }) {
  if (!idbDisponivel() || !identidadeAtual()) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const chave = chaveDe(msgKey);
  if (!chave || !url) return;
  if (indice.has(chave) || baixando.has(chave)) return;
  if (filaPrefetch.some((j) => String(j.msgKey) === String(msgKey))) return;
  filaPrefetch.push({ msgKey, url });
  const iniciar = () => drenarFila();
  if (typeof requestIdleCallback === "function") requestIdleCallback(iniciar, { timeout: 4000 });
  else setTimeout(iniciar, 1200);
}

/**
 * Prefetch dos áudios da conversa aberta (chamado após o load; nunca bloqueia render):
 * só mensagens persistidas, só os N mais recentes, 1 URL resolvida por chamada.
 */
export function prefetchAudiosDaConversa(mensagens, resolverUrl) {
  if (!Array.isArray(mensagens) || typeof resolverUrl !== "function") return;
  if (!idbDisponivel() || !identidadeAtual()) return;
  const audios = mensagens.filter((m) => {
    const t = String(m?.tipo || "").toLowerCase();
    return (t === "audio" || t === "voice") && audioMsgKey(m);
  });
  for (const m of audios.slice(-PREFETCH_MAX_POR_CONVERSA)) {
    let url = null;
    try {
      url = resolverUrl(m);
    } catch {
      url = null;
    }
    if (url && !String(url).startsWith("blob:")) {
      agendarPrefetchAudio({ msgKey: audioMsgKey(m), url });
    }
  }
}

/** Limpa TODO o cache de áudio (logout / troca de usuário). */
export async function limparAudiosOffline() {
  filaPrefetch.length = 0;
  indice.clear();
  for (const url of urlPorChave.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  urlPorChave.clear();
  indicePromise = null;
  limiteTotalCache = null;
  await idbClear(DB, STORES, STORE);
}

export function _resetOfflineAudioCacheForTests() {
  filaPrefetch.length = 0;
  prefetchAtivos = 0;
  baixando.clear();
  indice.clear();
  urlPorChave.clear();
  indicePromise = null;
  limiteTotalCache = null;
}
