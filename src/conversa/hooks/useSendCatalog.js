import { useCallback, useRef, useState } from "react";
import { useLazyHookImpl } from "./lazyHookImpl";

const loadImpl = () => import("./useSendCatalog.impl");
const prefetchModal = () => import("../components/CatalogPickerModal");

/**
 * Seletor de catálogo na conversa (Whapi): lista os produtos da instância da conversa
 * e envia produto(s) como cartão rico, ou o link do catálogo completo.
 *
 * Casca: fechar os painéis do composer é síncrono no clique; o modal abre e a lista é
 * pedida DEPOIS do corpo (`useSendCatalog.impl.js`) chegar — o chunk do
 * CatalogPickerModal é aquecido junto, então a primeira abertura custa uma viagem.
 */
export function useSendCatalog({ conversaId, showToast, composerRef }) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(null); // { done, total } durante o envio em lote
  const [sendingCatalog, setSendingCatalog] = useState(false);
  const { withImpl } = useLazyHookImpl(loadImpl, {
    showToast,
    label: "Catálogo",
    prefetch: prefetchModal,
  });

  const ctxRef = useRef(null);
  ctxRef.current = {
    conversaId,
    showToast,
    sending,
    sendingCatalog,
    setCatalogOpen,
    setProducts,
    setLoading,
    setError,
    setSending,
    setSendProgress,
    setSendingCatalog,
  };

  const openCatalog = useCallback(() => {
    composerRef?.current?.closePanels?.();
    withImpl((impl) => {
      setCatalogOpen(true);
      const controller = new AbortController();
      impl.load(ctxRef.current, controller.signal);
    });
  }, [composerRef, withImpl]);

  const closeCatalog = useCallback(() => {
    if (sending || sendingCatalog) return;
    setCatalogOpen(false);
  }, [sending, sendingCatalog]);

  const reloadCatalog = useCallback(() => withImpl((impl) => impl.load(ctxRef.current)), [withImpl]);

  const sendProducts = useCallback(
    (list, onItemSent) => {
      const ctx = ctxRef.current;
      return withImpl((impl) => impl.sendProducts(ctx, list, onItemSent));
    },
    [withImpl]
  );

  const sendCatalogLink = useCallback(() => {
    const ctx = ctxRef.current;
    return withImpl((impl) => impl.sendCatalogLink(ctx));
  }, [withImpl]);

  return {
    catalogOpen,
    products,
    loading,
    error,
    sending,
    sendProgress,
    sendingCatalog,
    openCatalog,
    closeCatalog,
    reloadCatalog,
    sendProducts,
    sendCatalogLink,
  };
}
