# Auditoria estática de certificação — Atendimento ZapERP

Data: 2026-09-09. Escopo: frontend. Resultado: **certificação parcial**. Cinco correções aplicadas em cinco arquivos de código; há pendências de reconciliação e validação visual que impedem declarar toda a página livre de bugs.

“certificado: OK” neste relatório significa que não foi encontrado defeito no caminho estático indicado, sob o contrato de payload descrito. Não significa homologação em navegador, celular ou produção. Os cenários abaixo são roteiros derivados do código; não foram executados.

## Método, preservação e verificações

Leitura de CLAUDE.md da raiz e do frontend, seguida dos handoffs 00, 14 e 15, antes da revisão do código. Rastreamento de socket → store → assinatura de igualdade → filtro/cache → React.memo → DOM/CSS, além de HTTP, respostas tardias, tratamento de erro e envio otimista.

- Mantidos o coalescing de aproximadamente seis eventos/cinco segundos e a reconciliação imediata por force. Isso é intencional e não é achado.
- Mantido o desempate por id DESC nos três arquivos já modificados pelo usuário: chatListRowAtendimento.js, chatListFilters.js e chatListQueryHelpers.js. Seus diffs não pertencem a esta auditoria.
- Na conferência final também apareceram alterações concorrentes em SidebarCliente.jsx, conversa.css, conversaService.js e conversaViewIcons.jsx. Não foram produzidas nem alteradas por esta auditoria e ficam fora do patch e da certificação. A adição observada em conversaService.js está após criarNotaInterna e não altera a evidência B8.
- Nenhuma alteração em backend, useAutoScroll, visualViewport, barras sticky, chatsStore ou arquitetura do envio otimista. Comparadores preservados.
- Sem commit, push, instalação de dependências, build ou execução de testes unitários/E2E.
- Executado `node node_modules/typescript/bin/tsc --noEmit` no frontend: exit 0. Limite: allowJs=true e checkJs=false; isso não fornece checagem semântica completa do JavaScript.
- Executado `git -C frontend diff --check`: exit 0. Avisos de normalização LF/CRLF não são erros de whitespace.
- Sem medição de FPS, CLS, altura real, scrollTop ou funcionamento de rede. Não há certificação visual em 375px/iOS/Android por análise estática.

## A — Correções aplicadas

O [diff integral das cinco correções](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/certificacao-atendimento-2026-09-09.patch) contém apenas as alterações de código desta auditoria: 35 linhas adicionadas, nenhuma removida. A documentação e as alterações anteriores do usuário ficam fora desse patch.

### A1. Resync publica uma página parcial sobre uma lista completa

**Severidade: alto. Categoria: visual.** [chatList.jsx:744](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatList.jsx:744), [chatList.jsx:755](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatList.jsx:755).

**Reprodução:** ter várias páginas carregadas em Minha fila ou numa fila com carregamento progressivo; rolar além da primeira página; iniciar resync e atrasar as páginas seguintes. Antes, a primeira resposta substituía todos os cards pela página inicial. O conteúdo encolhia e podia limitar scrollTop; a resposta final recolocava as linhas.

**Causa:** applyMinhaFilaFirstPage/applyQueueFirstPage chamavam setChats(partial) também no background, antes do merge defensivo final. A geração da requisição evitava resposta de outra busca, mas não evitava essa pintura intermediária da requisição atual.

**Correção aplicada:** os dois callbacks retornam sem publicar a página parcial quando background && hasVisibleChats. O carregamento inicial vazio continua progressivo; a atualização com linhas existentes usa o merge final já presente.

**Risco:** baixo; a primeira página renovada passa a aguardar as demais durante o background. Os patches do socket continuam atualizando a lista. A correção evita o encolhimento intermediário; não resolve truncamento definitivo do fetch descrito em B2.

