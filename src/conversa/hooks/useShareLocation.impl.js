import { enviarLocalizacao } from "../conversaService";

/**
 * Corpo do envio de localização (fora do chunk crítico — ver lazyHookImpl.js).
 * `ctx` é o snapshot do hook casca no momento do clique.
 */
export async function handleEnviarLocalizacao(ctx) {
  const {
    conversaId,
    shareLocationSending,
    shareLocationLat,
    shareLocationLng,
    shareLocationNome,
    shareLocationEndereco,
    showToast,
    setShareLocationOpen,
    setShareLocationGeoError,
    setShareLocationSending,
  } = ctx;
  if (!conversaId || shareLocationSending) return;
  const la = Number(String(shareLocationLat).replace(",", "."));
  const ln = Number(String(shareLocationLng).replace(",", "."));
  if (!Number.isFinite(la) || !Number.isFinite(ln)) {
    showToast({
      type: "error",
      title: "Coordenadas inválidas",
      message: "Informe latitude e longitude válidas.",
    });
    return;
  }
  setShareLocationSending(true);
  try {
    const data = await enviarLocalizacao(conversaId, {
      lat: la,
      lng: ln,
      nome: shareLocationNome.trim() || undefined,
      endereco: shareLocationEndereco.trim() || undefined,
    });
    if (data?.ok === false) {
      throw Object.assign(new Error(data?.error || data?.motivo || "Falha ao enviar localização"), {
        response: { status: 502, data },
      });
    }
    setShareLocationOpen(false);
    setShareLocationGeoError(null);
    showToast({
      type: "success",
      title: "Localização enviada",
      message: "A mensagem aparecerá na conversa quando o servidor confirmar.",
    });
  } catch (err) {
    console.error("Erro ao enviar localização:", err);
    const is403 = err?.response?.status === 403;
    const apiMsg = err?.response?.data?.error || err?.response?.data?.motivo || err?.message;
    showToast({
      type: "error",
      title: is403 ? "Acesso restrito" : "Falha ao enviar localização",
      message:
        apiMsg ||
        (is403 ? "Assuma a conversa antes de enviar mensagens." : "Não foi possível enviar a localização."),
    });
  } finally {
    setShareLocationSending(false);
  }
}
