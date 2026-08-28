# Autenticação e permissões (frontend)

> 2026-08-23 · `src/auth/*`, `ProtectedRoute`, interceptors em `api/http.js`.

## Sessão (CONFIRMADO)

| Item | Valor |
|------|--------|
| Storage | `localStorage.zap_erp_auth` = `{ token, user }` |
| Extra | `zap_erp_last_email` (lembrar e-mail no login) |
| HTTP | `Authorization: Bearer <token>` lido **sempre do localStorage** no interceptor |
| Socket | `io(base, { auth: { token } })` |
| Sync abas | `window` `storage` em `zap_erp_auth`: logout numa aba encerra as outras; login reidrata quem estava no Login |

`authStore.restore()` no boot de `main.jsx`. Login: `POST` via `authService` → normaliza `user.role` a partir de `perfil|role` → persiste → `initSocket` → push → `fetchPermissoes` → `syncUsuarioMe` → `fetchEmpresa` → navigate `/atendimento`.

Logout/`clearSession`: remove storage, `disconnectSocket`, limpa chats/conversa/permissoes/empresa, unsubscribe push. 401 com Bearer (exceto login e `skipAuthLogout`) dispara o mesmo caminho e manda a `/login`.

`company_id` vem no `user` do login/restore. HelpDesk e `join_empresa` usam `user.company_id` (aliases `empresa_id` no payload socket). **INFERÊNCIA:** o frontend não é barreira de tenant; só evita aplicar evento de outra empresa na UI.

## `can(codigo, user)` — CONFIRMADO

Arquivo: `src/auth/permissions.js`.

1. Se `permissoesStore.permissoes` já tem a chave `codigo`, usa o boolean da API.
2. Senão, fallback de **role** só para: `dashboard_acessar`, `config_acessar`, `usuarios_acessar`, `chatbot_acessar`, `departamentos_gerenciar`.
3. Qualquer outro código sem chave na API → `false`.

Helpers de ação de conversa (`canAssumir`, `canTransferir`, `canEncerrar`, `canReabrir`, `canPuxarFila`, `canTag`, `canTransferirSetorConversa`) são **role** admin/supervisor/atendente, não catálogo.

Helpers que olham API com código pontuado:

| Helper | Código API | Fallback |
|--------|------------|----------|
| `canGerenciarRespostasSalvas` | `atendimentos.respostas_salvas` | admin, supervisor, atendente |
| `canNotaInterna` | `atendimentos.nota_interna` | idem |
| `canAcessarDisparo` | `disparo.ver` | **somente** `role === "admin"`, **e** `user.modulo_campanhas_ativo === true` |

`isSupervisorOrAdmin`: `admin` \| `administrador` \| `supervisor`.

## Store de permissões

`permissoesStore` chama `GET /usuarios/me/permissoes` e monta `{ [codigo]: boolean }` iterando **array** `{ codigo, valor|valor_efetivo|granted }`.

**INFERÊNCIA de risco:** se o backend passar a devolver **mapa** `{ codigo: boolean }` em vez de array, o store fica `{}` e os gates de `*_acessar` caem no fallback de role. Confira o JSON real antes de “corrigir” o parser.

`AppRoutes` e `MainLayout` **devem** assinar `permissoes` no seletor Zustand. `can()` usa `getState()` e sozinho não re-renderiza.

## Dialeto dos códigos (CONFIRMADO no FE, cruzar com BE)

O catálogo backend (`permissoesCatalogo`) usa sobretudo `dashboard.ver`, `config.ver`, `ia.ver`, `disparo.ver`, `atendimentos.*`.

O menu/rotas do FE usam `dashboard_acessar`, `config_acessar`, `chatbot_acessar`, `usuarios_acessar`. Só `disparo.ver` e os dois `atendimentos.*` acima batem com o catálogo.

**INFERÊNCIA:** Dashboard/Config/Bot/Usuários, na prática, dependem do fallback de role até alguém alinhar os códigos. Não “consertar” copiando o código do backend para o `can()` sem ver o payload de `/usuarios/me/permissoes`.

Tela `/permissoes` (`SecaoPermissoes`) edita o catálogo real (grant / deny / default) via `GET/PUT /usuarios/:id/permissoes` e `GET /config/permissoes/catalogo` (paths no `permissoesService.js` — confirmar aliases `/api`).

## Casos especiais

- **HelpDesk:** `Number(user?.company_id) === 1`. Não é permissão. Outras empresas nem veem o item.
- **CRM:** item sempre visível. SSO em `CrmAvancadoRedirect`; 503 → UI local.
- **Disparo:** exige `user.modulo_campanhas_ativo === true` (flag da empresa, default off) **e** `disparo.ver` ou admin. O admin liga o módulo em Configurações → Geral com senha de ativação (`PUT /config/empresa` + `senha_modulo_campanhas`; a senha não vai no bundle). Não ligar envio real pelo FE; o worker live é decisão de backend/ops.
- **Config modo respostas:** quem só tem `atendimentos.respostas_salvas` entra em `/configuracoes` mas a página restringe tabs — CONFIRMADO pela gate da rota.

## O que nunca fazer

- Guardar token em cookie ad hoc ou em Zustand **sem** espelhar `zap_erp_auth` (HTTP e socket leem o storage).
- Confiar em `user.company_id` vindo de querystring.
- Criar `if (user.role === "admin")` solto em página nova — use `can()` / helpers.
- Remover a subscrição de `permissoes` em `AppRoutes`/`MainLayout`.
