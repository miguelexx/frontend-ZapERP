# Thread, mensagens e composer

> 2026-08-23 · `src/conversa/`. Segundo caminho quente. Duplicar mensagem, perder áudio ou quebrar scroll quase sempre nasce aqui.

## Store `conversaStore.js` (CONFIRMADO)

Estado: `selectedId`, `conversa`, `mensagens`, `tags`, loading/erro, `lockedBy`, cursores de histórico, atendimentos, typing, fila de append no composer, flag de preservar scroll.

Cache in-memory de mensagens: Map TTL ~20 min, teto ~48 conversas.

`carregarConversa`: abort + generation → shell da lista → `GET` chat → `mapDedupeKey` → merge com otimistas → `hydrateOutboxBubblesForConversa` → `join_conversa` + `marcar_conversa_lida` → `clearUnread`.

Outras actions: `anexarMensagem` / `Imediata`, `reconciliarMensagem`, `patchMensagem`, remover, marcar temp erro / envio incerto / aguardando conexão, `applyPendingOutgoingWatchdog`, assumir/transferir/encerrar/reabrir/aguardar, `patchConversa` / `patchLock`.

## UI

| Arquivo | Papel |
|---------|--------|
| `ConversaView.jsx` | shell: header, thread, composer, sidebar, send, watchdog, outbox, viewer |
| `ConversaThread.jsx` | day separators; escolhe virtual vs estático |
| `ConversaMessageVirtualList.jsx` | `@tanstack/react-virtual`, overscan ~12, `estimateSize` por tipo |
| `ThreadRow.jsx` | memo + `threadRowPropsAreEqual`; escolhe Bubble / nota interna / movimentação |
| `ConversaBubble.jsx` | fachada compatível; reexporta `bubble/ConversaBubbleShell.jsx` |
| `bubble/ConversaBubbleShell.jsx` | orquestra tipos, menu, gestos, retry e classes da bolha |
| `bubble/components/*` | texto, imagem, vídeo, sticker, documento, contato, localização, áudio, status, menu, reações |
| `bubble/hooks/*` | menu, long press/swipe de mídia, retry de envio e playback de áudio |
| `bubble/utils/*` | classify, status, retry, location, sessão/duração de áudio |
| `ConversaComposer.jsx` | fachada compatível; reexporta `composer/ConversaComposerShell.jsx` |
| `composer/ConversaComposerShell.jsx` | coordena texto, modo nota, painéis e a interface pública do Composer |
| `composer/components/*` | footer, anexos/câmera, emojis, stickers, respostas salvas, reply bar e gravador |
| `composer/hooks/*` | draft, typing, respostas, anexos/câmera, autocorreção, pickers e gravação |
| `composer/utils/*` | funções puras de teclado, mídia gravada, chaves/contexto e comparação de props |
| `components/ConversaHeader.jsx` | |
| `SidebarCliente.jsx` | lazy; observação, vínculo, rename (`PUT /chats/:id/nome-contato` + patch imediato em `conversaStore`/`chatsStore`); clique fora fecha (backdrop `--cliente` + listener no `document`) |
| `composerDraftStore.js` | rascunho por conversa |

Virtualização: desktop sempre; mobile se `> 24` rows (`MOBILE_VIRTUALIZE_THRESHOLD`); senão lista estática. Medir mídia **durante** scroll de histórico não pode soltar a âncora do fundo.

## Composer modularizado (CONFIRMADO 2026-08-27)

`ConversaComposer.jsx` permanece no mesmo path e export default, mas agora tem 1 linha e funciona apenas como fachada. A implementação saiu de um arquivo de 2.551 linhas, 24 `useState`, 27 `useEffect` e 36 `useRef` para módulos de domínio. `ConversaComposerShell.jsx` tem 730 linhas, 2 estados locais, 6 efeitos passivos e 2 layout effects; os demais estados/efeitos ficam nos hooks que possuem o respectivo ciclo de vida. A interface de 44 props com `ConversaView.jsx` e os métodos do ref (`focusInput`, `setText`, `appendText`, `getInputElement`, `isRecording`, `cancelRecording`, `closePanels`, `getText`) foram preservados.

Divisão atual:

- `useComposerDraft`: restaura e persiste o rascunho por `conversaId`, mantendo o debounce de 220 ms e salvando o valor anterior antes de uma troca rápida;
- `useTypingEmitter`: concentra o timer de 400 ms, deduplica `typing_start`/`typing_stop` por conversa e limpa timer/sessão no blur, troca e unmount;
- `useSavedReplies`: chama `GET /dashboard/respostas-salvas` apenas ao abrir o painel, com `contexto: "atendimento"`, cache por departamento e generation guard para resposta antiga;
- `useAttachmentPicker`: concentra refs/portal do menu e câmera; stream obtido depois de troca/fechamento é descartado e suas tracks são encerradas;
- `useEmojiPicker` e `useStickerPicker`: estado, fechamento externo, busca e recents; envio/formatos continuam delegados aos callbacks existentes;
- `useComposerAutocorrect`: preferência, rastreamento e aplicação da autocorreção sem mudar as regras de texto;
- `useVoiceRecording`: `MediaRecorder`, chunks, duração, metadados, cancelamento e cleanup de stream/track. O envio FIFO e a bolha otimista continuam em `ConversaView.jsx` e não foram movidos;
- `ComposerFooter` e componentes visuais mantêm as classes existentes. Câmera, emojis, stickers e painel de respostas são lazy chunks carregados somente ao abrir. `conversa.css` não foi alterado nesta sessão.

Na abertura, o Composer não faz requisição HTTP direta. Respostas salvas continuam lazy e só carregam quando o usuário abre esse recurso. Anexos, stickers e áudio continuam entregando os mesmos `File`/metadados aos callbacks do `ConversaView`; portanto, `FormData`, endpoints, `client_temp_id`, ordem FIFO e payloads permanecem sob o código já existente da View.

Validação da sessão:

- `npm.cmd run test:composer`: passou (helpers, drafts separados, Enter/Shift+Enter, typing deduplicado, contratos de anexos e metadados de áudio);
- `npm.cmd run test:frontend:baseline`: 24/24 scripts Node; Playwright do atendimento 11 passaram e 1 cenário desktop-only foi ignorado no projeto mobile; reprodução de áudio 8/8;
- E2E específico do Composer: 6/6 cenários desktop/mobile para teclado/pickers/anexos, envio consecutivo e áudio. O áudio produziu duas bolhas, dois uploads, dois temp IDs únicos e concorrência máxima 1;
- `tsc --noEmit`: passou;
- build: passou, 8.577 módulos em 43,68 s; `ConversaView-DcEFtHeB.js` = 316,58 kB bruto / 92,94 kB gzip. Antes: 312,95 kB / 91,02 kB. O caminho inicial cresceu 3,63 kB bruto / 1,92 kB gzip por causa dos controladores e proteções adicionados. Os painéis raros saíram para chunks próprios: respostas 1,67/0,76 kB, stickers 1,83/0,85 kB, emojis 1,87/0,92 kB e câmera 1,94/0,87 kB (bruto/gzip). O cenário mobile de muitas mídias terminou com `gapFinal=0` e `ancoraDelta=0`;
- aviso de build preservado: URL CSS com aspa tipográfica (`background: url(“data:...`) gera warning de sintaxe; não foi corrigido porque `conversa.css` estava fora do escopo.

Limitações da validação: câmera e microfone foram exercitados com doubles determinísticos do navegador; permissões e codecs em aparelho físico, teclado iOS e Socket.IO real ainda exigem smoke manual antes do deploy.

## Bolha modularizada (CONFIRMADO 2026-08-27)

`ConversaBubble.jsx` permanece no mesmo path e export default, mas agora tem 1 linha e funciona apenas como fachada. A implementação saiu de um arquivo de 2.453 linhas, 20 `useState`, 16 `useEffect`, 3 `useLayoutEffect` e 22 `useRef` para módulos por tipo. `ConversaBubbleShell.jsx` orquestra classes, menu, gestos e o switch de tipo; o player de áudio ficou em `useAudioPlayback` + `AudioMessage`. A interface pública com `ThreadRow`/`ConversaView` (as mesmas ~38 props) foi preservada. `conversa.css` não foi alterado. `SwipeReplyTrack` continua no mesmo arquivo, com os mesmos limites (76 / 52 / 26 px).

Divisão atual:

- `classifyBubbleMessage`: identifica tipo, legenda, reply, encaminhado e flags de layout. **Não** usa `status` — pending→sent→delivered→read não remonta imagem/áudio;
- `resolveOutgoingTick`: ticks monotônicos; flag stale de offline não rebaixa tick já confirmado; grupo nunca fica azul (cap delivered no caminho numérico);
- `getRetryUiState`: botão "Tentar novamente" só em outbound com falha confirmada e `mensagem_id`; não dispara em pending/sent/delivered/read/`status_indefinido`/contato;
- Renderers: `TextMessage`, `ImageMessage` (fallback blob→servidor→proxy, herda `img.complete` na reconciliação otimista), `VideoMessage`, `StickerMessage`, `DocumentMessage`, `ContactMessage`, `LocationMessage`, `AudioMessage`;
- `QuotedReply` + `MessageCaption`: citação no topo e legenda só quando o texto não é placeholder/nome de arquivo;
- `useMessageMenu` + `MessageMenu`: portal desktop e bottom sheet mobile; `visualViewport` para teclado;
- `useMessageGestures`: long press 480 ms / 14 px, skip do tap na mídia após o menu, swipe continua em `SwipeReplyTrack`;
- `useAudioPlayback`: um `<audio>` ativo via `audioSession`, `el.load()` ao trocar `src` em tempo real, refresh do token do `/media/proxy` no (re)load, waveform, velocidades 1×/1,5×/2×, stall watchdog, retry de fonte e pause no unmount. Cache LRU de duração (teto 1000) sobrevive a remount da mesma `msgKey`.

Invariantes preservados: URLs autenticadas de mídia (`resolveBubbleMediaCandidates` / `getMediaPlaybackUrl` / `refreshProxyMediaToken`); retry não cria mensagem nova (reusa `id`/`tempId`); troca de conversa cai no cleanup do player (`pause` + limpa sessão se for o elemento atual).

Validação da sessão (CONFIRMADO 2026-08-27):

- `npm.cmd run test:bubble`: passou (tipos, temporária, ticks monotônicos, retry, reply, gestos, duração/sessão de áudio, fachada);
- `npm.cmd run test:node`: 25/25 scripts (baseline anterior 24/24 + bubble);
- `tsc --noEmit`: passou;
- build: `ConversaView` 322,58 kB bruto / 94,89 kB gzip (antes 317,00 / 93,03). CSS da conversa inalterado (286,89 / 47,21). O split de módulos aumentou ~5,58 kB / 1,86 kB gzip por wrappers; não houve extração de chunks lazy da bolha (tudo no caminho da thread);
- Playwright mock: 11 passaram e 1 cenário desktop-only foi ignorado no projeto mobile; reprodução de áudio 8/8 (play, fallback de fonte no mesmo clique, indisponível + retry, pause/resume).

Limitações: smoke visual de long press/swipe, teclado iOS e áudio em aparelho físico continuam **PENDENTE DE VALIDAÇÃO** no browser real.

## ConversaView modularizado — etapa 1 (CONFIRMADO 2026-08-27)

`ConversaView.jsx` continua no mesmo path/export, mas está sendo reduzido a coordenador extraindo features auto-contidas para hooks (mesmo padrão já existente de `useForwardFlow`, `useMediaViewer`, `useShareContact`, `useShareLocation`, `usePixConfig`, `useConversaParticipantes`). Nesta etapa saíram três features **sem alterar comportamento, endpoints ou payloads**:

- `hooks/useConversationTags.js` — painel de tags: `listarTags` só ao abrir o painel, update otimista via `setTags` (conversaStore) + `chatsStore.adicionarTag/removerTag`, rollback em erro, 409 tratado como sucesso silencioso;
- `hooks/useConversationDepartments.js` — "transferir setor": `GET /dashboard/departamentos` ao abrir, `PUT /chats/:id/departamento` com `{ departamento_id }` ou `{ remover_setor: true }`, `refresh({ silent: true })` e `setorAtual` derivado;
- `hooks/useAddToGroup.js` — adicionar contato a grupo: grupos vêm do cache do `chatsStore` (ou `fetchChats`), `POST /chats/:grupoId/participantes`, mensagens de indisponibilidade em 404/501;
- `utils/conversaAccessHelpers.js` — `normalizeDepartamentoIdForAccess` + `getUserDepartamentoIdSet` (puros), usados em `podeEnviar`/auto-assumir.

