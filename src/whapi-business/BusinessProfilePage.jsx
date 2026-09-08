import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  IconBuildingStore,
  IconCheck,
  IconClock,
  IconDeviceFloppy,
  IconExternalLink,
  IconLink,
  IconMail,
  IconMapPin,
  IconRefresh,
  IconShieldCheck,
} from "@tabler/icons-react";
import { apiErrorMessage, obterPerfilBusiness, salvarPerfilBusiness } from "../api/whapiBusinessService";
import { useNotificationStore } from "../notifications/notificationStore";
import { whapiInstanceName } from "./WhapiBusinessLayout";

const DAYS = [
  { key: "mon", label: "Segunda", short: "Seg" },
  { key: "tue", label: "Terça", short: "Ter" },
  { key: "wed", label: "Quarta", short: "Qua" },
  { key: "thu", label: "Quinta", short: "Qui" },
  { key: "fri", label: "Sexta", short: "Sex" },
  { key: "sat", label: "Sábado", short: "Sáb" },
  { key: "sun", label: "Domingo", short: "Dom" },
];

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Noronha",
  "UTC",
];

function minuteToTime(value, fallback) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return fallback;
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function timeToMinute(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function createSchedule(config = []) {
  const byDay = new Map((Array.isArray(config) ? config : []).map((item) => [item?.day, item]));
  return DAYS.map((day) => {
    const raw = byDay.get(day.key);
    return {
      ...day,
      enabled: Boolean(raw),
      mode: raw?.mode === "open_24h" ? "open_24h" : "specific_hours",
      open: minuteToTime(raw?.openTime, "09:00"),
      close: minuteToTime(raw?.closeTime, "18:00"),
    };
  });
}

function profileToForm(profile = {}) {
  return {
    address: String(profile.address || ""),
    description: String(profile.description || ""),
    email: String(profile.email || ""),
    websites: [String(profile.websites?.[0] || ""), String(profile.websites?.[1] || "")],
    timeZone: String(profile.hours?.timeZone || "America/Sao_Paulo"),
    schedule: createSchedule(profile.hours?.config),
  };
}

function formToPayload(form) {
  return {
    address: form.address.trim(),
    description: form.description.trim(),
    email: form.email.trim(),
    websites: form.websites.map((value) => value.trim()).filter(Boolean),
    hours: {
      timeZone: form.timeZone,
      config: form.schedule.filter((day) => day.enabled).map((day) => ({
        day: day.key,
        mode: day.mode,
        ...(day.mode === "specific_hours"
          ? { openTime: timeToMinute(day.open), closeTime: timeToMinute(day.close) }
          : {}),
      })),
    },
  };
}

function validateForm(form) {
  if (form.address.length > 256) return "O endereço pode ter no máximo 256 caracteres.";
  if (form.description.length > 256) return "A descrição pode ter no máximo 256 caracteres.";
  if (form.email.length > 128) return "O e-mail pode ter no máximo 128 caracteres.";
  if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return "Informe um e-mail válido.";
  for (const website of form.websites) {
    const value = website.trim();
    if (!value) continue;
    if (value.length > 256) return "Cada website pode ter no máximo 256 caracteres.";
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) throw new Error("protocol");
    } catch {
      return "Os websites devem começar com http:// ou https://.";
    }
  }
  for (const day of form.schedule) {
    if (!day.enabled || day.mode !== "specific_hours") continue;
    const open = timeToMinute(day.open);
    const close = timeToMinute(day.close);
    if (open == null || close == null || close <= open) {
      return `Confira o horário de ${day.label.toLowerCase()}: o fechamento deve ser depois da abertura.`;
    }
  }
  return "";
}

function EmptyWhapiState({ loading }) {
  return (
    <div className="wb-empty-state">
      <span className="wb-empty-state__icon"><IconBuildingStore size={30} /></span>
      <h2>{loading ? "Buscando seus canais…" : "Conecte um canal Whapi"}</h2>
      <p>{loading ? "Isso leva apenas alguns segundos." : "O Perfil Business é exclusivo para instâncias Whapi cadastradas na empresa."}</p>
      {!loading ? <a href="/configuracoes?tab=whapi">Configurar Whapi</a> : null}
    </div>
  );
}

function BusinessAccountRequiredState({ instance }) {
  return (
    <div className="wb-empty-state">
      <span className="wb-empty-state__icon"><IconBuildingStore size={30} /></span>
      <h2>Este canal não é WhatsApp Business</h2>
      <p>
        O canal <strong>{whapiInstanceName(instance)}</strong> está conectado a uma conta WhatsApp comum.
        Migre o número para o app WhatsApp Business e reconecte o canal para liberar o perfil público.
      </p>
    </div>
  );
}

