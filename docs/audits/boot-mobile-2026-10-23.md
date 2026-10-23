# Auditoria de velocidade — entrar no app pelo celular (2026-10-23)

> Escopo desta sessão: **tempo entre tocar no ícone/link e o app estar usável no celular**.
> Nada foi alterado no código. Tudo abaixo foi medido no `dist/` que está em produção
> (mesmos hashes do servidor) e na rede real de produção.

---

## 1. O que o celular baixa hoje para entrar em `/atendimento`

Medido em `frontend/dist/assets/` — os hashes conferem com os servidos por
`zaperp.wmsistemas.inf.br`, então estes são os bytes reais de produção.

| Fase | Arquivo | Bruto | gzip |
|---|---|---|---|
| **Bloqueia o 1º pixel** | `index-BtAAidGk.js` (entrada) | 381 KB | **105 KB** |
| | `vendor-react` | 139 KB | 44 KB |
| | `vendor-axios` | 44 KB | 17 KB |
| | `vendor-socket` | 40 KB | 12 KB |
| | `vendor-router` | 22 KB | 8 KB |
| | `vendor-state` | 4 KB | 1 KB |
| | `index-BWuGHc0o.css` | 90 KB | 16 KB |
| | *(+ CSS do Google Fonts, 3ª origem)* | — | — |
| | **subtotal até o 1º pixel** | **720 KB** | **203 KB** |
| Depois | `MainLayout` + `Atendimento` (js+css) | 32 KB | ~10 KB |
| | `chatList` js + css | 285 KB | 63 KB |
| | `ConversaView` js + 2 css | 784 KB | 183 KB |
| | **TOTAL do boot** | **~1,82 MB** | **~459 KB** |

Dois números importam por motivos diferentes:
- **459 KB gzip** é o que passa pelo 4G.
- **1,82 MB bruto** é o que o processador do celular tem de *descomprimir, parsear e
  executar*. Num Android intermediário isso é a parte mais lenta, e não aparece no
  "tamanho do bundle".

---

## 2. Achado principal: 86% do chunk de entrada não serve para entrar

O fecho de imports **estáticos** de `src/main.jsx` tem **80 módulos / 845 KB de fonte**.
Destes, **729 KB (86%) são `conversa/`, `chats/` e `socket/`** — o motor de conversas
inteiro, dentro do arquivo que precisa ser executado *antes* do React pintar qualquer coisa.

Por pasta, dentro do chunk de entrada:

```
376,6 KB  conversa/
201,5 KB  chats/
 96,7 KB  socket/
 37,9 KB  push/
 29,0 KB  api/
```

Os maiores módulos individuais que estão no boot:

```
101,1 KB  conversa/conversaOutboundMediaMerge.js   ← merge de mídia de ENVIO
 96,8 KB  conversa/conversaStore.js
 88,1 KB  socket/socket.js
 42,9 KB  chats/chatsStore.js
 41,2 KB  conversa/utils/conversaViewHelpers.js
 31,2 KB  chats/chatService.js
 25,4 KB  conversa/conversaOptimisticMessage.js
 19,0 KB  conversa/mediaOutbox.js
 17,4 KB  conversa/offlineOutbox.js
 11,0 KB  conversa/offlineAudioCache.js
```

`conversaOutboundMediaMerge.js` — 101 KB de lógica de juntar mídia que o atendente
está *mandando* — é parseado antes da tela de login aparecer.

### Por que isso acontece: três arestas

Não é culpa do `authStore` sozinho. São exatamente **3 imports estáticos**, em 3 arquivos,
que prendem o motor todo no boot:

| # | Aresta | Para que serve de fato |
|---|---|---|
| 1 | `api/http.js` → `socket/socket.js` | chamar `disconnectSocket()` no 401 (linha 136) |
| 2 | `api/http.js` → `conversa/conversaStore.js` | `clearConversaSessionCaches` |
| 3 | `push/swBridge.js` → `conversa/conversaStore.js` | ponte de notificação |
| 4 | `auth/authStore.js` → socket + conversaStore + chatsStore + prefetch + push | login/restore |

A 1 e a 2 são as piores: `api/http.js` é importado por **tudo** (`configService`,
`chatService`, …), então o motor entra no boot por um caminho que ninguém suspeita.
É por isso que mexer só no `authStore` não resolve — já tinha sido tentado e o doc
`12-PERFORMANCE.md` registra como "não aplicado".

