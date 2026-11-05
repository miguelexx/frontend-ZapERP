# Lista de conversas

> 2026-08-23 · `src/chats/`. Caminho quente de render. Leia isto antes de tocar em filtro, unread, preview ou “a lista não atualiza”.

## Store `chatsStore.js` (CONFIRMADO)

Estado: `chats`, `loading`, nonces de scroll/resync, flag de mutação otimista.

Actions que importam: `setChats`, `addChat` (upsert; preserva nome/foto/unread; remove placeholder `sem_conversa` do mesmo cliente+instância), `updateChat` (**não cria** row — anti-vazamento de setor), `updateChatContato` / `SeVazio`, tags, `setUltimaMensagem` / `EBump` / `bumpChatToTop`, `setUnread` / `incUnread` / `incUnreadComBadge` / `clearUnread`, `removeChat`, `requestChatListResync` (debounce ~180ms, teto ~700ms), `requestChatListScrollToTop`, `emitChatListOptimisticMutation`.

Dedupe de row: `chatRowStableKey.js` → `conv:{id}` ou escopo `whatsapp_instance_id` + cliente/telefone.

## Pele da lista — três camadas (CONFIRMADO)

Carregam nesta ordem em `chatList.jsx`, e a ordem é o que faz cada uma ganhar da anterior:

| # | Ficheiro | Alcance |
|---|----------|---------|
| 1 | `chatList.css` + `chatList.chips-premium.css` | base histórica |
| 2 | `chatList.flat.css` | **todos** — painel, cabeçalho, busca, linhas |
| 3 | `chatList.whatsapp.css` | só `html[data-zap-simple="1"]` — chips + cartão reduzido |

Os tokens (`--zs-*`) e as métricas (`--zs-m-*`) vivem em `styles/zap-simples.css`, carregado
no boot porque a pele da conversa (`conversa/conversa.whatsapp.css`) está noutro chunk.

Especificidade: a camada 2 usa `html body .app-layout #main-content .chat-list-root`, que
empata com studio/conversations-studio/premium-interactions e ganha por ordem. A camada 3
usa o mesmo peso com o atributo no lugar do `.chat-list-root`, e carrega depois.

**Os chips de filtro não são da camada 2 de propósito**: cada modo mantém o seu estilo.

### Arranjo da linha

`display: contents` em `.chat-list-row-top` e `.chat-list-row-meta` sobe os quatro
elementos para a mesma grelha, sem tocar no JSX:

```
nome [+ sublinhas]   |  hora
prévia               |  selo
(faixa de etiquetas do WhatsApp)
(faixa de tags)
```

`row-gap: 0` é intencional: as faixas 3 e 4 só existem quando há conteúdo, e com `row-gap`
custariam espaço mesmo vazias. O respiro vem de `margin-top`.

### CONTRATO DE ALTURA — três sítios que andam juntos

A lista é virtualizada por **estimativa** (`estimateChatListRowSize`, sem `measureElement`):
o que passar da altura reservada é recortado no ecrã. As medidas estão fixadas em três
lugares que têm de bater certo:

1. `styles/zap-simples.css` → tokens `--zs-m-*`
2. `chats/chatList.flat.css` → aplica-os em `px` nas classes
3. `chats/chatListRowAtendimento.js` → `ROW_METRICS` espelha os mesmos números

Daí decorre que:

- **o título é truncado numa linha** (`--zs-m-title`) — nada de voltar a `-webkit-line-clamp: 2`;
- cada sublinha (setor, empresa, atendente, nº, "encontrado por") mede `--zs-m-subline`, sem margens;
- prévia e selo partilham a 2ª faixa; selo normal = 20px, selo com segunda linha
  (cobrança, reaberta por falta, pagamento concluído) = 44px;
- etiquetas e tags ocupam `--zs-m-extra-row` cada;
- `modoSimples` desconta sublinhas, faixas extra e a pilha de selo — no modo simples o
  `StatusPill` sai mais cedo e desenha no máximo uma pílula, por isso a lista fica toda
  à mesma altura (76px);
- o respiro vertical da linha é `--zs-m-pad-y` (12px em cima e em baixo), espelhado em
  `ROW_METRICS.padY` como **24** — o dobro, porque o estimador soma os dois de uma vez.
  Mexer num sem mexer no outro recorta ou sobra em TODAS as linhas de uma vez.

Para validar depois de mexer: render com ~40 conversas variadas (nome curto/longo, com e
sem setor, empresa, tags, todos os estados), rolar a lista inteira e comparar
`el.scrollHeight - el.clientHeight` em cada `.chat-list-row`. Tem de dar zero em claro,
escuro, telemóvel e desktop, nos dois modos.

### Outras decisões desta pele

- `CHAT_LIST_ROW_GAP` é `0` e `--cl-chat-row-gap` é `0px`. O gap entra no virtualizador
  à parte, fora da estimativa.
- **A régua entre linhas saiu (2026-11-04).** A linha é um cartão arredondado que flutua
  sobre o painel, como no WhatsApp para desktop: `border-radius: 10px`, `margin-inline: 8px`
  (6 no telemóvel) e realce só na passagem do cursor ou na seleção. O `--zs-row-inset`, que
  só servia para dizer onde a régua começava, foi removido.
  - A margem é **só horizontal**. O virtualizador prende a linha a `height: 100%` do seu
    slot, por isso margem vertical faria a linha transbordar. O respiro entre cartões não
    falta: nunca há dois realçados ao mesmo tempo.
  - `margem 8 + padding 8` dá os mesmos 16px de recuo que o avatar tinha com `padding: 16`,
    por isso nada se deslocou.
- O `:hover` está dentro de `@media (hover: hover)`. Sem isso, no telemóvel o realce ficava
  preso na última linha tocada — o `:hover` não se solta em ecrã tátil. No toque o retorno
  vem do `:active`.
