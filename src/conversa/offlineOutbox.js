/**
 * Fila de saída persistente para mensagens de texto enviadas sem conexão.
 *
 * Motivo: a bolha otimista vive apenas no estado do zustand e num Map em memória
 * (conversaStore). Sem conexão a requisição nunca chega ao backend, então não existe
 * linha no banco — ao recarregar a página a bolha desaparece e a mensagem é perdida.
 * Aqui a intenção de envio é gravada no localStorage e sobrevive ao F5.
 *
 * Regras:
 * - o tempId é o client_temp_id do envio original e é preservado no reenvio,
 *   para o backend deduplicar caso a primeira tentativa tenha chegado;
 * - a ordem é a de inserção e o flush para na primeira falha de rede, para não
 *   entregar mensagens fora de sequência;
 * - o item sai da fila somente após confirmação do backend (ou falha definitiva).
 */

import { classifyOutboundAxiosError, OUTBOUND_ERROR_KIND } from "./outboundSendError.js";

export const OUTBOX_STORAGE_KEY = "zap:outbox:text:v1";
const MAX_ITEMS = 100;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Depois disso a mensagem vira falha visível: melhor avisar que tentar para sempre. */
export const OUTBOX_MAX_ATTEMPTS = 8;

/** Status/flag proprios da espera por conexao (relogio, nunca erro). */
export const OUTBOX_STATUS = "aguardando_conexao";

/**
 * Modos de item na fila:
 *  - 'offline': o POST nunca saiu (sem internet) — bolha "Aguardando conexão".
 *  - 'incerto': o POST saiu mas a resposta se perdeu (timeout/5xx/429) — bolha "Verificando…".
 *    O reenvio usa o MESMO client_temp_id; se o backend já tinha recebido, ele responde
 *    `deduplicated` com a linha existente (idempotência ponta a ponta) — nunca duplica.
 */
export const OUTBOX_MODO_OFFLINE = "offline";
export const OUTBOX_MODO_INCERTO = "incerto";

/**
 * Janela em que um item gravado ANTES do POST é considerado "em voo": o envio ao vivo ainda
 * está rodando, então o flush não o reenvia. Se a aba morrer no meio (F5, PWA encerrada), a
 * janela expira sozinha e o flush assume — com o mesmo client_temp_id, o backend deduplica.
 */
export const OUTBOX_EM_VOO_MS = 70_000;

/**
 * Dono do item ("empresa:usuario"). A fila fica no localStorage do navegador: sem carimbar o
 * dono, uma mensagem que sobrasse na fila (ex.: sessão expirada) era enviada pelo PRÓXIMO
 * usuário que fizesse login neste navegador, em nome dele.
 */
export function outboxIdentidadeAtual() {
  try {
    const raw = getStorage()?.getItem("zap_erp_auth");
    if (!raw) return null;
    const user = JSON.parse(raw)?.user;
    const uid = user?.id;
    const cid = user?.company_id ?? user?.empresa_id;
    if (uid == null || cid == null) return null;
    return `${cid}:${uid}`;
  } catch {
    return null;
  }
}

function itemPertenceAoUsuarioAtual(item, eu = outboxIdentidadeAtual()) {
  // Item legado (sem dono) segue valendo para não perder o que já estava na fila.
  if (!item?.dono) return true;
  return eu != null && item.dono === eu;
}

/** Identifica esta aba no claim de itens (duas abas não devem flushar o mesmo item juntas). */
const TAB_ID = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
/** Claim expira sozinho: se a aba dona morrer no meio, outra assume. */
const LOCK_TTL_MS = 45_000;

