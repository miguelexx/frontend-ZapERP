# Achado 2 — index.html cacheado sem revalidar (chunk 404 a cada deploy)

Duas partes: o **cabeçalho** (sua ação, no Coolify) e o **service worker** (feito, já no
código). As duas atacam o mesmo bug por caminhos independentes, de propósito: se uma
falhar, a outra ainda protege.

## O bug, medido

Cabeçalhos do index.html em produção:

```
Last-Modified: Fri, 23 Oct 2026 20:18:07 GMT
Etag: "6adbc0ff-3cae"
(nenhum Cache-Control, nenhum Expires)
```

Sem `Cache-Control`, o Chrome aplica cache **heurístico** — ~10% de
(`Date` − `Last-Modified`). Na medição: 9 h 35 min de idade → **~57 min** de validade, e a
janela cresce com a idade do arquivo (uma semana depois, ~17 h).

Comprovado no browser, segunda visita: o index.html veio do cache **sem revalidar**
(`transferSize === 0`).

E os chunks dos deploys anteriores já não existem:

```
index-5LynNNEP.js -> 404
index-BE1dsC-h.js -> 404
index-BtAAidGk.js -> 404
index-BEYLyeJg.js -> 200   (o atual)
```

**Cadeia:** deploy → atendente abre → HTML velho sai do cache → aponta para hashes
apagados → 404 → erro de carregamento de chunk. É a classe de bug já registrada como
"crash de chunk lazy (ERR_QUIC)".

O service worker mitiga em parte (`/assets/*` é cache-first, então chunk já visitado
funciona), mas **não** em aparelho novo nem para chunk lazy ainda não visitado — e o
item 5 do boot tornou a `ConversaView` lazy no celular, o que aumentou a exposição.

## Parte 1 — o cabeçalho (sua ação, no Coolify)

No campo de configuração nginx customizada da aplicação do **frontend**:

```nginx
location = /index.html {
    add_header Cache-Control "no-cache" always;
}
```

`no-cache` **não** significa "não cacheie": significa "cacheie, mas revalide sempre".
Com o `Etag` que já existe, a revalidação devolve **304** — custa uma ida-e-volta, não um
download. Os assets com hash continuam `immutable` e intocados.

Isto vai num **arquivo de configuração**, não no terminal. (Da última vez o trecho foi
colado direto no shell e deu `nginx: command not found` — o contêiner é construído pelo
Coolify, com `Mounts: []`, então a configuração entra pelo painel.)

Verificação depois do deploy:

```bash
curl -sS -o /dev/null -D - https://zaperp.wmsistemas.inf.br/ | grep -i cache-control
# esperado: Cache-Control: no-cache

# e a revalidacao deve devolver 304:
ETAG=$(curl -sS -o /dev/null -D - https://zaperp.wmsistemas.inf.br/ | grep -i etag | tr -d '\r' | cut -d' ' -f2)
curl -sS -o /dev/null -w '%{http_code}\n' -H "If-None-Match: $ETAG" https://zaperp.wmsistemas.inf.br/
# esperado: 304
```

## Parte 2 — o service worker (feito)

`public/sw.js` fazia `await fetch(req)` na navegação. É network-first, mas `fetch`
atravessa o cache HTTP — então "network-first" entregava o HTML velho. Agora:

```js
async function buscarIndexFresco(req) {
  try {
    const r = await fetch(req.url, { cache: 'no-store' })
    if (r && r.ok && !r.redirected && r.type !== 'opaqueredirect') return r
  } catch (_) {}
  return fetch(req)
}
```

**Por que o guard existe.** Passar um init rebaixa o `mode` de `'navigate'` para
`'same-origin'` (regra do construtor de `Request`), o que muda como redirecionamentos se
comportam numa navegação. Como este é o caminho que **abre o app, inclusive offline**,
qualquer resposta fora do esperado — não-ok, redirecionada ou opaca — e qualquer exceção
caem para `fetch(req)`, exatamente o comportamento anterior. **O pior caso desta função é
"nada mudou".**

Note que o `install` já usava `fetch('/', { cache: 'reload' })` (linha ~146): o flag certo
estava no arquivo, só não estava no caminho da navegação.

## Como foi verificado

**1. Prova direta do mecanismo** — servi o `dist/` construído num servidor local com os
cabeçalhos *idênticos* aos de produção (`Last-Modified` antigo, `Etag`, nenhum
`Cache-Control`) e medi no browser:

| Requisição ao index | transferSize | Veio de |
|---|---|---|
| `fetch('/', {cache:'reload'})` (semeia) | 15.834 | rede |
| `fetch('/')` normal | **0** | **CACHE** ← reproduz o bug |
| `fetch('/', {cache:'no-store'})` | 15.834 | **REDE** ← o fix |

**2. Teste unitário sobre o `sw.js` real** — `scripts/test-sw-index-fresco.mjs` carrega o
arquivo de verdade num escopo de service worker simulado (`node:vm`) e exercita o handler
de fetch registado. 10 asserções, incluindo os caminhos de queda e **o app abrir offline**.
Registado em `test:node` (54/54 passam).

**3. Teste de mutação** — 4 mutações, todas detectadas:

| Mutação | Resultado |
|---|---|
| remove o `no-store` | pegou |
| remove o guard de redirecionamento | pegou |
| remove o fallback `return fetch(req)` | pegou |
| reverte a navegação ao `fetch(req)` original | pegou |

**4. Build** — `npm run build` mudou **exatamente um arquivo** em `dist/`: `dist/sw.js`.
Todos os hashes de chunk ficaram idênticos (`index-BEYLyeJg.js` inalterado), como
esperado, já que só `public/` foi tocado.

### O que não foi possível verificar

O A/B **no nível do service worker** dentro do painel do browser: o registro falha em
`http://localhost` neste ambiente (`TypeError: ... An unknown error occurred when
fetching the script`), embora funcione na produção em https — lá o SW está registrado e
ativo, com os caches `zap-shell-v1` e `zap-assets-v1`. Por isso a verificação do
mecanismo foi feita no nível do `fetch` (item 1), que é onde o fix atua, e a do código do
SW pelo teste unitário sobre o arquivo real (item 2).

## Ordem de deploy

`dist/sw.js` é rastreado no git, então **sem rebuild o deploy fica inerte** — o build já
está feito e está no diff. E este achado deve ir **antes** do CDN do achado 1: um edge na
frente de um index.html sem `Cache-Control` cachearia o HTML velho e pioraria o bug.
