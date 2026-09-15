# Thread, mensagens e composer

> 2026-08-23 · `src/conversa/`. Segundo caminho quente. Duplicar mensagem, perder áudio ou quebrar scroll quase sempre nasce aqui.

## Store `conversaStore.js` (CONFIRMADO)

Estado: `selectedId`, `conversa`, `mensagens`, `tags`, loading/erro, `lockedBy`, cursores de histórico, atendimentos, typing, fila de append no composer, flag de preservar scroll.

Cache in-memory de mensagens: Map TTL ~20 min, teto ~48 conversas.

`carregarConversa`: abort + generation → shell da lista → `GET` chat (`limit` 16 no mobile / 100 no desktop) → `mapDedupeKey` → merge com otimistas → `hydrateOutboxBubblesForConversa` → `join_conversa` + `marcar_conversa_lida` → `clearUnread`. Sem `refresh()` extra após um GET de abertura bem-sucedido.

**Header (2026-09-03):** nome e foto vêm da row da lista (`fromChat` / `getDisplayName`) para não piscar quando o GET chega. Fallback para a conversa da API se a row não estiver no array atual.

**Refresh concorrente (corrigido em 2026-09-02):** `refresh` captura a geração da abertura e possui seu próprio AbortController. Um novo refresh cancela o anterior; trocar/fechar a seleção ou limpar a store cancela ambos os tipos de GET. Uma resposta ou erro antigo não pode alterar mensagens, metadados, cursores nem loading da geração atual. Refresh solicitado durante a abertura aguarda sua conclusão, e apenas o mais recente segue. Teste `scripts/test-conversa-refresh-races.mjs`: 11 cenários, incluindo A→B→A, fechamento/reabertura da UI, erros atrasados, reset, concorrência e preservação de bolha otimista.

Outras actions: `anexarMensagem` / `Imediata`, `reconciliarMensagem`, `patchMensagem`, remover, marcar temp erro / envio incerto / aguardando conexão, `applyPendingOutgoingWatchdog`, assumir/transferir/encerrar/reabrir/aguardar, `patchConversa` / `patchLock`.

**Envio por admin em conversa de outro (2026-09-09):** `podeEnviar` libera **apenas** `perfil/role === admin` quando há outro `atendente_id`. O admin não assume a conversa no otimista (`shouldAutoAssumirOnOutgoingSend` já ignora dono alheio). Backend: `assertPodeEnviarMensagem` reason `admin_envio_sem_assumir`. Supervisor/atendente continuam bloqueados.

**Auto-assumir no envio (CONFIRMADO 2026-09-02):** `applyOutgoingStatusOptimistic` em `ConversaView.jsx` assume na hora se a conversa está **Aberta** (sem outro dono). Falha do POST reverte. Detalhe da lista: `07-LISTA-DE-CONVERSAS.md`.

## UI

| Arquivo | Papel |
|---------|--------|
| `ConversaView.jsx` | shell: header, thread, composer, sidebar, send, watchdog, outbox, viewer |
| `ConversaThread.jsx` | day separators; escolhe virtual vs estático |
| `ConversaMessageVirtualList.jsx` | `@tanstack/react-virtual`, overscan ~12, `estimateSize` por tipo |
| `ThreadRow.jsx` | memo + `threadRowPropsAreEqual`; escolhe Bubble / nota interna / movimentação |
| `ConversaBubble.jsx` | fachada compatível; reexporta `bubble/ConversaBubbleShell.jsx` |
| `bubble/ConversaBubbleShell.jsx` | orquestra tipos, menu, gestos, retry e classes da bolha |
| `bubble/components/*` | texto, imagem, vídeo, sticker, documento, contato, localização, **enquete/poll**, áudio, status, menu, reações |
| `bubble/hooks/*` | menu, long press/swipe de mídia, retry de envio e playback de áudio |
| `bubble/utils/*` | classify, status, retry, location, sessão/duração de áudio |
| `ConversaComposer.jsx` | fachada compatível; reexporta `composer/ConversaComposerShell.jsx` |
| `composer/ConversaComposerShell.jsx` | coordena texto, modo nota, painéis e a interface pública do Composer |
| `composer/components/*` | footer, anexos/câmera, emojis, stickers, respostas salvas, reply bar e gravador |
| `composer/hooks/*` | draft, typing, respostas, anexos/câmera, autocorreção, pickers e gravação |
| `composer/utils/*` | funções puras de teclado, mídia gravada, chaves/contexto e comparação de props |
| `components/ConversaHeader.jsx` | clique em avatar+nome abre o perfil (`onOpenClienteSide`); foto ampliada só no painel |
| `SidebarCliente.jsx` | lazy; perfil estilo WhatsApp; **Ligar** abre `tel:` para conversar no telefone e, no Whapi, também dispara `POST /chats/:id/ligacao` (toque de atenção); UltraMSG só `tel:`; **Excluir contato** (admin) → `DELETE /chats/:id?apagar_cliente=1` remove conversa+mensagens+cliente; observação, vínculo, rename; clique fora fecha; clique na foto abre o lightbox |
| `composerDraftStore.js` | rascunho por conversa |