function getStorage() {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function sanitizeItem(raw) {
  const tempId = raw?.tempId != null ? String(raw.tempId).trim() : "";
  const conversaId = raw?.conversaId != null ? String(raw.conversaId).trim() : "";
  const texto = typeof raw?.texto === "string" ? raw.texto : "";
  if (!tempId || !conversaId || !texto.trim()) return null;
  const enfileiradoEm = Number(raw?.enfileiradoEm);
  const lockAte = Number(raw?.lockAte);
  const emVooAte = Number(raw?.emVooAte);
  return {
    tempId,
    conversaId,
    texto,
    replyMeta: raw?.replyMeta && typeof raw.replyMeta === "object" ? raw.replyMeta : null,
    criadoEm: typeof raw?.criadoEm === "string" && raw.criadoEm ? raw.criadoEm : new Date().toISOString(),
    enfileiradoEm: Number.isFinite(enfileiradoEm) ? enfileiradoEm : Date.now(),
    tentativas: Number.isFinite(Number(raw?.tentativas)) ? Number(raw.tentativas) : 0,
    ultimoErro: raw?.ultimoErro ? String(raw.ultimoErro).slice(0, 300) : null,
    modo: raw?.modo === OUTBOX_MODO_INCERTO ? OUTBOX_MODO_INCERTO : OUTBOX_MODO_OFFLINE,
    lockAte: Number.isFinite(lockAte) && lockAte > Date.now() ? lockAte : 0,
    lockDono: raw?.lockDono ? String(raw.lockDono) : null,
    emVooAte: Number.isFinite(emVooAte) && emVooAte > Date.now() ? emVooAte : 0,
    dono: raw?.dono ? String(raw.dono) : null,
  };
}

export function readOutbox() {
  const storage = getStorage();
  if (!storage) return [];
  let parsed = null;
  try {
    const raw = storage.getItem(OUTBOX_STORAGE_KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const agora = Date.now();
  const vistos = new Set();
  const limpos = [];
  for (const raw of parsed) {
    const item = sanitizeItem(raw);
    if (!item) continue;
    if (agora - item.enfileiradoEm > TTL_MS) continue;
    if (vistos.has(item.tempId)) continue;
    vistos.add(item.tempId);
    limpos.push(item);
  }
  return limpos.slice(-MAX_ITEMS);
}

function writeOutbox(items) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const lista = (Array.isArray(items) ? items : []).slice(-MAX_ITEMS);
    if (lista.length === 0) storage.removeItem(OUTBOX_STORAGE_KEY);
    else storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(lista));
    return true;
  } catch {
    // Cota estourada ou storage indisponivel: nao pode derrubar o envio.
    return false;
  }
}

/** Idempotente por tempId: uma nova tentativa do mesmo envio nao duplica a fila. */
export function enqueueOutboxText({ conversaId, texto, tempId, replyMeta = null, criadoEm = null, modo = OUTBOX_MODO_OFFLINE, emVooMs = 0 } = {}) {
  const item = sanitizeItem({
    tempId,
    conversaId,
    texto,
    replyMeta,
    criadoEm,
    enfileiradoEm: Date.now(),
    tentativas: 0,
    modo,
    emVooAte: Number(emVooMs) > 0 ? Date.now() + Number(emVooMs) : 0,
    dono: outboxIdentidadeAtual(),
  });
  if (!item) return null;
  const atual = readOutbox();
  const idx = atual.findIndex((i) => i.tempId === item.tempId);
  if (idx >= 0) {
    // Mantem a posicao original para nao furar a ordem da fila. Modo e "em voo" acompanham a
    // classificação mais recente (ex.: gravado antes do POST e depois confirmado como offline).
    const preservado = {
      ...atual[idx],
      texto: item.texto,
      replyMeta: item.replyMeta,
      modo: item.modo,
      emVooAte: item.emVooAte,
    };
    const next = [...atual];
    next[idx] = preservado;
    writeOutbox(next);
    return preservado;
  }
  writeOutbox([...atual, item]);
  return item;
}

/** Claim do item por esta aba (best-effort; o dedupe do backend é a rede de segurança). */
function claimOutboxItem(tempId) {
  const atual = readOutbox();
  const idx = atual.findIndex((i) => i.tempId === tempId);
  if (idx < 0) return false;
  const item = atual[idx];
  if (item.lockAte > Date.now() && item.lockDono && item.lockDono !== TAB_ID) return false;
  const next = [...atual];
  next[idx] = { ...item, lockAte: Date.now() + LOCK_TTL_MS, lockDono: TAB_ID };
  writeOutbox(next);
  return true;
}

function releaseOutboxItemLock(tempId) {
  const atual = readOutbox();
  const idx = atual.findIndex((i) => i.tempId === tempId);
  if (idx < 0) return;
  const next = [...atual];
  next[idx] = { ...next[idx], lockAte: 0, lockDono: null };
  writeOutbox(next);
}

export function removeFromOutbox(tempId) {
  const alvo = tempId != null ? String(tempId).trim() : "";
  if (!alvo) return false;
  const atual = readOutbox();
  const next = atual.filter((i) => i.tempId !== alvo);
  if (next.length === atual.length) return false;
  writeOutbox(next);
  return true;
}

export function markOutboxAttempt(tempId, { erro = null } = {}) {
  const alvo = tempId != null ? String(tempId).trim() : "";
  if (!alvo) return null;
  const atual = readOutbox();
  const idx = atual.findIndex((i) => i.tempId === alvo);
  if (idx < 0) return null;
  const atualizado = {
    ...atual[idx],
    tentativas: Number(atual[idx].tentativas || 0) + 1,
    ultimoErro: erro ? String(erro).slice(0, 300) : atual[idx].ultimoErro,
  };
  const next = [...atual];
  next[idx] = atualizado;
  writeOutbox(next);
  return atualizado;
}

export function listOutboxForConversa(conversaId) {
  const alvo = conversaId != null ? String(conversaId).trim() : "";
  if (!alvo) return [];
  const eu = outboxIdentidadeAtual();
  return readOutbox().filter((i) => i.conversaId === alvo && itemPertenceAoUsuarioAtual(i, eu));
}

