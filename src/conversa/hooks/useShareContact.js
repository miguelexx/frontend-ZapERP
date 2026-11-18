import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLazyHookImpl } from "./lazyHookImpl";
import { SHARE_CONTACT_MAX } from "../conversaConstants";

const loadImpl = () => import("./useShareContact.impl");
const prefetchModal = () => import("../components/ShareContactModal");

/**
 * Compartilhamento de contato/cliente na conversa (modal + busca debounced).
 * UI em ShareContactModal; lógica em `useShareContact.impl.js`.
 *
 * Casca: o modal só abre DEPOIS do corpo chegar (o efeito de busca precisa dele para
 * mostrar o spinner no mesmo commit da abertura, como antes). O chunk do modal é
 * aquecido junto, então a primeira abertura custa uma viagem, não duas em série.
 *
 * Seleção múltipla (estilo WhatsApp): marca N contatos e envia de uma vez — o backend
 * aceita um contato por requisição, então o impl manda em sequência. Teto SHARE_CONTACT_MAX.
 */
export function useShareContact({ conversaId, showToast }) {
  const [shareContactOpen, setShareContactOpen] = useState(false);
  const [shareContactQuery, setShareContactQuery] = useState("");
  const [shareContactList, setShareContactList] = useState([]);
  const [shareContactLoading, setShareContactLoading] = useState(false);
  const [shareContactSending, setShareContactSending] = useState(false);
  const [shareContactSelected, setShareContactSelected] = useState([]);
  const { impl, withImpl } = useLazyHookImpl(loadImpl, {
    showToast,
    label: "Compartilhar contato",
    prefetch: prefetchModal,
  });

  // Agenda completa carregada uma vez por abertura de aba (busca vazia); reabrir o
  // modal não volta ao servidor, então a lista aparece instantânea.
  const allContatosRef = useRef(null);

  const ctxRef = useRef(null);
  ctxRef.current = {
    conversaId,
    shareContactSending,
    showToast,
    setShareContactOpen,
    setShareContactQuery,
    setShareContactList,
    setShareContactSelected,
    setShareContactSending,
  };

  useEffect(() => {
    if (!shareContactOpen) {
      setShareContactList([]);
      setShareContactQuery("");
      setShareContactSelected([]);
      setShareContactLoading(false);
      return undefined;
    }
    // Só abre com o impl carregado (openShareContact); o guard é defensivo.
    if (!impl) return undefined;
    return impl.runShareContactSearch({
      shareContactQuery,
      allContatosRef,
      setShareContactList,
      setShareContactLoading,
    });
  }, [impl, shareContactOpen, shareContactQuery]);

  const openShareContact = useCallback(() => {
    withImpl(() => setShareContactOpen(true));
  }, [withImpl]);

  const handleShareContactClose = useCallback(() => {
    if (shareContactSending) return;
    setShareContactOpen(false);
    setShareContactQuery("");
    setShareContactList([]);
    setShareContactSelected([]);
  }, [shareContactSending]);

  const toggleShareContactSelect = useCallback(
    (c) => {
      if (!c || c.id == null) return;
      const idStr = String(c.id);
      setShareContactSelected((prev) => {
        const atual = Array.isArray(prev) ? prev : [];
        if (atual.some((x) => String(x.id) === idStr)) {
          return atual.filter((x) => String(x.id) !== idStr);
        }
        if (atual.length >= SHARE_CONTACT_MAX) {
          showToast?.({
            type: "warning",
            title: "Limite de contatos",
            message: `Dá para enviar até ${SHARE_CONTACT_MAX} contatos de uma vez.`,
          });
          return atual;
        }
        return [...atual, c];
      });
    },
    [showToast]
  );

  const handleShareContactConfirm = useCallback(() => {
    const ctx = ctxRef.current;
    const escolhidos = shareContactSelected;
    if (!escolhidos.length) return undefined;
    return withImpl((impl) => impl.handleShareContactSend(ctx, escolhidos));
  }, [withImpl, shareContactSelected]);

  /** Compat: enviar um contato só (um clique), sem passar pela seleção. */
  const handleShareContactSelect = useCallback(
    (c) => {
      const ctx = ctxRef.current;
      return withImpl((impl) => impl.handleShareContactSend(ctx, [c]));
    },
    [withImpl]
  );

  const shareContactSelectedIds = useMemo(
    () => shareContactSelected.map((c) => String(c.id)),
    [shareContactSelected]
  );

  return {
    shareContactOpen,
    setShareContactOpen,
    shareContactQuery,
    setShareContactQuery,
    shareContactList,
    shareContactLoading,
    shareContactSending,
    shareContactSelectedIds,
    shareContactMax: SHARE_CONTACT_MAX,
    openShareContact,
    handleShareContactClose,
    toggleShareContactSelect,
    handleShareContactConfirm,
    handleShareContactSelect,
  };
}
