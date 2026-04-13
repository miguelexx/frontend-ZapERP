import api from "./http";
import { normalizeInternalMessage } from "../internal-chat/messageUtils.js";
import { previewTextFromMessageLike } from "../internal-chat/lastMessagePreview.js";

/**
 * Extrai array da resposta do backend (formatos comuns).
 * @param {unknown} payload
 * @param {string[]} keys
 */
function unwrapArray(payload, keys) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const k of keys) {
      const v = /** @type {Record<string, unknown>} */ (payload)[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

/** @param {unknown} raw */
export function normalizeEmployee(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const id = o.id ?? o.user_id ?? o.usuario_id;
  if (id == null || id === "") return null;
  return {
    id: String(id),
    name: String(o.name ?? o.nome ?? o.full_name ?? "Usuário"),
    email: o.email != null ? String(o.email) : "",
    avatarUrl: (o.avatar_url ?? o.foto ?? o.photo_url ?? o.avatar) ? String(o.avatar_url ?? o.foto ?? o.photo_url ?? o.avatar) : null,
    isOnline: Boolean(o.is_online ?? o.online),
    lastSeen: o.last_seen ?? o.lastSeen ?? null,
  };
}

/** @param {unknown} raw @param {string | number | null | undefined} currentUserId */
export function normalizeConversation(raw, currentUserId) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const id = o.id ?? o.conversation_id;
  if (id == null || id === "") return null;

  const me = currentUserId != null ? String(currentUserId) : null;
  let other = o.other_user ?? o.otherUser ?? o.peer ?? o.participant;
  const participants = Array.isArray(o.participants) ? o.participants : null;
  if (!other && participants?.length && me) {
    const row = participants.find((p) => p && typeof p === "object" && String(/** @type {any} */ (p).id ?? /** @type {any} */ (p).user_id) !== me);
    other = row || participants[0];
  }

  const ou = other && typeof other === "object" ? /** @type {Record<string, unknown>} */ (other) : null;
  const otherId = ou ? ou.id ?? ou.user_id ?? ou.usuario_id : o.other_user_id ?? o.peer_user_id;
  const otherName = ou
    ? String(ou.name ?? ou.nome ?? ou.full_name ?? "Colega")
    : String(o.other_name ?? o.title ?? "Conversa interna");
  const otherEmail = ou && ou.email != null ? String(ou.email) : o.other_email != null ? String(o.other_email) : "";

  const lm = o.last_message ?? o.lastMessage;
  let lastMessage = null;
  if (lm && typeof lm === "object") {
    lastMessage = previewTextFromMessageLike(lm).trim().slice(0, 200) || null;
  } else {
    lastMessage =
      String(o.last_message ?? o.lastMessage ?? o.preview ?? o.ultima_mensagem ?? o.snippet ?? "")
        .trim()
        .slice(0, 200) || null;
  }

  const lastActivity =
    o.last_activity_at ?? o.lastActivityAt ?? o.updated_at ?? o.updatedAt ?? o.last_message_at ?? o.lastMessageAt ?? null;
  const unread = Number(o.unread_count ?? o.unreadCount ?? o.nao_lidas ?? 0) || 0;

  const avatarUrl = ou
    ? (ou.avatar_url ?? ou.foto ?? ou.photo_url ?? ou.avatar) ? String(ou.avatar_url ?? ou.foto ?? ou.photo_url ?? ou.avatar) : null
    : o.avatar_url ? String(o.avatar_url) : null;

  return {
    id: String(id),
    otherUserId: otherId != null ? String(otherId) : "",
    otherName,
    otherEmail,
    avatarUrl,
    lastMessage,
    lastActivity,
    unreadCount: unread,
  };
}

export async function listInternalEmployees() {
  const { data } = await api.get("/api/internal-chat/employees");
  const arr = unwrapArray(data, ["employees", "usuarios", "users", "data", "items", "results"]);
  return arr.map(normalizeEmployee).filter(Boolean);
}

/** @param {string | number | null | undefined} currentUserId */
export async function listInternalConversations(currentUserId) {
  const { data } = await api.get("/api/internal-chat/conversations");
  const arr = unwrapArray(data, ["conversations", "chats", "data", "items", "results"]);
  return arr.map((row) => normalizeConversation(row, currentUserId)).filter(Boolean);
}

/**
 * @param {string | number} targetUserId
 * @param {string | number | null | undefined} currentUserId
 */
export async function createOrOpenInternalConversation(targetUserId, currentUserId) {
  const rawId = typeof targetUserId === "string" ? targetUserId.trim() : targetUserId;
  const numeric = typeof rawId === "string" && /^\d+$/.test(rawId) ? Number(rawId) : rawId;
  const { data } = await api.post("/api/internal-chat/conversations", {
    target_user_id: typeof numeric === "number" && !Number.isNaN(numeric) ? numeric : rawId,
  });
  const conv = normalizeConversation(data?.conversation ?? data?.data ?? data, currentUserId);
  return conv;
}

/**
 * @param {string | number} conversationId
 * @param {{ limit?: number, beforeId?: string | number }} opts
 */
export async function listInternalMessages(conversationId, opts = {}) {
  const { limit = 40, beforeId } = opts;
  const params = { limit };
  if (beforeId != null && beforeId !== "") params.before_id = beforeId;
  const { data } = await api.get(`/api/internal-chat/conversations/${conversationId}/messages`, { params });
  const arr = unwrapArray(data, ["messages", "data", "items", "results"]);
  const nextBefore =
    data?.next_before_id ?? data?.nextBeforeId ?? data?.next_before ?? data?.cursor ?? null;
  return { rawMessages: arr, nextBeforeId: nextBefore != null ? String(nextBefore) : null };
}

/**
 * Texto (emoji UTF-8 no content).
 * @param {string | number} conversationId
 * @param {string} content
 * @param {string | number | null | undefined} myUserId
 * @param {string | number | null | undefined} otherUserId
 */
export async function sendInternalTextMessage(conversationId, content, myUserId, otherUserId = null) {
  const trimmed = String(content || "").trim();
  const { data } = await api.post(`/api/internal-chat/conversations/${conversationId}/messages`, {
    message_type: "text",
    content: trimmed,
  });
  return normalizeInternalMessage(data?.message ?? data?.data ?? data, myUserId, otherUserId);
}

/**
 * @deprecated use sendInternalTextMessage
 */
export async function sendInternalMessage(conversationId, content, myUserId, otherUserId = null) {
  return sendInternalTextMessage(conversationId, content, myUserId, otherUserId);
}

/**
 * @param {string | number} conversationId
 * @param {{ file: File, fieldName?: string, caption?: string, messageType?: string }} opts
 * @param {string | number | null | undefined} myUserId
 * @param {string | number | null | undefined} otherUserId
 * @param {(progress01: number) => void} [onUploadProgress]
 */
export async function sendInternalMediaMultipart(conversationId, opts, myUserId, otherUserId = null, onUploadProgress) {
  const { file, fieldName = "file", caption, messageType } = opts;
  const fd = new FormData();
  fd.append(fieldName, file);
  if (caption != null && String(caption).trim()) fd.append("caption", String(caption).trim());
  if (messageType) fd.append("message_type", messageType);

  const { data } = await api.post(`/api/internal-chat/conversations/${conversationId}/messages/media`, fd, {
    transformRequest: [(body, headers) => {
      if (body instanceof FormData) delete headers["Content-Type"];
      return body;
    }],
    onUploadProgress:
      onUploadProgress &&
      ((pe) => {
        const total = pe.total ?? 0;
        if (total > 0) onUploadProgress(Math.min(1, pe.loaded / total));
      }),
  });
  return normalizeInternalMessage(data?.message ?? data?.data ?? data, myUserId, otherUserId);
}

/**
 * @param {string | number} conversationId
 * @param {{ latitude: number, longitude: number, address?: string, caption?: string }} body
 * @param {string | number | null | undefined} myUserId
 * @param {string | number | null | undefined} otherUserId
 */
export async function sendInternalLocationMessage(conversationId, body, myUserId, otherUserId = null) {
  const { data } = await api.post(`/api/internal-chat/conversations/${conversationId}/messages`, {
    message_type: "location",
    latitude: body.latitude,
    longitude: body.longitude,
    address: body.address?.trim() || undefined,
    caption: body.caption?.trim() || undefined,
  });
  return normalizeInternalMessage(data?.message ?? data?.data ?? data, myUserId, otherUserId);
}

/**
 * @param {string | number} conversationId
 * @param {{
 *   name: string;
 *   phone?: string;
 *   phones?: string[];
 *   organization?: string;
 *   caption?: string;
 * }} body
 * @param {string | number | null | undefined} myUserId
 * @param {string | number | null | undefined} otherUserId
 */
export async function sendInternalContactMessage(conversationId, body, myUserId, otherUserId = null) {
  const name = String(body.name || "").trim();
  const single = body.phone != null ? String(body.phone).trim() : "";
  const many = Array.isArray(body.phones) ? body.phones.map((p) => String(p).trim()).filter(Boolean) : [];
  const list = many.length > 0 ? many : single ? [single] : [];
  /** @type {Record<string, unknown>} */
  const payload = {
    message_type: "contact",
    name,
    organization: body.organization?.trim() || undefined,
    caption: body.caption?.trim() || undefined,
  };
  if (list.length > 1) {
    payload.phones = list;
  } else if (list.length === 1) {
    payload.phone = list[0];
  }
  const { data } = await api.post(`/api/internal-chat/conversations/${conversationId}/messages`, payload);
  return normalizeInternalMessage(data?.message ?? data?.data ?? data, myUserId, otherUserId);
}

function internalChatExtraHeaders() {
  try {
    const raw = localStorage.getItem("zap_erp_auth");
    if (!raw) return {};
    const u = JSON.parse(raw)?.user;
    const id = u?.company_id ?? u?.empresa_id;
    if (id == null || id === "") return {};
    return { "x-company-id": String(id) };
  } catch {
    return {};
  }
}

/** @param {unknown} raw */
export function normalizeInternalClientContact(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const id = o.id;
  if (id == null || String(id).trim() === "") return null;
  const name = String(o.name ?? "").trim();
  const pushname = o.pushname != null ? String(o.pushname).trim() : "";
  const displayName = name || pushname || "";
  const phonesRaw = Array.isArray(o.phones) ? o.phones.map((p) => String(p).trim()).filter(Boolean) : [];
  const phoneField = String(o.phone ?? "").trim();
  const phone = phoneField || phonesRaw[0] || "";
  const phonesList = phonesRaw.length > 1 ? phonesRaw : phonesRaw.length === 1 && !phoneField ? phonesRaw : [];
  if (!displayName && !phone) return null;
  return {
    id: String(id),
    name: displayName || phone || "Contato",
    pushname,
    phone,
    phonesList,
    avatar: o.avatar != null ? String(o.avatar) : null,
  };
}

/**
 * @param {{ q?: string; limit?: number; offset?: number }} opts
 * @returns {Promise<{ contacts: ReturnType<typeof normalizeInternalClientContact>[]; total: number }>}
 */
export async function listInternalClientContacts(opts = {}) {
  const q = opts.q != null ? String(opts.q) : "";
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const { data } = await api.get("/api/internal-chat/client-contacts", {
    params: { q, limit, offset },
    headers: { ...internalChatExtraHeaders() },
  });
  const arr = unwrapArray(data, ["contacts", "data", "items", "results"]);
  const total = Number(data?.total ?? data?.count ?? 0) || 0;
  const contacts = arr.map(normalizeInternalClientContact).filter(Boolean);
  return { contacts, total };
}

/** @param {string | number} conversationId */
export async function markInternalConversationRead(conversationId) {
  await api.post(`/api/internal-chat/conversations/${conversationId}/read`);
}
