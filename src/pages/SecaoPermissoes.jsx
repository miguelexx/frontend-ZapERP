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

/** Formata departamentos do usuário para exibição (array ou objeto único) */
function formatUsuarioDepartamentos(u) {
  if (!u) return "—";
  const deps = u.departamentos;
  if (Array.isArray(deps) && deps.length > 0) {
    return deps.map((d) => d?.nome).filter(Boolean).join(", ") || "—";
  }
  if (deps?.nome) return deps.nome;
  return "—";
}

/**
 * Converte catálogo em lista plana agrupada por categoria.
 * Aceita formatos:
 * - Backend: { catalogo: [{ categoria, permissoes: [...] }] } ou array direto
 * - Alternativo: { categorias: [{ nome, permissoes: [...] }] }
 * - Array plano: [{ codigo, nome, categoria }]
 */
function normalizarCatalogo(raw) {
  const list = [];
  const addPerm = (p, catNome) => {
    list.push({
      codigo: p?.codigo ?? p?.cod,
      nome: p?.nome ?? p?.descricao ?? p?.codigo ?? "",
      descricao: p?.descricao ?? "",
      categoria: catNome,
    });
  };

  if (Array.isArray(raw)) {
    for (const p of raw) {
      addPerm(p, p?.categoria ?? "Outros");
    }
  } else if (Array.isArray(raw?.catalogo)) {
    for (const cat of raw.catalogo) {
      const catNome = cat?.categoria ?? cat?.nome ?? "Outros";
      const perms = cat?.permissoes ?? [];
      for (const p of perms) addPerm(p, catNome);
    }
  } else if (raw?.categorias) {
    for (const cat of raw.categorias) {
      const catNome = cat?.nome ?? cat?.categoria ?? "Outros";
      const perms = cat?.permissoes ?? [];
      for (const p of perms) addPerm(p, catNome);
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
  const [usuarioInfo, setUsuarioInfo] = useState(null); // { nome, email, perfil, departamento_ids, departamentos }
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
      setUsuarioInfo(null);
      return;
    }
    setLoadingUsuario(true);
    setMsg(null);
    try {
      const data = await getPermissoesUsuario(id);
      const usuario = data?.usuario ?? null;
      const list = data?.permissoes ?? (Array.isArray(data) ? data : []);
      const map = {};
      const overrides = {};
      for (const p of list) {
        const cod = p?.codigo ?? p?.cod;
        if (cod) {
          // Backend retorna: concedido (true/false) e isOverride (true/false)
          const concedido = p?.concedido ?? (p?.valor === true || p?.valor === "grant" || p?.valor === "granted");
          const isOverride = p?.isOverride ?? false;
          map[cod] = !!concedido;
          if (isOverride) {
            overrides[cod] = concedido ? VALOR_GRANT : VALOR_DENY;
          }
        }
      }
      setUsuarioInfo(usuario);
      setPermissoesUsuario(map);
      setLocalOverrides(overrides);
    } catch (e) {
      setMsg({ type: "err", text: "Erro ao carregar permissões do usuário." });
      setPermissoesUsuario({});
      setLocalOverrides({});
      setUsuarioInfo(null);
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

  const handleRestaurarPadrao = async () => {
    if (!usuarioId) return;
    const codigosComOverride = Object.entries(localOverrides)
      .filter(([, v]) => v === VALOR_GRANT || v === VALOR_DENY)
      .map(([cod]) => cod);
    if (codigosComOverride.length === 0) return;
    if (!window.confirm("Remover todas as permissões personalizadas e usar o padrão do perfil?")) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload = Object.fromEntries(codigosComOverride.map((c) => [c, null]));
      await putPermissoesUsuario(usuarioId, payload);
      setMsg({ type: "ok", text: "Padrão do perfil restaurado com sucesso." });
      setLocalOverrides({});
      loadUsuarioPermissoes(usuarioId);
      onRefresh?.();
    } catch (e) {
      setMsg({
        type: "err",
        text: e?.response?.data?.error || "Erro ao restaurar padrão.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSalvar = async () => {
    if (!usuarioId) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload = {};
      for (const [codigo, valor] of Object.entries(localOverrides)) {
        if (valor === VALOR_GRANT) payload[codigo] = true;
        else if (valor === VALOR_DENY) payload[codigo] = false;
        else if (valor === VALOR_DEFAULT) payload[codigo] = null;
      }
      if (Object.keys(payload).length === 0) {
        setMsg({ type: "ok", text: "Nenhuma alteração para salvar." });
        return;
      }
      await putPermissoesUsuario(usuarioId, payload);
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
          <option value="">Selecione um usuário</option>
          {usuarios.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.nome || u.email} ({u.perfil || "atendente"})
            </option>
          ))}
        </select>
      </div>

      {usuarioId && usuarioInfo && (
        <div
          className="config-user-info"
          style={{
            marginTop: 12,
            padding: "12px 16px",
            background: "var(--bg-muted, #f1f5f9)",
            borderRadius: 8,
            fontSize: "0.9rem",
            color: "var(--text-muted, #64748b)",
            display: "flex",
            flexWrap: "wrap",
            gap: "16px 24px",
          }}
        >
          <span><strong>{usuarioInfo.nome || "—"}</strong></span>
          <span>{usuarioInfo.email || "—"}</span>
          <span>Perfil: {usuarioInfo.perfil || "atendente"}</span>
          <span>
            Setores:{" "}
            {formatUsuarioDepartamentos(usuarioInfo) ||
              formatUsuarioDepartamentos(usuarios.find((u) => String(u.id) === String(usuarioId))) ||
              "—"}
          </span>
        </div>
      )}

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
                        descricao={p.descricao}
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

function PermissaoRow({ codigo, nome, descricao, valor, override, onValorChange }) {
  return (
    <div
      className={`permissoes-row ${override ? "permissoes-row--override" : ""}`}
      title={override ? `Override: ${valor === VALOR_GRANT ? "Concedido" : "Negado"}` : "Padrão do perfil"}
    >
      <div className="permissoes-row-info">
        <span className="permissoes-row-nome">{nome || codigo}</span>
        {descricao && (
          <span className="permissoes-row-desc">{descricao}</span>
        )}
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
