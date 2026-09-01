# Mapa de arquivos do frontend

> 2026-08-23 · paths relativos a `frontend/src`. Confirme no disco: o working tree muda rápido (Disparo, CRM).

## Entrada e shell

| Path | Papel |
|------|--------|
| `main.jsx` | boot, restore auth, tema, SW, ErrorBoundary, `AppRoutes` |
| `routes/AppRoutes.jsx` | todas as rotas, lazy, gates |
| `routes/ProtectedRoute.jsx` | redirect se `!canAccess` |
| `layouts/MainLayout.jsx` | sidebar, Outlet, bridges globais |
| `layouts/sidebarNavConfig.js` | `isNavItemActive` |
| `components/ErrorBoundary.jsx` | crash UI |
| `runtime/vitePreloadRecovery.js` | chunk 404 pós-deploy |

## Auth e HTTP

| Path | Papel |
|------|--------|
| `auth/authStore.js` | token, user, login/logout/restore |
| `auth/authService.js` | `POST /usuarios/login` |
| `auth/permissions.js` | `can()`, helpers de ação/disparo |
| `auth/permissoesStore.js` | mapa de códigos da API |
| `auth/empresaStore.js` | dados da empresa |
| `api/http.js` | Axios, Bearer, 401, toasts |
| `api/baseUrl.js` | `getApiBaseUrl` + fallbacks |
| `api/httpTimeouts.js` | timeouts de upload |
| `api/*.js` / `*.ts` | um service por domínio (não duplicar) |

## Atendimento (caminho quente)

| Path | Papel |
|------|--------|
| `pages/Atendimento.jsx` | shell 3 painéis |
| `chats/chatsStore.js` | lista |
| `chats/chatList.jsx` | coordenador da lista (load, seleção, cache, badges) |
| `chats/hooks/useWhatsappInstanceStatus.js` | status UltraMSG (nome legado `getZapiStatus`): delay mobile, intervalo 120s, revalidação em foco |
| `chats/hooks/useChatListFilterState.js` | estado serializável dos filtros/abas/busca (não confundir com o compute in-memory) |
| `chats/hooks/useChatListFilters.js` | compute in-memory das rows já carregadas (ChatListBody) |
| `chats/hooks/useChatListQuery.js` | contrato `buildChatListFetchParams` (busca não prende à aba) |
| `chats/hooks/useChatListPagination.js` | load more + avanço de página vazia |
| `chats/hooks/useChatListResync.js` | nonce do store, auto-refresh 5 min, fila se load em voo |
| `chats/chatListQueryHelpers.js` | merge/dedupe/página/params GET — sem alterar comparadores da row |
| `chats/ChatListBody.jsx` | subscriber pesado |
| `chats/ChatListRow.jsx` | row memo |
| `chats/chatListSidebarCache.js` | session cache |
| `chats/chatService.js` | HTTP lista |
| `conversa/conversaStore.js` | thread |
| `conversa/ConversaView.jsx` | coordenador da conversa (delega features a hooks) |
| `conversa/hooks/useConversationTags.js` | painel de tags + toggle otimista (rollback + 409) |
| `conversa/hooks/useConversationDepartments.js` | painel "transferir setor" (GET/PUT departamento) |
| `conversa/hooks/useAddToGroup.js` | adicionar contato a grupo (POST participantes) |
| `conversa/hooks/useConversationCall.js` | modal "registrar ligação" (faixa 1–15, 403, `callSending`) |
| `conversa/hooks/useConversationSearch.js` | painel de busca: estado + posicionar resultado (aborta em troca de conversa; `scrollToMsg` injetado) |
| `conversa/hooks/useConversationTimeline.js` | histórico do atendimento: abertura + `carregarAtendimentos` |
| `conversa/hooks/useConversationParticipants.js` | co-atendentes (envolve `useConversaParticipantes`) + modal de atendentes |
| `conversa/hooks/useConversationToast.js` | toast/feedback (auto-dismiss 3500ms via `useStableTimeout`) |
| `conversa/hooks/useConversationHeaderIdentity.js` | nome, avatar, badge, `fromChat` (sticky da lista) |
| `conversa/hooks/useConversationSelection.js` | pins, stars, modo seleção (âncora sticky) |
| `conversa/hooks/useConversationReactions.js` | reações da thread |
| `conversa/hooks/useConversationThreadActions.js` | CTAs assumir/reabrir/histórico/marcar lida |
| `conversa/hooks/usePendingOutgoingLifecycle.js` | watchdog tick + flush da outbox |
| `conversa/hooks/useConversationOutboundMedia.js` | envio de arquivo/lote/sticker (FIFO áudio intacto) |
| `conversa/utils/buildMensagensComSeparadores.js` | lista virtual: dias, remetente, bundle legenda |
| `conversa/components/ConversaViewOverlays.jsx` | painéis/modais (exceto header/thread/composer/timeline) |
| `conversa/components/ConversaDropOverlay.jsx` | overlay de arrastar-soltar |
| `conversa/components/ConversaSetorPanel.jsx` | painel transferir setor |
| `conversa/components/ConversaTagsPanel.jsx` | painel de tags |
| `conversa/components/ConversaTimelinePanel.jsx` | UI do histórico (apresentacional; dados do `conversaStore`) |
| `conversa/utils/conversationEscapeOrder.js` | **fonte única da ordem do `onEscape`** (testada em `scripts/test-conversa-escape-order.mjs`) |
| `conversa/utils/conversaAccessHelpers.js` | helpers puros de acesso por departamento (auto-assumir/podeEnviar) |
| `conversa/ConversaThread.jsx` | virtual vs static |
| `conversa/ConversaMessageVirtualList.jsx` | TanStack Virtual |
| `conversa/ConversaComposer.jsx` | fachada compatível do envio |
| `conversa/composer/ConversaComposerShell.jsx` | orquestração do Composer e interface com a View |
| `conversa/composer/components/*` | texto/ações, anexos, câmera, pickers, respostas e áudio |
| `conversa/composer/hooks/*` | ciclos de vida de draft, typing, respostas, mídia, autocorreção e gravação |
| `conversa/composer/utils/*` | helpers puros, teclado, áudio e comparação de props |
| `conversa/ConversaBubble.jsx` | fachada compatível da bolha |
| `conversa/bubble/ConversaBubbleShell.jsx` | orquestração da bolha e interface com ThreadRow/View |
| `conversa/bubble/components/*` | renderers por tipo, status, menu, reações e player de áudio |
| `conversa/bubble/hooks/*` | menu, gestos, retry de envio e playback |
| `conversa/bubble/utils/*` | classify, ticks, retry, location e sessão de áudio |
| `conversa/conversaService.js` | HTTP mensagens/ações |
| `conversa/offlineOutbox.js` | texto offline |
| `conversa/pendingMessageWatchdog.js` | pending longo |
| `atendimento/AtendimentoActions.jsx` | assumir/encerrar/… |
| `socket/socket.js` | client + handlers |
| `socket/events.js` | nomes canônicos (subconjunto) |
| `socket/statusMensagemBatch.js` | batch ACK |

