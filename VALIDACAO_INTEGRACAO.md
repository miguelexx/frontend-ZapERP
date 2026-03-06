# Relatório de Validação: Integração Frontend ↔ Backend

**Data:** 06/03/2025  
**Escopo:** API REST, WebSocket (Socket.IO), autenticação, tratamento de erros e upload.

---

## 1. Autenticação

| Item | Status | Detalhes |
|------|--------|----------|
| Login | ✅ | `POST /usuarios/login` com `{ email, senha }` em `authService.js` |
| Retorno esperado | ✅ | `{ token, usuario }` — o frontend usa `data.usuario` (compatível com backend em PT) |
| Header Authorization | ✅ | `Authorization: Bearer <token>` injetado em todas as requisições via interceptor em `http.js` |
| Token inválido/expirado (401) | ✅ | Remove `zap_erp_auth`, desconecta socket, redireciona para `/login` |
| Logout | ✅ | `authStore.logout()` limpa token, desconecta socket, limpa stores e redireciona para `/login` |

**Arquivos:** `src/auth/authService.js`, `src/auth/authStore.js`, `src/api/http.js`

---

## 2. Rotas Principais

### Mapeamento Frontend → Backend

| Rota do checklist | Rota usada no frontend | Arquivo |
|-------------------|-------------------------|---------|
| `/api/dashboard/overview` | `/dashboard/overview` | `dashboardService.js` |
| `/api/dashboard/metrics` | ⚠️ Não usada | Usa apenas `overview`; verificar se backend expõe `/dashboard/metrics` |
| `/api/chats` | `/chats` | `chatService.js` |
| `/api/chats/:id` | `/chats/:id` | `chatService.js`, `conversaService.js` |
| `/api/chats/:id/mensagens` | `/chats/:id/mensagens` | `chatService.js`, `conversaService.js` |
| `/api/chats/zapi-status` | `/chats/zapi-status` | `chatService.js` |
| `/api/clientes` | `/clientes` | `configService.js` |
| `/api/usuarios` | `/usuarios` | `configService.js`, `chatList.jsx`, `AtendimentoActions.jsx` |
| `/api/tags` | `/tags` | `tagService.js`, `configService.js`, `IA.jsx` |
| `/api/ia/config` | `/ia/config` | `iaService.js` |
| `/api/ai/ask` | `/api/ai/ask` | `DashboardIA.jsx` |
| `/api/integrations/zapi/status` | `/api/integrations/zapi/connect/status` | `zapiIntegration.js` |
| `/api/integrations/zapi/connect/qrcode` | `/api/integrations/zapi/connect/qrcode` | `zapiIntegration.js` |

### Inconsistência de prefixo `/api`

- **Maioria das rotas:** sem prefixo (ex.: `/usuarios/login`, `/chats`, `/dashboard/overview`)
- **Rotas com prefixo `/api`:** `/api/ai/ask`, `/api/integrations/zapi/connect/*`

O backend precisa expor as rotas exatamente nesses caminhos. Se o backend usa prefixo global `/api`, a `baseURL` deve apontar para a raiz da API (ex.: `https://backend.com/api` ou `https://backend.com` conforme a estrutura do servidor).

---

## 3. WebSocket (Socket.IO)

| Item | Status | Detalhes |
|------|--------|----------|
| Conexão com auth | ✅ | `io(base, { auth: { token } })` em `socket.js` |
| Base URL | ✅ | Mesma de `getApiBaseUrl()` usada na API REST |
| Transportes | ✅ | `["websocket", "polling"]` |

### Eventos emitidos pelo frontend

| Evento | Payload | Onde |
|--------|---------|------|
| `join_conversa` | `id` (conversa) | `socket.js` |
| `leave_conversa` | `id` (conversa) | `socket.js` |
| `typing_start` | `{ conversa_id }` | `ConversaView.jsx` |
| `typing_stop` | `{ conversa_id }` | `ConversaView.jsx` |
| `marcar_conversa_lida` | `{ conversa_id }` | `conversaStore.js` |

### Eventos escutados pelo frontend

