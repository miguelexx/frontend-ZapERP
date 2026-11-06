import { useCallback, useEffect, useRef, useState } from "react";
import { getWhapiChannelStatus } from "../chatService";
import { isWhapiOverlayDisconnected, navegadorOffline } from "./whapiOverlayRule";

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

export { isWhapiOverlayDisconnected } from "./whapiOverlayRule";

/**
 * Monitora o canal Whapi e decide se a tela de reconexão (QR Code) deve aparecer.
 *
 * Só acende com APARELHO DESVINCULADO confirmado em leituras consecutivas.
 * Queda de internet não acende em nenhuma das três pontas: o navegador offline
 * suspende a checagem e apaga a tela, a falha do request não conta, e canal
 * reconectando (INIT/LAUNCH) volta como conectado do backend.
 * Uma única leitura conectada apaga na hora. Empresa sem Whapi nunca dispara.
 */
export function useWhapiChannelStatus() {
  const [disconnected, setDisconnected] = useState(false);
  const [offline, setOffline] = useState(navegadorOffline);
  const consecutiveDownRef = useRef(0);
  // Checagem sob demanda: quem reconecta pela própria tela não pode esperar até
  // 60s de poll para o overlay apagar. Uma leitura conectada apaga na hora.
  const checarRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let ultimaChecagem = 0;

    const checar = () => {
      // Sem rede no navegador, a resposta (ou a falta dela) não diz nada sobre o
      // aparelho: nem consulta. A contagem é preservada — a prova anterior
      // continua válida e a tela volta com UMA leitura quando a rede voltar.
      if (navegadorOffline()) return;
      ultimaChecagem = Date.now();
      getWhapiChannelStatus()
        .then((s) => {
          if (cancelled) return;
          const down = isWhapiOverlayDisconnected(s);
          if (down) {
            consecutiveDownRef.current += 1;
            if (consecutiveDownRef.current >= WHAPI_DISCONNECT_CONFIRMATIONS) {
              setDisconnected(true);
            }
          } else {
            consecutiveDownRef.current = 0;
            setDisconnected(false);
          }
        })
        .catch(() => {
          // Falha de rede não é prova de desconexão do canal: não conta.
        });
    };

    checarRef.current = checar;

    const first = setTimeout(checar, WHAPI_STATUS_FIRST_DELAY_MS);
    // Aba oculta não pinta overlay: pausa o poll e deixa o handler de foco revalidar na volta.
    const intervalo = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      checar();
    }, WHAPI_STATUS_REFRESH_MS);

    const aoFocar = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimaChecagem < WHAPI_STATUS_FOCUS_MIN_INTERVAL_MS) return;
      checar();
    };
    document.addEventListener("visibilitychange", aoFocar);
    window.addEventListener("focus", aoFocar);

    // Internet caiu: a tela de reconexão some na hora (o canal não tem culpa).
    // Internet voltou: revalida sem esperar o poll de 60s.
    const aoFicarOffline = () => setOffline(true);
    const aoVoltarOnline = () => {
      setOffline(false);
      ultimaChecagem = 0;
      checar();
    };
    window.addEventListener("offline", aoFicarOffline);
    window.addEventListener("online", aoVoltarOnline);

    return () => {
      cancelled = true;
      checarRef.current = null;
      clearTimeout(first);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoFocar);
      window.removeEventListener("focus", aoFocar);
      window.removeEventListener("offline", aoFicarOffline);
      window.removeEventListener("online", aoVoltarOnline);
    };
  }, []);

  const revalidate = useCallback(() => {
    checarRef.current?.();
  }, []);

  return { whapiDisconnected: disconnected && !offline, revalidate };
}
