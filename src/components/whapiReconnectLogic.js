/**
 * Regras puras da reconexão por QR Code (overlay de canal Whapi caído).
 *
 * Ficam separadas da UI porque são o que decide QUAL número reconectar e O QUE
 * a moldura do QR mostra — coberto por scripts/test-whapi-reconnect-qr.mjs sem
 * precisar montar React.
 */
// Lista única de estados de "aparelho desvinculado" — a mesma que decide se a
// tela pode acender (chats/hooks/whapiOverlayRule.js). Não duplicar aqui.
import { WHAPI_UNLINKED_STATUS } from "../chats/hooks/whapiOverlayRule.js";

/** Intervalo de renovação do QR. O QR do WhatsApp expira em ~20s. */
export const QR_POLL_MS = 20_000;
/** Status do canal enquanto a tela está aberta: precisa sumir assim que escanear. */
export const STATUS_POLL_MS = 6_000;

const QR_MIN_RETRY_S = 5;
const QR_MAX_RETRY_S = 600;

export function isWhapiProviderInstance(inst) {
  return String(inst?.provider || "").trim().toLowerCase() === "whapi";
}

/** Mesma leitura do painel de Configurações: connected OU status vivo de sessão. */
export function instanceLooksConnected(inst) {
  if (!inst) return false;
  if (inst.connected === true) return true;
  const s = String(inst.live_status || inst.status || "").trim().toUpperCase();
  return s === "AUTH" || s === "CONNECTED" || s === "READY";
}

export function activeWhapiInstances(instances) {
  return (Array.isArray(instances) ? instances : []).filter(
    (inst) => inst && isWhapiProviderInstance(inst) && inst.ativo !== false
  );
}

/** Canal com a sessão vazia de verdade (QR/desvinculado) — não só "não-AUTH". */
export function instanceLooksUnlinked(inst) {
  if (!inst || instanceLooksConnected(inst)) return false;
  const s = String(inst.live_status || inst.status || "").trim().toUpperCase();
  return WHAPI_UNLINKED_STATUS.has(s);
}

function preferirDefault(pool) {
  return pool.find((inst) => inst.is_default === true) || pool[0];
}

/**
 * O canal que a tela deve reconectar, em três degraus:
 *   1. DESVINCULADO (QR) — é o motivo da tela e o único que o QR resolve;
 *   2. qualquer um fora do AUTH — cobre o canal ainda reconectando;
 *   3. qualquer ativo — a tela nunca fica sem alvo quando a lista ainda não
 *      chegou hidratada.
 * Dentro de cada degrau, o default vem primeiro.
 */
export function pickReconnectInstance(instances) {
  const ativas = activeWhapiInstances(instances);
  if (!ativas.length) return null;
  const desvinculadas = ativas.filter(instanceLooksUnlinked);
  if (desvinculadas.length) return preferirDefault(desvinculadas);
  const caidas = ativas.filter((inst) => !instanceLooksConnected(inst));
  return preferirDefault(caidas.length ? caidas : ativas);
}

/** Espera do 429 do guard de QR: sempre um número de segundos sensato. */
export function clampRetrySeconds(sec, fallback = 60) {
  const n = Number(sec);
  const base = Number.isFinite(n) && n > 0 ? n : fallback;
  return Math.max(QR_MIN_RETRY_S, Math.min(QR_MAX_RETRY_S, Math.round(base)));
}

/** Só renderiza <img> com base64 de imagem de verdade (evita moldura quebrada). */
export function isValidQrDataUri(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v)) return false;
  return v.length > 64;
}

/**
 * Estados do /health da Whapi em que o canal está SUBINDO ou RECONECTANDO
 * (1 INIT, 2 LAUNCH). É o que acontece quando a rede oscila: o canal volta
 * sozinho por INIT → LAUNCH → AUTH em poucos segundos e NÃO precisa de QR.
 * Nessa janela a Whapi recusa o /users/login, então a tela não pode chamar
 * isso de erro — ela espera.
 */
const WHAPI_TRANSIENT_STATUS = new Set(["INIT", "INITIALIZING", "LAUNCH", "LAUNCHED", "LAUNCHING", "STARTING", "LOADING", "CONNECTING", "SYNCING"]);
const WHAPI_TRANSIENT_CODES = new Set([1, 2]);

export function isTransientChannelStatus(status, code) {
  // `Number(null)` é 0: código ausente precisa cair no texto, não virar "código 0".
  const n = code == null || code === "" ? null : Number(code);
  if (n != null && Number.isFinite(n)) return WHAPI_TRANSIENT_CODES.has(n);
  return WHAPI_TRANSIENT_STATUS.has(String(status || "").trim().toUpperCase());
}

/**
 * Um único lugar decide o que a moldura mostra — a UI não repete condicionais.
 * Ordem importa: conectado vence tudo; QR válido vence "carregando" (renovação
 * silenciosa não pode apagar o código que o usuário está escaneando); canal
 * reconectando vence "erro" (a recusa do QR nessa janela é esperada).
 */
export function qrFrameState({ connected, qrDataUri, qrError, loading, retryIn, transient } = {}) {
  if (connected === true) return "connected";
  if (isValidQrDataUri(qrDataUri)) return "qr";
  if (Number(retryIn) > 0) return "throttled";
  if (transient === true) return "transient";
  if (loading === true) return "loading";
  if (qrError) return "error";
  return "loading";
}

/** Telefone do pareamento por código: só dígitos, formato internacional. */
export function normalizePairPhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/** Código de pareamento legível: 8 caracteres viram "ABCD-EFGH". */
export function formatPairCode(code) {
  const limpo = String(code ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  if (!limpo) return "";
  if (limpo.length === 8) return `${limpo.slice(0, 4)}-${limpo.slice(4)}`;
  return limpo;
}

/** Rótulo do canal na tela (nunca vazio, nunca "undefined"). */
export function reconnectInstanceLabel(inst) {
  if (!inst) return "";
  const nome = String(inst.nome || "").trim();
  if (nome) return nome;
  const fone = String(inst.display_phone || inst.telefone_conectado || "").trim();
  if (fone) return fone;
  return inst.id != null ? `Canal #${inst.id}` : "";
}