- Movimento: entrada a 160ms com `cubic-bezier(0.16, 1, 0.3, 1)` e saída a 90ms `ease-out`.
  Sair mais depressa do que entrar é o que faz o cursor parecer deslizar em vez de ligar e
  desligar um interruptor. Tudo isto cai em `prefers-reduced-motion`.
- `overscroll-behavior: contain` no scroller: chegar ao fim da lista deixava o scroll passar
  para a página atrás e dar o salto elástico.
- A tinta de estado no cartão inteiro saiu; o selo à direita mantém a cor que significa estado.

### Os TRÊS PLANOS da lista (CONFIRMADO 2026-11-05)

Até aqui o painel, o cabeçalho, a faixa de rolagem e as linhas partilhavam `--zs-bg`: a
lista era **um plano só**, e o realce da linha selecionada era a única superfície do ecrã.
Sem nada por baixo, esse realce (`--zs-active`, #2a3942 — paleta do WhatsApp) lia como
"desativado" em vez de "selecionado", e não dizia nada sobre o ZapERP.

| Plano | Token | Escuro | Claro | Quem o usa |
|---|---|---|---|---|
| Chrome | `--zs-chrome` | #111b21 | #ffffff | `.chat-list-root`, cabeçalho, busca, chips |
| Poço | `--zs-well` | #0c141a | #f7f8fa | `.chat-list-scroll` |
| Passagem | `--zs-row-hover` | #18232b | #eef1f4 | `.chat-list-row:hover` e `:active` |
| Selecionado | `--zs-row-sel-*` | azul 14% + anel + sombra | azul 9% + anel + sombra | `.chat-list-row.is-active` |

Regras que não se podem perder:

- **O degrau chrome↔poço é pequeno de propósito.** Quem o torna legível é a hairline
  (`box-shadow: inset 0 1px 0 var(--zs-divider)` no scroller), não o salto de luminância.
  Lista escura que salta dois tons entre painel e poço fica listrada.
- **A hairline é `box-shadow`, não `border-top`.** Borda real entra no fluxo e empurra a
  primeira linha 1px; num virtualizador por estimativa isso acumula e recorta a última.
- **`--zs-row-sel-bg`, `-ring` e `-shadow` são um conjunto.** O fundo diz o estado, o anel
  de 1px desenha o limite do objeto e a sombra — com deslocamento e desfoque, nunca um halo
  de raio zero — levanta-o do poço. Tirar uma devolve um retângulo colorido.
- **O anel é `box-shadow` inset, não `border`.** Borda somaria 2px à largura e empurraria a
  grelha nome|hora para dentro.
- **A linha continua TRANSPARENTE em repouso**, como decidido a 04/11. O que mudou foi o
  que está por baixo dela, não ela.
- Nada disto toca no box model: `transbordo` medido em claro, escuro, 420px e 1280px deu
  `[]` e todas as linhas a 72px. O contrato de altura fica intacto.

**Barra de rolagem, foco e `::selection` vivem na secção "Superfícies do browser"**, no fim
do `chatList.flat.css`. Não declarar `::-webkit-scrollbar-thumb` noutro sítio do ficheiro:
uma 2ª declaração entra em conflito com a de lá (6px) e pode deixar o polegar com zero de
largura visível.

**A pega do rail** (`zs-railHandle-pill`, `layouts/useNavReveal.js`) desenha-se por cima da
margem esquerda da lista, a meia altura. É a afordância do menu retrátil, não um artefacto
— mas em repouso usa `--zs-text-2` cheio e lê-se como um risco solto sobre o poço. Medido,
não alterado.

**Fica por decidir:** com cinco conversas abertas seguidas, cinco cápsulas verdes "Aberta"
idênticas são o elemento mais ruidoso da lista, e o estado que menos informa. O sistema de
selos é de 03/11 e deliberado, por isso não foi mexido — mas se o verde for atenuado, é
aqui que se nota.
- O selo "Aguardando atendente" passa a ter a cápsula no **wrapper** (`.chat-list-status-tech--staff`)
  e não na pílula interna. No `chatList.css` a cápsula mudava de sítio entre telemóvel e
  desktop; unificar foi o que permitiu pôr rótulo e minutos dentro da mesma peça.
- O hero "Seu espaço de trabalho" e a faixa "N conversas" saíram da toolbar.
- Hierarquia do nome vs. prévia (2026-11-04): nome a **600** (700 com mensagens por ler,
  para o degrau continuar a notar-se) e prévia a **12.5px**. Nem o peso nem o corpo da
  letra mexem na altura — `--zs-m-title` e `--zs-m-preview` fixam as `line-height` —, por
  isso o contrato de altura não é afetado.

## Sistema de selos (CONFIRMADO 2026-11-03)

Os selos da coluna direita tinham cinco linguagens a competir: "Em atendimento" e
"Finalizada" eram painéis navy sólidos (os elementos mais pesados do ecrã, para uma
conversa já encerrada), "Aberta" uma pílula verde, "Aguardando cliente" um contorno
âmbar — todos em `ui-monospace`, cada um com um glifo unicode seu, e dois a animar em
`infinite`. Hoje são **uma cápsula e cinco tintas**, em `chatList.flat.css`:

| Tinta | Token | Estados |
|---|---|---|
| verde | `--zs-st-open-*` | Aberta, Pagamento concluído |
| índigo | `--zs-st-live-*` | Em atendimento |
| âmbar | `--zs-st-wait-*` | Aguardando cliente, Pagamento pendente, Disparo enviado, Reaberta por falta de interação |
| vermelho | `--zs-st-due-*` | Em atraso, prazo do cliente vencido/crítico |
| cinza | `--zs-st-done-*` | Finalizada, sem conversa |
| azul | `--zs-st-staff-*` | Aguardando atendente |

Regras que não se podem quebrar sem refazer o sistema inteiro:

- **Dois tokens por estado, não seis.** `-fg` é o texto **e** a marca — a marca usa
  `currentColor`. Quem acrescentar um estado acrescenta `-fg` e `-bg` nos dois temas
  (`:root` e `[data-theme="dark"]` em `styles/zap-simples.css`) e nada mais.
- **A marca é sempre o mesmo ponto** de `--zs-dot`, em `currentColor`. Os selos novos já
  traziam um `<span class="zap-dot">`; os antigos tinham o glifo no meio do texto, por
  isso a regra do ponto leva `font-size: 0` — é o que apaga o glifo. O selo "Aguardando
  atendente" é o único sem span no JSX: o ponto é um `::before`, desenhado depois da regra
  que apaga os pseudo-elementos dos painéis antigos (a ordem importa).
- **Nada de `ui-monospace`.** `font-family: inherit` tem de descer até ao rótulo. Atenção
  ao `-staff-main`, que ainda declara monospace no `chatList.css`: cortar no rótulo não
  chega, porque `inherit` propaga o monospace do pai. O corte é no `-staff-main`, que
  agora é `display: contents` — também foi isso que pôs o rótulo a encolher com
  reticências em vez de ser cortado a meio da palavra.
- **A cápsula mede 20px.** É o `m.badge` que `estimateChatListRowSize` reserva; as
  variantes empilhadas contam `m.badgeStack`. Mudar a altura aqui recorta linhas.
- **Peso visual segue a urgência:** finalizada é o estado mais calado da lista.

## Avatares em OKLCH (CONFIRMADO 2026-11-03)

`getAvatarColor` (`ChatListRow.jsx`) devolve `oklch(52% 0.12 <hue>)`, não HSL. Em HSL a
claridade não é perceptual: com os mesmos `62% 42%`, o branco das iniciais media **2.36:1
no pior ângulo (amarelo) e 10.38:1 no melhor** — reprovava AA conforme o nome do contacto
e a coluna de avatares andava aos saltos de peso. Em OKLCH o pior ângulo dá **4.95:1 com
uma amplitude de 0.97** em toda a volta: mesma presença para todos, matiz próprio para
cada um. Não voltar a HSL "porque é mais simples" — o número é o motivo.

O fallback vive em `chatList.flat.css` (`.chat-list-avatar { background-color: #64748b }`):
a cor por contacto entra num `style` inline e, num browser sem OKLCH, essa declaração cai
inteira — sem o fallback ficariam iniciais brancas sobre nada.

O avatar de grupo deixou de ser o emoji `👥` (desenhado pela fonte do sistema, a cores,
diferente em cada SO) e passou a ser `IconeGrupoAvatar`, SVG no mesmo traço 1.7 dos ícones
do cabeçalho.

## Tique de envio: card e bolha, uma decisão só (CONFIRMADO 2026-11-03)

A mesma mensagem aparecia com ✓✓ na thread e ✓ no card. Eram duas regras: a bolha em
`conversa/bubble/utils/bubbleStatus.js` e um `ChatTicks` próprio na lista, por comparação
de strings exatas. Hoje a decisão vive em **`utils/messageTicks.js`** (`resolveTickState`),
e cada tela só traduz o estado para a sua marcação — `wa-ticks` na bolha, `chat-ticks` no
card. **Não voltar a pôr regra de status em nenhuma das duas telas.**

As quatro divergências que existiam, todas no card:

| # | O que a bolha fazia | O que o card fazia |
|---|---|---|
| 1 | `device` → entregue, `server` → enviado (ACK cru do banco, canonizado por tabela de rank) | não conhecia as palavras → ✓ genérico |
| 2 | exibia o **maior** entre `status_mensagem` e `status` (linhas legadas divergem) | primeiro não-nulo: um `pending` velho vencia um `read` |
| 3 | `lida_em` / `entregue_em` provam leitura e entrega com o status preso | ignorava os dois |
| 4 | `whatsapp_id` significa que o provedor aceitou: nunca desenha "não enviei" | desenhava |

A #1 era a do relato: aparecia logo ao abrir a lista, antes de qualquer evento de socket,
porque o payload HTTP traz o ACK cru.

**Tempo real.** Repintar depende de a assinatura do tique mudar. `tickSignature(msg)` cobre
os nove campos que `resolveTickState` lê e entra em dois sítios de `chatListStoreCompare.js`:
`ultimaMensagemOutboundStatusKey` (comparador da linha) e `ultimaMensagemPreviewEqual`
(guarda do `setUltimaMensagem`). Antes só se comparava `status_mensagem`: um ACK que
mexesse só em `status`, `lida_em` ou `entregue_em` não repintava nada até ao F5.
`socket.js` passou também a levar `entregue_em` / `lida_em` para o card — iam só para a thread.

`normalizeMensagemStatusKey` **não** mudou: continua a servir as guardas do conversaStore e
do socket. Quem precisa do tique usa `tickSignature`.

**Teste:** `scripts/test-ticks-card-vs-bolha.mjs` (na suíte Node) percorre 20 estados mais
grupos e entrada, e exige a mesma marca nas duas telas; e verifica que a assinatura muda em
cada um dos nove campos — se não mudasse, a linha ficaria parada.

## Modo simples (CONFIRMADO)

`user.atendimento_modo_simples` vira o atributo `data-zap-simple="1"` no `<html>`
(`auth/modoSimplesUi.js`, aplicado no boot por `main.jsx` e mantido por `MainLayout`).
O que o modo acrescenta à pele comum está em `chats/chatList.whatsapp.css`: chips no estilo
dos filtros do WhatsApp e o cartão reduzido ao essencial (sem sublinhas nem faixas de
etiquetas). O selo usa a mesma tinta de todos (ver o sistema de selos acima); o modo
só aperta a coluna, que é mais estreita por não haver sublinhas. Resultado: lista toda à mesma altura (76px).

**Invariantes:**

- A pele esconde sublinhas (setor, empresa, atendente, número) e as faixas de tags/etiquetas,
  e `estimateChatListRowSize` desconta-as pelo parâmetro `modoSimples`. Reativar qualquer uma
  sem mexer no estimador recorta linhas.
- Os minutos de espera ficam **ao lado do relógio**, nunca dentro da badge (`ChatListRow.jsx`):
  dentro dela empurravam nome e prévia para fora na coluna estreita do desktop.

A conversa tem a pele irmã em `conversa/conversa.whatsapp.css` (importada depois de
`conversa.css`), e o modo simples também **esconde no JSX**: Transferir
(`AtendimentoActions`, junto de Assumir/Encerrar, que já saíam), a linha de setor do
cabeçalho (`ConversaHeader`, via prop `modoSimples`) e o interruptor de correção, que vai
para o menu de anexos em qualquer largura (`ConversaView`). Cor e ponta (`::after`) das
bolhas ficam **como estão**: a cor vive num gradiente e a ponta vem dos `--wa-bubble-*`;
mexer só numa delas desencontra as duas.

No telemóvel a barra inferior fica escondida (`transform: translateY(110%)`) e só sobe
quando o atendente arrasta a pega do rodapé — classes `app-layout--navRetratil` /
`is-navAberta` postas pelo `MainLayout`. Com conversa (ou thread do chat interno) aberta
nada disto se aplica: o `app.css` já esconde a barra e zera o `padding-bottom` do
`main-content`, inclusive com o teclado aberto. Os `:not(:has(…))` na regra do padding
existem por causa disso — sem eles a pele vencia por especificidade e devolvia uma faixa
branca acima do teclado.

### Rail lateral retrátil, no desktop (CONFIRMADO 2026-11-03)

O mesmo, no eixo X: o rail de ícones sai de vista e só entra quando se arrasta (ou se
clica) a pega de 14px encostada à borda esquerda. Classes `app-layout--railRetratil` /
`is-railAberto`. **Não está preso ao modo simples — vale para todos.**

O gesto dos dois é o mesmo hook, `layouts/useNavReveal.js`, com a opção `eixo`
(`"y"` para a barra, `"x"` para o rail): duas cópias seriam duas oportunidades de o limiar
de arrasto ou o toque divergirem.

Duas coisas que não são detalhe:

- O rail é um item **em fluxo** do `.app-layout` (que é `display: flex`), por isso escondê-lo
  só com `transform` deixaria uma coluna vazia de 68px. A regra põe-no `position: fixed` —
  é isso que devolve a largura ao conteúdo, que é o ponto de o esconder.
- Os dois menus levam `visibility: hidden` quando fechados. Sem isso o `Tab` entrava nos
  links fora do ecrã. `visibility` transita em degrau: some no fim da animação de saída e
  volta no início da de entrada, por isso não se vê nada a piscar.

## Componentes

| Arquivo | Papel |
|---------|--------|
| `chatList.jsx` | coordenador: load, cache, seleção, badges, UI |
| `ChatListBody.jsx` | único subscriber pesado de `chats`; memo |
| `ChatListRows.jsx` / `ChatListRowsPane.jsx` | janela de rows |
| `ChatListRow.jsx` | `memo(..., chatRowPropsAreEqual)` |
| `ChatListSearchBox.jsx` | input isolado (digitação **não** re-renderiza a lista) |
| Header/Toolbar/AdvancedFilters | UI de filtros |
| `hooks/useChatListFilterState.js` | estado serializável (abas, busca, avançados); `useChatListFilters.js` continua o compute in-memory no Body |
| `hooks/useWhatsappInstanceStatus.js` | banner WhatsApp desconectado (`GET /chats/zapi-status`, nome legado) |
| `hooks/useWhapiChannelStatus.js` | overlay vermelho (`GET /chats/whapi-status`); só acende com sessão comprovadamente caída. `not_configured` não pinta a tela. Em `MainLayout` via `WhapiDisconnectedOverlay` (oculto em `/configuracoes`). Expõe `revalidate()` — reconexão pelo QR do overlay apaga a tela na hora, sem esperar o poll de 60s |
| `hooks/useChatListPagination.js` | carregar mais + auto-avanço de página vazia |
| `hooks/useChatListResync.js` | nonce do store (debounce no **store**, não no hook), refresh 5 min, `zapi_sync_contatos` |
| `hooks/useChatListCounts.js` | deriva números dos chips a partir de `chatFilterCounts` já carregados |
| `chatListQueryHelpers.js` | `buildChatListFetchParams`, merge/dedupe/página |

## Modularização do coordenador (CONFIRMADO 2026-08-27)

`chatList.css`, `chatsStore.js`, comparadores, cache lateral, virtualização, Socket.IO, regras de fila e payloads **não** foram alterados.

- Status das instâncias: timers/delay mobile/foco iguais; banner no coordenador.
- Filtros: significado intacto; troca de filtro ainda zera `pagesLoaded` para 1 no efeito de `filterRequestKey`.
- Busca: com termo, `incluir_todos_clientes=1` e a aba **não** restringe o GET (B01). Generation `loadRequestIdRef` impede resposta antiga.
- Paginação: limites 80/40, preserve max pages, AbortController no load more.
- Resync: se `load()` está em voo, enfileira `{ background: true }` (última atualização após o voo).
- Contadores/filas: `refreshChatFilterCounts` (GET `/chats/counts`) no coordenador; `useChatListCounts` só deriva UI. Sem GET paralelo de badges.

`load()` HTTP ainda vive no coordenador (merge `setChats` + cache + badges secundários).

## Filtros, tabs, paginação, busca (CONFIRMADO)

Tabs em `chatListFilters.js` (exemplos): `minha_fila`, `campanhas`, `em_atendimento`, `aguardando_funcionario` / `aguardando_atendente`, …

**Chips ocultos (2026-09-09):** `abertas`, `aguardando_cliente`, `finalizadas_auto` (Por ausência), `pagamentos_pendentes`, `em_atraso` — removidos da toolbar; aba persistida nesses valores redireciona ao default.

O filtro **Campanhas** (`GET /chats?campanhas=1`) só aparece se `user.modulo_campanhas_ativo === true` (admin ativa em Configurações → Geral com senha + botão **Ativar**; a flag no `authStore` atualiza o chip sem F5). Lista só conversas com `aguardando_resposta_campanha=true` (disparo enviado, contato ainda não respondeu). Não reutiliza `mensagem_disparada` de envio pelo celular. Na primeira resposta inbound a flag é limpa, a conversa fica **aberta sem atendente** para quem estiver disponível assumir; chatbot/URA/boas-vindas não rodam. Atendimento humano já ativo (`em_atendimento` / `aguardando_cliente` / financeiro) não é reclassificado. Com o módulo off, `campanhas=1` devolve lista vazia e o contador fica 0.

Página: **80** desktop / **40** mobile (`CHAT_LIST_*_PAGE_LIMIT`). Cursor: `hasMore`, `nextCursor`, `nextCursorId` via `fetchChats` / `fetchChatsPages`.

Busca: termo local no filho (imediato) → debounce 350 ms no pai → GET só com **2+ caracteres** (ou 2+ dígitos). 1 caractere não dispara `incluir_todos_clientes=1`. Admin: `AdminAtendenteFilter`. Match por nome principal ou nome vinculado (`encontrado_por` discreto no card; o título continua o nome principal).

**Busca na Minha fila (corrigida em 2026-09-02):** termo de 2+ caracteres usa GET global autorizado, sem `minha_fila=1` nem filtragem pela aba na resposta, no cache ou na paginação. O rodapé de paginação funciona durante a busca. Filtros explícitos, inclusive funcionário, permanecem. Sem busca, a fila continua buscando todas as páginas.

**Abas de fila (2026-09-03):** `em_atendimento`, `aguardando_cliente`, `aguardando_atendente`, `pagamentos_pendentes` e `em_atraso` usam `fetchChatsProgressivo` (1ª página na hora, resto em background, teto pelo badge). **Todas** e **Hoje** continuam só com paginação.

**Perfil atendente × conversa assumida (2026-09-14):** `viewerCanSeeConversationRow` esconde individual assumida por outro (não encerrada). Admin/supervisor, grupos, fila livre, a própria conversa, co-atendente (`participante_ativo`) e quem transferiu (`usuario_transferiu`) continuam visíveis. GET `/chats` e Socket (`shouldRemoveChatFromViewerList` / 403 no detalhe) aplicam a mesma regra — Todas/Em atendimento não mostram o card de outro atendente.

## Cache de sidebar — `chatListSidebarCache.js`

| Função | TTL / limite |
|--------|----------------|
| hydrate/persist sidebar session | ~2 min; máx. ~400 rows |
| hydrate/persist rows por filtro | 120 s em memória e sessionStorage; reidratar não renova a idade |
| `sanitizeChatRowForSidebarCache` | metadados + preview curto (**sem** thread) |

Scope key: empresa + usuário. É stale-while-revalidate, não fonte de verdade.

**Ticks do card sincronizados com a thread (2026-10-06):** a reconciliação HTTP
`tempId → id/whatsapp_id` agora atualiza também `ultima_mensagem` da lista, não apenas a
bolha aberta. Assim, os ACKs `status_mensagem` seguintes identificam a mesma mensagem nos
dois lugares. Em empate de `criado_em`, `pickListaUltimaMensagem` preserva o preview
canônico atualizado pelo socket e não deixa o array legado `mensagens` regredir ✓✓ para ✓.
O card usa `status_mensagem` antes de `status`, igual à thread e aos comparadores.

**Invalidação (2026-09-03):** resync e eventos de uma conversa usam `removeChatIdFromFilterRowCaches` (não apagam o snapshot da aba). Só sync em massa (`zapi_sync_contatos`, `whatsapp_sync_mensagens_antigas`) e logout limpam o cache do escopo. Reconexão **não** zera os filtros — o `load({ background: true })` atualiza a aba atual. GET principal e paginação capturam uma revisão do cache: uma resposta iniciada antes da invalidação não pode gravar novamente o snapshot. Vazio conhecido continua diferente de cache ausente.

**Prefetch pós-auth (2026-09-03):** `prefetchDefaultChatList` dispara `GET /chats?minha_fila=1` no `login` e no `restore`, em paralelo com permissões/empresa. Grava o snapshot com a mesma `filterRequestKey` da aba padrão. O `load()` da lista reutiliza o GET em voo (ou o resultado com menos de 8 s) para não buscar de novo.

**Hint (2026-09-02):** mostra o total informado pela consulta sem aumentá-lo para igualar os cards. Se existem 6 cards e o total é 2, mostra `6 de 2`. Mantidos os estados de carga/busca e a apresentação por funcionário.

## Otimizações 2026-09-29 (ver 12-PERFORMANCE.md, seção da auditoria)

- `useChatListResync` guarda o último nonce processado (inicializado com o nonce do mount) — deps que mudam de identidade não disparam mais GET com o mesmo nonce; counts lidos por ref.
- `refreshChatFilterCounts`: efeito de mount/aba usa `reuseIfFresh` e há dedupe de GET em voo por `paramsKey`.
- `setPendentesFuncionarioIdsIfChanged` preserva a identidade do array do poll de supervisão (um array novo a cada 30s quebrava o memo de todas as rows).
- Sorts com decorate-sort-undecorate; `updateChat`/`setUnread`/tags/`removeChat` com noop real (não recriam `chats`).
- Guard de nonce também no efeito de mutação otimista do `chatList.jsx` (re-run por `user` novo não reaplica o delta dos chips).

## Performance da lista (obrigatório preservar)

- `chatListRowCompare.js`: `chatRowPropsAreEqual`, preview key, contact surface key.
- Não assinar `chats` inteiro em Header/Search/Row isolada.
- Não ordenar array novo a cada socket se o compare diz que nada mudou.
- Resync por nonce, não “fetchChats() em todo evento”.
- Boot mobile: atrasar status Z-API (nome legado), counts, filtros pesados.

HTTP: `chats/chatService.js`, `conversationActionsService.js`, `whatsappInstancesService.js`. (`minhasPendenciasService.js` / card Transferidos·Aguardando·Atraso e botão **Suporte ZapERP** foram removidos da toolbar da lista em 2026-09-09 — `useMinhasPendencias({ enabled: false })`.)

Socket que mexe na lista: `nova_mensagem`, `nova_conversa`, `conversa_atualizada` / `atualizar_conversa`, `conversa_apagada` / `encerrada` / `transferida` / `reaberta` / `atribuida`, tags, `contato_atualizado`. Sempre `shouldIgnoreByCompany` antes.

## Pertinência em tempo real (CONFIRMADO 2026-09-01; P0 2026-09-01)

Finalizar (e reabrir/transferir) não pode deixar a row no chip errado até um F5.

Causas fechadas neste ciclo:

1. Abas de fila não refiltrava status no client — GET antigo + cache de aba (memória até 15 min) reapresentava a conversa fechada.
2. Hide otimista só com `mutation.type === "encerrar_conversa"`; o eco socket não tinha `type` e `patchEverywhere` podia **reinserir** a fechada via `addChatIfAuthorized`.
3. `requestChatListResync` era ignorado se `updateChat` fosse noop, e o throttle de 2,5s do `useChatListResync` engolia o GET logo após um load.
4. `mergeEmAtendimentoBackgroundRows` preservava rows do cache com status antigo.
5. `atualizar_conversa` fazia `fetchChatById` + `addChat` e recolocava a fechada na aba atual.
6. `nova_mensagem` / `addChatIfAuthorized` inseriam qualquer conversa autorizada no array da aba ativa; o GET seguinte tirava — “aparece e some”. Resync em background substituía a lista e apagava quem ainda pertencia.
7. `atualizar_conversa` chegou a usar `wasInList`/`closed` sem declarar — o `catch` pedia GET da aba a cada evento.
8. **P0:** `updateChat`/`addChat` aplicam `applyNewerOptimisticMembershipTo` contra o payload cru (não o row já spread). Tombstone em `chatsStore.chatListHiddenClosed`. Restore de Minha fila **sem** `patch` completo (evita GET copiar nome/status em cima do card). Chips com delta otimista.

Contrato atual:

- `chatRowIsStaleForTab` / `computeChatsFiltrados` exclui fechada das abas de fila e também status claramente alheio (`aberta` / `aguardando_cliente` em Em atendimento, etc.).
- Socket só insere row se `shouldInsertChatRowInActiveList` (aba + busca + tombstone). Já na lista: só `updateChat` com membership otimista mais novo.
- Aba Minha fila: `chats` é a única fonte dos cards visíveis, inclusive vazia ou com todos os IDs diferentes do snapshot local. Cache só hidrata a store por `filterRequestKey`, antes da pintura. O resultado vazio é persistido; paginação e restauração também atualizam a store.
- Resync da aba **não** dispara só porque outra conversa atualizou. Dispara se inseriu na aba, se a row visível saiu do recorte, ou `lista_realtime` força.
- Resync **background** usa `mergeActiveTabBackgroundRows`.
- Encerrar/reabrir/assumir/transferir usam `requestChatListResync({ force: true })`.

- **Auto-assumir no envio (CONFIRMADO 2026-09-02):** conversa **Aberta** (sem outro atendente) no primeiro envio do atendente vira `em_atendimento` na hora. O frontend pinta otimista (`applyOutgoingStatusOptimistic` + mutation `assumir_conversa`); o backend assume em `assertPodeEnviarMensagem` (`autoAssumirAoEnviar: true`) e o socket `conversa_atualizada` leva `status_atendimento` + `atendente_id`. Nas abas de fila (Abertas / Minha fila de outro atendente) `shouldDropChatFromActiveList` remove o card em tempo real. “Todas/Hoje” só mudam o badge.

- **Em atendimento da empresa (CONFIRMADO 2026-09-02):** o chip lista **todos** os atendimentos visíveis (setor/admin), não só os do usuário logado. A Minha fila continua sendo a fila pessoal. Tombstone de “saiu da Minha fila” **não** esconde o card em Em atendimento (só encerrar). Sem isso o filtro ficava vazio até F5. GET `/chats?status_atendimento=em_atendimento` no backend deixou de recortar `atendente_id = eu` para atendente comum.
- **Minha fila (corrigida em 2026-09-02):** GET completo e resync continuam sem preservar extras. `resolveMinhaFilaPaintRows` sempre usa a store; não existe fallback por interseção de IDs. `minhaFilaList` permanece como metadado/cache auxiliar, sem autoridade para pintar cards ou manter o skeleton. `computeChatsFiltrados` preserva o recorte pessoal com `conversaPertenceAMinhaFila`.
- **Setor em tempo real (corrigido em 2026-09-02):** quando o cliente escolhe um setor (URA/chatbot) ou a conversa é transferida, o card some na hora para quem **não** pertence àquele departamento — inclusive se o evento omitir `atendente_id` (não herdar assignee stale). O backend emite `conversa_atualizada` enxuto (sem preview de mensagem) para a room `empresa_{company_id}` + departamento antigo/novo, porque o emit scoped só alcança quem **ainda** pode ver. **Admin** (`role`/`perfil` `admin` ou `administrador`) vê tudo. Supervisor **não** é admin nessa regra (igual ao GET `/chats`). Sem setor → todos veem. Conversa assumida por mim permanece **somente se o GET ainda autorizar o assignee**. `viewerCanSeeConversationRow` + `shouldRemoveChatFromViewerList` no socket; insert inverso via `addChatIfAuthorized` (GET `/chats/:id`). 403/404 em `atualizar_conversa` remove de `chats` e da sidecar Minha fila. Fechar a thread se o setor ficou inacessível **não** encerra o atendimento. Reconexão continua com `requestChatListResync({ force: true })`.

Busca com termo continua global. Fechar a thread na UI continua ≠ encerrar.

- **Unread global (corrigido em 2026-09-02):** `unreadById` é canônico e sincroniza `unread_count`/`unread` das rows. GETs de lista só inicializam IDs desconhecidos antes do primeiro snapshot; não desfazem incrementos nem leituras locais. `GET /chats/counts?unread=1` retorna `unread_by_id` e `unread_total` no escopo autorizado do usuário/empresa, independente da aba. O backend pagina todas as não lidas e permissões, reutilizando as regras de acesso da lista; erros não viram zero. `unreadSnapshotSync` serializa e agrupa consultas no boot, socket/reconexão, leituras e mudanças de acesso. Leituras locais ocorridas durante o GET preservam apenas seus IDs e provocam nova reconciliação. Eventos não incrementam o cliente: snapshots absolutos evitam replay duplicado e contagem de IDs sem autorização. Logout aborta; falhas têm retry com backoff. O webhook só incrementa para inbound realmente inserido. `GlobalNotifications`, socket e Atendimento usam a contagem canônica no título, somada aos contadores existentes do chat interno e HelpDesk.

- **Visão da lista no socket (CONFIRMADO 2026-09-02):** `ChatList` publica aba, busca imediata, busca debounced, `adminAtendenteFilterId`, `pendentesFuncionarioIds` e `departamentoFilter` via `setChatListView`. `buildActiveChatListViewFromStore` é a representação única; `getActiveChatListView()` no socket só a consome. Insert/drop realtime recusam conversa de outro atendente quando o admin filtra por funcionário (também em Todas/Hoje/busca).
- **Resync throttled (CONFIRMADO 2026-09-02):** janela de 2,5s continua; em vez de só `refreshChatFilterCounts`, agenda um `load({ background: true })` único no fim da janela (ou enfileira se já houver GET em voo).
- **searchActive imediato (CONFIRMADO 2026-09-02):** `chatListSearchActive` liga no primeiro caractere; `chatListSearchDebounced` só após 350ms (GET). Durante a janela o socket não dropa pela aba e não insere card novo (evita contaminar). Limpar a busca volta as regras da aba na hora.

- **Nome do responsável só em Em atendimento (2026-10-09):** o selo do atendente (pill admin e a linha `exibir_atendentes_no_card`) só pinta quando a aba ativa é `em_atendimento`. Nas outras abas o card não mostra quem assumiu. A altura estimada da lista virtual segue a mesma regra.
- **Chip Em atendimento inclui espera do cliente (CONFIRMADO 2026-09-16):** o chip **Aguardando cliente** saiu da toolbar (2026-09-09). A aba Em atendimento já listava essas rows (`aguardando_cliente_desde`, `status=aguardando_cliente` ou modo simples `cliente`); o número do chip **não** pode excluí-las — senão fica 0 com a lista cheia. GET `/chats/counts` usa a mesma regra da listagem (`status_atendimento=em_atendimento`, sem `exclude_aguardando_cliente`). `chatRowChipCountKeys` devolve `em_atendimento` **e** `aguardando_cliente` nessas rows (delta otimista do chip visível). O card continua com a etiqueta “Aguardando cliente”; o StatusPill omite “Em atendimento” quando há espera.

- **refreshMinhaFila removido (CONFIRMADO 2026-09-02):** era código morto (nenhum call site). `load()` já busca a lista da aba (`fetchMinhaFilaChatsCompleto` quando a aba é Minha fila). O número do chip vem de `refreshChatFilterCounts` → GET `/chats/counts`. Os refreshers paralelos `refreshEmAtendimentoBadge` / `refreshAguardandoClienteBadge` / pagamentos / atraso / disparadas também foram removidos — não religar via `runAuxBadgeFetch`. `runAuxBadgeFetch` só coalese `chatCounts` e `supervisao`.

## Melhorias anotadas (não alteradas)

- Default `chatListActiveTab: "minha_fila"` antes do mount — só modo simples, janela curta.

**Validação local:** `scripts/test-unread-and-minha-fila.mjs`, suíte Node (incluindo correções de refresh/funcionário), backend Jest e `e2e/unread-minha-fila.spec.js` em desktop/mobile. O E2E simula HTTP e entrega eventos aos listeners reais; não homologa tráfego de produção nem aparelho físico. Busca 350ms continua fora desta correção.

## Invariantes

- **Precedência do funcionário (corrigida em 2026-09-02):** `getAdminAtendenteFilterScope` compartilha a regra entre HTTP, pintura e insert/drop do socket. Selecionar funcionário substitui o recorte da aba (incluindo Finalizadas/Minha fila/Abertas); grupos e outros funcionários continuam excluídos. Os refinamentos existentes de ausência e aguardando cliente permanecem, e são publicados na store para o socket. Busca global suspende esses refinamentos. Cache, merge de background e remoção otimista não reaplicam a aba ignorada. Sem funcionário selecionado, as abas mantêm suas regras. Teste `scripts/test-chat-list-admin-scope.mjs` cobre 12 abas, refinamentos, setor, tombstone e retorno ao filtro normal.

- Unread só em inbound (`direcao` in / `fromMe` false).
- Preview da última mensagem não usa nome vazio do outbound.
- Setor: socket não “inventa” conversa invisível; `addChatIfAuthorized`.
- Fechar atendimento na API remove/atualiza row; fechar thread na UI não.
- Foto: não limpar URL http válida da **mesma** pessoa. `contato_atualizado` / `conversa_atualizada` **podem** trocar a URL se a nova for http diferente (correção de foto trocada). Se `cliente_id` ou o telefone forem de outra identidade, nome, foto e `cliente` aninhado não são herdados do card anterior. Evento `contato_atualizado` com telefone/cliente de outra pessoa é ignorado. `nova_mensagem` não copia `senderName`/`senderPhoto` de outbound nem de grupo para o card. Não usar `msg.photo` (mídia) como avatar. A trava visual do avatar (`lockCardAvatarUrl`) usa a assinatura da pessoa, não só o id da conversa.

## Auditoria estática de 2026-09-09

As correções desta auditoria foram verificadas por leitura de fluxo, TypeScript sem emissão e diff --check; não foram executados testes ou homologação visual. Relatório, limitações e reprodução: [certificacao-atendimento-2026-09-09.md](C:/Users/Miguel/Documents/whatsapp-plataforma/frontend/docs/audits/certificacao-atendimento-2026-09-09.md).

- Durante resync em background com cards já visíveis, os callbacks da primeira página de Minha fila/filas progressivas não publicam setChats(partial). Preservam a lista até o merge final; cold start vazio continua progressivo.
- chatRowListStoreKey inclui status outbound da última mensagem e aguardando_resposta_campanha. Os campos de prazo/conclusão de pagamento e reabertura por falta de interação participam tanto dessa assinatura quanto do comparador do card.
- sanitizeChatRowForSidebarCache conserva nove campos escalares de modo simples, campanha, finalização automática, reabertura e pagamento. Cache antigo só ganha esses campos ao ser regravado; formato e TTL permanecem.
- Regra atual de resync preservada: aproximadamente seis eventos ou cinco segundos, com force imediato. Referências históricas acima a throttle de 2,5s não descrevem esse hook atual.
- Não há certificação integral: guard de membership otimista pode bloquear rollback; Minha fila pode truncar pelo badge desatualizado; estimativa de altura e outros cenários precisam da validação descrita no relatório. Não retirar proteções nem religar medidas dinâmicas preventivamente.

## Contagem de não lidas (CONFIRMADO 2026-11-05)

`.chat-list-unread` existe no `chatList.css` desde sempre, mas estava escondido com
`display: none !important`. Essa regra entrou no commit `ffa5ff812` ("etiqueta
aguardando") — ou seja, **o selo de estado substituiu a contagem naquele sítio**. Não foi
descuido, foi decisão.

A contagem voltou sem desfazer isso: os dois **coexistem**, lado a lado, em vez de um
trocar pelo outro. Quem precisa do estado continua a vê-lo; quem varre a lista à procura
de trabalho tem o número.

- `ChatListRow.jsx` ganhou um wrapper `.chat-list-row-metaBottom` à volta da contagem e
  do `StatusPill`. É preciso porque `.chat-list-row-meta` é `display: contents`: sem o
  wrapper os dois caíam na MESMA célula da grelha e sobrepunham-se.
- A contagem vem primeiro e **não encolhe** (`flex: 0 0 auto`); quem cede largura é o
  selo, que já trunca com reticências. O número é o que diz "há trabalho aqui".
- Acima de 99 mostra `99+`.
- **Altura: não mexe.** A faixa continua a valer `max(prévia 18, selo 20)` = 20px, que é
  o que `estimateChatListRowSize` reserva, e a pílula tem 20px.
- **Custo conhecido:** a coluna 2 da grelha é `auto`, logo a sua largura é o máximo entre
  a hora (faixa 1) e esta faixa. Com a contagem presente a coluna cresce ~30px e o nome
  trunca mais cedo nas linhas com não lidas. É a mesma geometria do WhatsApp, e acontece
  só onde há mensagens por ler.

## Ícones do app (CONFIRMADO 2026-11-05)

`public/brand/pwa-192.png`, `pwa-512.png` e `apple-touch-icon.png` eram ainda a marca
VERDE anterior (balão + lettering). Foram regerados a partir de `zaperp-z.svg`: Z branco
sobre o azul da marca (`#1e6fd9`), que é a mesma convenção dos antigos — fundo de cor,
marca a branco.

Dois pormenores que fazem a diferença entre certo e quase-certo:

- O `zaperp-z.svg` traz `fill="#1e6fd9"` FIXO no `<g>`, não `currentColor`. Quem gerar
  outra vez tem de trocar o fill, senão sai Z azul sobre fundo azul — invisível.
- O manifest declara `purpose: "any maskable"`. Num ícone maskable o sistema recorta a
  tela em círculo ou squircle e só os **80% centrais** são garantidos. Por isso o Z ocupa
  **48%** da largura: cabe inteiro em qualquer máscara.

O `theme_color` (`#0d6efd`) já era azul; não foi preciso mexer. O `logo-base.png` (verde,
856 KB) continua no repo e não é referenciado por nada.
