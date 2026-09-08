import { useEffect, useRef } from "react";
import { fetchConversaPresenca, isPresenceHttpEnabled } from "../conversaPresenceService";
import { useConversaStore } from "../conversaStore";

/**
 * Ao abrir conversa 1:1 Whapi: opcionalmente hidrata presença via HTTP.
 * Atualizações live vêm do socket `presenca_contato` (socket.js).
 * HTTP fica off por padrão (VITE_WHAPI_PRESENCE_HTTP=1 para religar).
 */
export default function useContactPresence({
  conversaId,
  telefone,
  provider,
  isGroup = false,
  enabled = true,
}) {
  const setContactPresence = useConversaStore((s) => s.setContactPresence);
  const clearContactPresence = useConversaStore((s) => s.clearContactPresence);
  const genRef = useRef(0);

  useEffect(() => {
    const id = conversaId != null ? String(conversaId) : "";
    if (!enabled || !id || isGroup) {
      if (id) clearContactPresence(id);
      return undefined;
    }

    const prov = String(provider || "").trim().toLowerCase();
    if (prov !== "whapi") {
      clearContactPresence(id);
      return undefined;
    }

    const tel = String(telefone || "").trim();
    if (!tel || tel.toLowerCase().startsWith("lid:")) {
      clearContactPresence(id);
      return undefined;
    }

    // Sem hydrate HTTP: evita 502 no console até o backend soft-fail estar em produção.
    if (!isPresenceHttpEnabled()) {
      return undefined;
    }

    const gen = ++genRef.current;
    let cancelled = false;

    ;(async () => {
      try {
        const data = await fetchConversaPresenca(id);
        if (cancelled || gen !== genRef.current) return;
        setContactPresence(id, {
          status: data?.status ?? null,
          last_seen: data?.last_seen ?? null,
          entry_id: data?.entry_id ?? null,
          source: "http",
        });
      } catch (err) {
        if (cancelled || gen !== genRef.current) return;
        if (err?.silent || err?.code === "PRESENCE_UNSUPPORTED") return;
      }
    })();

    return () => {
      cancelled = true;
      clearContactPresence(id);
    };
  }, [
    conversaId,
    telefone,
    provider,
    isGroup,
    enabled,
    setContactPresence,
    clearContactPresence,
  ]);
}