### Simulação do corte (grafo recalculado)

| Cenário | Módulos no boot | Fonte |
|---|---|---|
| Hoje | 80 | 845 KB |
| Só `authStore` dinâmico | 78 | 816 KB (**-3%**) |
| **As 3 arestas (`http.js` + `swBridge.js` + `authStore`)** | **26** | **116 KB (-86%)** |

O que sobraria no boot: `AppRoutes`, `authStore`, `http`, `permissions`, `Login`,
`ErrorBoundary`, `baseUrl`, `permissoesStore` — exatamente o necessário para decidir
"tem sessão?" e pintar.

**Efeito prático:** chunk de entrada de 381 KB → ~60 KB brutos. O motor de conversas
continua baixando (já é pré-carregado em paralelo pelo `useEffect` do `AppRoutes`), mas
deixa de bloquear o primeiro render. Num Android intermediário, parsear+executar 381 KB
custa algo entre 400 e 800 ms de main thread.

---

## 3. Tela branca durante todo o boot

`index.html` entrega `<div id="root"></div>` vazio. Não há skeleton inline, não há SSR.
No celular o usuário olha **branco** desde o HTML até o React montar: HTML → CSS 90 KB →
JS 720 KB → parse → primeiro render.

Um skeleton inline em HTML+CSS no `index.html` (header + 6 linhas de lista cinza, ~2 KB)
pinta no mesmo instante que o HTML chega. Não acelera nada tecnicamente — muda a
percepção de "travado" para "carregando", que é exatamente a reclamação.

---

## 4. No celular, o `ConversaView` baixa no boot e não é visível

`routes/AppRoutes.jsx` pré-carrega, sem condição de dispositivo:

```js
void import("../layouts/MainLayout")
void import("../pages/Atendimento")
void import("../chats/chatList")
void import("../conversa/ConversaView")   // ← 784 KB brutos / 183 KB gzip
```

Mas `pages/Atendimento.jsx` renderiza, no celular sem conversa selecionada:

```js
hasSelectedConversa ? <ConversaView/> : isAtendimentoMobileNav ? null : <AtendimentoEmptyState/>
```

Ou seja: **`null`**. O celular baixa `ConversaView-BBShj7GC.js` (428 KB) +
`conversa-CcOmjCG0.css` (330 KB) + `ConversaView-Cm1uSJJi.css` (26 KB) para renderizar nada.

São **40% dos bytes do boot** (183 de 459 KB gzip) disputando banda e CPU com a lista,
que é a única coisa que o usuário vê.

**Correção:** no mobile, mover esse `import()` para *depois* da lista pintar
(`scheduleAfterInitialPaint`, que já existe em `src/chats/scheduleAfterInitialPaint.js`).
Tocar numa conversa continua instantâneo, porque o pré-carregamento acontece nos
segundos em que o atendente está lendo a lista.

> **APLICADO em 2026-10-23** — `src/routes/preloadAtendimento.js` (novo).
> Medido no dev server com sessão e viewport reais:
>
> | cenário | chatList | ConversaView | |
> |---|---|---|---|
> | celular sem conversa | 307 ms | 2556 ms | adiado (+2249 ms) |
> | desktop 1200px | 274 ms | 274 ms | paralelo, como antes |
> | celular `?conversa=123` | 268 ms | 268 ms | imediato |
>
> Nunca adia quando o boot já aponta para uma conversa (`?conversa=` ou `openConversaId`
> em `history.state.usr`), nem fora de `(max-width: 640px)`, nem sem `matchMedia`
> confiável. Teste: `scripts/test-preload-conversa-view.mjs` (18 asserts, 3 mutações).
> Custo: +1,4 kB brutos no chunk de entrada.

---

## 5. Rede: medições reais de produção

Medido daqui (Windows, fibra). Em 4G somam-se 50–150 ms por RTT.

| Alvo | TCP connect | TLS pronto | TTFB |
|---|---|---|---|
| `zapapi.wmsistemas.inf.br/health` (resposta `{"ok":true}`) | 152–177 ms | ~340 ms | **490–657 ms** |
| `zaperp.wmsistemas.inf.br/assets/vendor-router.js` (22 KB) | 174–220 ms | ~345–416 ms | 489–637 ms |
| `fonts.googleapis.com/css2?family=Inter…` | 75 ms | 409 ms | **528 ms** |

