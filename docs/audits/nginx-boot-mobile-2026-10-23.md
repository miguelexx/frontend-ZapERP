# Nginx — itens 3 e 4 da auditoria de boot mobile

> Estes dois itens **não estão no repositório**: não existe `Dockerfile`, `nginx.conf`
> nem `docker-compose` versionado aqui. A config vive no servidor / no Coolify, então
> entram como SQL-style copiar-e-colar, não como commit.
>
> Servidor identificado em 2026-10-23: `nginx/1.31.8`, servindo `zaperp.wmsistemas.inf.br`.

---

## ⚠️ CORREÇÃO (23/10, medido) — o ganho do brotli é MENOR do que este doc dizia

Este documento afirmava "~60 kB gzip a menos no boot". **Estava errado**, por um erro de
método meu: eu media com `curl`, que pede `gzip`, e concluí que a produção servia gzip.
**O Chrome real já recebia `zstd`.**

Medido no ar, no chunk de entrada:

| codificação | bytes | |
|---|---|---|
| gzip | 114.850 | o que o curl pedia |
| **zstd** | **112.565** | **o que o navegador recebe hoje** |
| **br** | **99.156** | o melhor |

Somando os 7 ativos referenciados no `index.html`:

| | |
|---|---|
| hoje (zstd) | **219 kB** |
| com br preferido | **194 kB** |
| **ganho real** | **24 kB (11%)** |

Continua valendo a pena — é uma label — mas **não é o ganho de 60 kB**. E isso reordena A:
o **`Cache-Control` (A2) passa a ser o item mais valioso dos dois**, porque não é
velocidade e sim correção: sem ele o browser pode servir um `index.html` velho apontando
para chunks que já não existem.

**Lição de método:** `curl --compressed` e `-H "Accept-Encoding: gzip, br"` NÃO
representam um navegador. Para medir o que o utilizador recebe, usar o header real:
`-H "Accept-Encoding: gzip, deflate, br, zstd"`.

---

## 🗺️ A INFRA, identificada em 23/10

```
internet
  └─ coolify-proxy  (traefik:v3.6)        :80 :443  ← borda, faz o TLS e o h3
       └─ gk5v42tffnqyjrhcrjc71rcq-…      :80       ← ESTE serve o frontend
            nginx/1.31.8  (imagem construida pelo Coolify)
```

Identificado pela versão: o header de produção diz `Server: nginx/1.31.8` e só esse
container responde essa versão. (Há um segundo nginx, `p8cwdjxp5em2rki0wj0ye09t-…` com
1.31.6, que é outro site — não é o nosso.)

Orquestração: **Coolify 4.0.0**. A imagem tem nome gerado (`gk5v42…:<sha>`), ou seja, foi
construída pelo Coolify a partir do repo — e **não há Dockerfile versionado**. Logo a
config do nginx é gerada pelo build do Coolify, e mudança feita com `docker exec` **se
perde no próximo deploy**.

**Dois caminhos possíveis, e o diagnóstico decide qual:**

1. **Traefik** (borda) — o v3 tem middleware `compress` com suporte a **brotli**, aplicável
   por label, sem tocar na imagem do site. Bom para A1.
2. **Config do nginx via Coolify** — o painel permite config customizada para site
   estático; é o caminho natural para o `Cache-Control` do `index.html` (A2), que o
   Traefik faria de forma mais desajeitada por ser por caminho.

Descobrir quem comprime hoje:

```bash
C=gk5v42tffnqyjrhcrjc71rcq-183613405703
docker exec $C sh -c 'nginx -V 2>&1' | tr ' ' '
' | grep -iE "brotli|gzip_static"
docker exec $C sh -c 'nginx -T 2>/dev/null | grep -iE "gzip|brotli|add_header|location"'
docker inspect $C --format '{{json .Mounts}}'
docker inspect $C --format '{{json .Config.Labels}}' | tr ',' '
' | grep -i traefik
```

- Se o `nginx -T` mostrar `gzip on` → quem comprime é o nginx do site.
- Se não mostrar → quem comprime é o Traefik, e o brotli se resolve lá.
- `Mounts` vazio = config assada na imagem (tem de ir pelo Coolify).

---

## ⚠️ ONDE O NGINX VIVE (descoberto em 23/10)

`nginx -V` no host responde **"Command 'nginx' not found"** — o nginx **não está
instalado na VPS**, roda dentro de um container. O header `Server: nginx/1.31.8` sai de
lá, atravessando um proxy de borda (os dois domínios respondem `Alt-Svc: h3=":443"`,
inclusive a API, que não manda `Server`).

Consequência prática: **editar a config dentro do container à mão NÃO persiste** — some
no próximo deploy. A mudança tem de ser feita na origem (imagem, volume montado, ou a
configuração do painel que gera o container).

Nada disso está versionado neste repo: não há Dockerfile, docker-compose, nginx.conf nem
nixpacks. Antes de aplicar o bloco abaixo, descubra o container:

```bash
docker ps --format 'table {{.Names}}	{{.Image}}	{{.Ports}}'

for c in $(docker ps -q); do
  printf '%s  ->  ' "$(docker inspect -f '{{.Name}} [{{.Config.Image}}]' $c)"
  docker exec "$c" sh -c 'nginx -v' 2>&1 | head -1
done
```

O container que responder a versão do nginx é o alvo. Depois:

```bash
docker exec <container> sh -c 'nginx -V 2>&1' | tr ' ' '
' | grep -iE "brotli|gzip_static"
docker exec <container> sh -c 'nginx -T 2>/dev/null | head -60'
docker inspect <container> --format '{{json .Mounts}}'
```

O `Mounts` diz se a config vem de um volume (editável e persistente) ou está assada na
imagem (precisa mudar a origem do build).

---

## ⚡ PARA APLICAR AGORA (resumo — o resto do doc é a justificativa)

**Passo 1 — descobrir se este nginx tem brotli:**

```bash
nginx -V 2>&1 | tr ' ' '
' | grep -iE "brotli|gzip_static|http_v3"
```

**Passo 2 — colar no `server { }` do site:**

```nginx
# ── index.html: sempre revalidar. Hoje o nginx nao manda Cache-Control
#    nenhum, so ETag, e o browser cai em cache heuristico — pode servir um
#    HTML velho apontando para chunks que ja nao existem.
#    `no-cache` guarda e revalida (304 barato). NAO use `no-store`.
location = /index.html {
    add_header Cache-Control "no-cache" always;
    etag on;
}

# ── SPA: /atendimento, /crm, ... tambem devolvem o index
location / {
    try_files $uri $uri/ /index.html;
}

# ── assets com hash: JA ESTA CORRETO, nao mexer
location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

# ── compressao
gzip             on;
gzip_comp_level  5;
gzip_min_length  1024;
gzip_vary        on;
gzip_types       text/plain text/css text/xml application/javascript
                 application/json application/xml application/manifest+json
                 image/svg+xml font/woff2;

# ↓↓↓ SO se o passo 1 mostrou brotli. Senao, apague estas 5 linhas. ↓↓↓
brotli            on;
brotli_comp_level 5;
brotli_min_length 1024;
brotli_types      text/plain text/css text/xml application/javascript
                  application/json application/xml application/manifest+json
                  image/svg+xml font/woff2;
```

**Passo 3 — recarregar e conferir:**

```bash
nginx -t && nginx -s reload
curl -sS -D - -o /dev/null -H "Accept-Encoding: gzip, br" https://zaperp.wmsistemas.inf.br/assets/index-CO3BeIxG.js | grep -i content-encoding
curl -sS -D - -o /dev/null https://zaperp.wmsistemas.inf.br/ | grep -i cache-control
```

Esperado: `content-encoding: br` (ou `gzip` se o modulo nao existir) e `cache-control: no-cache`.

> `font/woff2` entrou na lista porque a Inter passou a ser auto-hospedada em
> 23/10. woff2 ja e comprimido — o ganho e' nulo e o `gzip_min_length` cuida
> disso; esta' na lista so' para nao haver duvida se alguem a mover.

---

## Antes de aplicar: descobrir o que esse nginx tem

```bash
nginx -V 2>&1 | tr ' ' '\n' | grep -iE "brotli|gzip_static|http_v2"
```

- Aparece `--add-module=.../ngx_brotli` ou `--with-http_brotli` → **use o bloco A**.
- Não aparece brotli, mas aparece `http_gzip_static_module` → **use o bloco B**.
- Não aparece nenhum → **bloco C** (só melhora o gzip dinâmico, sem módulo novo).

O `Cache-Control` do `index.html` (item 4) é igual nos três casos e é o mais importante
dos dois — aplique mesmo que o brotli fique para depois.

---

## Item 4 — `Cache-Control` no `index.html` (aplicar sempre)

**Problema medido:** o nginx devolve o `index.html` **sem nenhum header `Cache-Control`**
— só `ETag` e `Last-Modified`:

```
HTTP/1.1 200 OK
Etag: "6ada737b-7d9"
Last-Modified: Thu, 22 Oct 2026 20:35:07 GMT
Content-Encoding: gzip
(nenhum Cache-Control)
```

Sem `Cache-Control`, o browser aplica cache **heurístico** (tipicamente 10% da idade do
`Last-Modified`): pode servir um `index.html` velho, que aponta para chunks que já não
existem — o sintoma de "tela branca depois do deploy" que o
`runtime/vitePreloadRecovery.js` existe para remediar.

O comentário dentro do próprio `index.html` diz que *"a politica autoritativa tambem deve
ser enviada pelo Nginx"*. Não está sendo. E o `<meta http-equiv="Cache-Control">` que
está lá **é ignorado pelos browsers** para o documento — não substitui o header.

