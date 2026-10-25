# Auditoria de produção — 24/10/2026

Primeira auditoria feita **contra o sistema no ar**, não contra o build local. Tudo
abaixo foi medido na mesma sessão, da máquina do Miguel, com o deploy de 23/10 20:18
já publicado (`index-BEYLyeJg.js` — confirmado idêntico ao `dist/` commitado, logo
C5/C6 estão em produção).

## O que já está resolvido (medido, não presumido)

| Item | Estado |
|---|---|
| Compressão (item A1 do backlog) | **Feito.** `Content-Encoding: zstd` no index.html e nos chunks |
| HTTP/2 e HTTP/3 | **Ativos.** `nextHopProtocol` = `h2` no HTML, `h3` em parte dos assets |
| `Cache-Control` dos assets com hash | **Correto.** `max-age=31536000, public, immutable` |
| C5/C6 (chunk de entrada) | **No ar.** 5 chunks, 127 kB transferidos, 356 kB descomprimidos |

## Achado 1 — a VPS está em Boston. É o maior custo do sistema.

`zapapi.wmsistemas.inf.br` → `2.24.112.129` → **Hostinger US, Boston**.

Medido no mesmo minuto, da mesma rede:

| Destino | Conexão nova | Ida-e-volta (conexão reusada) |
|---|---|---|
| API ZapERP (Boston) | **622 ms** | **168 ms** |
| Front ZapERP (mesma VPS) | 721 ms | 174 ms |
| gov.br (Brasília) | 200 ms | **38 ms** |

**~130 ms a mais por requisição e ~450 ms a mais na primeira conexão**, contra um host
no Brasil. Isso é pago por *toda* chamada de API, todo handshake de socket, todo asset.

Cascata real do boot em produção (primeira visita, celular 375×812):

```
DNS                      39 ms
TCP + TLS               340 ms   ← Boston
TTFB do index.html      180 ms   ← Boston
HTML baixado              4 ms   (zstd: o HTML não é o problema)
1º byte de JS pedido a  586 ms
últimos chunks em      1454 ms   ← 868 ms para buscar 127 kB
load                   1487 ms
```

TTFB **por chunk**: 160–390 ms. Os 127 kB levariam ~100 ms em qualquer banda decente;
levam 868 ms porque o custo é **latência, não banda**. Três dos seis recursos ficaram
514–681 ms só na fila, por causa da migração h2→h3 na primeira visita.

**Consequência:** otimizar mais o bundle tem retorno pequeno agora. Cortamos 238 kB de
parse e o boot continua gastando ~1 s em ida-e-volta. Mudar a VPS para uma região
brasileira (a Hostinger tem São Paulo) deve levar o boot de ~1487 ms para a faixa de
450–600 ms — **sem uma linha de código**. Nenhum item de código no backlog chega perto.

## Achado 2 — o index.html é cacheado sem revalidar, e os chunks antigos dão 404

Isto não é lentidão, é **instabilidade a cada deploy**.

Cabeçalhos do index.html em produção:

```
Date: Sat, 24 Oct 2026 05:53:32 GMT
Last-Modified: Fri, 23 Oct 2026 20:18:07 GMT
Etag: "6adbc0ff-3cae"
(sem Cache-Control, sem Expires)
```

Sem `Cache-Control`, o Chrome aplica cache **heurístico**: ~10% de
(`Date` − `Last-Modified`). Aqui, 9 h 35 min de idade → **~57 minutos** de validade. E a
janela *cresce* com a idade do arquivo: uma semana após o deploy, passa a ~17 horas.

Medido no browser, segunda visita: `index.html` veio do cache **sem revalidar**
(`transferSize === 0`).

E os chunks de deploys anteriores **não existem mais**:

```
index-5LynNNEP.js -> HTTP 404
index-BE1dsC-h.js -> HTTP 404
index-BtAAidGk.js -> HTTP 404
index-BEYLyeJg.js -> HTTP 200   (o atual)
```

A cadeia completa: deploy novo → atendente abre o app → index.html **velho** sai do
cache HTTP → aponta para hashes que agora dão 404 → erro de carregamento de chunk.
É exatamente a classe de bug registrada como "crash de chunk lazy (ERR_QUIC)".

O service worker mitiga **em parte**: `/assets/*` é cache-first, então chunks que o
atendente já visitou continuam funcionando. Mas:

- aparelho novo ou cache limpo → 404 direto;
- **chunk lazy ainda não visitado** → 404. E o item 5 tornou a `ConversaView` lazy no
  celular, o que *aumenta* a exposição a este caminho exato.

O SW faz `await fetch(req)` na navegação (`public/sw.js:50`) — `fetch` simples, que
passa pelo cache HTTP. Note que o próprio `install` já usa `fetch('/', { cache: 'reload' })`
(linha 146): o flag certo está no arquivo, só não está no caminho da navegação.

**Correção (duas partes, as duas pequenas):**

