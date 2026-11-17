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
- **Não** recarregar a SPA sozinha (`location.reload` / `location.replace` em timer ou falha de chunk). O rascunho do composer fica em memória a cada tecla e vai para `sessionStorage` com debounce de 250ms (na hora ao trocar de conversa, `pagehide` e flush). No modo **nota interna** o rascunho persistido é o texto para o CLIENTE (`getPersistText` em `useComposerDraft`) — nunca a nota. Recarregar só no clique do usuário (ErrorBoundary).

## UX de atendimento

- Fechar thread (`closeSelectedConversation`) **não** encerra o atendimento.
- `carregarConversa` tem abort + generation; `leave_conversa` no clear.
- Um dono de scroll por painel; `min-height: 0` no flex do layout.
- Moldura de mídia na bolha vem de `--wa-media-ar` (proporção real + cache por mensagem, ver
  08). No mobile sobrescreva `--wa-media-max-w/-h`, nunca a `width` da `<img>`; e `.wa-linkPrev`
  precisa de `contain: inline-size` — sem isso a miniatura estoura a bolha `fit-content`.
- Mídia que muda de altura ao decodificar só não desloca a thread por causa de DUAS defesas
  (doc 08, 16/11/2026): a compensação por `item.start < scrollTop` no virtualizer e a exceção
  de folga > 24px no `snapIfStickBottom` durante a abertura. Mexeu na moldura? Rode
  `e2e/audit-local-mock.spec.js -g "historico com muitas midias"` nos dois projetos.
- **Não chame `virtualizer.scrollToIndex` e depois sobrescreva o `scrollTop`** (16/11/2026).
  Desde a v3.14 o TanStack abre um laço de reconcile (rAF, até 5 s) que reaplica o alvo
  dele a cada remedição — com o nosso `scrollTop` diferente, a thread "subia e descia
  sozinha" (medido: 149 px sem input após carregar histórico). `scrollToEnd` e
  `restoreAfterPrepend` em `ConversaMessageVirtualList` escrevem o `scrollTop` direto (lendo
  `measurementsCache`) e chamam `stopVirtualReconcile`; wheel/touch/pointer chamam
  `cancelProgrammaticScroll`. Referencial: as linhas são pintadas em `translate(start)` dentro
  da raiz em `offsetTop = scrollMargin`, logo posição real = `start + margin`.
  "Ir para recentes" usa `smoothScrollThreadToBottom` (useAutoScroll); enquanto anima,
  `snapIfStickBottom` não age. Regressão: `e2e/thread-scroll-stability.spec.js`.
- **Abertura de conversa sem pulo** (16/11/2026, regressão `e2e/thread-open-stability.spec.js`,
  filma frame a frame):
  - A máscara `threadOpening` é **derivada** (`openingThreadKey !== openSnapDoneKey`). Nunca
    volte a `setState` no render guardado por ref mutado no render: quando o React descarta
    o render (troca pelo cache), o state perde-se, o ref fica, e a máscara não entra.
  - `ConversaMessageVirtualList` chama `onVirtualContentResize` num layout effect quando
    `getTotalSize()` muda — o RO da raiz chega 1 frame atrasado (é mais raso que as linhas).
  - O snap de abertura (`useAutoScroll`) só libera a máscara quando as `<img>` visíveis
    decodificaram e a altura ficou parada 2 frames (teto `OPEN_MEDIA_WAIT_MAX_MS` = 650ms).
  - O fallback de 1,1s da máscara conta a partir de `!loading`, não do clique.
- Safe-area inferior com conversa aberta é do `.wa-footer`, não do `main-content` (doc 11).
  Reservar nos dois volta a deixar a faixa morta debaixo do composer.
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

## Menus retráteis (2026-11-03)

- **O rail lateral do desktop é FIXO** (revertido em 05/11/2026). Só a barra inferior do
  telemóvel é retrátil, e só no modo simples — gesto em `layouts/useNavReveal.js`.
- Menu escondido leva `visibility: hidden`, senão o `Tab` entra em links fora do ecrã.

## `!important`: porque existe, e o que é mentira (05/11/2026)

O `chatList.flat.css` e o `conversa.polish.css` são peles que se sobrepõem a CSS mais
antigo. Chegaram a ter 494 `!important`, e a explicação que andava escrita — «preciso disto
para vencer o `studio.css`, o `conversations-studio.css` e o `premium-interactions.css`» —
**está errada**. Medido declaração a declaração: o `studio.css` e o
`conversations-studio.css` obrigam a **um** `!important` entre os dois; o
`premium-interactions.css` obriga a ~32. O resto é disputa com `chatList.css`,
`conversa.css`, `app.css` e, sobretudo, **com os próprios dois ficheiros**.