**Validar:** duas/três páginas, scroll no meio, segunda página lenta e também falhando; conferir que os cards existentes permanecem até o merge/erro. Repetir cold start vazio e mudança de filtro durante GET; a primeira página ainda deve aparecer no cold start e respostas de gerações antigas devem ser ignoradas.

### A2. Confirmação de envio não chega ao render do card

**Severidade: médio. Categoria: visual.** [chatListStoreCompare.js:54](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListStoreCompare.js:54), consumidor [ChatListBody.jsx:97](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/ChatListBody.jsx:97).

**Reprodução:** última mensagem outbound já visível, com id, texto e data iguais; receber apenas sent → delivered → read. A store podia atualizar ultima_mensagem, mas a assinatura usada na subscrição de ChatListBody considerava as listas equivalentes. O tick permanecia antigo até outra mudança.

**Causa:** chatRowListStoreKey não incluía o status outbound, embora o comparador do card já o comparasse. A subscrição anterior ao React.memo barrava o render.

**Correção aplicada:** reutilização de ultimaMensagemOutboundStatusKey na assinatura da store, com a mesma normalização já usada pelo card.

**Risco:** baixo; apenas mudanças visíveis de status outbound invalidam essa parcela da assinatura. Não altera timestamp nem ordenação.

**Validar:** evento de status sem nova mensagem/GET; confirmar atualização dos ticks sem deslocar o card. Repetir evento idêntico e mudança de outro card.

### A3. Campos de pagamento, reabertura e campanha são ignorados

**Severidade: alto. Categoria: estado.** [chatListStoreCompare.js:28](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListStoreCompare.js:28), [chatListRowCompare.js:91](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListRowCompare.js:91).

**Reprodução:** alterar somente prazo/origem de pagamento, pagamento_concluido_em, indicador/data de reabertura por falta de interação ou aguardando_resposta_campanha, mantendo mensagem e status principal. O card podia conservar prazo/badge antigo; no último caso, a participação na aba Campanhas podia ficar desatualizada.

**Causa:** updateChat/setChats e a subscrição descartavam alterações cuja chave não mudava. Além disso, React.memo do card ignorava os cinco campos de pagamento/reabertura. Campanha já estava no comparador do card, mas faltava na assinatura da store.

**Correção aplicada:** cinco campos adicionados às duas comparações; aguardando_resposta_campanha adicionado à assinatura da store.

**Risco:** baixo; mais renders apenas quando dados usados na apresentação/filtro mudam. Não redefine precedência de badges nem resolve a arbitragem otimista de B1.

**Validar:** um patch por campo, com id/texto/timestamp/status constantes. Conferir pagamento pendente, vencido, concluído e reabertura; alternar campanha true/false na aba correspondente. Repetir no retorno GET. Verificar que patch idêntico continua sendo noop.

### A4. Votos de enquete não invalidam a linha da thread

**Severidade: médio. Categoria: visual.** [threadRowCompare.js:58](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/threadRowCompare.js:58), evento [socket.js:1268](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/socket/socket.js:1268).

**Reprodução:** deixar uma enquete antiga visível, seguida por outras mensagens; receber mensagem_editada com editada:false e reply_meta.poll.results/last_vote atualizados, sem mudar texto/status/editada_em. A store recebe a atualização, mas os totais/opções da bolha podiam permanecer antigos.

**Causa:** safeReplySig cobria metadados de citação, não poll. A assinatura visual permanecia igual e ThreadRow mantinha o render anterior.

**Correção aplicada:** assinatura serializada de reply_meta.poll, somente quando houver enquete. Mesmo padrão já existente para location_meta.

**Risco:** baixo; custo proporcional aos metadados da enquete. Contrato esperado é objeto JSON recebido por HTTP/socket. Não altera chaves, ordem, lógica de envio ou assinatura das mensagens comuns.

**Validar:** votar numa enquete que não esteja entre as duas últimas linhas; conferir totais/percentuais sem F5 e sem nova bolha duplicada da enquete. Repetir payload idêntico e atualizar outra mensagem.

### A5. Cache restaura badges e estados incompletos