Virtualização: desktop sempre; mobile se `> 24` rows (`MOBILE_VIRTUALIZE_THRESHOLD`); senão lista estática. Medir mídia **durante** scroll de histórico não pode soltar a âncora do fundo.

**Texto longo sem espaço (CONFIRMADO 2026-09-02):** token/hash/URL esticava a bolha (`overflow-wrap: break-word` não reduz min-content). Bolha/texto/legenda usam `overflow-wrap: anywhere`. Texto + hora inline vai em `.wa-bubble-textBody`.

**Seleção de texto na bolha (CONFIRMADO 2026-09-14):** no desktop (`hover: hover` + `pointer: fine`, sem `.wa-bubble--mobileUx` e fora do `selectMode`) o texto/legenda/link da mensagem pode ser destacado com o mouse (arrastar, duplo clique, Ctrl+C), como no WhatsApp Web. O `selectstart` da bolha só chama `preventDefault` em `selectMode` ou `mobileMessageChrome` — no toque a seleção nativa continua bloqueada para o long-press do menu não abrir o highlight azul do iOS. Horário/ticks (`.wa-inlineMeta`) não entram na seleção.

**Selecionar uma mensagem com o mouse (CONFIRMADO 2026-09-14):** o círculo ao lado da bolha no hover é **reação**, não seleção. Para marcar aquela mensagem: (1) checkbox vazio `.wa-selectChk--hover` ao lado da bolha no desktop; (2) **Ctrl+clique** (Cmd no Mac) na linha; (3) menu ▾ → **Selecionar**. Isso chama `startSelect` e abre a barra `.wa-selectBar`. No modo seleção, clicar a linha/bolha alterna o checkbox. Mobile: long-press → Selecionar. O hover-checkbox não aparece em `pointer: coarse`.

**Cores da nota interna e do modal de atendentes (CONFIRMADO 2026-09-02):** a nota usava texto âmbar claro (`prefers-color-scheme: dark` sem guard de `data-theme`) em card beige — contraste baixo. Card/composer agora têm tokens `--note-*` opacos no próprio card; dark só com `[data-theme=dark]` ou `html:not([data-theme=light])`. Modal `AtendentesModal` (`atendentes.css`): avatares/busca/botão Adicionar no verde `--ds-accent` (sumiu o roxo `#7c3aed`); cargo/empty usam `--ds-text-secondary` / `#cbd5e1` no dark. CSS em `conversa.css` (`.wa-internalNote-*`, `.wa-footer--nota`, `.wa-notaBadge`) e `atendimento/atendentes.css`.

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
- Renderers: `TextMessage`, `ImageMessage` (fallback blob→servidor→proxy, herda `img.complete` na reconciliação otimista; clique no visualizador usa o `src` já carregado e o overlay cai proxy→URL direta com `referrerPolicy=no-referrer`), `VideoMessage`, `StickerMessage`, `DocumentMessage`, `ContactMessage`, `LocationMessage`, `AudioMessage`;
- `DocumentMessage` "Abrir"/"Salvar como…" (2026-09-11): API em outro host → o navegador **ignora** `<a download>`. `buildMediaOpenHref`/`buildMediaDownloadHref` acrescentam `?filename=<nome real>&disposition=inline|attachment` só em `/uploads` da API (`withUploadDownloadHints`); o backend devolve Content-Disposition com o nome real. URLs externas seguem pelo `/media/proxy` (que já recebia `filename`). `getMediaPlaybackUrl` (áudio/imagem/vídeo) **não** ganha parâmetros. Regressão: cenários 12–14 de `scripts/test-audio-playback-candidates.mjs`;
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

