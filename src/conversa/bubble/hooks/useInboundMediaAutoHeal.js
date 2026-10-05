import { useEffect, useRef } from "react";
import {
  canReprocessInboundMedia,
  requestInboundMediaReprocess,
} from "../utils/inboundMediaReprocess";
// A URL recuperada chega à store por `requestInboundMediaReprocess` (patch centralizado lá,
// cobrindo também o botão manual do áudio/documento quando o socket de atualização se perde).

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
    // /media/r2/ é URL final (mídia migrada ao Cloudflare R2) — tão curada quanto /uploads;
    // sem esta guarda cada bolha R2 disparava um reprocesso inútil no mount.
    if (url.startsWith("/uploads/") || url.startsWith("/media/r2/")) return undefined;
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
      // ok → curou (a URL chega pela store via requestInboundMediaReprocess e/ou pelo socket).
      if (r?.ok) {
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