**Severidade: médio. Categoria: visual.** [chatListSidebarCache.js:207](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListSidebarCache.js:207), persistência [chatListSidebarCache.js:451](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListSidebarCache.js:451).

**Reprodução:** persistir uma lista com modo simples, campanha, pagamento ou reabertura; alternar abas ou restaurar sessão antes do GET. A linha hidratada perdia flags necessárias à aparência/membership, e o GET as recolocava. Por exemplo, campanha podia desaparecer provisoriamente do filtro ou o prazo sumir do badge.

**Causa:** sanitizeChatRowForSidebarCache reduzia a linha a um subconjunto que omitia nove campos escalares usados na UI. O subconjunto também alimenta o cache em memória.

**Correção aplicada:** conservar atendimento_modo_simples, modo_simples_aguardando, aguardando_resposta_campanha, finalizada_automaticamente, os dois campos de reabertura e os três campos de pagamento.

**Risco:** baixo; pequeno aumento do snapshot. Formato/chaves/TTL mantidos. Snapshots antigos continuam sem esses campos até serem regravados ou expirarem. Não é uma afirmação de equivalência de todos os campos do cache com a resposta completa.

**Validar:** persistir cada estado, trocar a aba e voltar com GET atrasado; comparar primeira pintura e resposta final. Repetir F5 dentro do TTL e hidratação de cache antigo. Conferir separação por usuário/empresa.

## B — Apenas reportado; nenhuma correção aplicada

Nos itens com mecanismo demonstrável, a pendência está na solução segura para concorrência/contrato, não na existência do ramo de código. Nos demais, falta confirmação visual ou payload real. A regra de ouro impede transformar essas observações em mudanças preventivas nos caminhos sensíveis.

### B1. Rollback pode ser tratado como resposta antiga

**Severidade: alto. Categoria: estado. Evidência: mecanismo estático confirmado; solução concorrente pendente.**

[conversaStore.js:1844](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/conversaStore.js:1844), [chatListRowAtendimento.js:259](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListRowAtendimento.js:259), [chatsStore.js:561](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatsStore.js:561).

**Reprodução:** card em atendimento → marcar Aguardando cliente → PATCH retorna 403/500. A ação publica ui_status_optimistic_at=Date.now(); o catch tenta restaurar o marcador anterior/null. updateChat chama applyNewerOptimisticMembershipTo, que reaplica o estado local por ter marcador maior. A thread pode reverter enquanto a lista conserva Aguardando cliente.

**Causa:** a proteção contra GET/socket antigos também atua sobre rollback local. O caminho de sucesso conserva o marcador otimista quando a resposta não fornece outro; não há encerramento explícito dessa proteção no helper. Outros fluxos de status também o utilizam, portanto não se deve generalizar que seus catches conseguem reverter.

**Proposta mínima:** distinguir confirmação/rollback da operação que originou a versão; só restaurar se ela ainda for a operação corrente e encerrar sua proteção após confirmação causal. Não remover globalmente o guard nem adicionar timeout arbitrário.

**Risco:** alto; sem controle de operação, uma falha antiga pode desfazer ação nova ou um GET antigo reabrir conversa encerrada. **Validar:** falha isolada, duas ações consecutivas, HTTP/socket em ambas as ordens, GET iniciado antes da ação, troca de aba e Minha fila/Todas. Sem essa validação não certifico reversão integral de assumir/encerrar/reabrir/aguardar/pagamento/retomar.

### B2. Minha fila pode encerrar a paginação usando um badge antigo

**Severidade: alto. Categoria: estado. Evidência: mecanismo estático confirmado; política de limite pendente.**

[chatService.js:373](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatService.js:373), [chatService.js:413](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatService.js:413), [ChatListRowsPane.jsx:48](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/ChatListRowsPane.jsx:48).

