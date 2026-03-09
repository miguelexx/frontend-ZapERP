# Página de Permissões — Documentação Frontend

## APIs utilizadas

| Endpoint | Método | Uso |
|----------|--------|-----|
| `/config/permissoes/catalogo` | GET | Catálogo de permissões (para a página de edição) |
| `/usuarios/:id/permissoes` | GET | Carregar permissões de um usuário |
| `/usuarios/:id/permissoes` | PUT | Salvar permissões de um usuário |
| `/usuarios/me/permissoes` | GET | Permissões do usuário logado (menus e rotas) |

## Formato esperado

### GET /config/permissoes/catalogo

Retorna o catálogo de permissões. Aceita:

**Formato array:**
```json
[
  { "codigo": "dashboard_acessar", "nome": "Acessar Dashboard", "categoria": "Navegação" },
  { "codigo": "config_acessar", "nome": "Acessar Configurações", "categoria": "Navegação" }
]
```

**Formato categorias:**
```json
{
  "categorias": [
    {
      "nome": "Navegação",
      "permissoes": [
        { "codigo": "dashboard_acessar", "nome": "Acessar Dashboard" }
      ]
    }
  ]
}
```

### GET /usuarios/:id/permissoes

```json
{
  "permissoes": [
    { "codigo": "dashboard_acessar", "valor": "grant" },
    { "codigo": "config_acessar", "valor": "deny" },
    { "codigo": "usuarios_acessar", "valor": "default" }
  ]
}
```

`valor`: `"grant"` | `"deny"` | `"default"` — `default` usa o padrão do perfil.

### PUT /usuarios/:id/permissoes

**Body:**
```json
{
  "permissoes": [
    { "codigo": "config_acessar", "valor": "grant" },
    { "codigo": "chatbot_acessar", "valor": "deny" }
  ]
}
```

Apenas overrides (grant/deny) são enviados. Permissões em `default` não precisam ser enviadas.

### GET /usuarios/me/permissoes

Formato idêntico ao GET /usuarios/:id/permissoes. Usado ao carregar o app para menus e proteção de rotas.

## Integração

- **authStore**: Chama `fetchPermissoes()` no login e no restore (refresh).
- **permissoesStore**: Armazena `{ [codigo]: boolean }` (true = grant).
- **permissions.js**: `can(codigo, user)` prioriza API; fallback por role para codigos conhecidos.
- **MainLayout / AppRoutes**: Usam `can("config_acessar", user)`, etc.