**Regra crítica que futuras IAs não podem quebrar:** o handler global `onEscape` fecha os painéis na ordem `mediaViewer → pendingFile → shareContact → shareLocation → pix → msgInfo → transferirSetor → produtos → clienteSide → timeline → tags → forward/select → reply → messageSearch → fechar conversa`. Cada hook de painel **deve expor o estado `open` e seu setter/closer** (ex.: `showTransferirSetor`/`setShowTransferirSetor`, `tagsOpen`/`setTagsOpen`) para o `onEscape` continuar referenciando-os. Ao extrair novas features de painel, mantenha essa ordem e as mesmas dependências do `useCallback` do `onEscape`.

Métricas: `ConversaView.jsx` 4840 → 4623 linhas, `useState` 49 → 38, `useCallback` 102 → 92. Node 25/25, `tsc --noEmit` e build verdes. Chunk `ConversaView` 322,59 → 323,69 kB bruto (gzip 94,91 → 95,32) — leve aumento por wrappers de módulo; ganho é de manutenção/isolamento, **não** de bundle. Envio, upload, scroll, reconciliação e virtualização **não** foram tocados nesta etapa.

## ConversaView modularizado — etapa 2 (CONFIRMADO 2026-08-27)

Mais features auto-contidas saíram para hooks/componente, **sem tocar** em envio, upload FIFO, outbox/watchdog, reconciliação, ACK/dedupe, `conversaStore`, `socket.js`, `conversaOutboundMediaMerge.js`, virtualização, scroll/âncoras nem `conversa.css`:

- `hooks/useConversationCall.js` — modal "registrar ligação": faixa 1–15 (default 5), `registrarLigacao(conversaId, dur)`, 403 = "Acesso restrito", `callSending` bloqueia fechar/reenviar. Expõe `setCallModalOpen` (o gatilho de abertura hoje **não** é chamado no código — modal inalcançável, mantido fiel);
- `hooks/useConversationSearch.js` — painel de busca de mensagens: `messageSearchOpen` + seleção de resultado (pagina via `loadMore` respeitando `hasMore`/`loadingMore`, **aborta se a conversa mudar** para não posicionar a conversa nova em resultado antigo). `scrollToMsg` é **injetado** (não altera a lógica de scroll). Expõe `openMessageSearch`/`closeMessageSearch` estáveis;
- `hooks/useConversationTimeline.js` + `components/ConversaTimelinePanel.jsx` — histórico do atendimento: estado de abertura + `carregarAtendimentos(conversaId)` ao abrir; UI (markup/CSS idênticos) fora do coordenador. Dados seguem no `conversaStore`;
- `hooks/useConversationParticipants.js` — envolve `useConversaParticipantes` (dados/reload) + estado do modal de atendentes + `handleOpenAdicionarAtendente`. Precisa rodar cedo pois `atendentesParticipantes` alimenta `podeEnviar` (co-atendente também envia); por isso deriva `conversaId = conversa?.id`. **Removido código morto** do fluxo antigo "adicionar atendente" (estados `showAdicionarAtendente`, `atendentesDisponiveis`, `atendenteSearch`, `atendentesLoading`, `adicionarAtendenteLoadingId`, o memo `atendentesDisponiveisFiltrados` e `handleAdicionarAtendente`) — não eram referenciados no JSX (a UI real é o `AtendentesModal`);
- `hooks/useConversationToast.js` — `toast`/`setToast`/`showToast` com auto-dismiss de 3500ms via `useStableTimeout`. Casos silenciosos, 409 e rollbacks continuam nos chamadores;
- `utils/conversationEscapeOrder.js` — **fonte única da ordem do `onEscape`** (`ESCAPE_PANEL_ORDER` + `buildEscapeEntries` + `runFirstActiveEscape`). O coordenador só mantém os dois passos imperativos do Composer (cancelar gravação, `closePanels()`) antes da cadeia. Coberto por `scripts/test-conversa-escape-order.mjs` (19 cenários).

**Reply/forward:** forward já vive em `useForwardFlow`. O estado de **reply** (`replyTo`) foi **mantido inline** de propósito: é lido dentro de `handleEnviar` (caminho de envio protegido) e usa `focusMessageInput` do composer; extraí-lo daria ganho mínimo e adicionaria indireção sobre a zona de envio. Documentado como pendência de baixa prioridade.

