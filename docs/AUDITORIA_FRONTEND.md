# Auditoria técnica completa do frontend do ZapERP

**Data da auditoria:** 26/08/2026  
**Escopo:** frontend React/Vite deste repositório  
**Natureza:** diagnóstico e documentação; nenhuma correção ou refatoração foi executada

## 1. Resumo executivo

Foram analisados **323 arquivos relevantes** (`.js`, `.jsx`, `.ts`, `.tsx`, `.css` e `.scss`), excluindo dependências, `dist`, cobertura, caches, arquivos minificados e saídas de teste. A base tem boa proteção específica no fluxo mais sensível — mensagens — por meio de paginação, virtualização, `AbortController`, reconciliação otimista, outbox e vários testes de regressão. Porém, essa proteção está concentrada em poucos arquivos muito grandes e fortemente acoplados.

O maior risco técnico atual não é apenas o número de linhas. É a combinação de:

- núcleo de atendimento concentrado em `ConversaView.jsx`, `conversaStore.js`, `socket.js`, `chatList.jsx`, `ConversaComposer.jsx`, `ConversaBubble.jsx` e CSS monolítico;
- contratos temporais complexos entre API, estado otimista e Socket.IO;
- duas falhas reproduzidas em E2E isolado: áudio otimista não aparece e a abertura/envio desloca o thread por frames acima do limite do teste;
- JWT persistido em `localStorage` e também incorporado em query string de URLs do proxy de mídia;
- eventos Socket.IO de encerramento, transferência, reabertura e exclusão sem a defesa de `company_id` usada em outros handlers;
- ciclo de dependências com 14 módulos envolvendo autenticação, HTTP, socket, conversa, chats e push;
- ausência de lint configurado e `checkJs: false`, deixando a maior parte da aplicação JSX/JS fora da checagem estática do TypeScript;
- páginas administrativas e de disparo com requisições sem cancelamento/geração, permitindo resposta antiga sobrescrever a nova;
- 116 arquivos acima de 200 linhas, 73 acima de 350, 54 acima de 500 e 37 acima de 800.

Não foi encontrado um motivo seguro para uma “grande refatoração”. A recomendação é proteger primeiro os contratos de mensagem/Socket/UI e só então extrair blocos pequenos, sem mudar simultaneamente store, socket, merge e apresentação.

### Síntese quantitativa dos achados

| Severidade | Quantidade |
|---|---:|
| Crítica | 0 |
| Alta | 12 |
| Média | 17 |
| Baixa | 7 |
| **Total** | **36** |

“0 crítica” não significa ausência de risco de produção. Há achados altos com potencial de duplicidade, exposição de token ou inconsistência visual, mas os impactos mais graves ainda dependem de confirmação em ambiente real ou de falha adicional do backend.

## 2. Método, limites e confiança

Foram lidos `AI_CONTEXT.md`, `CLAUDE.md`, toda a pasta `docs`, toda a pasta `docs/ai-handoff` e os documentos históricos em `docs antigos`. O código foi tratado como fonte da verdade quando a documentação divergiu.

As análises incluíram:

- inventário por linhas e bytes;
- parse AST aproximado de componentes, funções/callbacks, hooks, estados, efeitos, memoizações e condicionais;
- grafo de imports estáticos e componentes fortemente conectados;
- busca de chamadas HTTP, listeners, timers, URLs de mídia, tokens, HTML injetado, logs e validação de arquivos;
- build Vite, `tsc --noEmit`, testes Node existentes e Playwright;
- busca de duplicações literais de corpos de função e candidatos sem importadores estáticos.

Limites importantes:

- as contagens AST são indicadores, não uma métrica de complexidade ciclomática certificada; callbacks também entram como funções;
- ausência de import estático não prova código morto: entrada Vite, imports dinâmicos, service worker e referências externas foram conferidos antes da classificação;
- não há ferramenta de cobertura configurada, portanto não foi possível produzir porcentagem de cobertura;
- não foi instalado bundle analyzer; a atribuição do bundle foi feita pelos chunks gerados e pela configuração `manualChunks`;
- segurança de autorização depende do backend. Esta auditoria confirma o comportamento do frontend, mas não presume que ocultar/mostrar UI seja a única barreira de segurança.

## 3. Tecnologias e arquitetura atual

### 3.1 Stack confirmada

| Área | Implementação atual | Evidência |
|---|---|---|
| UI | React `18.3.1`, React DOM `18.3.1` | `package.json` |
| Build/dev | Vite `^5.4.8`; instalado `5.4.21`; plugin React `4.7.0` | `package.json`, `vite.config.js` |
| Rotas | React Router DOM `6.26.2` | `src/routes/AppRoutes.jsx` |
| Estado | Zustand `4.5.5`; stores de auth, empresa, permissões, chats, conversa, notificações e chats auxiliares | `src/**/**Store*` |
| HTTP | Axios `1.7.7`, instância compartilhada com interceptors | `src/api/http.js:14-139` |
| Tempo real | Socket.IO Client `4.7.5`, singleton de conexão principal | `src/socket/socket.js:649,801-815` |
| Virtualização | TanStack React Virtual `3.13.24` | lista de mensagens e lista de chats |
| Drag and drop | `@dnd-kit/*` | CRM Kanban |
| Markdown | `react-markdown`, `remark-gfm` | IA/dashboard |
| Ícones | Tabler e Lucide | dependências e imports |
| Crop de imagem | `react-image-crop`; `react-easy-crop` permanece no manifesto sem import encontrado | `package.json`, busca estática |
| Estilos | CSS próprio por domínio + `src/styles/theme.css` e `app.css` | árvore `src` |
| Testes | scripts Node com `assert`/cenários e Playwright; sem Jest/Vitest | `package.json`, `scripts`, `e2e` |
| Tipagem | TS/TSX estrito; JS permitido, mas não checado | `tsconfig.json:13-15` |

O runtime usado na auditoria foi Node `24.12.0` e npm `11.6.2`, coerente com `engines: >=24 <25`.

### 3.2 Bootstrap, autenticação e autorização

`src/main.jsx` restaura a sessão antes do render, instala recuperação de preload, bridges de push/PWA e monta `ErrorBoundary > AppRoutes`. A sessão é persistida como JSON em `localStorage.zap_erp_auth` (`src/auth/authStore.js:54-60`). O interceptor HTTP lê o token do storage a cada request e injeta `Authorization: Bearer` (`src/api/http.js:20-47`). Um 401 autenticado remove a sessão, limpa caches, desconecta o socket e redireciona para login (`src/api/http.js:64-91`).

Após login, o frontend inicia socket, sincroniza push, permissões, dados do usuário e empresa (`src/auth/authStore.js:73-85`). As rotas protegidas recebem booleanos calculados por `can()`/helpers e redirecionam para `/atendimento` (`src/routes/ProtectedRoute.jsx:10-14`).

### 3.3 Rotas e carregamento

As páginas de aplicação são carregadas com `React.lazy` em `src/routes/AppRoutes.jsx:11-41`. `Atendimento.jsx` ainda divide `ChatList` e `ConversaView` em chunks próprios, e `ConversaView` lazy-loads modais e painéis opcionais (`src/conversa/ConversaView.jsx:49-58`). Essa parte está bem direcionada.

Exceção organizacional: as rotas filhas do CRM interno continuam declaradas e lazy-importadas em `AppRoutes.jsx:302-375`, mas o pai `CrmAvancadoRedirect` não renderiza `<Outlet>` e declara que o CRM interno foi removido (`src/crm/CrmAvancadoRedirect.jsx:4-17`). O comentário de `AppRoutes.jsx:306-307` afirma o oposto. As páginas internas são, portanto, alcançáveis no grafo de build, mas não renderizáveis por essa árvore de rotas no comportamento atual.

### 3.4 Principais fluxos confirmados

| Fluxo | Caminho atual confirmado |
|---|---|
| Login | `Login.jsx` → `authService.login` → `authStore.login` → storage/socket/permissões/empresa/push |
| Atendimento | `Atendimento.jsx` → `chatList.jsx`/`chatsStore.js` + `ConversaView.jsx`/`conversaStore.js` |
| Lista de conversas | API paginada, busca/filtros, cache lateral, resync por socket, virtualização de linhas |
| Histórico | `conversaStore.carregarConversa`, cancelamento da carga anterior, cache por conversa e lista virtual |
| Texto | composer → mensagem otimista/temp id → POST → reconciliação por ACK/API/socket; outbox offline para texto |
| Mídia | seleção/preview/crop/recording → FormData → fila de upload → merge/reconciliação → renderers por tipo |
| Recebimento | singleton Socket.IO → normalização/deduplicação → stores de conversa/lista → notificações |
| CRM | botão/rota chama `/api/crm/abrir-avancado` e redireciona por SSO; código do CRM interno permanece legado |
| Disparos | lista de campanhas → wizard por etapas → destinatários/variações/instâncias/limites/revisão → execução |
| Dashboard | cards e seções em `dashboard/Dashboard.jsx` consumindo `dashboardService` |
| Configurações | uma página agrega empresa, usuários, departamentos, tags, respostas, clientes, auditoria e WhatsApp |
| Notificações | store/toasts, bridge Socket global, Notification API, Web Push, service worker e FCM nativo |
| Chat interno | services/store próprio, socket específico sobre a conexão principal e composer de mídia/áudio |
| Help Desk | listagem/detalhe, filtros locais, polling/visibility e evento Socket.IO com debounce |

## 4. Estrutura de diretórios

