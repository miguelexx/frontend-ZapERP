import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { canAcessarConfiguracoes } from "../auth/permissions";
import { useNotificationStore } from "../notifications/notificationStore";
import api from "../api/http";
import * as iaApi from "../api/iaService";
import Breadcrumb from "../components/layout/Breadcrumb";
import { SkeletonGrid } from "../components/feedback/Skeleton";
import "../components/layout/breadcrumb.css";
import "../components/feedback/skeleton.css";
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
  chatbot_triage: {
    enabled: false,
    welcomeMessage: "",
    invalidOptionMessage: "Opção inválida. Por favor, responda apenas com o número do setor desejado.",
    confirmSelectionMessage: "Perfeito! Seu atendimento foi direcionado para o setor {{departamento}}. Em instantes nossa equipe dará continuidade.",
    sendOnlyFirstTime: true,
    fallbackToAI: false,
    businessHoursOnly: false,
    transferMode: "departamento",
    tipo_distribuicao: "fila",
    reopenMenuCommand: "0",
    options: [],
  },
};

const TABS = [
  { id: "bot", label: "Bot global" },
  { id: "chatbot", label: "Chatbot de Triagem" },
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
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isAdmin = canAcessarConfiguracoes(user);

  const tabFromUrl = searchParams.get("tab");
  const initialTab = TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : "bot";
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    if (TABS.some((t) => t.id === tabFromUrl)) setTab(tabFromUrl);
  }, [tabFromUrl]);
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
    if (tab === "logs" || tab === "chatbot") loadLogs();
  }, [tab, loadRegras, loadLogs]);

  if (!isAdmin) return null;

  const showToast = useNotificationStore((s) => s.showToast);

  const handleSaveConfig = async (section, values) => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const c = await iaApi.putConfig({ [section]: values });
      setConfig(c);
      showToast({ type: "success", title: "Salvo", message: "Configuração salva com sucesso." });
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
          <Breadcrumb items={[{ label: "Configurações", to: "/configuracoes" }, { label: "IA / Chatbot" }]} />
          <h1 className="ia-title">IA / Bot / Automação</h1>
          <p className="ia-subtitle">Configurações de automação do CRM</p>
        </div>
        <div className="ia-content ia-loading-skeleton">
          <SkeletonGrid count={4} />
        </div>
      </div>
    );
  }

  const cfg = config || DEFAULT_CONFIG;

  const bg = cfg.bot_global || {};
  const ia = cfg.ia || {};
  const auto = cfg.automacoes || {};

  return (
    <div className="ia-wrap">
      <header className="ia-header">
        <Breadcrumb items={[{ label: "Configurações", to: "/configuracoes" }, { label: "IA / Chatbot" }]} />
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
        {tab === "chatbot" && (
          <SecaoChatbotTriagem
            config={cfg.chatbot_triage || DEFAULT_CONFIG.chatbot_triage}
            departamentos={departamentos}
            logs={logs}
            onSave={(v) => handleSaveConfig("chatbot_triage", v)}
            onRefreshLogs={loadLogs}
            saving={saving}
          />
        )}
        {tab === "bot" && (
          <SecaoBotGlobal
            config={bg}
            onSave={(v) => handleSaveConfig("bot_global", v)}
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

function SecaoChatbotTriagem({ config, departamentos, logs, onSave, onRefreshLogs, saving }) {
  const [v, setV] = useState(config);
  useEffect(() => setV(config), [config]);

  const showToast = useNotificationStore((s) => s.showToast);

  const addOption = () => {
    const opts = v.options || [];
    const nextKey = String((opts.length > 0 ? Math.max(...opts.map((o) => parseInt(o.key, 10) || 0)) : 0) + 1);
    setV((c) => ({
      ...c,
      options: [...opts, { key: nextKey, label: "", departamento_id: "", active: true }],
    }));
  };

  const updateOption = (idx, field, value) => {
    const opts = [...(v.options || [])];
    opts[idx] = { ...opts[idx], [field]: value };
    setV((c) => ({ ...c, options: opts }));
  };

  const removeOption = (idx) => {
    const opts = [...(v.options || [])];
    opts.splice(idx, 1);
    setV((c) => ({ ...c, options: opts }));
  };

  const buildPayload = (vals) => ({
    ...vals,
    enabled: !!vals.enabled,
    welcomeMessage: (vals.welcomeMessage || "").trim(),
    invalidOptionMessage: (vals.invalidOptionMessage || "").trim(),
    confirmSelectionMessage: (vals.confirmSelectionMessage || "").trim(),
    sendOnlyFirstTime: vals.sendOnlyFirstTime !== false,
    fallbackToAI: vals.fallbackToAI ?? false,
    businessHoursOnly: vals.businessHoursOnly ?? false,
    transferMode: vals.transferMode ?? "departamento",
    reopenMenuCommand: String(vals.reopenMenuCommand ?? "0").trim() || "0",
    tipo_distribuicao: ["fila", "round_robin", "menor_carga"].includes(vals.tipo_distribuicao) ? vals.tipo_distribuicao : "fila",
    options: (vals.options || []).map((o) => ({
      key: String(o.key || "").trim(),
      label: (o.label || "").trim(),
      departamento_id: o.departamento_id ? Number(o.departamento_id) : null,
      active: !!o.active,
    })),
  });

  const validate = () => {
    const vals = v;
    if (!vals || typeof vals !== "object") return "Dados inválidos.";
    const opts = vals.options || [];
    if (vals.enabled) {
      const welcome = (vals.welcomeMessage || "").trim();
      if (!welcome) return "Mensagem de boas-vindas é obrigatória quando o chatbot está ativo.";
      const activeOpts = opts.filter((o) => o.active !== false);
      const validOpts = activeOpts.filter((o) => (o.label || "").trim() && o.departamento_id);
      if (validOpts.length === 0) return "Adicione pelo menos uma opção válida (label e departamento) quando o chatbot está ativo.";
    }
    const keys = opts.map((o) => String(o.key || "").trim()).filter(Boolean);
    const uniqueKeys = [...new Set(keys)];
    if (keys.length !== uniqueKeys.length) return "Cada opção deve ter uma key única.";
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i];
      if (o.active !== false) {
        if (!(o.label || "").trim()) return `Opção ${i + 1}: label é obrigatório.`;
        if (!o.departamento_id) return `Opção ${i + 1}: departamento é obrigatório.`;
      }
    }
    return null;
  };

  const handleSave = () => {
    const err = validate();
    if (err) {
      showToast({ type: "error", title: "Validação", message: err });
      return;
    }
    onSave(buildPayload(v));
  };

  const opts = v.options || [];
  const previewDept = departamentos.find((d) => d.id === (opts.find((o) => o.active)?.departamento_id))?.nome || "Vendas";
  const previewConfirm = (v.confirmSelectionMessage || "").replace(/\{\{departamento\}\}/gi, previewDept);

  return (
    <div className="chatbot-section">
      <div className="chatbot-header">
        <div className="chatbot-header-left">
          <Switch checked={v.enabled} onChange={(x) => setV((c) => ({ ...c, enabled: x }))} />
          <div>
            <h2 className="chatbot-title">Chatbot de Triagem</h2>
            <p className="chatbot-subtitle">Configure o roteador automático de atendimento (menu de setores)</p>
          </div>
        </div>
        <span className={`chatbot-badge ${v.enabled ? "chatbot-badge--on" : "chatbot-badge--off"}`} title={v.enabled ? "Clique no interruptor para desativar" : "Clique no interruptor para ativar"}>
          {v.enabled ? "Ativado" : "Desativado"}
        </span>
      </div>

      <div className="chatbot-grid">
        <div className="chatbot-form">
          <div className="chatbot-card">
            <h3 className="chatbot-card-title">Mensagens</h3>
            <div className="ia-field">
              <label title="Enviada quando o cliente manda a primeira mensagem. Inclua as opções do menu (ex: 1 - Atendimento, 2 - Vendas).">
                Mensagem de boas-vindas
              </label>
              <textarea
                className="ia-textarea chatbot-textarea"
                rows={6}
                value={v.welcomeMessage || ""}
                onChange={(e) => setV((c) => ({ ...c, welcomeMessage: e.target.value }))}
                placeholder="Olá! Seja bem-vindo(a) à sua empresa.&#10;Para direcionarmos seu atendimento, escolha o setor:&#10;&#10;1 - Atendimento&#10;2 - Vendas&#10;3 - Financeiro&#10;&#10;Responda com o número da opção desejada."
              />
            </div>
            <div className="ia-field">
              <label title="Enviada quando o cliente digita um número que não está no menu.">
                Mensagem de opção inválida
              </label>
              <textarea
                className="ia-textarea"
                rows={2}
                value={v.invalidOptionMessage || ""}
                onChange={(e) => setV((c) => ({ ...c, invalidOptionMessage: e.target.value }))}
                placeholder="Opção inválida. Por favor, responda apenas com o número do setor desejado."
              />
            </div>
            <div className="ia-field">
              <label title="Após o cliente escolher uma opção válida. Use {{departamento}} para substituir pelo nome do setor.">
                Mensagem de confirmação (use {"{{departamento}}"} para o nome do setor)
              </label>
              <textarea
                className="ia-textarea"
                rows={2}
                value={v.confirmSelectionMessage || ""}
                onChange={(e) => setV((c) => ({ ...c, confirmSelectionMessage: e.target.value }))}
                placeholder="Perfeito! Seu atendimento foi direcionado para o setor {{departamento}}. Em instantes nossa equipe dará continuidade."
              />
            </div>
          </div>

          <div className="chatbot-card">
            <h3 className="chatbot-card-title">Comportamento</h3>
            <div className="ia-field">
              <label title="Define o que acontece quando o cliente responde com o número do setor.">
                Como a conversa chega ao setor
              </label>
              <select
                className="ia-select"
                value={v.tipo_distribuicao ?? "fila"}
                onChange={(e) => setV((c) => ({ ...c, tipo_distribuicao: e.target.value }))}
                title="Define o que acontece quando o cliente responde com o número do setor."
              >
                <option value="fila">Todos do setor veem — quem assumir primeiro atende (recomendado)</option>
                <option value="round_robin">Rotação automática entre atendentes do setor</option>
                <option value="menor_carga">Atribuir ao atendente com menos conversas</option>
              </select>
            </div>
            <div className="ia-field">
              <label title="O cliente pode digitar este comando (ex: 0) para ver o menu novamente.">
                Comando para reabrir menu (ex: 0)
              </label>
              <input
                type="text"
                className="ia-input chatbot-input-cmd"
                value={v.reopenMenuCommand ?? "0"}
                onChange={(e) => setV((c) => ({ ...c, reopenMenuCommand: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="ia-checkbox-row">
              <input
                type="checkbox"
                id="sendOnlyFirstTime"
                checked={v.sendOnlyFirstTime !== false}
                onChange={(e) => setV((c) => ({ ...c, sendOnlyFirstTime: e.target.checked }))}
              />
              <label htmlFor="sendOnlyFirstTime" title="Se marcado, o menu só é enviado quando o cliente manda a primeira mensagem.">
                Enviar menu apenas na primeira mensagem
              </label>
            </div>
          </div>

          <div className="chatbot-card">
            <h3 className="chatbot-card-title">Escolhas que o cliente verá no WhatsApp</h3>
            <p className="chatbot-card-subtitle">O que aparece quando alguém manda a primeira mensagem</p>
            <div className="chatbot-table-wrap">
              <table className="ia-table chatbot-table">
                <thead>
                  <tr>
                    <th title="O número que o cliente digita para escolher (1, 2, 3...)">Nº da opção</th>
                    <th title="O texto que aparece no menu (ex: Atendimento, Vendas)">O que o cliente vê</th>
                    <th title="Para qual equipe a conversa vai quando o cliente escolher esta opção">Setor que recebe a conversa</th>
                    <th title="Se desmarcado, esta opção não aparece no menu">Mostrar no menu</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {opts.map((o, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          type="text"
                          className="ia-input chatbot-input-key"
                          value={o.key ?? ""}
                          onChange={(e) => updateOption(idx, "key", e.target.value)}
                          placeholder="1"
                          title="O número que o cliente digita para escolher (1, 2, 3...)"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="ia-input"
                          value={o.label ?? ""}
                          onChange={(e) => updateOption(idx, "label", e.target.value)}
                          placeholder="Atendimento"
                          title="O texto que aparece no menu (ex: Atendimento, Vendas)"
                        />
                      </td>
                      <td>
                        <select
                          className="ia-select"
                          value={o.departamento_id ?? ""}
                          onChange={(e) => updateOption(idx, "departamento_id", e.target.value)}
                          title="Para qual equipe a conversa vai quando o cliente escolher esta opção"
                        >
                          <option value="">Selecione</option>
                          {departamentos.map((d) => (
                            <option key={d.id} value={d.id}>{d.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td title="Desmarque para ocultar esta opção do menu (opção desativada)">
                        <input
                          type="checkbox"
                          checked={o.active !== false}
                          onChange={(e) => updateOption(idx, "active", e.target.checked)}
                          aria-label="Mostrar esta opção no menu"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="chatbot-btn-remove"
                          onClick={() => removeOption(idx)}
                          aria-label="Remover esta opção"
                          title="Remover esta opção"
                        >
                          Remover esta opção
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {departamentos.length === 0 && (
              <p className="chatbot-hint">Cadastre departamentos em Configurações para vincular às opções.</p>
            )}
            <button type="button" className="chatbot-btn-add" onClick={addOption}>
              + Adicionar nova escolha
            </button>
          </div>

          <div className="chatbot-actions">
            <button className="ia-btn ia-btn--primary chatbot-btn-save" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar configuração"}
            </button>
          </div>
        </div>

        <div className="chatbot-preview">
          <div className="chatbot-preview-card">
            <h3 className="chatbot-preview-title">Preview — Como o cliente verá</h3>
            <div className="chatbot-preview-phone">
              <div className="chatbot-preview-bubbles">
                <div className="chatbot-bubble chatbot-bubble--in">
                  <span className="chatbot-bubble-time">agora</span>
                  <div className="chatbot-bubble-text">
                    {(v.welcomeMessage || "Digite a mensagem de boas-vindas ao lado.").split("\n").map((line, i) => (
                      <span key={i}>{line || " "}<br /></span>
                    ))}
                  </div>
                </div>
                <div className="chatbot-bubble chatbot-bubble--out">
                  <span className="chatbot-bubble-time">agora</span>
                  <div className="chatbot-bubble-text">1</div>
                </div>
                <div className="chatbot-bubble chatbot-bubble--in">
                  <span className="chatbot-bubble-time">agora</span>
                  <div className="chatbot-bubble-text">
                    {previewConfirm || "Mensagem de confirmação (ex: Perfeito! Seu atendimento foi direcionado para o setor Vendas...)"}
                  </div>
                </div>
              </div>
            </div>
            <p className="chatbot-preview-hint">Simulação: cliente responde "1" → recebe confirmação com setor "{previewDept}"</p>
          </div>
        </div>
      </div>

      <div className="chatbot-logs">
        <div className="chatbot-logs-header">
          <h3 className="chatbot-card-title">Logs recentes</h3>
          <button type="button" className="ia-btn ia-btn--outline chatbot-btn-refresh" onClick={onRefreshLogs}>
            Atualizar
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="chatbot-empty">Nenhum log registrado.</p>
        ) : (
          <div className="chatbot-logs-list">
            {logs.map((l) => {
              const dataStr = l.criado_em ? new Date(l.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
              const detalhesStr = l.detalhes?.departamento || l.detalhes?.label || l.detalhes?.texto || "";
              const part3 = detalhesStr
                ? (l.conversa_id ? `${detalhesStr} (conv #${l.conversa_id})` : detalhesStr)
                : (l.conversa_id ? `conv #${l.conversa_id}` : "");
              const fullStr = [dataStr, l.tipo, part3].filter(Boolean).join(" — ");
              return (
                <div key={l.id} className={`chatbot-log-item ${l.tipo === "erro" ? "chatbot-log-item--error" : ""}`}>
                  {fullStr}
                </div>
              );
            })}
          </div>
        )}
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
