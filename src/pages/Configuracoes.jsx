import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { useChatStore } from "../chats/chatsStore";
import { useConversaStore } from "../conversa/conversaStore";
import api from "../api/http";
import * as cfg from "../api/configService";
import * as chatService from "../chats/chatService";
import { canAcessarConfiguracoes } from "../auth/permissions";
import "./IA.css";
import "./Configuracoes.css";

const TABS = [
  { id: "geral", label: "Geral" },
  { id: "usuarios", label: "Usuários" },
  { id: "departamentos", label: "Departamentos" },
  { id: "tags", label: "Tags" },
  { id: "respostas", label: "Respostas salvas" },
  { id: "bot", label: "ChatBot / IA" },
  { id: "clientes", label: "Clientes" },
  { id: "planos", label: "Planos" },
  { id: "auditoria", label: "Auditoria" },
];

function Switch({ checked, onChange }) {
  return (
    <div
      className={`ia-switch ${checked ? "isOn" : ""}`}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    />
  );
}

export default function Configuracoes() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isAdmin = canAcessarConfiguracoes(user);

  const tabFromUrl = searchParams.get("tab");
  const [tab, setTab] = useState(tabFromUrl && TABS.some(t => t.id === tabFromUrl) ? tabFromUrl : "geral");
  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [tags, setTags] = useState([]);
  const [respostas, setRespostas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [auditoria, setAuditoria] = useState([]);
  const [empresasWhatsapp, setEmpresasWhatsapp] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    if (!isAdmin) {
      navigate("/atendimento");
      return;
    }
  }, [isAdmin, navigate]);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && TABS.some(x => x.id === t)) setTab(t);
  }, [searchParams]);

  const setTabAndUrl = useCallback((nextTab) => {
    setTab(nextTab);
    try {
      const sp = new URLSearchParams(searchParams);
      sp.set("tab", nextTab);
      navigate({ search: `?${sp.toString()}` }, { replace: true });
    } catch {
      // ignore
    }
  }, [navigate, searchParams]);

  const loadAll = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const [emp, usr, dep, tag, resp, cli, plan, aud, ew] = await Promise.all([
        cfg.getEmpresa().catch(() => null),
        cfg.getUsuarios().catch(() => []),
        cfg.getDepartamentos().catch(() => []),
        cfg.getTags().catch(() => []),
        cfg.getRespostasSalvas().catch(() => []),
        cfg.getClientes().catch(() => []),
        cfg.getPlanos().catch(() => []),
        cfg.getAuditoria(100).catch(() => []),
        cfg.getEmpresasWhatsapp().catch(() => []),
      ]);
      setEmpresa(emp);
      setUsuarios(usr);
      setDepartamentos(dep);
      setTags(tag);
      setRespostas(resp);
      setClientes(cli);
      setPlanos(plan);
      setAuditoria(aud);
      setEmpresasWhatsapp(ew);
    } catch (e) {
      setErrorMsg("Erro ao carregar dados. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  /** Carrega clientes com filtro opcional (nome ou telefone) */
  const loadClientes = useCallback(async (params = {}) => {
    try {
      const cli = await cfg.getClientes(params);
      setClientes(cli);
    } catch (e) {
      setClientes([]);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!isAdmin) return null;

  if (loading && !empresa) {
    return (
      <div className="ia-wrap config-wrap">
        <div className="ia-header">
          <h1 className="ia-title">Configurações</h1>
          <p className="ia-subtitle">Painel administrativo do CRM</p>
        </div>
        <div className="ia-content" style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
          Carregando...
        </div>
      </div>
    );
  }

  return (
    <div className="ia-wrap config-wrap">
      <header className="ia-header">
        <h1 className="ia-title">Configurações</h1>
        <p className="ia-subtitle">Central de administração — configure 100% do sistema</p>
      </header>

      {errorMsg && (
        <div className="ia-error-banner" role="alert">
          {errorMsg}
          <button type="button" onClick={() => setErrorMsg(null)}>×</button>
        </div>
      )}

      <nav className="ia-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`ia-tab ${tab === t.id ? "ia-tab--active" : ""}`}
            onClick={() => setTabAndUrl(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="ia-content">
        {tab === "geral" && (
          <SecaoGeral
            empresa={empresa}
            empresasWhatsapp={empresasWhatsapp}
            onSave={async (v) => { const updated = await cfg.putEmpresa(v); setEmpresa(updated || v); loadAll(); }}
            onRefresh={loadAll}
          />
        )}
        {tab === "usuarios" && (
          <SecaoUsuarios
            usuarios={usuarios}
            departamentos={departamentos}
            onRefresh={loadAll}
            onEdit={(u) => setModal({ type: "usuario", data: u })}
            onNew={() => setModal({ type: "usuario", data: null })}
          />
        )}
        {tab === "departamentos" && (
          <SecaoDepartamentos departamentos={departamentos} onRefresh={loadAll} />
        )}
        {tab === "tags" && (
          <SecaoTags tags={tags} onRefresh={loadAll} />
        )}
        {tab === "respostas" && (
          <SecaoRespostas respostas={respostas} departamentos={departamentos} onRefresh={loadAll} />
        )}
        {tab === "bot" && (
          <div className="ia-section">
            <h4>ChatBot / IA</h4>
            <p className="ia-muted">Configure automações, bot, roteamento e IA assistiva.</p>
            <button type="button" className="ia-btn ia-btn--primary" onClick={() => navigate("/ia")}>
              Abrir painel de IA / Bot
            </button>
          </div>
        )}
        {tab === "clientes" && (
          <SecaoClientes
            clientes={clientes}
            onRefresh={loadAll}
            onSyncContacts={loadAll}
            onSearchClientes={loadClientes}
          />
        )}
        {tab === "planos" && (
          <SecaoPlanos planos={planos} />
        )}
        {tab === "auditoria" && (
          <SecaoAuditoria auditoria={auditoria} onRefresh={loadAll} />
        )}
      </div>

      {modal?.type === "usuario" && (
        <ModalUsuario
          usuario={modal.data}
          departamentos={departamentos}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadAll(); }}
        />
      )}
    </div>
  );
}

function SecaoGeral({ empresa, empresasWhatsapp = [], onSave, onRefresh }) {
  const [v, setV] = useState(empresa || {});
  useEffect(() => setV(empresa || {}), [empresa]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { type: "ok"|"err", text }

  if (!empresa) return <p className="ia-muted">Carregando...</p>;

  return (
    <div className="ia-section">
      <h4>Dados da empresa</h4>
      {msg ? (
        <div className={`ia-error-banner ${msg.type === "ok" ? "is-ok" : ""}`} role="alert" style={{ marginBottom: 12 }}>
          {msg.text}
          <button type="button" onClick={() => setMsg(null)}>×</button>
        </div>
      ) : null}
      <div className="ia-field">
        <label>Nome</label>
        <input
          className="ia-input"
          value={v.nome || ""}
          onChange={(e) => setV((c) => ({ ...c, nome: e.target.value }))}
        />
      </div>
      <div className="ia-field">
        <label>Ativo</label>
        <Switch checked={!!v.ativo} onChange={(x) => setV((c) => ({ ...c, ativo: x }))} />
      </div>
      <h4 style={{ marginTop: 24 }}>SLA / Limites</h4>
      <div className="ia-field">
        <label>Minutos sem resposta para alerta</label>
        <input
          type="number"
          className="ia-input"
          min={1}
          max={1440}
          value={v.sla_minutos_sem_resposta ?? 30}
          onChange={(e) => setV((c) => ({ ...c, sla_minutos_sem_resposta: Number(e.target.value) || 30 }))}
        />
      </div>
      <div className="ia-field">
        <label>Limite de chats simultâneos por atendente (0 = sem limite)</label>
        <input
          type="number"
          className="ia-input"
          min={0}
          max={100}
          value={v.limite_chats_por_atendente ?? 10}
          onChange={(e) => setV((c) => ({ ...c, limite_chats_por_atendente: Math.max(0, Number(e.target.value) || 0) }))}
        />
      </div>
      <div className="ia-field">
        <label>Timeout inatividade (min) — fecha conversa sem resposta (0 = desativado)</label>
        <input
          type="number"
          className="ia-input"
          min={0}
          max={10080}
          value={v.timeout_inatividade_min ?? 0}
          onChange={(e) => setV((c) => ({ ...c, timeout_inatividade_min: Math.max(0, Number(e.target.value) || 0) }))}
        />
      </div>
      <h4 style={{ marginTop: 24 }}>Horários</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="ia-field">
          <label>Início</label>
          <input
            type="time"
            className="ia-input"
            value={v.horario_inicio || "09:00"}
            onChange={(e) => setV((c) => ({ ...c, horario_inicio: e.target.value }))}
          />
        </div>
        <div className="ia-field">
          <label>Fim</label>
          <input
            type="time"
            className="ia-input"
            value={v.horario_fim || "18:00"}
            onChange={(e) => setV((c) => ({ ...c, horario_fim: e.target.value }))}
          />
        </div>
      </div>
      <h4 style={{ marginTop: 24 }}>Tema / Logo</h4>
      <div className="ia-field">
        <label>Tema</label>
        <select
          className="ia-select"
          value={v.tema || "light"}
          onChange={(e) => setV((c) => ({ ...c, tema: e.target.value }))}
        >
          <option value="light">Claro</option>
          <option value="dark">Escuro</option>
        </select>
      </div>
      <div className="ia-field">
        <label>URL do logo</label>
        <input
          className="ia-input"
          value={v.logo_url || ""}
          onChange={(e) => setV((c) => ({ ...c, logo_url: e.target.value }))}
          placeholder="https://..."
        />
      </div>
      <div className="ia-field">
        <label>Cor primária</label>
        <input
          type="color"
          className="ia-input"
          style={{ height: 40, padding: 4 }}
          value={v.cor_primaria || "#2563eb"}
          onChange={(e) => setV((c) => ({ ...c, cor_primaria: e.target.value }))}
        />
      </div>
      <h4 style={{ marginTop: 24 }}>WhatsApp Multi-tenant</h4>
      <p className="ia-muted">Para webhook rotear por empresa, cadastre o phone_number_id do Meta (em value.metadata do webhook).</p>
      <SecaoEmpresasWhatsapp lista={empresasWhatsapp} onRefresh={onRefresh} />
      <div className="ia-btn-row">
        <button
          className="ia-btn ia-btn--primary"
          onClick={async () => {
            setSaving(true);
            setMsg(null);
            try {
              await onSave(v);
              setMsg({ type: "ok", text: "Configurações salvas com sucesso." });
            } catch (e) {
              setMsg({ type: "err", text: e?.response?.data?.error || "Erro ao salvar configurações." });
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

function SecaoUsuarios({ usuarios, departamentos, onRefresh, onEdit, onNew }) {
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
            <th>Setor</th>
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
              <td>{u.departamentos?.nome || "—"}</td>
              <td>{u.ativo ? "Ativo" : "Inativo"}</td>
              <td>
                <button className="ia-btn ia-btn--small ia-btn--outline" onClick={() => onEdit(u)}>Editar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecaoEmpresasWhatsapp({ lista, onRefresh }) {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!phoneNumberId.trim()) return;
    setSaving(true);
    try {
      await cfg.addEmpresaWhatsapp({ phone_number_id: phoneNumberId.trim(), phone_number: phoneNumber.trim() || null });
      setPhoneNumberId("");
      setPhoneNumber("");
      onRefresh();
    } catch (e) {
      alert(e?.response?.data?.error || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id) => {
    if (!confirm("Remover este mapeamento?")) return;
    try {
      await cfg.removeEmpresaWhatsapp(id);
      onRefresh();
    } catch (e) {
      alert(e?.response?.data?.error || "Erro ao remover");
    }
  };

  return (
    <div className="ia-field" style={{ marginTop: 8 }}>
      <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          className="ia-input"
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          placeholder="phone_number_id (ex: 106540352242922)"
          style={{ minWidth: 200 }}
        />
        <input
          className="ia-input"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="Número (opcional)"
          style={{ width: 140 }}
        />
        <button type="submit" className="ia-btn ia-btn--primary" disabled={saving}>{saving ? "Salvando..." : "Adicionar"}</button>
      </form>
      {lista.length > 0 && (
        <ul className="ia-list">
          {lista.map((r) => (
            <li key={r.id} className="ia-list-item">
              <span><code>{r.phone_number_id}</code>{r.phone_number && ` (${r.phone_number})`}</span>
              <button type="button" className="ia-btn ia-btn--small ia-btn--outline" onClick={() => handleRemove(r.id)}>Remover</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SecaoDepartamentos({ departamentos, onRefresh }) {
  const [nome, setNome] = useState("");
  const [editing, setEditing] = useState(null);
  const [editNome, setEditNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

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
    </div>
  );
}

function SecaoTags({ tags, onRefresh }) {
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

function SecaoRespostas({ respostas, departamentos, onRefresh }) {
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

  const handleCriar = async (e) => {
    e.preventDefault();
    if (!titulo.trim() || !texto.trim()) return;
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
      <h4>Respostas salvas</h4>
      <p className="ia-muted">Modelos prontos para respostas rápidas (por setor ou globais). Você pode editar, copiar e excluir.</p>
      {(errorMsg || okMsg) && (
        <div className={`ia-error-banner ${okMsg ? "is-ok" : ""}`} role="alert" style={{ marginBottom: 12 }}>
          {errorMsg || okMsg}
          <button type="button" onClick={() => { setErrorMsg(null); setOkMsg(null); }}>×</button>
        </div>
      )}
      <form onSubmit={handleCriar}>
        <div className="ia-field">
          <label>Título</label>
          <input className="ia-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div className="ia-field">
          <label>Texto</label>
          <textarea className="ia-textarea" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} />
        </div>
        <div className="ia-field">
          <label>Setor (opcional)</label>
          <select className="ia-select" value={depId} onChange={(e) => setDepId(e.target.value)}>
            <option value="">Todos</option>
            {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>
        <button type="submit" className="ia-btn ia-btn--primary" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
      </form>
      <div className="config-toolbar" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label className="config-inlineLabel">
            Setor:
            <select className="ia-select" value={filterDepId} onChange={(e) => setFilterDepId(e.target.value)} style={{ marginLeft: 8, minWidth: 180 }}>
              <option value="">Todos</option>
              {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </label>
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
            Nenhuma resposta salva encontrada para este filtro.
          </li>
        ) : null}
        {filtered.map((r) => {
          const snippet = String(r.texto || "").trim().slice(0, 140);
          const depNome = r.departamentos?.nome ? String(r.departamentos.nome) : null;
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
                      <div className="ia-field" style={{ marginBottom: 0 }}>
                        <label>Setor (opcional)</label>
                        <select className="ia-select" value={edit.departamento_id} onChange={(e) => setEdit((c) => ({ ...c, departamento_id: e.target.value }))}>
                          <option value="">Todos</option>
                          {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                        </select>
                      </div>
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
                      {depNome ? <span className="config-pill">{depNome}</span> : <span className="config-pill config-pill--muted">Global</span>}
                    </div>
                    <div className="ia-muted" style={{ marginTop: 6 }}>
                      {snippet}{String(r.texto || "").length > 140 ? "…" : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="ia-btn ia-btn--small ia-btn--outline" type="button" onClick={() => copyToClipboard(r.texto)} title="Copiar texto">
                      Copiar
                    </button>
                    <button className="ia-btn ia-btn--small ia-btn--outline" type="button" onClick={() => startEdit(r)} title="Editar">
                      Editar
                    </button>
                    <button className="ia-btn ia-btn--small ia-btn--outline" type="button" onClick={() => handleExcluir(r.id)} title="Excluir">
                      Excluir
                    </button>
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

function SecaoClientes({ clientes, onRefresh, onSyncContacts, onSearchClientes }) {
  const navigate = useNavigate();
  const addChat = useChatStore((s) => s.addChat);
  const setSelectedId = useConversaStore((s) => s.setSelectedId);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncingFotos, setSyncingFotos] = useState(false);
  const [syncFotosResult, setSyncFotosResult] = useState(null);
  const [busca, setBusca] = useState("");
  const [searching, setSearching] = useState(false);
  const [abrindoId, setAbrindoId] = useState(null);
  const [excluindoId, setExcluindoId] = useState(null);
  const [clienteModal, setClienteModal] = useState(null); // { mode: "new"|"edit", data }

  useEffect(() => {
    if (!onSearchClientes) return;
    const t = setTimeout(() => {
      setSearching(true);
      onSearchClientes(busca.trim() ? { palavra: busca.trim() } : {}).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [busca, onSearchClientes]);

  const handleSincronizarContatos = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await chatService.sincronizarContatos();
      setSyncResult(res);
      onSyncContacts?.();
    } catch (e) {
      setSyncResult({ error: e.response?.data?.error || e.message || "Erro ao sincronizar" });
    } finally {
      setSyncing(false);
    }
  };

  const handleSincronizarFotosPerfil = async () => {
    setSyncingFotos(true);
    setSyncFotosResult(null);
    try {
      const res = await chatService.sincronizarFotosPerfil();
      setSyncFotosResult(res);
      onRefresh?.();
    } catch (e) {
      setSyncFotosResult({ error: e.response?.data?.error || e.message || "Erro ao sincronizar fotos." });
    } finally {
      setSyncingFotos(false);
    }
  };

  const handleAbrirConversa = async (cliente) => {
    if (!cliente?.id || !cliente?.telefone) return;
    setAbrindoId(cliente.id);
    try {
      const { conversa } = await chatService.abrirConversaCliente(cliente.id);
      if (conversa?.id) {
        addChat(conversa);
        setSelectedId(conversa.id);
        navigate("/atendimento");
      }
    } catch (e) {
      console.error("Erro ao abrir conversa:", e);
    } finally {
      setAbrindoId(null);
    }
  };

  const handleExcluirCliente = async (cliente) => {
    if (!cliente?.id) return;
    const nome = cliente.nome || cliente.telefone || "Cliente";
    if (!window.confirm(`Excluir o cliente "${nome}"? As conversas continuarão, mas sem vínculo com este cadastro.`)) return;
    setExcluindoId(cliente.id);
    try {
      await cfg.excluirCliente(cliente.id);
      onRefresh?.();
    } catch (e) {
      console.error("Erro ao excluir cliente:", e);
      alert(e.response?.data?.erro || e.message || "Erro ao excluir cliente.");
    } finally {
      setExcluindoId(null);
    }
  };

  const avatarUrl = (c) => {
    const url = c?.foto_perfil;
    if (!url || !String(url).trim().startsWith("http")) return null;
    return String(url).trim();
  };

  return (
    <div className="ia-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Clientes</h4>
        <button
          type="button"
          className="ia-btn ia-btn--primary"
          onClick={() => setClienteModal({ mode: "new", data: null })}
        >
          Novo cliente
        </button>
      </div>
      <div className="ia-field" style={{ marginBottom: 16 }}>
        <p className="ia-muted">Importe nomes e fotos de perfil do WhatsApp conectado (celular).</p>
        <button
          type="button"
          className="ia-btn ia-btn--primary"
          disabled={syncing}
          onClick={handleSincronizarContatos}
        >
          {syncing ? "Sincronizando…" : "Sincronizar contatos do celular"}
        </button>
        {syncResult && (
          <p className="ia-muted" style={{ marginTop: 8 }}>
            {syncResult.error
              ? syncResult.error
              : `OK: ${syncResult.total_contatos ?? 0} contatos; ${syncResult.criados ?? 0} novos, ${syncResult.atualizados ?? 0} atualizados.`}
          </p>
        )}
      </div>
      <div className="ia-field" style={{ marginBottom: 16 }}>
        <p className="ia-muted">Atualize as fotos de perfil de todos os clientes a partir do WhatsApp (Z-API).</p>
        <button
          type="button"
          className="ia-btn ia-btn--outline"
          disabled={syncingFotos}
          onClick={handleSincronizarFotosPerfil}
        >
          {syncingFotos ? "Sincronizando fotos…" : "Sincronizar fotos de perfil"}
        </button>
        {syncFotosResult && (
          <p className="ia-muted" style={{ marginTop: 8 }}>
            {syncFotosResult.error
              ? syncFotosResult.error
              : `OK: ${syncFotosResult.total ?? 0} clientes; ${syncFotosResult.atualizados ?? 0} fotos atualizadas.`}
          </p>
        )}
      </div>
      <div className="ia-field" style={{ marginBottom: 12 }}>
        <label className="ia-label">Pesquisar por nome ou telefone</label>
        <input
          type="search"
          className="ia-input"
          placeholder="Digite nome ou telefone..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        {searching && <span className="ia-muted" style={{ marginLeft: 8 }}>Buscando…</span>}
      </div>
      <p className="ia-muted">
        {clientes.length} cliente(s) {busca.trim() ? "encontrado(s)." : "cadastrado(s)."} — conectado à tabela <code>clientes</code> do banco.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="ia-table">
          <thead>
            <tr>
              <th style={{ width: 52 }}></th>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Observações</th>
              <th style={{ width: 200 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {clientes.slice(0, 200).map((c) => {
              const url = avatarUrl(c);
              const iniciais = [c.nome, c.telefone].filter(Boolean)[0]
                ? String(c.nome || c.telefone || "").trim().slice(0, 2).toUpperCase()
                : "—";
              const abrindo = abrindoId === c.id;
              return (
                <tr key={c.id}>
                  <td>
                    <div style={{ position: "relative", width: 36, height: 36 }}>
                      <span
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          background: "#e2e8f0",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        {iniciais}
                      </span>
                      {url && (
                        <img
                          src={url}
                          alt=""
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            objectFit: "cover",
                          }}
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      )}
                    </div>
                  </td>
                  <td>{c.nome || "—"}</td>
                  <td>{c.telefone}</td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{c.observacoes || "—"}</td>
                  <td>
                    <div className="ia-btn-row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="ia-btn ia-btn--small ia-btn--primary"
                        disabled={abrindo || !c.telefone}
                        onClick={() => handleAbrirConversa(c)}
                      >
                        {abrindo ? "Abrindo…" : "Conversar"}
                      </button>
                      <button
                        type="button"
                        className="ia-btn ia-btn--small ia-btn--outline"
                        onClick={() => setClienteModal({ mode: "edit", data: c })}
                        title="Editar cliente"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="ia-btn ia-btn--small ia-btn--outline"
                        disabled={excluindoId === c.id}
                        onClick={() => handleExcluirCliente(c)}
                        title="Excluir cliente"
                      >
                        {excluindoId === c.id ? "Excluindo…" : "Excluir"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {clientes.length > 200 && <p className="ia-muted">Exibindo 200 de {clientes.length}</p>}

      {clienteModal ? (
        <ModalCliente
          mode={clienteModal.mode}
          cliente={clienteModal.data}
          onClose={() => setClienteModal(null)}
          onSaved={() => { setClienteModal(null); onRefresh?.(); }}
        />
      ) : null}
    </div>
  );
}

function SecaoPlanos({ planos }) {
  return (
    <div className="ia-section">
      <h4>Planos</h4>
      <p className="ia-muted">Limites de atendentes, conversas e mensagens.</p>
      <table className="ia-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Atendentes</th>
            <th>Conversas</th>
            <th>Mensagens</th>
          </tr>
        </thead>
        <tbody>
          {planos.map((p) => (
            <tr key={p.id}>
              <td>{p.nome || "—"}</td>
              <td>{p.limite_atendentes ?? "—"}</td>
              <td>{p.limite_conversas ?? "—"}</td>
              <td>{p.limite_mensagens ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecaoAuditoria({ auditoria, onRefresh }) {
  return (
    <div className="ia-section">
      <h4>Logs / Auditoria</h4>
      <button className="ia-btn ia-btn--outline" onClick={onRefresh} style={{ marginBottom: 12 }}>Atualizar</button>
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {auditoria.map((a, i) => (
          <div key={a.tipo + "-" + a.id + "-" + i} className="ia-log-item" style={{ padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
            <strong>{a.acao}</strong> — {a.usuario_nome || a.para_nome || "Sistema"} — {a.observacao || ""} — {a.criado_em ? new Date(a.criado_em).toLocaleString("pt-BR") : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function ModalUsuario({ usuario, departamentos, onClose, onSaved }) {
  const isNew = !usuario?.id;
  const [nome, setNome] = useState(usuario?.nome || "");
  const [email, setEmail] = useState(usuario?.email || "");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState(usuario?.perfil || "atendente");
  const [departamento_id, setDepartamento_id] = useState(usuario?.departamento_id != null ? String(usuario.departamento_id) : "");
  const [ativo, setAtivo] = useState(usuario?.ativo !== false);

  useEffect(() => {
    if (usuario) {
      setNome(usuario.nome || "");
      setEmail(usuario.email || "");
      setSenha("");
      setPerfil(usuario.perfil || "atendente");
      setDepartamento_id(usuario.departamento_id != null ? String(usuario.departamento_id) : "");
      setAtivo(usuario.ativo !== false);
    }
  }, [usuario?.id, usuario?.nome, usuario?.email, usuario?.perfil, usuario?.departamento_id, usuario?.ativo]);
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
      if (isNew) {
        await cfg.criarUsuario({ nome: nome.trim(), email: email.trim(), senha: senha.trim(), perfil, departamento_id: departamento_id || null, ativo });
      } else {
        await cfg.atualizarUsuario(usuario.id, { nome: nome.trim(), email: email.trim(), perfil, departamento_id: departamento_id || null, ativo });
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
            <label>Setor (Departamento)</label>
            <select className="ia-select" value={departamento_id} onChange={(e) => setDepartamento_id(e.target.value)}>
              <option value="">Nenhum</option>
              {departamentos.map((d) => <option key={d.id} value={String(d.id)}>{d.nome}</option>)}
            </select>
            <span className="ia-muted" style={{ fontSize: 12, marginTop: 4, display: "block" }}>Atendentes só veem conversas do setor. Efeito no próximo login.</span>
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

function ModalCliente({ mode, cliente, onClose, onSaved }) {
  const isNew = mode === "new";
  const [nome, setNome] = useState(cliente?.nome || "");
  const [telefone, setTelefone] = useState(cliente?.telefone || "");
  const [observacoes, setObservacoes] = useState(cliente?.observacoes || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNome(cliente?.nome || "");
    setTelefone(cliente?.telefone || "");
    setObservacoes(cliente?.observacoes || "");
  }, [cliente?.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isNew) {
        if (!String(telefone || "").trim()) {
          alert("Telefone é obrigatório para criar cliente.");
          return;
        }
        await cfg.criarCliente({
          telefone: String(telefone || "").trim(),
          nome: String(nome || "").trim() || null,
          observacoes: String(observacoes || "").trim() || null,
        });
      } else {
        await cfg.atualizarCliente(cliente.id, {
          nome: String(nome || "").trim() || null,
          observacoes: String(observacoes || "").trim() || null,
        });
      }
      onSaved?.();
    } catch (e) {
      const msg = e?.response?.data?.erro || e?.response?.data?.error || e?.message || "Erro ao salvar cliente.";
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onClose}
    >
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 440, maxWidth: "92vw" }} onClick={(e) => e.stopPropagation()}>
        <h4 style={{ margin: "0 0 16px 0" }}>{isNew ? "Novo cliente" : "Editar cliente"}</h4>
        <form onSubmit={handleSubmit}>
          <div className="ia-field">
            <label>Nome</label>
            <input className="ia-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente (opcional)" />
          </div>
          <div className="ia-field">
            <label>Telefone</label>
            <input
              className="ia-input"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="+55 11 99999-9999"
              disabled={!isNew}
              required={isNew}
            />
            {!isNew ? <span className="ia-muted" style={{ fontSize: 12, marginTop: 4, display: "block" }}>Telefone não é editável (use sincronização/novo cadastro se necessário).</span> : null}
          </div>
          <div className="ia-field">
            <label>Observações</label>
            <textarea className="ia-textarea" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} placeholder="Observações internas sobre o cliente..." />
          </div>
          <div className="ia-btn-row" style={{ marginTop: 16 }}>
            <button type="submit" className="ia-btn ia-btn--primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" className="ia-btn ia-btn--outline" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
