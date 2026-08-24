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

## Acessibilidade mínima já presente

Skip link, `aria-busy` no lazy fallback, toasts em live region. Não remova ao “limpar JSX”.

## Ao mudar CSS

Prefira tokens. Não introduza segundo design system. Teste lista+thread em 390px, 768px e 1280px — não só um screenshot desktop.