Foram removidos 133 (494 → 361). Os que ficaram são precisos. Dois motivos, por ordem de
frequência:

**1. Estilo inline posto no JSX.** `style={{ minWidth: 14 }}` vence qualquer regra CSS sem
`!important`, por mais específica que seja. É o caso do `.chat-list-icon` do cabeçalho: o
`<span>` leva `style` inline com 14px, e a regra de 18px só ganha com `!important`. Ao
mexer aqui, **procure `style={{ … }}` no componente antes de concluir que um `!important`
é decorativo** — eu tirei esse e a lista quebrou (18px → 14px) até a sonda apanhar.

**2. Outro `!important` do outro lado.** Quando os dois lados têm `!important`, quem ganha
é a especificidade. Tirar de um só inverte o resultado; tirar dos dois ao mesmo tempo não
muda nada. Foi assim que os 133 saíram: em bloco, e só onde todos os concorrentes caíam
juntos ou já perdiam/ganhavam de qualquer forma.

### Como validar uma limpeza destas

Análise estática sozinha **não serve** — a minha deu 135 candidatos e dois estavam errados.
A prova foi empírica: fotografar `getComputedStyle` de cada propriedade tocada, em cada
elemento que casa, nas quatro combinações (desktop/estreito × claro/escuro) e nos dois
perfis do Playwright, antes e depois, e exigir diferença zero. Deu 3718 amostras em
`chromium-desktop` e 1524 em `chromium-mobile` (onde o toque emulado muda os blocos
`@media (hover: hover)`), zero diferenças nas duas.

Cuidado com a sonda no perfil `chromium-mobile`: chamar `setViewportSize` por cima da
emulação de dispositivo **fecha a página**. Nesse perfil use o tamanho do próprio perfil.

## Atalhos de teclado (13/11/2026)

- Atalho de **uma** tecla passa por `alvoEditavel(e.target)` em `useGlobalHotkeys`, senão
  escrever esse caractere numa mensagem acciona a ação. Com Ctrl/Cmd pode (e deve) disparar
  com o cursor no composer.
- Atalho novo entra **também** na lista do `ShortcutsOverlay` (tecla `?`). O que não está lá
  não existe para o atendente.
- Painel de ajuda trata o Escape em **captura** no `window`; não entra em
  `conversationEscapeOrder.js` (ordem com teste dedicado).

## Nome acessível e anel de foco (13/11/2026)

- Botão **só de ícone** leva `aria-label`. Espelhar o `title` quando já existe (mesma string:
  o nome efetivo não muda, mas deixa de depender do `title`, que no toque não aparece e em
  leitor de ecrã é configurável).
- Botão que **já tem texto visível** (inclusive vindo de expressão, `{progressLabel}`) **não**
  leva `aria-label`: sobrescreveria o rótulo visível e dessincroniza o nome do que se lê na
  tela. Foi por isso que o `wa-catalogPicker-sendBtn` e os dois CTA de sincronização antiga do
  `ConversaThread` ficaram de fora.
- Anel de foco: só `:focus-visible` com `outline: 2px solid var(--ds-focus-ring)` e
  `outline-offset: 2px`, no bloco ACESSIBILIDADE do `conversa.css`. `outline` não entra no
  fluxo, por isso não desloca nada; e `:focus-visible` não pinta no clique de rato.

### Testes e2e com falha ANTERIOR a estas mudanças (não são regressão)

`e2e/search-keyboard-media.spec.js` tem 2 testes a falhar em `main`, confirmado a correr a
suíte com os ficheiros revertidos:

1. `busca da Minha fila…` — `requests.at(-1).searchParams.get('minha_fila')` vem `null`.
2. `falha de mídia mostra aviso de F5…` — o selector `input[accept^=".pdf,.doc,.docx,image"]`
   **não pode casar**: o `accept` real em `AttachmentInputs.jsx` é
   `.pdf,.doc,.docx,.cdr,.ai,.eps,.psd,image/*,…` — alguém acrescentou `.cdr,.ai,.eps,.psd` e
   não atualizou o teste.

E `audit-local-mock.spec.js › composer mantém teclado…` (chromium-desktop) é **flake**: com o
mesmo código, uma execução passa a suíte inteira e a seguinte falha no toggle do menu de ações.


