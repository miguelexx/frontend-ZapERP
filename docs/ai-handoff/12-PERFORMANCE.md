# Performance do frontend

> 2026-08-23 · caminho quente = atendimento. Skill: `.cursor/skills/zaperp-performance/SKILL.md`. Estabilidade e `company_id` > micro-otimização.

## O que já está no desenho (CONFIRMADO)

- `React.lazy` de páginas e de ChatList / ConversaView / SidebarCliente / modais pesados / MediaViewer.
- `manualChunks` no Vite (react, router, axios, socket, markdown, tanstack, dnd, icons, zustand).
- Stores Zustand com seletores + `shallow` onde a lista é grande.
- Lista: SearchBox isolado; Body único subscriber; Row memo + `chatRowPropsAreEqual`.
- Thread: virtualização TanStack; `threadRowPropsAreEqual`; drafts fora da store pesada.
- Debounce: busca; resync da lista 180/700ms; `status_mensagem` batch ~75ms com **um `set()`** na thread (`patchMensagensBatch`).
- Lista: índice `Map` por id; `unreadTotal` na store (título da aba sem percorrer `chats`); layout key da lista = ids na ordem (preview fica no compare da row).
- Thread: rows de timeline reutilizam o objeto quando a mensagem de origem não mudou (WeakMap).
- Abertura da conversa: máscara até `onOpenSnapReady` (settle do virtualizer); header sticky da lista (`fromChat`) para não recarregar foto; `.wa-bubble` sem fade global (só `.zap-message-enter` em mensagem nova).
- Cache: sessionStorage da sidebar; Map de mensagens por conversa.
- Prefetch da aba padrão (`GET /chats?minha_fila=1`) no login/restore; `load()` reutiliza se ainda fresco.
- Resync do socket remove só a conversa afetada do cache de filtros (sem skeleton ao voltar para Minha fila).
- Abertura da thread no mobile: `GET /chats/:id` com 16 mensagens; header usa nome/foto da lista.
- Busca global só com 2+ caracteres; 1 caractere filtra só as linhas já carregadas.
- Boot mobile staggered (não disparar todos os GETs no primeiro paint).
- Recuperação de preload Vite (`runtime`) para chunk 404 após deploy.

## Regras ao alterar o caminho quente

1. Não assinar o array `chats` ou `mensagens` em componentes folha.
2. Não criar objeto/callback inline que quebre `memo` (Toolbar, Row, Bubble, Composer).
3. Não dar `setChats([...])` se o compare de row diria equivalente.
4. Não ligar listener socket dentro de Row/Bubble.
5. Não desligar virtualização “para simplificar”.
6. Não buscar a lista inteira a cada `nova_mensagem`.
7. Áudio: um player ativo (`bubble/utils/audioSession.js`); `el.load()` ao trocar src; revoke blob URLs no unmount.
8. Evitar Context novo no shell do atendimento.
9. Não keyar renderer da bolha por `status` — pending→read deve só atualizar o tick.

## Sintomas → lugar

| Sintoma | Onde olhar |
|---------|------------|
| Digitar no search trava | `ChatListSearchBox` vs subscriber da lista |
| Abrir conversa trava | `carregarConversa`, merge, virtualizer `estimateSize` |
| Socket “pisca” a lista | `addChat`/`setUltimaMensagemEBump` + row compare |
| Scroll da thread pula | preserve scroll flag; medidas de mídia; âncora de fundo |
| Memória sobe no plantão | cache Map 48 conversas; blobs; listeners |
| Deploy quebrou tela branca | preload recovery; SW `updateViaCache` |

## Medir

React Profiler no `Atendimento` + `ChatListBody` + `ConversaThread`. Performance panel: long tasks >50ms no handler de socket. Não adicione log em produção no hot path.

## Backend

Lista lenta também pode ser `/chats` + counts. Não “otimize” o FE mascarando N+1 no servidor. Handoff backend [13](../../../backend/docs/ai-handoff/13-PROBLEMAS-CONHECIDOS-E-DIVIDA-TECNICA.md).
