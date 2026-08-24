# Contexto do frontend para IAs

> Revisado em 2026-08-23. Código em `frontend/src` prevalece.

Handoff completo (ler por sessão, não tudo de uma vez): [`docs/ai-handoff/`](docs/ai-handoff/00-LEIA-PRIMEIRO.md).

Índice do monorepo (qual pacote carregar): [`../docs/ai-handoff/00-LEIA-PRIMEIRO.md`](../docs/ai-handoff/00-LEIA-PRIMEIRO.md).

Regras críticas: preserve isolamento por `company_id`; não quebre o layout mobile/tablet do atendimento; não invente provider Z-API; lazy/memo/stores Zustand já existentes devem ser reutilizados. Não execute commit, push ou deploy sem autorização.

Ao alterar rotas, auth, socket, lista de chats, thread, composer ou permissões, atualize o documento correspondente em `docs/ai-handoff/` no mesmo trabalho. Marque o que não puder confirmar como `NÃO CONFIRMADO` ou `PENDENTE DE VALIDAÇÃO`.
