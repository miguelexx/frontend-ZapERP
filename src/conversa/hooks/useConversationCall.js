import { useCallback, useState } from "react";
import { registrarLigacao } from "../conversaService";

/**
 * Ligação da conversa: duração 1–30s (default 15) no toque WhatsApp (Whapi).
 * O botão Ligar do perfil abre `tel:` para conversar; este hook notifica o WhatsApp.
 *
 * @param {{ conversaId: any, showToast: Function }} deps
 */
export function useConversationCall({ conversaId, showToast }) {
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callDuration, setCallDuration] = useState(15);
  const [callSending, setCallSending] = useState(false);

  const handleCallDurationChange = useCallback((raw) => {
    const v = Number(raw) || 0;
    if (v < 1) setCallDuration(1);
    else if (v > 30) setCallDuration(30);
    else setCallDuration(v);
  }, []);

  const handleCallConfirm = useCallback(async (arg) => {
    if (!conversaId || callSending) return;
    const deviceCallOpened = Boolean(arg && typeof arg === "object" && arg.deviceCallOpened === true);
    const dur = Math.min(30, Math.max(1, Number(callDuration) || 15));
    setCallSending(true);
    try {
      const data = await registrarLigacao(conversaId, dur);
      if (data?.ok === false) {
        throw Object.assign(new Error(data?.error || data?.motivo || "Falha ao ligar"), {
          response: { status: 422, data },
        });
      }
      setCallModalOpen(false);
      showToast({
        type: "success",
        title: deviceCallOpened ? "Ligando" : "Chamada enviada",
        message: deviceCallOpened
          ? "Chamada no telefone aberta para conversar. O WhatsApp do cliente também foi notificado."
          : "O WhatsApp do cliente deve tocar por alguns segundos.",
      });
    } catch (err) {
      console.error("Erro ao ligar pelo WhatsApp:", err);
      const is403 = err?.response?.status === 403;
      const apiMsg = err?.response?.data?.error || err?.response?.data?.motivo || err?.message;
      showToast({
        type: deviceCallOpened && !is403 ? "warning" : "error",
        title: is403 ? "Acesso restrito" : deviceCallOpened ? "WhatsApp não tocou" : "Não foi possível ligar",
        message: is403
          ? "Assuma a conversa antes de ligar."
          : deviceCallOpened
            ? `${apiMsg || "Falha no WhatsApp."} Use a chamada do telefone para conversar.`
            : apiMsg || "Não foi possível ligar para o cliente pelo WhatsApp.",
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
    startWhatsappCall: handleCallConfirm,
  };
}