**Re-render corrigido (evidência):** `ConversaHeader` é `memo`, mas recebia `onOpenMessageSearch={() => setMessageSearchOpen(true)}` (arrow inline) → quebrava o memo **a cada render** do coordenador. Agora usa `openMessageSearch` estável (idem `closeMessageSearch` no `ConversaMessageSearchPanel`). Melhora comprovável por construção (identidade estável → memo volta a funcionar), sem medir runtime.

**View-models (Header/Thread/Composer):** o agrupamento completo de props em objetos `model`/`actions` foi **adiado deliberadamente**. Para componentes `memo`, passar primitivos/callbacks estáveis individuais já é o cenário memo-ótimo; trocar por objetos exige `useMemo` perfeito e reescrever ~30 referências internas do Header (risco de regressão visual num componente crítico mobile) para ganho **organizacional**, não de render. Recomendado como etapa dedicada com instrumentação de render.

Métricas etapa 2: `ConversaView.jsx` 4623 → 4456 linhas, `useState` 38 → 26, `useMemo` 30, `useCallback` 92 → 84, imports 65. Node **26/26** (inclui `test-conversa-escape-order`), `tsc --noEmit` e build verdes. Chunk `ConversaView` 323,69 → 325,71 kB bruto (gzip 95,32 → 95,83) — leve aumento por wrappers; ganho é isolamento/testabilidade. e2e mock: 10 passaram + 1 flaky **de navegação** (`page.goto timeout`, teste "sem saltos tardios" mobile) que passa 3/3 isolado — mesmo flaky já registrado, **sem relação** com as extrações; scroll/tolerâncias **não** alterados.

> Nota operacional: o webServer do e2e usa `reuseExistingServer: true` com `npm run dev`. Se sobrar um `vite dev` antigo na porta 5173 (iniciado sem `VITE_API_URL=http://localhost:5000`), o Playwright **reutiliza** esse servidor e a suíte trava no login apontando pra API de produção (11/12 falham). Encerre o processo da 5173 antes de rodar o mock.

## ConversaView modularizado — etapa 3 (CONFIRMADO 2026-08-27)

Redução estrutural para o coordenador ficar **abaixo de 3000 linhas** (4456 → **2903**). Algoritmos de envio/FIFO/watchdog/outbox/scroll **não foram reescritos** — só mudaram de arquivo.

- `utils/buildMensagensComSeparadores.js` — montagem da lista virtual (dias, remetente em grupo, reações inbound, bundle foto+legenda); cache WeakMap preservado;
- `hooks/useConversationHeaderIdentity.js` — nome/avatar/badge/instância WhatsApp/`fromChat` (sticky da lista);
- `hooks/useConversationSelection.js` — pins/stars/seleção (âncora de scroll da barra sticky **inalterada**);
- `hooks/useConversationReactions.js` — reagir/remover reação;
- `hooks/useConversationThreadActions.js` — CTAs assumir/reabrir/histórico antigo/marcar lida (modo simples);
- `hooks/usePendingOutgoingLifecycle.js` — tick do watchdog + flush da outbox (mesmo intervalo, mesmos payloads);
- `hooks/useConversationOutboundMedia.js` — `handleEnviarArquivo`, lotes fototeca/documentos, sticker, preview confirm (FIFO de áudio **idêntico**; import dinâmico do crop aponta para `../utils/imageCropExport.js`);
- `components/ConversaViewOverlays.jsx` + `ConversaDropOverlay` / `ConversaSetorPanel` / `ConversaTagsPanel` — JSX de painéis/modais fora do coordenador. Timeline permanece entre header e mensagens (fluxo de layout).

**Contratos:** `onEscape` continua em `conversationEscapeOrder.js`. Scroll/`useAutoScroll`/âncoras continuam no coordenador. `handleEnviar` (texto) permanece inline porque lê `replyTo` e a fila de texto.

Métricas etapa 3: linhas 4456 → **2903**, `useState` 26 → **13**. Node 26/26, `tsc --noEmit` e build verdes. Chunk `ConversaView` 325,71 → **335,44 kB** (gzip 95,83 → **98,20**) — aumento por wrappers; organização, não velocidade.

