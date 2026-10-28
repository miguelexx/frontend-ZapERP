/**
 * Modo simples de atendimento → pele "WhatsApp" da UI.
 *
 * O flag (`user.atendimento_modo_simples`) vira um atributo no <html> para o CSS
 * alcançar lista, conversa e shell sem props atravessarem a árvore — mesmo padrão
 * já usado por `data-theme`. As regras vivem em `chats/chatList.whatsapp.css`.
 */
export const MODO_SIMPLES_ATTR = "data-zap-simple"

export function applyModoSimplesAttr(on) {
  if (typeof document === "undefined") return
  const el = document.documentElement
  if (on) el.setAttribute(MODO_SIMPLES_ATTR, "1")
  else el.removeAttribute(MODO_SIMPLES_ATTR)
}

/**
 * Lê o flag da sessão guardada — aplicado já no boot para a lista não piscar
 * no visual antigo antes do primeiro render do MainLayout.
 */
export function readStoredModoSimples() {
  try {
    const raw = localStorage.getItem("zap_erp_auth")
    if (!raw) return false
    return JSON.parse(raw)?.user?.atendimento_modo_simples === true
  } catch {
    return false
  }
}
