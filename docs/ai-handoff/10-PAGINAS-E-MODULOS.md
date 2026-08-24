# Páginas e módulos secundários

> 2026-08-23 · rotas em `AppRoutes.jsx`. CRM local pode divergir do backend (módulo CRM legado removido no servidor; SSO é o caminho).

## Login — `pages/Login.jsx`

`authStore.login`. Sem token, `AppRoutes` pinta Login em `*`. Erros 401/429/rede; em dev pode mostrar `VITE_API_URL`.

## Dashboard / Dashboard IA

`/dashboard`, `/dashboard/ia` — `dashboard_acessar`. `dashboard/Dashboard.jsx`: visão geral, relatórios, respostas salvas, SLA. `pages/DashboardIA.jsx`: `POST` ask de IA, markdown. Timezone de período: SP (**INFERÊNCIA** de produto; conferir o service).

## Configurações — `pages/Configuracoes.jsx`

Rota: `config_acessar` **ou** só respostas salvas. Tabs via `?tab=`: geral, usuarios, permissoes, departamentos, tags, respostas, limites (admin), bot, clientes, auditoria. `configService.js`. Toggle `crm_habilitado` na geral **não** esconde o item CRM do menu.

`/configuracoes/whatsapp` → `ConnectWhatsApp.jsx`: QR/status via `zapiIntegration.js` (**nome legado** `/integrations/zapi/connect/*`) + sync UltraMSG em `whatsappIntegration.js`. Toasts 404/429 “UltraMsg não configurado”.

## IA / chatbot — `pages/IA.jsx`

`chatbot_acessar`. Tabs `?tab=`: chatbot, respostas, ia, automacoes, alertas, logs. `iaService.js`. Redirects: `/chatbot` → `/ia`; `/configuracoes/chatbot` → `/ia?tab=chatbot`.

## Permissões — `pages/Permissoes.jsx` + `SecaoPermissoes.jsx`

`usuarios_acessar`. Catálogo + GET/PUT por usuário. `?usuario=`.

## Mensagens / Atalhos

`Mensagens.jsx` e `Atalhos.jsx` → `<Navigate to="/atendimento" />`. Respostas salvas vivem em Config `?tab=respostas`.

## Chat interno — `pages/InternalChat.jsx` + `internal-chat/`

Sem `can()`. `internalChatService.js`. Socket `internal_chat:*`. Bridge global no `MainLayout` para unread. Composer com mídia/local/contato.

## Supervisão — `pages/Supervisao.jsx` + `supervisao/`

`isSupervisorOrAdmin` (role). `supervisaoService.js`: resumo, pendentes, relatório diário, movimentação. Refresh ~30s. Grupos fora da lista de pendentes (**CONFIRMADO** na auditoria da página).

## HelpDesk — `pages/HelpDesk.jsx`

**Só `company_id === 1`.** Tickets multiempresa na visão da empresa 1. `helpDeskService.js` `/api/helpdesk/*`. Socket `helpdesk:*`. Deep link `?ticket=`. Departamentos de UI: Suporte / Financeiro / Comercial. Abrir WhatsApp via telefone → atendimento.

## Disparo (em evolução)

| Peça | Rota | Arquivos |
|------|------|----------|
| Lista | `/disparo` | `DisparoMensagens.jsx` |
| Wizard | `/disparo/campanhas/:id` | `DisparoWizardPage.jsx` + steps |
| Execução | `.../execucao` | `DisparoExecucaoPage.jsx` |

Wizard (6): Informações → Destinatários → Instâncias → Mensagens → Limites → Revisão. Services `disparo*.js`. Execução: pausar/continuar/cancelar/emergência, exclusões, saúde worker, Etapa 8 (opt-out/respostas/incertos). Status: rascunho, configurando, pronta, agendada, em_execucao, pausada, concluida, cancelada, arquivada.

`/campanhas` → `/atendimento`. Envio **real** exige worker + live + não dry-run no backend. O FE não deve “ligar produção”.

## CRM — `crm/`

Entrada `/crm` → `CrmAvancadoRedirect.jsx`: `GET /api/crm/abrir-avancado` → `window.location.replace(url)` se `{ url }`; **503** → `CrmLayout` + Outlet (UI local: dashboard, kanban, agenda, leads, pipelines, stages, origens). `crmService.ts` ainda chama `/api/crm/*`. Socket `useCrmSocket`. Menu sempre visível. **Risco:** API local pode 404 após drop do CRM legado no BE.

## Novos contato/grupo/comunidade

Novo contato: muitas vezes modal via `state` no Atendimento (conferir `NovoContato.jsx`). Grupo/comunidade: forms → `criarGrupo` / `criarComunidade` no chatService. Sem gate extra nas rotas.

## Manual — `pages/ManualZapERP.jsx`

Estático, sem API. Nav + busca.

## NotFound

Catch-all autenticado. Sem token, `*` é Login.
