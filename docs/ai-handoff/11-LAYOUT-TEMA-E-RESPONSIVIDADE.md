# Layout, tema e responsividade

> 2026-08-23 · `styles/theme.css`, `app.css`, `zap-animations.css`, `MainLayout.jsx`. Skill visual: `.cursor/skills/zaperp-ui-premium/SKILL.md`.

## Tokens (CONFIRMADO)

`theme.css`: `--light-*`, `--ds-*`, `--wa-*` (bolhas, glow), `--zaperp-*` (chat dark), `--dash-*`. Light: `:root` / `[data-theme=light]`. Dark: `[data-theme=dark]`. Aliases legados `--bg-app`, `--green`. Accent estilo WhatsApp `#00A884`.

Aplicação: `document.documentElement.dataset.theme`; `localStorage.theme`; evento `theme-change`. Toggle no footer da sidebar.

Fonte: **Inter** no `index.html` (já é o sistema; não trocar num redesign pontual).

`app.css`: `.app-layout`, `.sidebar`, `.atendimento-layout` (lista + thread). Animações: `transform`/`opacity`, curtas, `prefers-reduced-motion`.

## Shell

```
.app-layout
  skip-link #main-content
  GlobalNotifications, PushPermissionPrompt
  InternalChatGlobalSocketBridge, HelpDeskGlobalSocketBridge
  aside.sidebar  (nav + tema + avatar + logout)
  main#main-content  <Outlet />
```

Um dono de scroll por região: sidebar lista, thread, painel cliente. Evitar `overflow` aninhado + `100vh`. Flex/grid com `min-height: 0` no caminho do atendimento.

## Breakpoints usados de fato (CONFIRMADO)

| Largura | Uso |
|---------|-----|
| ≤640px | Atendimento: lista XOR thread; teclado visualViewport; history marker |
| ≤768px | Nav compacta / badge unread no layout |
| ~741–1024 | Tablet composer/header |
| 480 / 520 / 560 / 720 / 980 | refinamentos em `conversa.css` / `chatList.css` |

`pointer: coarse` vs `hover: hover` para toque. Áreas de toque ≥ ~44px nas ações do header/composer.

## Mobile — não quebrar

- Teclado não pode cobrir o composer (`useMobileKeyboardViewport`).
- Voltar fecha a thread, não o ticket.
- Preview de imagem no envio tem fluxo mobile próprio (`ImageSendPreviewMobile`).
- Gravação de áudio: lifecycle idempotente; não deixar MediaStream vivo ao desmontar.
- iOS Safari dá zoom em `input` com `font-size` calculado < 16px. A busca da lista (`.chat-list-search-input`) deve ficar em **16px** em `max-width: 640px`. Não “consertar” com `maximum-scale=1` no viewport (quebra pinch-zoom). A compactação studio de 13px no desktop não pode vencer essa regra no telefone.

## Acessibilidade mínima já presente

Skip link, `aria-busy` no lazy fallback, toasts em live region. Não remova ao “limpar JSX”.

## Ao mudar CSS

Prefira tokens. Não introduza segundo design system. Teste lista+thread em 390px, 768px e 1280px — não só um screenshot desktop.

## 2026-11-16 — Cabeçalho e composer no telemóvel (atendimento 1:1)

Pedido do Miguel com print: cabeçalho a ocupar demasiado e uma faixa morta debaixo do composer.

**Faixa debaixo do composer.** Era o `main-content`: com a conversa aberta ele reservava
`env(safe-area-inset-bottom)` (`styles/app.css`, bloco `max-width: 768px`) e sobrava uma tira do
fundo do app entre a barra de escrever e a borda do ecrã — no iPhone, a altura inteira da home
indicator. Agora o `main-content` não reserva nada nesse estado e quem reserva é o **próprio
composer**: `.wa-footer` leva `padding-bottom: calc(10px + env(safe-area-inset-bottom))` (base e
≤640px), portanto o fundo da barra cobre a faixa, como no WhatsApp. Com teclado aberto as regras
de `.wa-keyboard-visible` continuam a mandar (`!important`, padding fixo) — o inset da safe-area
não pode somar por cima do teclado.

**Cabeçalho (`.wa-header--atendMobile`, 2 linhas).** De 86px para ~78px a 393px:
`4 + 34 (identidade) + 3 (row-gap) + 32 (ações) + 4`. Botão voltar 34→32px, e os botões da 2ª
linha (Assumir, Transf., Encerrar, setor) **38→32px** — o `min-height: 38px` vinha de
`conversa.polish.css` (bloco "Alvos de toque", 05/11/2026) e foi baixado lá, no `conversa.css`
(`.wa-atendToolbar--compact`, assumir-hero e o override tardio do transferir) nos três sítios,
senão um deles ganha a cascata. Restrição do pedido: **"Assumir" e "Transferir" têm de continuar
sempre visíveis** — não os mandar para o menu ⋯.
