# Convenções e invariantes do frontend

> 2026-08-23. Violar isto no caminho de atendimento quase sempre gera bug de duplicata, vazamento de tenant ou lista “fantasma”.

## Tenant e identidade

- `company_id` no `user` do JWT/localStorage. Socket: `join_empresa` e `shouldIgnoreByCompany` em **todo** handler.
- Identidade de conversa inclui `whatsapp_instance_id`. Dedupe de row: `chatRowStableKey`.
- Não inventar row a partir de socket de outro setor (`updateChat` não cria; `addChatIfAuthorized`).

## Mensagens

- Dedupe: `whatsapp_id` → `id` → `tempId`. Merge temp↔server no outbound.
- Direção: normalizar `fromMe`/`from_me`/`isFromMe` → `direcao` in/out. Unread e notify só inbound.
- Nome/foto sticky: nunca sobrescrever com vazio, “Conversa” ou chatName de outbound.
- Envio: bolha otimista imediata; reconciliar; outbox só texto; watchdog 45s/180s.
- Drop mensagem se `conversa_id` ≠ conversa aberta.

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

- Provider: UltraMSG. Não implementar cliente Z-API.
- Mídia: upload pelo backend; blob URL só otimista e com revoke.

## Documentação

- Código > estes arquivos. Se mudar invariante, atualize este doc no mesmo PR/tarefa.
- Marque `PENDENTE DE VALIDAÇÃO` o que não rodou no browser.
