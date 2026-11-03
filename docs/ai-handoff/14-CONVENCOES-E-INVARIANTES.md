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

## Horários (fuso da empresa)

- **Nunca** passe `timeZone: "America/Sao_Paulo"` (nem qualquer zona fixa) para `Intl`/`toLocale*` em tela de atendimento. Use `src/utils/companyTimezone.js`: `formatHoraEmpresa`, `formatDiaEmpresa`, `formatDiaCurtoEmpresa`, `companyDayKey`, `isSameCompanyDay`. SP cravado fazia uma empresa de Mato Grosso ver toda mensagem uma hora adiantada.
- A fonte é `empresa.timezone` (de `GET /config/empresa`, escolhido em Configurações → Geral → Estado). O `empresaStore` é o **único** ponto que chama `setCompanyTimezone`; o valor fica em `localStorage` para já estar certo na primeira pintura.
- Separador de data e rótulo de data têm de usar o **mesmo** dia civil: compare com `isSameCompanyDay`, nunca com `getFullYear/getMonth/getDate`.
- Componente memoizado que mostra hora precisa de `useCompanyTimezoneVersion()` (prop `tzVersion` nas linhas da lista, dependência no memo dos separadores da thread) — senão a tela fica no fuso antigo depois que o admin troca o estado.
- Fora do escopo de propósito: Dashboard e Dashboard IA (recorte analítico agregado em SP no backend) e Disparo (tem `fuso_horario` próprio por empresa na tabela de limites).

## Documentação

- Código > estes arquivos. Se mudar invariante, atualize este doc no mesmo PR/tarefa.
- Marque `PENDENTE DE VALIDAÇÃO` o que não rodou no browser.

## Selos e cor por contacto (2026-11-03)

- Estado de conversa veste **uma cápsula e cinco tintas** (`--zs-st-*` em
  `styles/zap-simples.css`), com uma marca redonda em `currentColor`. Estado novo = dois
  tokens nos dois temas. Nem monospace, nem glifo unicode, nem painel sólido, nem
  `animation: infinite`. Detalhe e tabela: [07-LISTA-DE-CONVERSAS.md](07-LISTA-DE-CONVERSAS.md).
- A cápsula tem **20px**, que é o que `estimateChatListRowSize` reserva. Altura de selo é
  parte do contrato de altura da lista virtual.
- Cor por contacto é **OKLCH**, nunca HSL: em HSL o contraste do branco ia de 2.36:1 a
  10.38:1 conforme o nome. Medido, não estimado.

## Tique de envio (2026-11-03)

- A regra do tique é **uma só**, em `utils/messageTicks.js` (`resolveTickState`). A bolha e
  o card só traduzem o estado para a sua marcação. Pôr regra de status em
  `bubbleStatus.js` ou em `ChatListRow.jsx` volta a fazer as duas telas discordarem — foi
  assim que a mesma mensagem ficou com ✓✓ na conversa e ✓ no card.
- Campo novo que o tique passe a ler entra **também** em `tickSignature`, senão a linha da
  lista não repinta em tempo real.
- `normalizeMensagemStatusKey` é das guardas de status (conversaStore, socket), não do
  tique. Não trocar um pelo outro.
