import { useCallback, useRef, useState } from "react";
import { useLazyHookImpl } from "./lazyHookImpl";

const MAX_OPTIONS = 12;
const loadImpl = () => import("./useSendPoll.impl");

/**
 * Modal de envio de enquete (Whapi poll) — alternativa estável a botões.
 *
 * Casca: estado do formulário + abrir/fechar ficam aqui (o modal abre no clique, sem
 * esperar rede). O envio (`useSendPoll.impl.js`) só desce na primeira abertura, em
 * paralelo com o chunk do SendPollModal.
 */
export function useSendPoll({ conversaId, showToast, composerRef }) {
  const [pollOpen, setPollOpen] = useState(false);
  const [pollTitle, setPollTitle] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollMulti, setPollMulti] = useState(false);
  const [pollSending, setPollSending] = useState(false);
  const { ensureImpl, withImpl } = useLazyHookImpl(loadImpl, { showToast, label: "Enquete" });

  const ctxRef = useRef(null);
  ctxRef.current = {
    conversaId,
    showToast,
    pollSending,
    pollTitle,
    pollOptions,
    pollMulti,
    setPollOpen,
    setPollSending,
  };

  const openPoll = useCallback(() => {
    composerRef?.current?.closePanels?.();
    setPollTitle("");
    setPollOptions(["", ""]);
    setPollMulti(false);
    setPollOpen(true);
    // Aquece o corpo do envio enquanto o atendente preenche a enquete.
    ensureImpl();
  }, [composerRef, ensureImpl]);

  const closePoll = useCallback(() => {
    if (pollSending) return;
    setPollOpen(false);
  }, [pollSending]);

  const setOptionAt = useCallback((index, value) => {
    setPollOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const addOption = useCallback(() => {
    setPollOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, ""]));
  }, []);

  const removeOption = useCallback((index) => {
    setPollOptions((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSendPoll = useCallback(() => {
    const ctx = ctxRef.current;
    return withImpl((impl) => impl.handleSendPoll(ctx));
  }, [withImpl]);

  return {
    pollOpen,
    pollTitle,
    setPollTitle,
    pollOptions,
    setOptionAt,
    addOption,
    removeOption,
    pollMulti,
    setPollMulti,
    pollSending,
    openPoll,
    closePoll,
    handleSendPoll,
    maxOptions: MAX_OPTIONS,
  };
}
