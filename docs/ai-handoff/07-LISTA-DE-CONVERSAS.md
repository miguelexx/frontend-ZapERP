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
- Contadores/filas: `refreshChatFilterCounts` (GET `/chats/counts`) no coordenador; `useChatListCounts` só deriva UI. Sem GET paralelo de badges.

`load()` HTTP ainda vive no coordenador (merge `setChats` + cache + badges secundários).

## Filtros, tabs, paginação, busca (CONFIRMADO)

Tabs em `chatListFilters.js` (exemplos): `minha_fila`, `campanhas`, `abertas`, `em_atendimento`, `aguardando_*`, `pagamentos_pendentes`, `em_atraso`, …

O filtro **Campanhas** (`GET /chats?campanhas=1`) só aparece se `user.modulo_campanhas_ativo === true` (admin ativa em Configurações → Geral com senha + botão **Ativar**; a flag no `authStore` atualiza o chip sem F5). Lista só conversas com `aguardando_resposta_campanha=true` (disparo enviado, contato ainda não respondeu). Não reutiliza `mensagem_disparada` de envio pelo celular. Na primeira resposta inbound a flag é limpa, a conversa fica **aberta sem atendente** para quem estiver disponível assumir; chatbot/URA/boas-vindas não rodam. Atendimento humano já ativo (`em_atendimento` / `aguardando_cliente` / financeiro) não é reclassificado. Com o módulo off, `campanhas=1` devolve lista vazia e o contador fica 0.

Página: **80** desktop / **40** mobile (`CHAT_LIST_*_PAGE_LIMIT`). Cursor: `hasMore`, `nextCursor`, `nextCursorId` via `fetchChats` / `fetchChatsPages`.

Busca: termo local no filho → debounce no pai → refetch ou filtro. Admin: `AdminAtendenteFilter`. Match por nome principal ou nome vinculado (`encontrado_por` discreto no card; o título continua o nome principal).

**Busca na Minha fila (corrigida em 2026-09-02):** termo não vazio usa GET global autorizado, sem `minha_fila=1` nem filtragem pela aba na resposta, no cache ou na paginação. O rodapé de paginação funciona durante a busca. Filtros explícitos, inclusive funcionário, permanecem. Sem busca, a fila continua buscando todas as páginas. Validação e limites em `../audits/correcoes-busca-teclado-status-midia-2026-09-02.md`.

## Cache de sidebar — `chatListSidebarCache.js`

| Função | TTL / limite |
|--------|----------------|
| hydrate/persist sidebar session | ~2 min; máx. ~400 rows |
| hydrate/persist rows por filtro | 45 s em memória e sessionStorage; reidratar não renova a idade |
| `sanitizeChatRowForSidebarCache` | metadados + preview curto (**sem** thread) |

Scope key: empresa + usuário. É stale-while-revalidate, não fonte de verdade.

**Invalidação (2026-09-02):** resync limpa os filtros do escopo em desktop e mobile. Eventos de dados da lista e reconexão invalidam também quando a lista não está montada. GET principal e paginação capturam uma revisão do cache: uma resposta iniciada antes da invalidação não pode gravar novamente o snapshot. Logout limpa memória e sessão; vazio conhecido continua diferente de cache ausente.

**Hint (2026-09-02):** mostra o total informado pela consulta sem aumentá-lo para igualar os cards. Se existem 6 cards e o total é 2, mostra `6 de 2`. Mantidos os estados de carga/busca e a apresentação por funcionário.

## Performance da lista (obrigatório preservar)

- `chatListRowCompare.js`: `chatRowPropsAreEqual`, preview key, contact surface key.
- Não assinar `chats` inteiro em Header/Search/Row isolada.
- Não ordenar array novo a cada socket se o compare diz que nada mudou.
- Resync por nonce, não “fetchChats() em todo evento”.
- Boot mobile: atrasar status Z-API (nome legado), counts, filtros pesados.

HTTP: `chats/chatService.js`, `conversationActionsService.js`, `whatsappInstancesService.js`, `minhasPendenciasService.js`.

Socket que mexe na lista: `nova_mensagem`, `nova_conversa`, `conversa_atualizada` / `atualizar_conversa`, `conversa_apagada` / `encerrada` / `transferida` / `reaberta` / `atribuida`, tags, `contato_atualizado`. Sempre `shouldIgnoreByCompany` antes.

## Pertinência em tempo real (CONFIRMADO 2026-09-01; P0 2026-09-01)

Finalizar (e reabrir/transferir) não pode deixar a row no chip errado até um F5.

Causas fechadas neste ciclo:

