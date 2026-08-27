import { useCallback, useEffect, useRef, useState } from "react";
import * as iaApi from "../../api/iaService";
import { getUsuarios } from "../../api/configService";
import { useNotificationStore } from "../../notifications/notificationStore";
import { SkeletonGrid } from "../../components/feedback/Skeleton";
import Switch from "../../components/ui/Switch";
import { DEFAULT_ALERTA_SEM_RESPOSTA } from "../shared/configDefaults";
import { DIAS_SEMANA, formatAdminAlertContactOption, formatTimeForInput } from "../shared/dateTime";
import { useClienteOptions } from "../gestores/useClienteOptions";
import { buildAlertaSemRespostaPayload } from "./alertaPayload";
import { clearResource, loadResource } from "../shared/resourceCache";

function normalizeAlertaSemRespostaFromApi(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const bool = (value, fallback = false) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    const rawValue = String(value ?? "").trim().toLowerCase();
    if (["1", "true", "sim", "yes", "on", "ativo"].includes(rawValue)) return true;
    if (["0", "false", "nao", "n\u00e3o", "no", "off", "inativo"].includes(rawValue)) return false;
    return fallback;
  };
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  const responsaveis = Array.isArray(s.responsaveis_notificacao_ids)
    ? s.responsaveis_notificacao_ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  const gestorId = Number(s.gestor_notificado_id ?? responsaveis[0]);
  const gestorClienteId = Number(s.gestor_cliente_id);
  const horarioApi = s.horario_comercial && typeof s.horario_comercial === "object" ? s.horario_comercial : null;
  const janelaApi = Array.isArray(horarioApi?.janelas) && horarioApi.janelas.length ? horarioApi.janelas[0] : null;
  return {
    ...DEFAULT_ALERTA_SEM_RESPOSTA,
    ...s,
    alerta_sem_resposta_ativo: bool(s.alerta_sem_resposta_ativo, bool(s.ativo, false)),
    tempo_primeiro_alerta_minutos: num(s.tempo_primeiro_alerta_minutos, 1),
    tempo_alerta_critico_minutos: num(s.tempo_alerta_critico_minutos, 3),
    tempo_notificar_gestor_minutos: num(s.tempo_notificar_gestor_minutos, 5),
    notificar_por_whatsapp: bool(s.notificar_por_whatsapp, false),
    notificar_por_email: bool(s.notificar_por_email, false),
    notificar_interno: bool(s.notificar_interno, true),
    reabrir_conversa_automaticamente: bool(s.reabrir_conversa_automaticamente, true),
    aplicar_tag_automatica: bool(s.aplicar_tag_automatica, true),
    nome_tag_automatica: String(s.nome_tag_automatica || DEFAULT_ALERTA_SEM_RESPOSTA.nome_tag_automatica).trim(),
    gestor_notificado_id: Number.isFinite(gestorId) && gestorId > 0 ? gestorId : null,
    gestor_cliente_id: Number.isFinite(gestorClienteId) && gestorClienteId > 0 ? gestorClienteId : null,
    gestor_cliente_nome: String(s.gestor_cliente_nome || "").trim(),
    responsaveis_notificacao_ids: responsaveis,
    telefone_gestor: String(s.telefone_gestor || "").trim(),
    horario_comercial_ativo: bool(s.alerta_sem_resposta_ativo, bool(s.ativo, false)) ? true : bool(s.horario_comercial_ativo, true),
    timezone: String(s.timezone || horarioApi?.timezone || DEFAULT_ALERTA_SEM_RESPOSTA.timezone).trim(),
    horarioInicio: formatTimeForInput(s.horarioInicio || janelaApi?.inicio || "09:00"),
    horarioFim: formatTimeForInput(s.horarioFim || janelaApi?.fim || "18:00"),
    diasSemanaDesativados: Array.isArray(s.diasSemanaDesativados)
      ? s.diasSemanaDesativados.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : Array.isArray(horarioApi?.dias_semana_desativados)
        ? horarioApi.dias_semana_desativados.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        : [0, 6],
    datasEspecificasFechadas: Array.isArray(s.datasEspecificasFechadas)
      ? s.datasEspecificasFechadas.map(String).filter(Boolean)
      : Array.isArray(horarioApi?.datas_especificas_fechadas)
        ? horarioApi.datas_especificas_fechadas.map(String).filter(Boolean)
        : [],
    horario_comercial: horarioApi,
  };
}

