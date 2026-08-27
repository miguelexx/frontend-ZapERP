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
| `chats/chatList.jsx` | orquestração da lista |
| `chats/ChatListBody.jsx` | subscriber pesado |
| `chats/ChatListRow.jsx` | row memo |
| `chats/chatListSidebarCache.js` | session cache |
| `chats/chatService.js` | HTTP lista |
| `conversa/conversaStore.js` | thread |
| `conversa/ConversaView.jsx` | shell da conversa |
| `conversa/ConversaThread.jsx` | virtual vs static |
| `conversa/ConversaMessageVirtualList.jsx` | TanStack Virtual |
| `conversa/ConversaComposer.jsx` | envio |
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

`frontend/scripts/test-*.mjs` (merge áudio/mídia, outbox, ordem realtime, mic). Playwright: `frontend/playwright.config.js` + specs de smoke/áudio.

## Onde **não** procurar verdade

- `frontend/dist/`
- `backend/docs/_ANTIGOS/`
- Prompts `PROMPT-FRONTEND-*` em `_ANTIGOS`
- Relatórios `REVISAO_*` / `ANALISE_*` na raiz sem data desta semana
