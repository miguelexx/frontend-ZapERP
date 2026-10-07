/**
 * Fila de saída PERSISTENTE para MÍDIA (áudio gravado, foto, vídeo, documento, figurinha).
 *
 * Motivo: diferente do texto (localStorage), o File/Blob de uma mídia que falhou por rede
 * vivia só na memória do React — um F5 perdia o áudio gravado em silêncio. Aqui o blob e os
 * metadados do envio são gravados em IndexedDB e sobrevivem a F5/fechar o navegador.
 *
 * Regras (espelham a outbox de texto):
 *  - o tempId é o client_temp_id do envio original e é PRESERVADO no reenvio — o backend
 *    deduplica (findMensagemByClientTempId + UNIQUE) se a primeira tentativa tiver chegado;
 *  - modo 'offline' (POST nunca saiu) e modo 'incerto' (timeout/5xx — resposta perdida);
 *  - FIFO por ordem de enfileiramento; flush para na primeira falha de rede;
 *  - item sai da fila só após confirmação do backend ou falha definitiva;
 *  - IndexedDB indisponível (modo privado, etc.) → degrade silencioso ao comportamento atual.
 *
 * Limites: 30 itens · 64 MB por item · ~200 MB no total · TTL 48 h (mídia envelhecida não
 * deve sair sozinha dias depois — o atendente reavalia pelo botão de erro).
 */

import api from "../api/http";
import { resolveUploadTimeoutMs } from "../api/httpTimeouts";
import { useConversaStore } from "./conversaStore";
import { classifyOutboundAxiosError, OUTBOUND_ERROR_KIND } from "./outboundSendError";
import {
  OUTBOX_MODO_OFFLINE,
  OUTBOX_MODO_INCERTO,
  outboxPendingMessageFields,
} from "./offlineOutbox";
import {
  extractArquivoApiReconciliations,
  normalizeArquivoApiToMessage,
} from "./conversaOptimisticMessage";

const DB_NAME = "zap_media_outbox_v1";
const STORE = "itens";
const MAX_ITEMS = 30;
const MAX_ITEM_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const TTL_MS = 48 * 60 * 60 * 1000;
export const MEDIA_OUTBOX_MAX_ATTEMPTS = 8;

/** Lock de flush entre abas (localStorage): uma aba envia por vez; expira sozinho. */
const FLUSH_LOCK_KEY = "zap:outbox:media:flushlock:v1";
const FLUSH_LOCK_TTL_MS = 90_000;
const TAB_ID = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let dbPromise = null;
/** Metadados em memória (sem blob) para hydrate/checagens SÍNCRONAS. */
const metaCache = new Map(); // tempId -> meta
const blobUrlCache = new Map(); // tempId -> objectURL (para a bolha pós-F5)
let initPromise = null;

function idbDisponivel() {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

function abrirDb() {
  if (!idbDisponivel()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          req.result.createObjectStore(STORE, { keyPath: "tempId" });
        } catch {
          /* store já existe */
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb_error"));
  });
}

async function idbGetAll() {
  const db = await abrirDb();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE, "readonly");
    return (await reqAsPromise(tx.objectStore(STORE).getAll())) || [];
  } catch {
    return [];
  }
}

async function idbPut(item) {
  const db = await abrirDb();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE, "readwrite");
    await reqAsPromise(tx.objectStore(STORE).put(item));
    return true;
  } catch {
    return false;
  }
}

async function idbDelete(tempId) {
  const db = await abrirDb();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE, "readwrite");
    await reqAsPromise(tx.objectStore(STORE).delete(String(tempId)));
    return true;
  } catch {
    return false;
  }
}

function metaDoItem(item) {
  const { blob, ...meta } = item || {};
  return { ...meta, bytes: Number(item?.bytes) || Number(blob?.size) || 0 };
}

function expirou(meta) {
  return Date.now() - (Number(meta?.enfileiradoEm) || 0) > TTL_MS;
}

/** Carrega metadados do IDB para a memória (1x por aba). Remove expirados. */
export function initMediaOutbox() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const itens = await idbGetAll();
    for (const item of itens) {
      const meta = metaDoItem(item);
      if (!meta?.tempId || expirou(meta)) {
        void idbDelete(meta?.tempId);
        continue;
      }
      metaCache.set(String(meta.tempId), meta);
      try {
        if (item.blob instanceof Blob && !blobUrlCache.has(String(meta.tempId))) {
          blobUrlCache.set(String(meta.tempId), URL.createObjectURL(item.blob));
        }
      } catch {
        /* preview opcional */
      }
    }
    return metaCache.size;
  })();
  return initPromise;
}

export function mediaOutboxHasItems() {
  return metaCache.size > 0;
}

