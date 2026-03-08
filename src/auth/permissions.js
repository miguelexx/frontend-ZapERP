function role(user) {
  return String(user?.role || user?.perfil || "").toLowerCase();
}

/** Admin, supervisor e atendente podem assumir conversas da fila */
export function canAssumir(user) {
  return ["admin", "supervisor", "atendente"].includes(role(user));
}

/** Admin, supervisor e atendente podem transferir (atendente só a conversa que está atendendo) */
export function canTransferir(user) {
  return ["admin", "supervisor", "atendente"].includes(role(user));
}

/** Admin, supervisor e atendente podem encerrar (quando for sua conversa) */
export function canEncerrar(user) {
  return ["admin", "supervisor", "atendente"].includes(role(user));
}

/** Admin, supervisor e atendente podem reabrir */
export function canReabrir(user) {
  return ["admin", "supervisor", "atendente"].includes(role(user));
}

/** Admin, supervisor e atendente podem puxar conversa da fila */
export function canPuxarFila(user) {
  return ["admin", "supervisor", "atendente"].includes(role(user));
}

/** Admin, supervisor e atendente podem gerenciar tags da conversa */
export function canTag(user) {
  return ["admin", "supervisor", "atendente"].includes(role(user));
}

/** Supervisor e admin podem acessar Configurações */
export function canAcessarConfiguracoes(user) {
  return ["supervisor", "admin"].includes(role(user));
}

/** Apenas admin: acessar e gerenciar Usuários */
export function canAcessarUsuarios(user) {
  return role(user) === "admin";
}

/** Apenas admin: definir e editar setores (departamentos) em Configurações */
export function canGerenciarSetores(user) {
  return role(user) === "admin";
}

/** Supervisor e admin podem acessar Dashboard */
export function canAcessarDashboard(user) {
  return ["supervisor", "admin"].includes(role(user));
}

/** Supervisor e admin podem acessar Chatbot (IA/Bot) */
export function canAcessarChatbot(user) {
  return ["supervisor", "admin"].includes(role(user));
}
