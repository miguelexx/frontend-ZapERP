# Arquitetura do frontend ZapERP

> 2026-08-23 · fonte: `frontend/src` e `frontend/package.json`. Não validado em browser/VPS.

## Stack (CONFIRMADO)

| Peça | Pacote / versão pedida | Papel |
|------|------------------------|--------|
| UI | `react` / `react-dom` ^18.3 | SPA |
| Bundler | `vite` ^5.4 + `@vitejs/plugin-react` | dev 5173, build |
| Rotas | `react-router-dom` ^6.26 | `BrowserRouter` |
| Estado | `zustand` ^4.5 | stores sem Context de auth |
| HTTP | `axios` ^1.7 | instância em `src/api/http.js` |
| Tempo real | `socket.io-client` ^4.7 | `src/socket/socket.js` |
| Lista longa | `@tanstack/react-virtual` | thread de mensagens |
| DnD | `@dnd-kit/*` | CRM kanban / ordenação |
| Ícones | `@tabler/icons-react`, `lucide-react` | sidebar e UI |
| Markdown | `react-markdown` + `remark-gfm` | Dashboard IA, manual |
| Crop | `react-easy-crop`, `react-image-crop` | foto / envio de imagem |

**Não há** no `package.json`: Redux, React Query, Tailwind, MUI, styled-components, Next.js. Estilo é CSS próprio (`src/styles/theme.css`, `app.css`, CSS por módulo).

`engines.node`: `>=24 <25` (CONFIRMADO no `package.json`). README da raiz ainda cita Node 18+ — tratar README como possivelmente defasado.

## Bootstrap

```
index.html (#root)
  → src/main.jsx
    → theme.css + app.css
    → installVitePreloadRecovery
    → authStore.restore()
    → listener storage em zap_erp_auth (sync entre abas)
    → FCM nativo, applyTheme (data-theme), SW, diagnósticos de notificação
    → <StrictMode><ErrorBoundary><AppRoutes /></StrictMode>
    → em PROD: register /service-worker.js + ciclo Web Push
```

**CONFIRMADO:** não existe `App.jsx`. Rotas vivem em `src/routes/AppRoutes.jsx`. Sem AuthProvider/ThemeProvider React; tema é `document.documentElement` + `localStorage`.

## Diagrama mental

```
Browser
  ├─ AppRoutes (lazy pages + ProtectedRoute)
  │    └─ MainLayout (sidebar + Outlet + bridges globais de socket)
  ├─ Zustand: auth, permissoes, empresa, chats, conversa, toasts, …
  ├─ Axios (Bearer de zap_erp_auth) → backend Express
  └─ Socket.IO (auth.token) → mesmas salas company/conversa do backend
```

O backend continua a fonte de verdade. O frontend **espelha**: HTTP hidrata stores; socket aplica deltas; F5 deve reconstruir via HTTP + cache de sessão da lista.

## Vite (`frontend/vite.config.js`) — CONFIRMADO

- Plugin React; **sem** `resolve.alias`.
- Dev: porta **5173**.
- Proxy: `/uploads` e `/media` → URL do backend (`scripts/resolveDevBackendUrl.mjs`: `VITE_API_URL` ou `localhost:VITE_BACKEND_PORT|PORT|3000`).
- `manualChunks`: `vendor-react`, `vendor-router`, `vendor-axios`, `vendor-socket`, `vendor-markdown`, `vendor-tanstack`, `vendor-dnd`, `vendor-icons`, `vendor-state`.
- Sourcemap só com `VITE_SOURCEMAP=1`.

## Env (`frontend/.env.example`)

| Variável | Uso |
|----------|-----|
| `VITE_API_URL` | Base da API (Axios e Socket) |
| `VITE_BACKEND_PORT` | Fallback local se a URL vier vazia |
| `VITE_WITH_CREDENTIALS` | Axios `withCredentials` se `1`/`true` |
| `VITE_ALERTA_SEM_RESPOSTA_ENABLED` | Liga/desliga rotas de alerta |
| `VITE_SOURCEMAP` | Sourcemap de build |

Fallback de produção no código (`src/api/baseUrl.js`) **pode diferir** do host do `.env.example`. Sempre conferir os dois. Build com `VITE_API_URL=localhost` servido em host público é bloqueado (Private Network Access) e cai no fallback de produção — CONFIRMADO no `baseUrl.js`.

## Scripts úteis

- `npm run dev` / `build` / `preview` (4173)
- Dezenas de `test:*` Node (áudio, mídia, outbox, ordem realtime) — não são Jest
- `test:e2e` Playwright (`frontend/playwright.config.js`)

## PWA / push (CONFIRMADO no `main.jsx`)

- Manifest + `/service-worker.js` só em `import.meta.env.PROD`
- `updateViaCache: "none"` + `reg.update()` para não ficar preso a SW velho
- Bridges: Web Push, FCM nativo (wrapper), prompt de permissão no `MainLayout`

## Pastas de `src/` (CONFIRMADO)

| Pasta | Responsabilidade |
|-------|------------------|
| `api/` | Axios + services REST |
| `auth/` | login, token, permissões, empresa |
| `atendimento/` | ações da conversa (assumir, encerrar, pagamento) |
| `chats/` | lista, store, filtros, cache sidebar |
| `conversa/` | thread, composer, bolhas, envio, outbox |
| `components/` | UI compartilhada |
| `crm/` | UI CRM local + redirect SSO |
| `dashboard/` | analytics |
| `helpdesk/` | bridge socket + unread |
| `internal-chat/` | chat entre colaboradores |
| `ia/` | pedaços da página IA |
| `layouts/` | shell + `sidebarNavConfig.js` |
| `media/` | microfone / gravação |
| `notifications/` | toasts e desktop |
| `pages/` | páginas de rota |
| `push/` | SW, FCM, subscription |
| `routes/` | `AppRoutes`, `ProtectedRoute` |
| `runtime/` | recuperação de preload Vite |
| `socket/` | client + batch de status |
| `styles/` | tokens e layout global |
| `supervisao/` | painéis da supervisão |
| `utils/` | helpers |

Detalhe de arquivos: [13-MAPA-DE-ARQUIVOS.md](13-MAPA-DE-ARQUIVOS.md).