export default function BusinessProfilePage() {
  const { selectedId, selectedInstance, loadingInstances } = useOutletContext();
  const showToast = useNotificationStore((state) => state.showToast);
  const [form, setForm] = useState(() => profileToForm());
  const [baseline, setBaseline] = useState(() => profileToForm());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedId || selectedInstance?.is_business === false) {
      const empty = profileToForm();
      setForm(empty);
      setBaseline(empty);
      setError("");
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    obterPerfilBusiness(selectedId, { signal: controller.signal, silent: true })
      .then((profile) => {
        const next = profileToForm(profile);
        setForm(next);
        setBaseline(next);
      })
      .catch((requestError) => {
        if (requestError?.name === "CanceledError" || requestError?.code === "ERR_CANCELED") return;
        setError(apiErrorMessage(requestError, "Não foi possível carregar o Perfil Business."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedId, selectedInstance?.is_business]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);
  const profileName = whapiInstanceName(selectedInstance);
  const firstOpenDays = form.schedule.filter((day) => day.enabled).slice(0, 3);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateWebsite(index, value) {
    setForm((current) => ({
      ...current,
      websites: current.websites.map((item, itemIndex) => itemIndex === index ? value : item),
    }));
  }

  function updateDay(dayKey, changes) {
    setForm((current) => ({
      ...current,
      schedule: current.schedule.map((day) => day.key === dayKey ? { ...day, ...changes } : day),
    }));
  }

  async function reloadProfile() {
    if (!selectedId || loading) return;
    setLoading(true);
    setError("");
    try {
      const profile = await obterPerfilBusiness(selectedId, { silent: true });
      const next = profileToForm(profile);
      setForm(next);
      setBaseline(next);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Não foi possível atualizar o Perfil Business."));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!selectedId || saving) return;
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = formToPayload(form);
      await salvarPerfilBusiness(selectedId, payload);
      // POST /business retorna apenas { success }; não fazemos um segundo GET aqui.
      // Assim uma indisponibilidade momentânea na leitura não transforma um save
      // já aceito pela Whapi em um falso erro para o usuário.
      const next = profileToForm(payload);
      setForm(next);
      setBaseline(next);
      showToast({
        type: "success",
        title: "Perfil Business atualizado",
        message: "As informações públicas foram sincronizadas com o WhatsApp.",
      });
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Não foi possível salvar o Perfil Business."));
    } finally {
      setSaving(false);
    }
  }

  if (!selectedId) return <EmptyWhapiState loading={loadingInstances} />;
  if (selectedInstance?.is_business === false) return <BusinessAccountRequiredState instance={selectedInstance} />;

  return (
    <div className="wb-profile-grid">
      <form className="wb-card wb-profile-form" onSubmit={handleSave}>
        <div className="wb-card-heading">
          <div>
            <span className="wb-section-kicker">Informações públicas</span>
            <h2>Perfil da empresa</h2>
            <p>Estes dados aparecem para clientes que abrem seu perfil no WhatsApp.</p>
          </div>
          <button type="button" className="wb-icon-button" onClick={reloadProfile} disabled={loading || saving} title="Recarregar perfil" aria-label="Recarregar perfil">
            <IconRefresh className={loading ? "wb-spin" : ""} size={18} />
          </button>
        </div>

        {loading ? <div className="wb-form-skeleton" aria-label="Carregando perfil" /> : null}
        {error ? <div className="wb-inline-alert wb-inline-alert--error" role="alert">{error}</div> : null}

        <div className="wb-form-section">
          <label className="wb-field wb-field--full">
            <span><IconMapPin size={16} /> Endereço</span>
            <input value={form.address} onChange={(event) => updateField("address", event.target.value)} maxLength={256} placeholder="Rua, número, bairro, cidade e estado" disabled={loading || saving} />
            <small>{form.address.length}/256</small>
          </label>

          <label className="wb-field wb-field--full">
            <span><IconBuildingStore size={16} /> Descrição</span>
            <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} maxLength={256} rows={4} placeholder="Conte de forma clara o que sua empresa oferece." disabled={loading || saving} />
            <small>{form.description.length}/256</small>
          </label>

          <div className="wb-fields-row">
            <label className="wb-field">
              <span><IconMail size={16} /> E-mail comercial</span>
              <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} maxLength={128} placeholder="contato@suaempresa.com" disabled={loading || saving} />
            </label>
            <label className="wb-field">
              <span><IconClock size={16} /> Fuso horário</span>
              <select value={form.timeZone} onChange={(event) => updateField("timeZone", event.target.value)} disabled={loading || saving}>
                {TIMEZONES.includes(form.timeZone) ? null : <option value={form.timeZone}>{form.timeZone}</option>}
                {TIMEZONES.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
              </select>
            </label>
          </div>

          <div className="wb-fields-row">
            {form.websites.map((website, index) => (
              <label className="wb-field" key={index}>
                <span><IconLink size={16} /> Website {index + 1}</span>
                <input type="url" value={website} onChange={(event) => updateWebsite(index, event.target.value)} maxLength={256} placeholder={index === 0 ? "https://suaempresa.com" : "https://instagram.com/suaempresa"} disabled={loading || saving} />
              </label>
            ))}
          </div>
        </div>

        <div className="wb-form-divider" />

        <div className="wb-schedule-heading">
          <div>
            <span className="wb-section-kicker">Disponibilidade</span>
            <h3>Horário de atendimento</h3>
          </div>
          <span className="wb-schema-badge"><IconShieldCheck size={15} /> Formato oficial Whapi</span>
        </div>

        <div className="wb-schedule-list">
          {form.schedule.map((day) => (
            <div className={`wb-schedule-row${day.enabled ? " is-enabled" : ""}`} key={day.key}>
              <label className="wb-switch">
                <input type="checkbox" checked={day.enabled} onChange={(event) => updateDay(day.key, { enabled: event.target.checked })} disabled={loading || saving} />
                <span aria-hidden="true" />
                <b>{day.label}</b>
              </label>
              <div className="wb-schedule-controls">
                <select value={day.mode} onChange={(event) => updateDay(day.key, { mode: event.target.value })} disabled={!day.enabled || loading || saving} aria-label={`Tipo de horário de ${day.label}`}>
                  <option value="specific_hours">Horário definido</option>
                  <option value="open_24h">Aberto 24 horas</option>
                </select>
                {day.mode === "specific_hours" ? (
                  <div className="wb-time-range">
                    <input type="time" value={day.open} onChange={(event) => updateDay(day.key, { open: event.target.value })} disabled={!day.enabled || loading || saving} aria-label={`Abertura de ${day.label}`} />
                    <span>até</span>
                    <input type="time" value={day.close} onChange={(event) => updateDay(day.key, { close: event.target.value })} disabled={!day.enabled || loading || saving} aria-label={`Fechamento de ${day.label}`} />
                  </div>
                ) : <span className="wb-24h-label"><IconCheck size={15} /> O dia todo</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="wb-form-actions">
          <span>{dirty ? "Você tem alterações não salvas." : "Perfil sincronizado com o canal."}</span>
          <button type="submit" className="wb-primary-button" disabled={!dirty || loading || saving}>
            {saving ? <span className="wb-button-spinner" /> : <IconDeviceFloppy size={18} />}
            {saving ? "Salvando…" : "Salvar no WhatsApp"}
          </button>
        </div>
      </form>

      <aside className="wb-preview-column">
        <div className="wb-preview-sticky">
          <div className="wb-preview-label">
            <span>Prévia para o cliente</span>
            <i>Atualização ao vivo</i>
          </div>
          <article className="wb-phone-card">
            <div className="wb-phone-card__cover" aria-hidden="true">
              <span className="wb-phone-card__avatar">{String(profileName || "W").charAt(0).toUpperCase()}</span>
            </div>
            <div className="wb-phone-card__body">
              <div className="wb-phone-card__title">
                <div>
                  <h2>{profileName}</h2>
                  <p>Conta comercial</p>
                </div>
                <IconShieldCheck size={19} />
              </div>
              {form.description ? <p className="wb-phone-card__description">{form.description}</p> : <p className="wb-phone-card__placeholder">Adicione uma descrição para apresentar sua empresa.</p>}
              <div className="wb-phone-card__details">
                {form.address ? <div><IconMapPin size={17} /><span>{form.address}</span></div> : null}
                {form.email ? <div><IconMail size={17} /><span>{form.email}</span></div> : null}
                {form.websites.filter(Boolean).map((website) => (
                  <div key={website}><IconExternalLink size={17} /><span>{website}</span></div>
                ))}
                <div>
                  <IconClock size={17} />
                  <span>
                    {firstOpenDays.length
                      ? firstOpenDays.map((day) => `${day.short} ${day.mode === "open_24h" ? "24h" : `${day.open}–${day.close}`}`).join(" · ")
                      : "Horário não informado"}
                  </span>
                </div>
              </div>
            </div>
          </article>
          <div className="wb-preview-note">
            <IconShieldCheck size={18} />
            <p><strong>Exclusivo Whapi</strong><span>O ZapERP envia apenas os campos aceitos pelo endpoint oficial de Business Profile.</span></p>
          </div>
        </div>
      </aside>
    </div>
  );
}
