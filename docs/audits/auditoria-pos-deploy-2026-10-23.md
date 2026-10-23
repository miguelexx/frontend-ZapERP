# Auditoria pós-deploy — 23/10/2026

> Feita depois de o deploy dos 4 itens de boot entrar no ar. Escopo: certificar o que
> subiu, caçar regressão, e procurar ganhos **seguros** de velocidade e estabilidade.

---

## 1. Certificação do que subiu

| verificação | resultado |
|---|---|
| bundle em produção | `index-CO3BeIxG.js` — **bate com o commit** `dc4733341` |
| esqueleto de boot | presente no HTML servido, e **removido** pelo React ao montar |
| preconnect da API | presente |
| tela de login | renderiza |
| erros de console | **zero** |
| `ConversaView` no boot deslogado | **não baixa** (correto — o preload só roda com sessão) |
| TTFB / FCP / domInteractive | 187 ms / 288 ms / 222 ms (desktop, cache quente) |

Nenhuma regressão encontrada.

---

## 2. Caça a vazamentos — limpo

Varri `setInterval` sem `clearInterval` e `addEventListener` sem `removeEventListener`.
Dez arquivos apareceram no grep bruto; **todos os três candidatos reais são falsos
positivos**, e por bons motivos:

- `utils/useOnlineStatus.js` — tem guarda `listenersLigados`: os 5 listeners ligam **uma
  vez por aba** (`useSyncExternalStore`), e os assinantes saem no unsubscribe. O comentário
  no arquivo explica que a alternativa (listeners por instância) daria 2×N com churn a
  cada scroll da lista virtual.
- `brand/ZapERPLogo.jsx` — o 4.º listener é `{ once: true }` num elemento de ripple que se
  remove sozinho.
- `internal-chat/InternalChatComposer.jsx` — a contagem extra veio de uma **anotação de
  tipo** (`ReturnType<typeof setInterval>`); o intervalo real é gerido por `clearAudioTick()`.

Os demais são singletons de módulo (`main.jsx`, `swBridge`, `pushSubscriptionLifecycle`,
`vitePreloadRecovery`, `outboxAutoFlush`) — listeners que vivem o tempo da aba, por desenho.

**Conclusão: não há vazamento de listener nem de timer no frontend.**

---

## 3. APLICADO — a Inter deixou de vir do Google

### O achado não é só de velocidade, é de disponibilidade