**Reprodução:** badge positivo menor ou igual ao limite de uma página, mas primeira resposta indica hasMore=true e nextCursor válido. fetchMinhaFilaChatsProgressivo encerra por maxPages<=1, devolvendo hasMore=false e cursor nulo. Cards restantes não são acessíveis por Carregar mais, pois Minha fila oculta o rodapé. O problema também é possível ao esgotar o teto calculado com badge insuficiente.

**Causa:** contagem auxiliar determina término, prevalecendo sobre o cursor da resposta. O retorno apresenta lista parcial como completa.

**Proposta mínima:** badge orientar pré-carregamento, não anular hasMore. Seguir cursor até o teto de segurança e, ao atingi-lo com mais dados, conservar metadados e oferecer continuação. Exige alinhar o contrato documentado de Minha fila completa, prefetch e limite de requisições.

**Risco:** médio/alto de aumentar GETs em filas grandes. **Validar:** badge stale baixo/alto/zero, limite exato, múltiplas páginas, teto, erro na página intermediária, IDs repetidos. Não atribuir isso ao coalescing intencional.

### B3. Estimativa de altura omite conteúdo do card

**Severidade: alto. Categoria: visual. Evidência: omissões estáticas; corte real pendente.**

[chatListRowAtendimento.js:541](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListRowAtendimento.js:541), [ChatListRows.jsx:122](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/ChatListRows.jsx:122), [ChatListRow.jsx:1505](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/ChatListRow.jsx:1505), [chatList.css:1212](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatList.css:1212).

**Reprodução proposta:** ativar virtualização com muitas linhas, em 375px; card com nome longo, setor, atendente, instância WhatsApp, tags e badge financeiro/espera. Comparar card virtual com seu conteúdo natural e também desktop.

**Causa possível:** estimateChatListRowSize não contabiliza explicitamente a linha de instância e a faixa separada de tags. No ramo mobileBadgeGrid, topBlock é recalculado sem hasAssignee. O slot possui altura estimada e overflow hidden, sem measureElement. Margens mínimas/CSS podem absorver alguns casos; não medi corte nem sobreposição.

**Proposta mínima:** medir os casos acima e corrigir somente as parcelas da estimativa que divergirem do CSS. **Risco:** alto para scroll se medidas dinâmicas forem religadas sem controle; não religar measureElement preventivamente. **Validar:** altura natural versus slot, zoom/fonte carregada, nomes de duas linhas, tags, todos os badges e mudança de estado em item já virtualizado.

### B4. Falha em fixar/silenciar/favoritar depende de novo GET

**Severidade: médio. Categoria: estado. Evidência: mecanismo estático confirmado; arbitragem por ação pendente.**

[ChatListBody.jsx:320](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/ChatListBody.jsx:320), [ChatListBody.jsx:350](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/ChatListBody.jsx:350).

**Reprodução:** fixar, silenciar ou favoritar offline; mutação falha e onReloadList também falha. O estado otimista fica na store, embora o toast informe erro. Pin pode manter posição incorreta.

**Causa:** catch solicita recarga, mas não restaura o campo anterior. A reparação depende de HTTP posterior.

**Proposta mínima:** guardar o valor anterior do campo e reverter somente se a tentativa ainda for a mais recente para aquele chat/campo; continuar a reconciliação existente. **Risco:** médio de desfazer clique posterior se o rollback não tiver versão. **Validar:** offline total, erro HTTP com GET funcionando, dois toggles rápidos, GET anterior chegando depois do clique.

### B5. Hoje e filtros de período dependem do recorte HTTP

**Severidade: médio. Categoria: estado. Evidência: lacuna estática; ocorrência depende do payload/contrato.**

[chatListQueryHelpers.js:314](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListQueryHelpers.js:314), [chatListQueryHelpers.js:351](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListQueryHelpers.js:351), [chatListFilters.js:359](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListFilters.js:359).

**Reprodução proposta:** aba Hoje/período restrito; evento de atribuição/atualização faz buscar um chat autorizado cujo timestamp de atividade está fora do intervalo. Se o evento não renovar a atividade para dentro do recorte, o insert pode exibir esse chat até reconciliar.