1. `Cache-Control: no-cache` no index.html — via campo de configuração nginx do Coolify:
   ```nginx
   location = /index.html { add_header Cache-Control "no-cache" always; }
   ```
   `no-cache` não é "não cacheie": é "cacheie, mas revalide sempre". Com o `Etag` que já
   existe, a revalidação devolve 304 e custa 1 ida-e-volta, não um download.
2. `public/sw.js:50` → `await fetch(req, { cache: 'no-store' })`, para o SW não depender
   do cabeçalho.

## Achado 3 — `zap-assets-v1` nunca é limpo

`public/sw.js:160-162` remove caches `zap-*` **cujo nome** não está em `manter`. Mas os
nomes são fixos (`zap-shell-v1`, `zap-assets-v1`), então nada é removido nunca. Cada
deploy acrescenta chunks com hash novo e os antigos ficam para sempre.

Escala medida: build atual tem **152 arquivos / 4,1 MB** em `dist/assets`; o histórico
tem **22.160 caminhos distintos em 839 deploys** (~26 arquivos novos por deploy).

O risco não é o espaço em si — é a **cota de armazenamento da origem**, compartilhada
com o outbox em IndexedDB (mensagens pendentes que precisam sobreviver ao F5) e com o
cache de áudios offline. Ao bater na cota, o browser pode despejar a origem inteira →
**mensagem pendente perdida**.

**Correção:** no `activate`, podar de `zap-assets-v1` as entradas que não são
referenciadas pelo shell recém-buscado. Mantém o offline funcionando e limita o
crescimento.

## Achado 4 — o backend fala com o próprio banco pelo hostname público, em HTTP

```
SUPABASE_URL=http://supabasekong-ukod8bqnmnvzlperbx2vjbow.2.24.112.129.sslip.io/
```

O Supabase é auto-hospedado **na mesma VPS** (o `sslip.io` codifica o próprio IP da
máquina), mas a API o alcança saindo pelo hostname público, em **HTTP sem TLS**, pelo
Traefik. Duas consequências:

- **DNS externo por conexão nova: 27–29 ms medidos** (276 ms na primeira, a frio).
- A `SERVICE_ROLE_KEY` — que bypassa todo o RLS — viaja **sem criptografia** no cabeçalho.
  Na mesma máquina o risco é contido, mas o caminho passa pelo IP público.

Além disso, **nenhum agent HTTP está configurado** (`grep` por `setGlobalDispatcher`,
`keepAlive`, `new Agent` em `config/`, `helpers/`, `services/`, `app.js`, `index.js`:
zero resultados). O cliente Supabase usa o `fetch` global, cujo `keepAliveTimeout`
padrão do undici é **4 segundos** — ociosidade maior que isso derruba a conexão e a
próxima query paga DNS + TCP + Traefik outra vez. O tráfego aqui é em rajada (chega um
webhook, disparam ~23 queries no módulo inbound, depois silêncio), que é o pior caso
para esse padrão.

**Honestidade sobre a medição:** tentei provar o efeito do keep-alive de fora e **não
consegui** — o jitter da rede até Boston (±30 ms) é maior que o efeito procurado. A
diferença `/health` vs `/health/detailed` (0 contra 1 query) deu 23 ms numa amostra de 12
e virou ruído numa amostra maior. Então: a **lacuna de configuração é fato**, a
**magnitude não está provada**. Para fechar isso precisa de uma medição de dentro da VPS.

**Correções, da mais segura para a menos:**

1. Apontar `SUPABASE_URL` para o hostname interno do Docker (ex.: `http://<container-kong>:8000`).
   Zero código, só variável de ambiente + restart. Elimina DNS externo, Traefik e o
   hairpin pelo IP público de uma vez.
2. Configurar keep-alive explícito. `node-fetch@2` **já está instalado** (não precisa de
   dependência nova) e aceita `agent`: um `http.Agent({ keepAlive: true, keepAliveMsecs,
   maxSockets })` passado no `global.fetch` de `config/supabase.js`.

## Ordem recomendada

| # | Ação | Ganho | Risco | Onde |
|---|---|---|---|---|
| 1 | `Cache-Control: no-cache` no index.html | Fim do chunk-404 pós-deploy | Nenhum | Coolify (nginx) |
| 2 | `cache: 'no-store'` na navegação do SW | Reforça o #1 | 1 linha | `public/sw.js:50` |
| 3 | `SUPABASE_URL` interno do Docker | −27 ms/conexão + chave deixa de ir em claro | Env + restart | Coolify |
| 4 | Poda do `zap-assets-v1` | Protege o outbox da cota | Baixo | `public/sw.js` activate |
| 5 | **VPS para região brasileira** | **−130 ms por requisição, boot ~1487 → ~500 ms** | Migração | Infra |
| 6 | keep-alive explícito no cliente Supabase | Não quantificado | Baixo | `config/supabase.js` |

O #5 é o de longe maior, e é o único que não é código. Os #1–#4 são pequenos e cabem
numa sessão.

## Medição que falta

Uma única execução **dentro da VPS** fecharia o achado 4:

```bash
# tempo de 20 queries seguidas vs 20 com 5s de ociosidade entre elas
time curl -s -o /dev/null "$SUPABASE_URL/rest/v1/empresas?select=id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
