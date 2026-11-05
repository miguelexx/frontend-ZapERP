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
      let enviadas = 0;
      try {
        const r = await executarFlushGlobal("conversa_aberta");
        enviadas = Number(r?.enviadas) || 0;
      } catch (e) {
        console.warn("[outbox] flush falhou:", e?.message || e);
      }
      /*
       * O refresh existe para reconciliar o que a FILA acabou de enviar. Se o flush não enviou
       * nada — caso normal quando a fila só tem o item "em voo" do envio ao vivo, que
       * `outboxHasItems()` conta mas `flushOutbox` ignora — não há nada a reconciliar e o GET
       * completo da conversa é puro desperdício (e, com este efeito reexecutando, vira laço).
       */
      if (!cancelled && conversaId && enviadas > 0) {
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
