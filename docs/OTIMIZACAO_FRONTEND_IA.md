# Otimização do frontend — `IA.jsx`

Data: 2026-08-27  
Escopo: modularização exclusiva da página `/ia`  
Status: concluída, sem alterações em `IA.css`, backend, banco, endpoints, Socket.IO ou dependências.

## 1. Resumo executivo

`src/pages/IA.jsx` foi reduzido de 2.727 linhas e 126.254 bytes para uma fachada de 1 linha. A orquestração da rota está em `src/ia/IaShell.jsx`, com 87 linhas, 1 estado e 2 efeitos. O shell controla apenas a seção ativa, observa permissões, renderiza a navegação e monta a seção escolhida.

As funcionalidades foram separadas em oito domínios: respostas automáticas, configurações de IA, automações, triagem, preview, gestores, alertas sem resposta e logs. Cada seção é carregada com `React.lazy`; seções fechadas não montam hooks nem iniciam requisições.

Os contratos HTTP e payloads foram preservados. As chamadas diretas de departamentos e tags saíram da página e passaram a usar `configService`, já existente. Caches de requisição são isolados por empresa e deduplicam montagens repetidas do `StrictMode`. Hooks usam gerações de requisição para ignorar resultados obsoletos.

## 2. Comparação antes e depois

| Métrica | Antes | Depois |
|---|---:|---:|
| Linhas de `src/pages/IA.jsx` | 2.727 | 1 |
| Bytes de `src/pages/IA.jsx` | 126.254 | 43 |
| Estados no arquivo de fachada | 31 | 0 |
| Efeitos no arquivo de fachada | 11 | 0 |
| Shell efetivo | incorporado à página gigante | `src/ia/IaShell.jsx`, 87 linhas |
| Estados no shell | 10 estados da página + estados de seções | 1 (`activeTab`) |
| Efeitos no shell | carga global, logs/regras, permissão e URL | 2 (URL e permissão) |
| Componentes de domínio criados/extratos | 7 componentes internos no mesmo arquivo | 16 componentes/views/controllers em módulos próprios |
| Hooks de domínio criados | 0 | 5 (`useIaConfigSection`, `useRespostasAutomaticas`, `useTriagemAuxData`, `useClienteOptions`, `useLogs`) |
| Requisições próprias na abertura padrão | 4 endpoints únicos: config, departamentos, tags e logs; 8 chamadas observadas em dev/StrictMode | 3 endpoints únicos: config, departamentos e logs; deduplicados |
| Requisições próprias ao abrir diretamente `?tab=logs` | config, departamentos, tags e logs; duplicadas em dev | somente logs, uma carga deduplicada |
| Chunk JS inicial da rota IA | 84,83 kB bruto / 20,42 kB gzip | 4,02 kB bruto / 1,60 kB gzip |
| CSS da IA | 39,73 kB / 6,62 kB gzip | 39,73 kB / 6,62 kB gzip, inalterado |
| Tempo de build observado | 35,48 s | 12,40 s |

O tempo de build foi medido na mesma sessão, mas a segunda execução estava com caches do ambiente aquecidos; não deve ser interpretado isoladamente como ganho causado apenas por esta refatoração.

## 3. Arquitetura resultante

### Shell e compartilhados

- `src/pages/IA.jsx`: fachada compatível com o import da rota atual.
- `src/ia/IaShell.jsx`: permissão efetiva preexistente, URL, navegação e montagem da seção ativa.
- `src/ia/shared/configDefaults.js`: defaults preservados de IA, automações, triagem, alerta administrativo e alerta sem resposta.
- `src/ia/shared/configNormalization.js`: merge da resposta `/ia/config` e cache local por empresa.
- `src/ia/shared/configResource.js`: deduplicação da configuração compartilhada por tenant.
- `src/ia/shared/resourceCache.js`: deduplicação de recursos de seção, sempre com chave contendo a empresa.
- `src/ia/shared/useIaConfigSection.js`: carga e salvamento de uma única chave de `/ia/config`.
- `src/ia/shared/dateTime.js`: dias da semana, normalização de horário e rótulo de contato.
- `src/ia/shared/SectionFeedback.jsx`: loading e erro de seção.

