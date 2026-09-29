# Performance do frontend

> 2026-08-23 · caminho quente = atendimento. Skill: `.cursor/skills/zaperp-performance/SKILL.md`. Estabilidade e `company_id` > micro-otimização.

## Auditoria de performance 2026-09-29 (CONFIRMADO por leitura/testes; runtime PENDENTE DE VALIDAÇÃO)

Otimizações aplicadas nesta sessão — não reverter sem medir:

- **Virtualizadores (lista + thread):** `getItemKey`/`estimateSize` agora têm identidade estável (`useCallback`). Arrow inline nova a cada render entrava nas deps do memo de medidas do `@tanstack/virtual-core` e re-estimava TODAS as linhas em cada render (scroll, minuteTick, socket). `ChatListRows.jsx` e `ConversaMessageVirtualList.jsx`.
- **Sort da lista:** decorate-sort-undecorate em `sortChatListByRecent`, `sortChatRowsByOrder` e no sort de `computeChatsFiltrados` — `getChatListSortTimestampMs` (vários parses de data) roda 1× por linha, não O(n·log n)×. `chatListSortOrderKey` (sort inteiro com resultado nunca lido) foi removido.
- **chatsStore noops:** `updateChat` com merge inalterado retorna `false` direto (o probe antigo ordenava a lista à toa); `setUnread` não sobe `unreadRevision` quando contagem e rows já batem (evita GET /chats/counts?unread=1 sem mudança); `syncUnreadRows` preserva a referência do array quando nada mudou; `removeChat`/`adicionarTag`/`removerTag` detectam noop.
- **socket.js:** snapshot de auth cacheado por string (sem `JSON.parse` por evento); lookups O(1) via `getChatByIdFromStore`/`getChatsByIdIndex` nos handlers; título da aba atualiza mesmo oculta (rAF não roda em background → fallback `setTimeout`); `AudioContext` do beep é singleton (antes vazava um por mensagem recebida); **recovery de reconexão só a partir da 2ª conexão** (a 1ª duplicava lista/counts/thread do boot); `unreadSnapshotSync` com `delayMs: 1000`.
- **Rede:** `useChatListResync` guarda o nonce processado (deps mudando não geram GET "fantasma" com o mesmo nonce); counts com `reuseIfFresh` no efeito de mount/aba + reuso de GET em voo; **axios não retenta timeout** (só ERR_NETWORK/CONNECTION_CLOSED); polls de whapi-status/zapi-status/supervisão pausam com aba oculta; `useConversaParticipantes` passa `signal` real; guards de corrida em `carregarAtendimentos`, `SidebarCliente.loadCliente` (risco de gravar no cliente errado), `useGroupWhatsapp`, `useShareContact`.
- **ConversaView:** `jumpToReply`/`handleForwardAdvance` leem `mensagens` via `getState()` (bug: bolhas guardavam lista velha — `threadRowPropsAreEqual` não compara callbacks); typing/presença viram seletores primitivos (`typingKey`/`contactPresenceFmt` com igualdade por valor) — typing_start não re-renderiza mais o coordenador; `whatsappLabelsContext` memoizado e `onToastClose`/`onToggleTimeline` estáveis (memo do Header voltou a funcionar); wrapper assina `!!s.conversa`; `statusBadge` devolve constantes cacheadas por variante; `ConversaViewOverlays` é `memo`; `CatalogPickerModal` é lazy e só monta aberto.
- **Busca da lista:** chave do termo com cache de 1 entrada em `nameMatchesWordPrefix` (NFD+regex rodava ~10 campos × N linhas × tecla); `ChatListBody` filtra com `useDeferredValue(searchInput)`.
- **Comparadores:** fast-path por identidade em `chatRowPropsAreEqual` e no comparador de `fromChat` (`useConversationHeaderIdentity`). `formatHora` da row usa `Intl.DateTimeFormat` de módulo.
- **Memória:** blobs otimistas são revogados no evict/TTL do cache de mensagens e no `clearConversaSessionCaches` (nunca da conversa aberta); worker de auto-close de notificação ganha `onerror`; cache de hash de enquete com teto LRU 500; supressão de som expira.
- **Boot:** com sessão ativa, `AppRoutes` pré-carrega MainLayout/Atendimento/chatList/ConversaView em PARALELO (quebra a cascata de 3+ round-trips da rota inicial).