| Evento | Ação |
|--------|------|
| `typing_start` | Mostra indicador de digitação |
| `typing_stop` | Remove indicador |
| `tag_adicionada` | Atualiza tags na conversa |
| `tag_removida` | Remove tag |
| `nova_conversa` | Adiciona chat à lista |
| `nova_mensagem` | Nova mensagem (som, notificação, badge) |
| `mensagem_excluida` | Remove mensagem |
| `mensagem_oculta` | Remove mensagem (oculta) |
| `status_mensagem` | Atualiza status (enviada, entregue, lida) |
| `mensagens_lidas` | Zera unread |
| `zapi_sync_contatos` | Toast de sincronização |
| `conversa_atualizada` | Atualiza conversa |
| `conversa_encerrada` | Atualiza conversa |
| `conversa_transferida` | Atualiza conversa |
| `conversa_reaberta` | Atualiza conversa |
| `conversa_atribuida` | Atualiza conversa |
| `atualizar_conversa` | Debounce e fetch da conversa |
| `contato_atualizado` | Atualiza nome/foto do contato |

---

## 4. Tratamento de Erros

| Status | Tratamento | Local |
|--------|------------|-------|
| **401** | ✅ Remove auth, desconecta socket, redireciona para `/login` | `http.js` interceptor |
| **403** | ⚠️ Não tratado globalmente | Falta toast "Sem permissão" |
| **429** | ✅ Toast: "Muitas requisições. Aguarde um momento..." | `http.js` interceptor |
| **500+** | ✅ Toast: "Erro no servidor" + mensagem do backend | `http.js` interceptor |
| Network/ECONNABORTED | ✅ Toast: "Sem conexão. Verifique sua internet." | `http.js` interceptor |

**Recomendação:** Adicionar tratamento específico para 403 no interceptor de resposta.

---

## 5. Upload

| Item | Status | Detalhes |
|------|--------|----------|
| Endpoint | ✅ | `POST /chats/:id/arquivo` |
| Formato | ✅ | `FormData` com campo `file` |
| Content-Type | ✅ | `multipart/form-data` |
| Token | ✅ | Injetado pelo interceptor (Authorization Bearer) |

**Arquivo:** `src/conversa/ConversaView.jsx` (linhas ~2068–2076)

---

## 6. Base URL e CORS

| Item | Status | Detalhes |
|------|--------|----------|
| Base URL configurável | ✅ | `VITE_API_URL` em `.env`; fallback: `https://zaperpapi.wmsistemas.inf.br` |
| Normalização | ✅ | Remove trailing slashes e `/usuarios/login` da URL |
| `credentials: true` | ⚠️ Não configurado | Axios não usa `withCredentials: true` |

**Observação:** O frontend usa Bearer token no header, não cookies. Para CORS com cookies de sessão, seria necessário `withCredentials: true`. Se o backend usa apenas Bearer, a configuração atual é suficiente.

---

## 7. Fluxo de Teste Sugerido

1. **Login** → `POST /usuarios/login` → token salvo em `localStorage`
2. **Listar conversas** → `GET /chats` → lista na sidebar
3. **Abrir chat** → `GET /chats/:id` + `join_conversa` via Socket.IO
4. **Enviar mensagem** → `POST /chats/:id/mensagens` ou `POST /chats/:id/arquivo`
5. **Receber em tempo real** → evento `nova_mensagem` via Socket.IO

---

## 8. Pontos de Atenção

1. **`/api/dashboard/metrics`** — Não há chamada no frontend; confirmar se o backend expõe essa rota ou se `overview` cobre o caso.
2. **Prefixo `/api`** — Parte das rotas usa `/api` (AI, Z-API), a maioria não. Conferir estrutura real do backend.
3. **403** — Incluir tratamento global para exibir mensagem de "Sem permissão".
4. **`credentials`** — Avaliar necessidade de `withCredentials: true` conforme política de CORS do backend.

---

## 9. Resumo do Checklist

| Categoria | Itens OK | Itens pendentes |
|-----------|----------|-----------------|
| Autenticação | 5/5 | 0 |
| Rotas | 11/12 | 1 (`/dashboard/metrics` não usada) |
| WebSocket | 3/3 | 0 |
| Tratamento de erros | 4/5 | 1 (403) |
| Upload | 1/1 | 0 |
| Base URL / CORS | 2/3 | 1 (`credentials` opcional) |

**Conclusão:** A integração está bem implementada. Os pontos pendentes são ajustes menores (403, `credentials`) e alinhamento com a estrutura real das rotas do backend.
