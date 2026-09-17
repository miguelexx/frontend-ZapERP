import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  IconBuildingStore,
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
  IconPackage,
  IconPhoto,
  IconRefresh,
  IconSearch,
  IconShieldCheck,
  IconTag,
  IconX,
} from "@tabler/icons-react";
import {
  apiErrorCode,
  listarColecoesCatalogo,
  listarProdutosCatalogo,
  listarProdutosDaColecao,
} from "../api/whapiCatalogService";
import { apiErrorMessage } from "../api/whapiBusinessService";
import { whapiInstanceName } from "./WhapiBusinessLayout";

const PAGE_SIZE = 60;
const ALL_COLLECTION = "__all__";

function isRenderableImage(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function firstRenderableImage(product) {
  if (!product) return null;
  if (isRenderableImage(product.image)) return product.image;
  const images = Array.isArray(product.images) ? product.images : [];
  return images.find(isRenderableImage) || null;
}

function formatPrice(price, currency) {
  const value = Number(price);
  if (!Number.isFinite(value)) return "";
  const code = String(currency || "").trim().toUpperCase();
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: code || "BRL",
      currencyDisplay: "symbol",
    }).format(value);
  } catch {
    // Moeda desconhecida pelo Intl → mostra número + código cru sem quebrar.
    return `${value.toFixed(2)}${code ? ` ${code}` : ""}`;
  }
}

function isOutOfStock(product) {
  return String(product?.availability || "").toLowerCase().includes("out");
}

function EmptyWhapiState({ loading }) {
  return (
    <div className="wb-empty-state">
      <span className="wb-empty-state__icon"><IconBuildingStore size={30} /></span>
      <h2>{loading ? "Buscando seus canais…" : "Conecte um canal Whapi"}</h2>
      <p>{loading ? "Isso leva apenas alguns segundos." : "O catálogo é exclusivo para instâncias Whapi cadastradas na empresa."}</p>
      {!loading ? <a href="/configuracoes?tab=whapi">Configurar Whapi</a> : null}
    </div>
  );
}

function BusinessAccountRequiredState({ instance }) {
  return (
    <div className="wb-empty-state">
      <span className="wb-empty-state__icon"><IconBuildingStore size={30} /></span>
      <h2>Este canal não é WhatsApp Business</h2>
      <p>
        O canal <strong>{whapiInstanceName(instance)}</strong> está conectado a uma conta WhatsApp comum.
        Migre o número para o app WhatsApp Business e cadastre um catálogo para ver os produtos aqui.
      </p>
    </div>
  );
}

function ProductThumb({ product }) {
  const [failed, setFailed] = useState(false);
  const src = firstRenderableImage(product);
  if (!src || failed) {
    return (
      <div className="wb-catalog-thumb wb-catalog-thumb--empty" aria-hidden="true">
        <IconPhoto size={30} stroke={1.5} />
      </div>
    );
  }
  return (
    <div className="wb-catalog-thumb">
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </div>
  );
}

