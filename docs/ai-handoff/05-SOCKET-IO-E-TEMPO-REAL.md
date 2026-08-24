# Socket.IO e tempo real (frontend)

> 2026-08-23 · `src/socket/socket.js`, `events.js`, `statusMensagemBatch.js`, bridges em `internal-chat/` e `helpdesk/`. Cruzar com `backend/docs/ai-handoff/07-SOCKET-IO-E-TEMPO-REAL.md` se a mudança for no servidor.

## Conexão (CONFIRMADO)

- `io(getApiBaseUrl(), { auth: { token }, transports: ["websocket","polling"], reconnectionDelay: 500, reconnectionDelayMax: 3000 })`
- Reconnect “awake”: `focus`, `online`, `pageshow`, `visibilitychange` → `connect()`; `pagehide` → `disconnect`
- **INFERÊNCIA:** `reconnection` default do client permanece `true`

## Rooms / emits

No `connect`: `join_empresa` com `{ company_id, empresa_id }` do `user`.

Por conversa aberta: `join_conversa` / `leave_conversa` (`joinConversaIfNeeded`, `leaveConversa`).

Leitura: `marcar_conversa_lida` `{ conversa_id }`.

Filtro: `shouldIgnoreByCompany(payload)` compara `payload.company_id|empresa_id` com o user. Evento de outro tenant **não** deve mutar stores. Isso é defesa de UI, não segurança.

## Constantes `SOCKET_EVENTS` (`events.js`) — CONFIRMADO

```
conversa_atribuida
conversa_transferida
mensagem_interna_atendimento
nova_mensagem
```

`socket.js` escuta **mais** eventos do que esse enum. Lista observada no client (CONFIRMADO por leitura do módulo de socket na auditoria):

`connect`, `disconnect`, `typing_start`, `typing_stop`, `tag_adicionada`, `tag_removida`, `nova_conversa`, `nova_mensagem`, `mensagem_interna_atendimento`, `mensagem_excluida`, `mensagem_editada`, `mensagem_oculta`, `status_mensagem` (batch ~75ms), `mensagens_lidas`, `alerta_sem_resposta`, `alerta_sem_resposta_evento`, `zapi_sync_contatos` (nome legado), `whatsapp_sync_mensagens_antigas`, `conversa_atualizada`, `conversa_prefs_atualizada`, `conversa_apagada`, `conversa_encerrada`, `conversa_transferida`, `conversa_reaberta`, `conversa_atribuida`, `atualizar_conversa`, `contato_atualizado`.

Antes de adicionar listener: busque o nome no backend. Não registre listener dentro de `useEffect` de componente de lista/row (leak + duplicata). O ponto único é `socket.js` + bridges globais.

## Efeito típico de `nova_mensagem`

1. `shouldIgnoreByCompany`
2. Atualiza lista (`setUltimaMensagemEBump` / unread / fetch se autorizado)
3. Se `selectedId` bate, `anexarMensagem` na thread (dedupe por id/wa/temp)
4. Notify desktop se inbound e conversa não focada
5. Se aberta, `marcar_conversa_lida`

`status_mensagem` é **batchado** (`statusMensagemBatch.js`) para não re-renderizar a thread a cada ACK.

## Bridges fora de `socket.js`

| Módulo | Eventos (CONFIRMADO na auditoria de páginas) |
|--------|-----------------------------------------------|
| Chat interno | `internal_chat:conversation_created`, `message_created`, `conversation_read` |
| HelpDesk | `helpdesk:notification`, `helpdesk:notifications_changed`, `helpdesk:queue_changed` |
| Disparo execução | progresso/fila — conferir página `DisparoExecucaoPage.jsx` antes de alterar |
| CRM local | `useCrmSocket` se a UI local estiver montada |

`MainLayout` monta `InternalChatGlobalSocketBridge` e `HelpDeskGlobalSocketBridge` para unread na sidebar mesmo fora da página.

## Notificações

- `notifications/chatNotificationService.js`: não notifica se a conversa está aberta e a UI focada; dedupe ~6s; só inbound fresco
- `desktopNotificationService.js`: Notification API
- Clique de notificação dispara evento DOM para abrir conversa/ticket (handlers no layout)

## Regras

- Não assumir Redis no servidor: um processo Node. Reload deve hidratar por HTTP.
- Não emitir `join_conversa` para id que não é da empresa.
- Não tratar `nova_mensagem` outbound como unread.
- Nome `zapi_*` no fio = legado; o provider é UltraMSG.