**Correções de status, teclado e mídia em 2026-09-02:** removida a segunda varredura de status por janela de 60 segundos; o patch usa identidade exata com guarda de conversa. Fechar o teclado preserva a intenção anterior de acompanhar o final ou ler o histórico. Mídia local com falha/incerteza exibe aviso de perda da cópia ao recarregar/fechar a página; a outbox de texto permanece e arquivos não ganharam persistência. Testes Node e navegador controlado passaram; teclado em celular físico continua pendente. Detalhes em `../audits/correcoes-busca-teclado-status-midia-2026-09-02.md`.

## ConversaView modularizado — etapa 1 (CONFIRMADO 2026-08-27)

`ConversaView.jsx` continua no mesmo path/export, mas está sendo reduzido a coordenador extraindo features auto-contidas para hooks (mesmo padrão já existente de `useForwardFlow`, `useMediaViewer`, `useShareContact`, `useShareLocation`, `usePixConfig`, `useConversaParticipantes`). Nesta etapa saíram três features **sem alterar comportamento, endpoints ou payloads**:

- `hooks/useConversationTags.js` — painel de tags: `listarTags` só ao abrir o painel, update otimista via `setTags` (conversaStore) + `chatsStore.adicionarTag/removerTag`, rollback em erro, 409 tratado como sucesso silencioso;
- `hooks/useConversationDepartments.js` — "transferir setor": `GET /dashboard/departamentos` ao abrir, `PUT /chats/:id/departamento` com `{ departamento_id }` ou `{ remover_setor: true }`, `refresh({ silent: true })` e `setorAtual` derivado;
- `hooks/useAddToGroup.js` — adicionar contato a grupo: grupos vêm do cache do `chatsStore` (ou `fetchChats`), `POST /chats/:grupoId/participantes` (rota real no backend Whapi);
- `SidebarGrupo.jsx` + `hooks/useGroupWhatsapp.js` + `groupWhatsappService.js` — perfil de grupo estilo WhatsApp: nomes dos participantes (cadastro + `getContact`), admins, convite, settings, foto, sair, pedidos de entrada;
- `utils/conversaAccessHelpers.js` — `normalizeDepartamentoIdForAccess` + `getUserDepartamentoIdSet` (puros), usados em `podeEnviar`/auto-assumir.

**Regra crítica que futuras IAs não podem quebrar:** o handler global `onEscape` fecha os painéis na ordem `mediaViewer → pendingFile → shareContact → shareLocation → pix → msgInfo → transferirSetor → produtos → clienteSide → timeline → tags → forward/select → edit → reply → messageSearch → fechar conversa`. Cada hook de painel **deve expor o estado `open` e seu setter/closer** (ex.: `showTransferirSetor`/`setShowTransferirSetor`, `tagsOpen`/`setTagsOpen`) para o `onEscape` continuar referenciando-os. Ao extrair novas features de painel, mantenha essa ordem e as mesmas dependências do `useCallback` do `onEscape`.

Métricas: `ConversaView.jsx` 4840 → 4623 linhas, `useState` 49 → 38, `useCallback` 102 → 92. Node 25/25, `tsc --noEmit` e build verdes. Chunk `ConversaView` 322,59 → 323,69 kB bruto (gzip 94,91 → 95,32) — leve aumento por wrappers de módulo; ganho é de manutenção/isolamento, **não** de bundle. Envio, upload, scroll, reconciliação e virtualização **não** foram tocados nesta etapa.

