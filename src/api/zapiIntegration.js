import api from "./http";

export async function getZapiStatus() {
  const { data } = await api.get("/api/integrations/zapi/status");
  return data || null;
}

export async function getZapiQrCode() {
  const { data } = await api.get("/api/integrations/zapi/qrcode");
  return data || {};
}

export async function restartZapi() {
  const { data } = await api.post("/api/integrations/zapi/restart");
  return data || {};
}

export async function getZapiMe() {
  const { data } = await api.get("/api/integrations/zapi/me");
  return data || null;
}