O `index.html` tinha:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:..." rel="stylesheet" />
```

Folha de estilo no `<head>` é **render-blocking por definição**. Ou seja: **o primeiro
pixel do ZapERP — inclusive o esqueleto de boot inline que acabámos de pôr — só aparecia
depois de um CDN de terceiros responder.** Se `fonts.googleapis.com` estiver lento,
bloqueado (rede corporativa, filtro) ou com problema de DNS, o app não desenha nada.

Na produção medi a folha a terminar aos 213 ms e o FCP aos 288 ms — consistente com o
bloqueio (e isso com a folha já em cache).

### Por que doía mais no celular

No Windows o `body` cai em `"Segoe UI"` e a Inter nunca chega a ser baixada — medi **zero
pedidos** a `fonts.gstatic.com` no desktop. No **celular** não existe Segoe UI, então a
Inter é mesmo usada, e o custo é: folha render-blocking numa origem + ficheiro woff2
**noutra** origem, cada uma com DNS+TCP+TLS próprios.

### O que foi feito

A Inter passou a ser servida pela nossa origem:

- `src/styles/fonts/inter-latin.woff2` — 47 kB, **fonte variável**: um único ficheiro
  cobre os 5 pesos (400/500/600/700/800). Confirmado extraindo os 35 blocos `@font-face`
  da CSS do Google: os 5 blocos do subset `latin` apontam todos para **o mesmo URL**.
- Os 5 `@font-face` no topo de `src/styles/theme.css` são **cópia fiel** das declarações
  do Google (mesmos pesos, mesmo `unicode-range`, mesmo `font-display: swap`) — só o URL
  mudou. Gerados por script a partir da CSS real, para não haver erro de transcrição.
- O subset `latin` basta: **todo o português cabe em U+0000-00FF** (verificado
  caractere a caractere — ã, ç, õ, á… todos ≤ 0xFF).
- Removidos do `index.html` o `<link>` e os **dois** preconnects do Google.

### Verificação

| | |
|---|---|
| `document.fonts.check('600 16px Inter')` | `true` |
| peso 600 | `loaded` (os outros ficam `unloaded` até serem precisos — correto) |
| largura de texto com Inter vs fallback | 396 px vs 350 px → **não é fallback silencioso** |
| origem do woff2 | a nossa (`localhost:5173` no teste) |
| pedidos ao Google | **0** |
| tela de login | conferida visualmente |

### Ganhos colaterais

- O ficheiro entra em `/assets` com hash → herda o `Cache-Control: immutable` do nginx e
  o **cache-first do service worker**.
- **Funciona offline** — a fonte do Google nunca funcionou.
- Custo: `index.css` subiu **+0,21 kB gzip** (17,56 → 17,77 kB).

---

## 4. Item 10 — medido de novo, e a objeção caiu

O chunk de entrada ainda carrega o motor de conversas. Refiz a medição com o código atual:

| | módulos | fonte |
|---|---|---|
| hoje | 82 | 858 kB |
| cortando as 3 arestas | 49 | **356 kB (−59%)** |

> A estimativa antiga dizia −86%. Era otimista: ela cortava também o caminho do
> **prefetch do boot**, que tem de ficar. Com o prefetch preservado, o ganho real é −59%
> — 502 kB de fonte que deixam de ser parseados antes do primeiro render.

**A objeção que me travava deixou de existir.** Eu receava que tornar o `authStore`
dinâmico atrasasse o `GET /chats` do boot. Medi: com os cortes, o caminho do prefetch
**não arrasta mais o motor** (`conversaStore`/`socket` saem dele), logo o GET sai na mesma
hora de hoje.

**Por que mesmo assim não apliquei agora:** mexe em três pontos delicados ao mesmo tempo
— o handler de 401 em `api/http.js`, o `push/swBridge.js` e o boot do socket no
`authStore.restore()`. É exatamente "o que está correto". Merece sessão própria.

**Desenho proposto (seguro por construção):** um módulo de registo sem dependência
nenhuma. `socket.js` e `conversaStore.js` registam as suas limpezas quando carregam;
`api/http.js` importa só o registo e executa o que estiver registado. Se um módulo nunca
carregou, não há estado dele para limpar — o no-op é **correto**, não é bug.

**Companheiro do item 10 (não vale sozinho):** `chats/chatListRowAtendimento.js` e
`chats/chatsStore.js` importam **só `parseToDate`** de `conversa/utils/conversaViewHelpers.js`
— 41 kB com 68 exports, que ainda arrasta `conversaUtils` (15 kB). Extrair a função (13
linhas, pura) para um módulo próprio limparia isso. **Medi: hoje o ganho é 0 kB**, porque
o `conversaViewHelpers` chega ao boot por outro caminho (o próprio motor). Só passa a
render depois do item 10.

---

## 5. APLICADO (backend) — a API não subia sem `OPENAI_API_KEY`

`services/openaiClient.js` foi escrito de propósito para ser lazy. O comentário dele diz:

> "A validação é feita na PRIMEIRA chamada (não no carregamento do módulo) para que o
> servidor inicie normalmente mesmo que a chave ainda não esteja configurada"

E exporta `client` como **getter** (`Object.defineProperty`). Só que
`services/aiDashboardService.js:20` fazia:

```js
const { client: openai } = require('./openaiClient')
```

**Desestruturar invoca o getter no carregamento do módulo** — o desenho lazy era anulado.

### Cadeia provada

```
app.js:324  require('./routes/aiRoutes')
  → aiRoutes.js:8      require('../controllers/aiController')
    → aiController.js:20  require('../services/aiDashboardService')
      → aiDashboardService.js:20  const { client } = require('./openaiClient')  ← estoura
