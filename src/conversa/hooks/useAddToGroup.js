import { useCallback, useEffect, useRef, useState } from "react";
import { useLazyHookImpl } from "./lazyHookImpl";

const loadImpl = () => import("./useAddToGroup.impl");
const prefetchModal = () => import("../components/AddToGroupModal");

/**
 * Fluxo "Adicionar contato a um grupo" (cartão de contato → escolher grupo).
 *
 * Mesmos estados, mesmo endpoint (POST /chats/:grupoId/participantes), mesma origem dos
 * grupos (cache do chatsStore ou fetchChats) e mesmo tratamento de erro/toasts — o corpo
 * está em `useAddToGroup.impl.js`.
 *
 * Casca: a validação do telefone (toast) é síncrona no clique; o modal abre DEPOIS do
 * corpo chegar, para o efeito de carga dos grupos rodar no mesmo commit da abertura.
 *
 * @param {(t: object) => void} showToast
 */
export function useAddToGroup(showToast) {
  const [addToGroupModal, setAddToGroupModal] = useState({ open: false, telefone: null, nome: null });
  const [addToGroupGrupos, setAddToGroupGrupos] = useState([]);
  const [addToGroupLoading, setAddToGroupLoading] = useState(false);
  const [addToGroupSending, setAddToGroupSending] = useState(false);
  const { impl, withImpl } = useLazyHookImpl(loadImpl, {
    showToast,
    label: "Adicionar ao grupo",
    prefetch: prefetchModal,
  });

  const closeAddToGroupModal = useCallback(() => {
    setAddToGroupModal({ open: false, telefone: null, nome: null });
    setAddToGroupGrupos([]);
    setAddToGroupSending(false);
  }, []);

  const ctxRef = useRef(null);
  ctxRef.current = {
    showToast,
    addToGroupModal,
    addToGroupSending,
    setAddToGroupSending,
    closeAddToGroupModal,
  };

  const handleAdicionarGrupoContact = useCallback((meta) => {
    if (!meta?.telefone) {
      showToast({ type: "warning", title: "Telefone indisponível", message: "Este contato não possui número." });
      return;
    }
    const next = { open: true, telefone: meta.telefone, nome: meta.nome || "Contato" };
    withImpl(() => setAddToGroupModal(next));
  }, [showToast, withImpl]);

  const confirmAddToGroup = useCallback(
    (grupo) => {
      const ctx = ctxRef.current;
      return withImpl((impl) => impl.confirmAddToGroup(ctx, grupo));
    },
    [withImpl]
  );

  useEffect(() => {
    if (!addToGroupModal?.open) {
      setAddToGroupGrupos([]);
      setAddToGroupLoading(false);
      return;
    }
    // Só abre com o impl carregado (handleAdicionarGrupoContact); o guard é defensivo.
    if (!impl) return;
    impl.loadGruposOnOpen({ setAddToGroupGrupos, setAddToGroupLoading });
  }, [impl, addToGroupModal?.open]);

  return {
    addToGroupModal,
    addToGroupGrupos,
    addToGroupLoading,
    addToGroupSending,
    handleAdicionarGrupoContact,
    closeAddToGroupModal,
    confirmAddToGroup,
  };
}