```text
frontend/
├── docs/                 documentação atual e handoffs
├── docs antigos/         documentação histórica; contém referências já superadas
├── e2e/                  3 specs Playwright
├── public/               manifest, service worker, sons e assets públicos
├── scripts/              diagnósticos/testes Node e utilitários de build
└── src/
    ├── api/              26 arquivos de clientes/serviços HTTP
    ├── atendimento/      ações, modais, participantes e estados vazios
    ├── auth/             sessão, empresa, permissões e regras por perfil
    ├── brand/            assets/componentes de marca
    ├── chats/            lista, filtros, cache, rows, ações e store
    ├── components/       UI compartilhada, feedback, layout e partes do disparo
    ├── conversa/         thread, composer, bubbles, mídia, store, service, hooks e utils
    ├── crm/              CRM interno legado, tipos, socket e páginas
    ├── dashboard/        dashboard operacional, cards e charts
    ├── helpdesk/         store/bridge de notificações
    ├── hooks/            hook compartilhado de media query
    ├── ia/               componentes e normalização analítica
    ├── internal-chat/    chat interno, composer, thread, socket e utils
    ├── layouts/          layout principal e configuração lateral provável não usada
    ├── media/            permissão/stream/gravação de áudio
    ├── notifications/    store, toasts e notificação desktop
    ├── pages/            páginas e etapas grandes; concentra regras de vários domínios
    ├── push/             Web Push, FCM, SW bridge e diagnósticos
    ├── routes/           árvore de rotas e proteção
    ├── runtime/          recuperação de chunks Vite
    ├── settings/         store de tema provável não usado
    ├── socket/           singleton, eventos e batching de status
    ├── styles/           tema, app global e animações
    ├── supervisao/       componentes da supervisão
    └── utils/            utilitários gerais
```

Há separação nominal adequada, mas `pages`, `conversa` e `chats` ainda contêm serviços/regras junto da orquestração visual. O diretório `hooks` global tem apenas um arquivo, enquanto muitos hooks específicos vivem em `conversa`; isso é aceitável por domínio. O problema é que várias extrações visuais continuam recebendo dezenas de props em vez de uma interface menor.

## 5. Build, lint, tipos e testes

### 5.1 Resultado objetivo

| Verificação | Resultado | Observações |
|---|---|---|
| TypeScript | **Passou** | `tsc --noEmit --pretty false`, exit 0. Como `checkJs=false`, não cobre os 269 arquivos JS/JSX. |
| Lint | **Não configurado** | Não há script nem dependência ESLint. Não foi inventado comando nem instalada ferramenta. |
| Build | **Concluiu** | Vite 5.4.21, 8.513 módulos, aproximadamente 39 s, saída temporária fora do repositório. |
| Build no sandbox | **Falhou inicialmente** | `Cannot read directory "../../..": Access denied` ao resolver `vite.config.js`; repetição autorizada fora do sandbox concluiu. |
| Testes Node configurados | **17/17 scripts passaram** | Cobrem principalmente merge, ordem, mídia/áudio, outbox, scroll e recuperação de deploy. |
| Scripts de teste não ligados ao `package.json` | **6/6 passaram** | Avatar, retry manual, dedupe no refresh, watchdog, specialty outbound e batch de status. |
| Playwright completo | **Falhou** | 26 execuções: 7 passaram, 18 falharam, 1 ignorada, cerca de 5 min. |
| Playwright mock isolado/serial | **Falhou** | 10 execuções: 4 passaram, 5 falharam, 1 ignorada, cerca de 1,6 min. |

### 5.2 Aviso de build confirmado

O minificador reportou `Expected ')' to end URL token` em `src/pages/disparoWizard.css:52`. A declaração usa aspas tipográficas em `url(“data:...”)`, não aspas ASCII. O build termina, mas essa imagem de fundo pode ser descartada pelo parser CSS.

### 5.3 Chunks mais relevantes

| Chunk | KB bruto | KB gzip | Leitura técnica |
|---|---:|---:|---|
| `ConversaView-*.js` | 306,6 | 88,9 | maior chunk de página; regras e UI do atendimento |
| `ConversaView-*.css` | 277,0 | 45,7 | CSS monolítico da conversa |
| `index-*.js` | 266,7 | 73,5 | entrada e dependências alcançáveis no bootstrap |
| `chatList-*.js` | 152,4 | 42,8 | lista/orquestração de chats |
| `vendor-react-*` | 139,0 | 44,5 | React/React DOM/scheduler |
| `chatList-*.css` | 138,8 | 22,6 | CSS da lista |
| `DisparoWizardPage-*.js` | 135,4 | 34,7 | wizard e etapas alcançáveis |
| `vendor-markdown-*` | 114,8 | 35,3 | ecossistema Markdown |
| `Configuracoes-*` | 83,8 | 20,7 | página administrativa |
| `IA-*` | 83,1 | 19,9 | chatbot, automações, alertas e logs |

A configuração já cria vendors explícitos para React, Router, Axios, Socket.IO, Markdown, TanStack, DnD, ícones e Zustand (`vite.config.js:33-44`). Sem analyzer não é seguro atribuir o conteúdo inteiro de `index` a uma dependência específica.

### 5.4 Falhas E2E que precisam ser tratadas como evidência

Na suíte completa, vários `page.goto` excederam 90 s, listas mockadas não apareceram e os smoke tests permaneceram em `/login`. O `playwright.config.js:37` aponta por padrão para backend local na porta 5000, enquanto os smokes dependem de credenciais/serviço de teste. Isso torna parte das falhas dependente de ambiente.

A repetição isolada de `audit-local-mock.spec.js`, com 1 worker, separou problemas que não dependem do backend real:

- **áudio otimista/FIFO:** desktop e mobile esperavam uma `.audio-message` após o envio e receberam zero por 15 s (`e2e/audit-local-mock.spec.js:274-380`);
- **estabilidade na abertura/envio:** desktop teve 12 frames deslocados onde o limite era 1; mobile teve 6 (`:503-628`);
- **histórico com muitas mídias:** mobile teve 5 amostras de gap acima de 6 px onde o limite era 2 (`:632-780`);
- passaram isoladamente: fila de texto sem duplo envio, troca rápida ignorando resposta antiga/virtualização e parte do histórico desktop.

Essas falhas são **forte evidência**, não prova isolada da causa. Antes de refatorar conversa/composer/scroll, elas precisam ser reproduzidas em uma execução controlada e transformadas em baseline confiável.

## 6. Inventário dos arquivos grandes

### 6.1 Distribuição

| Faixa | Arquivos |
|---|---:|
| Até 200 linhas | 207 |
| 201–350 | 43 |
| 351–500 | 19 |
| 501–800 | 17 |
| 801 ou mais | 37 |

### 6.2 Ranking completo dos arquivos acima de 200 linhas

Prioridade de arquivo: **C** crítica para modularização, **A** alta, **M** média, **O** observação/justificável. Isso não equivale à severidade de bug.

