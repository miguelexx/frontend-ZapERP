import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconDeviceFloppy,
  IconInfoCircle,
  IconPlus,
  IconRobot,
  IconTrash,
} from "@tabler/icons-react";
import {
  TRIAGE_MODES,
  apiErrorMessage,
  getTriagemConfig,
  salvarTriagemConfig,
} from "../api/whapiTriageService";
import { getDepartamentos } from "../api/configService";
import { useAuthStore } from "../auth/authStore";
import { useNotificationStore } from "../notifications/notificationStore";
import "./whapiTriagem.css";

function emptyOption() {
  return { id: null, label: "", departamento_id: null, tag_id: null, active: true };
}

function normalizeConfig(cfg) {
  return {
    enabled: cfg?.enabled === true,
    mode: cfg?.mode || "poll",
    body_text: cfg?.body_text || "Para facilitar seu atendimento, selecione o setor desejado.",
    button_label: cfg?.button_label || "Selecionar setor",
    header_text: cfg?.header_text || "",
    footer_text: cfg?.footer_text || "",
    confirm_message: cfg?.confirm_message || "",
    fallback_to_text: cfg?.fallback_to_text !== false,
    options: Array.isArray(cfg?.options) && cfg.options.length
      ? cfg.options.map((o) => ({
          id: o.id ?? null,
          label: o.label ?? "",
          departamento_id: o.departamento_id ?? null,
          tag_id: o.tag_id ?? null,
          active: o.active !== false,
        }))
      : [emptyOption()],
  };
}

function triagemErrorMessage(err) {
  const raw = apiErrorMessage(err, "Não foi possível carregar a triagem interativa.");
  const status = err?.response?.status;
  const lower = String(raw).toLowerCase();
  if (status === 500 && lower.includes("permission denied")) {
    return "O banco encontrou a tabela da triagem, mas o usuário do backend não tem permissão para acessá-la. Aplique a migration e conceda acesso ao service_role no Supabase.";
  }
  return raw;
}

function MenuPreview({ mode, active }) {
  const labels = ["Suporte", "Financeiro", "Comercial"];
  const title = mode === "poll" ? "Enquete" : mode === "list" ? "Lista de opções" : "Botões rápidos";
  return (
    <article className={`wt-preview${active ? " is-active" : ""}`}>
      <div className="wt-preview__topline">
        <span className={`wt-preview__type wt-preview__type--${mode}`}>{title}</span>
        {active ? <span className="wt-preview__current">Selecionado</span> : null}
      </div>
      <div className="wt-preview__phone">
        <div className="wt-preview__bubble">
          <span className="wt-preview__eyebrow">ZapERP · atendimento</span>
          <strong>Como podemos ajudar?</strong>
          <span className="wt-preview__copy">Escolha o setor para continuar.</span>
          {mode === "poll" ? (
            <div className="wt-preview__poll">
              {labels.map((label, index) => <div key={label}><i />{label}<small>{index + 1}</small></div>)}
            </div>
          ) : mode === "list" ? (
            <>
              <div className="wt-preview__listButton">Selecionar setor <span>⌄</span></div>
              <div className="wt-preview__listRows">{labels.map((label) => <div key={label}>{label}<span>›</span></div>)}</div>
            </>
          ) : (
            <div className="wt-preview__buttons">{labels.map((label) => <span key={label}>{label}</span>)}</div>
          )}
        </div>
      </div>
      <p>{mode === "poll" ? "O cliente vota em um setor." : mode === "list" ? "O cliente abre a lista e escolhe." : "Até 3 escolhas aparecem na mensagem."}</p>
    </article>
  );
}