export function listMediaOutboxForConversa(conversaId) {
  const alvo = String(conversaId ?? "").trim();
  if (!alvo) return [];
  return [...metaCache.values()]
    .filter((m) => String(m.conversaId) === alvo)
    .sort((a, b) => (a.enfileiradoEm || 0) - (b.enfileiradoEm || 0));
}

function totalBytes() {
  let t = 0;
  for (const m of metaCache.values()) t += Number(m.bytes) || 0;
  return t;
}

/**
 * Enfileira a mídia. Retorna o meta persistido, ou null quando não coube/IDB indisponível —
 * nesse caso o chamador mantém o comportamento atual (erro + retry manual em sessão).
 */
export async function enqueueMediaOutboxItem({
  tempId,
  conversaId,
  blob,
  filename,
  tipoForcado = null,
  caption = "",
  audioMeta = null,
  atendimentoId = null,
  clienteId = null,
  phone = null,
  criadoEm = null,
  modo = OUTBOX_MODO_OFFLINE,
} = {}) {
  const tid = String(tempId ?? "").trim();
  const cid = String(conversaId ?? "").trim();
  if (!tid || !cid || !(blob instanceof Blob)) return null;
  if (blob.size <= 0 || blob.size > MAX_ITEM_BYTES) return null;
  await initMediaOutbox();
  if (!idbDisponivel()) return null;
  if (!metaCache.has(tid)) {
    if (metaCache.size >= MAX_ITEMS) return null;
    if (totalBytes() + blob.size > MAX_TOTAL_BYTES) return null;
  }
  const item = {
    tempId: tid,
    conversaId: cid,
    blob,
    bytes: blob.size,
    filename: String(filename || blob.name || "arquivo"),
    mimeType: String(blob.type || ""),
    tipoForcado: tipoForcado ? String(tipoForcado) : null,
    caption: String(caption || ""),
    audioMeta: audioMeta && typeof audioMeta === "object" ? audioMeta : null,
    atendimentoId: atendimentoId ?? null,
    clienteId: clienteId ?? null,
    phone: phone != null ? String(phone) : null,
    criadoEm: criadoEm || new Date().toISOString(),
    enfileiradoEm: metaCache.get(tid)?.enfileiradoEm || Date.now(),
    tentativas: metaCache.get(tid)?.tentativas || 0,
    ultimoErro: null,
    modo: modo === OUTBOX_MODO_INCERTO ? OUTBOX_MODO_INCERTO : OUTBOX_MODO_OFFLINE,
  };
  const ok = await idbPut(item);
  if (!ok) return null;
  metaCache.set(tid, metaDoItem(item));
  try {
    if (!blobUrlCache.has(tid)) blobUrlCache.set(tid, URL.createObjectURL(blob));
  } catch {
    /* ignore */
  }
  return metaCache.get(tid);
}