function validateAlertaSemResposta(v) {
  const first = Number(v.tempo_primeiro_alerta_minutos);
  const critical = Number(v.tempo_alerta_critico_minutos);
  const manager = Number(v.tempo_notificar_gestor_minutos);
  if (!Number.isFinite(first) || first <= 0) return "Informe um tempo maior que zero para o primeiro alerta.";
  if (!Number.isFinite(critical) || critical < first) return "O alerta critico nao pode ser menor que o primeiro alerta.";
  if (!Number.isFinite(manager) || manager < critical) return "A notificacao ao gestor nao pode ser menor que o alerta critico.";
  if (v.aplicar_tag_automatica && !String(v.nome_tag_automatica || "").trim()) return "Informe o nome da tag automatica.";
  if (!v.alerta_sem_resposta_ativo) return null;
  if (v.notificar_interno) {
    const gestorId = Number(v.gestor_notificado_id);
    if (!(Number.isFinite(gestorId) && gestorId > 0)) {
      return "Selecione um responsavel interno da empresa.";
    }
  }
  if (v.notificar_por_whatsapp) {
    const clienteId = Number(v.gestor_cliente_id);
    const manual = String(v.telefone_gestor || "").replace(/\D/g, "");
    if (!(Number.isFinite(clienteId) && clienteId > 0) && (!manual || manual.length < 10)) {
      return "Para WhatsApp, selecione um contato cadastrado no sistema.";
    }
  }
  if (v.notificar_por_email) return "E-mail esta indisponivel ate a configuracao de SMTP no servidor.";
  if (!v.notificar_por_whatsapp && !v.notificar_por_email && !v.notificar_interno) {
    return "Selecione ao menos um canal de notificacao disponivel.";
  }
  return null;
}

function formatAlertaEventoTipo(tipo) {
  const map = {
    primeiro_alerta: "Primeiro alerta enviado",
    alerta_critico: "Alerta critico enviado",
    gestor_notificado: "Gestor notificado",
    whatsapp_enviado: "WhatsApp enviado ao gestor",
    tag_aplicada: "Tag aplicada",
    conversa_reaberta: "Conversa reaberta",
    sla_resetado: "SLA resetado",
    whatsapp_falha: "Falha no WhatsApp",
    email_indisponivel: "E-mail indisponivel",
  };
  return map[tipo] || tipo || "Evento";
}

function getHorarioComercialResumo(cfg) {
  const horario = cfg?.horario_comercial && typeof cfg.horario_comercial === "object" ? cfg.horario_comercial : null;
  if (horario?.resumo) return horario.resumo;
  if (cfg?.horario_comercial_ativo === false) {
    return "Contagem ativa: horario comercial desativado. Os minutos contam de forma corrida.";
  }
  return "Contagem ativa conforme o horario comercial configurado para a empresa. Fora desse horario, os minutos ficam pausados e continuam no proximo expediente.";
}

