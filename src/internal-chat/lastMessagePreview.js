/**
 * Texto curto para lista de conversas / notificação desktop.
 * Aceita objeto normalizado (messageUtils) ou payload cru da API.
 * @param {unknown} raw
 */
export function previewTextFromMessageLike(raw) {
  if (!raw || typeof raw !== "object") return "";
  const o = /** @type {Record<string, unknown>} */ (raw);
  const type = String(o.messageType ?? o.message_type ?? "text").toLowerCase() || "text";
  const content = String(o.content ?? "").trim();

  if (type === "text" || type === "") return content.slice(0, 120);

  let payload = o.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }
  const p = payload && typeof payload === "object" ? /** @type {Record<string, unknown>} */ (payload) : {};

  switch (type) {
    case "image":
      return content || "Foto";
    case "sticker":
      return "Figurinha";
    case "audio":
      return content || "Áudio";
    case "video":
      return content || "Vídeo";
    case "document": {
      const fn = o.fileName ?? o.file_name ?? p.file_name;
      return fn ? String(fn).slice(0, 80) : content || "Documento";
    }
    case "location": {
      const addr = p.address ?? o.address;
      if (addr) return String(addr).slice(0, 120);
      return content || "Localização";
    }
    case "contact": {
      const rawContacts = Array.isArray(p.contacts) ? p.contacts : [];
      const n = rawContacts.length;
      if (n > 1) {
        const first = rawContacts[0] && typeof rawContacts[0] === "object" ? String(/** @type {any} */ (rawContacts[0]).name ?? "").trim() : "";
        if (first) return `${first} (+${n - 1})`.slice(0, 120);
        return `Contatos compartilhados (${n})`.slice(0, 120);
      }
      if (n === 1 && rawContacts[0] && typeof rawContacts[0] === "object") {
        const nm = String(/** @type {any} */ (rawContacts[0]).name ?? "").trim();
        if (nm) return nm.slice(0, 80);
      }
      const phones = Array.isArray(p.phones) ? p.phones : [];
      if (phones.length > 1) {
        const base = String(p.name ?? o.name ?? "").trim();
        return base ? `${base} (${phones.length} números)`.slice(0, 120) : `${phones.length} números`.slice(0, 120);
      }
      const name = p.name ?? p.contactName ?? o.name ?? o.contact_name;
      return name ? String(name).slice(0, 80) : content || "Contato";
    }
    default:
      return content.slice(0, 120) || "Mensagem";
  }
}