| # | Pri. | Arquivo | Linhas | KB |
|---:|:---:|---|---:|---:|
| 1 | C | `src/conversa/conversa.css` | 14.625 | 361,7 |
| 2 | C | `src/chats/chatList.css` | 5.383 | 141,2 |
| 3 | C | `src/conversa/ConversaView.jsx` | 4.835 | 181,7 |
| 4 | C | `src/pages/IA.css` | 3.853 | 69,2 |
| 5 | C | `src/pages/disparoWizard.css` | 3.243 | 100,2 |
| 6 | C | `src/pages/IA.jsx` | 2.728 | 123,3 |
| 7 | C | `src/pages/Configuracoes.jsx` | 2.602 | 107,0 |
| 8 | C | `src/chats/chatList.jsx` | 2.560 | 96,0 |
| 9 | C | `src/conversa/ConversaComposer.jsx` | 2.552 | 94,8 |
| 10 | C | `src/conversa/ConversaBubble.jsx` | 2.453 | 93,9 |
| 11 | C | `src/conversa/conversaOutboundMediaMerge.js` | 2.229 | 91,0 |
| 12 | C | `src/conversa/conversaStore.js` | 2.018 | 79,3 |
| 13 | A | `src/pages/internalChat.css` | 1.984 | 42,7 |
| 14 | A | `src/styles/app.css` | 1.763 | 43,2 |
| 15 | A | `src/dashboard/dashboard.css` | 1.740 | 32,4 |
| 16 | C | `src/dashboard/Dashboard.jsx` | 1.689 | 73,4 |
| 17 | C | `src/socket/socket.js` | 1.679 | 66,1 |
| 18 | C | `src/chats/ChatListRow.jsx` | 1.530 | 57,3 |
| 19 | A | `src/pages/disparo.css` | 1.506 | 46,5 |
| 20 | A | `src/pages/disparoExecucao.css` | 1.454 | 38,0 |
| 21 | A | `src/pages/DisparoLimitesStep.jsx` | 1.286 | 48,0 |
| 22 | A | `src/pages/DashboardIA.css` | 1.230 | 24,3 |
| 23 | A | `src/pages/DisparoMensagensStep.jsx` | 1.213 | 52,0 |
| 24 | A | `src/crm/crm.css` | 1.187 | 24,4 |
| 25 | A | `src/conversa/SidebarCliente.jsx` | 1.184 | 42,5 |
| 26 | A | `src/pages/Configuracoes.css` | 1.119 | 22,5 |
| 27 | A | `src/pages/DisparoExecucaoPage.jsx` | 1.076 | 36,2 |
| 28 | A | `src/conversa/utils/conversaViewHelpers.js` | 1.052 | 35,5 |
| 29 | A | `src/atendimento/AtendimentoActions.jsx` | 982 | 32,0 |
| 30 | A | `src/pages/ManualZapERP.css` | 945 | 23,2 |
| 31 | A | `src/pages/supervisao.css` | 882 | 20,2 |
| 32 | O | `src/pages/manual/ManualContent.jsx` | 856 | 44,4 |
| 33 | A | `src/components/disparo/DisparoEtapa8Section.jsx` | 849 | 28,1 |
| 34 | A | `src/pages/DisparoRevisaoStep.jsx` | 843 | 30,1 |
| 35 | O | `e2e/audit-local-mock.spec.js` | 839 | 28,3 |
| 36 | A | `src/pages/DisparoDestinatariosStep.jsx` | 829 | 33,4 |
| 37 | A | `src/pages/InternalChat.jsx` | 826 | 30,3 |
| 38 | A | `src/crm/pages/CrmLeadDetail.tsx` | 778 | 24,6 |
| 39 | A | `src/conversa/hooks/useForwardFlow.js` | 772 | 27,5 |
| 40 | A | `src/pages/DisparoMensagens.jsx` | 769 | 30,1 |
| 41 | A | `src/pages/ConnectWhatsApp.jsx` | 744 | 28,0 |
| 42 | A | `src/pages/DisparoInstanciasStep.jsx` | 711 | 32,7 |
| 43 | A | `src/pages/HelpDesk.jsx` | 673 | 33,9 |
| 44 | A | `src/chats/chatService.js` | 651 | 23,1 |
| 45 | A | `src/chats/chatsStore.js` | 639 | 27,6 |
| 46 | A | `src/chats/chatListFilters.js` | 603 | 22,0 |
| 47 | M | `src/pages/helpDeskTheme.css` | 574 | 12,9 |
| 48 | M | `src/atendimento/aguardarPagamento.css` | 555 | 14,3 |
| 49 | A | `src/chats/chatListRowAtendimento.js` | 543 | 19,4 |
| 50 | M | `src/chats/chatListSidebarCache.js` | 525 | 10,6 |
| 51 | A | `src/crm/pages/CrmKanban.tsx` | 511 | 18,1 |
| 52 | A | `src/conversa/conversaOptimisticMessage.js` | 509 | 19,2 |
| 53 | A | `src/internal-chat/InternalChatComposer.jsx` | 506 | 18,5 |
| 54 | A | `src/conversa/ConversaMessageVirtualList.jsx` | 503 | 19,2 |
| 55 | M | `src/chats/minhasPendencias.css` | 481 | 11,4 |
| 56 | M | `src/chats/ChatListBody.jsx` | 465 | 16,5 |
| 57 | M | `src/conversa/components/ConversaHeader.jsx` | 459 | 15,3 |
| 58 | M | `src/pages/SecaoPermissoes.jsx` | 450 | 14,1 |
| 59 | M | `src/conversa/conversaService.js` | 446 | 15,8 |
| 60 | M | `src/conversa/ConversaThread.jsx` | 446 | 16,1 |
| 61 | M | `src/api/crmService.ts` | 445 | 14,8 |
| 62 | M | `src/conversa/hooks/useAutoScroll.js` | 413 | 12,4 |
| 63 | M | `src/chats/NovoContatoModal.jsx` | 402 | 14,1 |
| 64 | M | `src/routes/AppRoutes.jsx` | 396 | 11,8 |
| 65 | M | `src/pages/LimitesAtendimento.jsx` | 384 | 14,6 |
| 66 | M | `src/push/webPushClient.js` | 377 | 12,8 |
| 67 | M | `src/crm/pages/CrmLeads.tsx` | 375 | 13,3 |
| 68 | O | `src/utils/autocorrectDictionary.js` | 375 | 9,3 |
| 69 | M | `src/chats/ChatListToolbar.jsx` | 369 | 16,2 |
| 70 | M | `src/conversa/components/PendingMediaPreview.jsx` | 369 | 13,7 |
| 71 | M | `src/conversa/components/ForwardModal.jsx` | 362 | 13,8 |
| 72 | M | `src/atendimento/atendimentoEmptyState.css` | 361 | 9,1 |
| 73 | M | `src/api/internalChatService.js` | 352 | 13,9 |
| 74 | O | `src/layouts/MainLayout.jsx` | 347 | 11,3 |
| 75 | O | `src/conversa/ProdutoConsultaPanel.jsx` | 340 | 12,7 |
| 76 | O | `src/pages/DisparoWizardPage.jsx` | 340 | 12,4 |
| 77 | O | `src/notifications/desktopNotificationService.js` | 339 | 10,8 |
| 78 | O | `src/conversa/SendToCrmChatButton.jsx` | 337 | 11,7 |
| 79 | O | `src/styles/theme.css` | 337 | 11,1 |
| 80 | O | `src/chats/chatList.chips-premium.css` | 335 | 7,9 |
| 81 | O | `src/styles/zap-animations.css` | 328 | 8,0 |
| 82 | O | `src/chats/novoContatoModal.css` | 324 | 6,4 |
| 83 | O | `src/api/configService.js` | 323 | 9,2 |
| 84 | M | `src/conversa/offlineOutbox.js` | 320 | 11,0 |
| 85 | O | `src/atendimento/atendentes.css` | 318 | 8,1 |
| 86 | O | `src/chats/ChatListAdvancedFiltersPanel.jsx` | 309 | 11,8 |
| 87 | O | `src/pages/Supervisao.jsx` | 308 | 11,0 |
| 88 | O | `src/utils/conversaUtils.js` | 294 | 11,3 |
| 89 | O | `e2e/audio-playback.spec.js` | 292 | 11,4 |
| 90 | O | `src/pages/DashboardIA.jsx` | 284 | 10,3 |
| 91 | O | `src/crm/pages/CrmAgenda.tsx` | 282 | 10,7 |
| 92 | O | `src/internal-chat/messageUtils.js` | 280 | 10,1 |
| 93 | O | `src/crm/pages/CrmDashboard.tsx` | 272 | 10,1 |
| 94 | O | `src/internal-chat/InternalChatContactModal.jsx` | 272 | 9,2 |
| 95 | O | `src/conversa/ImageSendPreviewMobile.jsx` | 270 | 8,2 |
| 96 | O | `src/conversa/hooks/useMobileKeyboardViewport.js` | 264 | 10,3 |
| 97 | O | `src/chats/admin-atendente-filter.css` | 263 | 6,3 |
| 98 | O | `src/push/notificationDiagnostics.js` | 262 | 10,0 |
| 99 | O | `src/crm/crmTypes.ts` | 255 | 6,3 |
| 100 | O | `src/chats/ChatListRows.jsx` | 253 | 8,8 |
| 101 | O | `src/internal-chat/InternalChatMessageBubble.jsx` | 238 | 9,4 |
| 102 | O | `src/crm/pages/CrmStages.tsx` | 237 | 7,6 |
| 103 | O | `src/conversa/mediaPrint.js` | 236 | 6,0 |
| 104 | O | `src/media/audioRecordingLifecycle.js` | 235 | 6,5 |
| 105 | O | `src/conversa/hooks/useMediaViewer.js` | 232 | 6,8 |
| 106 | O | `src/conversa/ThreadRow.jsx` | 232 | 8,1 |
| 107 | O | `src/atendimento/AtendentesModal.jsx` | 229 | 8,1 |
| 108 | O | `public/sw.js` | 228 | 8,3 |
| 109 | O | `src/conversa/components/ConversaMessageSearchPanel.jsx` | 225 | 7,3 |
| 110 | O | `src/chats/AdminAtendenteFilter.jsx` | 221 | 6,9 |
| 111 | O | `src/crm/pages/CrmPipelines.tsx` | 218 | 6,9 |
| 112 | O | `src/auth/authStore.js` | 217 | 6,3 |
| 113 | O | `src/pages/Atendimento.jsx` | 217 | 6,9 |
| 114 | O | `src/atendimento/AguardarPagamentoModal.jsx` | 208 | 6,8 |
| 115 | O | `src/chats/ChatListRowsPane.jsx` | 207 | 7,8 |
| 116 | O | `src/conversa/hooks/usePixConfig.js` | 205 | 6,4 |

`ManualContent.jsx`, o dicionário de autocorreção, specs E2E, service worker e arquivos de tipos têm tamanho parcialmente justificável por conteúdo declarativo. Eles não devem ser divididos apenas para reduzir linhas.

### 6.3 Métricas aproximadas dos arquivos de código acima de 500 linhas

| Arquivo | Imports | Componentes | Funções/callbacks | Hooks | `useState` | Efeitos | Memoizações |
|---|---:|---:|---:|---:|---:|---:|---:|
| `ConversaView.jsx` | 57 | 2 | 344 | 277 | 49 | 22 | 134 |
| `IA.jsx` | 17 | 7 | 273 | 55 | 31 | 11 | 5 |
| `Configuracoes.jsx` | 22 | 13 | 264 | 116 | 88 | 10 | 7 |
| `chatList.jsx` | 40 | 1 | 238 | 175 | 47 | 31 | 52 |
| `ConversaComposer.jsx` | 12 | 1 | 205 | 126 | 24 | 30 | 35 |
| `ConversaBubble.jsx` | 10 | 8 | 181 | 91 | 20 | 19 | 30 |
| `conversaOutboundMediaMerge.js` | 0 | 0 | 148 | 0 | 0 | 0 | 0 |
| `conversaStore.js` | 13 | 0 | 124 | 0 | 0 | 0 | 0 |
| `Dashboard.jsx` | 7 | 33 | 186 | 54 | 46 | 6 | 1 |
| `socket.js` | 14 | 0 | 112 | 0 | 0 | 0 | 0 |
| `ChatListRow.jsx` | 10 | 18 | 78 | 18 | 4 | 5 | 5 |
| `DisparoLimitesStep.jsx` | 3 | 7 | 106 | 23 | 20 | 1 | 2 |
| `DisparoMensagensStep.jsx` | 3 | 10 | 121 | 38 | 25 | 7 | 1 |
| `SidebarCliente.jsx` | 10 | 1 | 58 | 52 | 18 | 3 | 29 |
| `DisparoExecucaoPage.jsx` | 8 | 2 | 84 | 38 | 26 | 4 | 3 |
| `AtendimentoActions.jsx` | 13 | 8 | 78 | 29 | 8 | 4 | 3 |
| `DisparoEtapa8Section.jsx` | 4 | 9 | 67 | 39 | 29 | 5 | 4 |
| `DisparoDestinatariosStep.jsx` | 3 | 5 | 86 | 42 | 33 | 4 | 2 |
| `InternalChat.jsx` | 17 | 1 | 93 | 49 | 19 | 9 | 12 |
| `CrmLeadDetail.tsx` | 5 | 8 | 61 | 32 | 27 | 2 | 1 |
| `useForwardFlow.js` | 13 | 0 | 69 | 34 | 11 | 3 | 18 |
| `DisparoMensagens.jsx` | 5 | 9 | 72 | 36 | 24 | 5 | 2 |
| `ConnectWhatsApp.jsx` | 8 | 3 | 41 | 33 | 17 | 3 | 7 |
| `DisparoInstanciasStep.jsx` | 3 | 7 | 64 | 25 | 21 | 2 | 2 |
| `HelpDesk.jsx` | 11 | 7 | 105 | 53 | 34 | 7 | 6 |
| `CrmKanban.tsx` | 8 | 5 | 43 | 21 | 10 | 1 | 1 |
| `InternalChatComposer.jsx` | 5 | 1 | 53 | 26 | 14 | 3 | 1 |
| `ConversaMessageVirtualList.jsx` | 3 | 2 | 52 | 21 | 1 | 6 | 1 |

