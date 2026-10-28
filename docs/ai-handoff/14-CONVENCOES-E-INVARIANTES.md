# Convenções e invariantes do frontend

> 2026-08-23. Violar isto no caminho de atendimento quase sempre gera bug de duplicata, vazamento de tenant ou lista “fantasma”.

## Tenant e identidade

- `company_id` no `user` do JWT/localStorage. Socket: `join_empresa` e `shouldIgnoreByCompany` em **todo** handler.
- Identidade de conversa inclui `whatsapp_instance_id`. Dedupe de row: `chatRowStableKey`.
- Não inventar row a partir de socket de outro setor (`updateChat` não cria; `addChatIfAuthorized`). Se o cliente escolhe/transfere setor e o viewer não pertence, `shouldRemoveChatFromViewerList` tira o card na hora. Admin vê tudo.
- Perfil `atendente` não vê conversa individual assumida por outro atendente (lista, socket e GET `/chats/:id` 403). Supervisor/admin, grupos, encerradas, participante ativo e quem transferiu ficam de fora deste corte.

## Mensagens

- Dedupe: `whatsapp_id` → `id` → `tempId`. Merge temp↔server no outbound.
- Direção: normalizar `fromMe`/`from_me`/`isFromMe` → `direcao` in/out. Unread e notify só inbound.
- Nome/foto sticky só para a **mesma** pessoa (`cliente_id` ou telefone da mesma identidade WhatsApp). Celular com/sem 9º dígito é a mesma pessoa; fixo não herda o celular do 9 inserido. Se o cliente ou o telefone mudam, o card não reaproveita nome, foto nem `cliente` aninhado. Vazio, “Conversa” e `chatName` de mensagem outbound/grupo não substituem o contato. Foto http da mesma pessoa **pode** ser substituída por outra URL http.
- Envio: bolha otimista imediata; reconciliar; outbox só texto; watchdog 45s/180s.
- Drop mensagem se `conversa_id` ≠ conversa aberta.
- **Não** recarregar a SPA sozinha (`location.reload` / `location.replace` em timer ou falha de chunk). O rascunho do composer vai para `sessionStorage` a cada tecla. Recarregar só no clique do usuário (ErrorBoundary).

## UX de atendimento

- Fechar thread (`closeSelectedConversation`) **não** encerra o atendimento.
- `carregarConversa` tem abort + generation; `leave_conversa` no clear.
- Um dono de scroll por painel; `min-height: 0` no flex do layout.
- Mobile 640px: lista XOR chat; `popstate` só fecha UI.

## Permissões e rotas

- Menu e rota devem usar o **mesmo** predicado (`can` / helper / `company_id === 1`).
- Não criar `if (role === "admin")` em página nova.
- HelpDesk não é permissão de catálogo.
- `/campanhas`, `/mensagens`, `/atalhos` são redirects; não ressuscitar UI morta.

## Realtime

- Listeners de domínio em `socket.js` ou bridges globais — nunca em Row/Bubble/`useEffect` de item de lista.
- HTTP reconstrói estado após F5; socket é delta. Não assumir Redis no servidor.
- Eventos `zapi_*` no fio = legado UltraMSG.

## Performance

- Lazy de rota e de ChatList/ConversaView/modais pesados.
- Memo + compare functions existentes; não “simplificar” tirando virtualização.
- SearchBox isolado da lista; debounce de resync.

## Camadas

- HTTP só em `api/*` ou `*Service.js` de domínio. UI não monta URL na unha.
- Zustand por domínio; não Context de auth/chats.
- CSS por tokens (`theme.css`); não segundo design system.

## Segurança na UI

- Token só em `zap_erp_auth` + Bearer. Não logar JWT.
- 401 com Bearer → logout (exceto login / `skipAuthLogout`).
- Isolamento real é no backend; FE só filtra para não pintar dado errado.

## WhatsApp

- Provider principal: UltraMSG. Whapi é **segundo provider opcional** por instância (`provider='whapi'`), conectado pela aba Configurações → Whapi. O browser **não** chama `gate.whapi.cloud` nem `manager.whapi.cloud`; só o backend. Channel ID/token do canal **não** são preenchidos pelo usuário no fluxo SaaS (`provision-whapi`). Não implementar cliente Z-API.
- Mídia: upload pelo backend; blob URL só otimista e com revoke.

## Modo simples (pele WhatsApp)

- `data-zap-simple="1"` no `<html>` espelha `user.atendimento_modo_simples`; a pele é `chats/chatList.whatsapp.css`.
- Linha de altura **fixa** (`CHAT_LIST_SIMPLE_ROW_SIZE`) e `gap: 0`. Nada pode crescer além disso — título em 1 linha, sem sublinhas, sem faixas de tags. Detalhes e porquês em [07-LISTA-DE-CONVERSAS.md](07-LISTA-DE-CONVERSAS.md).

## Documentação

- Código > estes arquivos. Se mudar invariante, atualize este doc no mesmo PR/tarefa.
- Marque `PENDENTE DE VALIDAÇÃO` o que não rodou no browser.