export default function AlertasAtendimentoSection({ companyKey }) {
  const showToast = useNotificationStore((s) => s.showToast);
  const [cfg, setCfg] = useState(DEFAULT_ALERTA_SEM_RESPOSTA);
  const [logs, setLogs] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [featureUnavailable, setFeatureUnavailable] = useState(
    () => !iaApi.isAlertaSemRespostaApiEnabled()
  );
  const [novaDataFechadaAlerta, setNovaDataFechadaAlerta] = useState("");
  const loadGenerationRef = useRef(0);
  const gestorContatos = useClienteOptions(cfg.notificar_por_whatsapp);

  const gestores = usuarios.filter((u) => {
    const perfil = String(u.perfil || u.role || "").toLowerCase();
    return perfil === "admin" || perfil === "gestor" || perfil === "supervisor";
  });
  const responsaveis = gestores.length ? gestores : usuarios.filter((u) => String(u.perfil || "").toLowerCase() !== "atendente");

  const load = useCallback(async (force = false) => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setError("");
    try {
      const bundle = await loadResource(`ia:${companyKey}:alertas`, async () => {
        const usuariosResp = await getUsuarios().catch(() => []);
        if (!iaApi.isAlertaSemRespostaApiEnabled()) {
          return { usuariosResp, unavailable: true, configResp: null, eventosResp: [] };
        }
        const configResp = await iaApi.getAlertaSemRespostaConfig();
        if (configResp == null) {
          return { usuariosResp, unavailable: true, configResp: null, eventosResp: [] };
        }
        let eventosResp = [];
        try {
          eventosResp = await iaApi.getAlertaSemRespostaEventos({ limit: 20 });
        } catch (eventosErr) {
          if (import.meta.env.DEV) console.warn("Logs de alerta indisponiveis:", eventosErr);
        }
        return { usuariosResp, unavailable: false, configResp, eventosResp };
      }, { force });
      if (generation !== loadGenerationRef.current) return;
      setUsuarios(Array.isArray(bundle.usuariosResp) ? bundle.usuariosResp : []);
      if (bundle.unavailable) {
        setFeatureUnavailable(true);
        setCfg(DEFAULT_ALERTA_SEM_RESPOSTA);
        setLogs([]);
        setError(
          "Os alertas de atendimento ainda nao estao disponiveis neste servidor. Atualize o backend ou contate o suporte."
        );
        return;
      }
      setFeatureUnavailable(false);
      setCfg(normalizeAlertaSemRespostaFromApi(bundle.configResp));
      setLogs(Array.isArray(bundle.eventosResp) ? bundle.eventosResp : []);
    } catch (e) {
      if (import.meta.env.DEV) console.warn("Erro ao carregar alerta sem resposta:", e);
      if (generation === loadGenerationRef.current) {
        setError(e?.response?.data?.error || "Nao foi possivel carregar os alertas de atendimento.");
      }
    } finally {
      if (generation === loadGenerationRef.current) setLoading(false);
    }
  }, [companyKey]);

  useEffect(() => {
    load();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [load]);

  const validation = validateAlertaSemResposta(cfg);
  const previewFirst = Number(cfg.tempo_primeiro_alerta_minutos) || 1;
  const previewCritical = Number(cfg.tempo_alerta_critico_minutos) || 3;
  const previewManager = Number(cfg.tempo_notificar_gestor_minutos) || 5;
  const horarioComercialResumo = getHorarioComercialResumo(cfg);
  const tagResumo =
    cfg.aplicar_tag_automatica && String(cfg.nome_tag_automatica || "").trim()
      ? String(cfg.nome_tag_automatica).trim()
      : "desativada";
  const selectedGestor = responsaveis.find((u) => Number(u.id) === Number(cfg.gestor_notificado_id));
  const selectedGestorContatoId = cfg.gestor_cliente_id ? String(cfg.gestor_cliente_id) : "";
  const gestorContatoSelectOptions = (() => {
    const base = [...gestorContatos.options];
    if (cfg.gestor_cliente_id && !base.some((c) => String(c.id) === String(cfg.gestor_cliente_id))) {
      base.unshift({
        id: Number(cfg.gestor_cliente_id),
        nome: cfg.gestor_cliente_nome || `Cliente ${cfg.gestor_cliente_id}`,
        telefone: cfg.telefone_gestor || "",
      });
    }
    return base;
  })();

  const handleSave = async () => {
    const msg = validateAlertaSemResposta(cfg);
    if (msg) {
      setError(msg);
      showToast({ type: "error", title: "Configuracao invalida", message: msg });
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await iaApi.putAlertaSemRespostaConfig(buildAlertaSemRespostaPayload(cfg));
      clearResource(`ia:${companyKey}:alertas`);
      const refreshed = await iaApi.getAlertaSemRespostaConfig().catch(() => saved);
      setCfg(normalizeAlertaSemRespostaFromApi(refreshed || saved));
      showToast({ type: "success", title: "Salvo", message: "Alertas de atendimento atualizados." });
      const eventos = await iaApi.getAlertaSemRespostaEventos({ limit: 20 }).catch(() => logs);
      setLogs(eventos || []);
    } catch (e) {
      const msgErr =
        e?.code === "ALERTA_SEM_RESPOSTA_UNAVAILABLE"
          ? e.message
          : e?.response?.data?.error || "Nao foi possivel salvar a configuracao.";
      setError(msgErr);
      showToast({ type: "error", title: "Erro ao salvar", message: msgErr });
    } finally {
      setSaving(false);
    }
  };

  const handleDryRun = async () => {
    setChecking(true);
    try {
      const result = await iaApi.processarAlertaSemResposta(true);
      const total = Number(result?.processadas || 0);
      const skipped = String(result?.skipped || "");
      const paused = skipped === "fora_horario";
      showToast({
        type: paused ? "warning" : "success",
        title: paused ? "Contador pausado" : "Simulacao concluida",
        message: paused
          ? `Nenhum alerta dispararia agora porque esta fora do expediente. ${result?.horario_comercial?.resumo || horarioComercialResumo}`
          : total
            ? `${total} conversa(s) elegiveis agora.`
            : "Nenhuma conversa elegivel neste momento.",
      });
    } catch (e) {
      showToast({
        type: "error",
        title: "Falha na simulacao",
        message:
          e?.code === "ALERTA_SEM_RESPOSTA_UNAVAILABLE"
            ? e.message
            : e?.response?.data?.error || "Nao foi possivel processar a simulacao.",
      });
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <div className="sla-section">
        <SkeletonGrid count={4} />
      </div>
    );
  }

  return (
    <div className="sla-section">
      <div className="sla-header">
        <div>
          <h2 className="chatbot-title">Alertas de Atendimento</h2>
          <p className="chatbot-subtitle">Configure escalonamento quando a ultima mensagem da conversa for do cliente. Os prazos contam dentro do horario comercial.</p>
        </div>
        <span className={`chatbot-badge ${cfg.alerta_sem_resposta_ativo ? "chatbot-badge--on" : "chatbot-badge--off"}`}>
          {cfg.alerta_sem_resposta_ativo ? "Ativo" : "Inativo"}
        </span>
      </div>

      {error && (
        <div className="sla-inline-error" role="alert">
          {error}
        </div>
      )}

      <div className="sla-grid">
        <div className="sla-main">
          <div className="chatbot-card sla-card">
            <div className="sla-card-head">
              <div>
                <h3 className="chatbot-card-title">Alerta de atendimento sem resposta</h3>
                <p className="chatbot-card-subtitle">Evite que clientes fiquem esquecidos quando um atendente nao responde no prazo.</p>
              </div>
              <Switch
                checked={cfg.alerta_sem_resposta_ativo}
                onChange={(x) =>
                  setCfg((c) => ({
                    ...c,
                    alerta_sem_resposta_ativo: x,
                    horario_comercial_ativo: x ? true : c.horario_comercial_ativo,
                  }))
                }
              />
            </div>
            <div className="sla-note">
              O fluxo roda somente quando esta ativo, a conversa nao esta encerrada, a ultima mensagem foi enviada pelo cliente e o atendimento esta dentro do horario comercial.
            </div>
            <div className="sla-schedule-callout">
              <strong>Contagem do temporizador</strong>
              <span>{horarioComercialResumo}</span>
            </div>
          </div>

          <div className="chatbot-card sla-card">
            <div className="sla-card-head">
              <div>
                <h3 className="chatbot-card-title">Horario comercial do alerta</h3>
                <p className="chatbot-card-subtitle">
                  Defina quando os alertas podem disparar. Fora desse horario, o contador fica pausado e nenhuma acao e executada.
                </p>
              </div>
              <Switch
                checked={cfg.horario_comercial_ativo !== false}
                disabled={cfg.alerta_sem_resposta_ativo}
                onChange={(x) => setCfg((c) => ({ ...c, horario_comercial_ativo: x }))}
              />
            </div>
            <div
              className="chatbot-fora-horario-fields"
              style={{
                opacity: cfg.horario_comercial_ativo !== false ? 1 : 0.55,
                pointerEvents: cfg.horario_comercial_ativo !== false ? "auto" : "none",
              }}
            >
              <div className="chatbot-subsection">
                <h4 className="chatbot-subsection-title">Horario de atendimento</h4>
                <div className="chatbot-time-row">
                  <div className="ia-field">
                    <label>Inicio</label>
                    <input
                      type="time"
                      className="ia-input"
                      value={formatTimeForInput(cfg.horarioInicio) || "09:00"}
                      onChange={(e) => setCfg((c) => ({ ...c, horarioInicio: e.target.value }))}
                    />
                  </div>
                  <div className="ia-field">
                    <label>Termino</label>
                    <input
                      type="time"
                      className="ia-input"
                      value={formatTimeForInput(cfg.horarioFim) || "18:00"}
                      onChange={(e) => setCfg((c) => ({ ...c, horarioFim: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="chatbot-hint">Horarios que atravessam meia-noite sao suportados (ex: 22:00-06:00).</p>
              </div>

              <div className="chatbot-subsection">
                <h4 className="chatbot-subsection-title">Dias da semana em que nao trabalha</h4>
                <div className="chatbot-dias-row">
                  {DIAS_SEMANA.map((d) => {
                    const dias = cfg.diasSemanaDesativados || [0, 6];
                    const checked = dias.includes(d.num);
                    return (
                      <label key={d.num} className="chatbot-dia-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const prev = cfg.diasSemanaDesativados || [0, 6];
                            const next = checked
                              ? prev.filter((n) => n !== d.num)
                              : [...prev.filter((n) => n !== d.num), d.num].sort((a, b) => a - b);
                            setCfg((c) => ({ ...c, diasSemanaDesativados: next.length > 0 ? next : [0, 6] }));
                          }}
                        />
                        <span>{d.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="chatbot-hint">Marcado = nao trabalha. Padrao: Dom e Sab marcados.</p>
              </div>

              <div className="chatbot-subsection">
                <h4 className="chatbot-subsection-title">Datas especificas fechadas (feriados, recesso)</h4>
                <div className="chatbot-datas-row">
                  <input
                    type="date"
                    className="ia-input chatbot-input-date"
                    value={novaDataFechadaAlerta}
                    onChange={(e) => setNovaDataFechadaAlerta(e.target.value)}
                  />
                  <button
                    type="button"
                    className="ia-btn ia-btn--outline"
                    onClick={() => {
                      if (!novaDataFechadaAlerta) return;
                      const datas = cfg.datasEspecificasFechadas || [];
                      if (!datas.includes(novaDataFechadaAlerta)) {
                        setCfg((c) => ({
                          ...c,
                          datasEspecificasFechadas: [...datas, novaDataFechadaAlerta].sort(),
                        }));
                        setNovaDataFechadaAlerta("");
                      }
                    }}
                  >
                    + Adicionar data
                  </button>
                </div>
                {(cfg.datasEspecificasFechadas || []).length > 0 && (
                  <ul className="chatbot-datas-list">
                    {(cfg.datasEspecificasFechadas || []).map((d) => (
                      <li key={d} className="chatbot-datas-item">
                        <span>{new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR")}</span>
                        <button
                          type="button"
                          className="chatbot-btn-remove"
                          onClick={() =>
                            setCfg((c) => ({
                              ...c,
                              datasEspecificasFechadas: (c.datasEspecificasFechadas || []).filter((x) => x !== d),
                            }))
                          }
                        >
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {cfg.alerta_sem_resposta_ativo && (
              <p className="chatbot-hint" style={{ marginTop: 12 }}>
                Com o alerta ativo, o horario comercial fica sempre ligado para evitar disparos fora do expediente.
              </p>
            )}
          </div>

          <div className="chatbot-card sla-card">
            <h3 className="chatbot-card-title">Tempos de alerta</h3>
            <div className="sla-time-grid">
              <div className="ia-field">
                <label>Primeiro alerta de atencao apos</label>
                <div className="sla-input-suffix">
                  <input
                    type="number"
                    min="1"
                    className="ia-input"
                    value={cfg.tempo_primeiro_alerta_minutos}
                    onChange={(e) => setCfg((c) => ({ ...c, tempo_primeiro_alerta_minutos: e.target.value }))}
                  />
                  <span>min</span>
                </div>
              </div>
              <div className="ia-field">
                <label>Alerta critico apos</label>
                <div className="sla-input-suffix">
                  <input
                    type="number"
                    min="1"
                    className="ia-input"
                    value={cfg.tempo_alerta_critico_minutos}
                    onChange={(e) => setCfg((c) => ({ ...c, tempo_alerta_critico_minutos: e.target.value }))}
                  />
                  <span>min</span>
                </div>
              </div>
              <div className="ia-field">
                <label>Notificar gestor/admin apos</label>
                <div className="sla-input-suffix">
                  <input
                    type="number"
                    min="1"
                    className="ia-input"
                    value={cfg.tempo_notificar_gestor_minutos}
                    onChange={(e) => setCfg((c) => ({ ...c, tempo_notificar_gestor_minutos: e.target.value }))}
                  />
                  <span>min</span>
                </div>
              </div>
            </div>
            {validation && <p className="sla-field-error">{validation}</p>}
            <p className="chatbot-hint">Quando o horario comercial estiver ativo, os minutos pausam fora do expediente e continuam no proximo periodo de atendimento.</p>
          </div>

          <div className="chatbot-card sla-card">
            <h3 className="chatbot-card-title">Acao automatica</h3>
            <div className="sla-switch-list">
              <label className="sla-switch-item">
                <Switch
                  checked={cfg.reabrir_conversa_automaticamente}
                  onChange={(x) => setCfg((c) => ({ ...c, reabrir_conversa_automaticamente: x }))}
                />
                <span>
                  <strong>Reabrir/liberar conversa automaticamente</strong>
                  <small>Ao atingir o tempo final, outro atendente ou gestor podera assumir.</small>
                </span>
              </label>
              <label className="sla-switch-item">
                <Switch
                  checked={cfg.aplicar_tag_automatica}
                  onChange={(x) => setCfg((c) => ({ ...c, aplicar_tag_automatica: x }))}
                />
                <span>
                  <strong>Aplicar tag automatica</strong>
                  <small>Ajuda supervisao e filtros operacionais.</small>
                </span>
              </label>
            </div>
            <div className="ia-field" style={{ marginTop: 14 }}>
              <label>Nome da tag automatica</label>
              <input
                className="ia-input"
                value={cfg.nome_tag_automatica}
                disabled={!cfg.aplicar_tag_automatica}
                onChange={(e) => setCfg((c) => ({ ...c, nome_tag_automatica: e.target.value }))}
              />
            </div>
          </div>

          <div className="chatbot-card sla-card">
            <h3 className="chatbot-card-title">Notificacao do gestor</h3>
            <div className="sla-channel-grid">
              <label className="sla-check-card">
                <input
                  type="checkbox"
                  checked={cfg.notificar_por_whatsapp}
                  onChange={(e) => setCfg((c) => ({ ...c, notificar_por_whatsapp: e.target.checked }))}
                />
                <span>WhatsApp</span>
              </label>
              <label className="sla-check-card">
                <input
                  type="checkbox"
                  checked={cfg.notificar_por_email}
                  onChange={(e) => {
                    if (e.target.checked) {
                      showToast({
                        type: "warning",
                        title: "E-mail indisponivel",
                        message: "Configure SMTP no servidor antes de ativar notificacao por e-mail.",
                      });
                      return;
                    }
                    setCfg((c) => ({ ...c, notificar_por_email: false }));
                  }}
                />
                <span>E-mail</span>
              </label>
              <label className="sla-check-card">
                <input
                  type="checkbox"
                  checked={cfg.notificar_interno}
                  onChange={(e) => setCfg((c) => ({ ...c, notificar_interno: e.target.checked }))}
                />
                <span>Interna</span>
              </label>
            </div>
            <div className="sla-manager-grid">
              <div className="ia-field">
                <label>Responsavel (alerta interno)</label>
                <select
                  className="ia-select"
                  value={cfg.gestor_notificado_id || ""}
                  onChange={(e) => setCfg((c) => ({ ...c, gestor_notificado_id: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">Admin principal / regras do sistema</option>
                  {responsaveis.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome || u.email || `Usuario ${u.id}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {cfg.notificar_por_whatsapp ? (
              <div className="ia-field" style={{ marginTop: 14 }}>
                <label>Contato WhatsApp do gestor (cadastrado no sistema)</label>
                <div className="chatbot-time-row" style={{ alignItems: "flex-end", gap: 12 }}>
                  <input
                    type="search"
                    className="ia-input"
                    value={gestorContatos.search}
                    onChange={(e) => gestorContatos.setSearch(e.target.value)}
                    placeholder="Buscar por nome ou telefone"
                    autoComplete="off"
                    style={{ minWidth: 220 }}
                  />
                  <select
                    className="ia-select"
                    value={selectedGestorContatoId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const contato = gestorContatoSelectOptions.find((c) => String(c.id) === id);
                      setCfg((c) => ({
                        ...c,
                        gestor_cliente_id: id ? Number(id) : null,
                        gestor_cliente_nome: contato ? String(contato.nome || contato.pushname || "").trim().slice(0, 120) : "",
                        telefone_gestor: contato ? String(contato.telefone || contato.wa_id || "").trim().slice(0, 40) : "",
                      }));
                    }}
                    style={{ minWidth: 280 }}
                  >
                    <option value="">{gestorContatos.loading ? "Carregando contatos..." : "Selecione um contato"}</option>
                    {gestorContatoSelectOptions.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {formatAdminAlertContactOption(cliente)}
                      </option>
                    ))}
                  </select>
                </div>
                {cfg.telefone_gestor ? (
                  <p className="chatbot-hint" style={{ marginTop: 6 }}>
                    Envio para {cfg.gestor_cliente_nome || "contato selecionado"} ({cfg.telefone_gestor}).
                  </p>
                ) : (
                  <p className="chatbot-hint" style={{ marginTop: 6 }}>
                    O contato precisa ter telefone ou WhatsApp cadastrado.
                  </p>
                )}
              </div>
            ) : null}
            {selectedGestor && (
              <p className="chatbot-hint">Responsavel interno: {selectedGestor.nome || selectedGestor.email || `Usuario ${selectedGestor.id}`}</p>
            )}
            <p className="chatbot-hint">
              {cfg.notificar_por_email
                ? "E-mail ativo pelo servidor. A edicao do provedor SMTP/transacional ainda nao esta disponivel nesta tela."
                : "E-mail fica indisponivel ate a configuracao de um provedor SMTP/transacional no servidor."}
            </p>
          </div>

          <div className="sla-actions">
            <button
              type="button"
              className="ia-btn ia-btn--primary"
              onClick={handleSave}
              disabled={featureUnavailable || saving || !!validation}
            >
              {saving ? "Salvando..." : "Salvar configuracoes"}
            </button>
            <button
              type="button"
              className="ia-btn ia-btn--outline"
              onClick={handleDryRun}
              disabled={featureUnavailable || checking}
            >
              {checking ? "Simulando..." : "Simular agora"}
            </button>
            <button type="button" className="ia-btn ia-btn--outline" onClick={() => load(true)} disabled={saving || checking}>
              Recarregar
            </button>
          </div>
        </div>

        <aside className="sla-side">
          <div className="chatbot-card sla-card">
            <h3 className="chatbot-card-title">Como funciona</h3>
            <ol className="sla-flow">
              <li>Cliente envia mensagem</li>
              <li>Atendente nao responde</li>
              <li>Apos {previewFirst} min: alerta de atencao</li>
              <li>Apos {previewCritical} min: alerta critico</li>
              <li>Apos {previewManager} min: gestor notificado</li>
              <li>{cfg.reabrir_conversa_automaticamente ? "Conversa reaberta/liberada" : "Conversa permanece com o atendente"}</li>
              <li>Tag: {tagResumo}</li>
            </ol>
            <p className="sla-note">{horarioComercialResumo}</p>
          </div>

          <div className="chatbot-card sla-card">
            <h3 className="chatbot-card-title">Preview das mensagens</h3>
            <div className="sla-preview-list">
              <div className="sla-preview-message">
                <strong>Atendente</strong>
                <p>⚠️ Atencao: este cliente esta aguardando resposta ha {previewFirst} minutos. Responda agora para evitar escalonamento.</p>
              </div>
              <div className="sla-preview-message sla-preview-message--critical">
                <strong>Critico</strong>
                <p>🚨 Alerta critico: esta conversa esta sem resposta ha {previewCritical} minutos. Se nao houver resposta, {cfg.reabrir_conversa_automaticamente ? "o gestor sera notificado e a conversa podera ser reaberta" : "o gestor sera notificado para acompanhar a conversa"}.</p>
              </div>
              <div className="sla-preview-message sla-preview-message--manager">
                <strong>Gestor</strong>
                <p>🚨 ZapERP — Atendimento sem resposta<br /><br />Cliente: Carlos Almeida<br />Atendente: Joao<br />Tempo sem resposta: {previewManager}min<br /><br />Status: {cfg.reabrir_conversa_automaticamente ? "conversa reaberta e liberada para novo atendimento." : "gestor notificado; conversa permanece com o atendente atual."}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="chatbot-card sla-card sla-logs-card">
        <div className="chatbot-logs-header">
          <h3 className="chatbot-card-title">Logs recentes</h3>
          <button type="button" className="ia-btn ia-btn--outline chatbot-btn-refresh" onClick={() => load(true)}>
            Atualizar
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="chatbot-empty">Nenhum alerta registrado ainda.</p>
        ) : (
          <div className="sla-log-table-wrap">
            <table className="ia-table sla-log-table">
              <thead>
                <tr>
                  <th>Data/hora</th>
                  <th>Cliente</th>
                  <th>Atendente</th>
                  <th>Etapa</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.criado_em ? new Date(l.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                    <td>{l.detalhes?.cliente_nome || (l.conversa_id ? `Conversa #${l.conversa_id}` : "-")}</td>
                    <td>{l.detalhes?.atendente_nome || (l.atendente_id ? `Usuario #${l.atendente_id}` : "-")}</td>
                    <td>{formatAlertaEventoTipo(l.tipo)}</td>
                    <td>{l.nivel || l.detalhes?.status_atendimento || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