## ConversaView modularizado — etapa 2 (CONFIRMADO 2026-08-27)

Mais features auto-contidas saíram para hooks/componente, **sem tocar** em envio, upload FIFO, outbox/watchdog, reconciliação, ACK/dedupe, `conversaStore`, `socket.js`, `conversaOutboundMediaMerge.js`, virtualização, scroll/âncoras nem `conversa.css`:

- `hooks/useConversationCall.js` — toque WhatsApp via `registrarLigacao(conversaId, dur)` (1–30s, default 15). O perfil passa `{ deviceCallOpened }` quando já abriu `tel:`; falha Whapi vira aviso, não bloqueia a ligação no telefone. 403 = "Acesso restrito". `setCallModalOpen` existe (modal opcional);
- `hooks/useConversationSearch.js` — painel de busca de mensagens: `messageSearchOpen` + seleção de resultado (pagina via `loadMore` respeitando `hasMore`/`loadingMore`, **aborta se a conversa mudar** para não posicionar a conversa nova em resultado antigo). `scrollToMsg` é **injetado** (não altera a lógica de scroll). Expõe `openMessageSearch`/`closeMessageSearch` estáveis;
- `hooks/useConversationTimeline.js` + `components/ConversaTimelinePanel.jsx` — histórico do atendimento: estado de abertura + `carregarAtendimentos(conversaId)` ao abrir; UI (markup/CSS idênticos) fora do coordenador. Dados seguem no `conversaStore`;
- `hooks/useConversationParticipants.js` — envolve `useConversaParticipantes` (dados/reload) + estado do modal de atendentes + `handleOpenAdicionarAtendente`. Precisa rodar cedo pois `atendentesParticipantes` alimenta `podeEnviar` (co-atendente também envia); por isso deriva `conversaId = conversa?.id`. **Removido código morto** do fluxo antigo "adicionar atendente" (estados `showAdicionarAtendente`, `atendentesDisponiveis`, `atendenteSearch`, `atendentesLoading`, `adicionarAtendenteLoadingId`, o memo `atendentesDisponiveisFiltrados` e `handleAdicionarAtendente`) — não eram referenciados no JSX (a UI real é o `AtendentesModal`);
- `hooks/useConversationToast.js` — `toast`/`setToast`/`showToast` com auto-dismiss de 3500ms via `useStableTimeout`. Casos silenciosos, 409 e rollbacks continuam nos chamadores;
- `utils/conversationEscapeOrder.js` — **fonte única da ordem do `onEscape`** (`ESCAPE_PANEL_ORDER` + `buildEscapeEntries` + `runFirstActiveEscape`). O coordenador só mantém os dois passos imperativos do Composer (cancelar gravação, `closePanels()`) antes da cadeia. Coberto por `scripts/test-conversa-escape-order.mjs`.

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
- `hooks/useConversationThreadActions.js` — CTAs assumir/reabrir/histórico antigo/marcar lida (modo simples). Sucesso de assumir **não** dispara toast (o badge já confirma; no mobile o aviso cobria o header);

**Toasts de assumir/encerrar (CONFIRMADO 2026-09-02):** `AtendimentoActions` não mostra toast de sucesso ao assumir nem ao encerrar. Erros continuam. O estado aparece no badge / painel de encerrado.
- `hooks/usePendingOutgoingLifecycle.js` — tick do watchdog + flush da outbox (mesmo intervalo, mesmos payloads);
- `hooks/useConversationOutboundMedia.js` — `handleEnviarArquivo`, lotes fototeca/documentos, sticker, preview confirm (FIFO de áudio **idêntico**; import dinâmico do crop aponta para `../utils/imageCropExport.js`);
- `components/ConversaViewOverlays.jsx` + `ConversaDropOverlay` / `ConversaSetorPanel` / `ConversaTagsPanel` — JSX de painéis/modais fora do coordenador. Timeline permanece entre header e mensagens (fluxo de layout).

