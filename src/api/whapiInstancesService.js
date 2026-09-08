import api from "./http";

/**
 * Serviço de fiação para as rotas multi-instância / multi-provider de WhatsApp.
 *
 * Base: /integrations/whatsapp (alias legado /integrations/zapi; ambos também sob /api).
 * Aqui usamos SEMPRE /api/integrations/whatsapp, o mesmo prefixo de whatsappIntegration.js.
 *
 * IMPORTANTE:
 * - Todas as rotas exigem Authorization: Bearer JWT (injetado por http.js) + perfil supervisor/admin.
 * - company_id vem SEMPRE do token no backend — NUNCA enviar no body/query.
 * - O provider é resolvido por instância no backend; o front só passa o :id correto
 *   (whatsapp_instance_id) e, no cadastro, `provider: 'whapi'`.
 */

const WHATSAPP_BASE = "/api/integrations/whatsapp";

export function isWhapiInstance(inst) {
  return String(inst?.provider || "").trim().toLowerCase() === "whapi";
}

function readError(data, fallback) {
  if (data == null) return fallback;
  if (typeof data === "string" && data.trim()) return data;
  return data.error || data.erro || data.message || fallback;
}

function normalizeHttpError(err, fallback) {
  const status = err?.response?.status || 0;
  const data = err?.response?.data || {};
  return {
    status,
    error: readError(data, err?.message || fallback),
    retryAfterSeconds: Number(data.retryAfterSeconds) || null,
    raw: data,
  };
}

/**
 * GET /integrations/whatsapp/instances
 * Lista instâncias da empresa (sem tokens). Supervisor/admin.
 * Whapi: o backend consulta GET /health (wakeup) e devolve `connected`.
 */
export async function listarInstanciasWhatsapp({ refresh = false } = {}) {
  const { data } = await api.get(`${WHATSAPP_BASE}/instances`, {
    params: refresh ? { refresh: 1 } : undefined,
  });
  const list = Array.isArray(data?.instances) ? data.instances.filter(Boolean) : [];
  return {
    instances: list,
    partnerEnabled: data?.whapi?.partnerEnabled === true,
  };
}

export async function listarInstanciasWhapi(opts = {}) {
  const { instances, partnerEnabled } = await listarInstanciasWhatsapp(opts);
  return {
    instances: instances.filter(isWhapiInstance),
    partnerEnabled,
  };
}

/**
 * POST /integrations/whatsapp/instances/provision-whapi
 * Cria o canal na Partner API e grava no ZapERP. Sem Channel ID/token no body.
 */
export async function provisionarInstanciaWhapi({ nome } = {}) {
  try {
    const body = {};
    const rotulo = String(nome ?? "").trim();
    if (rotulo) body.nome = rotulo;
    const { data, status } = await api.post(`${WHATSAPP_BASE}/instances/provision-whapi`, body);
    return {
      status,
      ok: true,
      created: data?.created === true,
      instance: data?.instance || null,
      partnerEnabled: data?.whapi?.partnerEnabled === true,
      error: null,
      raw: data || {},
    };
  } catch (err) {
    const parsed = normalizeHttpError(err, "Não foi possível criar o canal Whapi.");
    return {
      status: parsed.status,
      ok: false,
      created: false,
      instance: err?.response?.data?.instance || null,
      partnerEnabled: err?.response?.data?.whapi?.partnerEnabled === true,
      error: parsed.error,
      code: err?.response?.data?.code || null,
      raw: parsed.raw,
    };
  }
}

/**
 * POST /integrations/whatsapp/instances
 * Cadastra uma instância Whapi.
 *
 * NÃO enviar is_default:true se a empresa já tem default UltraMSG.
 */
export async function registrarInstanciaWhapi({
  instanceId,
  channelId,
  instanceToken,
  nome,
  provider = "whapi",
} = {}) {
  const idCanal = String(instanceId ?? channelId ?? "").trim();
  const token = String(instanceToken ?? "").trim();
  const rotulo = String(nome ?? "").trim();

  const body = {
    provider,
    instance_id: idCanal,
    channel_id: idCanal,
    instance_token: token,
    nome: rotulo,
  };

  const { data } = await api.post(`${WHATSAPP_BASE}/instances`, body);
  return data;
}

function normalizeQrResponse(status, data) {
  const payload = data || {};
  const connected = payload.connected === true || payload.alreadyConnected === true;

  let dataUri = null;
  if (!connected) {
    const raw = String(payload.imageBase64 ?? payload.qrBase64 ?? "").trim();
    if (payload.dataUri && String(payload.dataUri).trim()) {
      dataUri = String(payload.dataUri).trim();
    } else if (raw) {
      dataUri = raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
    }
  }

  const error =
    status >= 400
      ? readError(payload, `Erro ${status} ao obter QR Code.`)
      : null;

  return {
    status,
    connected,
    dataUri,
    provider: payload.provider ?? null,
    error,
    retryAfterSeconds: Number(payload.retryAfterSeconds) || null,
    raw: payload,
  };
}

/**
 * GET /integrations/whatsapp/instances/:id/qrcode
 * Whapi: PNG (login/image) ou JSON base64 (login). Formato igual ao UltraMSG.
 */
