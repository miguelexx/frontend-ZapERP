import { useEffect } from "react";
import {
  outboxHasItems,
  isBrowserOffline,
} from "../offlineOutbox";
import {
  ensureOutboxAutoFlush,
  executarFlushGlobal,
  registrarOutboxToast,
} from "../outboxAutoFlush";
import { WATCHDOG_TICK_MS } from "../pendingMessageWatchdog";

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

    // A mecânica de flush (sender, confirmação, falha definitiva, backoff com jitter,
    // gatilhos online/socket/visibilidade e claim entre abas) vive em outboxAutoFlush —
    // GLOBAL, para a fila andar mesmo sem nenhuma conversa aberta. O hook só registra o
    // toast da UI, dispara um flush imediato ao abrir a conversa e dá refresh depois.
    ensureOutboxAutoFlush();
    registrarOutboxToast(showToast);

    const flushPendingOutbox = async () => {
      if (cancelled || isBrowserOffline() || !outboxHasItems()) return;
      try {
        await executarFlushGlobal("conversa_aberta");
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
      registrarOutboxToast(null);
    };
  }, [conversaId, refresh, showToast, applyPendingOutgoingWatchdog]);
}