Conclusões:

**5.1 — Falta `preconnect` para a API.** O `index.html` tem preconnect só para as duas
origens do Google Fonts. A primeira chamada à API (`GET /chats`, no `restore()`) paga
DNS + TCP + TLS da origem `zapapi.*` do zero: **~340 ms medidos** antes do primeiro byte
de request sair. Uma linha resolve:

```html
<link rel="preconnect" href="https://zapapi.wmsistemas.inf.br" crossorigin />
```

**5.2 — Google Fonts bloqueia o render em duas origens de terceiros.** O
`<link rel="stylesheet">` para `fonts.googleapis.com` é render-blocking; depois dele o
browser ainda abre uma **terceira** conexão para `fonts.gstatic.com` buscar o `.woff2`.
No celular frio isso é fácil 400–700 ms de render bloqueado por uma fonte. Auto-hospedar
o Inter (2 pesos, ~30 KB de woff2 em `/assets`, servido com o `immutable` que já existe)
elimina duas conexões e o bloqueio.

**5.3 — Servidor responde só gzip.** Pedi `Accept-Encoding: gzip, br` e recebi
`Content-Encoding: gzip` em todos os assets. Brotli no nginx dá 15–20% a menos de bytes
de graça — medido nos arquivos reais: entrada 105 KB gzip → **87 KB brotli**;
`conversa.css` 54 → **42 KB**; `ConversaView.js` 124 → **100 KB**. Só no boot são
~60 KB gzip economizados.

**5.4 — `index.html` sai do nginx sem `Cache-Control` nenhum.** Só `ETag` +
`Last-Modified`. O comentário no próprio `index.html` diz que "a política autoritativa
também deve ser enviada pelo Nginx" — não está sendo. O `<meta http-equiv>` é ignorado
pelos browsers para o documento. O correto é `Cache-Control: no-cache` (revalida, aceita
304 — barato) e não `no-store`.

**5.5 — Assets estão corretos.** `Cache-Control: max-age=31536000, public, immutable`
nos `/assets/*`. Isso está certo e não deve mudar.

---

## 6. Service Worker: a navegação é network-first

`public/sw.js` (`SW_VERSION = '2026-10-07-offline-shell-1'`) está bem desenhado, mas:

- **navegação = network-first.** Toda entrada no app espera a rede devolver o
  `index.html` *antes* de qualquer coisa começar. No celular são os 490–640 ms medidos,
  pagos sempre, mesmo com todo o resto em cache. Para quem já tem sessão,
  stale-while-revalidate (serve o shell do cache e atualiza atrás) faz o app começar
  a pintar em ~0 ms.
- **`install` não pré-cacheia `/assets/*`** — só faz `fetch('/')`. Então a primeira
  entrada **depois de cada deploy** é 100% fria: 459 KB gzip pela rede. Precachear os
  chunks do boot no `install` (lidos do próprio `index.html`) resolve.
- `/assets/*` cache-first está correto (os nomes têm hash).

---

## 7. Cascata de API no boot

Disparado por `authStore.restore()`, que roda **no escopo de módulo do `main.jsx`,
antes de `createRoot`**:

```
restore()
├── initSocket(token)                    ← síncrono, antes do 1º paint
├── GET /chats?minha_fila=1&limit=250    ← ver 7.1
└── queueMicrotask
    └── GET /usuarios/me                 ← ~490 ms
        ├── GET /usuarios/me/permissoes  ← SERIAL depois do /me  (~490 ms)
        └── GET /empresa                 ← SERIAL depois do /me
Atendimento/chatList no mount
└── GET /whatsapp/instances
depois do paint (já escalonado, OK)
└── GET /chats/counts, supervisão
```

**7.1 — O `GET /chats` do boot pede 250 conversas e não entrega nada antes do fim.**
`prefetchDefaultChatList` chama:

```js
fetchMinhaFilaChatsProgressivo({ minha_fila: "1" }, { silent: true })
//                              ↑ sem onFirstPage, sem badgeCount
```

