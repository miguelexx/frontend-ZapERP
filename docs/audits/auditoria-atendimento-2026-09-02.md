# Auditoria de Atendimento — comparação com as ressalvas anteriores

> **Nova atualização — itens 3 e 4 corrigidos localmente (02/09/2026):** contagem canônica, snapshot global autorizado, reconexão/deduplicação e Minha fila com uma única fonte visível. A reprodução original agora tem **8 cenários aprovados e 3 falhas fora destes pedidos** (janela ao limpar busca, busca de Minha fila restrita e revogação de blob de vídeo). Veja [detalhes e validação](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/correcoes-3-4-2026-09-02.md). As notas abaixo preservam o histórico da auditoria e da primeira rodada de correções.
> **Atualização após a auditoria — 02/09/2026:** os itens **1 (refresh A→B→A)** e **2 (filtro por funcionário)** foram corrigidos a pedido do usuário. A reprodução original agora aprova ambos; os outros seis cenários que falhavam continuam fora deste pedido. A suíte passou com **30/30 scripts**, incluindo 11 cenários de concorrência e testes de consistência do funcionário em 12 abas. Build aprovado, com o aviso de CSS preexistente. Veja [resultado após as duas correções](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/resultado-apos-correcoes-1-2-2026-09-02.txt). O restante deste documento preserva o diagnóstico histórico do corte das 11:41.

**Resultado: ainda não está tudo correto. Há correções reais, mas permanecem falhas reproduzíveis na lista, nos filtros, nas não lidas e na atualização da conversa.**

Referência: texto anexado pelo usuário. Código auditado: frontend local, incluindo alterações ainda não commitadas. Corte da reprodução final: **02/09/2026, 11:41:24, America/Sao_Paulo**. Outros processos editaram arquivos durante a análise; a reprodução final teve os hashes conferidos antes e depois, sem alteração nos 22 arquivos monitorados durante essa execução. Mudanças posteriores precisam de nova conferência.

Esta tarefa criou apenas os artefatos de auditoria; não implementou correções em `src/`.

## Verificações executadas

| Verificação | Resultado | Limite da conclusão |
|---|---|---|
| Suíte existente `node scripts/test-node-suite.mjs` | **28/28 scripts passaram** | Cobre os cenários existentes; não todos os problemas do texto. |
| Teste de filtros, repetido após a limpeza de código observada | **Passou** | `scripts/test-chat-list-fetch-params.mjs`. |
| Compilação Vite em diretório temporário | **Passou**, 8.635 módulos | Não substituiu `dist/`. Aviso de CSS descrito abaixo. |
| Playwright: envio consecutivo desktop e mobile; troca rápida desktop | **3 passaram; 1 pulado** | O próprio teste pula a troca rápida no projeto mobile. HTTP simulado; socket real não exercitado. |
| Reprodução específica desta auditoria | **3 passaram; 8 falharam** | Código real, armazenamento/HTTP simulados. Os dois cenários da Minha fila exercitam o helper, sem reproduzir toda a sequência de eventos no navegador. |

A primeira tentativa do Playwright reutilizou o servidor da porta 5173 e falhou antes dos fluxos, com timeout/nenhum card. No servidor isolado 5186, com a API de desenvolvimento configurada para coincidir com os mocks, os três casos executados passaram. As falhas iniciais não foram usadas como evidência de defeito do produto.

Os testes de navegador não homologam o backend, produção, isolamento entre empresas, duas sessões simultâneas nem teclado virtual em aparelho físico.

## O que já foi corrigido