**Causa possível:** regras de insert/permanência aceitam Hoje como Todas, e o período não integra o mesmo predicado local publicado ao socket. A consulta inicial possui filtros de data; isso não prova que inserções posteriores os respeitam.

**Proposta mínima:** publicar recorte temporal e compartilhar predicado com semântica/timezone idênticos ao servidor, após confirmar qual timestamp define Hoje. **Risco:** médio de excluir conversa legítima, especialmente na virada do dia. **Validar:** capturar resposta e evento, ontem/hoje, limites do período e meia-noite. Sem alteração do webhook histórico, expressamente fora do escopo.

### B6. Imutabilidade do nome não é garantida em todos os caminhos

**Severidade: médio. Categoria: estado. Evidência: atribuições estáticas; dados incorretos dependem da origem.**

[socket.js:1136](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/socket/socket.js:1136), [chatsStore.js:445](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatsStore.js:445), [chatList.jsx:884](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatList.jsx:884).

**Reprodução proposta:** contato sem nome válido recebe outbound com senderName do operador; o handler pode preencher o nome pelo fallback. Em outro caminho, GET atrasado com nome válido antigo pode substituir nome válido mais recente. Confirmar com payload real antes de atribuir o sintoma a produção.

**Causa possível:** isOutbound é calculado, mas não condiciona o fallback de nome/foto nesse trecho; updateChat aceita novo nome não vazio e o merge GET prioriza nomeApi. Há proteções contra vazio e contra sobrescrita no updateChatContato, mas não uma regra única de autoridade temporal/origem.

**Proposta mínima:** estabelecer qual campo é nome do contato em cada provider e preservar o nome confirmado, permitindo alteração cadastral explícita. **Risco:** médio; congelar tudo impede correção legítima do cadastro. **Validar:** inbound/outbound, contato novo, grupo, mudança cadastral, GET atrasado. Proteção contra avatar vazio foi preservada.

### B7. Mostrar/ocultar pinBar não captura âncora explicitamente

**Severidade: médio. Categoria: visual. Evidência: hipótese estática; exige navegador.**

[useConversationSelection.js:63](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/hooks/useConversationSelection.js:63), [ConversaView.jsx:3015](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/ConversaView.jsx:3015), [ConversaMessageVirtualList.jsx:151](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/ConversaMessageVirtualList.jsx:151).

**Reprodução proposta:** thread longa, usuário no meio do histórico; fixar a primeira mensagem ou desafixar a última fixada. A barra entra/sai antes da lista. Observar se a mensagem-âncora muda de posição.

**Causa possível:** startSelect/exitSelectMode capturam âncora; togglePin altera pinnedIds/storage sem captura equivalente. A lista mede scrollMargin por offsetTop, mas a observação do container não garante evento para toda mudança apenas de posição. As compensações existentes podem absorver parte dos casos.

**Proposta mínima:** somente após reprodução, capturar/restaurar a âncora na transição de visibilidade/altura da pinBar, usando os helpers existentes e sem competir com abertura/teclado. **Risco:** alto no mobile. **Validar:** topo/meio/fundo, teclado aberto, seleção com mensagem já fixada, carregar histórico e rotação.

### B8. Nota interna perde rascunho em falha e depende do socket para aparecer

**Severidade: médio. Categoria: estado. Evidência: mecanismo estático confirmado; estratégia de recuperação pendente.**

[ConversaComposerShell.jsx:444](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/composer/ConversaComposerShell.jsx:444), [ConversaView.jsx:2571](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/ConversaView.jsx:2571), [conversaService.js:341](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/conversaService.js:341).

**Reprodução:** escrever nota interna e receber erro no POST: composer já apagou o texto; catch mostra toast e não restaura rascunho/bolha. Se HTTP funcionar e socket estiver indisponível, a resposta retornada é ignorada; a nota pode só aparecer ao reconciliar/reabrir.