export function outboxHasItems() {
  const eu = outboxIdentidadeAtual();
  return readOutbox().some((i) => itemPertenceAoUsuarioAtual(i, eu));
}

/** Campos aplicados na bolha conforme o modo: offline = "Aguardando conexão"; incerto = "Verificando…". */
export function outboxPendingMessageFields(item = {}) {
  // Gravado antes do POST e ainda dentro da janela "em voo": é um envio normal em andamento
  // (relógio), não "verificando".
  if (Number(item?.emVooAte) > Date.now()) {
    return {
      status: "pending",
      status_mensagem: "pending",
      aguardando_conexao: false,
      envio_erro: false,
      envio_incerto: false,
      envio_demorado: false,
      client_temp_id: item?.tempId,
    };
  }
  if (item?.modo === OUTBOX_MODO_INCERTO) {
    return {
      status: "status_indefinido",
      status_mensagem: "status_indefinido",
      aguardando_conexao: false,
      envio_erro: false,
      envio_incerto: true,
      envio_demorado: false,
      client_temp_id: item?.tempId,
      erro_mensagem: "Verificando se a mensagem foi enviada…",
    };
  }
  return {
    status: OUTBOX_STATUS,
    status_mensagem: OUTBOX_STATUS,
    aguardando_conexao: true,
    envio_erro: false,
    envio_incerto: false,
    envio_demorado: false,
    client_temp_id: item?.tempId,
    erro_mensagem: "Aguardando conexão. Será enviada automaticamente quando a internet voltar.",
  };
}

function normalizeOutboxConversaId(conversaId) {
  if (typeof conversaId === "number" && Number.isFinite(conversaId)) return conversaId;
  const raw = String(conversaId ?? "").trim();
  if (!raw) return conversaId;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return Number.isSafeInteger(n) ? n : raw;
  }
  return raw;
}

/** Bolha otimista reconstruída a partir do item persistido (sobrevive ao F5). */
export function buildOutboxBubble(item) {
  const sanitized = sanitizeItem(item);
  if (!sanitized) return null;
  return {
    tempId: sanitized.tempId,
    client_temp_id: sanitized.tempId,
    conversa_id: normalizeOutboxConversaId(sanitized.conversaId),
    texto: sanitized.texto,
    tipo: "texto",
    direcao: "out",
    criado_em: sanitized.criadoEm,
    ...(sanitized.replyMeta ? { reply_meta: sanitized.replyMeta } : {}),
    ...outboxPendingMessageFields(sanitized),
  };
}

/**
 * Injeta/atualiza bolhas da fila offline na lista da conversa.
 * Idempotente por tempId: nao duplica se a bolha ja estiver na tela.
 */
export function hydrateOutboxBubblesForConversa(conversaId, existingList = []) {
  const items = listOutboxForConversa(conversaId);
  if (!items.length) return Array.isArray(existingList) ? existingList : [];
  const next = Array.isArray(existingList) ? [...existingList] : [];
  const indexByTemp = new Map();
  for (let i = 0; i < next.length; i++) {
    const m = next[i];
    const tid = String(m?.tempId || m?.client_temp_id || "").trim();
    if (tid) indexByTemp.set(tid, i);
  }
  for (const item of items) {
    const tid = String(item.tempId);
    const idx = indexByTemp.get(tid);
    if (idx != null) {
      const prev = next[idx];
      // Nao sobrescrever mensagem ja persistida no backend.
      if (prev?.id != null || prev?.whatsapp_id) continue;
      // Envio ao vivo em andamento: a bolha na tela já está no estado certo.
      if (Number(item.emVooAte) > Date.now()) continue;
      next[idx] = {
        ...prev,
        ...outboxPendingMessageFields(item),
        texto: item.texto,
        ...(item.replyMeta ? { reply_meta: item.replyMeta } : {}),
      };
      continue;
    }
    const bubble = buildOutboxBubble(item);
    if (!bubble) continue;
    next.push(bubble);
    indexByTemp.set(tid, next.length - 1);
  }
  return next;
}

export function isBrowserOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isFalhaDeRede(classified) {
  return (
    classified?.kind === OUTBOUND_ERROR_KIND.OFFLINE ||
    classified?.kind === OUTBOUND_ERROR_KIND.TIMEOUT ||
    classified?.kind === OUTBOUND_ERROR_KIND.UNKNOWN ||
    (classified?.kind === OUTBOUND_ERROR_KIND.HTTP && classified?.uncertain === true)
  );
}

let flushEmAndamento = false;

