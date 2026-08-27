import { useCallback, useEffect, useState } from "react";
import * as cfg from "../../api/configService";
import SectionState from "../components/SectionState";
import { useSectionResource } from "../hooks/useSectionResource";

function formatUserDepartamentos(u) {
  if (!u) return "—";
  const deps = u.departamentos;
  if (Array.isArray(deps) && deps.length > 0) {
    return deps.map((d) => d?.nome).filter(Boolean).join(", ") || "—";
  }
  if (deps?.nome) return deps.nome;
  return "—";
}

export function SecaoUsuarios({ usuarios, departamentos, onRefresh, onEdit, onNew, onEditarPermissoes }) {
  return (
    <div className="ia-section">
      <div className="config-headRow">
        <div>
          <h4 style={{ margin: 0 }}>Usuários / Atendentes</h4>
          <p className="ia-muted" style={{ margin: "6px 0 0" }}>
            {usuarios.length} usuário(s). Perfis definem acesso e o setor limita as conversas visíveis.
          </p>
        </div>
        <div className="config-headActions">
          <button className="ia-btn ia-btn--outline" type="button" onClick={onRefresh}>Atualizar</button>
          <button className="ia-btn ia-btn--primary" type="button" onClick={onNew}>Novo usuário</button>
        </div>
      </div>
      <table className="ia-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Email</th>
            <th>Perfil</th>
            <th>Setores</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.length === 0 ? (
            <tr>
              <td colSpan={6} className="config-emptyCell">
                Nenhum usuário encontrado. Clique em <strong>Novo usuário</strong> para cadastrar o primeiro atendente.
              </td>
            </tr>
          ) : null}
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td>{u.nome}</td>
              <td>{u.email}</td>
              <td>{u.perfil || "atendente"}</td>
              <td><span className="config-departamentos-cell">{formatUserDepartamentos(u)}</span></td>
              <td>{u.ativo ? "Ativo" : "Inativo"}</td>
              <td>
                <button className="ia-btn ia-btn--small ia-btn--outline" onClick={() => onEdit(u)}>Editar</button>
                {onEditarPermissoes && (
                  <button className="ia-btn ia-btn--small ia-btn--outline" onClick={() => onEditarPermissoes(u)} style={{ marginLeft: 6 }}>
                    Permissões
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function normalizeDepartamentoIds(u) {
  if (!u) return [];
  const ids = u.departamento_ids;
  if (Array.isArray(ids)) return ids.map((id) => Number(id)).filter((n) => !Number.isNaN(n));
  if (u.departamento_id != null) return [Number(u.departamento_id)];
  if (Array.isArray(u.departamentos)) return u.departamentos.map((d) => Number(d?.id)).filter((n) => !Number.isNaN(n));
  return [];
}

function ModalUsuario({ usuario, departamentos, onClose, onSaved }) {
  const isNew = !usuario?.id;
  const [nome, setNome] = useState(usuario?.nome || "");
  const [email, setEmail] = useState(usuario?.email || "");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState(usuario?.perfil || "atendente");
  const [departamento_ids, setDepartamento_ids] = useState(() => normalizeDepartamentoIds(usuario));
  const [ativo, setAtivo] = useState(usuario?.ativo !== false);

  useEffect(() => {
    if (usuario) {
      setNome(usuario.nome || "");
      setEmail(usuario.email || "");
      setSenha("");
      setPerfil(usuario.perfil || "atendente");
      setDepartamento_ids(normalizeDepartamentoIds(usuario));
      setAtivo(usuario.ativo !== false);
    }
  }, [usuario?.id, usuario?.nome, usuario?.email, usuario?.perfil, usuario?.departamento_id, usuario?.departamento_ids, usuario?.departamentos, usuario?.ativo]);
  const [saving, setSaving] = useState(false);
  const [showSenha, setShowSenha] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nome.trim() || !email.trim()) return;
    if (isNew && !senha.trim()) {
      alert("Senha é obrigatória para novo usuário");
      return;
    }
    setSaving(true);
    try {
      const payload = { nome: nome.trim(), email: email.trim(), perfil, departamento_ids: departamento_ids, ativo };
      if (isNew) {
        payload.senha = senha.trim();
        await cfg.criarUsuario(payload);
      } else {
        await cfg.atualizarUsuario(usuario.id, { nome: payload.nome, email: payload.email, perfil, departamento_ids: payload.departamento_ids, ativo: payload.ativo });
        if (senha.trim()) await cfg.redefinirSenha(usuario.id, senha.trim());
      }
      onSaved();
    } catch (e) {
      alert(e?.response?.data?.error || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 400, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
        <h4 style={{ margin: "0 0 16px 0" }}>{isNew ? "Novo usuário" : "Editar usuário"}</h4>
        <form onSubmit={handleSubmit}>
          <div className="ia-field">
            <label>Nome</label>
            <input className="ia-input" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="ia-field">
            <label>Email</label>
            <input type="email" className="ia-input" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!isNew} />
          </div>
          <div className="ia-field">
            <label>{isNew ? "Senha" : "Nova senha (deixe em branco para manter)"}</label>
            <input type={showSenha ? "text" : "password"} className="ia-input" value={senha} onChange={(e) => setSenha(e.target.value)} required={isNew} />
          </div>
          <div className="ia-field">
            <label>Perfil</label>
            <select className="ia-select" value={perfil} onChange={(e) => setPerfil(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="supervisor">Supervisor</option>
              <option value="atendente">Atendente</option>
            </select>
          </div>
          <div className="ia-field">
            <label>Setores (Departamentos)</label>
            <div className="config-departamentos-multiselect">
              {departamentos.map((d) => {
                const depId = Number(d.id);
                const checked = departamento_ids.includes(depId);
                return (
                  <label key={d.id} className="config-departamento-checkbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setDepartamento_ids((prev) =>
                          checked ? prev.filter((id) => id !== depId) : [...prev, depId]
                        );
                      }}
                    />
                    <span>{d.nome}</span>
                  </label>
                );
              })}
            </div>
            {departamentos.length === 0 && (
              <p className="ia-muted" style={{ fontSize: 12, marginTop: 4 }}>Cadastre departamentos na aba Departamentos.</p>
            )}
            <span className="ia-muted" style={{ fontSize: 12, marginTop: 4, display: "block" }}>Atendentes só veem conversas dos setores selecionados. Efeito no próximo login.</span>
          </div>
          {!isNew && (
            <div className="ia-checkbox-row">
              <input type="checkbox" id="ativo" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
              <label htmlFor="ativo">Ativo</label>
            </div>
          )}
          <div className="ia-btn-row" style={{ marginTop: 16 }}>
            <button type="submit" className="ia-btn ia-btn--primary" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
            <button type="button" className="ia-btn ia-btn--outline" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsuariosSection({ onEditarPermissoes }) {
  const [modal, setModal] = useState(null);
  const load = useCallback(async () => {
    const [usuarios, departamentos] = await Promise.all([
      cfg.getUsuarios(),
      cfg.getDepartamentos(),
    ]);
    return { usuarios, departamentos };
  }, []);
  const resource = useSectionResource(load, { usuarios: [], departamentos: [] }, "Erro ao carregar usuários.");
  const refresh = () => resource.reload().catch(() => {});

  return (
    <SectionState loading={resource.loading} error={resource.error} onRetry={refresh}>
      <SecaoUsuarios
        usuarios={resource.data.usuarios}
        departamentos={resource.data.departamentos}
        onRefresh={refresh}
        onEdit={(usuario) => setModal({ data: usuario })}
        onNew={() => setModal({ data: null })}
        onEditarPermissoes={onEditarPermissoes}
      />
      {modal ? (
        <ModalUsuario
          usuario={modal.data}
          departamentos={resource.data.departamentos}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      ) : null}
    </SectionState>
  );
}