## Outros módulos (páginas)

`pages/Login.jsx`, `Configuracoes.jsx`, `ConnectWhatsApp.jsx`, `IA.jsx` (fachada para `ia/IaShell.jsx` e seções lazy em `ia/*`), `Permissoes.jsx`, `InternalChat.jsx`, `Supervisao.jsx`, `HelpDesk.jsx`, `Disparo*.jsx`, `ManualZapERP.jsx`, `NotFound.jsx`, `Mensagens.jsx`/`Atalhos.jsx` (redirects).

CRM: `crm/CrmAvancadoRedirect.jsx` + `crm/pages/*`. Dashboard: `dashboard/Dashboard.jsx`, `pages/DashboardIA.jsx`.

## Estado / tempo real / push

| Path | Papel |
|------|--------|
| `notifications/notificationStore.js` | toasts |
| `notifications/GlobalNotifications.jsx` | host |
| `push/*` | Web Push, FCM nativo, SW bridge |
| `internal-chat/*` | UI + notify store |
| `helpdesk/*` | notify store + bridge |
| `media/micStreamService.js` | microfone |
| `styles/theme.css` / `app.css` | tokens e shell |

## Testes

`frontend/scripts/test-*.mjs` (inclui `test-conversa-composer.mjs`, `test-conversa-bubble.mjs`, merge áudio/mídia, outbox, ordem realtime e mic). Playwright: `frontend/playwright.config.js` + specs de atendimento mock, smoke e áudio.

## Onde **não** procurar verdade

- `frontend/dist/`
- Pastas `backend/docs/_ANTIGOS/` e `backend/docs/_OFICIAL/` (não existem neste tree)
- Relatórios pontuais antigos (já removidos da raiz do monorepo)