As contagens por arquivo somam subcomponentes. Por isso, por exemplo, os 46 estados de `Dashboard.jsx` não pertencem a uma única instância React; ainda assim, manter 33 componentes no mesmo módulo aumenta o custo de navegação, revisão e teste.

## 7. Arquivos com maior complexidade e responsabilidades misturadas

### `src/conversa/ConversaView.jsx:209-4787`

Coordena seleção e carregamento da conversa, scroll/âncoras, virtualização, envio de texto/áudio/arquivo/imagem, crop, uploads FIFO, retry, outbox, mensagens temporárias, resposta/encaminhamento, busca, exclusão, reações, notas, participantes, grupos, tags, departamentos, status e múltiplos modais. O arquivo importa 57 módulos e mantém 49 estados locais. A extração existente de hooks/componentes não reduziu a interface: `ConversaThread` recebe aproximadamente 59 props, `ConversaComposer` 44, `ThreadRow` 40 e `ConversaHeader` 36.

### `src/chats/chatList.jsx:309-2559`

Um único componente combina busca, filtros simples/avançados, modos de fila, paginação, cancelamento, cache lateral, resync, contadores, instâncias WhatsApp, auto-refresh, estados mobile/desktop, seleção e menus. Tem 47 estados e 31 efeitos. Há bons mecanismos de abort e virtualização, mas o componente distribui aproximadamente 68 props para `ChatListBody`, 55 para `ChatListToolbar` e 42 para o painel de filtros.

### `src/conversa/ConversaComposer.jsx:230-2549`

Mistura draft persistente, digitação Socket.IO, autocorreção, respostas salvas, emoji, stickers, seleção de arquivos, câmeras, gravação, lifecycle de `MediaRecorder`, previews, atalhos e layout mobile. São 30 efeitos. A gravação já tem utilitários em `src/media`, mas a orquestração e UI continuam juntas.

### `src/conversa/ConversaBubble.jsx:43-2451`

Contém renderers de imagem, vídeo, áudio, documento e contato, player de waveform (`AudioWavePlayer`, aproximadamente linhas 662-1322), estados de retry, reações, menus, swipe/long press, resposta, info e status. A prop surface de `Bubble` é de aproximadamente 38 campos.

### `src/conversa/conversaOutboundMediaMerge.js:1-2229`

Concentra a regra mais sensível de identidade/deduplicação para mídia enviada e recebida, placeholders, ACKs, contatos, stickers e automações. É predominantemente puro e possui bons testes, portanto o tamanho é menos preocupante que o risco de alterar invariantes. Entretanto, a finalização aplica várias podas com loops aninhados sobre a lista antes da ordenação (`finalizeMessages`, aproximadamente linhas 965-974; prunes em 415-434, 809-827, 936-963, 1631-1684). Em históricos grandes, há forte evidência de custo quadrático; precisa de benchmark antes de mudar.

### `src/conversa/conversaStore.js:297-2018`

Acumula cache, cancelamento, seleção, carregamento/paginação, normalização, merge, patches, refresh, retry e limpeza. Também participa do grande ciclo com socket/auth/http. Store e regras puras deveriam ter fronteira explícita, sem mudar os invariantes no mesmo passo.

### `src/socket/socket.js:1-1679`

Centraliza uma única conexão — ponto positivo — mas mistura lifecycle, joins, reconexão, notificação sonora/desktop, dedupe, roteamento multiempresa, manipulação de DOM/title e mutação direta de vários stores. Isso torna testes de listeners difíceis e cria ciclos de importação.

### `src/pages/IA.jsx:190-2727`

Agrega configuração geral, respostas, IA, automações, triagem, gestores, preview, alertas e logs. Os blocos principais aparecem em `IA` (190-429), `SecaoRespostas` (431-590), `SecaoIA` (631-728), automações (730-867), chatbot/triagem (894-1897), alertas (2045-2697) e logs (2699-2727). Há regras de payload e chamadas de API dentro do módulo visual.

### `src/pages/Configuracoes.jsx:64-2601`

Agrega nove domínios administrativos e 13 componentes locais. O componente principal faz um `Promise.all` de oito endpoints ao montar (`:145-184`) mesmo que apenas uma aba esteja visível. Cada promise converte falha em vazio, portanto o `catch` externo quase nunca informa erro real.

### `src/dashboard/Dashboard.jsx:1-1689`

Contém 33 componentes/cards e chamadas próprias por seção. O tamanho é parcialmente modularizável com baixo risco porque os cards já têm limites visuais, mas há repetição de carregamento de usuários/departamentos em seções diferentes (`:317-324`, `:568-582`, `:854-863`).

### CSS críticos

- `conversa.css`: 2.209 ocorrências aproximadas de seletores, 1.743 seletores distintos, 276 nomes repetidos, 160 blocos de declarações idênticos e 415 usos de `!important`; `.wa-messages` aparece em 8 blocos e `.wa-bubble` em 7.
- `chatList.css`: 754 ocorrências, 529 distintos, 114 nomes repetidos, 46 blocos idênticos e 167 `!important`; `.chat-list-row` aparece em 9 blocos.
- `IA.css`: 607 ocorrências, 306 distintos e 78 blocos idênticos. Cabeçalhos/grid/preview do chatbot aparecem em até 12 blocos; títulos “CHATBOT TRIAGEM” reaparecem em várias seções a partir de `:1373`.
- `disparoWizard.css`: 804 ocorrências, 661 distintos, 110 nomes repetidos e 40 blocos idênticos.

Repetição de seletor dentro de media query não é automaticamente duplicação. Os números provam acúmulo/cascade distribuída e justificam extração preservando ordem, especificidade e screenshots.

## 8. Arquitetura, organização e acoplamento

### 8.1 O que está bem separado

- Axios é único e possui timeout por tipo de request, tratamento global de 401 e feedback de rede.
- A conexão Socket.IO principal é singleton e `initSocket` evita uma segunda conexão com o mesmo token (`socket.js:801-806`).
- Listas críticas usam chave estável por id e virtualização; não foi encontrado uso generalizado de índice como chave em listas mutáveis do atendimento.
- A carga da conversa anterior é abortada em `conversaStore.js:297-312,717-764`.
- A lista de chats aborta carga inicial, troca de filtro e load-more (`chatList.jsx:816-828,1112-1279,1465-1475`).
- Listeners específicos do chat interno, Help Desk, CRM e participantes removem o mesmo handler no cleanup.
- Timers e object URLs do composer/áudio têm limpeza na maior parte dos caminhos analisados.
- `status_mensagem` é agrupado por batch, reduzindo cascatas de render.

### 8.2 Ciclos confirmados

**Ciclo pequeno:**

```text
chatListRowCompare.js ↔ chatListStoreCompare.js
```

**Componente fortemente conectado com 14 módulos:**

```text
authStore → socket → conversaStore → conversaService → http → socket
    │          │           │              │
    │          └→ chatService → http      └→ http
    ├→ permissoesStore → permissoesService → http
    ├→ empresaStore → configService → http
    └→ webPushClient/deferredPushSync → http

conversaOptimisticMessage → conversaStore/authStore
```

Evidências diretas incluem `http.js` importando `disconnectSocket`/limpeza da conversa (`:3-5`), `socket.js` importando stores/services e `conversaStore.js` importando socket/regras otimistas. O risco é inicialização parcial, testes que exigem o grafo inteiro e efeitos colaterais difíceis de isolar.

### 8.3 Chamadas HTTP dentro de componentes

Embora exista `src/api`, endpoints continuam embutidos em:

- `AtendimentoActions.jsx:290,317`;
- `ConversaView.jsx:2061,2221,2410,3389,3776-3818`;
- `DashboardIA.jsx:77`;
- `DisparoMensagensStep.jsx:159`;
- `IA.jsx:257-258`;
- `chatListFiltersData.js:138`.

Isso não duplica o cliente HTTP, mas mistura contrato de endpoint, transformação e UI. Em `ConversaView`, as três postagens diretas para `/arquivo` dificultam garantir que toda mídia use exatamente timeout, idempotência e tratamento iguais ao service.

### 8.4 Props e estados

As maiores interfaces por desestruturação de props foram:

| Componente | Props aproximadas |
|---|---:|
| `ChatListBody` | 68 |
| `ConversaThread` | 59 |
| `ChatListToolbar` | 55 |
| `ConversaComposer` | 44 |
| `ChatListAdvancedFiltersPanel` | 42 |
| `ThreadRow` | 40 |
| `Bubble` | 38 |
| `ConversaHeader` | 36 |
| `ChatListRowsPane` | 31 |

Isso é prop drilling confirmado e sinal de fronteiras ainda baseadas na página monolítica. Não se recomenda mover tudo para Context: um contexto amplo faria toda a subárvore renderizar a cada mudança de draft, upload, scroll ou mensagem. A saída futura mais segura é separar view-models estáveis por domínio e hooks especializados.

