**Parecer de prontidão para produção — frontend ZapERP — 02/09/2026**

**Resultado: não aprovado para produção no estado auditado.** Há uma falha de isolamento da fila de envio entre contas e falhas reproduzidas na abertura de conversas e na autorização visual por participantes. As melhorias anteriores existem e passaram nos cenários indicados abaixo, mas não eliminam esses problemas.

Referência: commit `f54d503dbfd634c5c7410a9594c262a12cc79691`. Snapshot SHA-256 de 456 arquivos de código, recursos públicos e configuração; a conferência final não encontrou diferenças em relação ao snapshot. Esta rodada não editou o código do produto. Foram acrescentados scripts, logs e evidências de auditoria.

**1. Alta — texto offline de uma conta é reenviado com a sessão de outra**

Reproduzido pela interface no build minificado, com HTTP totalmente simulado:

1. O usuário A abriu a conversa 11 e enviou um texto com o navegador marcado como offline.
2. A mensagem entrou no armazenamento local.
3. A saiu da conta pelo botão da aplicação; o item permaneceu na fila.
4. B entrou pelo formulário de login e abriu a conversa 22.
5. O frontend disparou POST para a conversa 11 com o texto de A e o token de B.

O registro capturado foi `{ conversation: 11, text: "Texto offline exclusivo do usuário A", session: "B" }`. Nenhuma mensagem real foi enviada.

A chave da outbox é global; os itens não registram usuário/empresa. O logout limpa stores, mas não isola essa fila. Ao abrir a conversa, o lifecycle esvazia a fila usando o token corrente do cliente HTTP.

Evidências: [offlineOutbox.js](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/offlineOutbox.js:19), [clearSession](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/auth/authStore.js:98), [flush no lifecycle](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/hooks/usePendingOutgoingLifecycle.js:39) e [injeção do token](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/api/http.js:21).

Correção necessária: escopo por usuário e empresa, validação desse escopo antes de cada envio e cancelamento ao encerrar/trocar a sessão. Itens antigos sem identidade não devem ser automaticamente enviados por outra conta. A prova utilizou dois usuários da mesma empresa; não demonstra vazamento entre empresas nem dispensa a autorização do backend.

Critério de aceite: A → logout → B nunca envia nem exibe intenções privadas de A; voltar a A recupera somente a fila de A; troca de sessão durante flush também é segura.

**2. Alta — “Conversar” em Clientes navega sem carregar o histórico**

No build minificado, o POST de abertura retornou a conversa 33, a aplicação navegou para Atendimento, mas realizou **zero GETs do histórico da conversa 33**. O histórico esperado não apareceu.

[ClientesSection.jsx](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/configuracoes/sections/ClientesSection.jsx:119) chama `addChat`, `setSelectedId` e `navigate`. [setSelectedId](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/conversaStore.js:610) não executa o carregamento para um ID não nulo.

Correção necessária: utilizar o caminho de abertura que chama `carregarConversa`, como a navegação com `openConversaId` já tratada por Atendimento. Validar entrada a partir de Clientes com e sem conversa previamente aberta.

**3. Média — participantes da conversa anterior liberam temporariamente o composer**

Reproduzido no build minificado: A era co-atendente da conversa 11; ao abrir a conversa 22, mantendo a resposta de participantes pendente, o composer continuou habilitado. Quando o servidor simulado respondeu que A não participava da conversa 22, o composer ficou desabilitado.

[useConversaParticipantes.js](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/atendimento/useConversaParticipantes.js:11) conserva a lista anterior durante a mudança de ID. O [wrapper](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/hooks/useConversationParticipants.js:22) não expõe os estados de carregamento/carregado à [regra de envio](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/ConversaView.jsx:310).

Correção necessária: associar dados e carregamento à identidade da conversa; impedir que permissões da conversa anterior sejam utilizadas e mostrar feedback enquanto a participação é verificada. O backend permanece responsável pela autorização real; não foi enviado conteúdo indevido nesse teste.

**4. Média — limpar busca ainda deixa uma janela com regra incorreta de inserção**

A reprodução com o helper real permanece vermelha: na aba Finalizadas, `searchActive=false` e `searchDebounced=true` permitem inserir conversa aberta/em atendimento. [chatListQueryHelpers.js](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/chats/chatListQueryHelpers.js:349) retorna verdadeiro pelo estado antigo do debounce.

Correção necessária: vincular a regra de eventos à consulta efetiva e à sua geração, incluindo o intervalo de limpeza da busca. Reproduzir com eventos durante esse intervalo e verificar inserção, remoção e filtro visual. Este achado foi reproduzido no helper; não se afirma aqui uma reprodução completa em navegador.

**5. Média — blob de vídeo substituído perde a referência sem liberação comprovada**

