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

Tabs em `chatListFilters.js` (exemplos): `minha_fila`, `campanhas`, `abertas`, `em_atendimento`, `aguardando_*`, `pagamentos_pendentes`, `em_atraso`, …

O filtro **Campanhas** (`GET /chats?campanhas=1`) só aparece se `user.modulo_campanhas_ativo === true` (admin ativa em Configurações → Geral com senha + botão **Ativar**; a flag no `authStore` atualiza o chip sem F5). Lista só conversas com `aguardando_resposta_campanha=true` (disparo enviado, contato ainda não respondeu). Não reutiliza `mensagem_disparada` de envio pelo celular. Na primeira resposta inbound a flag é limpa, a conversa fica **aberta sem atendente** para quem estiver disponível assumir; chatbot/URA/boas-vindas não rodam. Atendimento humano já ativo (`em_atendimento` / `aguardando_cliente` / financeiro) não é reclassificado. Com o módulo off, `campanhas=1` devolve lista vazia e o contador fica 0.

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

## Pertinência em tempo real (CONFIRMADO 2026-09-01)

Finalizar (e reabrir/transferir) não pode deixar a row no chip errado até um F5.

Causas fechadas neste ciclo:

1. Abas de fila não refiltrava status no client — GET antigo + cache de aba (memória até 15 min) reapresentava a conversa fechada.
2. Hide otimista só com `mutation.type === "encerrar_conversa"`; o eco socket não tinha `type` e `patchEverywhere` podia **reinserir** a fechada via `addChatIfAuthorized`.
3. `requestChatListResync` era ignorado se `updateChat` fosse noop, e o throttle de 2,5s do `useChatListResync` engolia o GET logo após um load.
4. `mergeEmAtendimentoBackgroundRows` preservava rows do cache com status antigo.
5. `atualizar_conversa` fazia `fetchChatById` + `addChat` e recolocava a fechada na aba atual.
6. `nova_mensagem` / `addChatIfAuthorized` inseriam qualquer conversa autorizada no array da aba ativa; o GET seguinte tirava — “aparece e some”. Resync em background substituía a lista e apagava quem ainda pertencia.
7. Revisão 2026-09-01: `atualizar_conversa` chegou a usar `wasInList`/`closed` sem declarar — o `catch` pedia GET da aba a cada evento (o flicker voltava). `conversa_atualizada` tratava “não está na lista” como mudança da lista. Payload sem `status` não pode tirar da Minha fila.

Contrato atual:

- `chatRowIsStaleForTab` / `computeChatsFiltrados` exclui fechada das abas de fila e também status claramente alheio (`aberta` / `aguardando_cliente` em Em atendimento, etc.).
- Socket só insere row se `shouldInsertChatRowInActiveList` (aba + busca). Já na lista: só `updateChat`. Em atendimento só insere `status=em_atendimento` com atendente; Aguardando funcionário só insere se o id estiver no set de pendentes (não por lastDir).
- Resync da aba **não** dispara só porque outra conversa atualizou. Dispara se inseriu na aba, se a row visível saiu do recorte, ou `lista_realtime` força.
- Resync **background** usa `mergeActiveTabBackgroundRows`: mantém quem ainda pertence e não veio na página; descarta fantasma.
- `chatsStore.chatListActiveTab` / `chatListSearchActive` dizem ao socket qual recorte está na tela. Default da store é `minha_fila` até o `ChatList` montar.
- Tombstone de IDs (TTL 90s) vale na hidratação de cache e no merge; `removeChatIdFromFilterRowCaches` limpa as outras abas.
- Encerrar/reabrir/assumir/transferir usam `requestChatListResync({ force: true })`.
- `mergeChatRowListaAtividade` preserva membership se `ui_status_optimistic_at` local for mais novo que o do GET.

Busca com termo continua global. Fechar a thread na UI continua ≠ encerrar.

## Melhorias anotadas (não alteradas)

- Cache em memória das rows por filtro ainda tem TTL de 15 min (sessionStorage 45 s). Não encolhemos o TTL — troca de aba continuaria a piscar; a correção foi remover o id das snapshots ao finalizar.
- `useChatListResync` só faz `clearChatListRowsFilterSessionCache` no mobile. No desktop a limpeza agora é cirúrgica no encerrar.
- Contadores dos chips (`GET /chats/counts`) ainda dependem do resync; podem atrasar um tick em relação à lista.
- Filtro admin “por funcionário” continua sem `status_atendimento` na query da maioria das abas; a exclusão de fechada no client cobre o fantasma, não o GET amplo.
- `mergeChatRowsPreservingCurrent` na paginação (“carregar mais”) não foi mexido — risco residual só se a página extra trouxer a fechada de volta (o tombstone + `chatRowIsStaleForTab` ainda escondem).
- `getActiveChatListView()` no socket não leva `adminAtendenteFilterId` nem `pendentesFuncionarioSet`; insert em Em atendimento no modo admin-por-funcionário pode ser mais largo que o GET. Aguardando funcionário, sem o set, **não** insere.
- Validação no browser (login + tráfego realtime nos chips) permanece **PENDENTE DE VALIDAÇÃO**.

## Invariantes

- Unread só em inbound (`direcao` in / `fromMe` false).
- Preview da última mensagem não usa nome vazio do outbound.
- Setor: socket não “inventa” conversa invisível; `addChatIfAuthorized`.
- Fechar atendimento na API remove/atualiza row; fechar thread na UI não.
- Foto: não limpar URL http válida. `contato_atualizado` / `conversa_atualizada` **podem** trocar a URL se a nova for http diferente (correção de foto trocada). Não usar `msg.photo` (mídia) como avatar.
