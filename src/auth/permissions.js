import { usePermissoesStore } from "./permissoesStore";

function role(user) {
  return String(user?.role || user?.perfil || "").toLowerCase();
}

export function isSupervisorOrAdmin(user) {
  const userRole = role(user);
  return userRole === "admin" || userRole === "administrador" || userRole === "supervisor";
}

/** Mapa codigo -> função de check por role (fallback quando API não retornou) */
const CODIGO_TO_ROLE_CHECK = {
  dashboard_acessar: (u) => ["supervisor", "admin"].includes(role(u)),
  config_acessar: (u) => ["supervisor", "admin"].includes(role(u)),
  usuarios_acessar: (u) => role(u) === "admin",
  chatbot_acessar: (u) => ["supervisor", "admin"].includes(role(u)),
  departamentos_gerenciar: (u) => role(u) === "admin",
};

/**
 * Verifica permissão por código. Prioriza resultado da API (GET /usuarios/me/permissoes),
 * senão usa fallback por role para codigos conhecidos.
 * @param {string} codigo - Ex: "dashboard_acessar", "config_acessar"
 * @param {object} user - Usuário (useAuthStore.user)
 * @returns {boolean}
 */
export function can(codigo, user) {
  if (!codigo) return false;
  // Admin sempre tem tudo (espelha o backend: usuarioTemPermissao retorna true p/ admin).
  // Garante que um mapa de permissões inconsistente nunca bloqueie um admin.
  if (role(user) === "admin" || role(user) === "administrador") return true;
  const permissoes = usePermissoesStore.getState().permissoes;
  if (permissoes != null && Object.prototype.hasOwnProperty.call(permissoes, codigo)) {
    return !!permissoes[codigo];
  }
  const fn = CODIGO_TO_ROLE_CHECK[codigo];
  return fn ? fn(user) : false;
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

/** Admin, supervisor e atendente podem gerenciar respostas salvas pessoais */
export function canGerenciarRespostasSalvas(user) {
  const permissoes = usePermissoesStore.getState().permissoes;
  if (permissoes != null && Object.prototype.hasOwnProperty.call(permissoes, "atendimentos.respostas_salvas")) {
    return !!permissoes["atendimentos.respostas_salvas"];
  }
  return ["admin", "supervisor", "atendente"].includes(role(user));
}

/** Supervisor e admin podem acessar Configurações (usa can() para priorizar API) */
export function canAcessarConfiguracoes(user) {
  return can("config_acessar", user);
}

/** Apenas admin: acessar e gerenciar Usuários (usa can() para priorizar API) */
export function canAcessarUsuarios(user) {
  return can("usuarios_acessar", user);
}

/** Apenas admin: definir e editar setores (departamentos) em Configurações */
export function canGerenciarSetores(user) {
  return can("departamentos_gerenciar", user) || role(user) === "admin";
}

/** Admin, supervisor e atendente podem transferir setor da conversa */
export function canTransferirSetorConversa(user) {
  return ["admin", "supervisor", "atendente"].includes(role(user));
}

/** Supervisor e admin podem acessar Dashboard (usa can() para priorizar API) */
export function canAcessarDashboard(user) {
  return can("dashboard_acessar", user);
}

/** Supervisor e admin podem acessar Chatbot (IA/Bot) (usa can() para priorizar API) */
export function canAcessarChatbot(user) {
  return can("chatbot_acessar", user);
}

/** Admin, supervisor e atendente podem criar notas internas (invisíveis ao cliente) */
export function canNotaInterna(user) {
  const permissoes = usePermissoesStore.getState().permissoes;
  if (permissoes != null && Object.prototype.hasOwnProperty.call(permissoes, "atendimentos.nota_interna")) {
    return !!permissoes["atendimentos.nota_interna"];
  }
  return ["admin", "supervisor", "atendente"].includes(role(user));
}

/* ------------------------------------------------------------------ *
 * Orçamento WM (ERP Icthus) — doc 36, D2 e D7
 *
 * Dois gates independentes, e os DOIS têm de valer:
 *
 *   1. `user.orcamento_wm_habilitado` — flag por empresa que vem no payload do login e do
 *      `GET /usuarios/me`, calculada no backend como `WM_ORCAMENTOS_ENABLED` (env, global) E
 *      `wm_orcamento_integracoes.ativo` da empresa. Mesmo padrão de
 *      `user.modulo_campanhas_ativo` em `canAcessarDisparo`, logo abaixo.
 *   2. A permissão do catálogo, lida do mapa de `GET /usuarios/me/permissoes`.
 *
 * ⚠️ OS CÓDIGOS SÃO PONTILHADOS (`orcamentos.ver`, não `orcamentos_ver`), e isso não é
 * estilo: o mapa devolvido pela API é chaveado pelos `codigo` do catálogo do backend, que são
 * pontilhados. Um código com underscore não existe no mapa, cai no fallback por role e o gate
 * real desaparece em silêncio — é exatamente o bug que `dashboard_acessar` / `config_acessar` /
 * `usuarios_acessar` têm hoje (registrado em
 * `backend/docs/ai-handoff/13-PROBLEMAS-CONHECIDOS-E-DIVIDA-TECNICA.md`). Não repetir.
 *
 * Nenhum dos dois substitui o backend: as rotas são fail-closed (`requireOrcamentoWm` +
 * `requirePermissao`). Isto aqui só evita oferecer um botão que responderia 403.
 * ------------------------------------------------------------------ */

/** Lê a permissão pontilhada do mapa da API; sem mapa, cai no padrão do catálogo por role. */
function canPermissaoPontilhada(codigo, user, rolesPadrao) {
  if (role(user) === "admin" || role(user) === "administrador") return true;
  const permissoes = usePermissoesStore.getState().permissoes;
  if (permissoes != null && Object.prototype.hasOwnProperty.call(permissoes, codigo)) {
    return !!permissoes[codigo];
  }
  return rolesPadrao.includes(role(user));
}

/** Ver/montar orçamento: módulo ligado na empresa + `orcamentos.ver`. */
export function canAcessarOrcamento(user) {
  if (user?.orcamento_wm_habilitado !== true) return false;
  return canPermissaoPontilhada("orcamentos.ver", user, ["supervisor", "atendente"]);
}

/**
 * Gravar o orçamento no ERP: módulo ligado + `orcamentos.criar`.
 * Exige também `orcamentos.ver`: quem não pode ver não tem como montar o que criaria.
 */
export function canCriarOrcamento(user) {
  if (!canAcessarOrcamento(user)) return false;
  return canPermissaoPontilhada("orcamentos.criar", user, ["supervisor", "atendente"]);
}

/** Apenas admin pode acessar o módulo Disparo de Mensagens, e só se a empresa ativou Campanhas. */
export function canAcessarDisparo(user) {
  if (user?.modulo_campanhas_ativo !== true) return false;
  const permissoes = usePermissoesStore.getState().permissoes;
  if (permissoes != null && Object.prototype.hasOwnProperty.call(permissoes, "disparo.ver")) {
    return !!permissoes["disparo.ver"];
  }
  return role(user) === "admin";
}
