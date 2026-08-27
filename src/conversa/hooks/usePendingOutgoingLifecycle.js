import { useEffect } from "react";
import { enviarMensagem } from "../conversaService";
import { useConversaStore } from "../conversaStore";
import {
  flushOutbox,
  outboxHasItems,
  isBrowserOffline,
} from "../offlineOutbox";
import { WATCHDOG_TICK_MS } from "../pendingMessageWatchdog";
import { shouldShowOutboundToast } from "../outboundSendError";
import { normalizeTextSendApiToMessage } from "../conversaOptimisticMessage";

/**
 * Watchdog de pending + flush da outbox offline.
 * Extraído de ConversaView sem alterar intervalos, payloads ou reconciliação.
 */
export function usePendingOutgoingLifecycle({
  conversaId,
  refresh,
  showToast,
  applyPendingOutgoingWatchdog,
}) {
  useEffect(() => {
    if (!conversaId) return undefined;
    const tick = () => {
      try {
        applyPendingOutgoingWatchdog?.();
      } catch (_) {
        /* ignore */
      }
    };
    tick();
    const id = window.setInterval(tick, WATCHDOG_TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [conversaId, applyPendingOutgoingWatchdog]);

  useEffect(() => {
    let cancelled = false;

    const flushPendingOutbox = async () => {
      if (cancelled || isBrowserOffline() || !outboxHasItems()) return;
      try {
        await flushOutbox({
          estaOffline: isBrowserOffline,
          sendText: async (item) =>
            enviarMensagem(
              item.conversaId,
              item.texto,
              item.replyMeta || undefined,
              item.tempId
            ),
          onConfirmado: (item, res) => {
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
            if (payload.id == null && !payload.whatsapp_id) return;
            store.reconciliarMensagem?.(item.tempId, payload);
            store.patchMensagem?.(payload.id, {
              status,
              status_mensagem: status,
              tempId: item.tempId,
              aguardando_conexao: false,
              envio_incerto: false,
              envio_demorado: false,
              ...(payload.whatsapp_id ? { whatsapp_id: payload.whatsapp_id } : {}),
            }, { conversa_id: payload.conversa_id });
          },
          onFalhaDefinitiva: (item, classified) => {
            useConversaStore.getState().marcarMensagemTempErro?.(item.tempId, {
              erro_mensagem: classified?.message || "Não foi possível enviar a mensagem.",
            });
            const toastKey = `outbox-fail-${item.tempId}`;
            if (shouldShowOutboundToast(toastKey)) {
              showToast({
                type: "error",
                title: "Falha ao enviar",
                message: classified?.message || "Não foi possível enviar a mensagem salva offline.",
              });
            }
          },
        });
      } catch (e) {
        console.warn("[outbox] flush falhou:", e?.message || e);
      }
      if (!cancelled && conversaId) {
        try {
          void refresh({ silent: true });
        } catch (_) {
          /* ignore */
        }
      }
    };

    const onOnline = () => {
      try {
        applyPendingOutgoingWatchdog?.();
      } catch (_) {
        /* ignore */
      }
      void flushPendingOutbox();
    };

    window.addEventListener("online", onOnline);
    if (!isBrowserOffline() && outboxHasItems()) {
      void flushPendingOutbox();
    }
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [conversaId, refresh, showToast, applyPendingOutgoingWatchdog]);
}