### Respostas automáticas

- `src/ia/respostas/RespostasAutomaticasSection.jsx`: JSX mecânico da seção.
- `src/ia/respostas/RespostasAutomaticasSectionController.jsx`: liga view e controlador.
- `src/ia/respostas/useRespostasAutomaticas.js`: regras, formulário, departamentos, tags, criação, exclusão, loading, erro e proteção contra resposta obsoleta.

### Configurações de IA

- `src/ia/configuracoes/IaSettingsSection.jsx`: formulário visual e estado de edição local.
- `src/ia/configuracoes/IaSettingsSectionController.jsx`: usa somente a chave `ia` do recurso de configuração.

### Automações

- `src/ia/automacoes/AutomacoesSection.jsx`: formulário visual e estado de edição local.
- `src/ia/automacoes/AutomacoesSectionController.jsx`: usa somente a chave `automacoes`.

### Triagem, preview e gestores

- `src/ia/triagem/TriagemSection.jsx`: regras visuais e validações da triagem; reduziu para 689 linhas após as extrações de preview, gestor, payload e carregamentos.
- `src/ia/triagem/TriagemSectionController.jsx`: compõe configuração da triagem, alerta administrativo e dados auxiliares.
- `src/ia/triagem/useTriagemAuxData.js`: departamentos e logs carregados somente ao abrir triagem.
- `src/ia/triagem/triagemPayload.js`: serialização mecânica e testável do payload `chatbot_triage`.
- `src/ia/preview/TriagemPreview.jsx`: simulação do WhatsApp, confirmação, finalização e fora de horário.
- `src/ia/gestores/AdminAtendimentoAlertCard.jsx`: configuração e teste do alerta administrativo.
- `src/ia/gestores/useClienteOptions.js`: busca com debounce e geração de requisição; resultados antigos não substituem os novos.

### Alertas sem resposta

- `src/ia/alertas/AlertasAtendimentoSection.jsx`: domínio isolado de alertas, gestores, preview e eventos.
- `src/ia/alertas/alertaPayload.js`: payload de alerta isolado e coberto por igualdade profunda.

### Logs

- `src/ia/logs/LogsView.jsx`: apresentação da lista.
- `src/ia/logs/LogsSection.jsx`: estado de loading/erro da seção.
- `src/ia/logs/useLogs.js`: carregamento, atualização e proteção contra resposta obsoleta.

## 4. Mapa funcional, endpoints e payloads preservados

| Domínio | Leituras | Escritas e payloads |
|---|---|---|
| Configuração de IA | `GET /ia/config` | `PUT /ia/config` com `{ ia: values }` |
| Automações | recurso compartilhado `GET /ia/config` | `PUT /ia/config` com `{ automacoes: values }` |
| Triagem | `GET /ia/config`, `GET /dashboard/departamentos`, `GET /ia/logs?limit=50` | `PUT /ia/config` com `{ chatbot_triage: buildTriagemPayload(values) }` |
| Alerta administrativo | recurso compartilhado `GET /ia/config`; contatos em `GET /clientes` | `PUT /ia/config` com `{ admin_atendimento_alerta: values }`; teste em `POST /ia/admin-atendimento-alerta/testar` |
| Respostas automáticas | `GET /ia/regras`, `GET /dashboard/departamentos`, `GET /tags` | `POST /ia/regras`; `DELETE /ia/regras/:id` |
| Logs | `GET /ia/logs?limit=50` | nenhuma |
| Alertas sem resposta | `GET /usuarios`, `GET /config/alerta-sem-resposta`, `GET /config/alerta-sem-resposta/eventos?limit=20` | `PUT /config/alerta-sem-resposta`; `POST /config/alerta-sem-resposta/processar` com `{ dry_run: true }` |
| Gestores/contatos | `GET /clientes?palavra=...&limit=20&page=1` | nenhuma na busca |

