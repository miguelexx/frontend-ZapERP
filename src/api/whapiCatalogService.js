import api from "./http";

// Catálogo WhatsApp Business (Whapi) — leitura da vitrine da empresa.
// Endpoints backend: /api/integrations/whatsapp/instances/:id/catalog/*
const WHATSAPP_BASE = "/api/integrations/whatsapp";

function catalogBase(instanceId) {
  return `${WHATSAPP_BASE}/instances/${instanceId}/catalog`;
}

/** Extrai o código acionável de erro do backend (ex.: WHAPI_BUSINESS_ACCOUNT_REQUIRED). */
export function apiErrorCode(error) {
  return error?.response?.data?.code || null;
}

export async function listarProdutosCatalogo(instanceId, { count = 100, offset = 0, signal, silent = true } = {}) {
  const { data } = await api.get(`${catalogBase(instanceId)}/products`, {
    params: { count, offset },
    signal,
    silent,
  });
  return {
    products: Array.isArray(data?.products) ? data.products : [],
    total: Number.isFinite(Number(data?.total)) ? Number(data.total) : null,
    count: Number.isFinite(Number(data?.count)) ? Number(data.count) : null,
    offset: Number.isFinite(Number(data?.offset)) ? Number(data.offset) : offset,
  };
}

export async function listarColecoesCatalogo(instanceId, { count = 100, offset = 0, signal, silent = true } = {}) {
  const { data } = await api.get(`${catalogBase(instanceId)}/collections`, {
    params: { count, offset },
    signal,
    silent,
  });
  return Array.isArray(data?.collections) ? data.collections : [];
}

export async function listarProdutosDaColecao(instanceId, collectionId, { productsCount = 100, signal, silent = true } = {}) {
  const { data } = await api.get(
    `${catalogBase(instanceId)}/collections/${encodeURIComponent(collectionId)}/products`,
    { params: { products_count: productsCount }, signal, silent },
  );
  return Array.isArray(data?.products) ? data.products : [];
}

export async function obterProdutoCatalogo(instanceId, productId, { signal, silent = true } = {}) {
  const { data } = await api.get(
    `${catalogBase(instanceId)}/products/${encodeURIComponent(productId)}`,
    { signal, silent },
  );
  return data?.product && typeof data.product === "object" ? data.product : null;
}

// ------------------------------- Gestão (CRUD) -------------------------------

export async function criarProdutoCatalogo(instanceId, payload) {
  const { data } = await api.post(`${catalogBase(instanceId)}/products`, payload);
  return data?.product || null;
}

export async function atualizarProdutoCatalogo(instanceId, productId, payload) {
  const { data } = await api.patch(`${catalogBase(instanceId)}/products/${encodeURIComponent(productId)}`, payload);
  return data?.product || null;
}

export async function excluirProdutoCatalogo(instanceId, productId) {
  const { data } = await api.delete(`${catalogBase(instanceId)}/products/${encodeURIComponent(productId)}`);
  return data;
}

export async function criarColecaoCatalogo(instanceId, payload) {
  const { data } = await api.post(`${catalogBase(instanceId)}/collections`, payload);
  return data?.collection || null;
}

export async function editarColecaoCatalogo(instanceId, collectionId, payload) {
  const { data } = await api.patch(`${catalogBase(instanceId)}/collections/${encodeURIComponent(collectionId)}`, payload);
  return data?.collection || null;
}

export async function excluirColecaoCatalogo(instanceId, collectionId) {
  const { data } = await api.delete(`${catalogBase(instanceId)}/collections/${encodeURIComponent(collectionId)}`);
  return data;
}
