/**
 * Auto-flush GLOBAL da outbox de texto (e da outbox de mídia, quando registrada).
 *
 * Antes, a fila só descarregava no evento `online` do navegador ou ao abrir/trocar de
 * conversa — se o BACKEND caísse com o navegador "online" (ERR_NETWORK), ou se o atendente
 * ficasse na lista de conversas, os itens esperavam para sempre. Aqui o flush roda:
 *  - no evento `online`;
 *  - na reconexão do Socket.IO (evento window `zap:socket:reconnect`, disparado em socket.js);
 *  - quando a aba volta a ficar visível;
 *  - e num agendador com EXPONENTIAL BACKOFF + JITTER enquanto houver itens
 *    (15s → 30s → 60s → … teto 5min, ±30% de jitter; respeita Retry-After de 429).
 *
 * Idempotência: o reenvio usa sempre o MESMO client_temp_id — o backend deduplica
 * (Map 30s + UNIQUE no banco) e responde a linha existente; nunca duplica no WhatsApp.
 */

import { enviarMensagem } from "./conversaService";
import { useConversaStore } from "./conversaStore";
import {
  flushOutbox,
  outboxHasItems,
  isBrowserOffline,
  OUTBOX_MODO_INCERTO,
} from "./offlineOutbox";
import { shouldShowOutboundToast } from "./outboundSendError";
import { normalizeTextSendApiToMessage } from "./conversaOptimisticMessage";
import { flushMediaOutbox, mediaOutboxHasItems, initMediaOutbox } from "./mediaOutbox";
import { useNotificationStore } from "../notifications/notificationStore";

export const SOCKET_RECONNECT_EVENT = "zap:socket:reconnect";

const BACKOFF_BASE_MS = 15_000;
const BACKOFF_MAX_MS = 5 * 60_000;

let iniciado = false;
let timer = null;
let falhasSeguidas = 0;
let toastFn = null;

/** O hook da conversa registra o toast quando montado; sem UI, o flush segue em silêncio. */
export function registrarOutboxToast(fn) {
  toastFn = typeof fn === "function" ? fn : null;
}

/**
 * Aviso de falha de envio. Com a conversa aberta usa o toast dela; sem ela (lista de conversas,
 * outra tela, celular) cai no toast GLOBAL — antes a falha era totalmente silenciosa e a
 * mensagem simplesmente não existia mais quando o atendente voltava.
 */
export function avisarFalhaDeEnvio(payload) {
  try {
    if (toastFn) toastFn(payload);
    else useNotificationStore.getState().showToast?.(payload);
  } catch {
    /* aviso é best-effort */
  }
}

function haItensPendentes() {
  return outboxHasItems() || mediaOutboxHasItems();
}

function comJitter(ms) {
  const fator = 0.7 + Math.random() * 0.6; // ±30%
  return Math.round(ms * fator);
}

function proximoDelayMs(retryAfterMs) {
  const backoff = Math.min(BACKOFF_BASE_MS * 2 ** Math.min(falhasSeguidas, 6), BACKOFF_MAX_MS);
  const base = Math.max(backoff, Number(retryAfterMs) || 0);
  return comJitter(base);
}

function agendar(retryAfterMs = null) {
  if (timer) return;
  if (!haItensPendentes()) return;
  timer = setTimeout(() => {
    timer = null;
    void executarFlushGlobal("backoff");
  }, proximoDelayMs(retryAfterMs));
}

function reagendar(retryAfterMs = null) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  agendar(retryAfterMs);
}

/** Item 'incerto' já reconciliado na tela (linha com id para o mesmo client_temp_id)? */
function itemJaPersistidaNaStore(item) {
  try {
    const st = useConversaStore.getState();
    if (String(st.selectedId ?? "") !== String(item.conversaId ?? "")) return false;
    const lista = st.mensagens || [];
    return lista.some(
      (m) =>
        m?.id != null &&
        String(m?.client_temp_id || m?.tempId || "") === String(item.tempId)
    );
  } catch {
    return false;
  }
}

/** Confirmação do backend aplicada na bolha (compartilhada entre hook e auto-flush). */
export function aplicarConfirmacaoOutboxNaStore(item, res) {
  const store = useConversaStore.getState();
  const realMsg = normalizeTextSendApiToMessage(res, item.conversaId);
  const resId = res?.mensagem?.id ?? res?.id ?? realMsg?.id;
  const status =
    realMsg?.status_mensagem ||
    realMsg?.status ||
    res?.status_mensagem ||
    res?.mensagem?.status_mensagem ||
    res?.status ||
    res?.mensagem?.status ||
    "pending";
  const payload = {
    ...(realMsg || {}),
    id: resId ?? realMsg?.id,
    conversa_id: realMsg?.conversa_id ?? item.conversaId,
    texto: realMsg?.texto ?? item.texto,
    tipo: realMsg?.tipo || "texto",
    direcao: "out",
    status,
    status_mensagem: status,
    client_temp_id: item.tempId,
    whatsapp_id: realMsg?.whatsapp_id ?? res?.whatsapp_id ?? res?.mensagem?.whatsapp_id,
    aguardando_conexao: false,
    envio_incerto: false,
    envio_demorado: false,
    envio_erro: false,
    ...(item.replyMeta ? { reply_meta: item.replyMeta } : {}),
  };
  if (payload.id == null && !payload.whatsapp_id) {
    // Resposta sem id (não deveria acontecer): ao menos tira a bolha do estado de espera —
    // antes ela ficava em "Aguardando conexão" para sempre mesmo com o item já fora da fila.
    store.patchMensagem?.(
      null,
      {
        tempId: item.tempId,
        status: "pending",
        status_mensagem: "pending",
        aguardando_conexao: false,
        envio_incerto: false,
      },
      { conversa_id: item.conversaId, forceStatus: true }
    );
    return;
  }
  store.reconciliarMensagem?.(item.tempId, payload);
  store.patchMensagem?.(
    payload.id,
    {
      status,
      status_mensagem: status,
      tempId: item.tempId,
      aguardando_conexao: false,
      envio_incerto: false,
      envio_demorado: false,
      ...(payload.whatsapp_id ? { whatsapp_id: payload.whatsapp_id } : {}),
    },
    { conversa_id: payload.conversa_id }
  );
}

