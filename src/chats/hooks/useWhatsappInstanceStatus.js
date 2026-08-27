import { useEffect, useState } from "react";
import { getZapiStatus } from "../chatService";
import { scheduleAfterInitialPaint } from "../scheduleAfterInitialPaint";

const MOBILE_ZAPI_STATUS_DELAY_MS = 3200;
/** Revalidação periódica do status do WhatsApp (o banner precisa sumir sozinho ao reconectar). */
const ZAPI_STATUS_REFRESH_MS = 120_000;
/** Trava para o foco de janela não disparar checagem a cada alternância de aba. */
const ZAPI_STATUS_FOCUS_MIN_INTERVAL_MS = 30_000;

/**
 * Status das instâncias WhatsApp (UltraMSG; `getZapiStatus` é nome legado).
 * Timers, delay mobile e revalidação em foco/visibility iguais ao ChatList original.
 */
export function useWhatsappInstanceStatus(isMobileLayout) {
  // null=não verificado, true=conectado, false=desconectado
  const [zapiConnected, setZapiConnected] = useState(null);
  const [zapiStatusLoaded, setZapiStatusLoaded] = useState(false);

  // Status UltraMSG (nome legado getZapiStatus) só após paint/idle, sem competir com GET da lista.
  useEffect(() => {
    let cancelled = false;

    const delay = isMobileLayout ? MOBILE_ZAPI_STATUS_DELAY_MS : 400;
    let ultimaChecagem = 0;

    const checar = () => {
      ultimaChecagem = Date.now();
      getZapiStatus()
        .then((s) => {
          if (cancelled) return;
          setZapiConnected(s?.connected === true);
          setZapiStatusLoaded(true);
        })
        .catch(() => {
          if (!cancelled) setZapiStatusLoaded(true);
        });
    };

    const cancelStatus = scheduleAfterInitialPaint(checar, delay);

    // O status era lido UMA vez, ao montar. Depois de reconectar o WhatsApp o banner
    // "mensagens não serão entregues" continuava na tela até o atendente dar F5 — e, ao
    // contrário, uma queda no meio do expediente nunca aparecia. Agora revalida sozinho.
    const intervalo = setInterval(checar, ZAPI_STATUS_REFRESH_MS);

    // Voltar para a aba é o momento em que o atendente olha a tela: revalida na hora,
    // com trava para não disparar a cada alternância de janela.
    const aoFocar = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimaChecagem < ZAPI_STATUS_FOCUS_MIN_INTERVAL_MS) return;
      checar();
    };
    document.addEventListener("visibilitychange", aoFocar);
    window.addEventListener("focus", aoFocar);

    return () => {
      cancelled = true;
      cancelStatus();
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoFocar);
      window.removeEventListener("focus", aoFocar);
    };
  }, [isMobileLayout]);

  return { zapiConnected, zapiStatusLoaded };
}
