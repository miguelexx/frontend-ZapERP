# Performance do frontend

> 2026-08-23 · caminho quente = atendimento. Skill: `.cursor/skills/zaperp-performance/SKILL.md`. Estabilidade e `company_id` > micro-otimização.

## Boot mobile 2026-10-23 — auditoria medida + 4 primeiros itens aplicados

Relatório completo: [`docs/audits/boot-mobile-2026-10-23.md`](../audits/boot-mobile-2026-10-23.md).
Parte de servidor: [`docs/audits/nginx-boot-mobile-2026-10-23.md`](../audits/nginx-boot-mobile-2026-10-23.md).

**Boot medido (dist em produção):** ~459 kB gzip / **1,82 MB brutos** para chegar em
`/atendimento`. Os 1,82 MB são o custo de CPU no celular (descomprimir + parsear +
executar) e não aparecem no "tamanho do bundle".

**Causa-raiz do chunk de entrada (381 kB):** o fecho estático de `main.jsx` tem 80
módulos / 845 kB de fonte, e **729 kB (86%) são `conversa/` + `chats/` + `socket/`** —
puxados por exatamente **3 arestas**, não só pelo `authStore`:

1. `api/http.js` → `socket/socket.js` (só para `disconnectSocket()` no 401) e → `conversa/conversaStore.js`
2. `push/swBridge.js` → `conversa/conversaStore.js`
3. `auth/authStore.js` → socket + conversaStore + chatsStore + prefetch + push

É por isso que a tentativa anterior (só o `authStore`) rendeu **3%**: o `http.js` é
importado por tudo e reentrega o motor pelo outro caminho. Cortando as três: 80 → 26
módulos, 845 → 116 kB (**-86%**). `conversa/conversaOutboundMediaMerge.js` sozinho são
101 kB de lógica de ENVIO de mídia parseados antes da tela de login.

**Aplicado nesta sessão (só `index.html`, nenhum JS tocado):**

- **Esqueleto de boot inline** dentro do `#root`. Antes o `#root` vinha vazio e o celular
  ficava branco do HTML até o React montar. Sai sozinho — `createRoot().render()` limpa
  os filhos do container. Custo: +2,3 kB gzip no HTML, zero request. Geometria espelha o
  shell real (rail 64px / barra 44px, lista `clamp(320px,28vw,380px)`, header
  `clamp(62px,7vh,72px)`, linha 60px como o `.chat-list-skel-row`).
- **Tema aplicado antes do primeiro pixel** (script inline). Era obrigatório: sem ele o
  esqueleto piscaria claro antes de o `applyTheme()` do `main.jsx` rodar. **A regra é a
  mesma do `main.jsx`** (`localStorage "theme"` → `prefers-color-scheme`) — se mudar lá,
  mude aqui.
- **`data-boot`** (`app` / `anon`, lido de `zap_erp_auth`) escolhe entre esqueleto de
  lista e de login. Sem JS/storage cai em `anon`.
- **Rede de segurança de 20 s**: se o bundle nunca chegar, o esqueleto vira mensagem +
  "Tentar de novo". Um esqueleto animado eterno mente mais que a tela branca de antes.
- **`preconnect` para a API** via `%VITE_API_URL%` (substituído pelo Vite no build;
  verificado: vira `https://zapapi.wmsistemas.inf.br`). A 1ª chamada é para outra origem
  e pagava DNS+TCP+TLS do zero — **~340 ms medidos**.

**Pré-carga do ConversaView adiada no celular** (`routes/preloadAtendimento.js`, novo;
`AppRoutes.jsx` agora só chama `preloadChunksAtendimento()`):

- MainLayout / Atendimento / chatList continuam **sempre** em paralelo — é o caminho da lista.
- O ConversaView (183 kB gzip = ~40% dos bytes do boot) espera o chunk da lista chegar
  **e** uma janela ociosa, mas **só** em `(max-width: 640px)` sem conversa no boot — é o
  único caso em que o painel renderiza `null` (ver `Atendimento.jsx`). **O breakpoint é
  duplicado nos dois arquivos: se mudar num, mude no outro.**