**Causa:** fluxo da nota não usa o lifecycle otimista das mensagens nem trata retorno/erro no composer. Não há append local nessa action.

**Proposta mínima:** propagar resultado/erro e preservar o texto por conversa/tentativa até confirmação; inserir resposta confirmada pela reconciliação existente, com dedupe do eco socket. Não inserir nota na outbox de WhatsApp. **Risco:** médio de sobrescrever novo rascunho ou duplicar nota. **Validar:** erro, timeout com persistência, HTTP antes/depois do socket, socket desconectado e troca de conversa durante POST.

### B9. Listeners de participantes fora do ponto central

**Severidade: baixo. Categoria: performance. Evidência: desvio arquitetural confirmado; impacto não medido.**

[useConversaParticipantes.js:49](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/atendimento/useConversaParticipantes.js:49).

**Reprodução proposta:** abrir/fechar thread e emitir os eventos de participantes; conferir quantidade de listeners e de GETs. Não foi observado vazamento em execução.

**Causa:** hook registra três listeners diretamente; há cleanup simétrico e filtro por conversa, mas ele fica fora de socket.js/bridges e não aplica ali o guard central de empresa. O HTTP continua sujeito à autorização; isso, isoladamente, não prova vazamento de dados.

**Proposta mínima:** mover despacho para bridge central mantendo refresh do hook e cleanup. **Risco:** baixo/médio de duplicar refresh se ambos ficarem ativos. **Validar:** mount/unmount, troca de conversa/usuário e eventos de outro escopo. Não alterado por não haver bug visual demonstrado.

## Matriz de certificação por função solicitada

Os OK abaixo são locais ao mecanismo indicado. A coluna de limites impede interpretar um predicado correto como certificação ponta a ponta quando outra camada tem pendência.