Não houve alteração de path, método, parâmetro de query, timeout, header ou estrutura enviada ao backend.

## 5. Carga sob demanda e concorrência

- O shell monta somente uma seção. Trocar de aba desmonta o controlador anterior.
- Configuração compartilhada usa uma entrada por `companyKey`, impedindo mistura entre tenants.
- Logs, respostas, departamentos e alertas usam chaves de cache contendo a empresa.
- Promessas em andamento são compartilhadas para evitar duplicação causada pelo `StrictMode`.
- Falhas não são armazenadas como sucesso: a próxima abertura pode tentar novamente.
- Hooks incrementam `generationRef` no reload e no unmount; uma resposta antiga não chama os setters do estado atual.
- Busca de contatos mantém debounce de 250 ms e adiciona geração explícita. O cenário determinístico “antigo lento, novo rápido” passou em desktop e mobile.
- Loading e erro pertencem à seção. Uma falha em logs não desmonta a navegação nem impede abrir automações.
- Cache local continua sendo fallback de configuração; erro de API permanece visível e não é representado como estado vazio.

## 6. Permissões e rota

A rota `/ia` e seus redirects não foram alterados. O shell preserva o predicado efetivo que existia dentro de `IA.jsx`, `canAcessarConfiguracoes(user)`, além da proteção externa já existente em `AppRoutes` por `chatbot_acessar`. Essa combinação não foi corrigida ou reinterpretada nesta sessão, conforme a regra de preservar permissões.

O teste de usuário atendente confirma redirecionamento para `/atendimento` e ausência do conteúdo IA.

## 7. Validação visual

Capturas produzidas em 1.280 × 720 com o mesmo usuário e respostas mockadas:

- `docs/evidencias/ia/before-triagem-desktop.png`
- `docs/evidencias/ia/after-triagem-desktop.png`
- `docs/evidencias/ia/before-logs-desktop.png`
- `docs/evidencias/ia/after-logs-desktop.png`

Resultado:

- Triagem: igualdade pixel a pixel; 0 canais diferentes.
- Logs: conteúdo e card idênticos. A diferença ficou restrita à faixa de navegação (`x=82..947`, `y=147..171`) por estado transitório de foco/aba durante a troca assíncrona; `IA.css` não mudou.
- Os 22 testes específicos passaram também no perfil mobile Pixel 5.

## 8. Chunks finais

| Chunk | Bruto | Gzip | Momento de carga |
|---|---:|---:|---|
| Shell `IA` | 4,02 kB | 1,60 kB | entrada da rota |
| `LogsSection` | 2,07 kB | 1,09 kB | aba logs |
| `IaSettingsSectionController` | 4,88 kB | 1,96 kB | aba IA |
| `AutomacoesSectionController` | 5,57 kB | 1,87 kB | aba automações |
| `RespostasAutomaticasSectionController` | 7,96 kB | 2,57 kB | aba respostas |
| `AlertasAtendimentoSection` | 24,83 kB | 6,59 kB | aba alertas |
| `TriagemSectionController` | 35,93 kB | 9,45 kB | aba triagem |
| `useIaConfigSection` compartilhado | 2,95 kB | 1,34 kB | seções baseadas em `/ia/config` |
| `iaService` compartilhado | 2,16 kB | 0,86 kB | primeira seção que usa IA API |

O CSS permaneceu em um único chunk para preservar integralmente o visual existente.

## 9. Testes executados

### Antes das alterações

- `npm.cmd run test:frontend:baseline`
  - Node: 23/23 scripts passaram.
  - Playwright Atendimento: 7 passaram, 1 ignorado e 2 falharam por instabilidade já existente: timeout no primeiro `page.goto` e 3 amostras de gap mobile para limite 2.
- `.\node_modules\.bin\tsc.cmd --noEmit`: passou.
- `npm.cmd run build`: passou; 8.527 módulos, 35,48 s; aviso CSS preexistente de aspas curvas em `url(“data:...)`.

### Depois das alterações