/**
 * Reenvia a fila em ordem. A propria tentativa e o teste de acessibilidade da API:
 * se falhar por rede, para e mantem tudo enfileirado.
 *
 * @param {object} deps
 * @param {(item: object) => Promise<any>} deps.sendText executa o POST reaproveitando o tempId
 * @param {(item: object, res: any) => void} [deps.onConfirmado] backend confirmou
 * @param {(item: object, classified: object) => void} [deps.onFalhaDefinitiva] nao adianta insistir
 * @param {() => boolean} [deps.estaOffline]
 */
export async function flushOutbox({ sendText, onConfirmado, onFalhaDefinitiva, estaOffline, jaPersistida } = {}) {
  if (typeof sendText !== "function") return { enviadas: 0, restantes: readOutbox().length, parou: "sem_sender" };
  if (flushEmAndamento) return { enviadas: 0, restantes: readOutbox().length, parou: "em_andamento" };
  if (typeof estaOffline === "function" && estaOffline()) {
    return { enviadas: 0, restantes: readOutbox().length, parou: "offline" };
  }

  flushEmAndamento = true;
  let enviadas = 0;
  let parou = null;
  let retryAfterMs = null;
  try {
    // Releitura a cada volta: o storage pode ter mudado em outra aba.
    for (let guard = 0; guard < MAX_ITEMS; guard++) {
      // Só itens do usuário logado: os de outro dono ficam guardados para ele, sem travar a fila.
      const eu = outboxIdentidadeAtual();
      const fila = readOutbox().filter((i) => itemPertenceAoUsuarioAtual(i, eu));
      if (!fila.length) break;
      const item = fila[0];
      // Gravado antes do POST e o envio ao vivo ainda está rodando nesta sessão: não competir.
      if (item.emVooAte > Date.now()) {
        parou = "em_voo";
        break;
      }
      // Outra aba está enviando este item agora: não competir (ordem por conversa é sagrada).
      // O claim expira sozinho em LOCK_TTL_MS; o scheduler volta a tentar depois.
      if (item.lockAte > Date.now() && item.lockDono && item.lockDono !== TAB_ID) {
        parou = "lock_outra_aba";
        break;
      }
      // Item 'incerto' cuja linha JÁ apareceu com id na tela (socket/refresh reconciliou):
      // nada a reenviar — remove em silêncio, sem gastar um POST.
      if (item.modo === OUTBOX_MODO_INCERTO && typeof jaPersistida === "function") {
        let resolvida = false;
        try {
          resolvida = jaPersistida(item) === true;
        } catch {
          resolvida = false;
        }
        if (resolvida) {
          removeFromOutbox(item.tempId);
          continue;
        }
      }
      if (!claimOutboxItem(item.tempId)) {
        parou = "lock_outra_aba";
        break;
      }
      try {
        const res = await sendText(item);
        removeFromOutbox(item.tempId);
        enviadas += 1;
        try {
          onConfirmado?.(item, res);
        } catch {
          /* callback de UI nao pode travar a fila */
        }
      } catch (err) {
        const classified = classifyOutboundAxiosError(err);
        if (classified?.retryAfterMs != null) {
          retryAfterMs = Math.max(retryAfterMs || 0, classified.retryAfterMs);
        }
        // Sessão expirada não é falha da MENSAGEM: mantém na fila (o dono a envia ao logar de
        // novo) e para. Antes o item era apagado, embora a tela prometesse envio automático.
        if (Number(classified?.httpStatus) === 401) {
          releaseOutboxItemLock(item.tempId);
          parou = "sessao";
          break;
        }
        markOutboxAttempt(item.tempId, { erro: classified.message });
        releaseOutboxItemLock(item.tempId);
        // Falha de REDE não conta para desistir: cada troca de conversa, volta de aba e
        // reconexão dispara uma tentativa, e 8 delas apagavam a mensagem em minutos com o
        // servidor fora do ar. Quem limita a espera é o prazo de validade do item (7 dias).
        const desistir = !isFalhaDeRede(classified);
        if (desistir) {
          removeFromOutbox(item.tempId);
          try {
            onFalhaDefinitiva?.(item, classified);
          } catch {
            /* ignore */
          }
          // Erro do item, nao da rede: segue para o proximo.
          if (!isFalhaDeRede(classified)) continue;
        }
        parou = isFalhaDeRede(classified) ? "rede" : "erro_item";
        if (isFalhaDeRede(classified)) break;
      }
    }
  } finally {
    flushEmAndamento = false;
  }
  return { enviadas, restantes: readOutbox().length, parou, retryAfterMs };
}

/** Logout/troca de usuário: a fila de texto contém conteúdo do usuário — zera. */
export function limparOutboxTextoLocal() {
  const storage = getStorage()
  try {
    storage?.removeItem(OUTBOX_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function _resetOutboxForTests() {
  flushEmAndamento = false;
  const storage = getStorage();
  try {
    storage?.removeItem(OUTBOX_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
