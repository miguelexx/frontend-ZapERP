import { useCallback, useEffect, useRef, useState } from "react";
import { useLazyHookImpl } from "./lazyHookImpl";

const loadImpl = () => import("./useShareContact.impl");
const prefetchModal = () => import("../components/ShareContactModal");

/**
 * Compartilhamento de contato/cliente na conversa (modal + busca debounced).
 * UI em ShareContactModal; lógica em `useShareContact.impl.js`.
 *
 * Casca: o modal só abre DEPOIS do corpo chegar (o efeito de busca precisa dele para
 * mostrar o spinner no mesmo commit da abertura, como antes). O chunk do modal é
 * aquecido junto, então a primeira abertura custa uma viagem, não duas em série.
 */
export function useShareContact({ conversaId, showToast }) {
  const [shareContactOpen, setShareContactOpen] = useState(false);
  const [shareContactQuery, setShareContactQuery] = useState("");
  const [shareContactList, setShareContactList] = useState([]);
  const [shareContactLoading, setShareContactLoading] = useState(false);
  const [shareContactSending, setShareContactSending] = useState(false);
  const { impl, withImpl } = useLazyHookImpl(loadImpl, {
    showToast,
    label: "Compartilhar contato",
    prefetch: prefetchModal,
  });

  const ctxRef = useRef(null);
  ctxRef.current = {
    conversaId,
    shareContactSending,
    showToast,
    setShareContactOpen,
    setShareContactQuery,
    setShareContactList,
    setShareContactSending,
  };

  useEffect(() => {
    if (!shareContactOpen) {
      setShareContactList([]);
      setShareContactQuery("");
      setShareContactLoading(false);
      return undefined;
    }
    // Só abre com o impl carregado (openShareContact); o guard é defensivo.
    if (!impl) return undefined;
    return impl.runShareContactSearch({ shareContactQuery, setShareContactList, setShareContactLoading });
  }, [impl, shareContactOpen, shareContactQuery]);

  const openShareContact = useCallback(() => {
    withImpl(() => setShareContactOpen(true));
  }, [withImpl]);

  const handleShareContactClose = useCallback(() => {
    if (shareContactSending) return;
    setShareContactOpen(false);
    setShareContactQuery("");
    setShareContactList([]);
  }, [shareContactSending]);

  const handleShareContactSelect = useCallback(
    (c) => {
      const ctx = ctxRef.current;
      return withImpl((impl) => impl.handleShareContactSelect(ctx, c));
    },
    [withImpl]
  );

  return {
    shareContactOpen,
    setShareContactOpen,
    shareContactQuery,
    setShareContactQuery,
    shareContactList,
    shareContactLoading,
    shareContactSending,
    openShareContact,
    handleShareContactClose,
    handleShareContactSelect,
  };
}
