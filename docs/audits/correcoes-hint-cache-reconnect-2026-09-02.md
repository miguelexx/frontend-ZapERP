# Hint, reconexões e cache de filtros — 02/09/2026

Implementação local no frontend, limitada aos três itens solicitados. Não houve publicação em produção nesta rodada.

## Indicador X de Y

Removido o `Math.max(totalForHint, filteredCount)`. O indicador mostra os dois valores reais: 6 cards e total 2 produzem **6 de 2**. Preservados carga, atualização, busca pendente, total ausente e apresentação por funcionário. A mudança torna a divergência visível; não tenta resolver uma inconsistência de dados alterando o denominador.

## Reconexões frequentes

- Entrada nas rooms da empresa e da conversa permanece imediata.
- Recuperação HTTP agrupada em janela fixa de 600 ms, com mínimo de 2,5 s entre inícios. A janela não é prolongada indefinidamente por novos eventos.
- O mesmo ciclo recupera lista, não lidas e conversa selecionada. A recuperação da thread aguarda o GET anterior; reconexões recebidas durante esse GET deixam uma única recuperação posterior pendente.
- Seleção consultada ao executar, preservando as guardas existentes da store contra resposta de outra geração/conversa.
- Desconexão suspende o timer; nova conexão retoma. Logout/troca de token encerra o agendador e impede execuções pendentes.
- Corrigido um disparo redundante no debounce de resync: o timer de prazo máximo não é mais deixado ativo depois do primeiro disparo. Timer de throttle também é retirado quando o resync já foi enfileirado atrás de um load em andamento.

Isso limita rajadas; não elimina consultas legítimas de eventos, ações do usuário ou outros módulos. A lista mantém sua fila de recuperação e os mecanismos anteriores de paginação/resync.

## Cache de filtros

- Memória e sessionStorage agora expiram em 45 segundos. Reidratação conserva a data original, sem estender o prazo.
- Invalidação geral do escopo ocorre em resync, tanto no desktop quanto no mobile, e em reconexão/eventos relevantes de dados da lista mesmo fora da página de Atendimento.
- Empresa/usuário continuam separados; evento com empresa diferente não limpa o cache da sessão atual.
- GETs de lista e paginação capturam uma revisão do cache. Se o escopo for invalidado durante o HTTP, a resposta não repovoa esse cache.
- Logout limpa memória e sessão. Resultados vazios continuam sendo caches válidos; metadados, filtros escolhidos e regras de pertinência não foram substituídos.

## Evidências

- `scripts/test-cache-reconnect.mjs`: TTL, reidratação, isolamento de escopos, GET atrasado, resultado vazio, logout, rajadas, HTTP lento, intervalo mínimo, desconexão, falha de recuperação e debounce sem disparo duplicado.
- `scripts/test-node-suite.mjs`: 33/33 scripts passaram, incluindo refresh A→B→A, funcionário, não lidas, outbox e envio/status.
- `e2e/hint-cache-reconnect.spec.js`: indicador 6 de 2, invalidação por resync e evento, isolamento de empresa, 20 reconexões agrupadas, recuperação posterior durante GET lento e cancelamento de pendências ao encerrar sessão.
- Regressões de navegador: `e2e/unread-minha-fila.spec.js` e `e2e/search-keyboard-media.spec.js`.
- Execução conjunta dos três arquivos E2E: 12 cenários passaram e 2 de teclado mobile foram ignorados no projeto desktop, por não se aplicarem.
- Build Vite em diretório temporário aprovado, com o aviso preexistente de sintaxe no CSS de `disparoWizard.css`.

Logs nesta pasta: `resultado-suite-hint-cache-reconnect-2026-09-02.txt`, `resultado-browser-hint-cache-reconnect-2026-09-02.txt`, `build-hint-cache-reconnect-2026-09-02.txt`.

Os testes de navegador usam HTTP controlado e listeners reais do aplicativo em desktop/mobile emulado. Não representam homologação com rede 4G, dispositivo físico ou infraestrutura de produção.
