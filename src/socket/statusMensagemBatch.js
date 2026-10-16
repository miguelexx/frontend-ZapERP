/** Janela de agrupamento para status_mensagem (ms). */
export const STATUS_MENSAGEM_BATCH_MS = 75;

const ERROR_STATUSES = new Set(["erro", "error", "failed", "falhou", "blocked"]);

const STATUS_RANK = {
  pending: 0,
  enviando: 0,
  sending: 0,
  // Incerteza pós-timeout: rank baixo para sent/delivered/read poderem reconciliar sem regressão.
  status_indefinido: 0,
  sent: 1,
  enviada: 1,
  enviado: 1,
  delivered: 2,
  entregue: 2,
  received: 2,
  read: 3,
  lida: 3,
  seen: 3,
  visualizada: 3,
  read_by_me: 3,
  played: 4,
  reproduzida: 4,
};

function statusRank(s) {
  const raw = String(s ?? "").toLowerCase().trim();
  if (!raw) return -1;
  // Erro vence pending/sending/status_indefinido (não some atrás de um eco atrasado), mas
  // PERDE para sent/delivered/read/played: o backend só emite esses após confirmação real
  // do provedor (retry automático/reconciliação). Com rank absoluto (200), um envio
  // recuperado pelo backend ficava para sempre com ícone de erro e botão "Reenviar".
  if (ERROR_STATUSES.has(raw)) return 0.5;
  return STATUS_RANK[raw] ?? 1;
}

export function pickHigherStatus(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return statusRank(b) >= statusRank(a) ? b : a;
}

/**
 * Status que deve ficar no CARD da lista ao aplicar um evento sobre a última mensagem (F6 do
 * doc 33). O card não tinha guarda nenhuma: fora da janela de 75ms da fila, um evento fora de
 * ordem rebaixava o tique ali (✓✓ azul voltando a ✓✓) enquanto a bolha da thread, que passa
 * por `pickHigherStatus` no conversaStore, mantinha o certo — as duas telas discordavam.
 *
 * `status_mensagem` tem precedência sobre `status` na leitura do que já está no card: é o campo
 * de progresso (a mesma ordem usada por `resolveOutgoingTick` e pelo conversaStore).
 */
export function resolveCardStatusFromMsg(msg, statusRecebido) {
  const atual = msg?.status_mensagem ?? msg?.status;
  return pickHigherStatus(atual, statusRecebido) ?? statusRecebido ?? null;
}

/**
 * Normaliza payload do socket (mesma regra do handler legado).
 * @returns {null | { mensagem_id, conversa_id, status, whatsapp_id }}
 */
export function normalizeStatusMensagemFromPayload(payload) {
  const p = payload?.data || payload || {};
  const conversa_id =
    p.conversa_id ??
    p.id_conversa ??
    p.conversation_id ??
    p.conversationId ??
    payload?.conversa_id ??
    payload?.id_conversa ??
    payload?.conversation_id ??
    payload?.conversationId;
  let mensagem_id =
    p.mensagem_id ?? p.message_id ?? p.msg_id ?? p.id ?? payload?.mensagem_id ?? payload?.message_id;
  if (
    mensagem_id != null &&
    conversa_id != null &&
    String(mensagem_id).trim() !== "" &&
    String(mensagem_id) === String(conversa_id)
  ) {
    mensagem_id = null;
  }
  const status = p.status ?? payload?.status;
  const whatsapp_id =
    p.whatsapp_id ?? p.wamid ?? p.wa_id ?? p.whatsappMessageId ?? payload?.whatsapp_id ?? payload?.wamid;
  if (!mensagem_id && !whatsapp_id && !status) return null;

  const raw = status != null ? String(status).toLowerCase().trim() : "";
  const s =
    raw === "enviada" || raw === "enviado"
      ? "sent"
      : raw === "entregue" || raw === "received"
        ? "delivered"
        : raw === "lida" || raw === "seen" || raw === "visualizada" || raw === "read_by_me"
          ? "read"
          : raw === "played" || raw === "reproduzida"
            ? "played"
            : raw || null;

  // Horário de entrega/leitura (F9 do doc 33): o backend manda só no ACK que acabou de gravar.
  // Sem carregar aqui, o normalizador descartava e o modal "Dados da mensagem" só veria o
  // horário depois de um refetch da thread.
  const entregue_em = p.entregue_em ?? payload?.entregue_em ?? null;
  const lida_em = p.lida_em ?? payload?.lida_em ?? null;

  return {
    mensagem_id: mensagem_id ?? null,
    conversa_id: conversa_id ?? null,
    status: s,
    whatsapp_id: whatsapp_id ?? null,
    ...(entregue_em ? { entregue_em } : {}),
    ...(lida_em ? { lida_em } : {}),
  };
}

function getQueueKey(evt) {
  const conv = evt.conversa_id != null ? String(evt.conversa_id) : "";
  if (evt.mensagem_id != null && String(evt.mensagem_id).trim() !== "") {
    return `id:${conv}:${String(evt.mensagem_id)}`;
  }
  if (evt.whatsapp_id != null && String(evt.whatsapp_id).trim() !== "") {
    return `wa:${conv}:${String(evt.whatsapp_id)}`;
  }
  return null;
}

function mergeQueuedEvents(prev, next) {
  const mergedStatus = pickHigherStatus(prev.status, next.status);
  // Marcos de horário: o PRIMEIRO que apareceu vence (o backend só grava uma vez; se os dois
  // ACKs caírem na mesma janela de 75ms, o mais antigo é o correto).
  const entregue_em = prev.entregue_em ?? next.entregue_em ?? null;
  const lida_em = prev.lida_em ?? next.lida_em ?? null;
  return {
    mensagem_id: next.mensagem_id ?? prev.mensagem_id ?? null,
    conversa_id: next.conversa_id ?? prev.conversa_id ?? null,
    whatsapp_id: next.whatsapp_id ?? prev.whatsapp_id ?? null,
    status: mergedStatus ?? next.status ?? prev.status ?? null,
    ...(entregue_em ? { entregue_em } : {}),
    ...(lida_em ? { lida_em } : {}),
  };
}

const queue = new Map();
let flushTimer = null;

function scheduleFlush(apply) {
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushStatusMensagemBatch(apply);
  }, STATUS_MENSAGEM_BATCH_MS);
}

/**
 * Enfileira status; sem chave confiável aplica na hora (comportamento legado).
 * @param {any} payload
 * @param {(evts: ReturnType<typeof normalizeStatusMensagemFromPayload>[]) => void} apply
 * @param {(payload: any) => boolean} shouldIgnore
 */
export function enqueueStatusMensagemEvent(payload, apply, shouldIgnore) {
  if (shouldIgnore?.(payload)) return;
  const evt = normalizeStatusMensagemFromPayload(payload);
  if (!evt) return;
  if (evt.conversa_id == null || String(evt.conversa_id).trim() === "") return;

  const key = getQueueKey(evt);
  if (!key) {
    apply([evt]);
    return;
  }

  const prev = queue.get(key);
  queue.set(key, prev ? mergeQueuedEvents(prev, evt) : evt);
  scheduleFlush(apply);
}

/** Aplica fila pendente imediatamente (ex.: disconnect). */
export function flushStatusMensagemBatch(apply) {
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.size === 0 || typeof apply !== "function") return;
  const items = [...queue.values()];
  queue.clear();
  apply(items);
}

/** Limpa fila e timer (ex.: re-init / disconnect após flush). */
export function resetStatusMensagemBatch() {
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  queue.clear();
}
