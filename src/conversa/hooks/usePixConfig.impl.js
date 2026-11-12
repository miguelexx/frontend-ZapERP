import { getPixConfig, putPixConfig, enviarMensagemPix } from "../conversaService";
import { safeString } from "../utils/conversaViewHelpers";

/**
 * Corpo da configuração/envio de Pix (fora do chunk crítico — ver lazyHookImpl.js).
 * `ctx` é o snapshot do hook casca no momento do clique.
 */

export function isPixConfigured(cfgData) {
  if (!cfgData || typeof cfgData !== "object") return false;
  const tipo = safeString(cfgData.tipo_chave).toLowerCase();
  const chave = safeString(cfgData.chave_pix);
  const nome = safeString(cfgData.nome_recebedor);
  return !!tipo && !!chave && !!nome;
}

export function applyPixConfigToForm(ctx, cfgData) {
  const next = cfgData && typeof cfgData === "object" ? cfgData : {};
  ctx.setPixTipoChave(safeString(next.tipo_chave).toLowerCase() || "cpf");
  ctx.setPixChave(safeString(next.chave_pix));
  ctx.setPixNomeRecebedor(safeString(next.nome_recebedor));
  ctx.setPixMensagemPadrao(safeString(next.mensagem_padrao));
}

export async function fetchPixConfigIfNeeded(ctx) {
  const { pixConfigLoading, showToast, setPixConfigLoading, setPixConfigLoaded } = ctx;
  if (pixConfigLoading) return null;
  setPixConfigLoading(true);
  try {
    const payload = await getPixConfig();
    const config = payload?.config && typeof payload.config === "object" ? payload.config : null;
    if (config) applyPixConfigToForm(ctx, config);
    setPixConfigLoaded(true);
    return config;
  } catch (err) {
    console.error("Erro ao carregar Pix:", err);
    showToast({
      type: "error",
      title: "Pix",
      message: "Não foi possível carregar a configuração Pix da empresa.",
    });
    return null;
  } finally {
    setPixConfigLoading(false);
  }
}

export async function handleSalvarPixConfig(ctx, opts = {}) {
  const {
    pixConfigSaving,
    pixTipoChave,
    pixChave,
    pixNomeRecebedor,
    pixMensagemPadrao,
    showToast,
    setPixConfigSaving,
    setPixConfigLoaded,
    setPixModalOpen,
  } = ctx;
  if (pixConfigSaving) return false;
  const payload = {
    tipo_chave: safeString(pixTipoChave).toLowerCase(),
    chave_pix: safeString(pixChave),
    nome_recebedor: safeString(pixNomeRecebedor),
    mensagem_padrao: safeString(pixMensagemPadrao) || null,
  };
  if (!payload.chave_pix || !payload.nome_recebedor) {
    showToast({
      type: "warning",
      title: "Pix",
      message: "Preencha tipo, chave e nome do recebedor.",
    });
    return false;
  }
  setPixConfigSaving(true);
  try {
    const data = await putPixConfig(payload);
    const saved = data?.config || payload;
    applyPixConfigToForm(ctx, saved);
    setPixConfigLoaded(true);
    showToast({
      type: "success",
      title: "Pix configurado",
      message: "Os dados Pix foram salvos com sucesso.",
    });
    if (opts?.closeModal !== false) setPixModalOpen(false);
    return true;
  } catch (err) {
    console.error("Erro ao salvar Pix:", err);
    showToast({
      type: "error",
      title: "Pix",
      message: err?.response?.data?.error || "Não foi possível salvar os dados Pix.",
    });
    return false;
  } finally {
    setPixConfigSaving(false);
  }
}

export async function handlePixMenuClick(ctx) {
  const {
    conversaId,
    sending,
    pixActionBusy,
    podeEnviar,
    pixTipoChave,
    pixChave,
    pixNomeRecebedor,
    pixMensagemPadrao,
    pixConfigLoaded,
    showToast,
    setPixActionBusy,
    setPixModalOpen,
  } = ctx;
  if (!conversaId || sending || pixActionBusy || !podeEnviar) return;
  // `composerRef.closePanels()` ficou na casca (síncrono no clique).
  setPixActionBusy(true);
  try {
    const localCfg = {
      tipo_chave: pixTipoChave,
      chave_pix: pixChave,
      nome_recebedor: pixNomeRecebedor,
      mensagem_padrao: pixMensagemPadrao,
    };
    let cfgToUse = isPixConfigured(localCfg) ? localCfg : null;
    if (!cfgToUse || !pixConfigLoaded) {
      const fetched = await fetchPixConfigIfNeeded(ctx);
      if (fetched && isPixConfigured(fetched)) cfgToUse = fetched;
    }
    if (!cfgToUse || !isPixConfigured(cfgToUse)) {
      setPixModalOpen(true);
      return;
    }
    // Backend monta e envia: cartão nativo com "Copiar chave Pix" (Whapi) ou texto (UltraMSG).
    // A bolha chega pela conversa via socket, como enquete/produto.
    const data = await enviarMensagemPix(conversaId);
    if (data?.ok === false) {
      throw Object.assign(new Error(data?.error || "Falha ao enviar Pix"), {
        response: { status: 422, data },
      });
    }
  } catch (err) {
    showToast({
      type: "error",
      title: "Pix",
      message:
        err?.response?.data?.error ||
        err?.message ||
        "Não foi possível enviar a chave Pix.",
    });
  } finally {
    setPixActionBusy(false);
  }
}
