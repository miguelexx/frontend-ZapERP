/**
 * Identidade de nome/foto: fixo não casa com celular do 9 inserido.
 * Run: node scripts/test-chat-contact-identity.mjs
 */
import { contactIdentitiesConflict, isSameWhatsappIdentity, contactIdentitySignature } from "../src/chats/chatContactIdentity.js"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

assert(isSameWhatsappIdentity("5534984079198", "553484079198") === true, "celular 12/13 é a mesma pessoa")
assert(isSameWhatsappIdentity("553434123456", "5534934123456") === false, "fixo não é o celular do 9")

assert(
  contactIdentitiesConflict(
    { id: 1, cliente_id: 10, telefone: "553434123456", contato_nome: "Loja", foto_perfil: "https://cdn/loja.jpg" },
    { id: 1, cliente_id: 11, telefone: "5534934123456", contato_nome: "João", foto_perfil: "https://cdn/joao.jpg" }
  ) === true,
  "cliente e telefone diferentes conflitam"
)

assert(
  contactIdentitiesConflict(
    { id: 1, cliente_id: 10, telefone: "553484079198", contato_nome: "Ana" },
    { id: 1, telefone: "5534984079198" }
  ) === false,
  "mesmo celular sem cliente_id no payload não conflita"
)

assert(
  contactIdentitiesConflict(
    { id: 1, telefone: "lid:999", contato_nome: "Ana" },
    { id: 1, telefone: "5534984079198", contato_nome: "Ana" }
  ) === false,
  "LID pode ganhar telefone real"
)

const sigA = contactIdentitySignature({ id: 5, cliente_id: 1, telefone: "553434123456" })
const sigB = contactIdentitySignature({ id: 5, cliente_id: 2, telefone: "5534934123456" })
assert(sigA !== sigB, "assinatura do avatar muda quando a pessoa muda no mesmo id")

console.log("ok: chatContactIdentity")