1. Abas de fila não refiltrava status no client — GET antigo + cache de aba (memória até 15 min) reapresentava a conversa fechada.
2. Hide otimista só com `mutation.type === "encerrar_conversa"`; o eco socket não tinha `type` e `patchEverywhere` podia **reinserir** a fechada via `addChatIfAuthorized`.
3. `requestChatListResync` era ignorado se `updateChat` fosse noop, e o throttle de 2,5s do `useChatListResync` engolia o GET logo após um load.
4. `mergeEmAtendimentoBackgroundRows` preservava rows do cache com status antigo.
5. `atualizar_conversa` fazia `fetchChatById` + `addChat` e recolocava a fechada na aba atual.
6. `nova_mensagem` / `addChatIfAuthorized` inseriam qualquer conversa autorizada no array da aba ativa; o GET seguinte tirava — “aparece e some”. Resync em background substituía a lista e apagava quem ainda pertencia.
7. `atualizar_conversa` chegou a usar `wasInList`/`closed` sem declarar — o `catch` pedia GET da aba a cada evento.
8. **P0:** `updateChat`/`addChat` aplicam `applyNewerOptimisticMembershipTo` contra o payload cru (não o row já spread). Tombstone em `chatsStore.chatListHiddenClosed`. Restore de Minha fila **sem** `patch` completo (evita GET copiar nome/status em cima do card). Chips com delta otimista.

Contrato atual:

- `chatRowIsStaleForTab` / `computeChatsFiltrados` exclui fechada das abas de fila e também status claramente alheio (`aberta` / `aguardando_cliente` em Em atendimento, etc.).
- Socket só insere row se `shouldInsertChatRowInActiveList` (aba + busca + tombstone). Já na lista: só `updateChat` com membership otimista mais novo.
- Aba Minha fila: `chats` é a única fonte dos cards visíveis, inclusive vazia ou com todos os IDs diferentes do snapshot local. Cache só hidrata a store por `filterRequestKey`, antes da pintura. O resultado vazio é persistido; paginação e restauração também atualizam a store.
- Resync da aba **não** dispara só porque outra conversa atualizou. Dispara se inseriu na aba, se a row visível saiu do recorte, ou `lista_realtime` força.
- Resync **background** usa `mergeActiveTabBackgroundRows`.
- Encerrar/reabrir/assumir/transferir usam `requestChatListResync({ force: true })`.

- **Auto-assumir no envio (CONFIRMADO 2026-09-02):** conversa **Aberta** (sem outro atendente) no primeiro envio do atendente vira `em_atendimento` na hora. O frontend pinta otimista (`applyOutgoingStatusOptimistic` + mutation `assumir_conversa`); o backend assume em `assertPodeEnviarMensagem` (`autoAssumirAoEnviar: true`) e o socket `conversa_atualizada` leva `status_atendimento` + `atendente_id`. Nas abas de fila (Abertas / Minha fila de outro atendente) `shouldDropChatFromActiveList` remove o card em tempo real. “Todas/Hoje” só mudam o badge.

- **Em atendimento da empresa (CONFIRMADO 2026-09-02):** o chip lista **todos** os atendimentos visíveis (setor/admin), não só os do usuário logado. A Minha fila continua sendo a fila pessoal. Tombstone de “saiu da Minha fila” **não** esconde o card em Em atendimento (só encerrar). Sem isso o filtro ficava vazio até F5. GET `/chats?status_atendimento=em_atendimento` no backend deixou de recortar `atendente_id = eu` para atendente comum.
- **Minha fila (corrigida em 2026-09-02):** GET completo e resync continuam sem preservar extras. `resolveMinhaFilaPaintRows` sempre usa a store; não existe fallback por interseção de IDs. `minhaFilaList` permanece como metadado/cache auxiliar, sem autoridade para pintar cards ou manter o skeleton. `computeChatsFiltrados` preserva o recorte pessoal com `conversaPertenceAMinhaFila`.
- **Setor em tempo real (corrigido em 2026-09-02):** quando o cliente escolhe um setor (URA/chatbot) ou a conversa é transferida, o card some na hora para quem **não** pertence àquele departamento — inclusive se o evento omitir `atendente_id` (não herdar assignee stale). O backend emite `conversa_atualizada` enxuto (sem preview de mensagem) para a room `empresa_{company_id}` + departamento antigo/novo, porque o emit scoped só alcança quem **ainda** pode ver. **Admin** (`role`/`perfil` `admin` ou `administrador`) vê tudo. Supervisor **não** é admin nessa regra (igual ao GET `/chats`). Sem setor → todos veem. Conversa assumida por mim permanece **somente se o GET ainda autorizar o assignee**. `viewerCanSeeConversationRow` + `shouldRemoveChatFromViewerList` no socket; insert inverso via `addChatIfAuthorized` (GET `/chats/:id`). 403/404 em `atualizar_conversa` remove de `chats` e da sidecar Minha fila. Fechar a thread se o setor ficou inacessível **não** encerra o atendimento. Reconexão continua com `requestChatListResync({ force: true })`.

Busca com termo continua global. Fechar a thread na UI continua ≠ encerrar.