1. **Resync durante o throttle:** `useChatListResync.js:67` agora agenda um `load({ background: true })`; se houver uma carga em andamento, enfileira outra. A ressalva “atualiza só os chips e esquece os cards” foi tratada no código.
2. **Extras preservados no GET completo da Minha fila:** `mergeActiveTabBackgroundRows` respeita `incomingIsComplete`. O teste confirma que uma lista anterior `[11, 22]`, diante de uma resposta completa `[11]`, termina em `[11]`.
3. **Dados da visão publicados para o socket:** a store e `buildActiveChatListViewFromStore` agora incluem funcionário, IDs pendentes e departamento. Falta alinhar a precedência desses filtros, detalhada abaixo.
4. **Início da busca:** `searchActive` usa `searchInput`, sem aguardar o debounce. A janela ao limpar a busca continua incorreta.
5. **Não lidas já conhecidas preservadas entre abas:** existe `unreadById`. Carregar uma conversa com 2 não lidas e depois trocar para Finalizadas mantém o total 2. Isso ainda não equivale a um total global reconciliado com o servidor.
6. **Contagem duplicada entre chips:** `chatRowChipCountKeys`, em `chatListQueryHelpers.js:168`, classifica uma conversa aguardando cliente apenas nesse chip. Confirmado por execução. Como os totais vêm de `/chats/counts`, a mesma exclusividade ainda precisa ser conferida no backend.
7. **Funções auxiliares sem uso:** `refreshMinhaFila` e os cinco refreshes de badges foram removidos durante a análise. `runAuxBadgeFetch` ficou com counts e supervisão; o comentário incorreto da store também foi ajustado. `computeBaseCounts` continua sem chamadas.
8. **Tema da nota interna:** os seletores por preferência do sistema usam `html:not([data-theme="light"])`; a escolha explícita do tema claro não é sobrescrita por esse fallback. É confirmação de código, não revisão visual completa dos temas.

## Falhas que ainda precisam de correção

### 1. Alta — resposta antiga de refresh restaura estado anterior após A → B → A

**Reproduzido com os métodos reais da store e respostas HTTP controladas.**

Sequência: iniciar refresh de A; abrir B; abrir A novamente com status `em_atendimento`; entregar a resposta antiga de A com status `aberta`. O estado final vira **`aberta`**. O refresh não participa da geração/abort do carregamento.

Evidência: [conversaStore.js:989](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/conversaStore.js:989).

Correção necessária: invalidar refreshes antigos ao trocar/fechar/reabrir a conversa e ordenar também refreshes concorrentes. As saídas de erro não devem alterar o loading de uma geração nova.

**Ajuste no diagnóstico anterior:** uma troca simples A → B já tem guarda por `selectedId` na resposta bem-sucedida. Não foi demonstrado que essa sequência simples mistura mensagens de A em B. A falha comprovada é A → B → A, restaurando metadados antigos.

### 2. Alta — filtro por funcionário continua divergente entre HTTP e socket

**Reproduzido.** Com a aba Finalizadas e funcionário 1 selecionado, `buildChatListFetchParams` envia `atendente_id=1` sem filtro de status. Entretanto, `shouldInsertChatRowInActiveList` rejeita uma conversa desse funcionário em atendimento por aplicar a aba Finalizadas. O caminho de remoção também reaplica a aba.

Evidência: [chatListQueryHelpers.js:81](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListQueryHelpers.js:81) e [chatListQueryHelpers.js:323](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListQueryHelpers.js:323).

Correção necessária: compartilhar a precedência efetiva entre montagem da consulta, inserção, remoção e filtro visual. Publicar os campos na store resolveu a falta de informação, mas não essa divergência de regras.

### 3. Alta — mapa de não lidas e card podem divergir e perder contagem

**Reproduzido:** três eventos fora da lista deixam `unreadById[11]=3`. Um GET atrasado insere o card com `unread_count=1`; `preferHigherLocal` preserva 3 no mapa, mas deixa 1 no card. No evento seguinte, `incUnreadComBadge` usa o card: o total vira **2**, quando deveria ser **4**.

Evidência: [chatsStore.js:304](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatsStore.js:304) e [chatsStore.js:760](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatsStore.js:760).

Além disso, o mapa começa vazio e só aprende com rows carregadas e eventos recebidos. Não há inicialização/reconciliação de todas as não lidas via `/counts`. Abrir diretamente uma aba que não contém as conversas não lidas ainda pode mostrar total incompleto. O incremento para um ID ausente também ocorre antes do resultado do GET autorizado, exigindo definição do escopo correto do contador.

Correção necessária: uma contagem canônica por conversa, sincronização da row com esse valor e snapshot agregado do servidor no escopo autorizado. Conferir deduplicação de eventos e recuperação após reconexão.

### 4. Alta — Minha fila ainda pode recorrer a snapshot antigo

**Dois casos reproduzidos no helper**, sem afirmar reprodução integral no navegador:

