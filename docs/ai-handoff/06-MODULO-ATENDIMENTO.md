# Módulo Atendimento (shell)

> 2026-08-23 · `pages/Atendimento.jsx`, CSS em `styles/app.css` (`.atendimento-layout`). O núcleo do produto. Qualquer mudança aqui afeta o caminho quente.

## Layout de três painéis (CONFIRMADO)

```
.atendimento-layout [+ .conversation-open se selectedId]
  aside.atendimento-sidebar   → lazy ChatList
  main.atendimento-chat-area  → lazy ConversaView | AtendimentoEmptyState | Outlet
```

- Com `selectedId`: thread (`ConversaView`).
- Sem seleção, desktop: empty state (“Nova conversa” / foco na busca).
- Sem seleção, mobile: só lista (`null` na área da thread).
- Subrotas (`/atendimento/novo-contato` etc.) renderizam `<Outlet />` no lugar da thread.

`whatsappInstancesStore.load()` no mount da página.

## Fonte de verdade da seleção

`conversaStore.selectedId` + `carregarConversa(id)` — **não** é uma rota `/atendimento/:id`.

Abertura:

1. Clique na lista → `onSelect` → `carregarConversa`.
2. `location.state.openConversaId` (ex. HelpDesk “abrir WhatsApp”).
3. Query `?conversa=` (deep link); depois `replace` limpa a query.

Título do documento: soma de `unread_count` da `chatsStore` via helper de title.

## Mobile (CONFIRMADO)

- Breakpoint de troca lista/thread: **640px** (`useMatchMedia`).
- History: `atendimento/atendimentoMobileHistory.js`. Abrir conversa faz `pushState` com marker; `popstate` só `setSelectedId(null)` + tira `?conversa=`.
- **Fechar a thread ≠ encerrar atendimento.** `closeSelectedConversation.js` é só UI (`setSelectedId(null)` ou `history.back()` se o marker existir). Encerrar é ação explícita em `AtendimentoActions` → API.

Teclado: `conversa/hooks/useMobileKeyboardViewport.js` (≤640px) escreve `--wa-mobile-header-h`, `--wa-keyboard-inset`, `--wa-visual-height` via `visualViewport`.

Tablet: composer/header compactos ~741–1024px. Não use `100vh` cego; o shell já é flex + `min-height: 0`.

## Ações de atendimento (`atendimento/`)

| Arquivo | Papel |
|---------|--------|
| `AtendimentoActions.jsx` | Assumir, transferir, aguardar cliente, aguardar pagamento, pagamento ok, encerrar, reabrir. Toolbar pinada no mobile. |
| `AguardarPagamentoModal.jsx` | Prazos → `marcarAguardandoPagamentoConversa` |
| `AtendimentoEmptyState.jsx` | Desktop vazio; evento de foco na busca |
| `AtendentesModal.jsx` + `useConversaParticipantes.js` | participantes + sockets |

Permissões de ação: `canAssumir` / `canTransferir` / `canEncerrar` / `canReabrir` / `canPuxarFila` (role), não o catálogo pontuado.

## Fluxo de dados (visão)

```
HTTP fetchChats / getChatById / send
  → chatsStore | conversaStore
  → ChatList* / ConversaView
  → socket join_empresa + join_conversa
  → handlers atualizam stores (filtro company_id)
```

Detalhe da lista: [07](07-LISTA-DE-CONVERSAS.md). Thread/envio: [08](08-THREAD-MENSAGENS-E-COMPOSER.md).

## Invariantes deste módulo

- Não criar row de conversa só porque chegou socket se a política de setor não autoriza (`addChatIfAuthorized` / `updateChat` não inventa row).
- Nome/foto sticky: não sobrescrever com vazio, “Conversa”, ou `chatName` de outbound.
- `carregarConversa` usa abort + generation guard; leave room no clear.
- Instância (`whatsapp_instance_id`) entra na identidade da row (`chatRowStableKey`).
