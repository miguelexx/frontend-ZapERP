import { useCallback, useState } from "react";
import * as cfg from "../../api/configService";
import SectionState from "../components/SectionState";
import { useSectionResource } from "../hooks/useSectionResource";

export function SecaoTags({ tags, onRefresh }) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editNome, setEditNome] = useState("");
  const [editCor, setEditCor] = useState("#6366f1");

  const handleCriar = async (e) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    setOkMsg(null);
    try {
      await cfg.criarTag(nome.trim(), cor);
      setNome("");
      setOkMsg("Tag criada com sucesso.");
      onRefresh();
    } catch (e) {
      setErrorMsg(e?.response?.data?.error || "Erro ao criar tag.");
    } finally {
      setSaving(false);
    }
  };

  const handleExcluir = async (id) => {
    if (!confirm("Excluir esta tag?")) return;
    setErrorMsg(null);
    setOkMsg(null);
    try {
      await cfg.excluirTag(id);
      setOkMsg("Tag excluída.");
      onRefresh();
    } catch (e) {
      setErrorMsg(e?.response?.data?.error || "Erro ao excluir tag.");
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditNome(t.nome || "");
    setEditCor(t.cor || "#6366f1");
    setErrorMsg(null);
    setOkMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNome("");
    setEditCor("#6366f1");
  };

  const handleSalvarEdicao = async () => {
    if (!editingId || !editNome.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    setOkMsg(null);
    try {
      await cfg.atualizarTag(editingId, editNome.trim(), editCor);
      setOkMsg("Tag atualizada.");
      cancelEdit();
      onRefresh();
    } catch (e) {
      setErrorMsg(e?.response?.data?.error || "Erro ao atualizar tag.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ia-section">
      <h4>Tags / Etiquetas</h4>
      <p className="ia-muted">Use tags para organizar conversas e criar filtros (ex.: “Prioridade”, “Cobrança”, “Novo lead”).</p>
      {(errorMsg || okMsg) && (
        <div className={`ia-error-banner ${okMsg ? "is-ok" : ""}`} role="alert" style={{ marginBottom: 12 }}>
          {errorMsg || okMsg}
          <button type="button" onClick={() => { setErrorMsg(null); setOkMsg(null); }}>×</button>
        </div>
      )}
      <form onSubmit={handleCriar} style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input className="ia-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" style={{ width: 160 }} />
        <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} style={{ width: 48, height: 38, padding: 2, border: "1px solid #e2e8f0", borderRadius: 8 }} />
        <button type="submit" className="ia-btn ia-btn--primary" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
      </form>
      <ul className="ia-list">
        {tags.length === 0 ? (
          <li className="config-emptyRow">
            Nenhuma tag cadastrada. Crie a primeira acima.
          </li>
        ) : null}
        {tags.map((t) => (
          <li key={t.id} className="ia-list-item">
            {editingId === t.id ? (
              <div className="config-inlineEdit">
                <input className="ia-input" value={editNome} onChange={(e) => setEditNome(e.target.value)} placeholder="Nome" style={{ width: 180 }} autoFocus />
                <input type="color" value={editCor} onChange={(e) => setEditCor(e.target.value)} style={{ width: 48, height: 38, padding: 2, border: "1px solid #e2e8f0", borderRadius: 8 }} />
                <div className="config-inlineEditActions">
                  <button type="button" className="ia-btn ia-btn--small ia-btn--primary" onClick={handleSalvarEdicao} disabled={saving}>
                    {saving ? "Salvando…" : "Salvar"}
                  </button>
                  <button type="button" className="ia-btn ia-btn--small ia-btn--outline" onClick={cancelEdit} disabled={saving}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: t.cor || "#94a3b8" }} />
                  {t.nome}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="ia-btn ia-btn--small ia-btn--outline" type="button" onClick={() => startEdit(t)}>Editar</button>
                  <button className="ia-btn ia-btn--small ia-btn--outline" type="button" onClick={() => handleExcluir(t.id)}>Excluir</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TagsSection() {
  const load = useCallback(() => cfg.getTags(), []);
  const resource = useSectionResource(load, [], "Erro ao carregar tags.");
  const refresh = () => resource.reload().catch(() => {});

  return (
    <SectionState loading={resource.loading} error={resource.error} onRetry={refresh}>
      <SecaoTags tags={resource.data} onRefresh={refresh} />
    </SectionState>
  );
}