| Entrada em `resolveMinhaFilaPaintRows` | Resultado atual | Problema |
|---|---|---|
| Snapshot local `[11]`, store `[]` | `[11]` | Não distingue lista realmente vazia de lista ainda não carregada. |
| Snapshot local `[11]`, store atual `[33]` | `[11]` | Sem interseção de IDs, ignora a lista atual. |

Evidência: [chatListFilters.js:198](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListFilters.js:198).

Os patches passaram a propagar remoções para o array local e o resync completo elimina extras. São melhorias importantes; porém, a pertinência ainda depende de dois arrays e de uma heurística por interseção. Portanto, o item original está **parcialmente corrigido**.

Correção necessária: identificar explicitamente a qual consulta pertence o array e se a carga terminou, ou adotar uma única fonte para o recorte visível. Testar também remoção do último card e rajadas que alterem todos os IDs.

### 5. Média — busca global é novamente restringida na aba Minha fila

**Reproduzido na composição dos serviços:** o helper de consulta monta `palavra=Maria&incluir_todos_clientes=1`, mas `load` escolhe `fetchMinhaFilaChatsCompleto` só por estar na aba Minha fila; esse serviço acrescenta **`minha_fila=1`**.

Evidência: [chatList.jsx:680](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatList.jsx:680) e [chatService.js:252](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatService.js:252).

A requisição contradiz o contrato de busca global do frontend. O impacto exato depende da precedência desses parâmetros no backend, que não foi auditado. Correção: não usar a busca completa da Minha fila quando a busca global está ativa.

### 6. Média — limpar busca mantém a permissão de inserção global durante o debounce

**Reproduzido:** `searchActive=false`, `searchDebounced=true`, aba Finalizadas e conversa em atendimento resultam em inserção permitida. O início da digitação foi corrigido; ao limpar, o booleano do termo antigo ainda libera a inserção.

Evidência: [chatList.jsx:496](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatList.jsx:496) e [chatListQueryHelpers.js:323](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListQueryHelpers.js:323).

Correção necessária: invalidar imediatamente a busca anterior ao limpar e considerar o termo/generation atual na decisão, não apenas dois booleanos de presença de texto.

### 7. Alta — blob de vídeo continua sem liberação no reconcile

**Reproduzido:** o merge de um vídeo temporário com `/uploads/audit-video.mp4` remove `_optimisticBlobUrl`, mas realiza **zero chamadas** a `URL.revokeObjectURL`.

Evidência: [conversaOutboundMediaMerge.js:2](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/conversaOutboundMediaMerge.js:2) e [conversaOutboundMediaMerge.js:1120](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/conversaOutboundMediaMerge.js:1120).

A função de revogação existe em `conversaOptimisticMessage.js:153` e é chamada ao remover uma mensagem temporária; isso não cobre automaticamente o reconcile bem-sucedido. O cleanup de `pendingPreview` na view refere-se a outro ciclo de preview e não comprova a liberação do blob criado para a bolha.

Correção necessária: definir quem libera a URL após a substituição, preservando as referências ainda utilizadas por mídia/player/cache. A existência de um helper com nome semelhante não resolve o ciclo de vida.

## Demais ressalvas do texto original

