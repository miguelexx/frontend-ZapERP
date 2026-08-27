import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../auth/authStore";
import * as cfg from "../../api/configService";
import SectionState from "../components/SectionState";
import { useSectionResource } from "../hooks/useSectionResource";

const LIMITE_RESPOSTAS_ATENDENTE = 5;

export function SecaoRespostas({ respostas, departamentos, onRefresh, user }) {
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [depId, setDepId] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
  const [filterDepId, setFilterDepId] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({ titulo: "", texto: "", departamento_id: "" });

  // Determina se é atendente (sem acesso à config completa)
  const perfil = String(user?.perfil || "").toLowerCase();
  const isAtendente = perfil !== "admin" && perfil !== "administrador" && perfil !== "supervisor";
  const userId = user?.id != null ? Number(user.id) : null;

  // Conta apenas as respostas que pertencem ao próprio usuário
  const minhasRespostas = useMemo(() => {
    const list = Array.isArray(respostas) ? respostas : [];
    if (userId == null) return list;
    return list.filter((r) => Number(r.usuario_id) === userId);
  }, [respostas, userId]);

  const totalProprias = minhasRespostas.length;
  const limitAtingido = isAtendente && totalProprias >= LIMITE_RESPOSTAS_ATENDENTE;

  const handleCriar = async (e) => {
    e.preventDefault();
    if (!titulo.trim() || !texto.trim()) return;
    if (limitAtingido) return;
    setSaving(true);
    setErrorMsg(null);
    setOkMsg(null);
    try {
      await cfg.criarRespostaSalva({ titulo: titulo.trim(), texto: texto.trim(), departamento_id: depId || null });
      setTitulo("");
      setTexto("");
      setOkMsg("Resposta salva criada.");
      onRefresh();
    } catch (e) {
      setErrorMsg(e?.response?.data?.error || "Erro ao criar resposta salva.");
    } finally {
      setSaving(false);
    }
  };

  const handleExcluir = async (id) => {
    if (!confirm("Excluir esta resposta?")) return;
    setErrorMsg(null);
    setOkMsg(null);
    try {
      await cfg.excluirRespostaSalva(id);
      setOkMsg("Resposta removida.");
      onRefresh();
    } catch (e) {
      setErrorMsg(e?.response?.data?.error || "Erro ao excluir resposta.");
    }
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setEdit({
      titulo: r.titulo || "",
      texto: r.texto || "",
      departamento_id: r.departamento_id != null ? String(r.departamento_id) : "",
    });
    setErrorMsg(null);
    setOkMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEdit({ titulo: "", texto: "", departamento_id: "" });
  };

  const handleSalvarEdicao = async () => {
    if (!editingId || !edit.titulo.trim() || !edit.texto.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    setOkMsg(null);
    try {
      await cfg.atualizarRespostaSalva(editingId, {
        titulo: edit.titulo.trim(),
        texto: edit.texto.trim(),
        departamento_id: edit.departamento_id || null,
      });
      setOkMsg("Resposta salva atualizada.");
      cancelEdit();
      onRefresh();
    } catch (e) {
      setErrorMsg(e?.response?.data?.error || "Erro ao atualizar resposta salva.");
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = async (t) => {
    try {
      await navigator.clipboard.writeText(String(t || ""));
      setOkMsg("Copiado para a área de transferência.");
    } catch {
      setErrorMsg("Não foi possível copiar.");
    }
  };

  const filtered = useMemo(() => {
    const list = Array.isArray(respostas) ? respostas : [];
    const q = String(query || "").trim().toLowerCase();
    return list.filter((r) => {
      if (filterDepId && String(r.departamento_id || "") !== String(filterDepId)) return false;
      if (!q) return true;
      const t = `${r.titulo || ""} ${r.texto || ""}`.toLowerCase();
      return t.includes(q);
    });
  }, [respostas, filterDepId, query]);

  return (
    <div className="ia-section">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
        <h4 style={{ margin: 0 }}>Respostas salvas</h4>
        {isAtendente && (
          <span
            className={`config-respostas-counter${limitAtingido ? " config-respostas-counter--cheio" : totalProprias >= LIMITE_RESPOSTAS_ATENDENTE - 1 ? " config-respostas-counter--alerta" : ""}`}
            title={limitAtingido ? "Limite atingido. Exclua uma resposta para criar outra." : `Você usou ${totalProprias} de ${LIMITE_RESPOSTAS_ATENDENTE} respostas salvas`}
          >
            {totalProprias}/{LIMITE_RESPOSTAS_ATENDENTE} respostas salvas
          </span>
        )}
      </div>
      <div className="ia-callout ia-callout--info ia-respostas-salvas-callout" role="note">
        <div className="ia-callout-icon ia-callout-icon--info" aria-hidden="true">/</div>
        <div className="ia-callout-body">
          <p className="ia-callout-title">Para o atalho <kbd>/</kbd> no atendimento</p>
          <p className="ia-callout-text">
            Cadastre modelos para inserir na conversa com o atalho <kbd>/</kbd> (o cliente não recebe automaticamente).
            {isAtendente
              ? <> Você pode salvar até <strong>{LIMITE_RESPOSTAS_ATENDENTE} respostas</strong> pessoais.</>
              : <> Com setor <strong>Todos</strong>, a resposta fica disponível para todos os atendentes da empresa.</>
            }
            {" "}Não confundir com <Link to="/ia?tab=respostas" className="ia-callout-link">IA → Respostas automáticas</Link> do bot.
          </p>
        </div>
      </div>
      {!isAtendente && (
        <p className="ia-muted">Setor &quot;Todos&quot; compartilha com toda a empresa. Setor específico limita a resposta ao seu usuário naquele setor.</p>
      )}
      {(errorMsg || okMsg) && (
        <div className={`ia-error-banner ${okMsg ? "is-ok" : ""}`} role="alert" style={{ marginBottom: 12 }}>
          {errorMsg || okMsg}
          <button type="button" onClick={() => { setErrorMsg(null); setOkMsg(null); }}>×</button>
        </div>
      )}

      {limitAtingido ? (
        <div className="ia-callout ia-callout--warn" role="alert" style={{ marginBottom: 16 }}>
          <div className="ia-callout-icon" aria-hidden="true">⚠️</div>
          <div className="ia-callout-body">
            <p className="ia-callout-title">Limite atingido ({LIMITE_RESPOSTAS_ATENDENTE}/{LIMITE_RESPOSTAS_ATENDENTE})</p>
            <p className="ia-callout-text">Você atingiu o limite de {LIMITE_RESPOSTAS_ATENDENTE} respostas salvas. Exclua uma existente para poder criar uma nova.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleCriar}>
          <div className="ia-field">
            <label>Título</label>
            <input className="ia-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Saudação inicial, Prazo de entrega…" />
          </div>
          <div className="ia-field">
            <label>Texto</label>
            <textarea className="ia-textarea" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Texto que será inserido na conversa ao usar o atalho /" />
          </div>
          {!isAtendente && (
            <div className="ia-field">
              <label>Setor (opcional)</label>
              <select className="ia-select" value={depId} onChange={(e) => setDepId(e.target.value)}>
                <option value="">Todos</option>
                {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
          )}
          <button type="submit" className="ia-btn ia-btn--primary" disabled={saving || !titulo.trim() || !texto.trim()}>
            {saving ? "Salvando..." : "Salvar resposta"}
          </button>
        </form>
      )}

      <div className="config-toolbar" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {!isAtendente && (
            <label className="config-inlineLabel">
              Setor:
              <select className="ia-select" value={filterDepId} onChange={(e) => setFilterDepId(e.target.value)} style={{ marginLeft: 8, minWidth: 180 }}>
                <option value="">Todos</option>
                {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </label>
          )}
          <input
            className="ia-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título ou texto…"
            style={{ minWidth: 240 }}
          />
          <span className="ia-muted">{filtered.length} resultado(s)</span>
        </div>
      </div>

      <ul className="ia-list" style={{ marginTop: 12 }}>
        {filtered.length === 0 ? (
          <li className="config-emptyRow">
            {isAtendente && totalProprias === 0
              ? "Você ainda não tem respostas salvas. Crie sua primeira resposta acima."
              : "Nenhuma resposta salva encontrada para este filtro."}
          </li>
        ) : null}
        {filtered.map((r) => {
          const snippet = String(r.texto || "").trim().slice(0, 140);
          const depNome = r.departamentos?.nome ? String(r.departamentos.nome) : null;
          const isPropriaDoUsuario = userId != null && Number(r.usuario_id) === userId;
          return (
            <li key={r.id} className="ia-list-item">
              {editingId === r.id ? (
                <div style={{ width: "100%" }}>
                  <div className="config-inlineEdit" style={{ alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div className="ia-field" style={{ marginBottom: 10 }}>
                        <label>Título</label>
                        <input className="ia-input" value={edit.titulo} onChange={(e) => setEdit((c) => ({ ...c, titulo: e.target.value }))} />
                      </div>
                      <div className="ia-field" style={{ marginBottom: 10 }}>
                        <label>Texto</label>
                        <textarea className="ia-textarea" rows={3} value={edit.texto} onChange={(e) => setEdit((c) => ({ ...c, texto: e.target.value }))} />
                      </div>
                      {!isAtendente && (
                        <div className="ia-field" style={{ marginBottom: 0 }}>
                          <label>Setor (opcional)</label>
                          <select className="ia-select" value={edit.departamento_id} onChange={(e) => setEdit((c) => ({ ...c, departamento_id: e.target.value }))}>
                            <option value="">Todos</option>
                            {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="config-inlineEditActions">
                      <button type="button" className="ia-btn ia-btn--small ia-btn--primary" onClick={handleSalvarEdicao} disabled={saving}>
                        {saving ? "Salvando…" : "Salvar"}
                      </button>
                      <button type="button" className="ia-btn ia-btn--small ia-btn--outline" onClick={cancelEdit} disabled={saving}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <strong>{r.titulo}</strong>
                      {!isAtendente && (
                        depNome ? <span className="config-pill">{depNome}</span> : <span className="config-pill config-pill--muted">Global</span>
                      )}
                      {isAtendente && !isPropriaDoUsuario && (
                        <span className="config-pill config-pill--muted">Empresa</span>
                      )}
                    </div>
                    <div className="ia-muted" style={{ marginTop: 6 }}>
                      {snippet}{String(r.texto || "").length > 140 ? "…" : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="ia-btn ia-btn--small ia-btn--outline" type="button" onClick={() => copyToClipboard(r.texto)} title="Copiar texto">
                      Copiar
                    </button>
                    {isPropriaDoUsuario && (
                      <>
                        <button className="ia-btn ia-btn--small ia-btn--outline" type="button" onClick={() => startEdit(r)} title="Editar">
                          Editar
                        </button>
                        <button className="ia-btn ia-btn--small ia-btn--outline" type="button" onClick={() => handleExcluir(r.id)} title="Excluir">
                          Excluir
                        </button>
                      </>
                    )}
                    {!isPropriaDoUsuario && !isAtendente && (
                      <>
                        <button className="ia-btn ia-btn--small ia-btn--outline" type="button" onClick={() => startEdit(r)} title="Editar">
                          Editar
                        </button>
                        <button className="ia-btn ia-btn--small ia-btn--outline" type="button" onClick={() => handleExcluir(r.id)} title="Excluir">
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function RespostasSection() {
  const user = useAuthStore((state) => state.user);
  const load = useCallback(async () => {
    const [respostas, departamentos] = await Promise.all([
      cfg.getRespostasSalvas(),
      cfg.getDepartamentos(),
    ]);
    return { respostas, departamentos };
  }, []);
  const resource = useSectionResource(load, { respostas: [], departamentos: [] }, "Erro ao carregar respostas salvas.");
  const refresh = () => resource.reload().catch(() => {});

  return (
    <SectionState loading={resource.loading} error={resource.error} onRetry={refresh}>
      <SecaoRespostas
        respostas={resource.data.respostas}
        departamentos={resource.data.departamentos}
        onRefresh={refresh}
        user={user}
      />
    </SectionState>
  );
}
