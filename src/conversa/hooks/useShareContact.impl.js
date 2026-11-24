import { moverParaMinhaFilaSeEnvioVeioDaBusca } from "../conversaOptimisticMessage";
import { enviarContato } from "../conversaService";
import * as cfg from "../../api/configService";
import { safeString } from "../utils/conversaViewHelpers";
import { useChatStore } from "../../chats/chatsStore";

/**
 * Corpo do compartilhamento de contato (fora do chunk crítico — ver lazyHookImpl.js).
 */

/** Chave de identidade tolerante ao 9º dígito: DDD + os 8 últimos dígitos. */
function chaveTelefone(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const semPais = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (semPais.length < 10) return null;
  return `${semPais.slice(0, 2)}${semPais.slice(-8)}`;
}

/**
 * Completa foto/nome com o que a lista de conversas já tem em memória.
 *
 * `clientes.foto_perfil` fica vazio para quem nasceu de um inbound (o webhook não traz
 * foto) e para quem nunca passou pelo "Sincronizar fotos" — mas a conversa do mesmo
 * contato costuma carregar a foto e o nome em cache. Como a lista já está no store, isto
 * é de graça: nenhuma chamada nova. Quem não tem conversa segue com as iniciais.
 */
function enriquecerComConversas(clientes) {
  let chats = null;
  try {
    chats = useChatStore.getState?.()?.chats;
  } catch (_) {
    chats = null;
  }
  if (!Array.isArray(chats) || chats.length === 0) return clientes;

  const porCliente = new Map();
  const porTelefone = new Map();
  chats.forEach((c) => {
    const foto =
      (c?.foto_perfil && String(c.foto_perfil).trim()) ||
      (c?.foto_perfil_contato_cache && String(c.foto_perfil_contato_cache).trim()) ||
      null;
    const nome = safeString(c?.contato_nome || c?.nome_contato_cache).trim() || null;
    if (!foto && !nome) return;
    const dado = { foto, nome };
    if (c?.cliente_id != null && !porCliente.has(String(c.cliente_id))) {
      porCliente.set(String(c.cliente_id), dado);
    }
    const k = chaveTelefone(c?.telefone_exibivel ?? c?.telefone);
    if (k && !porTelefone.has(k)) porTelefone.set(k, dado);
  });
  if (porCliente.size === 0 && porTelefone.size === 0) return clientes;

  return clientes.map((cli) => {
    const temFoto = !!(cli?.foto_perfil && String(cli.foto_perfil).trim());
    const temNome = !!safeString(cli?.nome).trim() && /\p{L}/u.test(String(cli.nome));
    if (temFoto && temNome) return cli;
    const dado =
      porCliente.get(String(cli?.id)) || porTelefone.get(chaveTelefone(cli?.telefone)) || null;
    if (!dado) return cli;
    const out = { ...cli };
    if (!temFoto && dado.foto) out.foto_perfil = dado.foto;
    if (!temNome && dado.nome && /\p{L}/u.test(dado.nome)) out.nome = dado.nome;
    return out;
  });
}

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
        const arr = enriquecerComConversas(Array.isArray(list) ? list : []);
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
      setShareContactList(enriquecerComConversas(Array.isArray(list) ? list : []));
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
      moverParaMinhaFilaSeEnvioVeioDaBusca(conversaId);
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
