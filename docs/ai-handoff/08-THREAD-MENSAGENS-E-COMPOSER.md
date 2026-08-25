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
| `ConversaComposer.jsx` | texto, mídia, áudio; `composerPropsAreEqual` |
| `components/ConversaHeader.jsx` | |
| `SidebarCliente.jsx` | lazy; observação, vínculo |
| `composerDraftStore.js` | rascunho por conversa |

Virtualização: desktop sempre; mobile se `> 24` rows (`MOBILE_VIRTUALIZE_THRESHOLD`); senão lista estática. Medir mídia **durante** scroll de histórico não pode soltar a âncora do fundo.

Abertura da conversa (CONFIRMADO 2026-08-24): máscara `.wa-messages--opening` fica até o snap assentar (`onOpenSnapReady` no `useAutoScroll`, ~6 frames no desktop / 1 rAF no mobile). Não tirar a máscara no mesmo layout em que `loading` vira false — isso pintava o thread no topo e depois “puxava” ao fim. Foto/nome do header preferem a row da lista (`fromChat`) para não trocar URL no GET. `zapMsgsInitialPassRef` reseta no render da troca. Bolha nova anima só com `.zap-message-enter` — nunca `animation` em todo `.wa-bubble` (ao sair da máscara isso reanimava o thread inteiro). `snapIfStickBottom` não corre enquanto a máscara está ativa.

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
