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

Triagem pode ligar **só a mensagem de boas-vindas** (`usarMenuSetores: false` + checkbox “apenas na primeira vez”). O envio é no backend (`chatbotTriageService`): única = esta mensagem ainda não foi enviada nesta conversa; menu antigo de setores / `bot_logs` velho não bloqueia. Reiniciar o backend após alterar o serviço.

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

Visível no menu/rotas só com `canAcessarDisparo`: módulo Campanhas ativo na empresa (`modulo_campanhas_ativo`) **e** admin/`disparo.ver`. Em Configurações → Geral o admin informa a senha e clica **Ativar** (`PUT /config/empresa` + `senha_modulo_campanhas`; a senha não vai no bundle). A flag entra no `authStore` na hora: o item **Campanhas** do menu e o chip da lista aparecem sem F5, e a UI abre `/disparo`. Desativar também é imediato (sem senha). Não ligar envio real pelo FE; o worker live é decisão de backend/ops.

| Peça | Rota | Arquivos |
|------|------|----------|
| Lista | `/disparo` | `DisparoMensagens.jsx` |
| Wizard | `/disparo/campanhas/:id` | `DisparoWizardPage.jsx` + steps |
| Execução | `.../execucao` | `DisparoExecucaoPage.jsx` |

Wizard (6): Informações → Destinatários → Instâncias → Mensagens → Limites → Revisão. Services `disparo*.js`. Status: rascunho, configurando, pronta, agendada, em_execucao, pausada, concluida, cancelada, arquivada. Destinatários (contatos ZapERP): marcar vários na tabela (a busca não zera a seleção) e só gravar na campanha com **Confirmar** + aceite LGPD. Campanha **pronta/agendada/pausada**: o card tem **Configurações** (abre o wizard); o banner **Editar configurações** chama `POST /revisao/voltar-edicao` (na pausada encerra a execução atual e cancela itens ainda não enviados). O wizard abre na etapa **Limites**. Confirmar limites grava intervalo/hora/dia/janelas; ao publicar e iniciar, a fila nova usa esses valores em `planejado_para`. Em execução precisa pausar antes. Publicar (`POST /revisao/confirmar`) é idempotente na mesma config; unique de versão deixa de ser 500 — o FE recarrega a revisão se vier **409** `REVISAO_DUPLICADA`. Se o status já for **pronta**, use Iniciar na execução (não é envio nesta etapa).

Execução: pausar/continuar/cancelar/emergência, exclusões, saúde worker (`GET /api/disparo/worker/saude`), Etapa 8 (opt-out/respostas/incertos). Banner de worker classifica `ativo` / `iniciando` / `sem heartbeat` / `desabilitado` / `offline` (`Nenhum worker ativo detectado`). Iniciar e Continuar ficam bloqueados se `saudavel !== true` — o FE não inventa worker ativo. O worker sobe com a API (`index.js`); envio **real** exige também live + não dry-run no backend. O FE não deve “ligar produção”. Badge **Dry run** quando `execucao.dry_run`. Cards: **Enviadas** = provedor aceitou; **Entregues/Lidas** só sobem com ACK WhatsApp (`device`/`read`), alinhados aos ticks ✓✓ do chat (GET execução copia ACK já gravado em `mensagens`). Dry-run nunca entrega no celular e ENTREGUES fica 0. A prova no aparelho é o filtro **Campanhas** (✓✓ cinza = entregue, ✓✓ azul = lida). Vários **enviada** com o 1º **entregue** costuma ser ACK da campanha que não casava o 2º contato (corrigido no backend: match pelo telefone do wamid).

## CRM — `crm/`

Entrada `/crm` → `CrmAvancadoRedirect.jsx`: `GET /api/crm/abrir-avancado` → `window.location.replace(url)` se `{ url }`; **503** → `CrmLayout` + Outlet (UI local: dashboard, kanban, agenda, leads, pipelines, stages, origens). `crmService.ts` ainda chama `/api/crm/*`. Socket `useCrmSocket`. Menu sempre visível. **Risco:** API local pode 404 após drop do CRM legado no BE.

## Novos contato/grupo/comunidade

Novo contato: muitas vezes modal via `state` no Atendimento (conferir `NovoContato.jsx`). Grupo/comunidade: forms → `criarGrupo` / `criarComunidade` no chatService. Sem gate extra nas rotas.

## Manual — `pages/ManualZapERP.jsx`

Estático, sem API. Nav + busca.

## NotFound

Catch-all autenticado. Sem token, `*` é Login.
# Clientes: sincronização manual (2026-09-02)

`ClientesSection` usa `useContactSync`: POST somente ao clicar; GET de progresso a cada 3 s durante o job, recuperação após F5 e atualização da lista sem desmontar a seção. O evento legado `zapi_sync_contatos` distingue contatos/fotos por `tipo` e informa `running`/`job_id`. Auto-sync da agenda ao conectar foi removido no backend e na UI. Testes: `e2e/manual-contact-sync.spec.js`, 4 casos aprovados em desktop/celular com API simulada. Build aprovado; publicação e instância real pendentes. Análise completa: `backend/docs/ai-handoff/25-SINCRONIZACAO-MANUAL-CONTATOS.md` no repositório pai.
