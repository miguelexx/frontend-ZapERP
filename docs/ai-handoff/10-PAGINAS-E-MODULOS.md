# Páginas e módulos secundários

> 2026-08-23 · rotas em `AppRoutes.jsx`. CRM local pode divergir do backend (módulo CRM legado removido no servidor; SSO é o caminho).

## Login — `pages/Login.jsx`

`authStore.login`. Sem token, `AppRoutes` pinta Login em `*`. Erros 401/429/rede; em dev pode mostrar `VITE_API_URL`.

## Dashboard / Dashboard IA

`/dashboard`, `/dashboard/ia` — `dashboard_acessar`. `dashboard/Dashboard.jsx`: visão geral, relatórios, respostas salvas, SLA. `pages/DashboardIA.jsx`: `POST` ask de IA, markdown. Timezone de período: SP (**INFERÊNCIA** de produto; conferir o service).

## Configurações — `pages/Configuracoes.jsx`

Rota: `config_acessar` **ou** só respostas salvas. Tabs via `?tab=`: geral, usuarios, permissoes, departamentos, tags, respostas, limites (admin), bot, clientes, auditoria. `configService.js`. Toggle `crm_habilitado` na geral **não** esconde o item CRM do menu.

Importar clientes (`ClientesSection.jsx`): `POST /clientes/importar/preview` e `POST /clientes/importar` via FormData (campo `arquivo`). Não forçar `Content-Type: multipart/form-data` — o browser precisa do boundary. Preview não grava. Mapeamento automático: Nome/Telefone/Tags e o modelo antigo Nome do(a) Aluno(a) / Celular do(a) Responsável Pedagógico / Série (Ano). O nome da planilha fica protegido no backend (`nome_protegido`). Irmãos com o mesmo telefone exigem escolha do nome principal. Switch opcional “Vincular alunos que compartilham o mesmo telefone” (desligado por padrão; só aparece se houver telefone compartilhado) envia `vincular_alunos_mesmo_telefone`. Confirmar fica desativado sem nome+telefone mapeados.

`/configuracoes/whatsapp` → `ConnectWhatsApp.jsx`: QR/status via `zapiIntegration.js` (**nome legado** `/integrations/zapi/connect/*`) + sync UltraMSG em `whatsappIntegration.js`. Toasts 404/429 “UltraMsg não configurado”.

## IA / chatbot — `pages/IA.jsx`

`chatbot_acessar`. Tabs `?tab=`: chatbot, respostas, ia, automacoes, alertas, logs. `iaService.js`. Redirects: `/chatbot` → `/ia`; `/configuracoes/chatbot` → `/ia?tab=chatbot`.

Atualizado em 2026-08-27: `pages/IA.jsx` é uma fachada de 1 linha para `ia/IaShell.jsx`. As seções vivem em `ia/{triagem,respostas,configuracoes,automacoes,alertas,logs,preview,gestores}` e são carregadas sob demanda. Defaults, normalização, cache por empresa e payloads ficam em `ia/shared`, `ia/triagem/triagemPayload.js` e `ia/alertas/alertaPayload.js`. Relatório e testes: `docs/OTIMIZACAO_FRONTEND_IA.md` e `e2e/ia-local-mock.spec.js`.

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

Visível no menu/rotas só com `canAcessarDisparo`: módulo Campanhas ativo na empresa (`modulo_campanhas_ativo`) **e** admin/`disparo.ver`. Toggle em Configurações → Geral (somente admin); ativar pede senha enviada ao backend (não hardcode no FE).

| Peça | Rota | Arquivos |
|------|------|----------|
| Lista | `/disparo` | `DisparoMensagens.jsx` |
| Wizard | `/disparo/campanhas/:id` | `DisparoWizardPage.jsx` + steps |
| Execução | `.../execucao` | `DisparoExecucaoPage.jsx` |

Wizard (6): Informações → Destinatários → Instâncias → Mensagens → Limites → Revisão. Services `disparo*.js`. Status: rascunho, configurando, pronta, agendada, em_execucao, pausada, concluida, cancelada, arquivada. Destinatários (contatos ZapERP): marcar vários na tabela (a busca não zera a seleção) e só gravar na campanha com **Confirmar** + aceite LGPD.

Execução: pausar/continuar/cancelar/emergência, exclusões, saúde worker (`GET /api/disparo/worker/saude`), Etapa 8 (opt-out/respostas/incertos). Banner de worker classifica `ativo` / `iniciando` / `sem heartbeat` / `desabilitado` / `offline` (`Nenhum worker ativo detectado`). Iniciar e Continuar ficam bloqueados se `saudavel !== true` — o FE não inventa worker ativo. Envio **real** exige worker + live + não dry-run no backend. O FE não deve “ligar produção”.

## CRM — `crm/`

Entrada `/crm` → `CrmAvancadoRedirect.jsx`: `GET /api/crm/abrir-avancado` → `window.location.replace(url)` se `{ url }`; **503** → `CrmLayout` + Outlet (UI local: dashboard, kanban, agenda, leads, pipelines, stages, origens). `crmService.ts` ainda chama `/api/crm/*`. Socket `useCrmSocket`. Menu sempre visível. **Risco:** API local pode 404 após drop do CRM legado no BE.

## Novos contato/grupo/comunidade

Novo contato: muitas vezes modal via `state` no Atendimento (conferir `NovoContato.jsx`). Grupo/comunidade: forms → `criarGrupo` / `criarComunidade` no chatService. Sem gate extra nas rotas.

## Manual — `pages/ManualZapERP.jsx`

Estático, sem API. Nav + busca.

## NotFound

Catch-all autenticado. Sem token, `*` é Login.
