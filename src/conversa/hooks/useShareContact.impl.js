import { enviarContato } from "../conversaService";
import * as cfg from "../../api/configService";
import { safeString } from "../utils/conversaViewHelpers";

/**
 * Corpo do compartilhamento de contato (fora do chunk crítico — ver lazyHookImpl.js).
 */

/**
 * Efeito de busca debounced enquanto o modal está aberto. Devolve o cleanup.
 * Guard de corrida: uma busca antiga que resolve depois não pode sobrescrever a lista
 * da busca mais recente (o clearTimeout só cancela o timer, não o GET já disparado).
 */
export function runShareContactSearch({ shareContactQuery, setShareContactList, setShareContactLoading }) {
  const q = safeString(shareContactQuery).trim().toLowerCase();
  setShareContactLoading(true);
  let cancelled = false;
  const t = setTimeout(async () => {
    try {
      const list = await cfg.getClientes({ palavra: q || undefined, limit: 60 });
      if (cancelled) return;
      const arr = Array.isArray(list) ? list : [];
      setShareContactList(arr);
    } catch (e) {
      if (cancelled) return;
      console.error("Erro ao buscar contatos:", e);
      setShareContactList([]);
    } finally {
      if (!cancelled) setShareContactLoading(false);
    }
  }, 260);
  return () => {
    cancelled = true;
    clearTimeout(t);
  };
}

/** `ctx` é o snapshot do hook casca no momento do clique. */
export async function handleShareContactSelect(ctx, c) {
  const {
    conversaId,
    shareContactSending,
    showToast,
    setShareContactOpen,
    setShareContactQuery,
    setShareContactList,
    setShareContactSending,
  } = ctx;
  if (!conversaId || shareContactSending) return;
  setShareContactSending(true);
  try {
    const data = await enviarContato(conversaId, c.id);
    // Sucesso somente com aceite válido (ok !== false e status ≠ erro).
    if (data?.ok === false) {
      throw Object.assign(new Error(data?.error || data?.motivo || "Falha ao enviar contato"), {
        response: { status: 502, data },
      });
    }
    setShareContactOpen(false);
    setShareContactQuery("");
    setShareContactList([]);
    showToast({
      type: "success",
      title: "Contato enviado",
      message: "O contato foi compartilhado na conversa.",
    });
  } catch (err) {
    console.error("Erro ao enviar contato:", err);
    const is403 = err?.response?.status === 403;
    const apiMsg = err?.response?.data?.error || err?.response?.data?.motivo || err?.message;
    showToast({
      type: "error",
      title: is403 ? "Acesso restrito" : "Falha ao enviar contato",
      message:
        apiMsg ||
        (is403 ? "Assuma a conversa antes de enviar mensagens." : "Não foi possível enviar o contato."),
    });
  } finally {
    setShareContactSending(false);
  }
}
