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

/**
 * POST /integrations/whatsapp/instances
 * Cadastra uma instância Whapi.
 *
 * @param {object} args
 * @param {string} args.instanceId  channel_id do canal (ex.: "NEBULA-AER3B"). Aceita `channelId` como alias.
 * @param {string} args.channelId   alias de instanceId.
 * @param {string} args.instanceToken  Bearer do canal.
 * @param {string} args.nome         rótulo exibível.
 * @param {'whapi'} [args.provider]  default 'whapi'.
 * @returns {Promise<any>} instância criada (inclui id = whatsapp_instance_id).
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
    // `channel_id` é aceito como alias de `instance_id` pelo backend; enviamos os dois
    // para robustez, sem depender de qual o backend lê primeiro.
    channel_id: idCanal,
    instance_token: token,
    nome: rotulo,
  };

  const { data } = await api.post(`${WHATSAPP_BASE}/instances`, body);
  return data;
}

/**
 * GET /integrations/whatsapp/instances/:id/qrcode
 * Funciona para Whapi (e UltraMSG por instância).
 *
 * Respostas possíveis (normalizadas):
 * - 200 { imageBase64, qrBase64, dataUri, provider:'whapi' }
 *        → imageBase64/qrBase64 são base64 CRU. Preferimos `dataUri`; senão prefixamos
 *          `data:image/png;base64,` (mesmo formato do UltraMSG).
 * - 200 { alreadyConnected:true, connected:true } → canal já conectado (não mostrar QR).
 * - 502 { error } → erro do provider.
 *
 * @returns {Promise<{ status:number, connected:boolean, dataUri:(string|null), provider:(string|null), error:(string|null), raw:any }>}
 */
export async function obterQrCodeInstancia(instanceId) {
  const res = await api.request({
    method: "GET",
    url: `${WHATSAPP_BASE}/instances/${instanceId}/qrcode`,
    validateStatus: () => true,
  });
  const status = res.status;
  const data = res.data || {};

  const connected = data.connected === true || data.alreadyConnected === true;

  let dataUri = null;
  if (!connected) {
    const raw = String(data.imageBase64 ?? data.qrBase64 ?? "").trim();
    if (data.dataUri && String(data.dataUri).trim()) {
      dataUri = String(data.dataUri).trim();
    } else if (raw) {
      dataUri = raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
    }
  }

  const error =
    status >= 400
      ? data.error || data.erro || `Erro ${status} ao obter QR Code.`
      : null;

  return {
    status,
    connected,
    dataUri,
    provider: data.provider ?? null,
    error,
    raw: data,
  };
}

/**
 * POST /integrations/whatsapp/instances/:id/phone-code
 * Pareamento por código (login sem QR) — NOVO, por instância; hoje só Whapi.
 * Body: { phone } (telefone com DDI/DDD).
 *
 * Retornos:
 * - 200 { code, provider:'whapi' }  (ex.: "123-456")
 * - 409  canal já autenticou
 * - 501  instância é UltraMSG (fluxo UltraMSG continua em /integrations/whatsapp/connect/phone-code)
 *
 * @returns {Promise<{ status:number, code:(string|null), provider:(string|null), error:(string|null), raw:any }>}
 */
export async function parearInstanciaPorCodigo(instanceId, phone) {
  const res = await api.request({
    method: "POST",
    url: `${WHATSAPP_BASE}/instances/${instanceId}/phone-code`,
    data: { phone: String(phone ?? "").trim() },
    validateStatus: () => true,
  });
  const status = res.status;
  const data = res.data || {};

  let error = null;
  if (status === 409) error = data.error || "Este canal já está autenticado.";
  else if (status === 501)
    error =
      data.error ||
      "Pareamento por código por instância só está disponível para Whapi.";
  else if (status >= 400)
    error = data.error || data.erro || `Erro ${status} ao gerar o código.`;

  return {
    status,
    code: data.code ?? null,
    provider: data.provider ?? null,
    error,
    raw: data,
  };
}

/**
 * POST /integrations/whatsapp/instances/:id/check-phones
 * Valida números antes do disparo — NOVO. NÃO bloqueia o envio (validação prévia).
 * Body: { phones: ['5534...', ...], forceCheck?: boolean }  (máx. 500).
 *
 * Retornos:
 * - 200 { provider, total, validCount, invalidCount, results: [{ input, exists, waId, status }] }
 * - 501  provider não suporta (hoje só Whapi)
 *
 * @param {number|string} instanceId
 * @param {string[]} phones
 * @param {boolean} [forceCheck]
 * @returns {Promise<{ status:number, supported:boolean, provider:(string|null), total:number, validCount:number, invalidCount:number, results:Array, error:(string|null), raw:any }>}
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
