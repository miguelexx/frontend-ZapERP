import { enviarContato } from "../conversaService";
import * as cfg from "../../api/configService";
import { safeString } from "../utils/conversaViewHelpers";

/**
 * Corpo do compartilhamento de contato (fora do chunk crítico — ver lazyHookImpl.js).
 */

/**
 * Efeito de busca debounced enquanto o modal está aberto. Devolve o cleanup.
 *
 * Sem termo (ou com 1 letra), mostra a agenda inteira — carregada UMA vez e guardada
 * em `allContatosRef`, para reabrir o modal não custar viagem. Com 2+ letras, busca no
 * servidor (acento-insensível, nome/telefone).
 *
 * Guard de corrida: uma busca antiga que resolve depois não pode sobrescrever a lista
 * da busca mais recente (o clearTimeout só cancela o timer, não o GET já disparado).
 */
export function runShareContactSearch({
  shareContactQuery,
  allContatosRef,
  setShareContactList,
  setShareContactLoading,
}) {
  const q = safeString(shareContactQuery).trim();
  let cancelled = false;

  if (q.length < 2) {
    const cached = allContatosRef?.current;
    if (Array.isArray(cached)) {
      setShareContactList(cached);
      setShareContactLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setShareContactLoading(true);
    const t0 = setTimeout(async () => {
      try {
        const list = await cfg.getClientes({ limit: 500 });
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        if (allContatosRef) allContatosRef.current = arr;
        setShareContactList(arr);
      } catch (e) {
        if (cancelled) return;
        console.error("Erro ao buscar contatos:", e);
        setShareContactList([]);
      } finally {
        if (!cancelled) setShareContactLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t0);
    };
  }

  setShareContactLoading(true);
  const t = setTimeout(async () => {
    try {
      const list = await cfg.getClientes({ palavra: q.toLowerCase(), limit: 60 });
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

/** Mensagem de erro legível de uma falha de envio. */
function motivoDoErro(err) {
  const is403 = err?.response?.status === 403;
  const apiMsg = err?.response?.data?.error || err?.response?.data?.motivo || err?.message;
  return (
    apiMsg ||
    (is403 ? "Assuma a conversa antes de enviar mensagens." : "Não foi possível enviar o contato.")
  );
}

/**
 * Envia N contatos na conversa. O endpoint aceita um por requisição, então vai em
 * sequência (ordem previsível na thread, sem rajada no provider).
 * `ctx` é o snapshot do hook casca no momento do clique.
 */
export async function handleShareContactSend(ctx, contatos) {
  const {
    conversaId,
    shareContactSending,
    showToast,
    setShareContactOpen,
    setShareContactQuery,
    setShareContactList,
    setShareContactSelected,
    setShareContactSending,
  } = ctx;
  const lista = (Array.isArray(contatos) ? contatos : []).filter((c) => c && c.id != null);
  if (!conversaId || shareContactSending || lista.length === 0) return;

  setShareContactSending(true);
  const enviados = [];
  const falhas = [];
  try {
    for (const c of lista) {
      try {
        const data = await enviarContato(conversaId, c.id);
        // Sucesso somente com aceite válido (ok !== false e status ≠ erro).
        if (data?.ok === false) {
          throw Object.assign(new Error(data?.error || data?.motivo || "Falha ao enviar contato"), {
            response: { status: 502, data },
          });
        }
        enviados.push(c);
      } catch (err) {
        console.error("Erro ao enviar contato:", err);
        falhas.push({ contato: c, motivo: motivoDoErro(err), err });
      }
    }

    if (falhas.length === 0) {
      setShareContactOpen(false);
      setShareContactQuery("");
      setShareContactList([]);
      setShareContactSelected?.([]);
      showToast({
        type: "success",
        title: enviados.length > 1 ? "Contatos enviados" : "Contato enviado",
        message:
          enviados.length > 1
            ? `${enviados.length} contatos foram compartilhados na conversa.`
            : "O contato foi compartilhado na conversa.",
      });
      return;
    }

    // Parcial ou total: o modal fica aberto com o que falhou ainda marcado.
    setShareContactSelected?.(falhas.map((f) => f.contato));
    const primeira = falhas[0];
    const is403 = primeira?.err?.response?.status === 403;
    showToast({
      type: enviados.length > 0 ? "warning" : "error",
      title:
        enviados.length > 0
          ? `${enviados.length} de ${lista.length} enviados`
          : is403
          ? "Acesso restrito"
          : "Falha ao enviar contato",
      message:
        falhas.length === 1
          ? primeira.motivo
          : `${falhas.length} contatos não foram enviados. ${primeira.motivo}`,
    });
  } finally {
    setShareContactSending(false);
  }
}

/** Compat: nome antigo (um contato por clique). */
export async function handleShareContactSelect(ctx, c) {
  return handleShareContactSend(ctx, [c]);
}
