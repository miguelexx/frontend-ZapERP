# Checklist para a próxima IA (frontend)

> 2026-08-23. Atualizado 2026-08-24 — adicionados protocolos de declaração pré-ação e mandato de documentação.

## Declaração pré-ação (obrigatório antes de escrever qualquer código)

Antes de tocar em qualquer arquivo, declare explicitamente:

- [ ] **Componentes, stores e serviços afetados** — listar o que será lido e/ou editado
- [ ] **Impacto em caminho quente** — altera lista de conversas? thread? composer? socket? auth? CSS mobile?
- [ ] **Testes existentes relevantes** — quais suites Jest/Playwright cobrem o módulo
- [ ] **Risco mobile** — a mudança pode quebrar o teclado/scroll em iOS ou Android?

Não prosseguir sem esta declaração.

## Mandato de documentação (obrigatório ao terminar)

- [ ] Se encontrou algo relevante não documentado → adicionar ao doc correspondente em `docs/ai-handoff/` antes de encerrar
- [ ] Se um item está marcado **PENDENTE DE VALIDAÇÃO** e você validou no browser → atualizar o status
- [ ] Nunca encerrar a sessão com conhecimento novo não registrado

## Antes de qualquer alteração

- [ ] Ler `00-LEIA-PRIMEIRO.md` e **só** os docs da sessão da tarefa.
- [ ] `git status --short` e não descartar mudanças do usuário.
- [ ] Abrir o arquivo real em `frontend/src` (não `dist/`, não `_ANTIGOS`).
- [ ] Declarar impacto: lista, thread, socket, auth, rota, CSS mobile.
- [ ] Para PENDENTE DE VALIDAÇÃO relevante: validar no browser antes de assumir.

## Caminho quente (lista / thread / composer)

- [ ] Preservar memo/compare (`chatListRowCompare`, `threadRowCompare`) e virtualização.
- [ ] Não assinar arrays grandes em componentes folha.
- [ ] Manter envio otimista + reconcile + outbox texto + watchdog.
- [ ] Dedupe por `whatsapp_id`/`id`/`tempId`; não colapsar áudios distintos.
- [ ] Sticky nome/foto; unread só inbound; `shouldIgnoreByCompany`.
- [ ] Fechar thread ≠ encerrar atendimento.
- [ ] Testar 390px / 768px / 1280px se mexer layout.

## Auth, rotas, menu

- [ ] Mesmo predicado na rota e no item da sidebar.
- [ ] `AppRoutes`/`MainLayout` continuam assinando `permissoes`.
- [ ] HelpDesk permanece `company_id === 1`.
- [ ] Disparo: `canAcessarDisparo`; não ligar worker live.

## Socket / HTTP

- [ ] Listener novo só no client central ou bridge global.
- [ ] Path HTTP copiado do service existente; 401/timeout/toasts intactos.
- [ ] Cruzar nome de evento com o backend.

## CRM / legado

- [ ] Não tratar UI CRM local como API garantida; SSO primeiro.
- [ ] Nomes `zapi*` = legado; produto é UltraMSG.
- [ ] Não reativar `/campanhas` antiga.

## Entrega

- [ ] Atualizar o doc da sessão se a arquitetura mudou.
- [ ] Citar paths. Distinguir CONFIRMADO / INFERÊNCIA / PENDENTE DE VALIDAÇÃO.
- [ ] Dizer quais testes rodaram (`npm run test:*` no frontend, Playwright). Não afirmar “passou” sem rodar.
- [ ] Sem commit/push/deploy a menos que o usuário peça.

## Nunca executar sozinho

Migration, envio WhatsApp real, worker de disparo live, credencial de produção, `git push`, discard do working tree do usuário.

Se faltar evidência: arquivo consultado + hipótese + o que validar. Não preencher com memória de outro chat.
