import api from "./http";

/**
 * GET /config/permissoes/catalogo
 * Retorna o catálogo de permissões disponíveis.
 * Backend retorna: { catalogo: [{ categoria, permissoes: [...] }], flat: [...] }
 */
export async function getCatalogoPermissoes() {
  const { data } = await api.get("/config/permissoes/catalogo");
  return data?.catalogo ?? data ?? [];
}

/**
 * GET /usuarios/:id/permissoes
 * Retorna as permissões efetivas e overrides do usuário.
 * Backend: { usuario: {...}, permissoes: [{ codigo, nome, descricao, categoria, concedido, isOverride }] }
 */
export async function getPermissoesUsuario(id) {
  const { data } = await api.get(`/usuarios/${id}/permissoes`);
  return data || {};
}

/**
 * PUT /usuarios/:id/permissoes
 * Salva as permissões do usuário (overrides).
 * Body backend: { permissoes: { codigo: true|false|null } } — objeto, não array
 * - true: concede (override)
 * - false: nega (override)
 * - null: remove override (usa padrão do perfil)
 */
export async function putPermissoesUsuario(id, permissoesObj) {
  const { data } = await api.put(`/usuarios/${id}/permissoes`, {
    permissoes: permissoesObj,
  });
  return data || {};
}

/**
 * GET /usuarios/me/permissoes
 * Retorna as permissões efetivas do usuário logado (para menus e proteção de rotas).
 */
export async function getMinhasPermissoes() {
  const { data } = await api.get("/usuarios/me/permissoes");
  return data || {};
}
