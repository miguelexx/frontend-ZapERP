import { useCallback, useState } from "react";
import { registrarLigacao } from "../conversaService";

/**
 * Modal "registrar ligação" da conversa.
 *
 * Extraído de ConversaView.jsx sem alterar comportamento: mesma faixa de
 * duração (1–15, default 5), mesmo endpoint (`registrarLigacao`), mesmo
 * tratamento de erro (403 = acesso restrito) e mesmos toasts. `callSending`
 * bloqueia o fechamento e o reenvio. `setOpen` fica exposto para o gatilho
 * externo (e para o handler de fechar do modal).
 *
 * @param {{ conversaId: any, showToast: Function }} deps
 */
export function useConversationCall({ conversaId, showToast }) {
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callDuration, setCallDuration] = useState(5);
  const [callSending, setCallSending] = useState(false);

  const handleCallDurationChange = useCallback((raw) => {
    const v = Number(raw) || 0;
    if (v < 1) setCallDuration(1);
    else if (v > 15) setCallDuration(15);
    else setCallDuration(v);
  }, []);

  const handleCallConfirm = useCallback(async () => {
    if (!conversaId || callSending) return;
    const dur = Math.min(15, Math.max(1, Number(callDuration) || 5));
    setCallSending(true);
    try {
      const data = await registrarLigacao(conversaId, dur);
      if (data?.ok === false) {
        throw Object.assign(new Error(data?.error || data?.motivo || "Falha ao registrar ligação"), {
          response: { status: 502, data },
        });
      }
      setCallModalOpen(false);
      showToast({
        type: "success",
        title: "Ligação registrada",
        message: "A ligação via WhatsApp foi registrada na conversa.",
      });
    } catch (err) {
      console.error("Erro ao registrar ligação:", err);
      const is403 = err?.response?.status === 403;
      const apiMsg = err?.response?.data?.error || err?.response?.data?.motivo || err?.message;
      showToast({
        type: "error",
        title: is403 ? "Acesso restrito" : "Falha ao registrar ligação",
        message:
          apiMsg ||
          (is403 ? "Assuma a conversa antes de enviar mensagens." : "Não foi possível registrar a ligação."),
      });
    } finally {
      setCallSending(false);
    }
  }, [conversaId, callSending, callDuration, showToast]);

  return {
    callModalOpen,
    setCallModalOpen,
    callDuration,
    callSending,
    handleCallDurationChange,
    handleCallConfirm,
  };
}