export default function WhapiTriagemPage() {
  const ctx = useOutletContext() || {};
  const { selectedInstance, loadingInstances, instances } = ctx;
  const user = useAuthStore((state) => state.user);
  const isAdmin = ["admin", "administrador"].includes(String(user?.role || user?.perfil || "").toLowerCase());
  const showToast = useNotificationStore((state) => state.showToast);

  const [config, setConfig] = useState(() => normalizeConfig(null));
  const [departamentos, setDepartamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [migrationPending, setMigrationPending] = useState(false);

  const instanceId = selectedInstance?.id ?? null;

  const load = useCallback(async () => {
    if (!instanceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setMigrationPending(false);
    try {
      const [cfgResp, deps] = await Promise.all([
        getTriagemConfig(instanceId),
        getDepartamentos().catch(() => []),
      ]);
      setConfig(normalizeConfig(cfgResp?.config));
      setMigrationPending(cfgResp?.migrationPending === true);
      setDepartamentos(Array.isArray(deps) ? deps : []);
    } catch (err) {
      setError(triagemErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (fields) => setConfig((c) => ({ ...c, ...fields }));
  const patchOption = (idx, fields) =>
    setConfig((c) => ({
      ...c,
      options: c.options.map((o, i) => (i === idx ? { ...o, ...fields } : o)),
    }));
  const addOption = () => setConfig((c) => ({ ...c, options: [...c.options, emptyOption()] }));
  const removeOption = (idx) =>
    setConfig((c) => ({ ...c, options: c.options.filter((_, i) => i !== idx) }));
  const moveOption = (idx, dir) =>
    setConfig((c) => {
      const next = [...c.options];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return c;
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...c, options: next };
    });

  const activeValidCount = useMemo(
    () => config.options.filter((o) => o.active && o.departamento_id && o.label.trim()).length,
    [config.options]
  );
  const modeLimit = config.mode === "button" ? 3 : config.mode === "list" ? 10 : 12;
  const minActive = config.mode === "poll" ? 2 : 1;

  async function handleSave() {
    if (!instanceId) return;
    if (config.enabled && activeValidCount < minActive) {
      showToast({ type: "error", title: "Triagem", message: config.mode === "poll" ? "A enquete precisa de ao menos 2 opções ativas com setor." : "Adicione ao menos uma opção ativa com setor." });
      return;
    }
    if (activeValidCount > modeLimit) {
      showToast({ type: "error", title: "Triagem", message: `O modo ${config.mode} aceita no máximo ${modeLimit} opções ativas.` });
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...config,
        header_text: config.header_text.trim() || null,
        footer_text: config.footer_text.trim() || null,
        confirm_message: config.confirm_message.trim() || null,
        options: config.options
          .filter((o) => o.label.trim())
          .map((o, ordem) => ({
            id: o.id || undefined,
            label: o.label.trim(),
            departamento_id: o.departamento_id ? Number(o.departamento_id) : null,
            tag_id: o.tag_id ? Number(o.tag_id) : null,
            active: o.active !== false,
            ordem,
          })),
      };
      const resp = await salvarTriagemConfig(instanceId, payload);
      setConfig(normalizeConfig(resp?.config));
      showToast({ type: "success", title: "Triagem interativa", message: "Configuração salva." });
    } catch (err) {
      if (err?.response?.data?.migrationPending) setMigrationPending(true);
      const msg = apiErrorMessage(err, "Não foi possível salvar.");
      setError(msg);
      showToast({ type: "error", title: "Triagem interativa", message: msg });
    } finally {
      setSaving(false);
    }
  }

  if (loadingInstances) {
    return <div className="wt-state">Carregando canais Whapi…</div>;
  }
  if (!instances || instances.length === 0) {
    return (
      <div className="wt-empty">
        <IconRobot size={40} stroke={1.5} />
        <h2>Nenhum canal Whapi conectado</h2>
        <p>A Triagem Interativa é exclusiva de canais Whapi. Conecte um canal em Configurações → Whapi.</p>
      </div>
    );
  }

  return (
    <div className="wt-page">
      <div className="wt-intro">
        <div className="wt-intro__icon" aria-hidden="true"><IconRobot size={22} stroke={1.8} /></div>
        <div>
          <h2>Triagem Interativa (Whapi)</h2>
          <p>
            Menu nativo do WhatsApp (enquete/lista/botões) para o cliente escolher o setor com um toque.
            <strong> Coexiste com o Chatbot de Triagem (texto)</strong> — aquele continua funcionando normalmente
            e é o usado por canais UltraMSG.
          </p>
        </div>
      </div>

      {migrationPending ? (
        <div className="wt-alert wt-alert--warn" role="alert">
          <IconAlertTriangle size={18} />
          <span>As tabelas da triagem ainda não existem no banco (migration pendente). Aplique a migration antes de usar.</span>
        </div>
      ) : null}
      {error ? (
        <div className="wt-alert wt-alert--error" role="alert">
          <IconAlertTriangle size={18} />
          <span>{error}</span>
          <button type="button" onClick={load}>Recarregar</button>
        </div>
      ) : null}

      {loading ? (
        <div className="wt-state">Carregando configuração…</div>
      ) : (
        <>
          <section className="wt-card">
            <label className="wt-switch">
              <input
                type="checkbox"
                checked={config.enabled}
                disabled={!isAdmin}
                onChange={(e) => patch({ enabled: e.target.checked })}
              />
              <span>Ativar triagem interativa neste canal</span>
            </label>
            <p className="wt-hint">
              Quando ligada, este canal Whapi usa o menu interativo em vez do menu de texto. Desligada,
              o canal segue exatamente como hoje.
            </p>
          </section>

          <section className="wt-card">
            <h3>Formato do menu</h3>
            <div className="wt-modes">
              {TRIAGE_MODES.map((m) => (
                <label key={m.value} className={`wt-mode${config.mode === m.value ? " is-active" : ""}`}>
                  <input
                    type="radio"
                    name="wt-mode"
                    value={m.value}
                    checked={config.mode === m.value}
                    disabled={!isAdmin}
                    onChange={() => patch({ mode: m.value })}
                  />
                  <span className="wt-mode__label">{m.label}</span>
                  <span className="wt-mode__hint">{m.hint}</span>
                </label>
              ))}
            </div>

            <div className="wt-how-it-works" aria-label="Como a triagem funciona">
              <div className="wt-how-it-works__heading">
                <div><span className="wt-kicker">Veja na prática</span><h4>Uma escolha simples para o cliente</h4></div>
                <span className="wt-how-it-works__note">A prévia usa exemplos. Suas opções aparecem no envio real.</span>
              </div>
              <div className="wt-flow">
                <div><b>01</b><span>Cliente recebe o menu</span></div><i>→</i>
                <div><b>02</b><span>Escolhe um setor</span></div><i>→</i>
                <div><b>03</b><span>ZapERP direciona</span></div>
              </div>
              <div className="wt-previews">
                {TRIAGE_MODES.map((m) => <MenuPreview key={m.value} mode={m.value} active={config.mode === m.value} />)}
              </div>
            </div>

            <label className="wt-field">
              <span>Mensagem do menu</span>
              <textarea
                rows={2}
                value={config.body_text}
                disabled={!isAdmin}
                onChange={(e) => patch({ body_text: e.target.value })}
                placeholder="Para facilitar seu atendimento, selecione o setor desejado."
              />
            </label>

            {config.mode === "list" ? (
              <label className="wt-field">
                <span>Texto do botão (lista)</span>
                <input
                  type="text"
                  value={config.button_label}
                  disabled={!isAdmin}
                  onChange={(e) => patch({ button_label: e.target.value })}
                  placeholder="Selecionar setor"
                />
              </label>
            ) : null}

            <label className="wt-field">
              <span>Confirmação após escolher <em>(opcional; use {"{{departamento}}"})</em></span>
              <textarea
                rows={2}
                value={config.confirm_message}
                disabled={!isAdmin}
                onChange={(e) => patch({ confirm_message: e.target.value })}
                placeholder="Perfeito! Seu atendimento foi direcionado para o setor {{departamento}}."
              />
            </label>

            <label className="wt-switch wt-switch--sm">
              <input
                type="checkbox"
                checked={config.fallback_to_text}
                disabled={!isAdmin}
                onChange={(e) => patch({ fallback_to_text: e.target.checked })}
              />
              <span>Se o menu interativo falhar, usar o menu de texto do chatbot</span>
            </label>
          </section>

          <section className="wt-card">
            <div className="wt-card__head">
              <h3>Opções → Setor</h3>
              <span className="wt-badge">{activeValidCount} ativa(s)</span>
            </div>
            <p className="wt-hint">
              <IconInfoCircle size={14} /> Cada opção tem um identificador interno estável — trocar o nome
              exibido não quebra o direcionamento. Este modo aceita até {modeLimit} opções ativas
              {config.mode === "poll" ? " e exige pelo menos 2 para a enquete." : "."}
            </p>

            <div className="wt-options">
              <div className="wt-options__header">
                <span>Nome exibido</span>
                <span>Setor ZapERP</span>
                <span>Ativa</span>
                <span />
              </div>
              {config.options.map((opt, idx) => (
                <div className="wt-option" key={opt.id || `new-${idx}`}>
                  <input
                    type="text"
                    value={opt.label}
                    disabled={!isAdmin}
                    onChange={(e) => patchOption(idx, { label: e.target.value })}
                    placeholder="Ex.: Financeiro"
                  />
                  <select
                    value={opt.departamento_id ?? ""}
                    disabled={!isAdmin}
                    onChange={(e) => patchOption(idx, { departamento_id: e.target.value || null })}
                  >
                    <option value="">Selecione…</option>
                    {departamentos.map((d) => (
                      <option key={d.id} value={d.id}>{d.nome}</option>
                    ))}
                  </select>
                  <label className="wt-option__active">
                    <input
                      type="checkbox"
                      checked={opt.active !== false}
                      disabled={!isAdmin}
                      onChange={(e) => patchOption(idx, { active: e.target.checked })}
                    />
                  </label>
                  <div className="wt-option__actions">
                    <button type="button" onClick={() => moveOption(idx, -1)} disabled={!isAdmin || idx === 0} title="Subir">
                      <IconArrowUp size={16} />
                    </button>
                    <button type="button" onClick={() => moveOption(idx, 1)} disabled={!isAdmin || idx === config.options.length - 1} title="Descer">
                      <IconArrowDown size={16} />
                    </button>
                    <button type="button" className="wt-danger" onClick={() => removeOption(idx)} disabled={!isAdmin} title="Remover">
                      <IconTrash size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {isAdmin ? (
              <button type="button" className="wt-add" onClick={addOption} disabled={config.options.length >= modeLimit}>
                <IconPlus size={16} /> Adicionar opção
              </button>
            ) : null}
          </section>

          {isAdmin ? (
            <div className="wt-actions">
              <button type="button" className="wt-save" onClick={handleSave} disabled={saving}>
                <IconDeviceFloppy size={18} /> {saving ? "Salvando…" : "Salvar triagem"}
              </button>
            </div>
          ) : (
            <p className="wt-hint">Apenas administradores podem editar esta configuração.</p>
          )}
        </>
      )}
    </div>
  );
}