A reprodução com o merge real confirma que a referência `_optimisticBlobUrl` é removida quando chega URL persistida, sem revogação correspondente no cenário. Evidência: [conversaOutboundMediaMerge.js](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/conversaOutboundMediaMerge.js:2).

Correção necessária: definir quem possui a URL e liberá-la quando nenhum player/cache ainda depender dela. Revogar imediatamente dentro de um merge puro pode quebrar players; a solução precisa cobrir confirmação, substituição, descarte e encerramento. O teste comprova a ausência de liberação no caminho auditado, não um travamento por falta de RAM.

**Situação das ressalvas anteriores**

| Item | Resultado no código atual |
| --- | --- |
| Refresh antigo A → B → A | Corrigido no cenário reproduzido: a resposta antiga não sobrescreve a conversa reaberta. |
| Refreshes concorrentes/reconexão | Proteção de geração/abort presente; testes de rajada e HTTP lento passaram. |
| Funcionário sobre aba | Precedência alinhada no cenário Finalizadas + funcionário; reprodução passou. A janela ao limpar busca continua como item 4. |
| Busca global na Minha fila | Corrigida; busca inclui conversa finalizada de outro atendente e preserva paginação nos testes desktop/mobile. |
| Não lidas no mapa e card | Cenário 3 locais + GET antigo + próximo evento passou. Snapshot, replay e reconexão também passaram com API simulada. |
| Escopo global das não lidas | Frontend usa snapshot autorizado; autorização real e implantação do contrato do backend ainda exigem integração. Não equivale a todas as conversas da empresa. |
| Minha fila vazia ou com todos os IDs renovados | Corrigida nos cenários com store vazio e store [33] versus snapshot [11]; não reaparece o snapshot antigo. |
| Hint “X de Y” | Corrigido; 6 cards e total 2 permanecem “6 de 2”, sem mascarar o servidor. |
| Cache de filtros de 15 minutos | Corrigido: rows de filtros usam 45 s; testes de invalidação por resync/eventos passaram em desktop/mobile. O snapshot geral de opções da sidebar tem TTL próprio de 2 min. |
| Reconexões frequentes | Agrupamento e serialização presentes; cenários de rajada, recuperação durante HTTP lento e ausência de concorrência passaram. |
| Fallback de status por tempo | Caminho antigo substituído por identificação exata; suíte de batching de status passou. Não se mantém como falha temporal comprovada neste corte. |
| Mídia offline | Aviso específico sobre F5 está presente e passou no navegador. Arquivos para retry continuam apenas na sessão; persistência de mídia não foi implementada. A outbox de texto tem o novo problema do item 1. |
| Teclado/âncora | Dois cenários em Chromium mobile emulado passaram (12 e 60 mensagens). Android/iOS com teclado real continuam sem homologação. |
| Textos longos/virtualização | Troca rápida com histórico longo e cenários de estabilidade/muitas mídias passaram. O caso visual específico de texto muito extenso e a matriz real de dispositivos não foram esgotados. |
| Evento sem empresa | Pendente: [shouldIgnoreByCompany](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/socket/socket.js:389) permite payload sem company_id/empresa_id e também sem empresa local. É fragilidade defensiva, não prova de vazamento. Exige conferir contratos antes de rejeitar eventos em bloco. |
| Co-atendente/carregamento | Pendente e agora reproduzido na troca de conversa: item 3. |
| Abertura por Clientes | Pendente e reproduzida no build: item 2. |
| Liberação de blobs | Pendente: item 5. |
| Cache de conversas sem teto por entrada | Continua com até 48 entradas e TTL de 20 min, sem limite individual de mensagens/bytes; [conversaStore.js](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/conversa/conversaStore.js:209). Consumo prolongado de RAM não medido. |
| Listeners de participantes | Continuam registrados diretamente no hook. A afirmação de que todos os listeners estão centralizados em socket.js seria incorreta. |
| computeBaseCounts/nomenclatura zapi | Manutenção de baixa prioridade; não são a razão da reprovação. |

**Validação executada e seus limites**

| Verificação | Resultado |
| --- | --- |
| Suíte Node existente | **33/33 scripts passaram**. São scripts, não apenas 33 asserts. |
| TypeScript, sem emitir arquivos | Passou. `checkJs:false` significa que isso não certifica a maior parte do JavaScript/JSX. |
| Build em modo production | Passou em 1 min 28 s, com advertência de CSS. |
| Suíte ampla Playwright, 7 arquivos, Chromium desktop + Pixel 5 emulado | **65 passaram, 8 falharam, 5 foram pulados**, em 11,4 min. Não foi uma suíte completamente verde. |
| Reprodução histórica com helpers/store reais | **9 passaram e 2 falharam**: limpeza da busca e blob de vídeo. |
| Probes independentes no build minificado | Abertura/envio normal passou; três defeitos foram reproduzidos: Clientes, participantes e outbox entre contas. |
| Contraprovas no build minificado | Emoji, navegação IA e permissão de atendente passaram; nenhum erro de runtime capturado nessas contraprovas. |
| Vulnerabilidades de dependências | **Inconclusivo**. A revisão automática de permissões bloqueou o envio da árvore de dependências ao registro público npm. Autorização foi solicitada e não foi recebida até o fechamento. |

