# Backlog de melhorias — consolidado em 23/10/2026

> Tudo que ainda falta, numa lista só. Cada item diz **onde roda**, **o ganho**, **o risco**
> e **a evidência** — e foi reverificado hoje, não copiado de doc antigo.
>
> Já feito (não está aqui): esqueleto de boot, preconnect da API, ConversaView adiado no
> celular, 1ª página do boot 250→40, permissões em paralelo, Inter auto-hospedada, e o fix
> do boot da API sem `OPENAI_API_KEY`.

## Onde o boot está hoje (medido no `dist` atual)

| | |
|---|---|
| janela crítica mobile | **331 kB gzip** (entrada+vendors+css+fonte 255 + lista 76) |
| `ConversaView` | 183 kB gzip — **adiado** no celular |
| **JS bruto parseado antes do 1º render** | **634 kB** ← é isto que o item 1 ataca |

---

# A — Servidor (zero linha de código)

> **ENTREGUE 23/10:** bloco único de copiar-colar no topo de
> [`nginx-boot-mobile-2026-10-23.md`](nginx-boot-mobile-2026-10-23.md).
> Falta só aplicar no servidor — não tenho acesso a ele.

### 1. Brotli no nginx
**Ganho REAL (corrigido 23/10): 24 kB (11%)** nos ativos do boot. O "~60 kB" anterior
estava errado: eu comparava com gzip, mas o Chrome **já recebe zstd** (219 kB hoje → 194 kB
com br). O brotli já funciona no Traefik; falta só mandá-lo preferir br.
**Risco:** nenhum. **Esforço:** minutos.
**Evidência (hoje):** `Content-Encoding: gzip` mesmo pedindo `br`.
**Como:** [`nginx-boot-mobile-2026-10-23.md`](nginx-boot-mobile-2026-10-23.md).

### 2. `Cache-Control: no-cache` no `index.html`
**Ganho:** deploy consistente + revalidação barata (304 com ~0 bytes). Hoje o browser usa cache heurístico e pode servir um HTML velho apontando para chunks que já não existem — é o sintoma que o `vitePreloadRecovery.js` existe para remediar.
**Risco:** nenhum (é `no-cache`, **não** `no-store`). **Esforço:** minutos.
**Evidência (hoje):** só `ETag`, nenhum `Cache-Control`.

---

# B — Banco (Supabase SQL Editor)

> **ENTREGUE 23/10:** duas migrations escritas em `backend/supabase/migrations/`:
> `20261023180000_indices_lista_nulls_last.sql` e
> `20261023181000_webhook_logs_retencao.sql`.
> Schema conferido contra `supabase/schema.sql`. **SQL NÃO executado** — não há
> Postgres nesta máquina e o MCP do Supabase aponta para outro projeto.

### 3. Índice `NULLS LAST` da lista
**Ganho:** `GET /chats` deixa de ordenar o conjunto filtrado inteiro em cada página.
**Risco:** baixo. **Esforço:** 1 migration.
**Evidência:** a lista ordena `ultima_atividade DESC NULLS LAST` (`conversationListController.js:675`), e `idx_conversas_company_atividade_id` é `DESC` (= NULLS FIRST) → índice não elegível. Proposto no doc 29 do backend, **nunca virou migration** (0 arquivos em `supabase/migrations/`).

### 4. Retenção de `webhook_logs`
**Ganho:** a tabela tem **9 índices** e leva 1 INSERT por webhook; ACKs são 2-3× o volume de mensagens. Sem retenção, cresce para sempre e encarece toda escrita.
**Risco:** baixo (job de limpeza). **Esforço:** 1 job/pg_cron.
**Evidência (hoje):** existe `mediaRetentionService` para mídia, **nada** para `webhook_logs`.

---

### 4b. ⭐ NOVO (medido 23/10) — `conversas` tem índice demais, e o PLANNING virou o gargalo

Os EXPLAIN de confirmação dos índices mostraram, nas três consultas, o tempo de
**planejamento** passando muito o de execução:

| consulta | planning | execução | razão |
|---|---|---|---|
| `atendimentos` | 1,440 ms | 0,136 ms | 10× |
| `conversa_unreads` | 0,923 ms | 0,115 ms | 8× |
| **`conversas`** | **4,111 ms** | 0,278 ms | **15×** |

