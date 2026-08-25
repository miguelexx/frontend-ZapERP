# ZapERP Frontend — handoff automático

> Este arquivo é lido pelo Claude Code antes de cada sessão no frontend.

## Onde
`frontend/` — SPA React/Vite, branch `main`.  
Stack: React 18 · Zustand · TanStack Virtual · axios · Socket.IO client · Vite · Tailwind/CSS tokens.

## Protocolo obrigatório (toda sessão, nesta ordem)

**1. Ler antes de qualquer código:**
- [`docs/ai-handoff/00-LEIA-PRIMEIRO.md`](docs/ai-handoff/00-LEIA-PRIMEIRO.md) — estado, contexto, ordem de leitura
- [`docs/ai-handoff/15-CHECKLIST-PARA-PROXIMA-IA.md`](docs/ai-handoff/15-CHECKLIST-PARA-PROXIMA-IA.md) — checklist de análise
- [`docs/ai-handoff/14-CONVENCOES-E-INVARIANTES.md`](docs/ai-handoff/14-CONVENCOES-E-INVARIANTES.md) — regras que quebram o produto se violadas

**2. Tarefa específica?** Consulte `docs/ai-handoff/00-LEIA-PRIMEIRO.md` para saber qual doc ler.

**3. Antes de escrever qualquer código, declare:**
- Componentes, stores e serviços que serão alterados
- Impacto em: lista de conversas · thread · composer · socket · auth · CSS mobile
- Testes existentes relevantes (Jest + Playwright)

**4. Ao terminar, antes de encerrar:**
- Se encontrou algo não documentado → adicione ao doc correspondente em `docs/ai-handoff/`
- Relate: o que mudou · como testar · risco de regressão em mobile

## Zonas de perigo — NÃO tocar sem ler o código completo

- **`useAutoScroll` + `visualViewport`** — sistema de scroll/teclado mobile já maduro e estável; mudança "simples" quebra o teclado no iOS/Android
- **`.wa-selectBar` / `.wa-pinBar`** — barras sticky em posição `sticky` empurram a virtual list; compensar com `captureMessagesScrollAnchor` / `restoreMessagesScrollAnchor`
- **`chatsStore` + virtualização** — caminho quente; `chatListRowCompare` e `threadRowCompare` existem por motivo; não remover
- **`AudioWavePlayer`** — `el.load()` obrigatório ao trocar `src` em tempo real (sem isso o player não recarrega)
- **Envio otimista** — bolha otimista → HTTP → reconcile por `tempId`/`client_temp_id` → outbox → watchdog; não substituir por `await` linear

## Hardstops

- `company_id` → sempre de `user.company_id` (JWT/localStorage); nunca fabricar
- **Não commitar / não pushar** sem autorização explícita do Miguel
- `git status` antes de qualquer edição — nunca descartar trabalho existente
- Listeners Socket.IO → apenas em `socket.js` ou bridges globais; **nunca** em componente de lista/item
- HelpDesk é `Number(user?.company_id) === 1` — **não** é uma permissão do catálogo
- Nomes `zapi*` no código (ex.: `zapiIntegration.js`, evento `zapi_sync_contatos`) são **legado** — provider é UltraMSG
- `/campanhas`, `/mensagens`, `/atalhos` são redirects — não ressuscitar UI antiga
- `Fechar thread ≠ encerrar atendimento` — `closeSelectedConversation` só fecha a UI

## Não existe / não é o que parece

- `App.jsx` não existe — bootstrap é `main.jsx` → `ErrorBoundary` → `AppRoutes.jsx`
- `dist/` não é código-fonte — sempre trabalhar em `src/`
- Permissões têm dois dialetos no código (`dashboard_acessar` vs `dashboard.ver`) — verificar `permissions.js` antes de criar gate novo
