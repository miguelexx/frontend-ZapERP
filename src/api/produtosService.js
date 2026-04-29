import api from "./http";

function toBoolParam(v) {
  if (v === true) return "true";
  if (v === false) return "false";
  return undefined;
}

export async function consultarProdutos({
  q = "",
  somenteComEstoque,
  limit = 50,
  offset = 0,
} = {}) {
  const params = {
    q: String(q || "").trim() || undefined,
    somenteComEstoque: toBoolParam(somenteComEstoque),
    limit: Math.min(Math.max(Number(limit) || 50, 1), 100),
    offset: Math.max(Number(offset) || 0, 0),
  };
  const { data } = await api.get("/api/produtos/consulta", { params });
  return data;
}

export async function obterStatusSyncProdutos() {
  const { data } = await api.get("/api/produtos/sync/status", { skipGlobal403Toast: true });
  return data;
}

export async function dispararSyncManualProdutos() {
  const { data } = await api.post("/api/produtos/sync/wm", null, { skipGlobal403Toast: true });
  return data;
}
