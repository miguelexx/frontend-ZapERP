import { useEffect, useRef } from "react";
import {
  canReprocessInboundMedia,
  requestInboundMediaReprocess,
} from "../utils/inboundMediaReprocess";
import { useConversaStore } from "../../conversaStore";

/**
 * Aplica a URL /uploads recuperada direto na store — cobre o caso em que a cópia já existe no
 * banco mas o `nova_mensagem` de atualização se perdeu (reconexão/corrida): o endpoint responde
 * `{ ok, url }` sem re-emitir socket, então quem atualiza a bolha somos nós. Espelha o patch que
 * o socket faria; `preserveLocalMediaFields` garante que /uploda tem prioridade sobre a URL antiga.
 */
function aplicarUrlNaStore(msg, url) {
  const u = String(url || "").trim();
  if (!u.startsWith("/uploads/")) return;
  const conversaId = Number(msg?.conversa_id ?? msg?.conversaId);
  const mensagemId = Number(msg?.id ?? msg?.mensagem_id);
  if (!Number.isSafeInteger(conversaId) || !Number.isSafeInteger(mensagemId)) return;
  try {
    useConversaStore.getState().patchMensagem(
      mensagemId,
      { url: u },
      { conversa_id: conversaId, preserveOrder: true }
    );
  } catch {
    /* best-effort; o socket ainda pode curar */
  }
}

/**
 * Auto-cura de mídia RECEBIDA que ainda não foi copiada para /uploads.
 *
 * A cópia automática (webhook → /uploads) roda no servidor e re-emite `nova_mensagem`
 * com a URL final; no caminho feliz a bolha se atualiza sozinha e este hook nunca dispara.
 * Mas esse 2º evento pode não chegar (reconexão de socket, corrida, versão antiga em
 * produção) e a bolha fica presa na URL do provedor (UltraMSG/Whapi/S3), que expira — era
 * o caso em que o usuário precisava dar F5 para pegar a versão em /uploads e só então
 * conseguir abrir o arquivo / ouvir o áudio.
 *
 * Aqui, passado um tempo curto (dando prioridade à cópia natural), pedimos a cópia via o
 * MESMO endpoint do botão "tentar de novo" (`reprocessar-midia`). Quando conclui, o backend
 * re-emite `nova_mensagem` com /uploads e a bolha se cura — sem recarregar a página.
 *
 * Garantias:
 *  - Só mídia RECEBIDA e persistida (id do banco) ainda fora de /uploads — `canReprocessInboundMedia`.
 *  - Idempotente: dedup por id entre remounts da lista virtual; nunca dispara em texto.
 *  - Sem custo no caminho feliz: assim que a URL vira /uploads, o efeito desliga.
 *  - Nunca toca socket/store diretamente; a atualização chega pelos canais já existentes.
 */

const DELAY_MS = 3500;
const RETRY_MS = 6000;
const MAX_TENTATIVAS = 3;

// Estado por sessão, fora do React (sobrevive ao remount da linha virtualizada).
const curadas = new Set(); // resolvido (ok ou expirado) — não repetir
const emAndamento = new Set(); // requisição em voo — evita concorrência entre remounts
const tentativas = new Map(); // id -> nº de tentativas transitórias já feitas

export function useInboundMediaAutoHeal(msg, out, isMediaBubble) {
  const id = Number(msg?.id ?? msg?.mensagem_id);
  const url = String(msg?.url || "").trim();
  const elegivel = Boolean(isMediaBubble) && canReprocessInboundMedia(msg, out);

  // `msg` muda de referência a cada re-render (status, reações…); guardá-lo num ref evita que o
  // efeito — e o timer de 3.5s — reinicie a cada render. O efeito só reage a id/url/elegibilidade.
  const msgRef = useRef(msg);
  msgRef.current = msg;

  useEffect(() => {
    if (!elegivel) return undefined;
    if (!Number.isSafeInteger(id) || id <= 0) return undefined;
    if (url.startsWith("/uploads/")) return undefined;
    if (curadas.has(id) || emAndamento.has(id)) return undefined;

    let cancelled = false;
    let timer = null;

    const tentar = async () => {
      if (cancelled || curadas.has(id) || emAndamento.has(id)) return;
      emAndamento.add(id);
      let r;
      try {
        r = await requestInboundMediaReprocess(msgRef.current);
      } catch {
        r = { ok: false, definitivo: false };
      } finally {
        emAndamento.delete(id);
      }
      if (cancelled) return;
      // ok → curou; se veio a URL, aplica na store (caso o socket de atualização se perca).
      if (r?.ok) {
        if (r.url) aplicarUrlNaStore(msgRef.current, r.url);
        curadas.add(id);
        return;
      }
      // definitivo → expirou de vez no provedor; não adianta insistir.
      if (r?.definitivo) {
        curadas.add(id);
        return;
      }
      // Transitório (rede/lock/allowlist): tenta de novo, com teto.
      const n = (tentativas.get(id) || 0) + 1;
      tentativas.set(id, n);
      if (n < MAX_TENTATIVAS) {
        timer = setTimeout(tentar, RETRY_MS);
      } else {
        // Desiste em silêncio; o botão manual (áudio "tentar de novo" / documento) segue disponível.
        curadas.add(id);
      }
    };

    timer = setTimeout(tentar, DELAY_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [elegivel, id, url]);
}
