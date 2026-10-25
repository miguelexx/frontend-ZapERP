# Achado 1 — plano de execução (latência da VPS em Boston)

Este é o único item da auditoria de 24/10 que **não é código**. Não executei nada aqui:
mexer em DNS e em hospedagem de produção é ação sua. O que segue é o plano medido, com
os riscos levantados do DNS real do domínio.

## O número a bater

Medido de sua máquina, mesmo minuto, mesma rede:

| Origem | Conexão a frio | Ida-e-volta (reusada) | POP |
|---|---|---|---|
| VPS ZapERP (Boston) | **744 ms** | **197 ms** | — |
| Cloudflare | 218 ms | 86 ms | **GRU** (Guarulhos) |
| Cloudflare cdnjs | 306 ms | 95 ms | **GRU** |
| Fastly (jsDelivr) | 231 ms | 102 ms | **GRU** |
| Netlify | 205 ms | 83 ms | — |

Um edge em São Paulo economiza **~525 ms na primeira conexão** e **~110 ms por
requisição**. O boot medido em produção (1487 ms) é **inteiramente estático** — nenhuma
chamada de API entra nele antes do login. Logo o CDN captura quase todo o ganho do boot
*sem migrar nada*.

## Por que CDN primeiro, e não migrar a VPS

| | CDN na frente do front | Migrar a VPS para o Brasil |
|---|---|---|
| Resolve o boot (a queixa original) | **Sim** | Sim |
| Resolve as chamadas de API durante o uso | Não | **Sim** |
| Risco | Baixo — 1 registro DNS, reversível em minutos | Alto — migrar app, banco auto-hospedado, mídia, webhooks |
| Tempo | Horas | Dias, com janela de indisponibilidade |