```

Teste decisivo, sem a chave:

```
require('./services/openaiClient')                  → OK
const { client } = require('./services/openaiClient') → FALHOU: OPENAI_API_KEY não configurada
require('./controllers/aiController')               → FALHOU (mesma causa)
```

Ou seja: **sem `OPENAI_API_KEY` a API inteira não subia** — não só os endpoints de IA.
A chave é opcional no `.env.example`.

### Correção

`const { getClient: getOpenAiClient } = require('./openaiClient')` e os **2** pontos de
uso passam a `getOpenAiClient().chat.completions.create(...)`. Três linhas, contidas no
mesmo arquivo. Restaura o desenho que o próprio módulo documenta.

Depois da correção, com o `.env` carregado e a chave removida:

```
require('./controllers/aiController')  → OK
require('./app')                       → OK (o servidor inteiro carrega)
```

É bug **latente**: em produção a chave está posta, então não há incidente agora. Vale como
seguro — rotação de chave, `.env` novo numa máquina, ou remoção da chave deixariam a
plataforma toda fora do ar por um motivo que não tem nada a ver com IA.

---

## 6. Ainda pendente, verificado hoje em produção

| item | estado medido | ganho |
|---|---|---|
| **Brotli no nginx** | `Content-Encoding: gzip` — **não aplicado** | ~60 kB gzip no boot |
| **`Cache-Control` no `index.html`** | só `ETag`, **sem** `Cache-Control` — não aplicado | deploy consistente, 304 barato |
| `Cache-Control` dos assets | `max-age=31536000, public, immutable` — **correto** | — |
| **Índice `NULLS LAST`** | não verificável daqui (precisa do SQL Editor) | `/chats` sem ordenar tudo |

Snippets prontos em [`nginx-boot-mobile-2026-10-23.md`](nginx-boot-mobile-2026-10-23.md).
Continuam a ser os maiores ganhos de **código zero**.

---

## 7. O que NÃO mexi, de propósito

- **`conversa.css` (441 kB) e `chatList.css` (151 kB)** — purgar dá bytes reais, mas é
  trabalho de risco alto no caminho quente. Não é "melhoria segura".
- **`react-easy-crop`** — dependência morta (a única menção em `src/` é um comentário).
  Remover **não reduz bundle nenhum** (não é importada, logo não é empacotada); só
  encurta o `npm install`. Mexer no lockfile por isso não compensa agora.
- **Service worker: navegação `network-first`** — passar a stale-while-revalidate faria o
  app começar a pintar em ~0 ms nas entradas repetidas, mas introduz "uma versão
  atrasada" depois de cada deploy. É uma troca que o Miguel tem de decidir, não eu.


---

## 8. ⚠️ Sessão concorrente na mesma árvore (23/10, ~13h)

Durante esta auditoria apareceram modificações em `src/conversa/orcamento/` que **não são
desta sessão**: 7 arquivos (785 inserções / 447 remoções) + `precoItemCache.js` novo,
escritos às 13:02, 13:09 e **13:11:46** — ou seja, ainda a serem escritos enquanto eu
media. Não estão no commit `dc4733341`.

**Consequência:** a suíte `test:e2e:mock` ficou **vermelha com 13 falhas** (desktop e
mobile), incluindo testes básicos. O sintoma é sempre o mesmo — o app redireciona para
`/login` (401) e a lista nunca pinta.

**A fonte auto-hospedada NÃO é a causa — provado por A/B:**

| | mesmo teste (`mensagens consecutivas…`, chromium-desktop) |
|---|---|
| com a minha mudança | **falha** |
| com a minha mudança **revertida** (Orçamento intacto) | **falha igual** |

O build continua a passar (8732 módulos transformados), então não é erro de sintaxe. O
código novo do Orçamento só chama `consultarProdutosOrcamento` em ação do utilizador, e
os testes que falham nem abrem o drawer — a causa não foi isolada, e **não deve ser
perseguida a partir desta sessão**: é trabalho em andamento de outra.

**Baseline conhecida antes dessas edições:** 12 passed / 1 failed (o flake do composer).

**Regra prática:** não commitar nem concluir nada sobre o e2e enquanto houver duas sessões
a escrever na mesma árvore. Validar o trabalho desta sessão exige a árvore estável.