export async function removeMediaOutboxItem(tempId) {
  const tid = String(tempId ?? "").trim();
  if (!tid) return;
  metaCache.delete(tid);
  const url = blobUrlCache.get(tid);
  if (url) {
    blobUrlCache.delete(tid);
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  await idbDelete(tid);
}

function tipoDaBolha(meta) {
  const forcado = String(meta?.tipoForcado || "").toLowerCase();
  if (forcado === "sticker") return "sticker";
  if (forcado === "voice" || forcado === "ptt") return "voice";
  if (forcado === "audio") return "audio";
  if (forcado === "video") return "video";
  const mime = String(meta?.mimeType || "").toLowerCase();
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "imagem";
  return "arquivo";
}

function placeholderTexto(tipo, meta) {
  if (meta?.caption) return meta.caption;
  if (tipo === "voice") return "(áudio de voz)";
  if (tipo === "audio") return "(áudio)";
  if (tipo === "imagem") return "(imagem)";
  if (tipo === "video") return "(vídeo)";
  if (tipo === "sticker") return "(figurinha)";
  return meta?.filename || "(arquivo)";
}

/** Bolha otimista reconstruída pós-F5 (igual à de texto, com preview via blob do IDB). */
export function buildMediaOutboxBubble(meta) {
  if (!meta?.tempId) return null;
  const tipo = tipoDaBolha(meta);
  const blobUrl = blobUrlCache.get(String(meta.tempId)) || null;
  const conversaIdNum = /^\d+$/.test(String(meta.conversaId)) ? Number(meta.conversaId) : meta.conversaId;
  return {
    tempId: meta.tempId,
    client_temp_id: meta.tempId,
    conversa_id: conversaIdNum,
    tipo,
    texto: placeholderTexto(tipo, meta),
    nome_arquivo: meta.filename || undefined,
    direcao: "out",
    criado_em: meta.criadoEm,
    ...(blobUrl ? { url: blobUrl, _optimisticBlobUrl: blobUrl } : {}),
    ...(meta.audioMeta?.durationMs > 0
      ? { audio_duracao_sec: Math.round(meta.audioMeta.durationMs / 1000) }
      : {}),
    ...outboxPendingMessageFields({ tempId: meta.tempId, modo: meta.modo }),
  };
}

/** Injeta bolhas da fila de mídia na lista da conversa (idempotente por tempId). */
export function hydrateMediaOutboxBubblesForConversa(conversaId, existingList = []) {
  const itens = listMediaOutboxForConversa(conversaId);
  if (!itens.length) return Array.isArray(existingList) ? existingList : [];
  const next = Array.isArray(existingList) ? [...existingList] : [];
  const vistos = new Set(
    next.map((m) => String(m?.tempId || m?.client_temp_id || "")).filter(Boolean)
  );
  for (const meta of itens) {
    const tid = String(meta.tempId);
    if (vistos.has(tid)) continue;
    const bubble = buildMediaOutboxBubble(meta);
    if (!bubble) continue;
    next.push(bubble);
    vistos.add(tid);
  }
  return next;
}

function claimFlushLock() {
  try {
    const raw = localStorage.getItem(FLUSH_LOCK_KEY);
    if (raw) {
      const lock = JSON.parse(raw);
      if (lock?.ate > Date.now() && lock?.dono !== TAB_ID) return false;
    }
    localStorage.setItem(FLUSH_LOCK_KEY, JSON.stringify({ dono: TAB_ID, ate: Date.now() + FLUSH_LOCK_TTL_MS }));
    return true;
  } catch {
    return true; // sem storage compartilhado não há outra aba para competir
  }
}

function releaseFlushLock() {
  try {
    const raw = localStorage.getItem(FLUSH_LOCK_KEY);
    if (raw && JSON.parse(raw)?.dono === TAB_ID) localStorage.removeItem(FLUSH_LOCK_KEY);
  } catch {
    /* ignore */
  }
}

function itemJaPersistidaNaStore(meta) {
  try {
    const st = useConversaStore.getState();
    if (String(st.selectedId ?? "") !== String(meta.conversaId ?? "")) return false;
    const lista = st.mensagens || [];
    return lista.some(
      (m) => m?.id != null && String(m?.client_temp_id || m?.tempId || "") === String(meta.tempId)
    );
  } catch {
    return false;
  }
}

function aplicarConfirmacaoNaStore(meta, data) {
  try {
    const st = useConversaStore.getState();
    if (String(st.selectedId ?? "") !== String(meta.conversaId ?? "")) return;
    const recs = extractArquivoApiReconciliations(data, meta.conversaId, [meta.tempId]);
    if (recs.length) {
      recs.forEach(({ tempId, realMsg }) => st.reconciliarMensagem?.(tempId, realMsg));
      return;
    }
    const realMsg = normalizeArquivoApiToMessage(data, meta.conversaId);
    if (realMsg?.id != null || realMsg?.whatsapp_id) {
      st.reconciliarMensagem?.(meta.tempId, realMsg);
    }
  } catch {
    /* a UI se cura pelo socket/refresh */
  }
}

function aplicarFalhaDefinitivaNaStore(meta, classified) {
  try {
    useConversaStore.getState().marcarMensagemTempErro?.(meta.tempId, {
      erro_mensagem: classified?.message || "Não foi possível enviar o arquivo salvo offline.",
    });
  } catch {
    /* ignore */
  }
}

function montarFormData(item) {
  const fd = new FormData();
  fd.append("file", item.blob, item.filename || "arquivo");
  const forcado = String(item.tipoForcado || "").toLowerCase();
  if (forcado === "sticker") fd.append("tipo", "sticker");
  else if (forcado === "voice" || forcado === "audio" || forcado === "video") fd.append("tipo", forcado);
  const am = item.audioMeta || {};
  if (Number(am.durationMs) > 0) fd.append("audio_duration_ms", String(Math.round(am.durationMs)));
  if (Number(am.elapsedMs) > 0) fd.append("audio_elapsed_ms", String(Math.round(am.elapsedMs)));
  if (Number(am.bytes) > 0) fd.append("audio_blob_bytes", String(Math.round(am.bytes)));
  if (am.mime) fd.append("audio_recorded_mime", String(am.mime));
  if (item.caption) fd.append("caption", item.caption);
  fd.append("client_temp_id", item.tempId);
  fd.append("conversa_id", String(item.conversaId));
  if (item.atendimentoId != null) fd.append("atendimento_id", String(item.atendimentoId));
  if (item.clienteId != null) fd.append("cliente_id", String(item.clienteId));
  if (item.phone != null) fd.append("phone", String(item.phone));
  return fd;
}

function falhaDeRede(classified) {
  return (
    classified?.kind === OUTBOUND_ERROR_KIND.OFFLINE ||
    classified?.kind === OUTBOUND_ERROR_KIND.TIMEOUT ||
    classified?.kind === OUTBOUND_ERROR_KIND.UNKNOWN ||
    (classified?.kind === OUTBOUND_ERROR_KIND.HTTP && classified?.uncertain === true)
  );
}

let flushEmAndamento = false;

/**
 * Reenvia a fila de mídia em FIFO. Mesmo contrato da outbox de texto: para na primeira
 * falha de rede; falha definitiva marca a bolha com erro e remove da fila.
 */
export async function flushMediaOutbox() {
  await initMediaOutbox();
  if (!metaCache.size) return { enviadas: 0, restantes: 0, parou: null };
  if (flushEmAndamento) return { enviadas: 0, restantes: metaCache.size, parou: "em_andamento" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { enviadas: 0, restantes: metaCache.size, parou: "offline" };
  }
  if (!claimFlushLock()) return { enviadas: 0, restantes: metaCache.size, parou: "lock_outra_aba" };

  flushEmAndamento = true;
  let enviadas = 0;
  let parou = null;
  let retryAfterMs = null;
  try {
    const fila = [...metaCache.values()].sort((a, b) => (a.enfileiradoEm || 0) - (b.enfileiradoEm || 0));
    for (const meta of fila) {
      if (expirou(meta)) {
        aplicarFalhaDefinitivaNaStore(meta, { message: "O arquivo esperou tempo demais e não foi enviado. Reenvie manualmente." });
        await removeMediaOutboxItem(meta.tempId);
        continue;
      }
      if (meta.modo === OUTBOX_MODO_INCERTO && itemJaPersistidaNaStore(meta)) {
        await removeMediaOutboxItem(meta.tempId);
        continue;
      }
      const db = await abrirDb();
      let item = null;
      try {
        const tx = db?.transaction(STORE, "readonly");
        item = tx ? await reqAsPromise(tx.objectStore(STORE).get(String(meta.tempId))) : null;
      } catch {
        item = null;
      }
      if (!item || !(item.blob instanceof Blob)) {
        await removeMediaOutboxItem(meta.tempId);
        continue;
      }
      try {
        const { data } = await api.post(`/chats/${item.conversaId}/arquivo`, montarFormData(item), {
          timeout: resolveUploadTimeoutMs(item.blob.size),
          skipGlobalNetworkToast: true,
          skipGlobal500Toast: true,
        });
        aplicarConfirmacaoNaStore(meta, data);
        await removeMediaOutboxItem(meta.tempId);
        enviadas += 1;
      } catch (err) {
        const classified = classifyOutboundAxiosError(err, { media: true });
        if (classified?.retryAfterMs != null) {
          retryAfterMs = Math.max(retryAfterMs || 0, classified.retryAfterMs);
        }
        const tentativas = (Number(meta.tentativas) || 0) + 1;
        const atualizado = { ...meta, tentativas, ultimoErro: String(classified.message || "").slice(0, 300) };
        metaCache.set(String(meta.tempId), atualizado);
        void idbPut({ ...item, tentativas, ultimoErro: atualizado.ultimoErro });
        const desistir = !falhaDeRede(classified) || tentativas >= MEDIA_OUTBOX_MAX_ATTEMPTS;
        if (desistir) {
          aplicarFalhaDefinitivaNaStore(meta, classified);
          await removeMediaOutboxItem(meta.tempId);
          if (!falhaDeRede(classified)) continue; // erro do item: segue para o próximo
        }
        parou = falhaDeRede(classified) ? "rede" : "erro_item";
        if (falhaDeRede(classified)) break;
      }
    }
  } finally {
    flushEmAndamento = false;
    releaseFlushLock();
  }
  return { enviadas, restantes: metaCache.size, parou, retryAfterMs };
}

/** Logout/troca de usuário: blobs de mídia são conteúdo do usuário — zera IDB + memória. */
export async function limparMediaOutboxLocal() {
  _resetMediaOutboxForTests()
  const db = await abrirDb()
  if (!db) return
  try {
    const tx = db.transaction(STORE, "readwrite")
    await reqAsPromise(tx.objectStore(STORE).clear())
  } catch {
    /* best-effort */
  }
}

// Init ANSIOSO no load do módulo: o hydrate das bolhas roda já na primeira carga da conversa
// (antes de qualquer hook montar) — sem isto, a mídia pendente só aparecia após um refresh.
if (idbDisponivel()) void initMediaOutbox()

export function _resetMediaOutboxForTests() {
  metaCache.clear();
  for (const url of blobUrlCache.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  blobUrlCache.clear();
  initPromise = null;
  flushEmAndamento = false;
}