- Nunca adia quando o boot já aponta para uma conversa: `?conversa=` (notificação/deep
  link) ou `openConversaId` em `history.state.usr` (react-router 6 guarda `location.state`
  ali — verificado na 6.30.4), que sobrevive a um F5.
- Sem `matchMedia` confiável, cai no comportamento antigo (paralelo) em vez de adiar às cegas.
- Adiar é seguro: tocar numa conversa antes da janela ociosa cai no `React.lazy` da rota
  com o `ConversaPanelFallback` que já existe.

Medido no dev server com sessão e viewport reais (ver tabela abaixo). Custo: +1,4 kB
brutos / +0,35 kB gzip no chunk de entrada.

| cenário | chatList | ConversaView | |
|---|---|---|---|
| celular sem conversa | 307 ms | 2556 ms | adiado (+2249 ms) |
| desktop 1200px | 274 ms | 274 ms | paralelo, como antes |
| celular `?conversa=123` | 268 ms | 268 ms | imediato |

Teste: `scripts/test-preload-conversa-view.mjs` (18 asserts, no `test:node`). Validado com
3 mutações — nunca adiar, adiar sempre, e não esperar o chunk da lista — todas pegas.

**1ª página do boot menor e entregue na hora** (`chats/prefetchDefaultChatList.js`,
`chats/chatService.js`, `chats/chatList.jsx`):

- O prefetch do boot chamava `fetchMinhaFilaChatsProgressivo` **sem `onFirstPage` e sem
  `badgeCount`** → `limit=250`, `maxPages=50`, e só resolvia no fim do laço. A lista não
  pintava enquanto a fila inteira não chegasse.
- Agora a **1ª página do boot é 40** (`PREFETCH_BOOT_PRIMEIRA_PAGINA_LIMIT`); as seguintes
  continuam em 250, em segundo plano. `fetchMinhaFilaChatsProgressivo` ganhou
  `options.primeiraPaginaLimit` — **sem ele o comportamento é byte a byte o de antes**,
  então `load()` (troca de aba, resync) não mudou.
- `takePrefetchedDefaultChatListPrimeiraPagina()` expõe a 1ª página; o `load()` pinta com
  ela e **continua a esperar a lista COMPLETA** para o `data`.

**⚠️ A armadilha deste item, se alguém for mexer:** a aba "Minha fila" não tem "Carregar
mais" (força `hasMore: false`). Duas coisas nunca podem acontecer:
1. a página parcial virar o resultado final — some com conversas de vez;
2. `getMinhaFilaMaxPages` calcular páginas com `ceil(badge / 250)` tendo 1ª página de 40
   — com badge 250 daria **1 página = 210 conversas perdidas**. A conta agora é
   `1 + ceil((badge - primeiraPagina) / 250)`, idêntica à antiga quando os dois limites
   são iguais.
Só a lista **completa** vai para o cache de sessão — gravar a parcial faria o boot
seguinte hidratar uma fila truncada e sair cedo por `fromCache`.

Medido no browser com mock de API (300 conversas, custo proporcional ao tamanho da página):

| | 1ª requisição | lista pinta |
|---|---|---|
| antes | `limit=250` @1235 ms | 1559 ms |
| depois | `limit=40` @407 ms | **477 ms** |

**−1082 ms para a lista aparecer.** Sequência do boot confirmada: `limit=40` (sem cursor)
→ `limit=250` (com cursor) → `limit=250`, e a fila completa chega na mesma.

Teste: `scripts/test-boot-primeira-pagina.mjs` (no `test:node`), validado com 3 mutações
— conta de páginas antiga (pega a perda de 210 conversas), prefetch sem entrega da 1ª
página, e cache de sessão com a lista parcial.

**Permissões e empresa em paralelo com o `/usuarios/me`** (`auth/authStore.js`, só o
`restore()` — o `login()` não foi tocado):

