import { useEffect, useRef, useState } from "react";
import { getWhapiChannelStatus } from "../chatService";

/** Revalidação periódica do canal Whapi (o overlay vermelho precisa acender e sumir sozinho). */
const WHAPI_STATUS_REFRESH_MS = 60_000;
/** Primeira checagem depois do paint, sem competir com o carregamento inicial. */
const WHAPI_STATUS_FIRST_DELAY_MS = 2_500;
/** Trava para o foco de janela não disparar checagem a cada alternância de aba. */
const WHAPI_STATUS_FOCUS_MIN_INTERVAL_MS = 20_000;
/**
 * Quantas leituras consecutivas de "desconectado" antes de pintar a tela.
 * Evita que um único flake de rede/API acenda o overlay vermelho no sistema todo.
 */
const WHAPI_DISCONNECT_CONFIRMATIONS = 2;

/**
 * Monitora o canal Whapi e decide se o overlay de "canal desconectado" deve aparecer.
 *
 * Só acende quando o backend confirma `isWhapi === true && connected === false`
 * em leituras consecutivas; uma única leitura conectada apaga na hora. Empresas
 * que não usam Whapi (ou erro de consulta) nunca disparam o overlay — o backend
 * devolve `connected:true`/`isWhapi:false` nesses casos, e uma falha de rede é
 * tratada como "sem mudança" (não conta como desconexão).
 */
export function useWhapiChannelStatus() {
  const [disconnected, setDisconnected] = useState(false);
  const consecutiveDownRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let ultimaChecagem = 0;

    const checar = () => {
      ultimaChecagem = Date.now();
      getWhapiChannelStatus()
        .then((s) => {
          if (cancelled) return;
          const isWhapi = s?.isWhapi === true;
          const down = isWhapi && s?.connected === false;
          if (down) {
            consecutiveDownRef.current += 1;
            if (consecutiveDownRef.current >= WHAPI_DISCONNECT_CONFIRMATIONS) {
              setDisconnected(true);
            }
          } else {
            // Conectado, ou empresa não-Whapi: limpa imediatamente.
            consecutiveDownRef.current = 0;
            setDisconnected(false);
          }
        })
        .catch(() => {
          // Falha de rede não é prova de desconexão do canal: não conta.
          // Mantém o estado atual (não acende nem apaga por causa do erro).
        });
    };

    const first = setTimeout(checar, WHAPI_STATUS_FIRST_DELAY_MS);
    const intervalo = setInterval(checar, WHAPI_STATUS_REFRESH_MS);

    // Voltar para a aba é quando o atendente olha a tela: revalida na hora.
    const aoFocar = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimaChecagem < WHAPI_STATUS_FOCUS_MIN_INTERVAL_MS) return;
      checar();
    };
    document.addEventListener("visibilitychange", aoFocar);
    window.addEventListener("focus", aoFocar);

    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoFocar);
      window.removeEventListener("focus", aoFocar);
    };
  }, []);

  return { whapiDisconnected: disconnected };
}
