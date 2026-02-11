function role(user) {
  return String(user?.role || user?.perfil || "").toLowerCase()
}

/** Admin, supervisor e atendente podem assumir conversas da fila */
export function canAssumir(user) {
  return ["admin", "supervisor", "atendente"].includes(role(user))
}

/** Admin, supervisor e atendente podem transferir (atendente só a conversa que está atendendo) */
export function canTransferir(user) {
  return ["admin", "supervisor", "atendente"].includes(role(user))
}

/** Admin, supervisor e atendente podem encerrar (quando for sua conversa) */
export function canEncerrar(user) {
  return ["admin", "supervisor", "atendente"].includes(role(user))
}

/** Admin, supervisor e atendente podem reabrir */
export function canReabrir(user) {
  return ["admin", "supervisor", "atendente"].includes(role(user))
}

/** Admin, supervisor e atendente podem puxar conversa da fila */
export function canPuxarFila(user) {
  return ["admin", "supervisor", "atendente"].includes(role(user))
}

/** Admin, supervisor e atendente podem gerenciar tags da conversa */
export function canTag(user) {
  return ["admin", "supervisor", "atendente"].includes(role(user))
}

/** Apenas admin: definir e editar setores (departamentos) em Configurações */
export function canGerenciarSetores(user) {
  return role(user) === "admin"
}

/** Apenas admin: acessar painel de configurações (setores, usuários, etc.) */
export function canAcessarConfiguracoes(user) {
  return role(user) === "admin"
}