O CDN é o primeiro passo porque resolve exatamente o que você relatou ("lento ao entrar
no app pelo celular") com risco baixo e rollback de um registro. A migração da VPS
continua valendo depois, para as chamadas de API durante o atendimento — mas é um
projeto, não uma tarefa.

## Pré-requisito verificado: o front é 100% estático

A origem do frontend serve apenas `assets/`, `brand/`, `index.html`,
`manifest.webmanifest`, `service-worker.js`, `sw.js` e `wa-chat-pattern.svg`. A API é
absoluta via `VITE_API_URL` (subdomínio separado, `zapapi`), e o service worker só
intercepta mesma-origem estática (`sw.js:43`). Não há uma única chamada de API
mesma-origem. **Nada no código precisa mudar para o CDN entrar.**

## Risco que elimina a opção óbvia: o domínio tem e-mail ativo

```
NS    ns1/ns2.dns-parking.com        (Hostinger)
MX    mx1.hostinger.com (5), mx2.hostinger.com (10)
TXT   v=spf1 include:_spf.mail.hostinger.com ~all
A     wmsistemas.inf.br      → 72.60.147.139   (outro servidor, não a VPS)
A     www                    → 72.60.147.139
A     zaperp                 → 2.24.112.129    (a VPS)
A     zapapi                 → 2.24.112.129    (a VPS)
CNAME autodiscover           → autodiscover.mail.hostinger.com
```

O plano gratuito da Cloudflare **exige delegação de nameservers**, o que obrigaria a
recriar MX, SPF, autodiscover, o A da raiz e o do www. Esquecer um → **correio quebra**.

→ **Não delegue nameservers.** Use um CDN que aceite CNAME (Bunny.net, Fastly,
CloudFront, Cloudflare Pages/Netlify como host). Assim o único registro tocado é
`zaperp`; raiz, www, MX, SPF e autodiscover ficam intactos.

## Ordem correta: achado 2 **antes** do CDN

Você pediu achado 1 e depois achado 2, mas há um motivo técnico para inverter a ordem de
*deploy*: hoje o `index.html` vai sem `Cache-Control` (achado 2). Colocar um CDN na
frente desse cabeçalho faz o edge cachear o HTML velho e **amplia** o bug — além de
piorar, passa a exigir purga no CDN para corrigir. Então:

1. Deploy do achado 2 (`Cache-Control: no-cache` + `no-store` no SW) — já implementado.
2. Confirmar em produção que o `index.html` passou a revalidar.
3. Só então subir o CDN.

## Passos (CNAME, sem tocar em e-mail)

1. **Baixar o TTL** do registro `zaperp` para 300 s no painel Hostinger e esperar o TTL
   antigo expirar. Isso é o que torna o rollback rápido.
2. **Criar `origin-zaperp.wmsistemas.inf.br`** → A `2.24.112.129`.
3. **No Coolify**, adicionar `origin-zaperp.wmsistemas.inf.br` como domínio **adicional**
   da aplicação do frontend (mantendo `zaperp`), para o Traefik emitir certificado e
   rotear. Confirmar antes de seguir:
   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' https://origin-zaperp.wmsistemas.inf.br/
   ```
4. **Criar a pull zone** no CDN com origem `https://origin-zaperp.wmsistemas.inf.br`,
   hostname `zaperp.wmsistemas.inf.br`, e habilitar o POP de São Paulo.
5. **Regras de cache no edge** — esta é a parte que não pode sair errada:

   | Caminho | Regra |
   |---|---|
   | `/assets/*` | Cachear agressivamente (já vêm `immutable` + hash no nome) |
   | `/brand/*`, `wa-chat-pattern.svg` | Cachear |
   | `/`, `/index.html` | **Respeitar a origem** (que agora manda `no-cache`) |
   | `/sw.js`, `/service-worker.js` | **Nunca cachear no edge** |
   | `/manifest.webmanifest` | Não cachear |

   O `sw.js` fora dessa lista é o erro que congela o service worker de todos os
   atendentes numa versão antiga, sem jeito fácil de reverter.
6. **Trocar `zaperp`** de A para CNAME → hostname da pull zone.
7. **Verificar** (não confie no painel):
   ```bash
   # o POP respondeu? deve mostrar um header do CDN e, idealmente, GRU
   curl -sS -o /dev/null -D - https://zaperp.wmsistemas.inf.br/ | grep -iE 'cf-ray|x-cache|server|cache-control'

   # o index.html revalida? (deve continuar no-cache, vindo do edge)
   curl -sS -o /dev/null -D - https://zaperp.wmsistemas.inf.br/ | grep -i cache-control

   # o sw.js NAO esta cacheado no edge?
   curl -sS -o /dev/null -D - https://zaperp.wmsistemas.inf.br/sw.js | grep -iE 'x-cache|cf-cache-status'
   ```
   E repetir a medição do boot para comparar com os 1487 ms de referência.
8. **Rollback**, se algo sair errado: voltar `zaperp` de CNAME para A `2.24.112.129`.
   Com TTL 300 s, volta ao estado atual em ~5 minutos. É por isso que o passo 1 vem
   primeiro.

## O que o CDN não resolve

As chamadas de API durante o atendimento continuam indo a Boston a ~168 ms cada
(`/me`, `/permissoes`, `/empresa`, `/chats`, abrir conversa, enviar mensagem). Para
essas, só a migração da VPS resolve — e aí entram o Supabase auto-hospedado na mesma
máquina, as URLs de webhook do Whapi/UltraMSG e a mídia. Fica como projeto separado,
depois que o boot estiver resolvido e medido.

---

## Como confirmar isto (sem tocar em DNS e sem risco)

### Primeiro, o limite da medicao da tabela acima

Aquela tabela comparou a latencia ate **sites da propria Cloudflare/Fastly/Netlify** contra
a latencia ate a VPS. Isso prova que existe edge perto de voce em GRU — **nao** prova o
ganho ponta a ponta dos *seus* arquivos. Sao coisas diferentes, e eu as tratei como se
fossem a mesma; o numero "86 ms contra 197 ms" vinha de comparar homepages, nao assets.

Medicao melhor, com arquivos de tamanho praticamente igual (43 kB contra 42 kB):

| | A frio | Conexao reusada |
|---|---|---|
| ZapERP `index-BEYLyeJg.js`, 43 kB (Boston) | **1091 ms** (TTFB 697 ms) | **198 ms** |
| `react-dom.production`, 42 kB (edge GRU) | **176 ms** (TTFB 173 ms) | **47 ms** |

Ou seja **6,2× a frio** e **4,2× no reuso** — numeros maiores que os que eu tinha dito, e
agora comparando coisas comparaveis. Ainda assim, continuam a ser *outro* arquivo: o
`react-dom` e um dos arquivos mais pedidos da internet, logo esta sempre em cache quente.

### O que fica em aberto, e e' o que o teste tem de responder

Um CDN so' e' rapido no **cache HIT**. No MISS, o edge vai buscar a Boston e ainda
acrescenta um salto — fica **pior** que hoje. Com poucos atendentes, a pergunta real nao e'
"o edge e' rapido?" (e, e esta medido) e sim **"a taxa de acerto vai ser boa?"**.

Argumento a favor: os assets tem hash no nome e sao imutaveis, logo o TTL do edge pode ser
de um ano. Como praticamente todos os atendentes caem no mesmo POP (GRU), o **primeiro**
acesso depois de cada deploy paga origem + edge, e todos os seguintes pegam HIT. Mas isto e'
previsao; o teste abaixo mede.

### O teste (reversivel, nenhum registro DNS tocado)

A chave: **nao e' preciso apontar `zaperp` para nada.** As pull zones dao um hostname
proprio, e voce usa esse hostname no teste.

1. Criar uma pull zone no CDN (Bunny, por exemplo) com:
   - **origem**: `https://zaperp.wmsistemas.inf.br` (o hostname atual, como esta)
   - **POP**: habilitar America do Sul / Sao Paulo
   - nenhum hostname customizado, nenhum DNS
2. O CDN devolve algo como `zaperp-teste.b-cdn.net`. Confirme que serve o mesmo conteudo:
   ```bash
   curl -sS -o /dev/null -w '%{http_code}
' https://zaperp-teste.b-cdn.net/assets/index-BEYLyeJg.js
   ```
3. Medir, com os **seus** arquivos do boot (o script le os caminhos do `dist/index.html`):
   ```bash
   node scripts/medir-cdn.mjs zaperp.wmsistemas.inf.br zaperp-teste.b-cdn.net
   ```
4. **Rodar duas vezes.** A primeira passagem e' MISS por definicao (o edge ainda nao tem o
   arquivo) e pode sair pior que a origem. A segunda e' o regime real. O script avisa se
   nunca viu `HIT` — e, se nunca vir, o ganho nao existe e o plano morre aqui, que e'
   exatamente para isso que o teste serve.
5. Apagar a pull zone. Nada mais foi alterado.

### Referencia a bater

Hoje, da sua maquina, os 7 caminhos do boot somam **1500 ms** com conexao reusada
(`/` 223 ms, entry 207 ms, vendor-react 247 ms, vendor-router 170 ms, vendor-state 204 ms,
vendor-axios 244 ms, CSS 204 ms). Se o CDN em HIT nao baixar isso para a faixa dos 300-500 ms,
o ganho nao e' o que eu projetei e a migracao da VPS volta a ser o caminho.

O script foi validado comparando a origem **contra ela mesma**: deu 0,9x-1,2x por caminho e
19 ms de diferenca no total, ou seja, ele mede o ruido como ruido e nao tem vies embutido.