**Importante:** o certo é `no-cache`, **não** `no-store`.
- `no-cache` = guarda, mas revalida sempre. Se nada mudou, volta `304` com ~0 bytes.
- `no-store` = proíbe guardar. Toda entrada rebaixa o HTML inteiro de novo, sem 304.

```nginx
# index.html: sempre revalidar (304 barato), nunca servir versao velha.
location = /index.html {
    add_header Cache-Control "no-cache" always;
    etag on;
}

# Fallback do SPA: a navegacao para /atendimento, /crm, ... tambem devolve o index.
location / {
    try_files $uri $uri/ /index.html;
}

# Os assets com hash no nome ja estao corretos — confirmado em producao:
#   Cache-Control: max-age=31536000, public, immutable
# NAO mexer neste bloco.
location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}
```

---

## Item 3 — Brotli

**Problema medido:** pedindo `Accept-Encoding: gzip, br`, o servidor respondeu
`Content-Encoding: gzip` em todos os assets. Brotli não está ligado.

Ganho real, medido nos arquivos de produção (`brotli -q 11` vs `gzip -9`):

| Arquivo | gzip | brotli | economia |
|---|---|---|---|
| `index-BtAAidGk.js` | 105 KB | **87 KB** | −18 KB |
| `ConversaView-BBShj7GC.js` | 124 KB | **100 KB** | −24 KB |
| `conversa-CcOmjCG0.css` | 54 KB | **42 KB** | −12 KB |
| `vendor-react` | 44 KB | **38 KB** | −6 KB |
| `chatList.js` + `.css` | 63 KB | **54 KB** | −9 KB |
| `index.css` | 16 KB | **14 KB** | −2 KB |

**~60 KB a menos no boot**, sem tocar em uma linha de código.

### Bloco A — nginx com `ngx_brotli`

```nginx
brotli              on;
brotli_comp_level   5;      # dinamico: 5 e' o ponto de equilibrio CPU/tamanho
brotli_min_length   1024;
brotli_static       on;     # serve .br pre-comprimido quando existir (custo zero)
brotli_types
    text/plain text/css text/xml
    application/javascript application/json application/xml
    application/manifest+json image/svg+xml;

# Mantenha o gzip ligado como fallback para quem nao anuncia br.
gzip                on;
gzip_comp_level     5;
gzip_min_length     1024;
gzip_vary           on;
gzip_static         on;
gzip_types
    text/plain text/css text/xml
    application/javascript application/json application/xml
    application/manifest+json image/svg+xml;
```

> `brotli_static on` + `gzip_static on` só funcionam se os arquivos `.br`/`.gz`
> existirem ao lado dos originais. Para gerá-los no build, ver a seção final.

### Bloco B — sem brotli, mas com `gzip_static`

```nginx
gzip            on;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_vary       on;
gzip_static     on;   # usa o .gz pre-comprimido no nivel 9, sem gastar CPU por request
gzip_types
    text/plain text/css text/xml
    application/javascript application/json application/xml
    application/manifest+json image/svg+xml;
```

### Bloco C — nginx pelado

```nginx
gzip            on;
gzip_comp_level 6;    # o default e' 1; subir para 6 ja' tira bytes reais
gzip_min_length 1024;
gzip_vary       on;
gzip_types
    text/plain text/css text/xml
    application/javascript application/json application/xml
    application/manifest+json image/svg+xml;
```

---

## Opcional — pré-comprimir no build (melhor dos dois mundos)

Com `brotli_static`/`gzip_static` ligados, dá para comprimir **uma vez**, no build, no
nível máximo, e o nginx só serve o arquivo pronto — zero CPU por request e bytes menores
que qualquer compressão dinâmica.

Rodar depois do `npm run build`, dentro de `frontend/`:

```bash
find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.svg' -o -name '*.webmanifest' \) \
  -exec sh -c 'gzip -9 -k -f "$1"; command -v brotli >/dev/null && brotli -q 11 -f "$1"' _ {} \;
```

Isto cria `arquivo.js.gz` e `arquivo.js.br` ao lado de cada `arquivo.js`. O nginx escolhe
sozinho pelo `Accept-Encoding` do cliente.

Se adotar, vale lembrar que `dist/` é versionado neste repo — os `.gz`/`.br` vão aparecer
no `git status`.

---

## Como conferir depois de aplicar

```bash
# brotli ativo?
curl -s -D - -o /dev/null -H "Accept-Encoding: gzip, br" \
  https://zaperp.wmsistemas.inf.br/assets/index-BtAAidGk.js | grep -i "content-encoding\|content-length"
# esperado: content-encoding: br

# Cache-Control do index?
curl -s -D - -o /dev/null https://zaperp.wmsistemas.inf.br/ | grep -i "cache-control"
# esperado: cache-control: no-cache

# assets continuam immutable?
curl -s -D - -o /dev/null https://zaperp.wmsistemas.inf.br/assets/vendor-react-DOBzNqAb.js | grep -i "cache-control"
# esperado: max-age=31536000, public, immutable
```