Com `badgeCount` indefinido, `getMinhaFilaMaxPages()` devolve
`MINHA_FILA_MAX_AUTO_PAGES = 50`, e `CHAT_LIST_MINHA_FILA_PAGE_LIMIT = 250`. Sem
`onFirstPage`, a função **não entrega a primeira página** — faz o laço inteiro e só
resolve no fim. Fila grande = até 50 páginas de 250, **em série**, antes de a lista
aparecer.

E cada linha é gorda: o `select` do
`controllers/chat/conversationListController.js` traz `clientes` + `cliente_tags` +
`tags` + `atendente` + `departamentos` + a última mensagem completa (`texto`,
`contact_meta`, `location_meta`).

No celular cabem ~8 linhas na tela. Pedir 250 para mostrar 8 é o maior desperdício
de latência do boot. Primeira página de 30–40 com entrega imediata, resto em background.

> **APLICADO em 2026-10-23** — 1ª página do boot = 40 (`PREFETCH_BOOT_PRIMEIRA_PAGINA_LIMIT`),
> entregue por `takePrefetchedDefaultChatListPrimeiraPagina()`; as seguintes continuam em
> 250. Medido com mock de API (300 conversas, custo proporcional ao tamanho da página):
>
> | | 1ª requisição | lista pinta |
> |---|---|---|
> | antes | `limit=250` @1235 ms | 1559 ms |
> | depois | `limit=40` @407 ms | **477 ms** |
>
> **−1082 ms.** O resultado final continua a ser a lista COMPLETA, e só ela vai para o
> cache de sessão — a aba não tem "Carregar mais", então uma página parcial sumiria com
> conversas. `getMinhaFilaMaxPages` passou a ser `1 + ceil((badge − 1ª página) / 250)`:
> com a conta antiga, badge 250 + 1ª página de 40 daria 1 página = **210 conversas
> perdidas**. Teste: `scripts/test-boot-primeira-pagina.mjs` (3 mutações).

**7.2 — `/usuarios/me` → `/usuarios/me/permissoes` em série.** São ~980 ms medidos
antes de o menu e as rotas protegidas estabilizarem, e `fetchPermissoes` só precisa do
token, que já está em mão. Pode sair em paralelo com o `validateSession` (ou vir junto
na resposta do `/me`).

> **APLICADO em 2026-10-23** — no `restore()` do `authStore`, permissões e empresa saem
> junto com o `/usuarios/me`; só as flags do utilizador continuam a esperar por ele.
> Verificado no browser: `/usuarios/me/permissoes` @564 ms e `/config/empresa` @568 ms
> junto com `/usuarios/me` @571 ms.
>
> Ganho honesto: **não acelera a lista** — ela não depende de permissões e `/atendimento`
> não é rota protegida. O que encurta é a janela em que o menu lateral pode mudar sozinho:
> com `permissoes` ainda `null`, `can()` cai num palpite por cargo, então um item podia
> aparecer ou sumir ~1 s depois de entrar. Admin não vê diferença.
>
> Não cria risco novo: o `prefetchDefaultChatList` já disparava `GET /chats` sem portão, e
> token morto cai no interceptor global de 401, que recarrega em `/login`.
> Teste: `scripts/test-boot-permissoes-paralelas.mjs`.

**7.3 — Socket conecta antes do primeiro paint.** `initSocket` é chamado
sincronamente dentro do `restore()`, no escopo de módulo. O parse de `socket.js` (88 KB)
e o setup da conexão WebSocket competem com o primeiro render. Transportes estão
corretos (`["websocket", "polling"]`, websocket primeiro).

---

## 8. Backend: o índice de ordenação da lista não serve

A lista ordena (linhas 675-676, 687-688, 700-701 de `conversationListController.js`):

```js
.order('ultima_atividade', { ascending: false, nullsFirst: false })
.order('id', { ascending: false })
```

→ `ORDER BY ultima_atividade DESC NULLS LAST, id DESC`

O índice existente (`supabase/migrations/20260528000000_performance_realtime_list_indexes.sql`):

```sql
CREATE INDEX idx_conversas_company_atividade_id
  ON public.conversas (company_id, ultima_atividade DESC, id DESC);
```

Em Postgres, `DESC` implica **NULLS FIRST**. A ordenação pede NULLS LAST → **o índice
não é elegível** e o Postgres ordena o conjunto filtrado inteiro em cada página.
O parcial `idx_conversas_company_ultima_atividade` (NULLS LAST) tem
`WHERE status != 'fechada'` e também não serve.

