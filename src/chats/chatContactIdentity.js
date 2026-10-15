/**
 * Identidade do contato de uma conversa (nome/foto).
 * Celular BR com/sem o 9º dígito é a mesma pessoa.
 * Fixo NÃO é a mesma pessoa que o celular obtido só inserindo o 9 após o DDD.
 * Espelha whatsappIdentityKey / isSameWhatsappIdentity do backend.
 */

function digitsOf(phone) {
  return String(phone || "").replace(/\D/g, "")
}

function normalizePhoneBR(phone) {
  const s = String(phone || "").trim()
  if (!s || s.toLowerCase().startsWith("lid:")) return ""
  if (s.endsWith("@g.us")) return s
  const digits = digitsOf(s)
  if (!digits) return ""
  if (digits.startsWith("120") && digits.length >= 15 && digits.length <= 22) return digits
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return ""
}

export function whatsappIdentityKey(phone) {
  const s = String(phone || "").trim()
  if (!s || s.toLowerCase().startsWith("lid:")) return ""
  if (s.endsWith("@g.us")) return s
  const digits = digitsOf(normalizePhoneBR(s)) || digitsOf(s)
  if (!digits) return ""
  if (digits.startsWith("55") && digits.length === 13 && digits.charAt(4) === "9") {
    const without9 = digits.slice(0, 4) + digits.slice(5)
    if ("6789".includes(without9.charAt(4))) return without9
    return digits
  }
  return digits
}

export function isSameWhatsappIdentity(a, b) {
  const ka = whatsappIdentityKey(a)
  const kb = whatsappIdentityKey(b)
  if (ka && kb && ka === kb) return true
  const da = digitsOf(a)
  const db = digitsOf(b)
  return Boolean(da && db && da === db)
}

export function rowClienteId(row) {
  const id = row?.cliente_id ?? row?.cliente?.id ?? row?.clientes?.id ?? null
  if (id == null || String(id).trim() === "") return ""
  return String(id)
}

export function rowPhone(row) {
  const tel =
    row?.telefone ??
    row?.telefone_exibivel ??
    row?.cliente_telefone ??
    row?.cliente?.telefone ??
    row?.clientes?.telefone ??
    ""
  const s = String(tel || "").trim()
  if (!s || s.toLowerCase().startsWith("lid:")) return ""
  return s
}

/**
 * Os dois lados identificam pessoas diferentes.
 * cliente_id ausente de um lado, ou telefone LID/vazio, não conta como conflito
 * (permite preencher a primeira identidade e resolver LID → número real).
 */
export function contactIdentitiesConflict(existing, incoming) {
  if (!existing || !incoming) return false
  const existingCliente = rowClienteId(existing)
  const incomingCliente = rowClienteId(incoming)
  if (existingCliente && incomingCliente && existingCliente !== incomingCliente) return true
  const existingPhone = rowPhone(existing)
  const incomingPhone = rowPhone(incoming)
  if (existingPhone && incomingPhone && !isSameWhatsappIdentity(existingPhone, incomingPhone)) return true
  return false
}

/** Assinatura da pessoa desenhada no card. Muda quando o cliente ou o telefone mudam. */
export function contactIdentitySignature(row) {
  const id = row?.id != null && String(row.id).trim() !== "" ? String(row.id) : ""
  const cliente = rowClienteId(row)
  const phone = whatsappIdentityKey(rowPhone(row))
  const sem = row?.sem_conversa ? "sem" : "conv"
  return `${sem}:${id}|c:${cliente}|p:${phone}`
}
