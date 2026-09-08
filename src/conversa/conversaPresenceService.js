import api from "../api/http";

/**
 * GET /chats/:id/presenca — assina + lê presença (Whapi). UltraMSG → 501.
 *
 * HTTP desligado por padrão: o backend em produção ainda pode responder 502
 * quando a Whapi falha, e o Chrome loga "Failed to load resource" para qualquer
 * status ≠ 2xx. Presença live continua via socket `presenca_contato`.
 *
 * Para religar o hydrate HTTP (após deploy do soft-fail 200):
 *   VITE_WHAPI_PRESENCE_HTTP=1
 */

const PRESENCE_HTTP_ENABLED =
  String(import.meta.env?.VITE_WHAPI_PRESENCE_HTTP || "").trim() === "1";

const presenceUnsupportedUntil = new Map();
const UNSUPPORTED_TTL_MS = 10 * 60 * 1000;
const ROUTE_MISSING_KEY = "*";

function markUnsupported(key, ttlMs = UNSUPPORTED_TTL_MS) {
  presenceUnsupportedUntil.set(String(key), Date.now() + ttlMs);
}

function isMarkedUnsupported(key) {
  const until = presenceUnsupportedUntil.get(String(key));
  if (until == null) return false;
  if (Date.now() > until) {
    presenceUnsupportedUntil.delete(String(key));
    return false;
  }
  return true;
}

function softFail(message, status, { global = false, conversaId } = {}) {
  if (global) markUnsupported(ROUTE_MISSING_KEY);
  else if (conversaId != null) markUnsupported(conversaId);
  const err = new Error(message);
  err.code = "PRESENCE_UNSUPPORTED";
  err.status = status;
  err.silent = true;
  return err;
}

export function isPresenceHttpEnabled() {
  return PRESENCE_HTTP_ENABLED;
}

export async function fetchConversaPresenca(conversaId, { subscribe = true } = {}) {
  const id = Number(conversaId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("conversa_id inválido");
  }

  if (!PRESENCE_HTTP_ENABLED) {
    throw softFail("Hydrate HTTP de presença desligado (use socket)", null, { global: true });
  }

  if (isMarkedUnsupported(ROUTE_MISSING_KEY) || isMarkedUnsupported(id)) {
    throw softFail("Presença indisponível neste servidor", null, { conversaId: id });
  }

  try {
    const { data, status } = await api.get(`/chats/${id}/presenca`, {
      params: subscribe === false ? { subscribe: "false" } : undefined,
      validateStatus: (s) =>
        (s >= 200 && s < 300) ||
        s === 400 ||
        s === 404 ||
        s === 429 ||
        s === 501 ||
        s === 502 ||
        s === 503,
    });

    if (status === 404 || status === 502 || status === 503) {
      // 502 legado = soft-fail ainda não deployado → desliga HTTP na sessão
      throw softFail("Presença indisponível neste servidor", status, { global: true });
    }
    if (status === 501 || status === 400 || status === 429) {
      throw softFail("Presença indisponível para esta conversa", status, { conversaId: id });
    }

    return data;
  } catch (err) {
    if (err?.silent || err?.code === "PRESENCE_UNSUPPORTED") throw err;
    const status = err?.response?.status ?? err?.status;
    if (status === 404 || status === 502 || status === 503) {
      throw softFail("Presença indisponível neste servidor", status, { global: true });
    }
    if (status === 501 || status === 400 || status === 429) {
      throw softFail("Presença indisponível", status, { conversaId: id });
    }
    throw softFail(err?.message || "Presença indisponível", status, { global: true });
  }
}