## 9. Auditoria React

### 9.1 Efeitos, closures e concorrência

- `DisparoDestinatariosStep.jsx:73-99`: o callback depende de `page/search`, mas os efeitos omitem dependências e chamam a função diretamente. Ao pesquisar enquanto `page != 1`, `setPage(1)` e a chamada manual podem disparar duas cargas; sem generation id, a resposta mais antiga pode vencer.
- `DisparoDestinatariosStep.jsx:583`: `fetchList` é chamado com lista parcial de dependências e comentário `eslint-disable-line`, apesar de lint não existir.
- `DisparoInstanciasStep.jsx:263`: `useEffect(() => fetch(), [page])`; o callback usa também campanha/estado. Mudança sem remount pode manter dados anteriores.
- `DisparoMensagens.jsx:479-509`: mudanças de página/filtro e debounce de busca chamam `fetchCampanhas` por caminhos distintos. Não há abort nem request id.
- `Configuracoes.jsx:191-203`: busca de clientes não cancela a anterior e qualquer erro substitui a lista por vazio.
- `HelpDesk.jsx:167-223`: busca bruta está na dependência de `loadTickets`; cada tecla refaz a lista. `loadDetail` não impede que o detalhe do ticket anterior sobrescreva o atual após troca rápida.
- CRM `CrmLeads.tsx`/`CrmKanban.tsx`: chamadas baseadas em filtros não têm abort/generation; como o CRM interno está inativo na árvore atual, validar antes de priorizar.

O fluxo principal de conversas está melhor: a seleção aborta requests anteriores e o E2E confirma que troca rápida ignora resposta antiga no cenário mock isolado.

### 9.2 Renderizações e valores derivados

- `MainLayout.jsx:66-73` percorre todos os chats para somar unread sempre que o seletor é avaliado, apesar de o store manter `unreadTotal`. O selector retorna número e evita rerender quando o total não muda, mas paga O(n) a cada mutação do store.
- `conversaOutboundMediaMerge.finalizeMessages` aplica várias podas e ordenação a cada reconciliação; isso é mais relevante que memoização de callbacks visuais.
- `Configuracoes` mantém 88 estados somados no módulo e `IA` 31; muitos pertencem a seções independentes e podem sair quando as seções virarem módulos.
- Não há evidência para recomendar `React.memo`, `useMemo` ou `useCallback` generalizados. A base já possui 134 memoizações em `ConversaView` e 52 em `chatList`; aumentar isso sem profiling elevaria complexidade.

### 9.3 Listas, loading, erro e vazio

- Chat list e thread principal possuem paginação/virtualização e estados de carregamento; ponto positivo.
- Help Desk limita a resposta a 100 e renderiza `tickets.map` sem paginação/virtualização (`HelpDesk.jsx:171-183,403-425`). Pode ocultar resultados acima do limite e renderizar 100 linhas completas.
- `Configuracoes.loadAll` converte cada falha em `[]`/`null`, tornando um erro de rede indistinguível de “nenhum usuário/tag/cliente” (`:159-178`).
- `fetchResumo` do disparo ignora erro (`DisparoMensagens.jsx:495-498`), gerando feedback diferente da lista.
- O tratamento de loading é local e inconsistente: algumas páginas preservam dados anteriores; outras limpam a lista no erro.

### 9.4 Refs, timers e desmontagem

Não foram encontrados listeners React principais acumulando a cada render sem cleanup. Foram encontrados riscos pontuais:

- `socket.js:185-198` cria novo `AudioContext` para cada beep e não chama `close()`;
- `alertaSemRespostaDedup` guarda uma chave por conversa/tipo/nível e nunca remove entradas expiradas durante a conexão (`socket.js:1192-1201`);
- timers de `atualizarDebounce` são locais a `initSocket` e não são acessíveis/limpos por `disconnectSocket` (`:1554-1567,1650-1675`); podem executar um fetch até 180 ms após logout/reinit;
- timeouts pontuais de highlight em `ConversaView.jsx:3150-3191` não são cancelados no unmount, mas seu impacto é DOM/local e curto.

## 10. Performance

### 10.1 Principais riscos

1. **Merge de mensagens potencialmente quadrático:** várias passagens com `some/find` sobre a mesma lista dentro de loops. Deve ser benchmarkado com 1 mil, 5 mil e 10 mil mensagens antes de otimizar.
2. **Chunks e CSS do atendimento:** `ConversaView` soma aproximadamente 134,6 KB gzip entre JS e CSS; `chatList`, 65,4 KB gzip. O lazy loading limita o impacto inicial, mas a entrada na tela carrega ambos.
3. **CSS com centenas de overrides:** custo de recálculo/depuração e alto risco de regressão visual; o problema principal é manutenção, não prova de frame drop.
4. **Requisições administrativas em excesso:** oito endpoints em toda abertura de Configurações, busca sem cancelamento em Help Desk/Disparo/CRM e possíveis chamadas duplicadas ao voltar à página 1.
5. **Help Desk sem paginação:** limite fixo de 100 e render completo.
6. **Cálculo de unread O(n):** pequeno por evento, mas frequente em turnos com muitos chats.
7. **Duas bibliotecas de ícones:** agrupadas em chunk de 50,2 KB bruto; a coexistência pode ser deliberada, mas aumenta superfície/bundle.

### 10.2 O que não foi considerado problema comprovado

- não foi recomendada virtualização para toda tabela pequena;
- imagens remotas sem `loading=lazy` não foram classificadas automaticamente: muitas estão em linhas virtualizadas ou são avatar/mídia imediatamente visível;
- callbacks recriados não foram marcados sem medir rerender dos filhos;
- chunks abaixo do limite padrão do Vite não são, por si só, excessivos.

## 11. Socket.IO e tempo real

### 11.1 Conexão e idempotência

Há uma única variável `socket` no módulo (`socket.js:649`). `initSocket` retorna a instância se o token for o mesmo e desconecta antes de trocar token (`:801-806`). Antes de registrar listeners, chama `off(event)` para todos os eventos do domínio (`:828-854`). Na reconexão, entra na empresa, reentra na conversa selecionada, faz refresh silencioso e pede resync da lista (`:856-872`). Isso reduz conexões/listeners duplicados.

Ressalva: `off(event)` sem o handler remove **todos** os listeners daquele nome na instância. Hoje não foi confirmado conflito com outro módulo para os mesmos eventos, mas a API é frágil se novos consumidores compartilharem o evento.

### 11.2 Falta de defesa multiempresa em handlers

Outros handlers usam `shouldIgnoreByCompany(payload)`, por exemplo preferências (`:1445-1449`) e `CONVERSA_ATRIBUIDA` (`:1477-1480`). Porém:

- `conversa_apagada` chama remoção diretamente (`:1457-1459`);
- `conversa_encerrada` chama `patchEverywhere` (`:1460-1462`);
- `CONVERSA_TRANSFERIDA` chama `patchEverywhere` (`:1464-1471`);
- `conversa_reaberta` chama `patchEverywhere` (`:1473-1475`);
- `patchEverywhere` não filtra empresa (`:1419-1441`).

Se o backend garantir salas por empresa, o frontend normalmente não recebe payload alheio. Se ocorrer reconexão/room incorreta ou evento sem isolamento, o frontend pode remover, adicionar ou alterar um chat com id coincidente. O comportamento do código é confirmado; a ocorrência em produção é hipótese que exige teste de contrato Socket/backend.

### 11.3 Dedupe, ACK e notificações

O código contém dedupe por ids/temporários, reconciliação de ACK, batching de status e supressão de som na transferência. Os testes Node cobrem mídia, sequência, ordem, outbox, status e watchdog. O risco é a regra estar distribuída entre `socket.js`, `conversaStore.js`, `conversaOptimisticMessage.js`, `conversaOutboundMediaMerge.js` e a página.

`alertaSemRespostaDedup` expira logicamente após 8 s, mas as chaves antigas não são apagadas. Em turno longo com muitas conversas, o Map cresce até reconectar. O fallback sonoro também cria contextos de áudio sem fechamento. São vazamentos potenciais de crescimento lento, não indisponibilidade comprovada.

### 11.4 Mistura de camadas

`socket.js` lê `localStorage`, consulta DOM para métricas de scroll (`:614-623`), atualiza `document.title`, toca áudio, abre Notification API, chama API e modifica stores. Uma camada futura de transporte deveria somente normalizar/emitir eventos de domínio; reducers/handlers testáveis aplicariam efeitos nos stores e serviços de notificação cuidariam da UI do sistema.

## 12. Requisições e gerenciamento de dados

### 12.1 Centralização

O cliente Axios, autenticação e timeout estão centralizados. Serviços por domínio existem em `src/api`, `src/chats`, `src/conversa` e `src/internal-chat`. A dispersão ocorre porque páginas ainda chamam endpoints diretamente e há serviços duplicados em pastas diferentes.

### 12.2 Cache e paginação

- chats: cache lateral, paginação e resync bem desenvolvidos;
- conversa: cache por thread, paginação de histórico e abort da troca;
- produtos e chat interno: limites explícitos;
- clientes de Configurações: paginação incremental fora de busca;
- Help Desk: apenas `limit:100`, sem navegação de páginas;
- CRM interno: paginação varia por página, mas o módulo está inativo na rota atual;
- disparos: paginação existe, mas a coordenação busca/página pode duplicar requests.

Não há React Query/SWR, e isso não é automaticamente uma falha. O custo é cada página implementar por conta própria cache, retry, stale-response e loading.

### 12.3 Cancelamento e condições de corrida

Abort está bem empregado nos dois fluxos mais sensíveis — lista e conversa — e na busca interna de mensagens. Não aparece nos fluxos de Configurações, IA, Help Desk, CRM e Disparo. O padrão `setState(await request())` sem id de geração permite:

