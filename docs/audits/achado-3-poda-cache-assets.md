# Achado 3 — o cache de assets do service worker nunca era limpo

Implementado. Só código, nenhuma ação sua.

## O bug

`public/sw.js`, no `activate`:

```js
const manter = new Set([CACHE_SHELL, CACHE_ASSETS])
const nomes = await caches.keys()
await Promise.all(
  nomes.filter((n) => n.startsWith('zap-') && !manter.has(n)).map((n) => caches.delete(n))
)
```

Isto remove caches cujo **nome** não está em `manter`. Mas os nomes são fixos
(`zap-shell-v1`, `zap-assets-v1`), então **nada saía nunca**. O comentário original já
dizia a intenção — "bump de `CACHE_SHELL`/`CACHE_ASSETS` limpa tudo" — só que o bump nunca
aconteceu, e cada deploy acrescentava chunks com hash novo que ficavam para sempre.

Escala medida: o build atual tem **152 arquivos / 4,1 MB** em `dist/assets`; o histórico
do git tem **22.160 caminhos distintos em 839 deploys** (~26 arquivos novos por deploy).
O service worker só guarda o que é de fato buscado, mas nada é removido.

## Por que isso importa (não é o espaço)

O risco é a **cota de armazenamento da origem**, que é compartilhada com:

- o **outbox em IndexedDB** — mensagens pendentes que precisam sobreviver ao F5;
- o **cache de áudios offline**.

Ao bater na cota, o browser pode despejar a origem **inteira**. Ou seja: um cache de
assets sem limite pode custar uma **mensagem pendente perdida**.

## A correção

Teto de 120 entradas, podando as mais antigas primeiro, no `activate` — isto é, **uma vez
por atualização do SW**, nunca no caminho quente:

```js
const MAX_ASSETS_EM_CACHE = 120
```

Duas decisões que importam:

1. **Perder uma entrada aqui nunca é erro de correção.** O handler de `/assets/*` é
   cache-first com queda para a rede, então uma entrada removida é só um download a mais.
   É isso que torna a poda segura.
2. **O caminho do boot é protegido.** Os assets que o HTML do shell referencia (chunk de
   entrada, vendors pré-carregados, CSS) ficam fora da poda, mesmo sendo os mais antigos
   do cache — removê-los obrigaria a baixar o essencial outra vez, ou, offline, impediria
   abrir o app. `cache.keys()` devolve por ordem de inserção, que é o que dá o
   "mais antigo primeiro".

## Verificação

`scripts/test-sw-asset-cache-prune.mjs` carrega o `sw.js` **real** num escopo de service
worker simulado (`node:vm`, com um cache que preserva ordem de inserção como a Cache API)
e dispara o `activate`. **12 asserções:**

- abaixo do teto e no teto exato: não remove nada;
- acima do teto: fica exatamente 120, removendo os mais antigos, e o mais recente sobrevive;
- os assets do shell sobrevivem apesar de serem os mais antigos;
- caches com nome antigo continuam a ser apagados (não regredir o comportamento que existia);
- storage quebrado: o `activate` não lança e `clients.claim()` ainda corre.

**Teste de mutação — 5 mutações, todas detectadas:**

| Mutação | Resultado |
|---|---|
| não chama a poda no `activate` | pegou |
| ignora a proteção do shell (poda o caminho do boot) | pegou |
| poda os mais **recentes** em vez dos mais antigos | pegou |
| falha de storage deixa de ser contida | pegou |
| remove o retorno antecipado do teto | pegou |

A última merece nota: na primeira passagem ela **não** foi detectada, porque é um
*mutante equivalente* — sem o retorno antecipado, `Math.min(n, negativo)` deixa o laço sem
iterações e o comportamento observável é idêntico. O guard existe para não pagar a leitura
do shell em cada `activate` quando não há nada a podar, então acrescentei uma asserção
sobre isso (`no teto exato: nao le o shell`), o que tornou a mutação detectável e
documentou a intenção. Registar "4 de 5" sem explicar seria esconder o motivo.

Suíte do frontend: **55/55** scripts Node.
