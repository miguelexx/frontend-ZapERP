import { useCallback, useState } from "react";
import {
  enviarCatalogoConversa,
  enviarProdutoConversa,
  listarCatalogoConversa,
} from "../conversaService";

/**
 * Seletor de catálogo na conversa (Whapi): lista os produtos da instância da conversa
 * e envia produto(s) como cartão rico, ou o link do catálogo completo.
 */
export function useSendCatalog({ conversaId, showToast, composerRef }) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sendingId, setSendingId] = useState(null);
  const [sendingCatalog, setSendingCatalog] = useState(false);

  const load = useCallback(async (signal) => {
    if (conversaId == null) return;
    setLoading(true);
    setError("");
    try {
      const { products: list } = await listarCatalogoConversa(conversaId, { signal });
      if (signal?.aborted) return;
      setProducts(Array.isArray(list) ? list : []);
    } catch (err) {
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
      const status = err?.response?.status;
      setProducts([]);
      setError(
        err?.response?.data?.error
        || (status === 501 ? "O catálogo está disponível apenas em canais Whapi (WhatsApp Business)." : null)
        || err?.message
        || "Não foi possível carregar o catálogo."
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [conversaId]);

  const openCatalog = useCallback(() => {
    composerRef?.current?.closePanels?.();
    setCatalogOpen(true);
    const controller = new AbortController();
    load(controller.signal);
  }, [composerRef, load]);

  const closeCatalog = useCallback(() => {
    if (sendingId || sendingCatalog) return;
    setCatalogOpen(false);
  }, [sendingId, sendingCatalog]);

  const sendProduct = useCallback(async (product) => {
    if (!product || sendingId) return;
    setSendingId(product.id);
    try {
      await enviarProdutoConversa(conversaId, product);
      showToast?.({
        type: "success",
        title: "Produto enviado",
        message: "O cartão do produto aparece na conversa quando o servidor confirmar.",
      });
      setCatalogOpen(false);
    } catch (err) {
      const status = err?.response?.status;
      showToast?.({
        type: "error",
        title: status === 501 ? "Não disponível" : "Falha ao enviar produto",
        message: err?.response?.data?.error || err?.message || "Não foi possível enviar o produto.",
      });
    } finally {
      setSendingId(null);
    }
  }, [conversaId, sendingId, showToast]);

  const sendCatalogLink = useCallback(async () => {
    if (sendingCatalog) return;
    setSendingCatalog(true);
    try {
      await enviarCatalogoConversa(conversaId, {});
      showToast?.({
        type: "success",
        title: "Catálogo enviado",
        message: "O link do catálogo foi enviado ao cliente.",
      });
      setCatalogOpen(false);
    } catch (err) {
      const status = err?.response?.status;
      showToast?.({
        type: "error",
        title: status === 501 ? "Não disponível" : "Falha ao enviar catálogo",
        message: err?.response?.data?.error || err?.message || "Não foi possível enviar o catálogo.",
      });
    } finally {
      setSendingCatalog(false);
    }
  }, [conversaId, sendingCatalog, showToast]);

  return {
    catalogOpen,
    products,
    loading,
    error,
    sendingId,
    sendingCatalog,
    openCatalog,
    closeCatalog,
    reloadCatalog: () => load(),
    sendProduct,
    sendCatalogLink,
  };
}
