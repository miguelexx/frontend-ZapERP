import { useEffect, useState, useCallback, useMemo } from "react";
import {
  getCatalogoPermissoes,
  getPermissoesUsuario,
  putPermissoesUsuario,
} from "../api/permissoesService";
import "./Configuracoes.css";

const VALOR_GRANT = "grant";
const VALOR_DENY = "deny";
const VALOR_DEFAULT = "default";

/**
 * Converte catálogo em lista plana agrupada por categoria.
 * Aceita: [{ codigo, nome, categoria }] ou { categorias: [{ nome, permissoes: [...] }] }
 */
function normalizarCatalogo(raw) {
  const list = [];
  if (Array.isArray(raw)) {
    for (const p of raw) {
      list.push({
        codigo: p?.codigo ?? p?.cod,
        nome: p?.nome ?? p?.descricao ?? p?.codigo ?? "",
        categoria: p?.categoria ?? "Outros",
      });
    }
  } else if (raw?.categorias) {
    for (const cat of raw.categorias) {
      const catNome = cat?.nome ?? cat?.categoria ?? "Outros";
      const perms = cat?.permissoes ?? [];
      for (const p of perms) {
        list.push({
          codigo: p?.codigo ?? p?.cod,
          nome: p?.nome ?? p?.descricao ?? p?.codigo ?? "",
          categoria: catNome,
        });
      }
    }
  }
  return list;
}

/**
 * Agrupa por categoria mantendo ordem das categorias.
 */
function agruparPorCategoria(lista) {
  const cats = [];
  const seen = new Set();
  for (const p of lista) {
    const c = p.categoria || "Outros";
    if (!seen.has(c)) {
      seen.add(c);
      cats.push(c);
    }
  }
  const grupos = {};
  for (const p of lista) {
    const c = p.categoria || "Outros";
    if (!grupos[c]) grupos[c] = [];
    grupos[c].push(p);
  }
  return cats.map((cat) => ({ categoria: cat, permissoes: grupos[cat] || [] }));
}