**Recomendações NÃO aplicadas (alto valor, mais risco — exigem sessão dedicada):** mover a assinatura de `mensagens` para fora do corpo do `ConversaViewBody` (hoje o coordenador re-renderiza por mensagem); resync em background baixa até 50 páginas em cascata (`fetchChatsPages`) — considerar 1ª página + merge; `conversa.css` (17,8k linhas / 331 kB) e `chatList.css` (134 kB) precisam de purge; unificar ícones (tabler×lucide) e remover `react-easy-crop` (dep morta); imports dinâmicos de socket/stores no `authStore` para tirar o motor de conversas do chunk de entrada (exige tratar também `ErrorBoundary`/`swBridge`); `pendingCaption` e `recordingSeconds` como estado no coordenador/shell.

## O que já está no desenho (CONFIRMADO)

- `React.lazy` de páginas e de ChatList / ConversaView / SidebarCliente / modais pesados / MediaViewer.
- `manualChunks` no Vite (react, router, axios, socket, markdown, tanstack, dnd, icons, zustand).
- Stores Zustand com seletores + `shallow` onde a lista é grande.
- Lista: SearchBox isolado; Body único subscriber; Row memo + `chatRowPropsAreEqual`.
- Thread: virtualização TanStack; `threadRowPropsAreEqual`; drafts fora da store pesada.
- Debounce: busca; resync da lista 180/700ms; `status_mensagem` batch ~75ms com **um `set()`** na thread (`patchMensagensBatch`).
- Lista: índice `Map` por id; `unreadTotal` na store (título da aba sem percorrer `chats`); layout key da lista = ids na ordem (preview fica no compare da row).
- Thread: rows de timeline reutilizam o objeto quando a mensagem de origem não mudou (WeakMap).
- Abertura da conversa: máscara até `onOpenSnapReady` (settle do virtualizer); header sticky da lista (`fromChat`) para não recarregar foto; `.wa-bubble` sem fade global (só `.zap-message-enter` em mensagem nova).
- Cache: sessionStorage da sidebar; Map de mensagens por conversa.
- Prefetch da aba padrão (`GET /chats?minha_fila=1`) no login/restore; `load()` reutiliza se ainda fresco.
- Resync do socket remove só a conversa afetada do cache de filtros (sem skeleton ao voltar para Minha fila).
- Abertura da thread no mobile: `GET /chats/:id` com 16 mensagens; header usa nome/foto da lista.
- Busca global só com 2+ caracteres; 1 caractere filtra só as linhas já carregadas.
- Boot mobile staggered (não disparar todos os GETs no primeiro paint).
- Recuperação de preload Vite (`runtime`) para chunk 404 após deploy.

## Regras ao alterar o caminho quente

1. Não assinar o array `chats` ou `mensagens` em componentes folha.
2. Não criar objeto/callback inline que quebre `memo` (Toolbar, Row, Bubble, Composer).
3. Não dar `setChats([...])` se o compare de row diria equivalente.
4. Não ligar listener socket dentro de Row/Bubble.
5. Não desligar virtualização “para simplificar”.
6. Não buscar a lista inteira a cada `nova_mensagem`.
7. Áudio: um player ativo (`bubble/utils/audioSession.js`); `el.load()` ao trocar src; revoke blob URLs no unmount.
8. Evitar Context novo no shell do atendimento.
9. Não keyar renderer da bolha por `status` — pending→read deve só atualizar o tick.

## Sintomas → lugar

| Sintoma | Onde olhar |
|---------|------------|
| Digitar no search trava | `ChatListSearchBox` vs subscriber da lista |
| Abrir conversa trava | `carregarConversa`, merge, virtualizer `estimateSize` |
| Socket “pisca” a lista | `addChat`/`setUltimaMensagemEBump` + row compare |
| Scroll da thread pula | preserve scroll flag; medidas de mídia; âncora de fundo |
| Memória sobe no plantão | cache Map 48 conversas; blobs; listeners |
| Deploy quebrou tela branca | preload recovery; SW `updateViaCache` |

## Medir

React Profiler no `Atendimento` + `ChatListBody` + `ConversaThread`. Performance panel: long tasks >50ms no handler de socket. Não adicione log em produção no hot path.

## Backend

Lista lenta também pode ser `/chats` + counts. Não “otimize” o FE mascarando N+1 no servidor. Handoff backend [13](../../../backend/docs/ai-handoff/13-PROBLEMAS-CONHECIDOS-E-DIVIDA-TECNICA.md).