```text
busca A inicia → busca B inicia → B responde → A responde → UI volta para A
```

Isso é especialmente relevante em busca de clientes, contatos, campanhas, tickets e detalhes após troca rápida.

### 12.4 API + Socket

Chats e mensagens conciliam resposta da API, item otimista e Socket.IO, com tests de merge. Help Desk reage ao socket fazendo refetch debounced e polling; `backgroundRefreshRunning` evita concorrência simultânea, mas descarta novos sinais enquanto uma atualização está em curso em vez de garantir uma última execução. CRM usa `refreshTick` com recomendação de debounce no próprio comentário do hook.

## 13. Duplicação

### 13.1 Duplicações literais confirmadas

| Função | Locais |
|---|---|
| `getDepartamentos` | `api/configService.js:74`, `api/dashboardService.js:8` |
| `criarRespostaSalva` | `api/configService.js:132`, `api/dashboardService.js:19` |
| `disparoApiError` | `disparoExecucaoService.js:5`, `disparoService.js:5`, `disparoInstanciasService.js:5`, `disparoLimitesService.js:5`, `disparoRevisaoService.js:5`, `disparoVariacoesService.js:5` |
| `adicionarTagConversa`/`removerTagConversa` | `api/tagService.js:15-20`, `conversa/conversaService.js:437-443` |
| `parseToDate`/`formatHora` | `ChatListRow.jsx:82-96`, `conversaViewHelpers.js:15-29` |
| `normalizeDirection` | `chatListRowAtendimento.js:119`, `chatListRowCompare.js:16` |
| `downloadBlob` | `DisparoEtapa8Section.jsx:98`, `DisparoRevisaoStep.jsx:69` |
| `buildStickerStorageKey`/`readRecentStickers` | `ConversaComposer.jsx:176-188`, `conversaViewHelpers.js:854-860` |
| `stopStreamTracks` | `audioRecordingLifecycle.js:19`, `micStreamService.js:18` |
| `getStoredTheme` | `MainLayout.jsx:42`, `Configuracoes.jsx:385` |
| ícones `IconSend`, `IconEmoji`, `IconClose` | `conversaComposerIcons.jsx`, `conversaViewIcons.jsx` |

Esses casos são confirmados por corpos normalizados idênticos. A centralização futura deve preservar exports temporários para não juntar refatoração estrutural com alteração de consumidores.

### 13.2 Duplicações prováveis

- várias funções `formatDate`, `fmtIsoLocal`, bytes e iniciais têm implementações semelhantes, mas nem sempre contrato igual;
- páginas de disparo repetem card, loading, paginação, erro e upload;
- IA/Configurações/Dashboard repetem carga de departamentos/usuários;
- CSS repete padrões de card, toolbar, modal e breakpoint com especificidade diferente.

Classificação: **provável**, exigindo comparação de contrato, locale, timezone e estados vazios antes de unificar.

## 14. Código possivelmente não utilizado ou legado

### Confirmado pelo próprio código

- `src/pages/AppLayout.jsx`: marcado `@deprecated Código morto — não usado em AppRoutes` (`:2`).
- CRM interno: `CrmAvancadoRedirect` afirma que foi removido e não renderiza Outlet, embora as rotas/páginas permaneçam.

### Forte evidência por ausência de importadores estáticos + conferência de rotas

- `src/crm/CrmLayout.jsx`;
- `src/pages/Campanhas.jsx` e `campanhas.css`;
- `src/pages/Usuarios.jsx`;
- `src/ia/IaAnaliticaPanel.jsx`;
- `src/media/MicPermissionPrompt.jsx`;
- `src/layouts/sidebarNavConfig.js`;
- `src/settings/themeStore.js`;
- `src/api/chatService.js` (diferente de `src/chats/chatService.js`);
- `src/components/ui/Input.jsx` e `input.css`;
- `src/dashboard/KpiCard.jsx` e charts `AtendimentoPorHora`/`ConversasPorAtendente`.

### Dependência provável não usada

`react-easy-crop` aparece em `package.json`, lockfile e comentário CSS, mas nenhum import foi encontrado. `react-image-crop` é a implementação ativa. Só remover após validar import indireto/plugin e build em todos os targets.

### Não classificado como morto

- `src/main.jsx` não tem importador porque é entry point de `index.html`;
- `public/sw.js` é referenciado por registro/import do service worker, não por import normal;
- imports lazy e rotas foram incluídos na análise;
- arquivos de documentação antiga não são código morto, apenas material histórico.

Não foram encontrados arquivos de backup/cópia de código pelo nome. Há métodos marcados `@deprecated` em `crmService.ts` e `internalChatService.js`; precisam de busca de consumidores antes de remoção.

## 15. Segurança e qualidade

### 15.1 JWT em storage e URL

O JWT em `localStorage` amplia o impacto de qualquer XSS: código executado na origem pode ler a sessão. Além disso, `getMediaPlaybackUrl` e `normalizeExistingMediaProxyUrl` adicionam `access_token` na query (`conversaViewHelpers.js:633-642,653-681`) e `refreshProxyMediaToken` o renova em URLs (`:687-714`). A motivação técnica é válida — `<audio>/<video>` não enviam header Authorization — mas tokens em URL podem aparecer em logs de proxy/servidor, telemetria, histórico técnico e ferramentas de diagnóstico.

Antes de alterar, backend e frontend devem definir alternativa compatível: cookie HttpOnly restrito, URL assinada curta/one-shot ou endpoint que troca bearer por URL efêmera. Não mudar isoladamente, pois quebraria mídia.

### 15.2 Autorização visual e fallback

`authStore.login` usa `data.usuario || {}` e, se perfil/role não vier, atribui `admin` para um e-mail fixo ou `atendente` aos demais (`authStore.js:40-49`). `permissoesStore` converte falha de API em `{}` (`:28-30`), e `can()` usa fallback por role quando o código não existe (`permissions.js:28-35`). Não há estado “permissões falharam” na `ProtectedRoute`.

Isso confirma que a UI pode exibir áreas pelo perfil mesmo quando a API de permissões falha. O backend precisa rejeitar cada endpoint independentemente. Também há dois dialetos de códigos (`config_acessar` versus `disparo.ver`/`atendimentos.*`), que devem ser comparados com o catálogo do backend antes de refatorar.

### 15.3 HTML e XSS

`ManualComponents.jsx:39,52,89,104,131,150` usa `dangerouslySetInnerHTML`. Hoje os arrays vêm de módulos estáticos do próprio bundle, então não foi encontrado vetor remoto confirmado. A fronteira é insegura se o manual passar a vir de API/CMS; nesse caso precisa sanitização ou AST/React nodes.

### 15.4 URLs e credenciais fixas

- `baseUrl.js:8-10` contém fallback de produção fixo. Não é segredo, mas acopla builds sem `VITE_API_URL` a um host real.
- `e2e/smoke.spec.js:3-4` contém credenciais default em código. Elas falharam nesta execução, portanto não foi confirmado que correspondam a conta válida. Validar manualmente e remover/rotacionar se a conta existir; não repetir o segredo em logs/documentação.
- nenhuma chave privada, token fixo ou senha de produção foi encontrada em `src`; valores dos arquivos `.env` não foram impressos nem copiados para este relatório.

### 15.5 Uploads

O disparo mostra limites de 5/32/16/100 MB e usa `accept`, mas `handleUpload` envia o arquivo sem conferir `file.size` ou MIME no frontend (`DisparoMensagensStep.jsx:242-250,944-1013`). O composer principal também depende principalmente de `accept`. `accept` é dica do navegador, não validação de segurança. O backend deve validar tamanho, tipo real, nome e conteúdo; a checagem frontend futura serve para feedback e economia de banda.

### 15.6 Logs e erros

Logs detalhados de boundary/socket estão protegidos por `import.meta.env.DEV` (`ConversaView.jsx:622-625,3572-3578`; `socket.js:625-646`). Não foram classificados como vazamento de produção. Há muitos `catch {}`/fallbacks silenciosos: úteis para não derrubar a UI, mas dificultam distinguir indisponibilidade de vazio. `notificationDiagnostics.js` tem logs explícitos para diagnóstico; confirmar que só é acionado por fluxo administrativo.

## 16. Cobertura e ausência de testes

### 16.1 O que existe

Os scripts Node cobrem com boa profundidade:

- merge e dedupe de áudio/mídia;
- mídia recebida e sequência de mensagens;
- fronteira de conversa e roteamento de contato;
- ordem realtime e mensagens consecutivas;
- candidatos/recovery de playback;
- lifecycle de microfone/gravação;
- outbox offline;
- batching de status;
- timeout/watchdog/retry;
- scroll de ações e recuperação de deploy.

Playwright cobre desktop/mobile para login, lista, refresh, envio de texto, rota protegida, áudio, fila FIFO, troca rápida, virtualização e estabilidade de scroll. O valor é alto, mas a suíte não está verde e parte depende de backend/credenciais locais.

### 16.2 Lacunas críticas antes de refatorar

| Área | Testes necessários antes da divisão |
|---|---|
| Texto/ACK | POST responde antes/depois do socket; mesmo `client_temp_id`; timeout seguido de ACK; retry não duplica |
| Recebimento Socket | duplicata por mesmo id; eventos fora de ordem; reconexão; evento de outra empresa; troca de conversa durante evento |
| Mídia | imagem/áudio/vídeo/documento; preview imediato; FIFO; ACK antes/depois do upload; refresh; falha/retry; token expirado |
| Ordenação | timestamps iguais/ausentes; temp + persistida; histórico antigo; status sem reordenar indevidamente |
| Troca de conversa | request antiga abortada; socket da anterior; scroll/cache; arquivo/áudio pendente |
| Upload | tamanho/MIME, cancelamento, progresso, erro de rede, retry idempotente |
| Busca/filtros | debounce, página volta a 1, resposta antiga não vence, contadores coerentes |
| CRM | decisão SSO/503/erro; confirmar se CRM interno deve existir ou ser removido |
| Disparos | cada etapa, autosave, destinatários, limites, revisão, start/stop/retry e permissões |
| Auth/permissões | payload `usuario`/`user`, role ausente, API de permissões falha/nega, 401 multiaba e backend 403 |
| Help Desk | busca rápida, troca rápida de ticket, >100 tickets, socket durante refresh |
| Config/IA | falha parcial, aba isolada, permissões, respostas antigas e payloads |

