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
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(null); // { done, total } durante o envio em lote
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
    if (sending || sendingCatalog) return;
    setCatalogOpen(false);
  }, [sending, sendingCatalog]);

  // Envia 1..N produtos de forma sequencial (um cartão por produto), reutilizando o
  // endpoint comprovado de produto único. Sequencial para não sobrecarregar a Whapi
  // e preservar a ordem em que o atendente selecionou.
  // onItemSent(product) é chamado após CADA produto entregue com sucesso, para que o
  // modal remova esse item da seleção — assim um reenvio após falha parcial só manda
  // de volta os que faltaram (não duplica os já enviados).
  const sendProducts = useCallback(async (list, onItemSent) => {
    const items = (Array.isArray(list) ? list : [list]).filter(Boolean);
    if (items.length === 0 || sending) return;
    setSending(true);
    setSendProgress({ done: 0, total: items.length });
    let enviados = 0;
    let falhou = 0;
    let ultimoErro = null;
    for (let i = 0; i < items.length; i += 1) {
      try {
        await enviarProdutoConversa(conversaId, items[i]);
        enviados += 1;
        onItemSent?.(items[i]);
      } catch (err) {
        falhou += 1;
        ultimoErro = err;
      }
      setSendProgress({ done: i + 1, total: items.length });
    }
    setSending(false);
    setSendProgress(null);

    if (falhou === 0) {
      showToast?.({
        type: "success",
        title: enviados > 1 ? `${enviados} produtos enviados` : "Produto enviado",
        message: "Os cartões aparecem na conversa quando o servidor confirmar.",
      });
      setCatalogOpen(false);
    } else if (enviados > 0) {
      showToast?.({
        type: "error",
        title: "Envio parcial",
        message: `${enviados} enviado(s), ${falhou} falhou(aram). Tente reenviar os que faltaram.`,
      });
    } else {
      const status = ultimoErro?.response?.status;
      showToast?.({
        type: "error",
        title: status === 501 ? "Não disponível" : "Falha ao enviar",
        message: ultimoErro?.response?.data?.error || ultimoErro?.message || "Não foi possível enviar os produtos.",
      });
    }
  }, [conversaId, sending, showToast]);

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
    sending,
    sendProgress,
    sendingCatalog,
    openCatalog,
    closeCatalog,
    reloadCatalog: () => load(),
    sendProducts,
    sendCatalogLink,
  };
}
