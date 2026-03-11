import api from "./http";

const CONNECT_BASE = "/api/integrations/zapi/connect";

/**
 * GET /integrations/zapi/connect/status
 * Sempre retorna 200. Payload: hasInstance, connected, smartphoneConnected, needsRestore, error, meSummary
 */
export async function getZapiConnectStatus() {
  const { data } = await api.get(`${CONNECT_BASE}/status`);
  return data || null;
}

/**
 * GET /integrations/zapi/operational-status
 * Retorna: connected, syncStatus, syncPending, lastSyncAt, modoSeguro, processamentoPausado
 */
export async function getZapiOperationalStatus() {
  try {
    const { data } = await api.get("/api/integrations/zapi/operational-status");
    return data || null;
  } catch {
    return null;
  }
}

/**
 * POST /integrations/zapi/connect/qrcode
 * Retornos possíveis:
 * - 200 { connected: true }
 * - 409 { needsRestore: true }
 * - 200 { connected: false, qrBase64, nextRefreshSeconds, attemptsLeft }
 * - 429 { error: "throttled"|"blocked", retryAfterSeconds, attemptsLeft }
 */
export async function getZapiConnectQrCode() {
  const res = await api.request({
    method: "POST",
    url: `${CONNECT_BASE}/qrcode`,
    validateStatus: (status) => status >= 200 && status < 500,
  });
  return { status: res.status, data: res.data || {} };
}

/**
 * POST /integrations/zapi/connect/restart
 * Retorna o mesmo contrato do /status
 */
export async function postZapiConnectRestart() {
  const { data } = await api.post(`${CONNECT_BASE}/restart`);
  return data || null;
}

/**
 * POST /integrations/zapi/connect/phone-code
 * Body: { phone }
 * 200: { code }
 */
export async function postZapiConnectPhoneCode(phone) {
  const { data } = await api.post(`${CONNECT_BASE}/phone-code`, { phone });
  return data || null;
}

/* ========== Funções legadas (fallback para outras telas) ========== */
export async function getZapiStatus() {
  try {
    return await getZapiConnectStatus();
  } catch {
    return null;
  }
}

export async function getZapiQrCode() {
  const { status, data } = await getZapiConnectQrCode();
  if (status === 200 && data.connected) return { alreadyConnected: true };
  if (status === 200 && data.qrBase64)
    return { imageBase64: data.qrBase64, nextRefreshSeconds: data.nextRefreshSeconds };
  return {};
}

export async function restartZapi() {
  return postZapiConnectRestart();
}

export async function getZapiMe() {
  const status = await getZapiConnectStatus();
  return status?.meSummary || null;
}
