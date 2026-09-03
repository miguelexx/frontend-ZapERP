/** GET /chats com incluir_todos_clientes: 2+ caracteres (ou 2+ dígitos de telefone). */
export function isBackendChatSearchTerm(raw) {
  const t = String(raw || "").trim();
  if (!t) return false;
  if (t.length >= 2) return true;
  return String(t).replace(/\D/g, "").length >= 2;
}
