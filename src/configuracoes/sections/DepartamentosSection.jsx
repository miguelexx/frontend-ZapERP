import { useCallback, useState } from "react";
import * as cfg from "../../api/configService";
import SectionState from "../components/SectionState";
import { useSectionResource } from "../hooks/useSectionResource";

export function SecaoDepartamentos({ departamentos, onRefresh }) {
  const [nome, setNome] = useState("");
  const [editing, setEditing] = useState(null);
  const [editNome, setEditNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [grupoModal, setGrupoModal] = useState(null);
  const [gruposLoading, setGruposLoading] = useState(false);
  const [gruposSaving, setGruposSaving] = useState(false);

  const handleCriar = async (e) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await cfg.criarDepartamento(nome.trim());
      setNome("");
      onRefresh();
    } catch (e) {
      setErrorMsg(e?.response?.data?.error || "Erro ao criar setor.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditar = (d) => {
    setEditing(d.id);
    setEditNome(d.nome);
  };

  const handleSalvarEdicao = async () => {
    if (!editing || !editNome.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await cfg.atualizarDepartamento(editing, editNome.trim());
      setEditing(null);
      setEditNome("");
      onRefresh();
    } catch (e) {
      setErrorMsg(e?.response?.data?.error || "Erro ao atualizar setor.");
    } finally {
      setSaving(false);
    }
  };

  const handleExcluir = async (id) => {
    if (!confirm("Excluir este setor? Usuários vinculados precisam ser reatribuídos antes.")) return;
    setErrorMsg(null);
    try {
      await cfg.excluirDepartamento(id);
      onRefresh();
    } catch (e) {
      setErrorMsg(e?.response?.data?.error || "Erro ao excluir setor.");
    }
  };

  const handleAbrirGrupos = async (departamento) => {
    setGrupoModal({ departamento, grupos: [], selecionados: [] });
    setGruposLoading(true);
    setErrorMsg(null);
    try {
      const data = await cfg.getDepartamentoGrupos(departamento.id);
      const grupos = Array.isArray(data?.grupos) ? data.grupos : [];
      setGrupoModal({
        departamento: data?.departamento || departamento,
        grupos,
        selecionados: grupos.filter((g) => g.vinculado).map((g) => Number(g.id)),
      });
    } catch (e) {
      setGrupoModal(null);
      setErrorMsg(e?.response?.data?.error || "Erro ao carregar grupos do setor.");
    } finally {
      setGruposLoading(false);
    }
  };

  const handleToggleGrupo = (grupoId) => {
    const id = Number(grupoId);
    setGrupoModal((curr) => {
      if (!curr) return curr;
      const exists = curr.selecionados.includes(id);
      return {
        ...curr,
        selecionados: exists ? curr.selecionados.filter((x) => x !== id) : [...curr.selecionados, id],
      };
    });
  };

  const handleSalvarGrupos = async () => {
    if (!grupoModal?.departamento?.id) return;
    setGruposSaving(true);
    setErrorMsg(null);
    try {
      await cfg.atualizarDepartamentoGrupos(grupoModal.departamento.id, grupoModal.selecionados);
      setGrupoModal(null);
      onRefresh();
    } catch (e) {
      setErrorMsg(e?.response?.data?.error || "Erro ao salvar grupos do setor.");
    } finally {
      setGruposSaving(false);
    }
  };

  return (
    <div className="ia-section">
      <h4>Departamentos (Setores)</h4>
      <p className="ia-muted">Apenas administradores podem criar e editar setores. Crie setores e atribua aos usuários em Usuários. Atendentes só veem conversas do seu setor.</p>
      {errorMsg && (
        <div className="ia-error-banner" role="alert" style={{ marginBottom: 12 }}>
          {errorMsg}
          <button type="button" onClick={() => setErrorMsg(null)}>×</button>
        </div>
      )}
      <form onSubmit={handleCriar} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input className="ia-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do setor (ex: Suporte, Comercial)" style={{ flex: 1, maxWidth: 280 }} />
        <button type="submit" className="ia-btn ia-btn--primary" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
      </form>
      <ul className="ia-list">
        {departamentos.map((d) => (
          <li key={d.id} className="ia-list-item">
            {editing === d.id ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                <input className="ia-input" value={editNome} onChange={(e) => setEditNome(e.target.value)} placeholder="Nome" style={{ flex: 1, maxWidth: 200 }} autoFocus />
                <button type="button" className="ia-btn ia-btn--primary ia-btn--small" onClick={handleSalvarEdicao} disabled={saving}>Salvar</button>
                <button type="button" className="ia-btn ia-btn--outline ia-btn--small" onClick={() => { setEditing(null); setEditNome(""); }}>Cancelar</button>
              </div>
            ) : (
              <>
                <span>{d.nome}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="ia-btn ia-btn--small ia-btn--outline" onClick={() => handleAbrirGrupos(d)}>Grupos</button>
                  <button type="button" className="ia-btn ia-btn--small ia-btn--outline" onClick={() => handleEditar(d)}>Editar</button>
                  <button type="button" className="ia-btn ia-btn--small ia-btn--outline" onClick={() => handleExcluir(d.id)}>Excluir</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {departamentos.length === 0 && (
        <p className="ia-muted">Nenhum setor cadastrado. Crie o primeiro acima.</p>
      )}
      {grupoModal && (
        <ModalDepartamentoGrupos
          departamento={grupoModal.departamento}
          grupos={grupoModal.grupos}
          selecionados={grupoModal.selecionados}
          loading={gruposLoading}
          saving={gruposSaving}
          onToggle={handleToggleGrupo}
          onClose={() => !gruposSaving && setGrupoModal(null)}
          onSave={handleSalvarGrupos}
        />
      )}
    </div>
  );
}

function ModalDepartamentoGrupos({ departamento, grupos, selecionados, loading, saving, onToggle, onClose, onSave }) {
  const selectedSet = new Set((selecionados || []).map(Number));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 520, maxWidth: "92vw", maxHeight: "82vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h4 style={{ margin: "0 0 8px 0" }}>Grupos do setor</h4>
        <p className="ia-muted" style={{ marginTop: 0 }}>{departamento?.nome || "Setor"}</p>
        {loading ? (
          <p className="ia-muted">Carregando grupos...</p>
        ) : grupos.length === 0 ? (
          <p className="ia-muted">Nenhum grupo sincronizado.</p>
        ) : (
          <div className="config-departamentos-multiselect" style={{ maxHeight: 360, overflowY: "auto" }}>
            {grupos.map((g) => {
              const id = Number(g.id);
              const checked = selectedSet.has(id);
              const nome = g.nome_grupo || g.telefone || "Grupo";
              return (
                <label key={g.id} className="config-departamento-checkbox">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={saving}
                    onChange={() => onToggle(id)}
                  />
                  <span>{nome}</span>
                </label>
              );
            })}
          </div>
        )}
        <div className="ia-btn-row" style={{ marginTop: 16 }}>
          <button type="button" className="ia-btn ia-btn--primary" disabled={saving || loading} onClick={onSave}>{saving ? "Salvando..." : "Salvar"}</button>
          <button type="button" className="ia-btn ia-btn--outline" disabled={saving} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

export default function DepartamentosSection() {
  const load = useCallback(() => cfg.getDepartamentos(), []);
  const resource = useSectionResource(load, [], "Erro ao carregar departamentos.");
  const refresh = () => resource.reload().catch(() => {});

  return (
    <SectionState loading={resource.loading} error={resource.error} onRetry={refresh}>
      <SecaoDepartamentos departamentos={resource.data} onRefresh={refresh} />
    </SectionState>
  );
}
