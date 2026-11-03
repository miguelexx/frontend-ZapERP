import { isOutgoingMessage } from "../../utils/conversaViewHelpers";
import { resolveTickState, temIdDoProvedor } from "../../../utils/messageTicks";

/*
 * A DECISÃO do tique mudou de casa: está em `utils/messageTicks.js`, partilhada com o card
 * da lista (`chats/ChatListRow.jsx`). Enquanto cada tela tinha a sua, a mesma mensagem saía
 * com ✓✓ aqui e ✓ no card — o módulo novo explica as quatro divergências.
 *
 * O que fica aqui é só a tradução para as classes da bolha. Não voltar a pôr regras de
 * status neste ficheiro: elas teriam de ser repetidas no card para as telas concordarem.
 */

export { temIdDoProvedor };

/**
 * Resolve o indicador de envio. Status é monotônico na UI: pending → sent →
 * delivered → read. Flag stale de offline não rebaixa um tick já confirmado.
 */
export function resolveOutgoingTick(msg, isGroup) {
  const st = resolveTickState(msg, { isGroup, out: isOutgoingMessage(msg) });
  if (!st) return null;

  const className = `wa-ticks ${st.isDelivered ? "isDelivered" : ""} ${st.isRead ? "isRead" : ""} ${st.isErr ? "isErr" : ""} ${st.isPending ? "isPending" : ""} ${st.isRetry ? "isPending isRetry" : ""} ${st.isDemorado ? "isDemorado" : ""}`;

  return { kind: st.kind, className, title: st.title };
}