export default function SecaoPermissoes({
  usuarios = [],
  usuarioIdInicial = "",
  onUsuarioIdChange,
  onRefresh,
}) {
  const [usuarioId, setUsuarioId] = useState(usuarioIdInicial);
  const [catalogo, setCatalogo] = useState([]);
  const [permissoesUsuario, setPermissoesUsuario] = useState({});
  const [localOverrides, setLocalOverrides] = useState({}); // { codigo: "grant"|"deny"|"default" }
  const [loadingCatalogo, setLoadingCatalogo] = useState(true);
  const [loadingUsuario, setLoadingUsuario] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const loadCatalogo = useCallback(async () => {
    setLoadingCatalogo(true);
    try {
      const data = await getCatalogoPermissoes();
      const lista = normalizarCatalogo(data);
      setCatalogo(lista);
    } catch (e) {
      setMsg({ type: "err", text: "Erro ao carregar catálogo de permissões." });
      setCatalogo([]);
    } finally {
      setLoadingCatalogo(false);
    }
  }, []);

  useEffect(() => {
    loadCatalogo();
  }, [loadCatalogo]);

  useEffect(() => {
    if (usuarioIdInicial) setUsuarioId(usuarioIdInicial);
  }, [usuarioIdInicial]);

  const handleUsuarioIdChange = (id) => {
    setUsuarioId(id);
    onUsuarioIdChange?.(id);
  };

  const loadUsuarioPermissoes = useCallback(async (id) => {
    if (!id) {
      setPermissoesUsuario({});
      setLocalOverrides({});
      return;
    }
    setLoadingUsuario(true);
    setMsg(null);
    try {
      const data = await getPermissoesUsuario(id);
      const list = data?.permissoes ?? (Array.isArray(data) ? data : []);
      const map = {};
      const overrides = {};
      for (const p of list) {
        const cod = p?.codigo ?? p?.cod;
        if (cod) {
          const v = p?.valor ?? p?.valor_efetivo;
          const isGrant = v === true || v === "grant" || v === "granted";
          map[cod] = isGrant;
          if (v === "grant" || v === "deny" || v === "default") {
            overrides[cod] = v;
          } else if (v === true || v === "granted") {
            overrides[cod] = VALOR_GRANT;
          } else if (v === false || v === "denied") {
            overrides[cod] = VALOR_DENY;
          }
        }
      }
      setPermissoesUsuario(map);
      setLocalOverrides(overrides);
    } catch (e) {
      setMsg({ type: "err", text: "Erro ao carregar permissões do usuário." });
      setPermissoesUsuario({});
      setLocalOverrides({});
    } finally {
      setLoadingUsuario(false);
    }
  }, []);

  useEffect(() => {
    if (usuarioId) loadUsuarioPermissoes(usuarioId);
    else {
      setPermissoesUsuario({});
      setLocalOverrides({});
    }
  }, [usuarioId, loadUsuarioPermissoes]);

  const grupos = useMemo(
    () => agruparPorCategoria(catalogo),
    [catalogo]
  );

  const setOverride = (codigo, valor) => {
    setLocalOverrides((prev) => ({ ...prev, [codigo]: valor }));
  };

  const getValorEfetivo = (codigo) => {
    return localOverrides[codigo] ?? VALOR_DEFAULT;
  };

  const isOverride = (codigo) => {
    const v = localOverrides[codigo];
    return v === VALOR_GRANT || v === VALOR_DENY;
  };

  const handleRestaurarPadrao = () => {
    if (!usuarioId) return;
    setLocalOverrides({});
  };

  const handleSalvar = async () => {
    if (!usuarioId) return;
    setSaving(true);
    setMsg(null);
    try {
      const permissoes = Object.entries(localOverrides)
        .filter(([, v]) => v !== VALOR_DEFAULT)
        .map(([codigo, valor]) => ({ codigo, valor }));
      await putPermissoesUsuario(usuarioId, permissoes);
      setMsg({ type: "ok", text: "Permissões salvas com sucesso." });
      loadUsuarioPermissoes(usuarioId);
      onRefresh?.();
    } catch (e) {
      setMsg({
        type: "err",
        text: e?.response?.data?.error || "Erro ao salvar permissões.",
      });
    } finally {
      setSaving(false);
    }
  };

  const temOverrides = Object.values(localOverrides).some(
    (v) => v === VALOR_GRANT || v === VALOR_DENY
  );

  return (
    <div className="ia-section secao-permissoes">
      <div className="config-headRow">
        <div>
          <h4 style={{ margin: 0 }}>Permissões</h4>
          <p className="ia-muted" style={{ margin: "6px 0 0" }}>
            Selecione um usuário e edite suas permissões (conceder, negar ou restaurar ao padrão do perfil).
          </p>
        </div>
      </div>

      <div className="ia-field" style={{ marginTop: 16, maxWidth: 320 }}>
        <label>Usuário</label>
        <select
          className="ia-select"
          value={usuarioId}
          onChange={(e) => handleUsuarioIdChange(e.target.value)}
          aria-label="Selecionar usuário"
        >
          <option value="">Selecione...</option>
          {usuarios.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.nome || u.email} ({u.perfil || "atendente"})
            </option>
          ))}
        </select>
      </div>

      {msg && (
        <div
          className={`ia-error-banner ${msg.type === "ok" ? "is-ok" : ""}`}
          role="alert"
          style={{ marginTop: 12 }}
        >
          {msg.text}
          <button type="button" onClick={() => setMsg(null)}>
            ×
          </button>
        </div>
      )}

      {loadingCatalogo && (
        <p className="ia-muted" style={{ marginTop: 16 }}>
          Carregando catálogo...
        </p>
      )}

      {!loadingCatalogo && !usuarioId && catalogo.length > 0 && (
        <p className="ia-muted" style={{ marginTop: 16 }}>
          Selecione um usuário para editar as permissões.
        </p>
      )}

      {!loadingCatalogo && usuarioId && (
        <>
          <div
            className="config-headActions"
            style={{
              marginTop: 16,
              marginBottom: 16,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="ia-btn ia-btn--outline"
              onClick={handleRestaurarPadrao}
              disabled={!temOverrides || saving}
              title="Remove todos os overrides e restaura o padrão do perfil"
            >
              Restaurar padrão
            </button>
            <button
              type="button"
              className="ia-btn ia-btn--primary"
              onClick={handleSalvar}
              disabled={saving}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>

          {loadingUsuario ? (
            <p className="ia-muted">Carregando permissões...</p>
          ) : (
            <div className="permissoes-grid">
              {grupos.map(({ categoria, permissoes }) => (
                <div
                  key={categoria}
                  className="permissoes-categoria"
                  data-categoria={categoria}
                >
                  <h5 className="permissoes-categoria-titulo">{categoria}</h5>
                  <div className="permissoes-lista">
                    {permissoes.map((p) => (
                        <PermissaoRow
                          key={p.codigo}
                          codigo={p.codigo}
                          nome={p.nome}
                          valor={getValorEfetivo(p.codigo)}
                          override={isOverride(p.codigo)}
                          onValorChange={(v) => setOverride(p.codigo, v)}
                        />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
    </div>
  );
}

function PermissaoRow({ codigo, nome, valor, override, onValorChange }) {
  return (
    <div
      className={`permissoes-row ${override ? "permissoes-row--override" : ""}`}
      title={override ? `Override: ${valor === VALOR_GRANT ? "Concedido" : "Negado"}` : "Padrão do perfil"}
    >
      <div className="permissoes-row-info">
        <span className="permissoes-row-nome">{nome || codigo}</span>
        {override && (
          <span
            className={`permissoes-row-badge ${
              valor === VALOR_GRANT ? "permissoes-row-badge--grant" : "permissoes-row-badge--deny"
            }`}
          >
            {valor === VALOR_GRANT ? "Concedido" : "Negado"}
          </span>
        )}
      </div>
      <div className="permissoes-row-actions">
        <label className="permissoes-radio">
          <input
            type="radio"
            name={`perm-${codigo}`}
            checked={valor === VALOR_DEFAULT}
            onChange={() => onValorChange(VALOR_DEFAULT)}
          />
          <span>Padrão</span>
        </label>
        <label className="permissoes-radio">
          <input
            type="radio"
            name={`perm-${codigo}`}
            checked={valor === VALOR_GRANT}
            onChange={() => onValorChange(VALOR_GRANT)}
          />
          <span>Conceder</span>
        </label>
        <label className="permissoes-radio">
          <input
            type="radio"
            name={`perm-${codigo}`}
            checked={valor === VALOR_DENY}
            onChange={() => onValorChange(VALOR_DENY)}
          />
          <span>Negar</span>
        </label>
      </div>
    </div>
  );
}