## Auditoria de UX do atendimento (16/11/2026)

Medido com Playwright + perfil do Chrome num build de produção. Não reintroduzir:

- **Nada de `will-change` fixo em elemento repetido.** `.wa-audioBar` tinha `will-change:
  transform`: 26 camadas por áudio, 78 com 3 áudios na tela, recompostas a cada frame (inclusive
  ao digitar). Camadas 125 → 40; Layerize por frame 10,5 → 4,5ms. `will-change` só no elemento
  que anima, e só enquanto anima.
- **Linhas virtualizadas usam `translateY`, não `translate3d`** (thread e lista): o 3D promove
  cada linha a camada própria.
- **Auto-grow do campo** (`syncTextareaHeight`): só volta a `height:auto` quando o texto
  ENCOLHE. Antes eram 2 reflows síncronos da coluna inteira por tecla (layouts 212 → 72 em 70
  teclas).
- **`messageRowVisualSignature` inclui `tickSignature`** — sem isso o tique âmbar "envio
  demorado" (watchdog 45s) nunca aparecia na thread. `tzVersion` também é prop do `ThreadRow`.
- **Chaves de mídia começam pelo `tempId`** (`msgKey` do áudio, `mediaRatioKey`): `id` e
  `whatsapp_id` chegam em patches separados após o envio; com eles à frente o player voltava a
  "0:00" e a foto voltava ao quadrado. Vídeo só reseta quando o `src` muda.
- **Animação de entrada da bolha é estado React** (`entering`), encerrado em `animationend` E
  `animationcancel`. Mensagem que chega longe do fim é marcada como vista na hora.
- **Seletor de reação do desktop é absoluto** acima da bolha (antes crescia a bolha ~36px).
  Reação do cliente (`item.__reaction`) vai com `reactionFromPeer`: não é "Sua reação" nem
  removível; "Reação" sem emoji = remoção (antes virava badge "ão").
- **`sending` global não trava controles do composer** (emoji, +, câmera, X da resposta) —
  só a edição trava enquanto salva (`controlsBusy`).
- **Maiúscula inicial** respeita o botão "Correção/A" e não age em texto colado/arrastado.
- **Ações do cabeçalho:** erro sem resposta (timeout/rede) tem texto em português e dispara
  `refresh({silent:true})` em vez de confiar no revert otimista. Transferir fecha após o POST
  (GET em 2.º plano); Puxar usa refresh silencioso quando o histórico já estava visível.
- **Overlays fixed dentro da área do chat vão por portal** (`ShortcutsOverlay`, `ChatToast`):
  `.atendimento-chat-area` tem `isolation: isolate`.
- **641–768px (iPad retrato):** a barra de navegação só some com conversa aberta até 640px.
- **Composer informa a altura do BLOCO** (`.wa-composerStack`) em `onTextMetrics`: a barra de
  resposta/edição também reancora a thread no fim.

### Pendências conhecidas (não feitas nesta auditoria)

- **Barra fixada / "marcar como lida" / banner de encerrado chegado por socket** ainda deslocam
  a thread (~44px medido) quando o atendente está no meio do histórico. Tentativa com
  MutationObserver + `scrollMargin` revertida: as linhas são pintadas em `translateY(start)` e
  o `start` do TanStack JÁ inclui `scrollMargin`, então mudar a margem move raiz e linhas — a
  compensação precisa de âncora por DOM (linha visível + `getBoundingClientRect`), não de
  aritmética de margem. Também derivou o histórico ao interagir com `.wa-loadOlder*`.
- Reabrir conversa pelo envio espera a rede ANTES da bolha otimista e pode inverter a ordem de
  2 mensagens rápidas (mover `garantirConversaAbertaParaEnvio` para dentro da fila `runSend`).
- Grupos: `BubbleTypedContent` remonta quando `__showRemetente` alterna; onda do áudio mede
  34 barras e depois N (fazer `update()` síncrono); cartão de link compacto não vai ao cache;
  "apagar para todos" tira o `tempId` e remonta a bolha.
- Painéis com `top` cravado (timeline 60px, busca 66px, tags/setor 64px) cobrem a linha de
  setor do cabeçalho de 2 linhas — publicar `--wa-header-h` também no desktop.
- Lista: estimador de altura usa entradas diferentes da linha (responsável/selo no modo
  simples); negrito de não lida chega ~1s depois do card subir.