São **4 ms de planejamento em toda consulta a `conversas`** — mais do que ler os dados.
A causa é o número de índices da tabela (~35, doc 29 §3): o planner avalia todos antes
de escolher. Com a base pequena (32 mil linhas), este passou a ser o maior custo da query.

**Passo 1 (barato e seguro, agora):** `VACUUM (ANALYZE) public.conversas;` — o
`Heap Fetches: 29` no Index Only Scan mostra visibility map desatualizado.

**Passo 2 (daqui a alguns dias, com evidência):** listar `idx_scan` por índice e dropar
os mortos. Cada índice removido alivia o planning de TODA query e o custo de escrita de
TODA mensagem (o UPDATE de `ultima_atividade` mantém todos). Query e ressalvas estão no
rodapé de `backend/supabase/migrations/20261023180000_indices_lista_nulls_last.sql`.

---

# C — Frontend · velocidade

> **STATUS 23/10 (fim do dia):** C5 e C6 **APLICADOS**. C7 **FECHADO** (a "melhoria"
> reintroduziria bug corrigido). C8 continua válido mas pede sessão dedicada (60 usos).
> C9 e C12 **não feitos de propósito** (risco alto / decisão de produto). C10 e C11 com
> ganho que não justifica o churn. Detalhe e números em `docs/ai-handoff/12-PERFORMANCE.md`.
>
> | | antes | depois |
> |---|---|---|
> | chunk de entrada (fonte) | 858 kB / 82 módulos | **328 kB / 51 (−62%)** |
> | chunk de entrada (build) | 392,62 kB / 109,73 gzip | **145 kB / 42,55 gzip** |
> | **JS bruto antes do 1º render** | **634 kB** | **396 kB (−38%)** |
> | janela crítica mobile | 331 kB gzip | **267 kB gzip** |
>
> Bónus não previsto: `vendor-socket` **saiu da lista de preload do HTML** (eram 6 arquivos,
> agora 5) — o socket.io só chega pelo `import()` dinâmico.



### 5. Item 10 — as 3 arestas do chunk de entrada ⭐
**Ganho:** 82 → 49 módulos, 858 → **356 kB de fonte (−59%)**. É o **único item que reduz os 634 kB brutos** que o celular parseia antes do 1º render — num Android intermediário, centenas de ms de main thread.
**Risco:** **médio** — mexe no handler de 401 (`api/http.js`), no `push/swBridge.js` e no boot do socket (`authStore.restore()`).
**A objeção já caiu:** medi que, com os cortes, o caminho do prefetch **não arrasta mais o motor**, então o `GET /chats` sai na mesma hora.
**Desenho seguro:** módulo de registo sem dependências; `socket.js`/`conversaStore.js` registam as suas limpezas ao carregar e `http.js` importa só o registo. Se um módulo nunca carregou, não há estado dele para limpar — o no-op é correto.

### 6. Extrair `parseToDate` (companheiro do 5)
`chatListRowAtendimento.js` e `chatsStore.js` importam **só** essa função (13 linhas, pura) de `conversaViewHelpers.js` — 41 kB com 68 exports, que ainda arrasta `conversaUtils` (15 kB).
**Medido: ganho 0 kB hoje** (o módulo chega ao boot por outro caminho). **Só vale depois do item 5.**

### 7. Resync em cascata
`CHAT_LIST_PRESERVE_MAX_PAGES = 20`: resync/background pode baixar até 20 páginas em série para preservar o "Carregar mais".
**Direção:** 1ª página + merge. **Risco:** médio (mexe no contrato de preservação).

### 8. `ConversaViewBody` re-renderiza por mensagem
**Evidência (hoje):** `ConversaView.jsx:162` ainda tem `mensagens: s.mensagens` na assinatura — o coordenador re-renderiza a cada mensagem nova.
**Ganho:** fluidez da thread em conversa movimentada. **Risco:** médio-alto (caminho quente).

### 9. Purge de CSS
`conversa.css` 54 kB gzip (441 kB / 18,2k linhas, 451 `!important`) e `chatList.css` 20 kB gzip.
**Ganho:** bytes reais. **Risco: alto** — não é "melhoria segura". Precisa de sessão com verificação visual tela a tela.

### 10. Unificar ícones
`@tabler/icons-react` em 36 arquivos, `lucide-react` em 16.
**Ganho pequeno:** `vendor-icons` é só **11 kB gzip**. Baixa prioridade.

