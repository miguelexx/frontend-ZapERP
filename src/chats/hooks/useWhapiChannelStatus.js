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

/** Respostas que NÃO provam queda da sessão (2+ canais sem default, timeout, health vazio). */
const WHAPI_AMBIGUOUS_STATUS = new Set(["", "NOT_CONFIGURED", "ERROR", "UNKNOWN"]);

/**
 * Overlay só com queda comprovada da sessão Whapi.
 * `connected:false` + `not_configured` é o falso positivo de 2 números sem is_default.
 */
export function isWhapiOverlayDisconnected(s) {
  if (s?.isWhapi !== true || s?.connected !== false) return false;
  const status = String(s?.status || "").trim().toUpperCase();
  if (WHAPI_AMBIGUOUS_STATUS.has(status)) return false;
  return true;
}

/**
 * Monitora o canal Whapi e decide se o overlay de "canal desconectado" deve aparecer.
 *
 * Só acende quando o backend confirma sessão Whapi comprovadamente fora do AUTH
 * em leituras consecutivas; `not_configured` / erro não pintam a tela. Uma única
 * leitura conectada apaga na hora. Empresas que não usam Whapi nunca disparam.
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

    const first = setTimeout(checar, WHAPI_STATUS_FIRST_DELAY_MS);
    const intervalo = setInterval(checar, WHAPI_STATUS_REFRESH_MS);

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
