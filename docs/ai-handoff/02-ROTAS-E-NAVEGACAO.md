# Rotas e navegação

> 2026-08-23 · `src/routes/AppRoutes.jsx`, `ProtectedRoute.jsx`, `src/layouts/MainLayout.jsx`, `sidebarNavConfig.js`.

## Modelo

- Sem token: `BrowserRouter` com `path="*"` → `Login`. Não entra no `MainLayout`.
- Com token: `MainLayout` (lazy) envolve as rotas autenticadas; `/` redireciona para `/atendimento`.
- Páginas pesadas são `React.lazy` + `Suspense` com fallback “Carregando…”.
- `AppRoutes` **subscreve** `usePermissoesStore((s) => s.permissoes)` para reavaliar gates quando `GET /usuarios/me/permissoes` resolve após login/F5. Sem isso, o menu/rotas ficam no fallback de role.

`ProtectedRoute`: se `canAccess` é falso, `<Navigate to={redirectTo} replace />` (default `/atendimento`).

## Tabela de rotas (CONFIRMADO)

| Path | Página | Gate |
|------|--------|------|
| `/login` | Login | pública; autenticado ainda pode abrir, mas o fluxo normal vai a `/atendimento` |
| `/` | redirect | `/atendimento` |
| `/atendimento` | `pages/Atendimento.jsx` | autenticado |
| `/atendimento/novo-contato` | NovoContato | autenticado |
| `/atendimento/novo-grupo` | NovoGrupo | autenticado |
| `/atendimento/nova-comunidade` | NovaComunidade | autenticado |
| `/chat-interno` | InternalChat | autenticado (sem `can()`) |
| `/dashboard` | `dashboard/Dashboard.jsx` | `dashboard_acessar` |
| `/dashboard/ia` | DashboardIA | `dashboard_acessar` |
| `/ia` | IA (bot) | `chatbot_acessar` |
| `/chatbot` | redirect | `/ia` ou `/atendimento` |
| `/configuracoes/chatbot` | redirect | `/ia?tab=chatbot` |
| `/configuracoes` | Configuracoes | `config_acessar` **ou** respostas salvas |
| `/configuracoes/whatsapp` | ConnectWhatsApp | `config_acessar` |
| `/usuarios` | redirect | `/configuracoes?tab=usuarios` |
| `/permissoes` | Permissoes | `usuarios_acessar` |
| `/supervisao` | Supervisao | `isSupervisorOrAdmin(user)` (role, não catálogo) |
| `/helpdesk` | HelpDesk | `Number(user?.company_id) === 1` |
| `/disparo` | lista campanhas | `canAcessarDisparo` (módulo Campanhas ativo na empresa + admin/`disparo.ver`) |
| `/disparo/campanhas/:id` | wizard | idem |
| `/disparo/campanhas/:id/execucao` | execução | idem |
| `/campanhas` | redirect | `/atendimento` (módulo antigo morto) |
| `/mensagens` | `Mensagens.jsx` | autenticado, mas a página **navega para** `/atendimento` |
| `/atalhos` | `Atalhos.jsx` | idem, stub → `/atendimento` |
| `/crm/*` | CRM SSO ou UI local | autenticado, **sem** `can()` no menu |
| `/manual` | ManualZapERP | autenticado |
| `*` | NotFound | dentro do layout se autenticado |

## Deep links de atendimento (CONFIRMADO)

Em `pages/Atendimento.jsx`:

- `location.state.openConversaId` → `carregarConversa` e limpa o state.
- Query `?conversa=` → carrega e `replace` para tirar a query (evita loop no voltar).
- Mobile (`max-width: 640px`): `history.pushState` com marker; `popstate` só fecha a thread na UI (`selectedId = null`), **não** encerra o atendimento.

## Sidebar (`MainLayout`)

Itens gated (CONFIRMADO no layout):

| Destino | Label típico | Show |
|---------|--------------|------|
| `/dashboard` | Analytics | `dashboard_acessar` |
| `/ia` | Bot | `chatbot_acessar` |
| `/atendimento` | Atendimento | sempre |
| `/chat-interno` | Chat | sempre |
| `/helpdesk` | HelpDesk | `company_id === 1` |
| `/supervisao` | Supervisão | supervisor/admin |
| `/permissoes` | Equipe | `usuarios_acessar` |
| `/crm` | CRM | sempre |
| `/disparo` | Disparo | `canAcessarDisparo` (some `user.modulo_campanhas_ativo`) |
| `/configuracoes` | Configurações | `config_acessar` |
| atalho respostas | Respostas | só se **não** tem config e tem `atendimentos.respostas_salvas` |
| `/dashboard/ia` | IA | `dashboard_acessar` |
| `/manual` | Manual | sempre |

`sidebarNavConfig.js` (`isSidebarNavActive`): evita `/dashboard` marcar ativo junto com `/dashboard/ia`; `/atendimento` inclui subrotas; `/crm`, `/ia`, `/helpdesk` usam prefixo.

Bridges montados no layout (sempre que autenticado): `GlobalNotifications`, `PushPermissionPrompt`, `InternalChatGlobalSocketBridge`, `HelpDeskGlobalSocketBridge`.

Badge: soma de `unread_count` da lista no mobile; unread do chat interno e HelpDesk via stores próprios.

## Mobile nav

`useMatchMedia("(max-width: 768px)")` no layout para bottom/compact. Atendimento usa **640px** para lista XOR thread. Não unificar esses breakpoints sem testar os dois.

## Convenção para rota nova

1. `lazy()` em `AppRoutes.jsx`.
2. Gate com `can()` / helper existente — não inventar `if (role === ...)`.
3. Item em `MainLayout` com o mesmo predicado.
4. Atualizar esta tabela.
