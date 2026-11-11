import { enviarEnquete } from "../conversaService";

/**
 * Corpo do envio de enquete (fora do chunk crítico — ver lazyHookImpl.js).
 * `ctx` é o snapshot do hook casca no momento do clique.
 */
export async function handleSendPoll(ctx) {
  const { conversaId, pollSending, pollTitle, pollOptions, pollMulti, showToast, setPollOpen, setPollSending } = ctx;
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
}
