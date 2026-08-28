import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../auth/authStore";
import { useEmpresaStore } from "../../auth/empresaStore";
import * as cfg from "../../api/configService";
import { useNotificationStore } from "../../notifications/notificationStore";
import Switch from "../../components/ui/Switch";
import PushNotificationsCard from "../../push/PushNotificationsCard";
import SectionState from "../components/SectionState";
import { useSectionResource } from "../hooks/useSectionResource";
import { FONTES_OPCOES, FONT_FAMILIES } from "../brandFonts";

const THEME_KEY = "theme";

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
  window.dispatchEvent(new CustomEvent("theme-change", { detail: theme }));
}

export function SecaoGeral({ empresa, empresasWhatsapp = [], onSave, onRefresh, onOpenConnectWhatsapp }) {
  const [v, setV] = useState(empresa || {});
  useEffect(() => setV(empresa || {}), [empresa]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { type: "ok"|"err", text }
  const [darkMode, setDarkMode] = useState(() => getStoredTheme() === "dark");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMsg, setLogoMsg] = useState(null);
  const [senhaCampanhas, setSenhaCampanhas] = useState("");

  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const showToast = useNotificationStore((s) => s.showToast);
  const isAdmin = String(user?.perfil || user?.role || "").toLowerCase() === "admin";
  const campanhasJaAtivo = empresa?.modulo_campanhas_ativo === true;
  const precisaSenhaCampanhas = isAdmin && !!v.modulo_campanhas_ativo && !campanhasJaAtivo;
  const [mostrarNomeAoCliente, setMostrarNomeAoCliente] = useState(user?.mostrar_nome_ao_cliente !== false);
  const [mostrarNomeLoading, setMostrarNomeLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    cfg.getUsuarioMe()
      .then((me) => {
        if (!cancelled && me?.mostrar_nome_ao_cliente !== undefined) {
          setMostrarNomeAoCliente(me.mostrar_nome_ao_cliente !== false);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleMostrarNomeToggle = async (on) => {
    setMostrarNomeLoading(true);
    try {
      const res = await cfg.patchUsuarioMe({ mostrar_nome_ao_cliente: on });
      setMostrarNomeAoCliente(res?.mostrar_nome_ao_cliente !== false);
      updateUser({ mostrar_nome_ao_cliente: res?.mostrar_nome_ao_cliente });
      showToast?.({ type: "success", title: "Preferência salva", message: "Alteração aplicada às suas mensagens." });
    } catch (e) {
      showToast?.({ type: "error", title: "Erro", message: e?.response?.data?.error || "Não foi possível salvar." });
    } finally {
      setMostrarNomeLoading(false);
    }
  };

  const handleDarkModeToggle = (on) => {
    const theme = on ? "dark" : "light";
    setDarkMode(on);
    applyTheme(theme);
  };

  if (!empresa) return <p className="ia-muted">Carregando...</p>;

  return (
    <div className="config-geral-section">
      <header className="config-geral-header">
        <span className="ia-auto-reply-eyebrow">Administração</span>
        <h4 className="config-geral-title">Configurações gerais</h4>
        <p className="config-geral-lead">Perfil do atendente, aparência da interface e parâmetros operacionais da empresa.</p>
      </header>

      {msg ? (
        <div className={`ia-error-banner ${msg.type === "ok" ? "is-ok" : ""}`} role="alert">
          {msg.text}
          <button type="button" onClick={() => setMsg(null)} aria-label="Fechar">×</button>
        </div>
      ) : null}

      <div className="config-geral-grid">
        <section className="config-geral-card" aria-labelledby="config-geral-perfil">
          <h5 id="config-geral-perfil" className="config-geral-card-title">Meu perfil</h5>
          <div className="config-geral-toggle">
            <div className="config-geral-toggle-text">
              <span className="config-geral-toggle-label">Mostrar meu nome nas mensagens ao cliente</span>
              <span className="config-geral-toggle-hint">
                Quando ativado, o cliente verá seu nome acima das mensagens que você envia no WhatsApp.
              </span>
            </div>
            <Switch
              checked={mostrarNomeAoCliente}
              onChange={handleMostrarNomeToggle}
              disabled={mostrarNomeLoading}
              aria-label="Mostrar nome ao cliente"
            />
          </div>
          <div className="config-geral-card-divider" />
          <PushNotificationsCard />
        </section>

        <section className="config-geral-card" aria-labelledby="config-geral-aparencia">
          <h5 id="config-geral-aparencia" className="config-geral-card-title">Aparência</h5>
          <div className="config-geral-toggle">
            <div className="config-geral-toggle-text">
              <span className="config-geral-toggle-label">Modo escuro</span>
              <span className="config-geral-toggle-hint">Altera apenas cores e contraste da interface neste dispositivo.</span>
            </div>
            <Switch checked={darkMode} onChange={handleDarkModeToggle} aria-label="Modo escuro" />
          </div>
        </section>

        <section className="config-geral-card config-geral-card--wide" aria-labelledby="config-geral-empresa">
          <h5 id="config-geral-empresa" className="config-geral-card-title">Dados da empresa</h5>
          <div className="config-geral-fields">
            <div className="ia-field">
              <label htmlFor="empresa-nome">Nome</label>
              <input
                id="empresa-nome"
                className="ia-input"
                value={v.nome || ""}
                onChange={(e) => setV((c) => ({ ...c, nome: e.target.value }))}
              />
            </div>
            <div className="config-geral-toggle">
              <div className="config-geral-toggle-text">
                <span className="config-geral-toggle-label">Empresa ativa</span>
                <span className="config-geral-toggle-hint">Desligue apenas para suspender o acesso da empresa ao sistema.</span>
              </div>
              <Switch checked={!!v.ativo} onChange={(x) => setV((c) => ({ ...c, ativo: x }))} aria-label="Empresa ativa" />
            </div>
            <div className="config-geral-toggle">
              <div className="config-geral-toggle-text">
                <span className="config-geral-toggle-label">Módulo CRM para a empresa</span>
                <span className="config-geral-toggle-hint">
                  Quando desligado, o botão «Enviar ao CRM» no chat não aparece e as APIs do CRM respondem com acesso negado.
                </span>
              </div>
              <Switch
                checked={v.crm_habilitado !== false}
                onChange={(on) => setV((c) => ({ ...c, crm_habilitado: on }))}
                aria-label="Módulo CRM ativo para a empresa"
              />
            </div>
            <div className="config-geral-toggle">
              <div className="config-geral-toggle-text">
                <span className="config-geral-toggle-label">Separar mensagens disparadas</span>
                <span className="config-geral-toggle-hint">
                  Quando ativado, mensagens enviadas pelo WhatsApp fora do ZapERP (pelo celular ou por campanha) ficam numa aba separada «Mensagens Disparadas» em vez de aparecer em «Abertas».
                </span>
              </div>
              <Switch
                checked={!!v.separar_mensagens_disparadas}
                onChange={(on) => setV((c) => ({ ...c, separar_mensagens_disparadas: on }))}
                aria-label="Separar mensagens disparadas"
              />
            </div>
            <div className="config-geral-toggle">
              <div className="config-geral-toggle-text">
                <span className="config-geral-toggle-label">Modo simples de atendimento</span>
                <span className="config-geral-toggle-hint">
                  Quando ativado, cada conversa mostra apenas «Aguardando atendente» ou «Aguardando cliente» conforme a última mensagem real. Não exige assumir nem encerrar para continuar respondendo.
                </span>
              </div>
              <Switch
                checked={!!v.atendimento_modo_simples}
                onChange={(on) => setV((c) => ({ ...c, atendimento_modo_simples: on }))}
                aria-label="Modo simples de atendimento"
              />
            </div>
            {isAdmin ? (
              <div className="config-geral-toggle config-geral-toggle--stack">
                <div className="config-geral-toggle-row">
                  <div className="config-geral-toggle-text">
                    <span className="config-geral-toggle-label">Módulo Campanhas</span>
                    <span className="config-geral-toggle-hint">
                      Quando ativado, o filtro Campanhas aparece na lista de conversas e o menu Disparo fica disponível para administradores. A ativação exige senha.
                    </span>
                  </div>
                  <Switch
                    checked={!!v.modulo_campanhas_ativo}
                    onChange={(on) => {
                      setV((c) => ({ ...c, modulo_campanhas_ativo: on }));
                      if (!on) setSenhaCampanhas("");
                    }}
                    aria-label="Módulo Campanhas"
                  />
                </div>
                {precisaSenhaCampanhas ? (
                  <div className="ia-field config-geral-senha-campanhas">
                    <label htmlFor="senha-modulo-campanhas">Senha de ativação</label>
                    <input
                      id="senha-modulo-campanhas"
                      type="password"
                      className="ia-input"
                      autoComplete="off"
                      value={senhaCampanhas}
                      onChange={(e) => setSenhaCampanhas(e.target.value)}
                      placeholder="Informe a senha para ativar"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            {String(user?.perfil || user?.role || "").toLowerCase() === "admin" ? (
              <div className="config-geral-toggle">
                <div className="config-geral-toggle-text">
                  <span className="config-geral-toggle-label">Mostrar atendentes no card</span>
                  <span className="config-geral-toggle-hint">
                    Quando ativado, o card da conversa mostra discretamente o nome dos usuários que assumiram o atendimento.
                  </span>
                </div>
                <Switch
                  checked={v.exibir_atendentes_no_card === true}
                  onChange={(on) => setV((c) => ({ ...c, exibir_atendentes_no_card: on }))}
                  aria-label="Mostrar atendentes no card"
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="config-geral-card config-geral-card--wide" aria-labelledby="config-geral-sla">
          <h5 id="config-geral-sla" className="config-geral-card-title">SLA e limites</h5>
          <div className="config-geral-fields config-geral-fields--grid">
            <div className="ia-field">
              <label htmlFor="sla-minutos">Minutos sem resposta para alerta</label>
              <input
                id="sla-minutos"
                type="number"
                className="ia-input"
                min={1}
                max={1440}
                value={v.sla_minutos_sem_resposta ?? 30}
                onChange={(e) => setV((c) => ({ ...c, sla_minutos_sem_resposta: Number(e.target.value) || 30 }))}
              />
            </div>
            <div className="ia-field">
              <label htmlFor="limite-chats">Chats simultâneos por atendente</label>
              <input
                id="limite-chats"
                type="number"
                className="ia-input"
                min={0}
                max={100}
                value={v.limite_chats_por_atendente ?? 10}
                onChange={(e) => setV((c) => ({ ...c, limite_chats_por_atendente: Math.max(0, Number(e.target.value) || 0) }))}
              />
              <span className="config-geral-field-hint">0 = sem limite</span>
            </div>
            <div className="ia-field">
              <label htmlFor="timeout-inatividade">Timeout inatividade (min)</label>
              <input
                id="timeout-inatividade"
                type="number"
                className="ia-input"
                min={0}
                max={10080}
                value={v.timeout_inatividade_min ?? 0}
                onChange={(e) => setV((c) => ({ ...c, timeout_inatividade_min: Math.max(0, Number(e.target.value) || 0) }))}
              />
              <span className="config-geral-field-hint">0 = desativado — fecha conversa sem resposta</span>
            </div>
          </div>
        </section>

        <section className="config-geral-card" aria-labelledby="config-geral-horarios">
          <h5 id="config-geral-horarios" className="config-geral-card-title">Horário comercial</h5>
          <div className="config-geral-fields config-geral-fields--grid2">
            <div className="ia-field">
              <label htmlFor="horario-inicio">Início</label>
              <input
                id="horario-inicio"
                type="time"
                className="ia-input"
                value={v.horario_inicio || "09:00"}
                onChange={(e) => setV((c) => ({ ...c, horario_inicio: e.target.value }))}
              />
            </div>
            <div className="ia-field">
              <label htmlFor="horario-fim">Fim</label>
              <input
                id="horario-fim"
                type="time"
                className="ia-input"
                value={v.horario_fim || "18:00"}
                onChange={(e) => setV((c) => ({ ...c, horario_fim: e.target.value }))}
              />
            </div>
          </div>
        </section>

        <section className="config-geral-card config-geral-card--wide" aria-labelledby="config-geral-tema">
          <h5 id="config-geral-tema" className="config-geral-card-title">Tema e identidade</h5>
          <div className="config-geral-fields config-geral-fields--grid3">
            <div className="ia-field">
              <label htmlFor="empresa-tema">Tema padrão (sistema)</label>
              <select
                id="empresa-tema"
                className="ia-select"
                value={v.tema || "light"}
                onChange={(e) => setV((c) => ({ ...c, tema: e.target.value }))}
              >
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
              </select>
            </div>
            <div className="ia-field config-geral-field--span2">
              <label>Logo da empresa</label>
              <div className="config-logo-wrap">
                {v.logo_url ? (
                  <div className="config-logo-preview-row">
                    <div className="config-logo-preview-box">
                      <img
                        src={v.logo_url}
                        alt="Logo da empresa"
                        className="config-logo-preview-img"
                        onError={(e) => { e.currentTarget.style.opacity = "0.3"; e.currentTarget.title = "Imagem não encontrada"; }}
                      />
                    </div>
                    <div className="config-logo-preview-info">
                      <span className="config-logo-preview-label">Logo atual</span>
                      <span className="config-logo-preview-url">{v.logo_url}</span>
                    </div>
                  </div>
                ) : (
                  <div className="config-logo-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                      <path d="M3 15l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Nenhum logo configurado</span>
                    <span className="config-logo-hint">Aparecerá no cabeçalho no lugar do ZapERP</span>
                  </div>
                )}

                {logoMsg && (
                  <div className={`config-logo-msg ${logoMsg.type === "ok" ? "is-ok" : "is-err"}`} role="alert">
                    {logoMsg.text}
                  </div>
                )}

                <div className="config-logo-actions">
                  <label
                    className={`ia-btn ia-btn--outline config-logo-upload-btn${logoUploading ? " is-loading" : ""}`}
                    title="Selecionar imagem (PNG, JPG, WebP — máx. 5 MB)"
                    style={{ cursor: logoUploading ? "default" : "pointer" }}
                  >
                    {logoUploading ? "Enviando…" : v.logo_url ? "Trocar logo" : "Fazer upload do logo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      style={{ display: "none" }}
                      disabled={logoUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          setLogoMsg({ type: "err", text: "A imagem deve ter no máximo 5 MB." });
                          e.target.value = "";
                          return;
                        }
                        setLogoUploading(true);
                        setLogoMsg(null);
                        try {
                          const result = await cfg.uploadLogoEmpresa(file);
                          setV((c) => ({ ...c, logo_url: result.logo_url }));
                          useEmpresaStore.getState().setLogoUrl(result.logo_url);
                          setLogoMsg({ type: "ok", text: "Logo enviado com sucesso!" });
                        } catch (err) {
                          setLogoMsg({ type: "err", text: err?.response?.data?.error || "Erro ao enviar logo." });
                        } finally {
                          setLogoUploading(false);
                          e.target.value = "";
                        }
                      }}
                    />
                  </label>

                  {v.logo_url && (
                    <button
                      type="button"
                      className="ia-btn ia-btn--ghost"
                      disabled={logoUploading}
                      onClick={async () => {
                        setLogoUploading(true);
                        setLogoMsg(null);
                        try {
                          await cfg.deleteLogoEmpresa();
                          setV((c) => ({ ...c, logo_url: "" }));
                          useEmpresaStore.getState().setLogoUrl(null);
                          setLogoMsg({ type: "ok", text: "Logo removido." });
                        } catch (err) {
                          setLogoMsg({ type: "err", text: err?.response?.data?.error || "Erro ao remover logo." });
                        } finally {
                          setLogoUploading(false);
                        }
                      }}
                    >
                      Remover logo
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="ia-field">
              <label htmlFor="empresa-cor">Cor primária</label>
              <div className="config-geral-color-wrap">
                <input
                  id="empresa-cor"
                  type="color"
                  className="config-geral-color-input"
                  value={v.cor_primaria || "#2563eb"}
                  onChange={(e) => setV((c) => ({ ...c, cor_primaria: e.target.value }))}
                />
                <span className="config-geral-color-value">{v.cor_primaria || "#2563eb"}</span>
              </div>
            </div>

            <div className="ia-field config-geral-field--span2">
              <label htmlFor="empresa-fonte">Fonte do nome da empresa</label>
              <select
                id="empresa-fonte"
                className="ia-select"
                value={v.nome_fonte || "inter"}
                onChange={(e) => setV((c) => ({ ...c, nome_fonte: e.target.value }))}
              >
                {FONTES_OPCOES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              {/* Prévia ao vivo */}
              <div
                className="config-fonte-preview"
                style={{ fontFamily: FONT_FAMILIES[v.nome_fonte || "inter"] }}
              >
                {v.nome || "Nome da Empresa"}
              </div>
            </div>
          </div>
        </section>

        <section className="config-geral-card config-geral-card--wide" aria-labelledby="config-geral-whatsapp">
          <h5 id="config-geral-whatsapp" className="config-geral-card-title">WhatsApp</h5>
          <p className="config-geral-card-desc">
            Conexão UltraMSG e mapeamento Meta (phone_number_id) para webhook multi-tenant.
          </p>
          <div className="config-geral-whatsapp-connect">
            <div>
              <strong>Conexão UltraMSG / WhatsApp</strong>
              <p className="config-geral-toggle-hint" style={{ marginTop: 4 }}>
                Página dedicada para conectar via QR Code, como no WhatsApp Web.
              </p>
            </div>
            <button type="button" className="ia-btn ia-btn--outline" onClick={() => onOpenConnectWhatsapp?.()}>
              Conectar WhatsApp
            </button>
          </div>
          <div className="config-geral-card-divider" />
          <p className="config-geral-toggle-hint" style={{ marginBottom: 8 }}>
            Mapeamentos Meta (opcional): cadastre o phone_number_id recebido no webhook.
          </p>
          <SecaoEmpresasWhatsapp lista={empresasWhatsapp} onRefresh={onRefresh} />
        </section>
      </div>

      <footer className="config-geral-footer">
        <button
          type="button"
          className="ia-btn ia-btn--primary"
          onClick={async () => {
            setSaving(true);
            setMsg(null);
            try {
              if (precisaSenhaCampanhas && !String(senhaCampanhas || "").trim()) {
                setMsg({ type: "err", text: "Informe a senha de ativação do módulo Campanhas." });
                return;
              }
              const payload = { ...v };
              if (precisaSenhaCampanhas) {
                payload.senha_modulo_campanhas = senhaCampanhas;
              }
              await onSave(payload);
              setSenhaCampanhas("");
              setMsg({ type: "ok", text: "Configurações salvas com sucesso." });
            } catch (e) {
              setMsg({ type: "err", text: e?.response?.data?.error || "Erro ao salvar configurações." });
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          {saving ? "Salvando..." : "Salvar configurações gerais"}
        </button>
      </footer>
    </div>
  );
}

/** Formata departamentos do usuário para exibição (array ou objeto único) */

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
    <div className="config-whatsapp-mappings">
      <form onSubmit={handleAdd} className="config-whatsapp-mappings-form">
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

export default function GeralSection() {
  const navigate = useNavigate();
  const load = useCallback(async () => {
    const empresa = await cfg.getEmpresa();
    const empresasWhatsapp = await cfg.getEmpresasWhatsapp().catch(() => []);
    return { empresa, empresasWhatsapp };
  }, []);
  const resource = useSectionResource(load, { empresa: null, empresasWhatsapp: [] }, "Erro ao carregar configurações gerais.");

  const handleSave = async (values) => {
    const { senha_modulo_campanhas: _senha, ...valuesSemSenha } = values || {};
    const updated = await cfg.putEmpresa(values);
    const nextEmpresa = { ...(valuesSemSenha || {}), ...(updated || {}) };
    delete nextEmpresa.senha_modulo_campanhas;
    resource.setData((current) => ({ ...current, empresa: nextEmpresa }));
    useEmpresaStore.getState().setEmpresa(nextEmpresa);
    const authPatch = {};
    if (nextEmpresa?.crm_habilitado !== undefined) authPatch.crm_habilitado = nextEmpresa.crm_habilitado;
    if (nextEmpresa?.separar_mensagens_disparadas !== undefined) authPatch.separar_mensagens_disparadas = nextEmpresa.separar_mensagens_disparadas;
    if (nextEmpresa?.atendimento_modo_simples !== undefined) authPatch.atendimento_modo_simples = nextEmpresa.atendimento_modo_simples;
    if (nextEmpresa?.modulo_campanhas_ativo !== undefined) {
      authPatch.modulo_campanhas_ativo = nextEmpresa.modulo_campanhas_ativo === true;
    }
    if (Object.keys(authPatch).length > 0) {
      useAuthStore.getState().updateUser(authPatch);
    }
    return updated;
  };

  return (
    <SectionState loading={resource.loading} error={resource.error} onRetry={() => resource.reload().catch(() => {})}>
      <SecaoGeral
        empresa={resource.data.empresa}
        empresasWhatsapp={resource.data.empresasWhatsapp}
        onOpenConnectWhatsapp={() => navigate("/configuracoes/whatsapp")}
        onSave={handleSave}
        onRefresh={() => resource.reload().catch(() => {})}
      />
    </SectionState>
  );
}