function aoFalharDefinitivo(item, classified) {
  try {
    useConversaStore.getState().marcarMensagemTempErro?.(item.tempId, {
      erro_mensagem: classified?.message || "Não foi possível enviar a mensagem.",
    });
  } catch {
    /* ignore */
  }
  const toastKey = `outbox-fail-${item.tempId}`;
  if (shouldShowOutboundToast(toastKey)) {
    const trecho = String(item?.texto || "").trim().slice(0, 60);
    avisarFalhaDeEnvio({
      type: "error",
      title: "Mensagem não enviada",
      message:
        (trecho ? `"${trecho}${String(item?.texto || "").trim().length > 60 ? "…" : ""}" — ` : "") +
        (classified?.message || "Não foi possível enviar a mensagem que estava na fila."),
    });
  }
}

/** Executa um ciclo de flush (texto + flushers extras) e agenda o próximo se restar algo. */
export async function executarFlushGlobal(origem = "manual") {
  if (isBrowserOffline()) {
    // Sem rede não adianta backoff: o evento `online` reativa.
    return { enviadas: 0, parou: "offline" };
  }
  let resultado = { enviadas: 0, restantes: 0, parou: null, retryAfterMs: null };
  try {
    resultado = await flushOutbox({
      estaOffline: isBrowserOffline,
      jaPersistida: itemJaPersistidaNaStore,
      sendText: async (item) =>
        enviarMensagem(item.conversaId, item.texto, item.replyMeta || undefined, item.tempId, {
          retryManual: item.modo === OUTBOX_MODO_INCERTO ? true : undefined,
        }),
      onConfirmado: aplicarConfirmacaoOutboxNaStore,
      onFalhaDefinitiva: aoFalharDefinitivo,
    });
  } catch (e) {
    console.warn("[outboxAutoFlush] flush texto falhou:", e?.message || e);
  }

  // Mídia depois do texto (duas filas independentes; FIFO dentro de cada uma).
  let midiaPendente = false;
  try {
    const rMedia = await flushMediaOutbox();
    if ((rMedia?.restantes || 0) > 0) midiaPendente = true;
    if (rMedia?.enviadas > 0) resultado.enviadas += rMedia.enviadas;
    if (rMedia?.retryAfterMs != null) {
      resultado.retryAfterMs = Math.max(resultado.retryAfterMs || 0, rMedia.retryAfterMs);
    }
  } catch (e) {
    console.warn("[outboxAutoFlush] flush mídia falhou:", e?.message || e);
    midiaPendente = mediaOutboxHasItems();
  }

  const restam = (resultado.restantes || 0) > 0 || midiaPendente;
  // Parada por concorrência (flush em andamento / outra aba segurando o lock) não é falha
  // de rede: não deve inflar o backoff — senão duas abas se penalizavam mutuamente.
  const paradaPorConcorrencia =
    resultado.parou === "em_andamento" ||
    resultado.parou === "lock_outra_aba" ||
    resultado.parou === "em_voo" ||
    resultado.parou === "sessao";
  if (resultado.enviadas > 0 || !restam) falhasSeguidas = 0;
  else if (!paradaPorConcorrencia) falhasSeguidas += 1;
  // Sessão expirada: insistir só repetiria o 401. Os itens ficam guardados para o dono e o
  // flush volta sozinho no próximo carregamento, já autenticado.
  if (restam && resultado.parou !== "sessao") agendar(resultado.retryAfterMs);
  return resultado;
}

/** Tentativa imediata (nova mensagem enfileirada, reconexão, etc.) + re-agenda. */
export function pokeOutboxAutoFlush(origem = "poke") {
  ensureOutboxAutoFlush();
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  void executarFlushGlobal(origem);
}

/**
 * Agenda sem tentativa imediata — para falha INCERTA (timeout/5xx): o servidor pode estar
 * lento; bater de novo na hora só piora. O primeiro retry respeita o backoff (~15s + jitter).
 */
export function scheduleOutboxAutoFlush(retryAfterMs = null) {
  ensureOutboxAutoFlush();
  reagendar(retryAfterMs);
}

/** Liga os gatilhos globais uma única vez por aba. */
export function ensureOutboxAutoFlush() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  window.addEventListener("online", () => pokeOutboxAutoFlush("online"));
  window.addEventListener(SOCKET_RECONNECT_EVENT, () => pokeOutboxAutoFlush("socket"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && haItensPendentes()) {
      pokeOutboxAutoFlush("visivel");
    }
  });
  // Carrega os metadados da fila de mídia (IndexedDB) e agenda se sobrou algo do F5.
  void initMediaOutbox()
    .then(() => {
      if (haItensPendentes()) agendar();
    })
    .catch(() => {
      if (haItensPendentes()) agendar();
    });
}

export function _resetOutboxAutoFlushForTests() {
  if (timer) clearTimeout(timer);
  timer = null;
  falhasSeguidas = 0;
  // `iniciado` fica: listeners de window não são removíveis com segurança aqui.
}
