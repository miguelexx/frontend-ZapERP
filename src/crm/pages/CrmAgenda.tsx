import { useCallback, useEffect, useMemo, useState } from "react";
import { crmApiError, getAgenda, getAgendaResumo } from "../../api/crmService";
import { formatInt } from "../crmFormatters";
import CrmPipelinePicker from "../components/CrmPipelinePicker.jsx";
import { useCrmStore } from "../crmStore";

function isoRangeWeek() {
  const de = new Date();
  const day = de.getDay();
  const diff = de.getDate() - day + (day === 0 ? -6 : 1);
  de.setDate(diff);
  de.setHours(0, 0, 0, 0);
  const ate = new Date(de);
  ate.setDate(ate.getDate() + 6);
  ate.setHours(23, 59, 59, 999);
  return { de: de.toISOString(), ate: ate.toISOString() };
}

function pickArray(obj: unknown, keys: string[]): unknown[] {
  if (!obj || typeof obj !== "object") return [];
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function formatDayLabel(isoDate: string): string {
  try {
    const d = new Date(isoDate + "T12:00:00");
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" });
  } catch {
    return isoDate;
  }
}

function eventTitle(x: Record<string, unknown>): string {
  return String(x.titulo ?? x.nome ?? x.descricao ?? x.tipo ?? "Evento");
}

function eventTime(x: Record<string, unknown>): string {
  const raw = x.data_agendada ?? x.inicio ?? x.data ?? x.horario;
  if (raw == null) return "—";
  const s = String(raw);
  if (s.includes("T")) return s.slice(11, 16);
  return s.slice(0, 5);
}

function eventSub(x: Record<string, unknown>): string {
  const parts: string[] = [];
  if (x.tipo) parts.push(String(x.tipo));
  if (x.lead_id != null) parts.push(`Lead #${x.lead_id}`);
  if (x.status) parts.push(String(x.status));
  return parts.join(" · ") || "";
}

export default function CrmAgenda() {
  const pipelineId = useCrmStore((s) => s.pipelineId);
  const refreshTick = useCrmStore((s) => s.refreshTick);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [resumo, setResumo] = useState<Record<string, unknown> | null>(null);
  const [agenda, setAgenda] = useState<Record<string, unknown> | null>(null);
  const [{ de, ate }, setRange] = useState(() => isoRangeWeek());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      const [r, a] = await Promise.all([
        getAgendaResumo(),
        getAgenda({
          de,
          ate,
          ...(pipelineId != null ? { pipeline_id: pipelineId } : {}),
        }),
      ]);
      setResumo(r as Record<string, unknown>);
      setAgenda(a as Record<string, unknown>);
    } catch (e) {
      setErr(crmApiError(e));
    } finally {
      setLoading(false);
    }
  }, [de, ate, pipelineId]);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  const resumoChips = useMemo(() => {
    if (!resumo) return [];
    const defs: { key: string; label: string }[] = [
      { key: "atividades_pendentes_total", label: "Pendentes (total)" },
      { key: "atividades_pendentes_proximos_7_dias", label: "Pendentes (7 dias)" },
      { key: "atividades_atrasadas", label: "Atrasadas" },
      { key: "leads_proximo_contato_vencido", label: "Próx. contato vencido" },
    ];
    return defs.map((d) => ({
      label: d.label,
      value: formatInt(resumo[d.key]),
    }));
  }, [resumo]);

  const lista = agenda?.lista && typeof agenda.lista === "object" ? (agenda.lista as Record<string, unknown>) : null;
  const atividadesLista = useMemo(
    () => (lista ? (pickArray(lista, ["atividades"]) as Record<string, unknown>[]) : []),
    [lista]
  );
  const proximosLista = useMemo(
    () => (lista ? (pickArray(lista, ["proximos_contatos", "proximosContatos"]) as Record<string, unknown>[]) : []),
    [lista]
  );

  const porDia = useMemo(() => {
    const pd = agenda?.por_dia;
    if (!pd || typeof pd !== "object") return [] as { date: string; label: string; events: Record<string, unknown>[] }[];
    const out: { date: string; label: string; events: Record<string, unknown>[] }[] = [];
    for (const date of Object.keys(pd).sort()) {
      const day = (pd as Record<string, unknown>)[date];
      if (!day || typeof day !== "object") continue;
      const d = day as Record<string, unknown>;
      const ev = [
        ...pickArray(d, ["atividades"]),
        ...pickArray(d, ["proximos_contatos", "proximosContatos"]),
      ] as Record<string, unknown>[];
      out.push({ date, label: formatDayLabel(date), events: ev });
    }
    return out;
  }, [agenda]);

  const periodoLabel = useMemo(() => {
    const p = agenda?.periodo;
    if (p && typeof p === "object") {
      const o = p as Record<string, unknown>;
      const a = String(o.de ?? o.from ?? "");
      const b = String(o.ate ?? o.to ?? "");
      if (a && b) return `${a.slice(0, 16).replace("T", " ")} → ${b.slice(0, 16).replace("T", " ")}`;
    }
    return `${de.slice(0, 16)} → ${ate.slice(0, 16)}`;
  }, [agenda, de, ate]);

  return (
    <div>
      <div className="crm-page-head">
        <div>
          <h2>Agenda</h2>
          <p>Resumo operacional, lista consolidada e visão por dia — dados diretos da API.</p>
        </div>
      </div>

      <div className="crm-toolbar crm-toolbar--premium">
        <CrmPipelinePicker />
        <div className="crm-field">
          <span className="crm-field-label">Início</span>
          <input
            className="crm-input"
            type="datetime-local"
            value={de.slice(0, 16)}
            onChange={(e) => setRange((x) => ({ ...x, de: new Date(e.target.value).toISOString() }))}
          />
        </div>
        <div className="crm-field">
          <span className="crm-field-label">Fim</span>
          <input
            className="crm-input"
            type="datetime-local"
            value={ate.slice(0, 16)}
            onChange={(e) => setRange((x) => ({ ...x, ate: new Date(e.target.value).toISOString() }))}
          />
        </div>
        <button type="button" className="crm-btn crm-btn--primary" onClick={load} disabled={loading}>
          {loading ? "Carregando…" : "Atualizar"}
        </button>
      </div>

      {err ? <div className="crm-error" style={{ marginBottom: 16 }}>{err}</div> : null}

      <div className="crm-panel">
        <div className="crm-panel__head">
          <h3 className="crm-panel__title">Resumo</h3>
          <span className="crm-panel__meta">Contadores agregados</span>
        </div>
        <div className="crm-agenda-chips">
          {resumoChips.map((c) => (
            <div key={c.label} className="crm-agenda-chip">
              <div className="crm-agenda-chip__val">{c.value}</div>
              <div className="crm-agenda-chip__label">{c.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="crm-panel">
        <div className="crm-panel__head">
          <h3 className="crm-panel__title">Linha do tempo</h3>
          <span className="crm-panel__meta">{periodoLabel}</span>
        </div>

        {atividadesLista.length === 0 && proximosLista.length === 0 ? (
          <div className="crm-empty-soft">Nenhum item na lista geral para o período.</div>
        ) : (
          <div className="crm-timeline">
            {atividadesLista.length > 0 ? (
              <div>
                <h4 style={{ margin: "0 0 10px", fontSize: "0.85rem", color: "var(--ds-text-tertiary)" }}>Atividades</h4>
                <div className="crm-day-block__bd" style={{ padding: 0 }}>
                  {atividadesLista.map((x, i) => (
                    <div key={`a-${i}`} className="crm-event" style={{ marginBottom: 6 }}>
                      <div className="crm-event__time">{eventTime(x)}</div>
                      <div className="crm-event__body">
                        <div className="crm-event__title">{eventTitle(x)}</div>
                        {eventSub(x) ? <div className="crm-event__sub">{eventSub(x)}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {proximosLista.length > 0 ? (
              <div>
                <h4 style={{ margin: "16px 0 10px", fontSize: "0.85rem", color: "var(--ds-text-tertiary)" }}>
                  Próximos contatos
                </h4>
                <div className="crm-day-block__bd" style={{ padding: 0 }}>
                  {proximosLista.map((x, i) => (
                    <div key={`p-${i}`} className="crm-event" style={{ marginBottom: 6 }}>
                      <div className="crm-event__time">{eventTime(x)}</div>
                      <div className="crm-event__body">
                        <div className="crm-event__title">{eventTitle(x)}</div>
                        {eventSub(x) ? <div className="crm-event__sub">{eventSub(x)}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="crm-panel">
        <div className="crm-panel__head">
          <h3 className="crm-panel__title">Por dia</h3>
          <span className="crm-panel__meta">Mesclando atividades e próximos contatos</span>
        </div>
        {porDia.length === 0 ? (
          <div className="crm-empty-soft">Sem eventos agrupados por dia neste intervalo.</div>
        ) : (
          <div className="crm-timeline">
            {porDia.map((day) => (
              <div key={day.date} className="crm-day-block">
                <div className="crm-day-block__hd">
                  {day.label} · {day.date}
                </div>
                <div className="crm-day-block__bd">
                  {day.events.length === 0 ? (
                    <div className="crm-empty-soft" style={{ margin: 0 }}>
                      Sem itens
                    </div>
                  ) : (
                    day.events.map((x, i) => (
                      <div key={`${day.date}-${i}`} className="crm-event">
                        <div className="crm-event__time">{eventTime(x)}</div>
                        <div className="crm-event__body">
                          <div className="crm-event__title">{eventTitle(x)}</div>
                          {eventSub(x) ? <div className="crm-event__sub">{eventSub(x)}</div> : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
