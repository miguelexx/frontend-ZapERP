import { useCallback, useEffect, useRef, useState } from "react";
import { useLazyHookImpl } from "./lazyHookImpl";

const loadImpl = () => import("./useConversationCall.impl");

/**
 * Ligação da conversa: duração 1–30s (default 15) no toque WhatsApp (Whapi).
 * O botão Ligar do perfil abre `tel:` para conversar; este hook notifica o WhatsApp.
 *
 * Casca: o modal abre por `setCallModalOpen` direto (header), então o corpo
 * (`useConversationCall.impl.js`) é aquecido quando o modal abre. O botão do
 * SidebarCliente chama `handleCallConfirm` sem modal: na primeira vez o chunk desce no
 * clique e, nesse intervalo, um segundo toque é descartado (fila de uma ação).
 *
 * @param {{ conversaId: any, showToast: Function }} deps
 */
export function useConversationCall({ conversaId, showToast }) {
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callDuration, setCallDuration] = useState(15);
  const [callSending, setCallSending] = useState(false);
  const { ensureImpl, withImpl } = useLazyHookImpl(loadImpl, { showToast, label: "Ligação" });

  const ctxRef = useRef(null);
  ctxRef.current = {
    conversaId,
    showToast,
    callSending,
    callDuration,
    setCallModalOpen,
    setCallSending,
  };

  useEffect(() => {
    if (callModalOpen) ensureImpl();
  }, [callModalOpen, ensureImpl]);

  const handleCallDurationChange = useCallback((raw) => {
    const v = Number(raw) || 0;
    if (v < 1) setCallDuration(1);
    else if (v > 30) setCallDuration(30);
    else setCallDuration(v);
  }, []);

  const handleCallConfirm = useCallback(
    (arg) => {
      const ctx = ctxRef.current;
      if (!ctx.conversaId || ctx.callSending) return undefined;
      return withImpl((impl) => impl.handleCallConfirm(ctx, arg));
    },
    [withImpl]
  );

  return {
    callModalOpen,
    setCallModalOpen,
    callDuration,
    callSending,
    handleCallDurationChange,
    handleCallConfirm,
    startWhatsappCall: handleCallConfirm,
  };
}