export async function obterQrCodeInstancia(instanceId) {
  try {
    const res = await api.get(`${WHATSAPP_BASE}/instances/${instanceId}/qrcode`);
    return normalizeQrResponse(res.status, res.data);
  } catch (err) {
    const status = err?.response?.status || 0;
    const data = err?.response?.data || {};
    if (status === 429 || status === 409 || status === 502) {
      return normalizeQrResponse(status, data);
    }
    throw err;
  }
}

/**
 * GET /integrations/whatsapp/instances/:id/status
 * Whapi: GET /health → { connected, status, phone, provider }.
 */
export async function obterStatusInstancia(instanceId) {
  try {
    const { data, status } = await api.get(`${WHATSAPP_BASE}/instances/${instanceId}/status`);
    const channelStatus = data?.status ?? null;
    const live = String(channelStatus || "").trim().toUpperCase();
    const connected =
      data?.connected === true
      || live === "AUTH"
      || live === "CONNECTED"
      || live === "READY";
    return {
      status,
      connected,
      phone: data?.phone ?? null,
      provider: data?.provider ?? null,
      channelStatus,
      error: null,
      retryAfterSeconds: null,
      raw: data || {},
    };
  } catch (err) {
    const parsed = normalizeHttpError(err, "Erro ao consultar status da instância.");
    return {
      status: parsed.status,
      connected: false,
      phone: null,
      provider: err?.response?.data?.provider ?? null,
      channelStatus: null,
      error: parsed.error,
      retryAfterSeconds: parsed.retryAfterSeconds,
      raw: parsed.raw,
    };
  }
}

/**
 * POST /integrations/whatsapp/instances/:id/phone-code
 * Pareamento por código (login sem QR) — só Whapi.
 */
export async function parearInstanciaPorCodigo(instanceId, phone) {
  try {
    const { data, status } = await api.post(
      `${WHATSAPP_BASE}/instances/${instanceId}/phone-code`,
      { phone: String(phone ?? "").trim() }
    );
    return {
      status,
      code: data?.code ?? null,
      provider: data?.provider ?? null,
      error: null,
      raw: data || {},
    };
  } catch (err) {
    const parsed = normalizeHttpError(err, "Erro ao gerar o código.");
    let error = parsed.error;
    if (parsed.status === 409) error = parsed.error || "Este canal já está autenticado.";
    if (parsed.status === 501) {
      error = parsed.error || "Pareamento por código por instância só está disponível para Whapi.";
    }
    return {
      status: parsed.status,
      code: null,
      provider: err?.response?.data?.provider ?? null,
      error,
      raw: parsed.raw,
    };
  }
}

/**
 * POST /integrations/whatsapp/instances/:id/configure-webhooks
 * Aponta o canal Whapi para POST {APP_URL}/webhooks/whapi (sem token na query).
 */
export async function configurarWebhooksInstancia(instanceId) {
  try {
    const { data, status } = await api.post(
      `${WHATSAPP_BASE}/instances/${instanceId}/configure-webhooks`
    );
    return {
      status,
      ok: data?.ok === true,
      webhookUrl: data?.webhook_url ?? null,
      provider: data?.provider ?? null,
      error: data?.ok === true ? null : readError(data, "Não foi possível configurar o webhook."),
      raw: data || {},
    };
  } catch (err) {
    const parsed = normalizeHttpError(err, "Erro ao configurar o webhook.");
    return {
      status: parsed.status,
      ok: false,
      webhookUrl: err?.response?.data?.webhook_url ?? null,
      provider: err?.response?.data?.provider ?? null,
      error: parsed.error,
      raw: parsed.raw,
    };
  }
}

/**
 * POST /integrations/whatsapp/instances/:id/logout
 * Encerra a sessão WhatsApp do canal (não apaga o cadastro).
 */
export async function desconectarInstanciaWhapi(instanceId) {
  try {
    const { data, status } = await api.post(`${WHATSAPP_BASE}/instances/${instanceId}/logout`);
    return {
      status,
      ok: data?.ok === true,
      alreadyLoggedOut: data?.alreadyLoggedOut === true,
      error: null,
      raw: data || {},
    };
  } catch (err) {
    const parsed = normalizeHttpError(err, "Erro ao desconectar o canal.");
    return {
      status: parsed.status,
      ok: false,
      alreadyLoggedOut: false,
      error: parsed.error,
      raw: parsed.raw,
    };
  }
}

/**
 * POST /integrations/whatsapp/instances/:id/check-phones
 * Valida números antes do disparo — NÃO bloqueia o envio.
 */
export async function validarNumerosInstancia(instanceId, phones, forceCheck = false) {
  const lista = (Array.isArray(phones) ? phones : [])
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .slice(0, 500);

  const res = await api.request({
    method: "POST",
    url: `${WHATSAPP_BASE}/instances/${instanceId}/check-phones`,
    data: forceCheck ? { phones: lista, forceCheck: true } : { phones: lista },
    validateStatus: () => true,
  });
  const status = res.status;
  const data = res.data || {};

  const supported = status !== 501;
  let error = null;
  if (status === 501)
    error =
      data.error || "Validação de números não é suportada por este provider.";
  else if (status >= 400)
    error = data.error || data.erro || `Erro ${status} ao validar números.`;

  return {
    status,
    supported,
    provider: data.provider ?? null,
    total: Number(data.total ?? lista.length) || 0,
    validCount: Number(data.validCount ?? 0) || 0,
    invalidCount: Number(data.invalidCount ?? 0) || 0,
    results: Array.isArray(data.results) ? data.results : [],
    error,
    raw: data,
  };
}
