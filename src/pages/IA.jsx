import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { canAcessarConfiguracoes } from "../auth/permissions";
import api from "../api/http";
import * as iaApi from "../api/iaService";
import "./IA.css";

const DEFAULT_CONFIG = {
  bot_global: {
    ativo: false,
    mensagem_boas_vindas: "",
    mensagem_inicial_automatica: "",
    mensagem_fora_horario: "",
    mensagem_ausencia: "",
    mensagem_encerramento: "",
    tempo_limite_sem_resposta_min: 30,
  },
  roteamento: {
    ativar_menu_setores: true,
    texto_menu: "Escolha o setor pelo número:",
    departamentos_ids: [],
    tipo_distribuicao: "manual",
  },
  ia: {
    usar_ia: false,
    sugerir_respostas: true,
    corrigir_texto: false,
    auto_completar: false,
    resumo_conversa: true,
    classificar_intencao: true,
    sugerir_tags: true,
  },
  automacoes: {
    encerrar_automatico_min: 0,
    transferir_para_humano_apos_bot: true,
    limite_mensagens_bot: 5,
    auto_assumir: false,
    reabrir_automaticamente: false,
  },
};

const TABS = [
  { id: "bot", label: "Bot global" },
  { id: "roteamento", label: "Roteamento" },
  { id: "respostas", label: "Respostas automáticas" },
  { id: "ia", label: "IA (sugestões)" },
  { id: "automacoes", label: "Automações" },
  { id: "logs", label: "Logs do bot" },
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

export default function IA() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = canAcessarConfiguracoes(user);

  const [tab, setTab] = useState("bot");
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regras, setRegras] = useState([]);
  const [logs, setLogs] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [tags, setTags] = useState([]);
  const [formRegra, setFormRegra] = useState({ palavra_chave: "", resposta: "", departamento_id: "", tag_id: "", aplicar_tag: false, horario_comercial_only: false });
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (!isAdmin) navigate("/atendimento", { replace: true });
  }, [isAdmin, navigate]);

  const loadConfig = useCallback(async () => {
    try {
      const c = await iaApi.getConfig();
      setConfig(c && typeof c === "object" ? c : DEFAULT_CONFIG);
    } catch (e) {
      console.error("Erro ao carregar config IA:", e);
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRegras = useCallback(async () => {
    try {
      const r = await iaApi.getRegras();
      setRegras(r || []);
    } catch (e) {
      console.error("Erro ao carregar regras:", e);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const l = await iaApi.getLogs(50);
      setLogs(l || []);
    } catch (e) {
      console.error("Erro ao carregar logs:", e);
    }
  }, []);

  const loadDepTags = useCallback(async () => {
    try {
      const [dep, tag] = await Promise.all([
        api.get("/dashboard/departamentos").then((r) => r.data || []),
        api.get("/tags").then((r) => r.data || []),
      ]);
      setDepartamentos(dep);
      setTags(tag);
    } catch (e) {
      console.error("Erro ao carregar dep/tags:", e);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadConfig();
    loadDepTags();
  }, [isAdmin, loadConfig, loadDepTags]);

  useEffect(() => {
    if (tab === "respostas") loadRegras();
    if (tab === "logs") loadLogs();
  }, [tab, loadRegras, loadLogs]);

  if (!isAdmin) return null;

  const handleSaveConfig = async (section, values) => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const c = await iaApi.putConfig({ [section]: values });
      setConfig(c);
    } catch (e) {
      console.error("Erro ao salvar config:", e);
      setErrorMsg(e?.response?.data?.error || "Erro ao salvar. Verifique se a migration foi executada no banco.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRegra = async (e) => {
    e.preventDefault();
    if (!formRegra.palavra_chave?.trim() || !formRegra.resposta?.trim()) return;
    try {
      await iaApi.postRegra({
        palavra_chave: formRegra.palavra_chave.trim(),
        resposta: formRegra.resposta.trim(),
        departamento_id: formRegra.departamento_id || null,
        tag_id: formRegra.tag_id || null,
        aplicar_tag: formRegra.aplicar_tag,
        horario_comercial_only: formRegra.horario_comercial_only,
      });
      setFormRegra({ palavra_chave: "", resposta: "", departamento_id: "", tag_id: "", aplicar_tag: false, horario_comercial_only: false });
      loadRegras();
    } catch (e) {
      console.error("Erro ao criar regra:", e);
    }
  };

  const handleDeleteRegra = async (id) => {
    if (!confirm("Excluir esta regra?")) return;
    try {
      await iaApi.deleteRegra(id);
      loadRegras();
    } catch (e) {
      console.error("Erro ao excluir regra:", e);
    }
  };

  if (loading) {
    return (
      <div className="ia-wrap">
        <div className="ia-header">
          <h1 className="ia-title">IA / Bot / Automação</h1>
          <p className="ia-subtitle">Configurações de automação do CRM</p>
        </div>
        <div className="ia-content" style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
          Carregando...
        </div>
      </div>
    );
  }

  const cfg = config || DEFAULT_CONFIG;

  const bg = cfg.bot_global || {};
  const rt = cfg.roteamento || {};
  const ia = cfg.ia || {};
  const auto = cfg.automacoes || {};

  return (
    <div className="ia-wrap">
      <header className="ia-header">
        <h1 className="ia-title">IA / Bot / Automação</h1>
        <p className="ia-subtitle">Configure automações. Se desligado → atendimento 100% humano.</p>
      </header>

      {errorMsg && (
        <div className="ia-error-banner" role="alert">
          {errorMsg}
          <button type="button" onClick={() => setErrorMsg(null)} aria-label="Fechar">×</button>
        </div>
      )}

      <nav className="ia-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`ia-tab ${tab === t.id ? "ia-tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="ia-content">
        {tab === "bot" && (
          <SecaoBotGlobal
            config={bg}
            onSave={(v) => handleSaveConfig("bot_global", v)}
            saving={saving}
          />
        )}
        {tab === "roteamento" && (
          <SecaoRoteamento
            config={rt}
            departamentos={departamentos}
            onSave={(v) => handleSaveConfig("roteamento", v)}
            saving={saving}
          />
        )}
        {tab === "respostas" && (
          <SecaoRespostasAutomaticas
            regras={regras}
            formRegra={formRegra}
            setFormRegra={setFormRegra}
            departamentos={departamentos}
            tags={tags}
            onAdd={handleAddRegra}
            onDelete={handleDeleteRegra}
          />
        )}
        {tab === "ia" && (
          <SecaoIA
            config={ia}
            onSave={(v) => handleSaveConfig("ia", v)}
            saving={saving}
          />
        )}
        {tab === "automacoes" && (
          <SecaoAutomacoes
            config={auto}
            onSave={(v) => handleSaveConfig("automacoes", v)}
            saving={saving}
          />
        )}
        {tab === "logs" && <SecaoLogs logs={logs} onRefresh={loadLogs} />}
      </div>
    </div>
  );
}

function SecaoBotGlobal({ config, onSave, saving }) {
  const [v, setV] = useState(config);
  useEffect(() => setV(config), [config]);

  return (
    <div className="ia-section">
      <h4>1. Bot global</h4>
      <p className="ia-muted">Se OFF, nenhuma automação roda. Se ON, habilita todas as regras.</p>

      <div className="ia-switch-row">
        <Switch checked={v.ativo} onChange={(x) => setV((c) => ({ ...c, ativo: x }))} />
        <span>Ativar Bot</span>
      </div>

      <div className="ia-field">
        <label>Mensagem de boas-vindas</label>
        <textarea
          className="ia-textarea"
          value={v.mensagem_boas_vindas || ""}
          onChange={(e) => setV((c) => ({ ...c, mensagem_boas_vindas: e.target.value }))}
          placeholder="Olá! Como posso ajudar?"
        />
      </div>
      <div className="ia-field">
        <label>Mensagem inicial automática</label>
        <textarea
          className="ia-textarea"
          value={v.mensagem_inicial_automatica || ""}
          onChange={(e) => setV((c) => ({ ...c, mensagem_inicial_automatica: e.target.value }))}
        />
      </div>
      <div className="ia-field">
        <label>Mensagem fora do horário</label>
        <textarea
          className="ia-textarea"
          value={v.mensagem_fora_horario || ""}
          onChange={(e) => setV((c) => ({ ...c, mensagem_fora_horario: e.target.value }))}
          placeholder="No momento estamos fora do expediente..."
        />
      </div>
      <div className="ia-field">
        <label>Mensagem de ausência</label>
        <textarea
          className="ia-textarea"
          value={v.mensagem_ausencia || ""}
          onChange={(e) => setV((c) => ({ ...c, mensagem_ausencia: e.target.value }))}
        />
      </div>
      <div className="ia-field">
        <label>Mensagem de encerramento</label>
        <textarea
          className="ia-textarea"
          value={v.mensagem_encerramento || ""}
          onChange={(e) => setV((c) => ({ ...c, mensagem_encerramento: e.target.value }))}
        />
      </div>
      <div className="ia-field">
        <label>Tempo limite sem resposta (minutos)</label>
        <input
          type="number"
          className="ia-input"
          min={1}
          max={1440}
          value={v.tempo_limite_sem_resposta_min ?? 30}
          onChange={(e) => setV((c) => ({ ...c, tempo_limite_sem_resposta_min: Number(e.target.value) || 30 }))}
        />
      </div>
      <div className="ia-btn-row">
        <button className="ia-btn ia-btn--primary" onClick={() => onSave(v)} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

function SecaoRoteamento({ config, departamentos, onSave, saving }) {
  const [v, setV] = useState(config);
  useEffect(() => setV(config), [config]);

  const toggleDep = (id) => {
    const ids = v.departamentos_ids || [];
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    setV((c) => ({ ...c, departamentos_ids: next }));
  };

  return (
    <div className="ia-section">
      <h4>2. Roteamento por departamento</h4>
      <p className="ia-muted">Usa departamentos e conversas.departamento_id.</p>

      <div className="ia-switch-row">
        <Switch
          checked={v.ativar_menu_setores}
          onChange={(x) => setV((c) => ({ ...c, ativar_menu_setores: x }))}
        />
        <span>Ativar menu de setores</span>
      </div>

      <div className="ia-field">
        <label>Texto do menu</label>
        <textarea
          className="ia-textarea"
          value={v.texto_menu || ""}
          onChange={(e) => setV((c) => ({ ...c, texto_menu: e.target.value }))}
          placeholder="Escolha o setor pelo número:"
        />
      </div>

      <div className="ia-field">
        <label>Departamentos disponíveis (checkbox)</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {departamentos.map((d) => (
            <div key={d.id} className="ia-checkbox-row">
              <input
                type="checkbox"
                id={`dep-${d.id}`}
                checked={(v.departamentos_ids || []).includes(d.id)}
                onChange={() => toggleDep(d.id)}
              />
              <label htmlFor={`dep-${d.id}`}>{d.nome}</label>
            </div>
          ))}
          {departamentos.length === 0 && (
            <span className="ia-muted">Nenhum departamento cadastrado.</span>
          )}
        </div>
      </div>

      <div className="ia-field">
        <label>Tipo de distribuição</label>
        <select
          className="ia-select"
          value={v.tipo_distribuicao || "manual"}
          onChange={(e) => setV((c) => ({ ...c, tipo_distribuicao: e.target.value }))}
        >
          <option value="manual">Manual</option>
          <option value="round_robin">Round robin</option>
          <option value="menor_carga">Menor carga</option>
        </select>
      </div>

      <div className="ia-btn-row">
        <button className="ia-btn ia-btn--primary" onClick={() => onSave(v)} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

function SecaoRespostasAutomaticas({ regras, formRegra, setFormRegra, departamentos, tags, onAdd, onDelete }) {
  return (
    <div className="ia-section">
      <h4>3. Respostas automáticas</h4>
      <p className="ia-muted">Palavra-chave → resposta. Usa respostas_salvas, tags, conversa_tags.</p>

      <form onSubmit={onAdd}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="ia-field">
            <label>Palavra-chave</label>
            <input
              type="text"
              className="ia-input"
              value={formRegra.palavra_chave}
              onChange={(e) => setFormRegra((f) => ({ ...f, palavra_chave: e.target.value }))}
              placeholder="ex: horário"
            />
          </div>
          <div className="ia-field">
            <label>Resposta</label>
            <input
              type="text"
              className="ia-input"
              value={formRegra.resposta}
              onChange={(e) => setFormRegra((f) => ({ ...f, resposta: e.target.value }))}
              placeholder="Nosso horário é..."
            />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="ia-field">
            <label>Setor (opcional)</label>
            <select
              className="ia-select"
              value={formRegra.departamento_id}
              onChange={(e) => setFormRegra((f) => ({ ...f, departamento_id: e.target.value }))}
            >
              <option value="">Todos</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </div>
          <div className="ia-field">
            <label>Tag a aplicar (opcional)</label>
            <select
              className="ia-select"
              value={formRegra.tag_id}
              onChange={(e) => setFormRegra((f) => ({ ...f, tag_id: e.target.value }))}
            >
              <option value="">Nenhuma</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="ia-checkbox-row">
          <input
            type="checkbox"
            id="aplicar_tag"
            checked={formRegra.aplicar_tag}
            onChange={(e) => setFormRegra((f) => ({ ...f, aplicar_tag: e.target.checked }))}
          />
          <label htmlFor="aplicar_tag">Aplicar tag automaticamente</label>
        </div>
        <div className="ia-checkbox-row">
          <input
            type="checkbox"
            id="horario_comercial"
            checked={formRegra.horario_comercial_only}
            onChange={(e) => setFormRegra((f) => ({ ...f, horario_comercial_only: e.target.checked }))}
          />
          <label htmlFor="horario_comercial">Apenas em horário comercial</label>
        </div>
        <div className="ia-btn-row">
          <button type="submit" className="ia-btn ia-btn--primary">
            Salvar regra
          </button>
        </div>
      </form>

      <h4 style={{ marginTop: 24 }}>Regras cadastradas ({regras.length})</h4>
      {regras.length === 0 ? (
        <p className="ia-muted">Nenhuma regra cadastrada.</p>
      ) : (
        regras.map((r) => (
          <div key={r.id} className="ia-regra-item">
            <div className="ia-regra-item-main">
              <strong>{r.palavra_chave}</strong> → {r.resposta}
              <br />
              <span>
                {r.departamentos?.nome ? `Setor: ${r.departamentos.nome}` : ""}
                {r.tags?.nome ? ` | Tag: ${r.tags.nome}` : ""}
                {r.horario_comercial_only ? " | Horário comercial" : ""}
              </span>
            </div>
            <button
              type="button"
              className="ia-btn ia-btn--outline ia-btn--small"
              style={{ flexShrink: 0 }}
              onClick={() => onDelete(r.id)}
            >
              Excluir
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function SecaoIA({ config, onSave, saving }) {
  const [v, setV] = useState(config);
  useEffect(() => setV(config), [config]);

  return (
    <div className="ia-section">
      <h4>4. IA (sugestões inteligentes)</h4>
      <p className="ia-muted">Assistivo, nunca responde sozinho sem permissão.</p>

      <div className="ia-switch-row">
        <Switch checked={v.usar_ia} onChange={(x) => setV((c) => ({ ...c, usar_ia: x }))} />
        <span>Usar IA</span>
      </div>

      <div className="ia-checkbox-row">
        <input
          type="checkbox"
          id="sugerir_respostas"
          checked={v.sugerir_respostas}
          onChange={(e) => setV((c) => ({ ...c, sugerir_respostas: e.target.checked }))}
        />
        <label htmlFor="sugerir_respostas">Sugerir respostas para atendente</label>
      </div>
      <div className="ia-checkbox-row">
        <input
          type="checkbox"
          id="corrigir_texto"
          checked={v.corrigir_texto}
          onChange={(e) => setV((c) => ({ ...c, corrigir_texto: e.target.checked }))}
        />
        <label htmlFor="corrigir_texto">Corrigir texto automaticamente</label>
      </div>
      <div className="ia-checkbox-row">
        <input
          type="checkbox"
          id="auto_completar"
          checked={v.auto_completar}
          onChange={(e) => setV((c) => ({ ...c, auto_completar: e.target.checked }))}
        />
        <label htmlFor="auto_completar">Auto completar mensagens</label>
      </div>
      <div className="ia-checkbox-row">
        <input
          type="checkbox"
          id="resumo_conversa"
          checked={v.resumo_conversa}
          onChange={(e) => setV((c) => ({ ...c, resumo_conversa: e.target.checked }))}
        />
        <label htmlFor="resumo_conversa">Resumo de conversa</label>
      </div>
      <div className="ia-checkbox-row">
        <input
          type="checkbox"
          id="classificar_intencao"
          checked={v.classificar_intencao}
          onChange={(e) => setV((c) => ({ ...c, classificar_intencao: e.target.checked }))}
        />
        <label htmlFor="classificar_intencao">Classificar intenção</label>
      </div>
      <div className="ia-checkbox-row">
        <input
          type="checkbox"
          id="sugerir_tags"
          checked={v.sugerir_tags}
          onChange={(e) => setV((c) => ({ ...c, sugerir_tags: e.target.checked }))}
        />
        <label htmlFor="sugerir_tags">Sugerir tags</label>
      </div>

      <div className="ia-btn-row">
        <button className="ia-btn ia-btn--primary" onClick={() => onSave(v)} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

function SecaoAutomacoes({ config, onSave, saving }) {
  const [v, setV] = useState(config);
  useEffect(() => setV(config), [config]);

  return (
    <div className="ia-section">
      <h4>5. Automações</h4>
      <p className="ia-muted">Comportamentos automáticos do sistema.</p>

      <div className="ia-field">
        <label>Encerrar conversa automaticamente após X minutos (0 = desativado)</label>
        <input
          type="number"
          className="ia-input"
          min={0}
          max={10080}
          value={v.encerrar_automatico_min ?? 0}
          onChange={(e) => setV((c) => ({ ...c, encerrar_automatico_min: Number(e.target.value) || 0 }))}
        />
      </div>

      <div className="ia-checkbox-row">
        <input
          type="checkbox"
          id="transferir_humano"
          checked={v.transferir_para_humano_apos_bot}
          onChange={(e) => setV((c) => ({ ...c, transferir_para_humano_apos_bot: e.target.checked }))}
        />
        <label htmlFor="transferir_humano">Transferir para humano após bot</label>
      </div>

      <div className="ia-field">
        <label>Limite de mensagens do bot</label>
        <input
          type="number"
          className="ia-input"
          min={1}
          max={50}
          value={v.limite_mensagens_bot ?? 5}
          onChange={(e) => setV((c) => ({ ...c, limite_mensagens_bot: Number(e.target.value) || 5 }))}
        />
      </div>

      <div className="ia-checkbox-row">
        <input
          type="checkbox"
          id="auto_assumir"
          checked={v.auto_assumir}
          onChange={(e) => setV((c) => ({ ...c, auto_assumir: e.target.checked }))}
        />
        <label htmlFor="auto_assumir">Auto assumir conversa</label>
      </div>

      <div className="ia-checkbox-row">
        <input
          type="checkbox"
          id="reabrir_auto"
          checked={v.reabrir_automaticamente}
          onChange={(e) => setV((c) => ({ ...c, reabrir_automaticamente: e.target.checked }))}
        />
        <label htmlFor="reabrir_auto">Reabrir conversa automaticamente</label>
      </div>

      <div className="ia-btn-row">
        <button className="ia-btn ia-btn--primary" onClick={() => onSave(v)} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

function SecaoLogs({ logs, onRefresh }) {
  return (
    <div className="ia-section">
      <h4>6. Logs do bot</h4>
      <p className="ia-muted">Ações do bot, respostas automáticas enviadas e erros.</p>
      <div className="ia-btn-row">
        <button type="button" className="ia-btn ia-btn--outline" onClick={onRefresh}>
          Atualizar
        </button>
      </div>

      {logs.length === 0 ? (
        <p className="ia-muted">Nenhum log registrado.</p>
      ) : (
        <div style={{ marginTop: 12, maxHeight: 400, overflowY: "auto" }}>
          {logs.map((l) => (
            <div key={l.id} className="ia-log-item">
              <span className={`ia-log-tipo ${l.tipo === "erro" ? "erro" : ""}`}>{l.tipo}</span>
              {l.detalhes?.texto && <span>{l.detalhes.texto}</span>}
              <span style={{ marginLeft: 8, color: "#64748b", fontSize: 12 }}>
                {l.criado_em ? new Date(l.criado_em).toLocaleString("pt-BR") : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