- **Unread global (corrigido em 2026-09-02):** `unreadById` é canônico e sincroniza `unread_count`/`unread` das rows. GETs de lista só inicializam IDs desconhecidos antes do primeiro snapshot; não desfazem incrementos nem leituras locais. `GET /chats/counts?unread=1` retorna `unread_by_id` e `unread_total` no escopo autorizado do usuário/empresa, independente da aba. O backend pagina todas as não lidas e permissões, reutilizando as regras de acesso da lista; erros não viram zero. `unreadSnapshotSync` serializa e agrupa consultas no boot, socket/reconexão, leituras e mudanças de acesso. Leituras locais ocorridas durante o GET preservam apenas seus IDs e provocam nova reconciliação. Eventos não incrementam o cliente: snapshots absolutos evitam replay duplicado e contagem de IDs sem autorização. Logout aborta; falhas têm retry com backoff. O webhook só incrementa para inbound realmente inserido. `GlobalNotifications`, socket e Atendimento usam a contagem canônica no título, somada aos contadores existentes do chat interno e HelpDesk.

- **Visão da lista no socket (CONFIRMADO 2026-09-02):** `ChatList` publica aba, busca imediata, busca debounced, `adminAtendenteFilterId`, `pendentesFuncionarioIds` e `departamentoFilter` via `setChatListView`. `buildActiveChatListViewFromStore` é a representação única; `getActiveChatListView()` no socket só a consome. Insert/drop realtime recusam conversa de outro atendente quando o admin filtra por funcionário (também em Todas/Hoje/busca).
- **Resync throttled (CONFIRMADO 2026-09-02):** janela de 2,5s continua; em vez de só `refreshChatFilterCounts`, agenda um `load({ background: true })` único no fim da janela (ou enfileira se já houver GET em voo).
- **searchActive imediato (CONFIRMADO 2026-09-02):** `chatListSearchActive` liga no primeiro caractere; `chatListSearchDebounced` só após 350ms (GET). Durante a janela o socket não dropa pela aba e não insere card novo (evita contaminar). Limpar a busca volta as regras da aba na hora.

- **Chips Em atendimento × Aguardando cliente (CONFIRMADO 2026-09-02):** `aguardando_cliente_desde` preenchido (ou `status=aguardando_cliente`, ou modo simples `cliente`) é subcondição de atendimento. O **card** continua `em_atendimento` e o StatusPill já omite “Em atendimento” quando há etiqueta de espera. Os **chips** são exclusivos: `chatRowChipCountKeys` devolve só `aguardando_cliente` ou só `em_atendimento`. GET `/chats/counts` usa `exclude_aguardando_cliente` no count do chip Em atendimento; a listagem GET `status_atendimento=em_atendimento` **não** muda (a row ainda pode aparecer nessa aba). Delta otimista segue as mesmas chaves exclusivas.

- **refreshMinhaFila removido (CONFIRMADO 2026-09-02):** era código morto (nenhum call site). `load()` já busca a lista da aba (`fetchMinhaFilaChatsCompleto` quando a aba é Minha fila). O número do chip vem de `refreshChatFilterCounts` → GET `/chats/counts`. Os refreshers paralelos `refreshEmAtendimentoBadge` / `refreshAguardandoClienteBadge` / pagamentos / atraso / disparadas também foram removidos — não religar via `runAuxBadgeFetch`. `runAuxBadgeFetch` só coalese `chatCounts` e `supervisao`.

## Melhorias anotadas (não alteradas)

- Default `chatListActiveTab: "minha_fila"` antes do mount — só modo simples, janela curta.

**Validação local:** `scripts/test-unread-and-minha-fila.mjs`, suíte Node (incluindo correções de refresh/funcionário), backend Jest e `e2e/unread-minha-fila.spec.js` em desktop/mobile. O E2E simula HTTP e entrega eventos aos listeners reais; não homologa tráfego de produção nem aparelho físico. Busca 350ms continua fora desta correção.

## Invariantes

- **Precedência do funcionário (corrigida em 2026-09-02):** `getAdminAtendenteFilterScope` compartilha a regra entre HTTP, pintura e insert/drop do socket. Selecionar funcionário substitui o recorte da aba (incluindo Finalizadas/Minha fila/Abertas); grupos e outros funcionários continuam excluídos. Os refinamentos existentes de ausência e aguardando cliente permanecem, e são publicados na store para o socket. Busca global suspende esses refinamentos. Cache, merge de background e remoção otimista não reaplicam a aba ignorada. Sem funcionário selecionado, as abas mantêm suas regras. Teste `scripts/test-chat-list-admin-scope.mjs` cobre 12 abas, refinamentos, setor, tombstone e retorno ao filtro normal.

- Unread só em inbound (`direcao` in / `fromMe` false).
- Preview da última mensagem não usa nome vazio do outbound.
- Setor: socket não “inventa” conversa invisível; `addChatIfAuthorized`.
- Fechar atendimento na API remove/atualiza row; fechar thread na UI não.
- Foto: não limpar URL http válida. `contato_atualizado` / `conversa_atualizada` **podem** trocar a URL se a nova for http diferente (correção de foto trocada). Não usar `msg.photo` (mídia) como avatar.
