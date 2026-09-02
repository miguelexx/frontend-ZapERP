# Busca, teclado, status e mídia — 02/09/2026

Correções locais do frontend para os quatro itens solicitados. Não houve publicação em produção nesta rodada.

| Item | Resultado |
|---|---|
| Busca na Minha fila | Corrigida: termo de busca não usa `minha_fila=1`, nem o filtro visual/otimista da aba. Paginação, resync e hidratação do cache seguem o mesmo escopo. Filtros explícitos e permissões continuam válidos. |
| Fallback de status por tempo | Removida a segunda varredura de 60 segundos. A atualização exige identidade correspondente e respeita a conversa. O caminho normal por ID, whatsapp_id ou tempId e a monotonicidade dos ticks permanecem. |
| Mídia offline | Aviso na bolha enquanto o envio da mídia local estiver falho/incerto: F5 ou fechar a página pode perder a cópia local. Mensagem de erro de rede para mídia não promete reenvio automático. Texto mantém a outbox persistente existente. |
| Teclado mobile/âncora | Fechar o teclado não desativa mais a intenção de acompanhar o final. Quem está lendo o histórico conserva o bloqueio de auto-scroll; o ciclo de gravação permanece. Testado com visualViewport controlado, ainda sem homologação em celular físico. |

## Detalhes que delimitam a correção

- A fila normal continua buscando todas as páginas. Durante a busca, usa a paginação normal e exibe o botão/scroll de continuação; o rodapé antes era ocultado apenas por a aba ser Minha fila.
- O fallback de status antigo **também exigia ID coincidente**; não foi comprovado que escolhia arbitrariamente a mensagem mais recente. A falha reproduzida no helper foi ignorar `conversa_id` na segunda varredura, com uma row de outra conversa inserida propositalmente na lista. Essa varredura redundante foi removida.
- O aviso da mídia aparece para uma cópia local `blob:` com falha/incerteza e desaparece após confirmação/reconciliação com mídia persistida. Não foi implementada persistência de arquivos no navegador. Ao reconectar, o texto orienta conferir a conversa antes de reenviar, pois o servidor pode ter recebido o envio sem a resposta chegar ao navegador.

## Validação realizada

| Verificação | Resultado |
|---|---|
| `scripts/test-node-suite.mjs` | 32/32 scripts passaram. Inclui concorrência de refresh, filtros, não lidas, outbox de texto, envio sequencial e status em lote. |
| `scripts/test-search-status-media.mjs` | Passou: busca/paginação no service real, ausência/identidade de status, isolamento por conversa, ticks monotônicos e aviso de mídia. |
| `e2e/search-keyboard-media.spec.js` | 6 cenários passaram: busca e mídia em desktop/mobile; teclado com 12 e 60 mensagens em mobile. Dois cenários de teclado ignorados no projeto desktop por não se aplicarem. |
| `e2e/unread-minha-fila.spec.js` | 2 cenários passaram: desktop/mobile, preservando não lidas e pertinência da Minha fila. |
| Build Vite em diretório temporário | Passou. |
| Reprodução histórica da auditoria | 9 passaram, 2 falharam: janela de debounce ao limpar a busca e revogação do blob substituído. Esses dois itens não foram alterados neste pedido. |

Os cenários de navegador usam HTTP controlado e código real do aplicativo. O teste de mídia aborta o POST do arquivo e confirma que o aviso permanece na bolha mesmo após retirar o toast; a reconciliação com um arquivo persistido remove o aviso. O teste de teclado simula alterações de visualViewport; verifica acompanhamento de novas mensagens e permanência no histórico tanto com lista comum quanto virtualizada. Não equivale a teclado virtual real.

Evidências: `resultado-suite-busca-teclado-status-midia-2026-09-02.txt`, `resultado-browser-busca-teclado-status-midia-2026-09-02.txt`, `build-busca-teclado-status-midia-2026-09-02.txt` e `resultado-apos-busca-teclado-status-midia-2026-09-02.txt` nesta pasta.

## Validação física restante

Não havia dispositivo/ADB disponível nesta sessão. Em Android/Chrome e iPhone/Safari:

1. Abrir uma conversa no final, abrir/fechar o teclado e receber uma nova mensagem: deve continuar no final.
2. Subir no histórico, abrir/fechar o teclado e receber uma mensagem: não deve saltar ao final.
3. Repetir com lista curta e com mais de 24 mensagens, que usa virtualização no mobile.
4. Iniciar/parar gravação após digitar e verificar que a mudança do teclado não disputa o scroll.

O item de aparelho real permanece pendente até essa execução.