Isto já estava diagnosticado em `backend/docs/ai-handoff/29-AUDITORIA-PERFORMANCE-BACKEND.md`,
mas **o índice nunca foi escrito como migration** — verificado: `0 arquivos` em
`supabase/migrations/` mencionam `idx_conversas_company_atividade_id_nulls_last`.

É o ganho de maior relação valor/risco do backend: um índice.

---

## 9. Secundários confirmados

- **`react-easy-crop` é dependência morta** — a única menção em `src/` é um comentário
  em `conversa.css:10906`. O que é usado de fato é `react-image-crop`, em
  `ImageSendPreviewMobile.jsx` (chunk lazy).
- **Dois pacotes de ícones**: `@tabler/icons-react` em 36 arquivos, `lucide-react` em 14.
  `vendor-icons` é 65 KB brutos / 11 KB gzip — impacto pequeno, não é prioridade.
- **CSS enorme e não purgado**: `conversa.css` 441 KB / 18.200 linhas (451 `!important`),
  `chatList.css` 151 KB / 5.846 linhas. Purgar dá bytes reais, mas é trabalho de risco
  alto com retorno menor que os itens 2, 4 e 7 — fica para depois.
- **Mobile já é escalonado e isso está bom**: `MOBILE_SECONDARY_REFRESH_DELAY_MS = 2800`,
  `MOBILE_SUPERVISAO_POLL_DELAY_MS = 6000`, `scheduleAfterInitialPaint` com
  `requestIdleCallback`. Não mexer.

---

## 10. Ordem recomendada

Ordenado por (ganho no celular) ÷ (risco de regressão):

| # | Ação | Onde | Ganho | Risco |
|---|---|---|---|---|
| 1 | Skeleton inline no HTML | `index.html` | branco → "carregando" imediato | nenhum |
| 2 | `preconnect` para `zapapi` | `index.html` | ~340 ms na 1ª chamada | nenhum |
| 3 | Brotli no nginx | servidor | -15/20% de bytes | nenhum |
| 4 | `Cache-Control: no-cache` no `index.html` | nginx | deploy consistente, 304 barato | nenhum |
| 5 | Pré-carregar `ConversaView` só após a lista pintar no mobile | `AppRoutes.jsx` | -183 KB gzip da janela crítica | baixo |
| 6 | Índice NULLS LAST | migration nova | `/chats` sem sort completo | baixo (migration) |
| 7 | 1ª página do boot = 30–40 + entrega imediata | `prefetchDefaultChatList.js` | lista aparece muito antes | baixo-médio |
| 8 | Auto-hospedar Inter | `index.html` + `/assets` | -2 conexões de 3ª origem, render desbloqueado | baixo |
| 9 | Permissões em paralelo com `/me` | `authStore.js` | ~490 ms no menu | baixo |
| 10 | **Cortar as 3 arestas do chunk de entrada** | `http.js`, `swBridge.js`, `authStore.js` | **-86% do boot chunk** | médio |
| 11 | Navegação do SW stale-while-revalidate + precache no install | `public/sw.js` | shell pinta em ~0 ms | médio |
| 12 | Remover `react-easy-crop` | `package.json` | limpeza | nenhum |
| 13 | Purgar `conversa.css` / `chatList.css` | CSS | bytes | alto |

Itens 1–4 são de minutos e não tocam lógica. O 10 é o de maior ganho estrutural e
precisa de cuidado (o `12-PERFORMANCE.md` já avisa que exige tratar `swBridge` junto —
agora sabemos exatamente quais arestas são).

---

## Como medir depois

```js
// No celular, console do app, depois de entrar:
const n = performance.getEntriesByType('navigation')[0]
const r = performance.getEntriesByType('resource')
console.table({
  ttfb: Math.round(n.responseStart),
  domInteractive: Math.round(n.domInteractive),
  fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0),
  jsBruto: r.filter(x => x.name.endsWith('.js')).reduce((a,x) => a + x.decodedBodySize, 0),
  bytesRede: r.reduce((a,x) => a + x.transferSize, 0),
})
```

`decodedBodySize` é o número que prevê o custo de CPU no celular; `transferSize` é o
custo de rede. Os dois precisam cair, e hoje são **1,82 MB** e **~459 KB**.
