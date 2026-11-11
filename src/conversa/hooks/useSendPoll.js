import { useCallback, useState } from "react";
import { enviarEnquete } from "../conversaService";

const MAX_OPTIONS = 12;

/**
 * Modal de envio de enquete (Whapi poll) — alternativa estável a botões.
 */
export function useSendPoll({ conversaId, showToast, composerRef }) {
  const [pollOpen, setPollOpen] = useState(false);
  const [pollTitle, setPollTitle] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollMulti, setPollMulti] = useState(false);
  const [pollSending, setPollSending] = useState(false);

  const openPoll = useCallback(() => {
    composerRef?.current?.closePanels?.();
    setPollTitle("");
    setPollOptions(["", ""]);
    setPollMulti(false);
    setPollOpen(true);
  }, [composerRef]);

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

  const handleSendPoll = useCallback(async () => {
    if (!conversaId || pollSending) return;
    const title = String(pollTitle || "").trim();
    const options = [...new Set(pollOptions.map((o) => String(o || "").trim()).filter(Boolean))];
    if (!title) {
      showToast?.({ type: "error", title: "Enquete", message: "Informe a pergunta." });
      return;
    }
    if (options.length < 2) {
      showToast?.({ type: "error", title: "Enquete", message: "Informe ao menos 2 opções." });
      return;
    }
    setPollSending(true);
    try {
      const data = await enviarEnquete(conversaId, {
        title,
        options,
        count: pollMulti ? 0 : 1,
      });
      if (data?.ok === false) {
        throw Object.assign(new Error(data?.error || "Falha ao enviar enquete"), {
          response: { status: 422, data },
        });
      }
      setPollOpen(false);
      showToast?.({
        type: "success",
        title: "Enquete enviada",
        message: "A mensagem aparece na conversa quando o servidor confirmar. O voto do cliente chega como texto.",
      });
    } catch (err) {
      const status = err?.response?.status;
      const apiMsg = err?.response?.data?.error || err?.message;
      showToast?.({
        type: "error",
        title: status === 501 ? "Não disponível" : "Falha ao enviar enquete",
        message:
          apiMsg ||
          (status === 501
            ? "Enquetes exigem um canal Whapi conectado."
            : "Não foi possível enviar a enquete."),
      });
    } finally {
      setPollSending(false);
    }
  }, [conversaId, pollSending, pollTitle, pollOptions, pollMulti, showToast]);

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