**Contratos:** `onEscape` continua em `conversationEscapeOrder.js`. Scroll/`useAutoScroll`/âncoras continuam no coordenador. `handleEnviar` (texto) permanece inline porque lê `replyTo` e a fila de texto.

Métricas etapa 3: linhas 4456 → **2903**, `useState` 26 → **13**. Node 26/26, `tsc --noEmit` e build verdes. Chunk `ConversaView` 325,71 → **335,44 kB** (gzip 95,83 → **98,20**) — aumento por wrappers; organização, não velocidade.

**Correção 2026-08-27:** `canReabrir` voltou ao import de `permissions` em `ConversaView.jsx`. Sem isso o ErrorBoundary (“Algo deu errado”) disparava ao abrir qualquer conversa (e2e mock 11 falhas). O hook `useConversationThreadActions` já importava; o coordenador também usa `canReabrir` em `conversaElegivelAutoReabrir`.

Abertura da conversa (CONFIRMADO 2026-08-24): máscara `.wa-messages--opening` fica até o snap assentar (`onOpenSnapReady` no `useAutoScroll`, ~6 frames no desktop / 1 rAF no mobile). Não tirar a máscara no mesmo layout em que `loading` vira false — isso pintava o thread no topo e depois “puxava” ao fim. Foto/nome do header preferem a row da lista (`fromChat`) para não trocar URL no GET. `zapMsgsInitialPassRef` reseta no render da troca. Bolha nova anima só com `.zap-message-enter` — nunca `animation` em todo `.wa-bubble` (ao sair da máscara isso reanimava o thread inteiro). `snapIfStickBottom` não corre enquanto a máscara está ativa.

Painel **Dados do contato** (`SidebarCliente`, 2026-09-07): clicar no bloco identidade do cabeçalho (avatar + nome) abre o perfil, como no WhatsApp Web — não amplia a foto. A foto grande do painel é que abre o lightbox (`openMediaViewer` + `pickLoadedMediaSrcFromEvent`). Salvar nome faz `PUT /chats/:id/nome-contato` (grava `conversas.nome_contato_cache` + `clientes.nome`) e aplica na hora via `renameChatContact` (lista) + `patchConversa` (header). Clique fora fecha: backdrop `.wa-floatingSheet-backdrop--cliente` no desktop + listener no `document` (ignora cabeçalho e lightbox); no mobile o overlay já existia. Esc também fecha (`ConversaView`).

## Envio otimista (CONFIRMADO)

1. `buildOptimisticOutgoingMessage` (`conversaOptimisticMessage.js`) → `tempId` / `client_temp_id`, `direcao: "out"`, blob URL se mídia.
2. `anexarMensagemImediata` (`flushSync` quando possível).
3. `bumpChatListWithOptimisticMessage`.
4. HTTP texto/arquivo → `reconciliarMensagem(tempId, realMsg)`.
5. Merge outbound: `conversaOutboundMediaMerge.js` (UPSERT por temp / wa / id / fingerprint). Áudios distintos **não** colapsam.

Não substitua isso por “espera o POST e só então pinta a bolha”.

**Glitch de ~1s no envio (CONFIRMADO 2026-09-14; nome 2026-09-15):** a bolha otimista usava `Date.now()` como `criado_em`. Em envios seguidos no mesmo minuto o relógio local fica alguns ms atrás do timestamp que o servidor já gravou nas bolhas anteriores — o sort por `criado_em` enfiava a mensagem nova no meio e o nome do contato/conversa podia aparecer no lugar do atendente até o HTTP/socket reconciliar. Correção: `resolveOptimisticCriadoEm` ancora depois da última mensagem da thread; no mesmo segundo a bolha `temp` sem id/wa vai ao fim. `pickOptimisticUsuarioNome` **mantém o JWT quando ele é o nome do atendente** e só cai para a thread se o JWT for o título do chat, o nome da instância WhatsApp ou o pushname de fromMe do aparelho. `buildUsuarioMePatch` copia `nome` do GET `/usuarios/me` para o `authStore` (o JWT pode ficar com “Mensagem Teste ZapERP” enquanto `usuarios.nome` já é Miguel). A pintura da bolha continua só com `msg.usuario_nome`; pendente igual ao `peerName` não aparece. Testes: `scripts/test-optimistic-send-glitch.mjs` + `test-conversa-bubble.mjs`.

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

