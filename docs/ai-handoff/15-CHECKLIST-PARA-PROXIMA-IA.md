# Checklist para a próxima IA (frontend)

> 2026-08-23. Use com o [índice-mestre](../../../docs/ai-handoff/00-LEIA-PRIMEIRO.md) — não carregue a série inteira.

## Antes de qualquer alteração

- [ ] Ler `00-LEIA-PRIMEIRO.md` e **só** os docs da sessão da tarefa.
- [ ] `git status --short` e não descartar mudanças do usuário.
- [ ] Abrir o arquivo real em `frontend/src` (não `dist/`, não `_ANTIGOS`).
- [ ] Declarar impacto: lista, thread, socket, auth, rota, CSS mobile.

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