function ProductModal({ product, instanceName, onClose }) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef(null);

  const images = useMemo(
    () => (Array.isArray(product?.images) ? product.images.filter(isRenderableImage) : []),
    [product],
  );

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [product]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight" && images.length > 1) setIndex((i) => (i + 1) % images.length);
      else if (event.key === "ArrowLeft" && images.length > 1) setIndex((i) => (i - 1 + images.length) % images.length);
    }
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  if (!product) return null;
  const price = formatPrice(product.price, product.currency);
  const salePrice = product.sale_price != null ? formatPrice(product.sale_price, product.currency) : "";
  const outOfStock = isOutOfStock(product);
  const currentImage = images[index] || null;

  return (
    <div className="wb-catalog-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wb-catalog-modal" role="dialog" aria-modal="true" aria-label={product.name || "Produto"}>
        <button type="button" className="wb-catalog-modal__close" onClick={onClose} ref={closeRef} aria-label="Fechar">
          <IconX size={19} />
        </button>

        <div className="wb-catalog-modal__media">
          {currentImage && !failed ? (
            <img src={currentImage} alt={product.name || ""} onError={() => setFailed(true)} />
          ) : (
            <div className="wb-catalog-modal__media-empty"><IconPhoto size={46} stroke={1.4} /></div>
          )}
          {images.length > 1 ? (
            <>
              <button type="button" className="wb-catalog-modal__nav is-prev" onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)} aria-label="Imagem anterior">
                <IconChevronLeft size={20} />
              </button>
              <button type="button" className="wb-catalog-modal__nav is-next" onClick={() => setIndex((i) => (i + 1) % images.length)} aria-label="Próxima imagem">
                <IconChevronRight size={20} />
              </button>
              <div className="wb-catalog-modal__dots" aria-hidden="true">
                {images.map((img, i) => <i key={img + i} className={i === index ? "is-active" : ""} />)}
              </div>
            </>
          ) : null}
        </div>

        <div className="wb-catalog-modal__body">
          <span className="wb-section-kicker">{instanceName}</span>
          <h2>{product.name || "Produto sem nome"}</h2>

          <div className="wb-catalog-modal__price">
            {salePrice ? (
              <>
                <strong>{salePrice}</strong>
                {price ? <s>{price}</s> : null}
              </>
            ) : (
              <strong>{price || "Preço não informado"}</strong>
            )}
            <span className={`wb-catalog-stock${outOfStock ? " is-out" : ""}`}>
              <i aria-hidden="true" />
              {outOfStock ? "Sem estoque" : "Disponível"}
            </span>
          </div>

          {product.description ? (
            <p className="wb-catalog-modal__description">{product.description}</p>
          ) : (
            <p className="wb-catalog-modal__placeholder">Este produto não tem descrição no catálogo.</p>
          )}

          <dl className="wb-catalog-modal__meta">
            {product.product_retailer_id ? (
              <div>
                <dt><IconTag size={15} /> Código (SKU)</dt>
                <dd>{product.product_retailer_id}</dd>
              </div>
            ) : null}
            {isRenderableImage(product.url) ? (
              <div>
                <dt><IconExternalLink size={15} /> Link do produto</dt>
                <dd>
                  <a href={product.url} target="_blank" rel="noopener noreferrer">Abrir página<IconExternalLink size={14} /></a>
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="wb-catalog-modal__note">
            <IconShieldCheck size={17} />
            <span>Dados lidos diretamente do catálogo oficial do WhatsApp Business.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const { selectedId, selectedInstance, loadingInstances } = useOutletContext();
  const instanceName = whapiInstanceName(selectedInstance);

  const [collections, setCollections] = useState([]);
  const [activeCollection, setActiveCollection] = useState(ALL_COLLECTION);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [businessRequired, setBusinessRequired] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const offsetRef = useRef(0);

  const disabled = !selectedId || selectedInstance?.is_business === false;

  const handleError = useCallback((requestError, fallback) => {
    if (requestError?.name === "CanceledError" || requestError?.code === "ERR_CANCELED") return true;
    if (apiErrorCode(requestError) === "WHAPI_BUSINESS_ACCOUNT_REQUIRED") {
      setBusinessRequired(true);
      return false;
    }
    setError(apiErrorMessage(requestError, fallback));
    return false;
  }, []);

  const loadAll = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    setBusinessRequired(false);
    offsetRef.current = 0;
    try {
      const [page, cols] = await Promise.all([
        listarProdutosCatalogo(selectedId, { count: PAGE_SIZE, offset: 0, signal, silent: true }),
        listarColecoesCatalogo(selectedId, { signal, silent: true }).catch(() => []),
      ]);
      if (signal?.aborted) return;
      setProducts(page.products);
      setTotal(page.total);
      setCollections(Array.isArray(cols) ? cols : []);
      offsetRef.current = page.products.length;
    } catch (requestError) {
      if (signal?.aborted) return;
      setProducts([]);
      setCollections([]);
      setTotal(null);
      handleError(requestError, "Não foi possível carregar o catálogo.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [selectedId, handleError]);

  const loadCollection = useCallback(async (collectionId, signal) => {
    setLoading(true);
    setError("");
    setBusinessRequired(false);
    offsetRef.current = 0;
    setTotal(null);
    try {
      const items = await listarProdutosDaColecao(selectedId, collectionId, { productsCount: 200, signal, silent: true });
      if (signal?.aborted) return;
      setProducts(items);
    } catch (requestError) {
      if (signal?.aborted) return;
      setProducts([]);
      handleError(requestError, "Não foi possível carregar a coleção.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [selectedId, handleError]);

  // Recarrega ao trocar de canal ou de coleção.
  useEffect(() => {
    if (disabled) {
      setProducts([]);
      setCollections([]);
      setError("");
      setBusinessRequired(selectedInstance?.is_business === false);
      return undefined;
    }
    const controller = new AbortController();
    if (activeCollection === ALL_COLLECTION) loadAll(controller.signal);
    else loadCollection(activeCollection, controller.signal);
    return () => controller.abort();
  }, [disabled, selectedId, activeCollection, selectedInstance?.is_business, loadAll, loadCollection]);

  // Ao trocar de canal, volta para "Todos".
  useEffect(() => {
    setActiveCollection(ALL_COLLECTION);
    setSearch("");
  }, [selectedId]);

  const canLoadMore = activeCollection === ALL_COLLECTION
    && total != null
    && products.length < total
    && !search.trim();

  async function handleLoadMore() {
    if (loadingMore || loading || !canLoadMore) return;
    setLoadingMore(true);
    try {
      const page = await listarProdutosCatalogo(selectedId, { count: PAGE_SIZE, offset: offsetRef.current, silent: true });
      setProducts((current) => {
        const seen = new Set(current.map((p) => p.id));
        const merged = current.concat(page.products.filter((p) => !seen.has(p.id)));
        offsetRef.current = merged.length;
        return merged;
      });
      if (page.total != null) setTotal(page.total);
    } catch (requestError) {
      handleError(requestError, "Não foi possível carregar mais produtos.");
    } finally {
      setLoadingMore(false);
    }
  }

  function reload() {
    if (disabled || loading) return;
    const controller = new AbortController();
    if (activeCollection === ALL_COLLECTION) loadAll(controller.signal);
    else loadCollection(activeCollection, controller.signal);
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => {
      const haystack = `${product.name || ""} ${product.description || ""} ${product.product_retailer_id || ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [products, search]);

  if (!selectedId) return <EmptyWhapiState loading={loadingInstances} />;
  if (selectedInstance?.is_business === false || businessRequired) return <BusinessAccountRequiredState instance={selectedInstance} />;

  return (
    <div className="wb-catalog">
      <div className="wb-catalog-toolbar">
        <div className="wb-catalog-search">
          <IconSearch size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, descrição ou código"
            aria-label="Buscar produtos"
          />
        </div>
        <button
          type="button"
          className="wb-icon-button"
          onClick={reload}
          disabled={loading}
          title="Atualizar catálogo"
          aria-label="Atualizar catálogo"
        >
          <IconRefresh className={loading ? "wb-spin" : ""} size={18} />
        </button>
      </div>

      {collections.length ? (
        <div className="wb-catalog-collections" role="tablist" aria-label="Coleções do catálogo">
          <button
            type="button"
            role="tab"
            aria-selected={activeCollection === ALL_COLLECTION}
            className={`wb-catalog-chip${activeCollection === ALL_COLLECTION ? " is-active" : ""}`}
            onClick={() => setActiveCollection(ALL_COLLECTION)}
          >
            Todos os itens
            {total != null ? <span>{total}</span> : null}
          </button>
          {collections.map((collection) => (
            <button
              key={collection.id}
              type="button"
              role="tab"
              aria-selected={String(activeCollection) === String(collection.id)}
              className={`wb-catalog-chip${String(activeCollection) === String(collection.id) ? " is-active" : ""}`}
              onClick={() => setActiveCollection(collection.id)}
            >
              {collection.name || "Coleção"}
              {Number.isFinite(Number(collection.products_count)) ? <span>{collection.products_count}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="wb-inline-alert wb-inline-alert--error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={reload}>Tentar novamente</button>
        </div>
      ) : null}

      {loading ? (
        <div className="wb-catalog-grid" aria-label="Carregando catálogo">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="wb-catalog-card wb-catalog-card--skeleton" key={i} aria-hidden="true">
              <div className="wb-catalog-thumb wb-catalog-thumb--skeleton" />
              <div className="wb-skeleton-line" />
              <div className="wb-skeleton-line wb-skeleton-line--short" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="wb-empty-state wb-empty-state--soft">
          <span className="wb-empty-state__icon"><IconPackage size={28} /></span>
          <h2>{search.trim() ? "Nenhum produto encontrado" : "Catálogo vazio"}</h2>
          <p>
            {search.trim()
              ? "Tente outro termo de busca."
              : "Cadastre produtos no catálogo do WhatsApp Business para vê-los aqui."}
          </p>
        </div>
      ) : (
        <>
          <div className="wb-catalog-grid">
            {filtered.map((product) => {
              const price = formatPrice(product.price, product.currency);
              const salePrice = product.sale_price != null ? formatPrice(product.sale_price, product.currency) : "";
              const outOfStock = isOutOfStock(product);
              return (
                <button
                  type="button"
                  className="wb-catalog-card"
                  key={product.id || product.product_retailer_id || product.name}
                  onClick={() => setSelectedProduct(product)}
                >
                  <ProductThumb product={product} />
                  {outOfStock ? <span className="wb-catalog-badge">Sem estoque</span> : null}
                  <div className="wb-catalog-card__body">
                    <h3 title={product.name}>{product.name || "Produto sem nome"}</h3>
                    <div className="wb-catalog-card__price">
                      {salePrice ? (
                        <>
                          <strong>{salePrice}</strong>
                          {price ? <s>{price}</s> : null}
                        </>
                      ) : (
                        <strong>{price || "—"}</strong>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {canLoadMore ? (
            <div className="wb-catalog-more">
              <button type="button" className="wb-secondary-button" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <span className="wb-button-spinner" /> : null}
                {loadingMore ? "Carregando…" : "Carregar mais produtos"}
              </button>
            </div>
          ) : null}
        </>
      )}

      {selectedProduct ? (
        <ProductModal product={selectedProduct} instanceName={instanceName} onClose={() => setSelectedProduct(null)} />
      ) : null}
    </div>
  );
}