Composer, `PendingMediaPreview`, `ImageSendPreviewMobile` (editor unificado no envio de foto, **desktop e mobile**). Áudios em fila FIFO no `ConversaView`. Viewer: `MediaViewerOverlay` — em fotos/figurinhas (e arquivos-imagem) há zoom no lightbox: roda do mouse (frente = ampliar), arrastar para pan quando ampliado, duplo clique (1× ↔ 2,5×), pinch no touch; badge de %; reset ao trocar URL. Vídeo/PDF sem zoom. Mic: `media/micStreamService.js` + `audioRecordingLifecycle.js` (stop idempotente).

**Editor de foto no envio / print (CONFIRMADO 2026-09-14):** ao colar um print ou anexar JPG/PNG/WebP, `PendingMediaPreview` abre o editor (`ImageSendPreviewMobile`) também no desktop — não só em `headerCompact`. Ferramentas: **Cortar** (quadro `react-image-crop`), **Editar** (caneta com cores), **Filtro** (Vívido/Quente/Frio/P&B/Contraste/Suave), girar 90°, redefinir e enviar original. Exporta em `exportEditedImageFile` (`imageCropExport.js`) a partir do blob já girado (`imageSrc`), com filtro + traços + recorte. GIF/SVG continuam sem editor (`isEditableImageForSend`). Vídeo/arquivo seguem o preview estático. Teste: `scripts/test-image-send-edit.mjs`.

Tipos de bolha (CONFIRMADO 2026-08-27): texto, imagem, vídeo, áudio/ptt/voice, documento, sticker, location, vcard/contato, call, **poll/enquete** (`PollMessage`; meta em `reply_meta.poll`). Renderers em `bubble/components/*`; classificação em `classifyBubbleMessage`. **Nota interna** e movimentação interna continuam em `ThreadRow.jsx` (não passam pela Bubble). Player de áudio: `useAudioPlayback` (`el.load()` ao trocar src; um elemento ativo; pause no unmount). Status visual: `resolveOutgoingTick`. Retry de envio: `getRetryUiState` — reusa o `id` existente, não cria bolha nova.

## IDs e dedupe (invariantes)

Preferência: `whatsapp_id` → `id` → `tempId` → synthetic. Drop se `conversa_id` ≠ conversa aberta. Direção: normalizar `fromMe` / `from_me` / `isFromMe` → `direcao` in/out.

HTTP: `conversa/conversaService.js` (superfície grande: mensagens, PIX, encaminhar, arquivo, reação, assumir/encerrar/transferir, atendentes, notas, localização, **enquete**, **editar mensagem**).

## Enquete / Poll (CONFIRMADO 2026-09-08)

Canal Whapi: `POST /chats/:id/enquete` (`title`, `options` ≥2, `count` 1=única / 0=múltipla). UltraMSG → 501. Menu Anexos → **Enquete** → `SendPollModal` (`useSendPoll`). Bolha `tipo: 'poll'` com `reply_meta.poll` (não conta como citação no `hasReply`).

**Voto (live):** Whapi manda `votes: [{ id: '<sha256-base64>' }]`; o backend (`extractPollVote` + `enrichNormalizedPollVote`) resolve para o texto da opção e grava inbound de texto — **nunca persiste o hash cru**. A bolha da enquete atualiza em tempo real (`reply_meta.poll.last_vote` / `results`) via `mensagem_editada` com `editada:false` + `reply_meta` (socket em `socket.js`). Sem UI de votar no CRM. Front: `finalizeMensagensList` mascara hash residual, colapsa ecos `(voto na enquete)` e força dedupe por mesmo `id`/`whatsapp_id` (evita warning React de key duplicada).