| Função | Resultado estático | Evidência/limite |
|---|---|---|
| Minha fila: recorte pessoal | certificado: OK para conversaPertenceAMinhaFila e fonte canônica de pintura | computeChatsFiltrados/resolveMinhaFilaPaintRows usam chats; completude e rollback pendentes B1/B2. |
| Abertas | certificado: OK para predicado de status e exclusão de fechadas | chatRowIsStaleForTab/rowStillBelongsToActiveTab; fluxo integral limitado por B1. |
| Em atendimento | certificado: OK para recorte visível da empresa e assignee | Não confundir com Minha fila. Pode conter espera de cliente conforme contrato existente. B1. |
| Aguardando cliente | certificado: OK para predicado de espera/modo simples | Mutação e falha não certificadas: B1. |
| Aguardando atendente | certificado: OK para predicado de modo simples | Hidratação corrigida A5; retorno de estado limitado por B1. |
| Aguardando funcionário | certificado: OK para uso do conjunto de pendências e modo simples | Atualidade do conjunto auxiliar exige HTTP autorizado; sem homologação de backend. |
| Finalizadas | certificado: OK para predicado de fechamento | Saída/retorno em erro de ação não certificados: B1. |
| Finalizadas por ausência | certificado: OK para motivo/flag no predicado | Persistência da flag corrigida A5; rollback B1. |
| Pagamentos pendentes | certificado: OK para predicado e comparação após A3/A5 | Datas/badges e membership recebem campos; arbitragem B1 permanece. |
| Em atraso | certificado: OK para predicado do estado financeiro | Virada temporal sem evento não homologada; sem garantia de atualização contínua apenas pelo relógio. |
| Hoje | não certificado integralmente | Consulta inicial existe; inserção/período B5. |
| Campanhas | certificado: OK para flag estrita e exclusão de grupos após A3/A5 | Depende de flag correta no payload. |
| Contadores dos chips | certificado: OK para deltas limitados a zero e chaves de contagem | Não certificado igualdade numérica ponta a ponta: dependência HTTP, ações/rollback B1 e lista B2. |
| Ordenação recente / id DESC | certificado: OK | sortChatListByRecent, sortChatRowsByOrder, computeChatsFiltrados; desempates do usuário preservados. |
| Fixadas primeiro / sem-conversa ao fim | certificado: OK para particionamento/ordem dos seletores | Persistência do toggle em erro B4; autofixação de Cotação na Minha fila é regra existente. |
| Badges Aberta / Em atendimento / espera | certificado: OK para precedência no StatusPill | Não pinta Aberta simultaneamente por simples status assumido; estado stale de B1 ainda pode fornecer entrada errada. |
| Badges pagamento / finalização / ausência / reabertura / modo simples | certificado: OK para apresentação condicional após A3/A5 | Corte visual B3; não é validação de todos os cruzamentos em navegador. |
| Preview e ticks | certificado: OK para atualização do status após A2 | A1 preserva pintura no resync. |
| Unread canônico | certificado: OK | unreadById/snapshot absoluto, serialização e preservação de leitura local durante GET; falha não é convertida em zero. |
| Apresentação numérica de unread no card | observação de apresentação | Card usa indicador/estilo de não lida; não certifiquei contador numérico por card. Não restaurado um badge só por existir CSS antigo. |
| Busca por nome/telefone | certificado: OK para normalização, prefixos e números | Debounce, chave de requisição e descarte de geração antiga preservados; resultado HTTP depende do contrato. |
| Filtro por setor | certificado: OK para predicado local/publicado e guarda de acesso | Fetch autorizado na inserção; autorização efetiva pertence ao servidor. |
| Filtro por atendente | certificado: OK para precedência sobre aba | HTTP/pintura/realtime usam o escopo do filtro; regra existente preservada. |
| Filtro por tags | certificado: OK para consulta/chave de filtro | Não homologuei todas as alterações de tags em tempo real nem equivalência de cache para todas as tags. |
| Filtro por período | não certificado integralmente | B5. |
| Carregar mais / dedupe | certificado: OK para dedupe por chave estável e guarda de requisição | Redução intermediária corrigida A1; Minha fila B2 impede certificação completa. |
| Assumir | caminho otimista/HTTP/socket rastreado; não certificado integralmente | Proteção contra dados antigos existe; rollback/convergência devem ser validados conforme B1. |
| Encerrar | caminho otimista/tombstone/HTTP/socket rastreado; não certificado integralmente | Saída das abas existe; reversão e contagem exigem B1. |
| Reabrir | caminho otimista/HTTP/socket rastreado; não certificado integralmente | Reinserção em erro não pode ser presumida; B1. |
| Transferir usuário/setor | certificado: OK para construção do destino e guarda de visibilidade | Efeito concorrente de membership/rollback não certificado, B1. |
| Fixar conversa | não certificado em falha | Caminho feliz otimista + resposta existe; B4. |
| Silenciar conversa | não certificado em falha | Caminho feliz otimista + resposta existe; B4. |
| Favoritar conversa | não certificado em falha | Caminho feliz otimista + resposta existe; B4. |
| Marcar lida | certificado: OK para zero local e reconciliação por snapshot | Leituras locais durante GET preservadas, sem incremento por replay; convergência depende de API disponível. |
| Aguardando cliente manual | não certificado em falha | Reprodução estática específica B1. |
| Nota interna | não certificado integralmente | B8. Preview interno separado, conforme invariantes abaixo. |
| Abrir/trocar conversa | certificado: OK para guardas de seleção/geração e descarte de resposta antiga | carregarConversa/refresh/loadMore preservam seleção e reconciliação; geometria não homologada. |
| Render de texto | certificado: OK para encaminhamento de texto, metadados e fallback | Não executado com navegador/fontes reais. |
| Render de áudio | certificado: OK para lifecycle de troca de fonte | useAudioPlayback mantém el.load() ao mudar activeSrc; reprodução/codec em aparelho não homologados. |
| Render de imagem | certificado: OK para fontes alternativas e estado loaded na reconciliação | Usa complete/naturalWidth quando blob segue como fonte; layout real não medido. |
| Render de vídeo | certificado: OK para preview, reset por src e indicação de erro | Sem validação de codecs/player real. |
| Render de documento | certificado: OK para nome/tamanho, abrir e download | URLs retornadas/permissões de mídia não homologadas. |
| Render de contato | certificado: OK para metadados e bloqueio da ação durante abertura | Serviço de criação/abertura de destino não homologado ponta a ponta. |
| Render de enquete | certificado: OK para propagação visual do voto após A4 | Envio aguarda servidor/socket por contrato do hook; não há voto pelo CRM. |
| Composer de texto | certificado: OK para trava síncrona de gesto duplicado, IME e despacho otimista | Rascunho/nota tem ressalva B8; não substituído por await linear. |
| Envio otimista texto/mídia | certificado: OK para manutenção de tempId/client_temp_id e reconciliação | Leitura do fluxo append → HTTP/socket → dedupe; entrega externa não certificada. |
| Outbox/watchdog | certificado: OK para FIFO, reuso de id e classificação de falhas | flush impede execução simultânea local e interrompe em falha de rede; integração real não executada. |
| Scroll ao abrir/receber/carregar histórico | certificado: OK para guardas estáticas existentes | useAutoScroll preservado; ausência de salto em mobile só pode ser homologada visualmente. |
| Teclado mobile/visualViewport | certificado: OK para manutenção do protocolo existente | Nenhuma alteração; iOS/Android físico pendente. |
| Barra de seleção | certificado: OK para captura/restauração explícita da âncora | startSelect/exitSelectMode + layout effect na View; geometria real não testada. |
| Barra de fixadas | não certificado visualmente | B7. |
| Layout 375px/desktop | não certificado visualmente | Shell usa breakpoint 640px, flex/min-height:0 e alternância lista/thread; B3/B7 exigem medição. |

