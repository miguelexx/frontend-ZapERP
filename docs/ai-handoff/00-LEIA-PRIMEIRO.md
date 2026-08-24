# Leia primeiro — handoff do frontend ZapERP

> Análise estática em 2026-08-23 a partir de `frontend/src` (não `dist/`). Nenhuma afirmação sobre Vercel/VPS/browser real foi validada em runtime.

## Objetivo e estado

SPA React (Vite) de atendimento WhatsApp estilo WhatsApp Web: lista de conversas, thread, composer, mídia, socket, push, configurações, IA/bot, supervisão, help desk (empresa 1), chat interno, CRM (SSO + fallback) e Disparo (em evolução).

Não existe `App.jsx`. O bootstrap é `src/main.jsx` → `ErrorBoundary` → `routes/AppRoutes.jsx`. Estado global é **Zustand**, não Redux/React Query/Context de auth.

Estados de certeza: **CONFIRMADO** / **INFERÊNCIA** / **PENDENTE DE VALIDAÇÃO**.

## Ordem de leitura (não leia a série inteira)

Use o [índice-mestre](../../../docs/ai-handoff/00-LEIA-PRIMEIRO.md) para escolher a sessão. Dentro do frontend:

| # | Arquivo | Quando |
|---|---------|--------|
| 01 | [Arquitetura](01-ARQUITETURA.md) | stack, pastas, Vite, env, boot |
| 02 | [Rotas e navegação](02-ROTAS-E-NAVEGACAO.md) | `AppRoutes`, `MainLayout`, gates do menu |
| 03 | [Auth e permissões](03-AUTENTICACAO-E-PERMISSOES.md) | token, `can()`, HelpDesk empresa 1, Disparo |
| 04 | [HTTP e API](04-HTTP-E-API-CLIENT.md) | Axios, services, timeouts, 401 |
| 05 | [Socket.IO](05-SOCKET-IO-E-TEMPO-REAL.md) | rooms, eventos, bridges, push |
| 06 | [Módulo atendimento](06-MODULO-ATENDIMENTO.md) | layout 3 painéis, seleção, deep link |
| 07 | [Lista de conversas](07-LISTA-DE-CONVERSAS.md) | `chatsStore`, filtros, cache, paginação |
| 08 | [Thread e composer](08-THREAD-MENSAGENS-E-COMPOSER.md) | envio otimista, outbox, virtualização |
| 10 | [Páginas e módulos](10-PAGINAS-E-MODULOS.md) | Dashboard, Config, IA, Disparo, CRM, etc. |
| 11 | [Tema e responsividade](11-LAYOUT-TEMA-E-RESPONSIVIDADE.md) | tokens, breakpoints, teclado mobile |
| 12 | [Performance](12-PERFORMANCE.md) | memo, lazy, debounce, o que não fazer |
| 13 | [Mapa de arquivos](13-MAPA-DE-ARQUIVOS.md) | onde mexer |
| 14 | [Convenções e invariantes](14-CONVENCOES-E-INVARIANTES.md) | regras que quebram o produto se violadas |
| 15 | [Checklist](15-CHECKLIST-PARA-PROXIMA-IA.md) | antes de alterar |

## Pontos que exigem análise antes de alteração

- Toda UI de negócio assume tenant no JWT/`user.company_id`. Socket filtra com `shouldIgnoreByCompany`. Isolamento real é no backend.
- `GET /usuarios/me/permissoes` (ou path equivalente no service) + fallback por **role**. Há dois dialetos de código (`dashboard_acessar` vs `dashboard.ver`). Confira `permissions.js` e o catálogo do backend antes de criar um gate novo.
- Lista + thread são o caminho quente: `chatsStore` / `conversaStore`, memo com compares dedicados, virtualização TanStack, cache de sessionStorage. Mudança “pequena” aqui re-renderiza o atendimento inteiro.
- Envio: bolha otimista → HTTP → reconcile por `tempId`/`client_temp_id` → outbox se offline → watchdog de pending. Não substitua por um `await` linear sem esses passos.
- Fechar a conversa na UI (`closeSelectedConversation` / `setSelectedId(null)`) **não** encerra o atendimento.
- HelpDesk é `Number(user?.company_id) === 1`, não uma permissão do catálogo.
- `/campanhas`, `/mensagens` e `/atalhos` redirecionam; Disparo substitui campanhas antigas.
- Nomes `zapi` no frontend (ex.: `zapiIntegration.js`, evento `zapi_sync_contatos`) são legado; o produto usa UltraMSG.

## Checklist antes de modificar

- [ ] Ler este arquivo e só os docs da sessão.
- [ ] `git status` — não descartar trabalho do usuário.
- [ ] Rastrear página → store/hook → `api/*` ou `*Service.js` → evento socket se houver.
- [ ] Preservar `company_id`, `whatsapp_instance_id`, dedupe de mensagem e sticky de nome/foto.
- [ ] Não quebrar 640px (mobile) nem 741–1024 (tablet).
- [ ] Não adicionar Context/Redux/React Query sem pedido.
- [ ] Atualizar o doc correspondente se a arquitetura mudar.