**Edição do cliente (inbound, 2026-09-08):** webhook Whapi (`edited:true`, `type:edit` mobile, ou `action.type:edit`) → `applyWhapiEditedMessage` atualiza a linha por `whatsapp_id` e emite `mensagem_editada`. Front (`socket.js`): se a conversa estiver aberta, `patchMensagem` troca o texto e marca `Editada` sem reordenar/scroll. Lista: `ultima_mensagem` quando a bolha editada for a última.

**Presença do contato (Whapi, 2026-09-08):** socket `presenca_contato` → `conversaStore.contactPresence` (live). Hydrate HTTP `GET /chats/:id/presenca` fica **desligado por padrão** (`VITE_WHAPI_PRESENCE_HTTP=1` para religar) — evita 502 no console enquanto o backend antigo ainda devolve 502. Backend novo: soft-fail **200** (`status:null`, `pending:true`) quando a Whapi falha.

**Edição inbound do cliente:** webhook Whapi `edited:true` (ou `action.type=edit` + `action.target`) atualiza a linha e emite `mensagem_editada` via `emitirEventoEmpresaConversa` (não só room `conversa_*`).

## Edição de mensagem (CONFIRMADO 2026-09-07)

Backend: `PATCH /chats/:conversaId/mensagens/:mensagemId` com `{ texto }` (aliases `conteudo`/`caption`/`legenda`). Não envia arquivo; mídia só troca a legenda. Janela WhatsApp 15 min. UltraMSG responde 422 — o menu **não** mostra "Editar" se `conversa.whatsapp_instance_provider !== "whapi"` (exceto nota interna, só local).

- `canEditMessage` em `bubble/utils/bubbleClassify.js` (espelha autor de `canDeleteMessageForEveryone`; só o autor; tipos texto/imagem/vídeo/arquivo; nota `internal_note` ignora provider e `whatsapp_id`).
- Menu: item **Editar** acima de Apagar (`MessageMenu.jsx`, bottom sheet mobile incluso). `onAction("edit")` → `ConversaView` modo edição.
- Composer: barra tipo reply ("Editando mensagem" + X). Enter/check faz PATCH, não POST. Esc cancela (`edit` na cadeia do `onEscape`, antes de `reply`). Otimista: `patchMensagem` na mesma bolha (`preserveOrder`); falha reverte texto e toast. Sem `tempId` novo, sem outbox.
- Socket `mensagem_editada`: `shouldIgnoreByCompany`; `patchMensagem` com `texto`/`editada`/`editado`/`editada_em` se a conversa está aberta; `chatsStore.setUltimaMensagem` se vier `ultima_mensagem`. Não remove, não reordena, não mexe no scroll.
- Badge **Editada** perto do horário (`editado === true` ou alias `editada`; `undefined` = não editada). `threadRowCompare` compara o alias.
- `company_id` nunca no body. Fechar a thread não encerra o atendimento.

Hotkeys: `hooks/useGlobalHotkeys.js`. Encaminhar/contato/local/enquete: hooks `useForwardFlow`, `useShareContact`, `useShareLocation`, `useSendPoll`.

## Auditoria estática de 2026-09-09

messageRowVisualSignature agora inclui reply_meta.poll serializado quando houver enquete. O evento mensagem_editada pode atualizar results/last_vote com editada:false e sem alterar texto/status/editada_em; comparar apenas a citação fazia ThreadRow ignorar a atualização visual da enquete.

useAutoScroll, visualViewport, envio otimista e barras sticky foram preservados. Permanecem pendentes a validação visual da transição da pinBar e a recuperação de nota interna em erro/socket indisponível. A análise não equivale a homologação em navegador ou celular; nenhum teste foi executado nesta auditoria. Evidências, limites e roteiros no [relatório de certificação](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/certificacao-atendimento-2026-09-09.md).