**Correção 2026-08-27:** `canReabrir` voltou ao import de `permissions` em `ConversaView.jsx`. Sem isso o ErrorBoundary (“Algo deu errado”) disparava ao abrir qualquer conversa (e2e mock 11 falhas). O hook `useConversationThreadActions` já importava; o coordenador também usa `canReabrir` em `conversaElegivelAutoReabrir`.

Abertura da conversa (CONFIRMADO 2026-08-24): máscara `.wa-messages--opening` fica até o snap assentar (`onOpenSnapReady` no `useAutoScroll`, ~6 frames no desktop / 1 rAF no mobile). Não tirar a máscara no mesmo layout em que `loading` vira false — isso pintava o thread no topo e depois “puxava” ao fim. Foto/nome do header preferem a row da lista (`fromChat`) para não trocar URL no GET. `zapMsgsInitialPassRef` reseta no render da troca. Bolha nova anima só com `.zap-message-enter` — nunca `animation` em todo `.wa-bubble` (ao sair da máscara isso reanimava o thread inteiro). `snapIfStickBottom` não corre enquanto a máscara está ativa.

Painel **Detalhes do cliente** (`SidebarCliente`, 2026-08-27): Salvar nome faz `PUT /chats/:id/nome-contato` (grava `conversas.nome_contato_cache` + `clientes.nome`) e aplica na hora via `renameChatContact` (lista) + `patchConversa` (header). Clique fora fecha: backdrop `.wa-floatingSheet-backdrop--cliente` no desktop + listener no `document`; no mobile o overlay já existia. Esc também fecha (`ConversaView`).

## Envio otimista (CONFIRMADO)

1. `buildOptimisticOutgoingMessage` (`conversaOptimisticMessage.js`) → `tempId` / `client_temp_id`, `direcao: "out"`, blob URL se mídia.
2. `anexarMensagemImediata` (`flushSync` quando possível).
3. `bumpChatListWithOptimisticMessage`.
4. HTTP texto/arquivo → `reconciliarMensagem(tempId, realMsg)`.
5. Merge outbound: `conversaOutboundMediaMerge.js` (UPSERT por temp / wa / id / fingerprint). Áudios distintos **não** colapsam.

Não substitua isso por “espera o POST e só então pinta a bolha”.

## Watchdog — `pendingMessageWatchdog.js`

- Soft ~45s → `envio_demorado`
- Hard ~180s → `status_indefinido` + refresh
- Tick ~15s em `ConversaView` → `applyPendingOutgoingWatchdog`
- Não age se `aguardando_conexao`

## Outbox offline — `offlineOutbox.js`

- Key `zap:outbox:text:v1`
- **Só texto**; preserva `tempId` para o backend deduplicar
- `enqueueOutboxText` → `flushOutbox` on `online`
- Hydrate no load da conversa (bolha sobrevive a F5)
- Status visual: `aguardando_conexao`

## Mídia

Composer, `PendingMediaPreview`, `ImageSendPreviewMobile`. Áudios em fila FIFO no `ConversaView`. Viewer: `MediaViewerOverlay`. Mic: `media/micStreamService.js` + `audioRecordingLifecycle.js` (stop idempotente).

Tipos de bolha (CONFIRMADO 2026-08-27): texto, imagem, vídeo, áudio/ptt/voice, documento, sticker, location, vcard/contato, call. Renderers em `bubble/components/*`; classificação em `classifyBubbleMessage`. **Nota interna** e movimentação interna continuam em `ThreadRow.jsx` (não passam pela Bubble). Player de áudio: `useAudioPlayback` (`el.load()` ao trocar src; um elemento ativo; pause no unmount). Status visual: `resolveOutgoingTick`. Retry de envio: `getRetryUiState` — reusa o `id` existente, não cria bolha nova.

## IDs e dedupe (invariantes)

Preferência: `whatsapp_id` → `id` → `tempId` → synthetic. Drop se `conversa_id` ≠ conversa aberta. Direção: normalizar `fromMe` / `from_me` / `isFromMe` → `direcao` in/out.

HTTP: `conversa/conversaService.js` (superfície grande: mensagens, PIX, encaminhar, arquivo, reação, assumir/encerrar/transferir, atendentes, notas, localização).

Hotkeys: `hooks/useGlobalHotkeys.js`. Encaminhar/contato/local: hooks `useForwardFlow`, `useShareContact`, `useShareLocation`.