- Eram 2 idas e voltas em série antes de o menu lateral e os gates de rota assentarem.
  Nenhuma das duas depende da RESPOSTA do `/me`, só do token.
- As flags do utilizador (`applyUsuarioMeFlags` / `syncUsuarioMe`) **continuam** depois
  do `/me` — essas sim dependem dele.
- **Por que não é menos seguro:** a ordem em série parecia um portão ("só busca mais se a
  sessão for válida"), mas não era — o `prefetchDefaultChatList` logo acima já dispara
  `GET /chats` sem portão. Token morto cai no interceptor global de 401 (`api/http.js`),
  que limpa a sessão e faz `location.href = "/login"`: recarga inteira, idempotente para
  vários 401 concorrentes. `fetchEmpresa` tem guarda `loaded`, então não duplica.
- Ganho real e limitado: **não acelera a lista** (ela não depende de permissões e
  `/atendimento` não é rota protegida). Encurta a janela em que o menu pode mudar sozinho
  — enquanto `permissoes` é `null`, `can()` cai num palpite por cargo
  (`CODIGO_TO_ROLE_CHECK`), então um item podia aparecer/sumir ~1 s depois de entrar.
  Para **admin** não muda nada (`can()` devolve `true` por cargo, de imediato).
- Verificado no browser: `/usuarios/me/permissoes` @564 ms e `/config/empresa` @568 ms
  chegam junto com `/usuarios/me` @571 ms.
- Teste: `scripts/test-boot-permissoes-paralelas.mjs` (7 asserts), validado com mutação.

**⚠️ Como medir isto em dev sem se enganar:** o instante em que a lista pinta é limitado
por **quando o `chatList` monta**, não pela rede. Em dev (módulos sem bundle + StrictMode)
ele monta ~1,3 s depois do boot, então a 1ª página fica pronta na rede (~0,8 s) e espera
o componente. Instrumentado em 23/10: `load()` às 1309 ms → 1ª página pintada às 1326 ms
(17 ms depois), enquanto as páginas de 250 só chegam às 1902/1962 ms. **Comparar números
absolutos entre execuções não vale**; só A/B na mesma sessão, logo em seguida.

**Inter auto-hospedada (2026-10-23, pós-deploy)** — `src/styles/theme.css` +
`src/styles/fonts/inter-latin.woff2`; o `<link>` e os 2 preconnects do Google saíram do
`index.html`.

- O motivo não é só velocidade: folha de estilo no `<head>` é **render-blocking**, então o
  primeiro pixel — **incluindo o esqueleto de boot inline** — dependia de
  `fonts.googleapis.com` responder. CDN de terceiros lento/bloqueado = app sem desenhar.
- No Windows a Inter nem chegava a ser baixada (`"Segoe UI"` vence no `body`) — medi zero
  pedidos a `fonts.gstatic.com`. No **celular** não há Segoe UI, então era folha
  bloqueante numa origem + woff2 **noutra**, cada uma com DNS+TCP+TLS.
- É **fonte variável**: 1 ficheiro (47 kB) cobre os 5 pesos. Confirmado extraindo os 35
  blocos `@font-face` da CSS real do Google — os 5 do subset `latin` apontam ao mesmo URL.
- Os 5 `@font-face` são cópia **fiel** das declarações do Google (mesmo `unicode-range`,
  mesmo `font-display: swap`), geradas por script para não haver erro de transcrição.
  Subset `latin` basta: todo o português cabe em U+0000-00FF (verificado caractere a
  caractere).
- Entra em `/assets` com hash → herda `immutable` + cache-first do SW, e **funciona
  offline**. Custo: `index.css` +0,21 kB gzip.
- Verificado: `document.fonts.check('600 16px Inter')` true, peso 600 `loaded`, largura de
  texto 396 px com Inter vs 350 px no fallback (não é fallback silencioso), 0 pedidos ao
  Google.

**Se alguém for recolocar o Google Fonts:** não recoloque. O ganho principal é não
depender de origem externa para o app desenhar.

**ITEM 10 APLICADO (23/10) — o motor de conversas saiu do chunk de entrada**

Novo arquivo `src/runtime/sessionRuntime.js`, **sem nenhum import** (é essa ausência que
o deixa entrar no boot sem arrastar nada — há teste que falha se alguém puser um).

| | módulos | fonte | build (entrada) |
|---|---|---|---|
| antes | 82 | 858 kB | 392,62 kB / 109,73 kB gzip |
| **depois** | **51** | **328 kB (−62%)** | **149,14 kB / 42,55 kB gzip** |

**As 3 arestas que prendiam o motor** (e por que não bastava `import()` dinâmico):

- `api/http.js` → `socket/socket` + `conversa/conversaStore`, só para limpar no 401. Como
  logo a seguir vem `location.href = "/login"`, um import dinâmico poderia **não chegar a
  tempo** e a limpeza ficaria por fazer, às vezes. Por isso é **inversão de dependência**,
  não import tardio.
- `push/swBridge.js` → `conversaStore`, só para ler `selectedId`.
- `auth/authStore.js` → socket + chatsStore + conversaStore.

**Como funciona:** quem é pesado **regista-se** ao carregar
(`registrarLimpezaDeSessao` / `registrarLeitor`); quem é leve chama o que estiver
registado. A propriedade que torna isto seguro **por construção**: se um módulo nunca
carregou, não há estado dele para limpar nem valor para ler — o no-op é a resposta
**correta**. Sem socket carregado não há socket para desligar; sem conversaStore não há
conversa aberta (e o push aparece, que é o padrão seguro).

**`prefetchDefaultChatList` ficou ESTÁTICO de propósito** — é o `GET /chats` do boot, e
adiá-lo atrasaria a lista. Medido: ele não arrasta o motor. Há teste que trava isso.

**`initSocket` passou a `import()` dinâmico** no login/restore: o realtime sobe uns
milissegundos depois; a lista vem por HTTP e não depende dele.

**Item 6 junto (`parseToDate`):** `chats/chatListRowAtendimento.js` e `chats/chatsStore.js`
importavam **só** essa função de `conversa/utils/conversaViewHelpers.js` (68 exports, 41 kB,
que ainda arrasta `conversaUtils`). Em 23/10 eu medi **0 kB de ganho** — porque o módulo
chegava ao boot pelo próprio motor. Depois do corte, passou a valer 40 kB. Agora vive em
`src/utils/parseToDate.js` e o arquivo antigo **reexporta**, então nada do lado da conversa
mudou. **Lição: medir antes de refatorar — e medir de novo depois de mudar o contexto.**

Teste: `scripts/test-session-runtime.mjs`, validado com 4 mutações (voltar o import em
`http.js`; tirar o registo do leitor; pôr um import no `sessionRuntime`; tirar o try/catch
que isola uma limpeza que estoura).

### Itens do backlog C reavaliados com o código na mão (23/10)

- **C7 (resync em cascata) — FECHAR, não implementar.** `pagesLoadedTarget` é
  `min(20, pagesLoaded)`, ou seja **quantas páginas o utilizador realmente carregou**: quem
  nunca clicou "Carregar mais" faz 1 página. E o comentário em `chatList.jsx:759` documenta
  que voltar só a 1ª página **causou bug real** ("conversas antigas sumirem da lista"). A
  "melhoria" do backlog reintroduziria um bug já corrigido.
- **C8 (`ConversaViewBody` assina `mensagens`) — MEDIDO em 23/10, e o diagnóstico do
  backlog estava impreciso.**
  - O "60 lugares" que eu próprio escrevi era contagem bruta de `grep`: a maioria é
    `mensagens_bloqueadas` (outro campo), comentários e strings. Os usos **reais** do array
    assinado são **~7**, e outros **9** já leem por `getState()` de otimizações anteriores.
  - **Custo medido** (dev, com mock, instrumentando o render do coordenador e descontando
    o overhead do laço de medição):

    | thread aberta | custo por mensagem |
    |---|---|
    | 200 msgs | ~7,6 ms |
    | 1.000 msgs | ~7 ms |
    | 3.000 msgs | **~24,7 ms** |

    Com a thread FECHADA o mesmo lote custa ~0 (0 renders) — ou seja, o número acima é o
    custo total de coordenador + thread, não só do coordenador. Em dev o React é
    não-minificado e o StrictMode **dobra** os renders (medi 2 por mensagem); em produção
    é menos.
  - **Leitura:** o custo é PLANO até ~1000 mensagens e só degrada em thread muito longa.
    O culpado provável da degradação não é o re-render do coordenador em si, e sim o
    `buildMensagensComSeparadores(mensagens, isGroup)` ser **O(n) a cada mensagem**
    (O(n²) ao longo da conversa).
  - **Recomendação: NÃO fazer agora.** Refatorar um componente de 3553 linhas no caminho
    marcado como zona de perigo (scroll/teclado) para ganhar poucos ms no caso comum é mau
    negócio. Se um dia valer, o alvo certo é tornar o `buildMensagensComSeparadores`
    incremental — não mover a assinatura.
- **C10 (unificar ícones) — ganho não justifica.** `vendor-icons` é **11 kB gzip no total**;
  unificar tocaria 52 arquivos com troca de nomes de ícone (mudança visual a verificar
  uma a uma) para poupar talvez 5 kB.
- **C11 (`react-easy-crop`) — dep morta, mas ganho zero no bundle** (não é importada, logo
  não é empacotada). Só encurta `npm install`, ao custo de churn no lockfile.

**Não aplicado (é servidor, não tem nginx versionado no repo):** brotli (~60 kB a menos
no boot, medido) e `Cache-Control: no-cache` no `index.html` (hoje o nginx não manda
header nenhum — só `ETag`; o `<meta http-equiv>` do HTML é ignorado pelo browser).

**Flakes conhecidos do `test:e2e:mock` nesta máquina (NÃO são regressão):**
`composer mantém teclado…` (chromium-desktop) e `historico com muitas midias…`
(chromium-mobile, assert por amostragem de scroll). Confirmado revertendo as mudanças e
rodando a suíte: falham igual. Baseline atual = 11 passed / 2 failed / 1 skipped.

**Backend, achado com evidência:** a lista ordena `ultima_atividade DESC NULLS LAST`,
mas `idx_conversas_company_atividade_id` é `DESC` (= NULLS FIRST) → **índice não
elegível, Postgres ordena o conjunto filtrado inteiro em cada página**. Já estava no doc
29 do backend, mas o índice NULLS LAST **nunca virou migration** (verificado: 0 arquivos
em `supabase/migrations/`).

**Outros, por ordem de ganho:** no celular o `ConversaView` (183 kB gzip / 784 kB brutos)
é pré-carregado no boot e o `Atendimento` renderiza `null` no painel — 40% dos bytes do
boot para não mostrar nada; o `GET /chats` do boot pede `limit=250` com `maxPages=50` e
**sem `onFirstPage`**, então não entrega a 1ª página antes de terminar o laço;
`/usuarios/me` → `/usuarios/me/permissoes` são seriais; `react-easy-crop` é dep morta.

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

### Armadilha ao escrever teste novo em `scripts/`

Teste que chama `initSocket` (direta ou indiretamente, ex.: `authStore.restore()`) **não
sai sozinho**: o socket.io deixa timers de reconexão vivos e o `test-node-suite` trava
para sempre. Rodar com `timeout 120 node ...` **mascara** o problema — imprime OK e é
morto depois. Confira o **exit code**: `124` = travou.

Solução usada em `test-boot-permissoes-paralelas.mjs`: `disconnectSocket()` no `finally`
e `process.exit(0)` depois do try/finally (falha continua a derrubar com 1, verificado).
