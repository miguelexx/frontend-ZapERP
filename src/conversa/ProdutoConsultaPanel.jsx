import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SkeletonLine } from "../components/feedback/Skeleton";
import {
  consultarProdutos,
  dispararSyncManualProdutos,
  obterStatusSyncProdutos,
} from "../api/produtosService";

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 350;
const CACHE_TTL_MS = 15000;

function formatMoeda(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function estoqueBadge(estoque) {
  const n = Number(estoque) || 0;
  if (n <= 0) return { label: "Sem estoque", tone: "zero" };
  if (n <= 5) return { label: "Baixo", tone: "baixo" };
  if (n <= 20) return { label: "Médio", tone: "medio" };
  return { label: "Alto", tone: "alto" };
}

function formatDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

async function copyText(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (_) {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function buildTemplate(item) {
  return [
    `*${item?.descricaoItem || "Produto"}*`,
    `Código: ${item?.codigoItem || "-"}`,
    `Preço: ${formatMoeda(item?.precoUnitario)}`,
    `Estoque previsto: ${Number(item?.estoquePrevisto) || 0}`,
  ].join("\n");
}

export default function ProdutoConsultaPanel({
  open,
  onClose,
  canViewSyncStatus,
  canTriggerManualSync,
  onEnviarParaConversa,
  showToast,
}) {
  const [q, setQ] = useState("");
  const [somenteComEstoque, setSomenteComEstoque] = useState(false);
  const [offset, setOffset] = useState(0);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ limit: PAGE_SIZE, offset: 0, total: 0 });
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingFetch, setLoadingFetch] = useState(false);
  const [erroConsulta, setErroConsulta] = useState("");
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncErro, setSyncErro] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const cacheRef = useRef(new Map());

  const total = Number(pagination?.total) || 0;
  const currentCount = Array.isArray(items) ? items.length : 0;
  const hasPrev = offset > 0;
  const hasNext = offset + currentCount < total;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(String(q || "").trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedQ, somenteComEstoque]);

  const queryKey = useMemo(
    () => `${debouncedQ}|${somenteComEstoque ? "1" : "0"}|${PAGE_SIZE}|${offset}`,
    [debouncedQ, somenteComEstoque, offset]
  );

  const loadProdutos = useCallback(async () => {
    if (!open) return;
    const cached = cacheRef.current.get(queryKey);
    const now = Date.now();
    if (cached && now - cached.at < CACHE_TTL_MS) {
      setItems(cached.data.items || []);
      setPagination(cached.data.pagination || { limit: PAGE_SIZE, offset, total: 0 });
      setErroConsulta("");
      return;
    }

    const hasCurrentData = Array.isArray(items) && items.length > 0;
    setErroConsulta("");
    if (!hasCurrentData) setLoadingInitial(true);
    else setLoadingFetch(true);
    try {
      const data = await consultarProdutos({
        q: debouncedQ,
        somenteComEstoque,
        limit: PAGE_SIZE,
        offset,
      });
      const payload = {
        items: Array.isArray(data?.items) ? data.items : [],
        pagination: data?.pagination || { limit: PAGE_SIZE, offset, total: 0 },
      };
      cacheRef.current.set(queryKey, { at: now, data: payload });
      setItems(payload.items);
      setPagination(payload.pagination);
    } catch {
      setErroConsulta("Não foi possível consultar produtos agora. Tente novamente.");
    } finally {
      setLoadingInitial(false);
      setLoadingFetch(false);
    }
  }, [open, queryKey, items, debouncedQ, somenteComEstoque, offset]);

  const loadSyncStatus = useCallback(async () => {
    if (!open || !canViewSyncStatus) return;
    setSyncLoading(true);
    setSyncErro("");
    try {
      const data = await obterStatusSyncProdutos();
      setSyncStatus(data || null);
    } catch {
      setSyncErro("Não foi possível carregar o status da sincronização.");
    } finally {
      setSyncLoading(false);
    }
  }, [open, canViewSyncStatus]);

  useEffect(() => {
    if (!open) return;
    loadProdutos();
  }, [open, loadProdutos]);

  useEffect(() => {
    if (!open || !canViewSyncStatus) return;
    loadSyncStatus();
  }, [open, canViewSyncStatus, loadSyncStatus]);

  const handleManualSync = useCallback(async () => {
    if (!canTriggerManualSync || syncBusy) return;
    setSyncBusy(true);
    setSyncErro("");
    try {
      await dispararSyncManualProdutos();
      showToast?.({
        type: "success",
        title: "Sincronização iniciada",
        message: "A atualização de produtos foi disparada com sucesso.",
      });
      await loadSyncStatus();
    } catch (e) {
      const status = e?.response?.status;
      const msg =
        status === 409
          ? "Sincronização já está em andamento."
          : "Não foi possível iniciar a sincronização agora.";
      setSyncErro(msg);
    } finally {
      setSyncBusy(false);
    }
  }, [canTriggerManualSync, syncBusy, showToast, loadSyncStatus]);

  if (!open) return null;

  return createPortal(
    <div className="wa-modalOverlay" role="dialog" aria-label="Consulta de produtos" onMouseDown={onClose}>
      <aside className="wa-productsDrawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wa-productsDrawer-head">
          <div>
            <h3 className="wa-productsDrawer-title">Consulta de produtos</h3>
            <p className="wa-productsDrawer-subtitle">Pesquise preço e estoque sem sair do atendimento.</p>
          </div>
          <button type="button" className="wa-iconBtn" onClick={onClose} title="Fechar">
            ✕
          </button>
        </div>

        <div className="wa-productsToolbar">
          <input
            className="wa-input"
            placeholder="Buscar por descrição, código, barras..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <label className="wa-productsStockOnly">
            <input
              type="checkbox"
              checked={somenteComEstoque}
              onChange={(e) => setSomenteComEstoque(Boolean(e.target.checked))}
            />
            Somente com estoque
          </label>
        </div>

        {canViewSyncStatus ? (
          <section className="wa-productsSyncCard" aria-live="polite">
            <div className="wa-productsSyncCard-top">
              <strong>Sincronização</strong>
              <button type="button" className="wa-btn wa-btn-ghost" onClick={loadSyncStatus} disabled={syncLoading}>
                {syncLoading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
            {syncErro ? (
              <div className="wa-productsSyncError">{syncErro}</div>
            ) : (
              <div className="wa-productsSyncGrid">
                <span>Habilitado: {syncStatus?.enabled ? "Sim" : "Não"}</span>
                <span>Em execução: {syncStatus?.running ? "Sim" : "Não"}</span>
                <span>Status: {syncStatus?.lastSyncStatus || "—"}</span>
                <span>Última conclusão: {formatDateTime(syncStatus?.lastSyncFinishedAt)}</span>
              </div>
            )}
            {canTriggerManualSync ? (
              <button type="button" className="wa-btn wa-btn-primary" onClick={handleManualSync} disabled={syncBusy}>
                {syncBusy ? "Sincronizando..." : "Sincronizar agora"}
              </button>
            ) : null}
          </section>
        ) : null}

        {erroConsulta ? <div className="wa-productsError">{erroConsulta}</div> : null}

        <section className="wa-productsListWrap" aria-busy={loadingInitial || loadingFetch}>
          {loadingInitial ? (
            <div className="wa-productsSkeleton">
              <SkeletonLine width="100%" />
              <SkeletonLine width="100%" />
              <SkeletonLine width="95%" />
              <SkeletonLine width="98%" />
            </div>
          ) : items.length === 0 ? (
            <div className="wa-productsEmpty">
              <strong>Nenhum produto encontrado.</strong>
              <span>Ajuste os filtros ou tente outro termo de busca.</span>
            </div>
          ) : (
            <div className="wa-productsTable">
              {items.map((item) => {
                const badge = estoqueBadge(item?.estoquePrevisto);
                const template = buildTemplate(item);
                return (
                  <article className="wa-productCard" key={`${item?.codigoItem}-${item?.codigoBarras || ""}`}>
                    <div className="wa-productCard-head">
                      <div className="wa-productTitle">{item?.descricaoItem || "Produto sem descrição"}</div>
                      <span className={`wa-stockBadge wa-stockBadge--${badge.tone}`}>
                        {badge.label}: {Number(item?.estoquePrevisto) || 0}
                      </span>
                    </div>
                    <div className="wa-productMeta">
                      <span>Cód: {item?.codigoItem || "-"}</span>
                      <span>Fabricante: {item?.codigoFabricante || "-"}</span>
                      <span>Barras: {item?.codigoBarras || "-"}</span>
                    </div>
                    <div className="wa-productCard-foot">
                      <strong className="wa-productPrice">{formatMoeda(item?.precoUnitario)}</strong>
                      <div className="wa-productActions">
                        <button
                          type="button"
                          className="wa-btn wa-btn-ghost"
                          onClick={async () => {
                            const ok = await copyText(template);
                            showToast?.({
                              type: ok ? "success" : "error",
                              title: ok ? "Copiado" : "Falha ao copiar",
                              message: ok
                                ? "Dados do produto copiados para a área de transferência."
                                : "Não foi possível copiar os dados do produto.",
                            });
                          }}
                        >
                          Copiar
                        </button>
                        <button
                          type="button"
                          className="wa-btn wa-btn-primary"
                          onClick={() => onEnviarParaConversa?.(template)}
                        >
                          Enviar para conversa
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="wa-productsPagination">
          <span>
            {total > 0 ? `${Math.min(offset + 1, total)}-${Math.min(offset + currentCount, total)} de ${total}` : "0 resultados"}
          </span>
          <div className="wa-productsPagination-actions">
            {loadingFetch ? <span className="wa-productsInlineSpinner">Buscando...</span> : null}
            <button type="button" className="wa-btn wa-btn-ghost" onClick={() => setOffset((v) => Math.max(v - PAGE_SIZE, 0))} disabled={!hasPrev || loadingFetch}>
              Anterior
            </button>
            <button type="button" className="wa-btn wa-btn-ghost" onClick={() => setOffset((v) => v + PAGE_SIZE)} disabled={!hasNext || loadingFetch}>
              Próxima
            </button>
          </div>
        </footer>
      </aside>
    </div>,
    document.body
  );
}
