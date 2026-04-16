const UNAVAILABLE_REASON = "Disponível em breve"

const capabilities = Object.freeze({
  mute: false,
  pin: false,
  favorite: false,
  clear: false,
  delete: false,
})

function unavailable() {
  const err = new Error(UNAVAILABLE_REASON)
  err.code = "NOT_AVAILABLE"
  throw err
}

export function getConversationActionCapabilities() {
  return capabilities
}

export function getUnavailableReason() {
  return UNAVAILABLE_REASON
}

export async function toggleMuteConversation() {
  return unavailable()
}

export async function togglePinConversation() {
  return unavailable()
}

export async function toggleFavoriteConversation() {
  return unavailable()
}

export async function clearConversation() {
  return unavailable()
}

export async function deleteConversation() {
  return unavailable()
}

