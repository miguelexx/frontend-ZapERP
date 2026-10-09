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
| `AtendimentoActions.jsx` | Assumir, transferir, aguardar cliente, aguardar pagamento, pagamento ok, encerrar, reabrir. Toolbar pinada no mobile. Transferir lista só usuários ativos (`GET /usuarios?ativo=true` + filtro `ativo !== false`). |
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

Detalhe da lista: [07](07-LISTA-DE-CONVERSAS.md). Thread/envio: [08](08-THREAD-MENSAGENS-E-COMPOSER.md). Clique no avatar+nome do cabeçalho abre o perfil (`SidebarCliente`); em grupo o painel é `SidebarGrupo` (participantes com nome/rank, convite, admins, foto). Ampliar foto é no painel. **Ligar** abre o discador (`tel:`) para conversar; no Whapi também tenta o toque de atenção no WhatsApp.

### SidebarCliente — observação, próximo contato e cadastro (2026-10-08)

Fonte única: tudo que é "nota" vive em `clientes.observacoes` (por cliente, visível a qualquer atendente que abrir a conversa). O "Próximo contato" (dia/hora/lembrete) é serializado numa 1ª linha com marcador `[NEXT_CONTACT] YYYY-MM-DD HH:mm | nota` e o restante é o texto livre. `parseNextContactFromObservacoes`/`buildObservacoesWithNextContact` fazem o ida-e-volta — o marcador **nunca** aparece no textarea.

- **Observação do atendimento** e o campo de observações do "Cadastro completo" foram unificados num único editor (`cliObsText`). Antes existiam dois textareas gravando na MESMA coluna por caminhos diferentes (`PUT /chats/:id/observacao` cru **vs** `PUT /clientes/:id` com marcador): um salvamento apagava o outro e o marcador vazava no texto. **Corrigido**: o painel só grava via `atualizarCliente` (preserva o próximo contato); sem cadastro, "Salvar" vira "Criar e vincular" e persiste a nota ao criar o cliente. O endpoint `PUT /chats/:id/observacao` ficou órfão no front (não removido no backend).
- Semente imediata ao abrir vem de `conversa.observacao` (= `clientes.observacoes`, do `conversationDetailController`), parseada; `loadCliente` refina com o cadastro real. Reseed só em `open`/troca de conversa — não a cada tecla.
- Visual: bloco "Próximo contato" num cartão com leve destaque; chips Hoje/Amanhã com estado ativo (`todayISO`/`tomorrowISO`); contador de caracteres; `details` "Cadastro completo" com seta animada. Tudo via tokens `--wa-*` (ok em tema escuro). Não mexer na `.wa-sideCliente-saveBar` sticky.

## Invariantes deste módulo

- Não criar row de conversa só porque chegou socket se a política de setor não autoriza (`addChatIfAuthorized` / `updateChat` não inventa row).
- Nome/foto sticky: não sobrescrever com vazio, “Conversa”, ou `chatName` de outbound.
- `carregarConversa` usa abort + generation guard; leave room no clear.
- Instância (`whatsapp_instance_id`) entra na identidade da row (`chatRowStableKey`).
- Visão por número (2026-10-09): em Configurações → Números, marca-se quais usuários (atendente, supervisor ou admin) veem cada número (`whatsapp_instances.nome`, ex. Bem me Quer). Quem não tem nenhum número marcado continua vendo como antes, inclusive admin e supervisor. A trava só existe para quem tem pelo menos uma marcação. Lista, contadores, abertura, envio e socket usam a mesma regra; grupo segue o número da conversa. Tabela `usuario_whatsapp_instances` (migration `20261008170000`). Evento `acesso_numeros_atualizado` pede resync da lista.
- Foto/nome/telefone da lista e do header vêm de `clientes` / caches da conversa (não de UltraMSG live). Em empresa Whapi, abrir conversa e novo contato enriquecem pela instância da conversa (`getProfilePicture` mesmo sem o número na agenda). Contato só com número (sem `nome`/`pushname`) é esperado.
