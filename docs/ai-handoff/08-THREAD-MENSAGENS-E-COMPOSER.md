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
| `ConversaBubble.jsx` / `ThreadRow.jsx` | memo + `threadRowPropsAreEqual` |
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

Abertura da conversa (CONFIRMADO 2026-08-24): máscara `.wa-messages--opening` fica até o snap assentar (`onOpenSnapReady` no `useAutoScroll`, ~6 frames no desktop / 1 rAF no mobile). Não tirar a máscara no mesmo layout em que `loading` vira false — isso pintava o thread no topo e depois “puxava” ao fim. Foto/nome do header preferem a row da lista (`fromChat`) para não trocar URL no GET. `zapMsgsInitialPassRef` reseta no render da troca. Bolha nova anima só com `.zap-message-enter` — nunca `animation` em todo `.wa-bubble` (ao sair da máscara isso reanimava o thread inteiro). `snapIfStickBottom` não corre enquanto a máscara está ativa.

Painel **Detalhes do cliente** (`SidebarCliente`, 2026-08-27): Salvar nome faz `PUT /chats/:id/nome-contato` (grava `conversas.nome_contato_cache` + `clientes.nome`) e aplica o patch na hora em `conversaStore`/`chatsStore` (`contato_nome`, `nome_contato_cache`, `cliente_nome`). Clique fora fecha: backdrop `.wa-floatingSheet-backdrop--cliente` no desktop + listener no `document`; no mobile o overlay já existia. Esc também fecha (`ConversaView`).

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

Tipos de bolha: texto, imagem, vídeo, áudio/ptt/voice, documento, sticker, location, vcard, **nota interna** (não vai ao WhatsApp).

## IDs e dedupe (invariantes)

Preferência: `whatsapp_id` → `id` → `tempId` → synthetic. Drop se `conversa_id` ≠ conversa aberta. Direção: normalizar `fromMe` / `from_me` / `isFromMe` → `direcao` in/out.

HTTP: `conversa/conversaService.js` (superfície grande: mensagens, PIX, encaminhar, arquivo, reação, assumir/encerrar/transferir, atendentes, notas, localização).

Hotkeys: `hooks/useGlobalHotkeys.js`. Encaminhar/contato/local: hooks `useForwardFlow`, `useShareContact`, `useShareLocation`.
