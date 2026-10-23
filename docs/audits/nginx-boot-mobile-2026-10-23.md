# Nginx — itens 3 e 4 da auditoria de boot mobile

> Estes dois itens **não estão no repositório**: não existe `Dockerfile`, `nginx.conf`
> nem `docker-compose` versionado aqui. A config vive no servidor / no Coolify, então
> entram como SQL-style copiar-e-colar, não como commit.
>
> Servidor identificado em 2026-10-23: `nginx/1.31.8`, servindo `zaperp.wmsistemas.inf.br`.

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