### 16.3 Confiabilidade da suíte

Não há coverage, runner unitário padronizado nem script agregador. Seis testes úteis nem sequer estão no `package.json`. A primeira meta da próxima etapa deve ser tornar um subconjunto determinístico obrigatório: testes Node + Playwright mock isolado. Smoke com backend real deve ser job separado e condicionado a ambiente/segredos.

## 17. Candidatos à futura modularização

### 17.1 Cinco melhores candidatos

#### 1. `ConversaView.jsx` — prioridade crítica, risco grande

- **Responsabilidade que fica na página:** selecionar conversa, compor view-model e coordenar regiões.
- **Misturas atuais:** transporte, optimistic state, uploads, scroll, modais, ações de atendimento e UI.
- **Extrações futuras:** `useConversationLifecycle`, `useConversationSendQueue`, `useConversationActions`, `useConversationParticipants`, `useConversationSearch`, `useConversationScrollCoordinator`.
- **Componentes:** manter `ConversaHeader`, `ConversaThread`, `ConversaComposer`, sidebars e modais, mas substituir dezenas de props por interfaces `threadModel/threadActions` pequenas e estáveis.
- **Serviços:** mover os POSTs diretos de arquivo/grupo/departamento para services existentes.
- **Estados que ficam:** id/estado de composição visual da página e abertura de painéis.
- **Estados que podem sair:** fila/upload, seleção de reply/forward, busca, participantes e comandos de domínio.
- **Dependências:** `conversaStore`, `chatsStore`, socket, Axios, virtualização, CSS e media lifecycle.
- **Testes prévios:** toda a matriz de mensagem/ACK/mídia/scroll/troca.
- **Ordem segura:** (1) characterization; (2) extrair funções puras sem mudar chamadas; (3) encapsular um fluxo de modal; (4) encapsular ações HTTP; (5) fila de mídia; (6) scroll por último. Nunca mudar store/merge/socket no mesmo PR.

#### 2. `chatList.jsx` — prioridade crítica, risco grande

- **Responsabilidade que fica:** compor lista, toolbar e seleção.
- **Misturas:** consulta, cache, filtros, contadores, status de instância, resync, layout e menus.
- **Hooks futuros:** `useChatListQuery`, `useChatListPagination`, `useChatListFilters`, `useChatListResync`, `useWhatsappInstanceStatus`.
- **Componentes:** toolbar/painéis já existem; reduzir interfaces de 68/55/42 props com view-models específicos, não Context global.
- **Estados que podem sair:** filtros serializáveis, request generation, paginação e resync.
- **Dependências:** chat service/store, sidebar cache, socket indiretamente, virtualização.
- **Testes prévios:** busca/prefixo, paginação, filtro/fila, resposta antiga, resync, seleção mobile, unread.
- **Ordem:** congelar comportamento → extrair status de instância → extrair query/paginação → extrair filtros → reduzir props. Não alterar comparadores/store junto.

#### 3. `ConversaComposer.jsx` — prioridade crítica, risco grande

- **Responsabilidade que fica:** editor e composição do payload solicitado pelo usuário.
- **Misturas:** draft, typing, autocorrect, respostas, emoji/sticker, arquivos e gravação.
- **Hooks futuros:** `useComposerDraft`, `useTypingEmitter`, `useSavedReplies`, `useStickerPicker`, `useAttachmentPicker`, `useVoiceRecording`.
- **Componentes:** `ComposerTextArea`, `ComposerActionBar`, `EmojiPicker`, `StickerPicker`, `VoiceRecorder`, `AttachmentInputs`.
- **Serviços/utils:** storage de stickers/draft, validação de arquivo e lifecycle de gravação.
- **Estados que ficam:** texto e picker visual ativo; os estados de gravação/upload pertencem aos hooks.
- **Testes prévios:** Enter/Shift+Enter, typing start/stop, draft por conversa, mic cleanup, arquivo, sticker e disabled states.
- **Ordem:** helpers duplicados → inputs/pickers visuais → hook de draft/typing → gravação por último.

#### 4. `Configuracoes.jsx` — prioridade crítica, risco médio

- **Responsabilidade que fica:** shell, tab/URL e autorização.
- **Misturas:** nove domínios, oito cargas iniciais, 13 componentes e modais CRUD.
- **Hooks futuros:** um query/controller por aba, com load sob demanda e proteção contra resposta antiga.
- **Componentes:** mover cada `Secao*` e seus modais para módulo do domínio preservando props inicialmente.
- **Serviços:** centralizar erros/normalização no `configService`; não duplicar dashboard/tag services.
- **Estados que ficam:** aba atual e modal global; dados/loading/error saem para a seção ativa.
- **Testes prévios:** autorização, tab por URL, falha parcial, CRUD e paginação de clientes.
- **Ordem:** extrair componentes sem lógica → testar → lazy data por aba → padronizar erro. Não alterar permissões junto.

#### 5. `IA.jsx` — prioridade crítica, risco médio/grande

- **Responsabilidade que fica:** shell e navegação entre configurações do módulo.
- **Misturas:** respostas, IA, automações, triagem, preview, gestores, alertas e logs.
- **Hooks futuros:** `useIaConfig`, `useTriagemConfig`, `useAlertasSemResposta`, `useIaLogs`.
- **Componentes:** módulos já delineados pelas seções de linhas 431, 631, 730, 894, 2045 e 2699.
- **Serviços:** remover `api.get` direto da página e fechar contratos no `iaService`/config services.
- **Estados que ficam:** seção ativa; formulários e requests pertencem aos módulos.
- **Testes prévios:** serialização de payload, load/save, preview, permissões, erro parcial e debounce.
- **Ordem:** alertas/logs → respostas → automações → triagem por último, preservando CSS e payloads.

### 17.2 Outros arquivos de prioridade alta/crítica

| Arquivo/grupo | Divisão futura concreta | Risco | Pré-condição |
|---|---|---|---|
| `ConversaBubble.jsx` | renderers por tipo + `AudioWavePlayer` + menu/gestos | Grande | playback/retry/reação/gestos verdes |
| `conversaOutboundMediaMerge.js` | índices/maps internos e módulos por família de mensagem, mantendo uma façade | Grande | characterization + benchmark; não junto do store |
| `conversaStore.js` | cache/load, reducers/merge, actions e sessão | Grande | contrato público do store e testes de seleção/refresh |
| `socket.js` | transporte, roteador de eventos, reducers de store, notificações | Grande | testes de contrato por evento/empresa/reconexão |
| `Dashboard.jsx` | um módulo por card/seção e hook de catálogos compartilhados | Pequeno/médio | snapshots/estados de loading |
| `ChatListRow.jsx` | avatar, preview, status, lock/atendimento e menu | Médio | testes de compare/render/status |
| `SidebarCliente.jsx` | dados do cliente, edição, CRM e histórico/anotações | Médio | testes de save/SSO/permissão |
| `AtendimentoActions.jsx` | ações puras + menus desktop/mobile + loaders | Médio | testes por status/perfil |
| `Disparo*Step.jsx` | uma pasta por etapa: controller, view, validators e subcards | Médio/grande | testes do wizard e autosave |
| `DisparoExecucaoPage.jsx` | progresso, métricas, tabela/log e comandos | Médio | testes start/pause/cancel/retry |
| `InternalChat.jsx` | lista, thread, composer orchestration e socket hook | Médio | texto/mídia/áudio/unread |
| `HelpDesk.jsx` | query/lista, detalhe, filtros, actions e realtime refresh | Médio | testes de race/paginação/socket |
| `useForwardFlow.js` | busca de destinos, seleção, envio e limite de 10 | Médio | testes de ordem/limite/falha parcial |
| `chatService.js` | leitura/lista, criação/sync, tags e status de instância | Médio | mapa de endpoints/consumidores |
| `chatsStore.js` | reducers puros, resync e ações públicas | Grande | testes do contrato Zustand |
| CSS de conversa/lista | tokens/base, layout desktop, mobile, mídia, modais e feature CSS | Grande | screenshots por breakpoint; preservar ordem |
| CSS IA/disparo/dashboard/internal | arquivo por seção/componente | Médio | screenshots e inventário de seletores |

`ManualContent.jsx` e dicionários declarativos não são prioridade de modularização apesar das linhas. No CRM interno, primeiro decidir se o produto ainda existe; modularizar código possivelmente legado seria desperdício.

## 18. Matriz de achados

Confiança: **C** confirmado pelo código/execução; **F** forte evidência; **H** hipótese que precisa de teste. Risco de refatoração indica chance de quebrar comportamento ao corrigir, não severidade do problema.

