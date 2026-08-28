# Lista de conversas

> 2026-08-23 · `src/chats/`. Caminho quente de render. Leia isto antes de tocar em filtro, unread, preview ou “a lista não atualiza”.

## Store `chatsStore.js` (CONFIRMADO)

Estado: `chats`, `loading`, nonces de scroll/resync, flag de mutação otimista.

Actions que importam: `setChats`, `addChat` (upsert; preserva nome/foto/unread; remove placeholder `sem_conversa` do mesmo cliente+instância), `updateChat` (**não cria** row — anti-vazamento de setor), `updateChatContato` / `SeVazio`, tags, `setUltimaMensagem` / `EBump` / `bumpChatToTop`, `setUnread` / `incUnread` / `incUnreadComBadge` / `clearUnread`, `removeChat`, `requestChatListResync` (debounce ~180ms, teto ~700ms), `requestChatListScrollToTop`, `emitChatListOptimisticMutation`.

Dedupe de row: `chatRowStableKey.js` → `conv:{id}` ou escopo `whatsapp_instance_id` + cliente/telefone.

## Componentes

| Arquivo | Papel |
|---------|--------|
| `chatList.jsx` | coordenador: load, cache, seleção, badges, UI |
| `ChatListBody.jsx` | único subscriber pesado de `chats`; memo |
| `ChatListRows.jsx` / `ChatListRowsPane.jsx` | janela de rows |
| `ChatListRow.jsx` | `memo(..., chatRowPropsAreEqual)` |
| `ChatListSearchBox.jsx` | input isolado (digitação **não** re-renderiza a lista) |
| Header/Toolbar/AdvancedFilters | UI de filtros |
| `hooks/useChatListFilterState.js` | estado serializável (abas, busca, avançados); `useChatListFilters.js` continua o compute in-memory no Body |
| `hooks/useWhatsappInstanceStatus.js` | banner WhatsApp desconectado (`GET /chats/zapi-status`, nome legado) |
| `hooks/useChatListPagination.js` | carregar mais + auto-avanço de página vazia |
| `hooks/useChatListResync.js` | nonce do store (debounce no **store**, não no hook), refresh 5 min, `zapi_sync_contatos` |
| `hooks/useChatListCounts.js` | deriva números dos chips a partir de `chatFilterCounts` já carregados |
| `chatListQueryHelpers.js` | `buildChatListFetchParams`, merge/dedupe/página |

## Modularização do coordenador (CONFIRMADO 2026-08-27)

`chatList.css`, `chatsStore.js`, comparadores, cache lateral, virtualização, Socket.IO, regras de fila e payloads **não** foram alterados.

- Status das instâncias: timers/delay mobile/foco iguais; banner no coordenador.
- Filtros: significado intacto; troca de filtro ainda zera `pagesLoaded` para 1 no efeito de `filterRequestKey`.
- Busca: com termo, `incluir_todos_clientes=1` e a aba **não** restringe o GET (B01). Generation `loadRequestIdRef` impede resposta antiga.
- Paginação: limites 80/40, preserve max pages, AbortController no load more.
- Resync: se `load()` está em voo, enfileira `{ background: true }` (última atualização após o voo).
- Contadores/filas: fetchers (`refreshChatFilterCounts`, badges) permanecem no coordenador nesta etapa; `useChatListCounts` só deriva UI.

`load()` HTTP ainda vive no coordenador (merge `setChats` + cache + badges secundários).

## Filtros, tabs, paginação, busca (CONFIRMADO)

Tabs em `chatListFilters.js` (exemplos): `minha_fila`, `abertas`, `em_atendimento`, `aguardando_*`, `pagamentos_pendentes`, `em_atraso`, …

Página: **80** desktop / **40** mobile (`CHAT_LIST_*_PAGE_LIMIT`). Cursor: `hasMore`, `nextCursor`, `nextCursorId` via `fetchChats` / `fetchChatsPages`.

Busca: termo local no filho → debounce no pai → refetch ou filtro. Admin: `AdminAtendenteFilter`. Match por nome principal ou nome vinculado (`encontrado_por` discreto no card; o título continua o nome principal).

## Cache de sidebar — `chatListSidebarCache.js`

| Função | TTL / limite |
|--------|----------------|
| hydrate/persist sidebar session | ~2 min; máx. ~400 rows |
| hydrate/persist rows por filtro | ~45 s por filtro |
| `sanitizeChatRowForSidebarCache` | metadados + preview curto (**sem** thread) |

Scope key: empresa + usuário. É stale-while-revalidate, não fonte de verdade.

## Performance da lista (obrigatório preservar)

- `chatListRowCompare.js`: `chatRowPropsAreEqual`, preview key, contact surface key.
- Não assinar `chats` inteiro em Header/Search/Row isolada.
- Não ordenar array novo a cada socket se o compare diz que nada mudou.
- Resync por nonce, não “fetchChats() em todo evento”.
- Boot mobile: atrasar status Z-API (nome legado), counts, filtros pesados.

HTTP: `chats/chatService.js`, `conversationActionsService.js`, `whatsappInstancesService.js`, `minhasPendenciasService.js`.

Socket que mexe na lista: `nova_mensagem`, `nova_conversa`, `conversa_atualizada` / `atualizar_conversa`, `conversa_apagada` / `encerrada` / `transferida` / `reaberta` / `atribuida`, tags, `contato_atualizado`. Sempre `shouldIgnoreByCompany` antes.

## Invariantes

- Unread só em inbound (`direcao` in / `fromMe` false).
- Preview da última mensagem não usa nome vazio do outbound.
- Setor: socket não “inventa” conversa invisível; `addChatIfAuthorized`.
- Fechar atendimento na API remove/atualiza row; fechar thread na UI não.
