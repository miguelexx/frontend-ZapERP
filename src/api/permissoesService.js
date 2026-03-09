import api from "./http";

/**
 * GET /config/permissoes/catalogo
 * Retorna o catálogo de permissões disponíveis, tipicamente agrupadas por categoria.
 * Formato esperado: [{ codigo, nome, categoria }, ...] ou { categorias: [{ nome, permissoes: [...] }] }
 */
export async function getCatalogoPermissoes() {
  const { data } = await api.get("/config/permissoes/catalogo");
  return data || [];
}

/**
 * GET /usuarios/:id/permissoes
 * Retorna as permissões efetivas e overrides do usuário.
 * Formato esperado: { permissoes: [{ codigo, valor: "grant"|"deny"|"default" }] } ou array
 */
export async function getPermissoesUsuario(id) {
  const { data } = await api.get(`/usuarios/${id}/permissoes`);
  return data || {};
}

/**
 * PUT /usuarios/:id/permissoes
 * Salva as permissões do usuário (overrides).
 * Body: { permissoes: [{ codigo, valor: "grant"|"deny"|"default" }] }
 */
export async function putPermissoesUsuario(id, permissoes) {
  const { data } = await api.put(`/usuarios/${id}/permissoes`, { permissoes });
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