| ID | Achado | Sev. | Conf. | Esforço | Risco refatoração |
|---|---|:---:|:---:|:---:|:---:|
| H-01 | E2E isolado: áudio otimista não aparece desktop/mobile | Alta | F | Médio | Grande |
| H-02 | E2E isolado: abertura/envio e histórico mobile excedem gaps de scroll | Alta | F | Médio | Grande |
| H-03 | Núcleo de conversa monolítico e interfaces de até 59 props | Alta | C | Grande | Grande |
| H-04 | JWT incorporado em query string do proxy de mídia | Alta | C | Grande | Grande |
| H-05 | Fallback de role/permissões e e-mail especial podem liberar UI após falha de contrato | Alta | C | Médio | Grande |
| H-06 | Handlers Socket de apagar/encerrar/transferir/reabrir sem filtro de empresa | Alta | C | Pequeno | Médio |
| H-07 | Ciclo de importação com 14 módulos no núcleo auth/http/socket/conversa | Alta | C | Grande | Grande |
| H-08 | Respostas antigas podem vencer em Config/Help Desk/Disparo/CRM | Alta | F | Médio | Médio |
| H-09 | CSS de conversa/lista com milhares de linhas e centenas de overrides | Alta | C | Grande | Grande |
| H-10 | Merge de mídia com múltiplas passagens potencialmente O(n²) | Alta | F | Grande | Grande |
| H-11 | JWT persistente em `localStorage` amplia impacto de XSS | Alta | C | Grande | Grande |
| H-12 | Sem lint e JS/JSX fora do typecheck | Alta | C | Médio | Pequeno |
| M-01 | Configurações carrega oito endpoints e mascara falhas parciais | Média | C | Médio | Médio |
| M-02 | Help Desk limita/renderiza 100, sem paginação e busca a cada tecla | Média | C | Médio | Médio |
| M-03 | Endpoints e transformação HTTP ainda espalhados em páginas | Média | C | Médio | Médio |
| M-04 | CSS inválido em `disparoWizard.css:52`; build avisa e pode descartar fundo | Média | C | Pequeno | Pequeno |
| M-05 | AudioContext, Map de dedupe e timers Socket têm lifecycle incompleto | Média | F | Pequeno | Médio |
| M-06 | Rotas/páginas CRM internas contraditórias e não renderizáveis pelo pai atual | Média | C | Médio | Grande |
| M-07 | Conjunto de arquivos sem importadores e componentes legados prováveis | Média | F | Pequeno | Médio |
| M-08 | Funções/services literalmente duplicados | Média | C | Médio | Médio |
| M-09 | CSS de IA/disparo/dashboard/internal acumulou blocos repetidos | Média | C | Grande | Grande |
| M-10 | Chunks de atendimento são os maiores da aplicação | Média | C | Grande | Grande |
| M-11 | Fallback de API de produção fixo em builds sem env | Média | C | Pequeno | Médio |
| M-12 | Credenciais E2E default estão no repositório; validade não confirmada | Média | F | Pequeno | Pequeno |
| M-13 | `dangerouslySetInnerHTML` sem sanitização no manual estático | Média | C | Médio | Pequeno |
| M-14 | Limites/MIME de upload exibidos sem validação frontend equivalente | Média | C | Pequeno | Pequeno |
| M-15 | `@types/react` 19 com runtime React 18 | Média | C | Pequeno | Médio |
| M-16 | Erros tratados como vazio/silêncio de forma inconsistente | Média | C | Médio | Médio |
| M-17 | Suíte sem coverage/agregador; E2E mistura mocks e ambiente real e está vermelha | Média | C | Médio | Pequeno |
| L-01 | Nomes/comentários `zapi` permanecem após migração de provedor | Baixa | C | Médio | Pequeno |
| L-02 | Helpers de tema repetidos em main/layout/config | Baixa | C | Pequeno | Pequeno |
| L-03 | `socket.off(event)` remove todos os handlers do nome | Baixa | C | Pequeno | Médio |
| L-04 | Dois pacotes de ícones para o mesmo tipo de tarefa | Baixa | C | Médio | Médio |
| L-05 | `react-easy-crop` provavelmente não usado | Baixa | F | Pequeno | Pequeno |
| L-06 | Somatório de unread percorre todos os chats em cada mutação | Baixa | C | Pequeno | Pequeno |
| L-07 | Chaves por índice no manual; aceitável enquanto conteúdo for estático | Baixa | C | Pequeno | Pequeno |

## 19. Ganhos esperados e dependências

| Melhoria futura | Ganho esperado | Depende de |
|---|---|---|
| estabilizar E2E mock | detectar regressão real de áudio/scroll antes de mover código | ambiente determinístico e baseline |
| testes Socket por evento/empresa | impedir duplicidade/contaminação de store | factory/adapter testável ou socket mock |
| remover JWT de URL | reduzir exposição em logs/telemetria | contrato backend de cookie/URL assinada |
| quebrar ciclo central | inicialização/testes mais previsíveis | interfaces de sessão/event bus e limpeza fora do HTTP |
| extrair query hooks de Disparo/Help Desk/Config | evitar stale response e duplicação | request generation/abort padronizado |
| dividir conversa/composer/bubble | revisão localizada, menos props e menor risco por mudança | testes verdes; contratos congelados |
| dividir CSS | reduzir colisão e regressão por cascade | screenshots e mapa de ordem/especificidade |
| centralizar duplicações | um contrato por endpoint/formatter | inventário de consumidores e exports compatíveis |
| carregar Config por aba | menos requests e erro mais preciso | componentes de seção independentes |
| benchmark/índices no merge | menor CPU em históricos longos | dataset real e invariantes caracterizados |
| padronizar lint/typecheck | detectar deps de efeito/imports e erros antes do build | decisão de regras sem autoformatar legado todo |

Dependências importantes:

```text
baseline E2E/Node
    ├──> refatoração ConversaView/Composer/Bubble
    ├──> refatoração socket/store/merge
    └──> divisão de CSS com screenshots

contrato backend de auth/mídia ──> retirada de token da URL/storage

decisão produto CRM ──> manter/testar OU remover código interno

adapter de sessão/eventos ──> quebra do ciclo http ↔ socket ↔ store
```

Não alterar em conjunto:

- `socket.js`, `conversaStore.js` e `conversaOutboundMediaMerge.js`;
- estrutura JSX de conversa e divisão de `conversa.css`;
- contrato de autenticação e contrato de mídia;
- regras de permissão e reorganização de rotas;
- autosave do wizard e componentes de todas as etapas no mesmo lote.

## 20. Ordem recomendada para a próxima etapa

1. **Reproduzir e estabilizar os E2E mocks vermelhos**, sem refatorar: áudio otimista, gaps na abertura/envio e histórico mobile. Separar smoke real de mocks.
2. **Adicionar testes de contrato Socket** para nova mensagem, ACK/status, reconexão, empresa divergente, apagar/encerrar/transferir/reabrir.
3. **Adicionar testes de auth/permissões e mídia autenticada**, alinhando com o backend antes de decidir storage/query token.
4. **Correções pequenas e isoladas de baixo risco**, cada uma com build/teste: CSS inválido, cleanup de AudioContext/Map/timers, filtro de empresa nos handlers — somente após autorização.
5. **Padronizar proteção contra stale response** em um fluxo por vez, começando por Help Desk ou lista de campanhas; validar busca rápida e troca de seleção.
6. **Extrair duplicações puras** mantendo façades/exports antigos: formatadores, erro de disparo e serviços de tags/departamentos.
7. **Modularizar Configurações**, primeiro movendo `Secao*` sem mudar lógica; depois carregar por aba.
8. **Modularizar IA** por seções independentes; triagem por último.
9. **Modularizar `ConversaComposer`**, começando por pickers/inputs visuais; gravação por último.
10. **Modularizar `ConversaBubble`** por renderer; player de áudio apenas com E2E verde.
11. **Reduzir `ConversaView`** por hooks de ação/request e modais; scroll fica por último.
12. **Refatorar chat list** com query/paginação separadas; preservar cache/comparadores.
13. **Quebrar o ciclo central** com adapters, uma aresta por vez, usando testes de import/boot.
14. **Otimizar merge somente após benchmark**, preservando a façade e todos os testes de caracterização.
15. **Dividir CSS por último em cada domínio**, junto de screenshots desktop/mobile, sem alterar markup no mesmo passo.

Validação mínima após cada futura mudança: TypeScript, lint quando existir, todos os scripts Node agregados, Playwright mock do domínio, build e comparação visual nos breakpoints 375/768/desktop. Uma alteração pequena por vez; se a etapa mudar mais de um contrato, dividi-la antes de começar.

## 21. Itens que exigem confirmação antes de qualquer alteração

1. O CRM interno deve voltar a existir ou todo o código abaixo de `/crm/*` é legado removível?
2. O backend valida autorização em **todos** os endpoints usados pelas rotas protegidas?
3. Qual é o catálogo oficial de permissões: `*_acessar`, `dominio.ver` ou ambos?
4. O backend garante room Socket por empresa e inclui `company_id` em todos os eventos?
5. O endpoint de mídia pode emitir URL assinada curta ou cookie HttpOnly em vez de `access_token` na query?
6. As credenciais default de `e2e/smoke.spec.js` correspondem a alguma conta válida em qualquer ambiente?
7. Qual o volume real máximo de chats/mensagens por turno para benchmark do merge e listas?
8. Os limites/MIMEs de upload mostrados no disparo são exatamente os validados pelo backend/provedor?
9. `react-easy-crop`, os componentes sem importadores e `AppLayout` podem ser removidos ou são usados por build/integração externa?
10. A documentação histórica deve continuar versionada ou ser marcada formalmente como obsoleta?
11. A suíte E2E é esperada contra backend local real, ambiente de staging ou somente mocks?
12. As alterações tracked que possam existir no workspace pertencem a qual trabalho em andamento? Qualquer refatoração futura deve partir de uma árvore explicitamente acordada.

## 22. Conclusão

O frontend tem mecanismos maduros em pontos difíceis — lazy loading, virtualização, cancelamento na conversa/lista, dedupe, outbox, batching e testes de regressão. O problema é que esses mecanismos se entrelaçaram em arquivos muito extensos, CSS acumulado e um grafo central cíclico. A próxima etapa segura começa por tornar os testes de áudio/scroll determinísticos e proteger contratos Socket/auth; só depois deve reduzir tamanho.

Esta auditoria encerra no diagnóstico. **Nenhum arquivo de código-fonte, configuração, dependência, teste, migration ou regra de negócio foi alterado por este trabalho.** O único arquivo criado no repositório foi este relatório.
