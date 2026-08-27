import { buildChatListFetchParams } from "../chatListQueryHelpers";

/**
 * Contrato da consulta da lista (params GET /chats).
 * O `load()` com AbortController/generation permanece no coordenador porque
 * o merge em `setChats`, cache de filtro e badges secundários estão acoplados
 * aos setters da tela. Resposta antiga nunca sobrescreve: `loadRequestIdRef`.
 */
export { buildChatListFetchParams };