| Item | Estado no corte auditado | Evidência / ação restante |
|---|---|---|
| Evento sem identificação de empresa | **Pendente** | `socket.js:365`: se não houver `company_id`/`empresa_id`, retorna false e permite o evento. É uma fragilidade defensiva confirmada, não prova de vazamento entre tenants. Conferir contrato de todos os eventos antes de adotar rejeição por padrão; o backend continua responsável pelo isolamento. |
| Cache de filtros de 15 minutos | **Pendente** | `chatListSidebarCache.js:13`: memória continua em 15 min; sessionStorage tem 45 s. A invalidação do resync ainda depende de `isMobileLayout`. Há remoção pontual em caches, mas não invalidação geral equivalente no desktop. |
| Hint mascara divergência | **Pendente** | `ChatListToolbar.jsx:81`: `Math.max(totalForHint, filteredCount)` permanece. Um total 2 com 6 cards pode ser exibido como “6 de 6”. |
| Mídia offline não persistida | **Pendente como limitação de produto** | `offlineOutbox.js` persiste somente texto. Os arquivos para retry de mídia ficam na sessão. Não foi identificado aviso específico de que F5 perde esse retry. Persistir mídia é uma decisão de escopo; não é obrigatório para validar a outbox de texto existente. |
| Reconnect dispara lista e thread | **Pendente** | `socket.js:912`: refresh da conversa e resync forçado da lista em cada conexão. Falta coalescer concorrência; simplesmente pular o resync pode perder recuperação de eventos. |
| Teclado mobile perde âncora | **Pendente de validação em dispositivo** | `useMobileKeyboardViewport.js:125` ainda atribui false ao fechar teclado fora da gravação. O sintoma completo não foi reproduzido em teclado físico/virtual real nesta tarefa. |
| Co-atendente aguarda participantes | **Pendente** | `useConversaParticipantes.js:11` começa com array vazio; o wrapper não expõe loading/carregado à regra de envio. `ConversaView.jsx:329` depende da lista de participantes. Falta estado de carregamento/cache com identidade de conversa. |
| Abrir conversa a partir de Clientes | **Pendente** | `ClientesSection.jsx:127` apenas chama `setSelectedId` e navega sem `openConversaId`. Para ID não nulo, `setSelectedId` não carrega mensagens. Usar o caminho que dispara `carregarConversa`. |
| Estimativa de texto longo | **Pendente de validação visual específica** | `ConversaMessageVirtualList.jsx:25` estima por caracteres e limita a altura estimada a 320/360. Existe medição real e preservação de âncora; o jump específico de texto longo não foi demonstrado nesta auditoria. |
| Cache de até 48 conversas sem teto por entrada | **Pendente como risco de memória** | `conversaStore.js:230` limita quantidade e TTL, não quantidade de mensagens/bytes por conversa. Não foi feita medição de RAM prolongada. |
| `computeBaseCounts` sem uso | **Pendente, baixa prioridade** | A busca no `src/` encontra apenas a definição em `chatListCounts.js:9`. |
| Nomes `zapi*` | **Legado ainda presente** | Renomear é manutenção, não condição para corrigir sincronização. |

## Correções no entendimento da auditoria anterior

- **Listeners não estão todos em `socket.js`.** `useConversaParticipantes.js:67` registra três eventos de participantes diretamente. Portanto, a afirmação absoluta de centralização não corresponde ao código atual.
- **Dois GETs após reconectar não constituem, sozinhos, um bug.** O problema é concorrência e custo; a recuperação de estado continua necessária.
- **O contador “global” precisa de escopo definido.** Um total global para o usuário deve respeitar permissões; não deve ser presumido como todas as conversas da empresa.
- **Testes existentes verdes não fecham as ressalvas.** Eles não cobriam os oito casos da reprodução adicional. Por outro lado, os testes de carregamento normal e envio consecutivo passaram no navegador isolado.

## Aviso adicional de compilação

O build encontrou aspas tipográficas em `url(“data:...”)`, em [disparoWizard.css:52](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/pages/disparoWizard.css:52). O minificador emitiu `css-syntax-error`. Não impediu a compilação e é fora do núcleo de Atendimento, mas deve ser corrigido para evitar a declaração de fundo inválida.

## Ordem recomendada

1. Corrigir a concorrência de `refresh()` e o contador canônico de não lidas.
2. Alinhar as regras de funcionário/aba/busca entre HTTP, socket e lista visível.
3. Remover a ambiguidade entre lista vazia, lista de outra consulta e snapshot da Minha fila.
4. Liberar os blobs substituídos com um ciclo de vida seguro para players e caches.
5. Validar contratos de empresa no socket; corrigir abertura via Clientes e feedback de participantes.
6. Ajustar cache/hint e validar teclado, texto longo e recuperação de mídia offline.

Não há evidência nesta auditoria de que as alterações locais estejam commitadas ou publicadas.

## Artefatos e reprodução

- [Script de reprodução](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/reproduzir-atendimento-2026-09-02.mjs).
- [Saída da reprodução final](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/resultado-atendimento-2026-09-02.txt).
- [Horário e hashes dos arquivos monitorados](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/estado-atendimento-2026-09-02.json).

Executar na raiz do frontend:

```powershell
node docs/audits/reproduzir-atendimento-2026-09-02.mjs
```

O script usa dados fictícios e não chama a API real. No estado auditado retorna código 1 pelas oito falhas de corretude esperada. Após as correções, os respectivos cenários devem passar.
