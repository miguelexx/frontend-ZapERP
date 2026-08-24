# HTTP e API client

> 2026-08-23 · `src/api/http.js`, `baseUrl.js`, `httpTimeouts.js`, services em `src/api/` e `*Service.js` de domínio.

## Instância Axios (CONFIRMADO)

- `baseURL = getApiBaseUrl()` (`VITE_API_URL` → localhost+porta em dev → fallback de produção).
- Timeout default **55s** (`HTTP_TIMEOUT_DEFAULT_MS`).
- Request: injeta Bearer de `zap_erp_auth`; se timeout default e `FormData`, sobe para 3–15 min (vídeo grande até ~30 min) via `resolveRequestTimeoutMs`.
- `VITE_WITH_CREDENTIALS=1` liga `withCredentials`.

Response:

- **401** + tinha Bearer → limpa auth, caches de conversa, disconnect socket, redirect `/login` (exceto URL de login e `skipAuthLogout`).
- 403 / 5xx / 429 / timeout / network → toast (`notificationStore`), respeitando flags `silent` / `skipGlobal*Toast`.

Não use `fetch` solto para API autenticada. Não crie segunda instância Axios.

## Onde estão os services

| Área | Arquivos típicos | Prefixo observado |
|------|------------------|-------------------|
| Auth | `auth/authService.js` | `POST /usuarios/login` |
| Permissões | `api/permissoesService.js` | `/usuarios/me/permissoes`, `/usuarios/:id/permissoes`, catálogo |
| Config | `api/configService.js` | `/config/empresa`, usuários, tags, respostas, clientes, jobs |
| Lista | `chats/chatService.js` | `/chats`, counts, sync, zapi-status (nome legado) |
| Thread | `conversa/conversaService.js` | `/chats/:id/*` (mensagens, mídia, assumir, PIX, notas) |
| Instâncias | `chats/whatsappInstancesService.js` | `/chats/whatsapp-instances` |
| Dashboard | `api/dashboardService.js` | `/dashboard/*`, SLA |
| IA | `api/iaService.js` | `/ia/config`, regras, logs, alerta |
| Supervisão | `api/supervisaoService.js` | `/api/supervisao/*` |
| HelpDesk | `api/helpDeskService.js` | `/api/helpdesk/*` |
| Chat interno | `api/internalChatService.js` | `/api/internal-chat/*` |
| Produtos | `api/produtosService.js` | `/api/produtos/consulta`, sync WM |
| WhatsApp | `api/whatsappIntegration.js` | `/api/integrations/whatsapp/*` sync |
| Legado Z-API **nome** | `api/zapiIntegration.js` | `/api/integrations/zapi/connect/*` (UI Connect WhatsApp; toasts falam UltraMSG) |
| Disparo | `api/disparo*.js` | `/api/disparo/campanhas*`, worker saúde, etapa 8 |
| CRM | `api/crmService.ts` | `/api/crm/*` (UI local; SSO é outro endpoint) |

Paths misturam `/api` e bare. O backend monta os dois; no FE copie o path **já usado** no service, não “normalize” no meio da tarefa.

`api/chatService.js` (pasta `api/`) é fachada que reexporta chats/conversa — não duplicar HTTP lá.

## Contratos que o FE assume (INFERÊNCIA alinhada ao BE)

- Identidade de conversa: `id` + `whatsapp_instance_id` + cliente/telefone.
- Mensagem: `id`, `whatsapp_id`, `client_temp_id` / tempId, `direcao` in/out, `fromMe`.
- Lista paginada: cursor (`nextCursor`, `nextCursorId`, `hasMore`), não offset cego.
- 409/idempotência no envio: o FE reconcilia temp → servidor; não criar segunda bolha.

## Timeouts e upload

Uploads de áudio/imagem/arquivo passam `FormData` no `conversaService`. Não baixe o timeout global. Não faça upload direto ao R2/S3 pelo browser — o backend que persiste.

## Erros de envio

`conversa/outboundSendError.js` classifica falha vs incerto vs offline. Composer/watchdog dependem disso. Não troque por `alert(err.message)`.

## Testes de contrato no FE

Scripts `frontend/scripts/test-*.mjs` cobrem merge de mídia, outbox, ordem realtime, mic — não substituem o Jest do backend. Playwright: smoke / áudio.

Ao mudar um path, busque o string no `frontend/src` **e** no `backend/routes`.