- `node scripts/test-ia-payloads.mjs`: passou; igualdade profunda de triagem e alertas.
- Playwright IA desktop: 11/11 passaram.
- Playwright IA desktop + mobile: 22/22 passaram em 48,7 s.
- Captura visual antes/depois: 1/1 passou em cada fase.
- `npm.cmd run test:frontend:baseline`:
  - primeira execução final: 23/23 Node; o primeiro teste desktop do Atendimento repetiu a falha intermitente de lista vazia/timeout e interrompeu a segunda spec;
  - repetição a quente: 23/23 Node; auditoria Playwright 9 passaram e 1 ignorado; áudio Playwright 8/8; comando concluído com código 0.
- `.\node_modules\.bin\tsc.cmd --noEmit`: passou, sem saída.
- `npm.cmd run build`: passou; 8.554 módulos, 12,40 s; permaneceu apenas o mesmo aviso CSS preexistente.

## 10. Arquivos criados e alterados nesta sessão

### Alterado

- `src/pages/IA.jsx`

### Criados — código

- `src/ia/IaShell.jsx`
- `src/ia/alertas/AlertasAtendimentoSection.jsx`
- `src/ia/alertas/alertaPayload.js`
- `src/ia/automacoes/AutomacoesSection.jsx`
- `src/ia/automacoes/AutomacoesSectionController.jsx`
- `src/ia/configuracoes/IaSettingsSection.jsx`
- `src/ia/configuracoes/IaSettingsSectionController.jsx`
- `src/ia/gestores/AdminAtendimentoAlertCard.jsx`
- `src/ia/gestores/useClienteOptions.js`
- `src/ia/logs/LogsSection.jsx`
- `src/ia/logs/LogsView.jsx`
- `src/ia/logs/useLogs.js`
- `src/ia/preview/TriagemPreview.jsx`
- `src/ia/respostas/RespostasAutomaticasSection.jsx`
- `src/ia/respostas/RespostasAutomaticasSectionController.jsx`
- `src/ia/respostas/useRespostasAutomaticas.js`
- `src/ia/shared/configDefaults.js`
- `src/ia/shared/configNormalization.js`
- `src/ia/shared/configResource.js`
- `src/ia/shared/dateTime.js`
- `src/ia/shared/resourceCache.js`
- `src/ia/shared/SectionFeedback.jsx`
- `src/ia/shared/useIaConfigSection.js`
- `src/ia/triagem/TriagemSection.jsx`
- `src/ia/triagem/TriagemSectionController.jsx`
- `src/ia/triagem/triagemPayload.js`
- `src/ia/triagem/useTriagemAuxData.js`

### Criados — testes, evidências e documentação

- `e2e/ia-local-mock.spec.js`
- `scripts/test-ia-payloads.mjs`
- `scripts/capture-ia-visual.mjs`
- quatro PNGs em `docs/evidencias/ia/`
- `docs/OTIMIZACAO_FRONTEND_IA.md`

## 11. Limites mantidos e trabalho não iniciado

- `src/pages/IA.css` não foi alterado.
- Nenhum código do backend, banco, migration, endpoint ou Socket.IO foi tocado.
- Nenhuma dependência ou configuração de build foi alterada nesta sessão.
- Nenhuma regra de triagem, automação, alerta, permissão ou serialização foi deliberadamente modificada.
- Nenhum commit, push ou deploy foi executado.
- Alterações preexistentes da Sessão 1, da Sessão 2 de Configurações e demais arquivos do workspace foram preservadas.
- Não foi iniciada a otimização de outro arquivo.

## 12. Pontos de manutenção futura

`TriagemSection.jsx` (689 linhas) e `AlertasAtendimentoSection.jsx` (758 linhas) continuam grandes, mas agora estão limitados aos seus próprios domínios e são chunks independentes. Uma sessão futura pode subdividir os cards visuais internamente, protegida pelos testes desta sessão. Essa subdivisão não é necessária para que `IA.jsx` permaneça um shell e não deve ser combinada com mudanças de regra de negócio.