### 11. `react-easy-crop` — dependência morta
Única menção em `src/` é um comentário no CSS. **Não reduz bundle** (não é importada, logo não é empacotada); só encurta o `npm install`. Mexer no lockfile por isso não compensa sozinho.

### 12. Service worker: navegação stale-while-revalidate + precache no install
**Ganho:** o app começaria a pintar em ~0 ms nas entradas repetidas (hoje a navegação é network-first e espera a rede sempre).
**Trade-off:** o usuário fica "uma versão atrás" depois de cada deploy. **É decisão do Miguel, não técnica.**

---

# D — Backend · estabilidade e custo (doc 29, **reverificado hoje**)

### 13. Supervisão sem cache ⭐ (doc 29 #7)
`getResumo` + `getClientesPendentes` a cada **30 s por aba de admin aberta**, cada um varrendo todas as conversas abertas + mensagens do dia **sem teto**. O doc chama de "maior consumidor recorrente de CPU/banco".
**Evidência (hoje):** nenhum cache/coalescing em `supervisaoService.js`.
**Direção:** cache/coalescing de 15-30 s. **Risco:** baixo.

### 14. Status de mensagem pode regredir (doc 29 #2)
UPDATEs incondicionais depois do provider (`textMessageController:501`, `mediaMessageController:472`, outbound/forward/pix/retry) + corrida ler-rank/gravar no `statusZapi`.
**Evidência (hoje):** nenhum `.in('status', ['pending','sending'])` nos controllers.
**Direção:** guarda no UPDATE + filtro de rank no ACK. **Risco:** baixo.

### 15. Tempestade de refetch (doc 29 #1)
`atualizar_conversa` emitido para a sala `empresa_` faz **todo cliente** dar `GET /chats/:id`; quem não vê a conversa leva 403 **e dispara resync da lista inteira**. Emissores: gateway, inbound (redundante com o `conversa_atualizada` logo a seguir), bot e um scheduler em loop de até 300 conversas.
**Risco:** médio (muda contrato com o frontend — testar junto).

### 16. Contadores erram acima de 2000 (doc 29 #9)
`minha_fila`/`aberta`/`em_atendimento` varrem até 2000 linhas com embed lateral por linha **e erram** acima disso. Causa-raiz: "tem mensagem?" não denormalizado em `conversas`.

### 17. Inbound com ~25-30 round-trips (doc 29 #6)
Dedup de reentrega roda tarde e **em duplicidade**; a mesma conversa é lida 3-5×; `empresas`/`whatsapp_instances`/`ia_config` sem cache no caminho quente (4-8 queries por mensagem); Whapi processa lote em série e um 500 reprocessa o lote todo.

### 18. Mídia sem teto de concorrência (doc 29 #11)
Downloads inbound/espelhamento R2 sem limite (picos de N×80 MB); **`/media/proxy` baixa o arquivo INTEIRO a cada request de Range**; varredura R2 sem cursor; órfãos `*-wa.mp4/jpg` no encaminhamento.

### 19. Guardas de duplo-envio (doc 29 #3, #4, #5)
`encerrarChat` sem guarda (duplo clique = 2 mensagens de finalização **ao cliente**); encaminhamento e finalização sem `referenceId` (o sweep pode reenviar algo já entregue); `sendVoice` faz fallback em **qualquer** falha, inclusive 5xx ambígua → 2 áudios ao cliente.

### 20. Mapas sem TTL (doc 29 #14)
`lastWelcomeSentAt`, `_lastSyncByConv`, presença — leak lento de ~0,3-1 MB/dia.

### 21. Logs com dado pessoal (doc 29 #15) — ⚠️ LGPD
Ainda ~7-15 linhas por mensagem, **com o texto da mensagem e o telefone completo**.

---

# E — Operacional, a confirmar

### 22. Backlog não deployado
A memória do projeto lista **dezenas** de correções marcadas "não deployado" (recebimento de mídia, encerramento, ACK, áudio, exclusão de conversa…). O frontend foi deployado hoje; **o backend não sei**.
**Pergunta aberta:** o que está em `origin/master` do backend já está rodando na VPS? Se não, há muita correção pronta parada — e isso vale mais que qualquer item desta lista.

---

## Se fosse escolher três

1. **Brotli + `Cache-Control`** (A1, A2) — minutos, risco zero, e está parado.
2. **Supervisão com cache** (D13) — o maior consumidor recorrente de banco, risco baixo.
3. **Item 10** (C5) — o único que reduz o parse de 634 kB no celular.
