import api from "../api/http";

/**
 * GET /chats/:id/presenca — assina + lê presença (Whapi). UltraMSG → 501.
 * Cacheia 404 global (rota ainda não deployada) e 501/400 por conversa
 * para não martelar o servidor nem spammar o console.
 */

const presenceUnsupportedUntil = new Map(); // conversaId | "*" -> expiryMs
const UNSUPPORTED_TTL_MS = 10 * 60 * 1000;
const ROUTE_MISSING_KEY = "*";

function markUnsupported(key) {
  presenceUnsupportedUntil.set(String(key), Date.now() + UNSUPPORTED_TTL_MS);
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

export async function fetchConversaPresenca(conversaId, { subscribe = true } = {}) {
  const id = Number(conversaId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("conversa_id inválido");
  }
  // 404 de rota ausente: um GET basta para toda a sessão (TTL).
  if (isMarkedUnsupported(ROUTE_MISSING_KEY) || isMarkedUnsupported(id)) {
    const err = new Error("Presença indisponível neste servidor");
    err.code = "PRESENCE_UNSUPPORTED";
    err.silent = true;
    throw err;
  }

  try {
    const { data, status } = await api.get(`/chats/${id}/presenca`, {
      params: subscribe === false ? { subscribe: "false" } : undefined,
      // Aceita 404/501 para o Axios não rejeitar com stack ruidosa.
      validateStatus: (s) => (s >= 200 && s < 300) || s === 404 || s === 501,
    });
    if (status === 404 || status === 501) {
      if (status === 404) markUnsupported(ROUTE_MISSING_KEY);
      else markUnsupported(id);
      const err = new Error(
        status === 501
          ? "Presença disponível apenas em canais Whapi"
          : "Rota de presença ainda não está no servidor"
      );
      err.code = "PRESENCE_UNSUPPORTED";
      err.status = status;
      err.silent = true;
      throw err;
    }
    return data;
  } catch (err) {
    const status = err?.response?.status ?? err?.status;
    if (status === 404) markUnsupported(ROUTE_MISSING_KEY);
    if (status === 501 || err?.code === "PRESENCE_UNSUPPORTED") markUnsupported(id);
    if (status === 404 || status === 501 || err?.code === "PRESENCE_UNSUPPORTED") {
      if (!err.silent) {
        err.silent = true;
        err.code = err.code || "PRESENCE_UNSUPPORTED";
      }
    }
    throw err;
  }
}