A contagem de Em atendimento exclui a chave de Aguardando cliente, enquanto a aba de listagem pode conter essa subcondição, conforme handoff existente. Não sinalizei essa diferença de semântica como novo bug. Também não tratei a espera intencional do coalescing como perda de liveness.

## Invariantes revisadas

- **Empresa do usuário — certificado: OK no fluxo central inspecionado.** getCurrentCompanyId obtém empresa do usuário autenticado; join_empresa e shouldIgnoreByCompany a utilizam. Não foi introduzido company_id fixo nem campo de empresa no envio. Eventos sem empresa dependem do escopo autenticado no servidor; backend não foi auditado.
- **Listeners fora dos itens — certificado: OK para ChatListRow/ThreadRow.** Nenhum listener de socket nos componentes de item revisados. Exceção arquitetural no hook de participantes: B9.
- **Nome do contato — não certificado como imutável em todos os merges.** B6 registra a diferença entre proteções locais e garantia universal.
- **Última mensagem não recebe nota/movimentação interna — certificado: OK nos handlers/guards centrais inspecionados.** Eventos internos são encaminhados à thread; os guards de preview rejeitam conteúdo interno. Isso pressupõe tipo/metadados corretos do payload.
- **Seleção de thread não encerra atendimento — certificado: OK.** Navegação mobile limpa selectedId; não chama a ação de encerramento.

## Revisão e validação antes do deploy

Priorizar B1/B2 para correção com cenários de concorrência; medir B3/B7 antes de tocar virtualização/scroll. Para validar o patch já pronto, executar os roteiros de A1–A5 em ambiente de revisão com rede controlada, desktop e largura de 375px. Conferir separadamente teclado em iOS/Android. Essas verificações estão propostas, não realizadas.

Os cinco arquivos de código e dois handoffs foram alterados nesta auditoria. O patch anexo isola os cinco arquivos de código; os demais diffs anteriores continuam pertencendo ao usuário. Miguel pode revisar as correções isoladamente, mas este relatório não autoriza declarar a página integralmente certificada.