O build foi produzido com `VITE_API_URL=http://localhost:5000` para interceptação de APIs no teste local. Portanto, comprova compilação/minificação e os fluxos executados, mas não homologa as variáveis, servidor ou domínio de produção. Os probes bloquearam Service Workers e conexões externas não simuladas. Não houve envio real de mensagens ou publicação.

**Classificação das oito falhas da suíte ampla**

- Duas falhas no modal de importação (desktop/mobile): o teste espera “Cancelar” na seleção inicial; o componente não renderiza esse botão nessa etapa. O overlay tem fechamento por clique externo. Há uma pendência de saída explícita/acessibilidade e divergência com o teste; não demonstra falha de importação.
- Duas falhas no teste de importação: o seletor de texto encontra um `div` e um `option` e falha por ambiguidade. O cenário não chegou à confirmação; o resultado integral da importação permanece sem aprovação nesta execução.
- Duas falhas no teste de permissões: a fixture mantém usuário visitante em scripts de inicialização e na resposta de `/usuarios/me`, apesar de escrever atendente pontualmente no storage. Com sessão e API consistentes, o atendente foi corretamente restrito a respostas salvas no build.
- Uma falha de emoji desktop e uma de navegação IA desktop: houve recarga de chunk e `ERR_CONNECTION_RESET` no servidor de desenvolvimento. O terminal registrou notificações de alteração de arquivos e reinícios do Vite durante a execução. O snapshot final de conteúdo permaneceu igual. Os fluxos passaram em contraprovas no artefato estático; esses dois resultados dev não comprovam defeito funcional de produção.

Os cinco skips correspondem a duas verificações visuais opcionais, dois testes de teclado que só se aplicam ao projeto mobile e um cenário de troca rápida explicitamente pulado no mobile. Nenhum foi convertido em aprovação.

**Outras observações**

A compilação apontou aspas tipográficas em URL CSS de [disparoWizard.css](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/src/pages/disparoWizard.css:52). É ajuste de apresentação, sem falha de compilação.

O comando `test:frontend:baseline` inclui Node e somente dois arquivos de E2E. Não inclui toda a cobertura recente de listas, cache/reconexão, Configurações e IA utilizada nesta auditoria. Atualizar o conjunto obrigatório de validação e corrigir fixtures/seletores evita relatórios verdes com cobertura insuficiente.

A busca estática por HTML inserido diretamente encontrou componentes do manual alimentados por conteúdo local. Isso, sozinho, não constitui XSS confirmado. Também não é uma revisão exaustiva de todas as entradas e superfícies de segurança.

Não foram homologados: backend real, duas empresas simultâneas, permissões servidor a servidor, entrega real WhatsApp, atualização de Service Worker/push, cabeçalhos e cache HTTP da hospedagem, TLS, fallback de rotas no servidor, sessões de trabalho prolongadas, Firefox/Safari e dispositivos físicos. CRM, HelpDesk, supervisão e disparos não tiveram validação funcional integral nesta rodada.

**Condições para nova avaliação de liberação**

1. Corrigir os itens 1 a 3 e adicionar regressões com logout/troca de sessão, abertura por Clientes e participantes atrasados.
2. Encerrar a janela da busca e implementar o ciclo de liberação de blobs sem prejudicar players.
3. Corrigir a suíte de importação/permissões e tornar obrigatórios os testes recentes relevantes.
4. Concluir a verificação de dependências após autorização e testar integração/autorização com backend real em ambiente de homologação.
5. Validar dispositivo real e a configuração de publicação, incluindo recuperação após atualização/reconexão.

**Evidências reproduzíveis**

- [Resultados dos probes no build](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/producao-2026-09-02-probes.json)
- [Contraprovas de runtime](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/producao-2026-09-02-probes-contraprova.json)
- [Script dos probes](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/producao-browser-probes.mjs)
- [Log da suíte Playwright](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/producao-2026-09-02-browser-dev.txt)
- [Log da suíte Node](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/producao-2026-09-02-suite-node.txt)
- [Reprodução das ressalvas históricas](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/producao-2026-09-02-reproducao-historica.txt)
- [Log do build](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/producao-2026-09-02-build.txt)
- [Snapshot dos arquivos](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/producao-2026-09-02-snapshot.json)

As conclusões se aplicam ao código e aos cenários identificados. Não há fundamento técnico para certificar ausência de falhas em todo o frontend ou aprovar produção enquanto os bloqueios confirmados permanecerem.

