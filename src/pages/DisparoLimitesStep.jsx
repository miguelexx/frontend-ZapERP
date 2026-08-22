import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconAlertTriangle,
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconPlayerPlay,
  IconRefresh,
  IconServer,
  IconShield,
  IconWifiOff,
} from '@tabler/icons-react'
import {
  cancelarAgendamento,
  confirmarLimites,
  disparoApiError,
  localizarConflitos,
  necessidadeRevisao,
  obterConfigLimites,
  salvarAgendamento,
  salvarJanelas,
  salvarLimitesGlobais,
  salvarLimitesInstancias,
  simular,
  validarConfigLimites,
} from '../api/disparoLimitesService'

// ── Constantes ────────────────────────────────────────────────────────────────

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const FUSOS_BR = [
  { value: 'America/Sao_Paulo', label: 'Brasília (São Paulo) — UTC-3' },
  { value: 'America/Manaus', label: 'Manaus — UTC-4' },
  { value: 'America/Fortaleza', label: 'Fortaleza — UTC-3' },
  { value: 'America/Recife', label: 'Recife — UTC-3' },
  { value: 'America/Belem', label: 'Belém — UTC-3' },
  { value: 'America/Cuiaba', label: 'Cuiabá — UTC-4' },
  { value: 'America/Porto_Velho', label: 'Porto Velho — UTC-4' },
  { value: 'America/Boa_Vista', label: 'Boa Vista — UTC-4' },
  { value: 'America/Rio_Branco', label: 'Rio Branco — UTC-5' },
]

const PERFIS_DEFAULT = {
  conservador: {
    limite_por_hora: 30,
    limite_por_dia: 200,
    intervalo_min_sec: 15,
    intervalo_max_sec: 45,
    lote_tamanho: 10,
    pausa_lote_min_sec: 120,
    pausa_lote_max_sec: 300,
  },
  moderado: {
    limite_por_hora: 60,
    limite_por_dia: 500,
    intervalo_min_sec: 8,
    intervalo_max_sec: 20,
    lote_tamanho: 20,
    pausa_lote_min_sec: 60,
    pausa_lote_max_sec: 180,
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultWeekly() {
  const w = {}
  for (let d = 0; d < 7; d++) {
    w[d] = {
      ativo: d >= 1 && d <= 5,
      periodos: [{ hora_inicio: '08:00', hora_fim: '18:00' }],
    }
  }
  return w
}

function janelasToWeekly(janelas) {
  const w = defaultWeekly()
  for (let d = 0; d < 7; d++) w[d] = { ativo: false, periodos: [] }

  for (const j of janelas || []) {
    const d = Number(j.dia_semana)
    if (d < 0 || d > 6) continue
    w[d].periodos.push({
      hora_inicio: String(j.hora_inicio || '08:00').slice(0, 5),
      hora_fim: String(j.hora_fim || '18:00').slice(0, 5),
    })
    if (j.ativo !== false) w[d].ativo = true
  }

  for (let d = 0; d < 7; d++) {
    if (!w[d].periodos.length) {
      w[d].periodos = [{ hora_inicio: '08:00', hora_fim: '18:00' }]
    }
  }
  return w
}

function weeklyToJanelas(weekly) {
  const out = []
  for (let d = 0; d < 7; d++) {
    const day = weekly[d]
    if (!day?.ativo) continue
    for (const p of day.periodos || []) {
      if (!p.hora_inicio || !p.hora_fim) continue
      out.push({
        dia_semana: d,
        hora_inicio: p.hora_inicio.length === 5 ? `${p.hora_inicio}:00` : p.hora_inicio,
        hora_fim: p.hora_fim.length === 5 ? `${p.hora_fim}:00` : p.hora_fim,
        ativo: true,
      })
    }
  }
  return out
}

function isoToDatetimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datetimeLocalToIso(local) {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function fmtIsoLocal(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function buildInstOverrideMap(instanciaLimites, instancias) {
  const map = {}
  for (const inst of instancias || []) {
    const id = inst.instancia_id ?? inst.id
    const saved = (instanciaLimites || []).find((o) => o.instancia_id === id)
    map[id] = saved
      ? { ...saved }
      : { instancia_id: id, herdar_global: true, janelas_proprias: false }
  }
  return map
}

function buildGlobaisPayload(g) {
  return {
    perfil: g.perfil,
    limite_total: g.limite_total === '' || g.limite_total == null ? null : Number(g.limite_total),
    limite_por_hora: Number(g.limite_por_hora),
    limite_por_dia: Number(g.limite_por_dia),
    intervalo_min_sec: Number(g.intervalo_min_sec),
    intervalo_max_sec: Number(g.intervalo_max_sec),
    lote_tamanho: Number(g.lote_tamanho),
    pausa_lote_min_sec: Number(g.pausa_lote_min_sec),
    pausa_lote_max_sec: Number(g.pausa_lote_max_sec),
    fuso_horario: g.fuso_horario,
    inicio_modo: g.inicio_modo,
    agendado_para: g.agendado_para,
    data_limite: g.data_limite,
    pausa_auto_desconexao: g.pausa_auto_desconexao,
    pausa_auto_erros_consecutivos: Number(g.pausa_auto_erros_consecutivos),
    pausa_auto_taxa_falha_pct: Number(g.pausa_auto_taxa_falha_pct),
  }
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function LimitesSkeleton() {
  return (
    <div className="lim-root">
      {[1, 2, 3].map((i) => (
        <div key={i} className="lim-section lim-skeleton" />
      ))}
    </div>
  )
}

function NumField({ label, hint, value, onChange, min, max, optional }) {
  return (
    <div className="lim-field">
      <label className="lim-field__label">
        {label}
        {optional && <span className="lim-field__opt"> (opcional)</span>}
      </label>
      {hint && <span className="lim-field__hint">{hint}</span>}
      <input
        type="number"
        className="lim-input"
        value={value ?? ''}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    </div>
  )
}

function EditorSemanal({ weekly, onChange, titulo }) {
  function setDay(d, patch) {
    onChange({ ...weekly, [d]: { ...weekly[d], ...patch } })
  }

  function setPeriodo(d, idx, patch) {
    const periodos = [...(weekly[d]?.periodos || [])]
    periodos[idx] = { ...periodos[idx], ...patch }
    setDay(d, { periodos })
  }

  function addPeriodo(d) {
    const periodos = [...(weekly[d]?.periodos || []), { hora_inicio: '13:00', hora_fim: '17:00' }]
    setDay(d, { periodos, ativo: true })
  }

  function removePeriodo(d, idx) {
    const periodos = (weekly[d]?.periodos || []).filter((_, i) => i !== idx)
    setDay(d, { periodos: periodos.length ? periodos : [{ hora_inicio: '08:00', hora_fim: '18:00' }] })
  }

  function copiarUteis() {
    const src = weekly[1] || { ativo: true, periodos: [{ hora_inicio: '08:00', hora_fim: '18:00' }] }
    const next = { ...weekly }
    for (const d of [1, 2, 3, 4, 5]) {
      next[d] = { ativo: src.ativo, periodos: src.periodos.map((p) => ({ ...p })) }
    }
    onChange(next)
  }

  function incluirSabado() {
    const src = weekly[1] || weekly[2]
    if (!src) return
    onChange({
      ...weekly,
      6: { ativo: true, periodos: src.periodos.map((p) => ({ ...p })) },
    })
  }

  function limparDomingo() {
    onChange({ ...weekly, 0: { ...(weekly[0] || {}), ativo: false } })
  }

  return (
    <div className="lim-semanal">
      {titulo && <p className="lim-semanal__titulo">{titulo}</p>}
      <div className="lim-semanal__acoes">
        <button type="button" className="lim-btn-ghost lim-btn--sm" onClick={copiarUteis}>
          Copiar para dias úteis (seg–sex)
        </button>
        <button type="button" className="lim-btn-ghost lim-btn--sm" onClick={incluirSabado}>
          Incluir sábado
        </button>
        <button type="button" className="lim-btn-ghost lim-btn--sm" onClick={limparDomingo}>
          Limpar domingo
        </button>
      </div>
      <div className="lim-semanal__dias">
        {DIAS.map((nome, d) => {
          const day = weekly[d] || { ativo: false, periodos: [] }
          return (
            <div key={d} className={`lim-dia${day.ativo ? ' lim-dia--ativo' : ''}`}>
              <div className="lim-dia__header">
                <label className="lim-dia__toggle">
                  <input
                    type="checkbox"
                    checked={!!day.ativo}
                    onChange={(e) => setDay(d, { ativo: e.target.checked })}
                  />
                  <span className="lim-dia__nome">{nome}</span>
                  <span className="lim-dia__sigla">{DIAS_CURTOS[d]}</span>
                </label>
              </div>
              {day.ativo && (
                <div className="lim-dia__periodos">
                  {(day.periodos || []).map((p, idx) => (
                    <div key={idx} className="lim-periodo">
                      <input
                        type="time"
                        className="lim-input lim-input--time"
                        value={p.hora_inicio}
                        onChange={(e) => setPeriodo(d, idx, { hora_inicio: e.target.value })}
                      />
                      <span className="lim-periodo__sep">até</span>
                      <input
                        type="time"
                        className="lim-input lim-input--time"
                        value={p.hora_fim}
                        onChange={(e) => setPeriodo(d, idx, { hora_fim: e.target.value })}
                      />
                      {(day.periodos?.length || 0) > 1 && (
                        <button
                          type="button"
                          className="lim-periodo__remove"
                          onClick={() => removePeriodo(d, idx)}
                          title="Remover período"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="lim-link" onClick={() => addPeriodo(d)}>
                    + Adicionar período
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CardInstancia({
  inst,
  override,
  weeklyInst,
  globais,
  onToggleHerdar,
  onToggleJanelasProprias,
  onChangeOverride,
  onChangeWeekly,
  expandido,
  onToggleExpand,
}) {
  const id = inst.instancia_id ?? inst.id
  const herdar = override?.herdar_global !== false
  const janelasProprias = override?.janelas_proprias === true
  const conectada = inst.conectada !== false && inst.status === 'connected'

  return (
    <div className={`lim-inst-card${!herdar ? ' lim-inst-card--custom' : ''}${!conectada ? ' lim-inst-card--warn' : ''}`}>
      <div className="lim-inst-card__header">
        <div className="lim-inst-card__info">
          <IconServer size={16} className="lim-inst-card__icon" />
          <div>
            <span className="lim-inst-card__nome">{inst.nome}</span>
            <span className="lim-inst-card__phone">{inst.display_phone ?? '—'}</span>
          </div>
        </div>
        <div className="lim-inst-card__badges">
          {!conectada && (
            <span className="lim-badge lim-badge--warn">
              <IconWifiOff size={11} /> Desconectada
            </span>
          )}
          {herdar ? (
            <span className="lim-badge lim-badge--inherit">Herdar global</span>
          ) : (
            <span className="lim-badge lim-badge--custom">Personalizado</span>
          )}
        </div>
        <button type="button" className="lim-inst-card__expand" onClick={onToggleExpand}>
          {expandido ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </button>
      </div>

      {expandido && (
        <div className="lim-inst-card__body">
          <div className="lim-toggle-row">
            <span>Herdar limites globais</span>
            <label className="lim-switch">
              <input
                type="checkbox"
                checked={herdar}
                onChange={(e) => onToggleHerdar(id, e.target.checked)}
              />
              <span className="lim-switch__track" />
            </label>
          </div>

          {!herdar && (
            <>
              <div className="lim-grid lim-grid--3">
                <NumField
                  label="Limite / hora"
                  value={override.limite_por_hora ?? globais.limite_por_hora}
                  onChange={(v) => onChangeOverride(id, { limite_por_hora: v })}
                />
                <NumField
                  label="Limite / dia"
                  value={override.limite_por_dia ?? globais.limite_por_dia}
                  onChange={(v) => onChangeOverride(id, { limite_por_dia: v })}
                />
                <NumField
                  label="Lote"
                  value={override.lote_tamanho ?? globais.lote_tamanho}
                  onChange={(v) => onChangeOverride(id, { lote_tamanho: v })}
                />
                <NumField
                  label="Intervalo mín. (s)"
                  value={override.intervalo_min_sec ?? globais.intervalo_min_sec}
                  onChange={(v) => onChangeOverride(id, { intervalo_min_sec: v })}
                />
                <NumField
                  label="Intervalo máx. (s)"
                  value={override.intervalo_max_sec ?? globais.intervalo_max_sec}
                  onChange={(v) => onChangeOverride(id, { intervalo_max_sec: v })}
                />
                <NumField
                  label="Pausa lote mín. (s)"
                  value={override.pausa_lote_min_sec ?? globais.pausa_lote_min_sec}
                  onChange={(v) => onChangeOverride(id, { pausa_lote_min_sec: v })}
                />
              </div>

              <div className="lim-toggle-row">
                <span>Horários próprios (não herdar janela global)</span>
                <label className="lim-switch">
                  <input
                    type="checkbox"
                    checked={janelasProprias}
                    onChange={(e) => onToggleJanelasProprias(id, e.target.checked)}
                  />
                  <span className="lim-switch__track" />
                </label>
              </div>

              {janelasProprias && weeklyInst && (
                <EditorSemanal
                  weekly={weeklyInst}
                  onChange={(w) => onChangeWeekly(id, w)}
                  titulo={`Janelas — ${inst.nome}`}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SimulacaoResumo({ simulacao }) {
  if (!simulacao?.resumo) return null
  const { resumo, instancias: linhas, avisos, erros } = simulacao

  return (
    <div className="lim-sim">
      <div className="lim-sim__grid">
        <div className="lim-sim__card">
          <span className="lim-sim__label">Início previsto</span>
          <strong>{resumo.inicio_previsto_local || fmtIsoLocal(resumo.inicio_previsto)}</strong>
        </div>
        <div className="lim-sim__card">
          <span className="lim-sim__label">Conclusão aprox.</span>
          <strong>{resumo.conclusao_aproximada_local || fmtIsoLocal(resumo.conclusao_aproximada)}</strong>
        </div>
        <div className="lim-sim__card">
          <span className="lim-sim__label">Duração total</span>
          <strong>{resumo.duracao_total_horas} h</strong>
        </div>
        <div className="lim-sim__card">
          <span className="lim-sim__label">Destinatários</span>
          <strong>{resumo.total_destinatarios}</strong>
        </div>
      </div>

      {(linhas || []).length > 0 && (
        <div className="lim-sim__instancias">
          <p className="lim-sim__subtitulo">Por instância</p>
          {linhas.map((l) => (
            <div key={l.instancia_id} className="lim-sim__linha">
              <span className="lim-sim__inst-nome">{l.nome}</span>
              <span>{l.quantidade_simulada ?? l.quantidade} msgs</span>
              <span>{l.duracao_horas} h</span>
              <span>{l.pausas_previstas} pausas</span>
            </div>
          ))}
        </div>
      )}

      {(linhas || []).some((l) => l.por_dia?.length) && (
        <div className="lim-sim__por-dia">
          <p className="lim-sim__subtitulo">Distribuição por dia</p>
          {linhas.filter((l) => l.por_dia?.length).map((l) => (
            <div key={l.instancia_id} className="lim-sim__dia-grupo">
              <strong>{l.nome}</strong>
              <div className="lim-sim__dia-chips">
                {l.por_dia.map((p) => (
                  <span key={p.dia} className="lim-sim__dia-chip">
                    {p.dia}: {p.quantidade}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {[...(erros || []), ...(avisos || [])].length > 0 && (
        <ul className="lim-sim__avisos">
          {[...(erros || []), ...(avisos || [])].map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}

      <p className="lim-disclaimer">{resumo.disclaimer}</p>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function DisparoLimitesStep({ campanha, onCampanhaUpdate, onBack, onContinue }) {
  const campanhaId = campanha?.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [continuando, setContinuando] = useState(false)
  const [erro, setErro] = useState('')
  const [avisos, setAvisos] = useState([])

  const [perfisApi, setPerfisApi] = useState(PERFIS_DEFAULT)
  const [instancias, setInstancias] = useState([])
  const [desconectadas, setDesconectadas] = useState([])
  const [limitesConfirmados, setLimitesConfirmados] = useState(false)
  const [limitesRevisao, setLimitesRevisao] = useState(false)
  const [motivosRevisao, setMotivosRevisao] = useState([])

  const [globais, setGlobais] = useState({
    perfil: 'moderado',
    limite_total: '',
    limite_por_hora: 60,
    limite_por_dia: 500,
    intervalo_min_sec: 8,
    intervalo_max_sec: 20,
    lote_tamanho: 20,
    pausa_lote_min_sec: 60,
    pausa_lote_max_sec: 180,
    fuso_horario: 'America/Sao_Paulo',
    inicio_modo: 'imediato',
    agendado_para: null,
    data_limite: null,
    pausa_auto_desconexao: true,
    pausa_auto_erros_consecutivos: 5,
    pausa_auto_taxa_falha_pct: 25,
  })

  const [weeklyGlobal, setWeeklyGlobal] = useState(defaultWeekly)
  const [instOverrides, setInstOverrides] = useState({})
  const [weeklyPorInst, setWeeklyPorInst] = useState({})
  const [instExpandida, setInstExpandida] = useState(null)

  const [simulacao, setSimulacao] = useState(null)
  const [simulado, setSimulado] = useState(false)
  const [conflitos, setConflitos] = useState([])
  const [conflitoImpeditivo, setConflitoImpeditivo] = useState(false)

  const perfis = useMemo(() => ({ ...PERFIS_DEFAULT, ...perfisApi }), [perfisApi])

  const carregar = useCallback(async () => {
    if (!campanhaId) return
    setLoading(true)
    setErro('')
    try {
      const [cfg, confl, rev] = await Promise.all([
        obterConfigLimites(campanhaId),
        localizarConflitos(campanhaId),
        necessidadeRevisao(campanhaId),
      ])

      const lim = cfg.limites || {}
      setGlobais({
        perfil: lim.perfil || 'moderado',
        limite_total: lim.limite_total ?? '',
        limite_por_hora: lim.limite_por_hora ?? 60,
        limite_por_dia: lim.limite_por_dia ?? 500,
        intervalo_min_sec: lim.intervalo_min_sec ?? 8,
        intervalo_max_sec: lim.intervalo_max_sec ?? 20,
        lote_tamanho: lim.lote_tamanho ?? 20,
        pausa_lote_min_sec: lim.pausa_lote_min_sec ?? 60,
        pausa_lote_max_sec: lim.pausa_lote_max_sec ?? 180,
        fuso_horario: lim.fuso_horario || cfg.fuso_padrao || 'America/Sao_Paulo',
        inicio_modo: lim.inicio_modo || 'imediato',
        agendado_para: lim.agendado_para || null,
        data_limite: lim.data_limite || null,
        pausa_auto_desconexao: lim.pausa_auto_desconexao !== false,
        pausa_auto_erros_consecutivos: lim.pausa_auto_erros_consecutivos ?? 5,
        pausa_auto_taxa_falha_pct: lim.pausa_auto_taxa_falha_pct ?? 25,
      })

      const janelas = cfg.janelas?.length ? cfg.janelas : null
      setWeeklyGlobal(janelas ? janelasToWeekly(janelas) : defaultWeekly())

      setInstancias(cfg.instancias || [])
      setDesconectadas(cfg.instancias_desconectadas || [])
      setInstOverrides(buildInstOverrideMap(cfg.instancia_limites, cfg.instancias))

      const wInst = {}
      for (const [key, arr] of Object.entries(cfg.janelas_por_instancia || {})) {
        wInst[key] = janelasToWeekly(Array.isArray(arr) ? arr : Object.values(arr))
      }
      setWeeklyPorInst(wInst)

      if (cfg.perfis) setPerfisApi(cfg.perfis)
      setLimitesConfirmados(cfg.limites_confirmados === true)
      setLimitesRevisao(cfg.limites_revisao === true || rev.limites_revisao === true)
      setMotivosRevisao(rev.motivos || [])

      setConflitos(confl.conflitos || [])
      setConflitoImpeditivo(confl.conflito_impeditivo === true)
      if (confl.avisos?.length) setAvisos(confl.avisos)

      setSimulacao(null)
      setSimulado(false)
    } catch (e) {
      setErro(disparoApiError(e))
    } finally {
      setLoading(false)
    }
  }, [campanhaId])

  useEffect(() => { carregar() }, [carregar])

  function aplicarPerfil(nome) {
    if (nome === 'personalizado') {
      setGlobais((g) => ({ ...g, perfil: 'personalizado' }))
      return
    }
    const p = perfis[nome]
    if (!p) return
    setGlobais((g) => ({
      ...g,
      perfil: nome,
      limite_por_hora: p.limite_por_hora,
      limite_por_dia: p.limite_por_dia,
      intervalo_min_sec: p.intervalo_min_sec,
      intervalo_max_sec: p.intervalo_max_sec,
      lote_tamanho: p.lote_tamanho,
      pausa_lote_min_sec: p.pausa_lote_min_sec,
      pausa_lote_max_sec: p.pausa_lote_max_sec,
    }))
    setSimulado(false)
  }

  function patchGlobais(patch) {
    setGlobais((g) => ({ ...g, ...patch, perfil: patch.perfil ?? 'personalizado' }))
    setSimulado(false)
  }

  function buildInstanciasPayload() {
    return Object.entries(instOverrides).map(([id, o]) => ({
      instancia_id: Number(id),
      herdar_global: o.herdar_global !== false,
      janelas_proprias: o.janelas_proprias === true,
      limite_por_hora: o.herdar_global === false ? o.limite_por_hora : undefined,
      limite_por_dia: o.herdar_global === false ? o.limite_por_dia : undefined,
      intervalo_min_sec: o.herdar_global === false ? o.intervalo_min_sec : undefined,
      intervalo_max_sec: o.herdar_global === false ? o.intervalo_max_sec : undefined,
      lote_tamanho: o.herdar_global === false ? o.lote_tamanho : undefined,
      pausa_lote_min_sec: o.herdar_global === false ? o.pausa_lote_min_sec : undefined,
      pausa_lote_max_sec: o.herdar_global === false ? o.pausa_lote_max_sec : undefined,
    }))
  }

  async function salvarTudo({ silencioso = false } = {}) {
    if (!silencioso) setSaving(true)
    setErro('')
    const avisosLocais = []

    try {
      const payload = buildGlobaisPayload(globais)
      const resGlob = await salvarLimitesGlobais(campanhaId, payload)
      if (resGlob.avisos?.length) avisosLocais.push(...resGlob.avisos)

      await salvarJanelas(campanhaId, { janelas: weeklyToJanelas(weeklyGlobal), instancia_id: null })

      const instPayload = buildInstanciasPayload()
      if (instPayload.length) {
        const resInst = await salvarLimitesInstancias(campanhaId, { instancias: instPayload })
        if (resInst.avisos?.length) avisosLocais.push(...resInst.avisos)
      }

      for (const [id, o] of Object.entries(instOverrides)) {
        if (o.janelas_proprias && weeklyPorInst[id]) {
          await salvarJanelas(campanhaId, {
            janelas: weeklyToJanelas(weeklyPorInst[id]),
            instancia_id: Number(id),
          })
        }
      }

      if (globais.inicio_modo === 'agendado') {
        const resAg = await salvarAgendamento(campanhaId, {
          inicio_modo: globais.inicio_modo,
          agendado_para: globais.agendado_para,
          data_limite: globais.data_limite,
        })
        if (resAg.avisos?.length) avisosLocais.push(...resAg.avisos)
        if (resAg.limites) {
          setGlobais((g) => ({
            ...g,
            agendado_para: resAg.limites.agendado_para,
            inicio_modo: resAg.limites.inicio_modo,
            data_limite: resAg.limites.data_limite,
          }))
        }
      } else if (globais.inicio_modo === 'imediato') {
        await salvarAgendamento(campanhaId, { inicio_modo: 'imediato', agendado_para: null })
      }

      setAvisos(avisosLocais)
      if (!silencioso) setLimitesRevisao(true)
      return true
    } catch (e) {
      setErro(disparoApiError(e))
      return false
    } finally {
      if (!silencioso) setSaving(false)
    }
  }

  async function handleSalvarRascunho() {
    await salvarTudo()
  }

  async function handleSimular() {
    setSaving(true)
    setErro('')
    try {
      await salvarTudo({ silencioso: true })
      const res = await simular(campanhaId)
      setSimulacao(res)
      setSimulado(true)
      if (res.avisos?.length) setAvisos(res.avisos)
    } catch (e) {
      setErro(disparoApiError(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelarAgendamento() {
    setSaving(true)
    try {
      const res = await cancelarAgendamento(campanhaId)
      setGlobais((g) => ({
        ...g,
        inicio_modo: 'imediato',
        agendado_para: null,
      }))
      if (res.limites) {
        setGlobais((g) => ({
          ...g,
          inicio_modo: res.limites.inicio_modo,
          agendado_para: res.limites.agendado_para,
        }))
      }
    } catch (e) {
      setErro(disparoApiError(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleContinuar() {
    setContinuando(true)
    setErro('')
    try {
      const okSave = await salvarTudo({ silencioso: true })
      if (!okSave) return

      const val = await validarConfigLimites(campanhaId, buildGlobaisPayload(globais))
      if (!val.ok) {
        setErro(val.erros?.[0] || 'Validação falhou. Corrija os problemas antes de continuar.')
        return
      }

      let sim = simulacao
      if (!simulado) {
        sim = await simular(campanhaId)
        setSimulacao(sim)
        setSimulado(true)
      }
      if (!sim?.ok) {
        setErro(sim?.erros?.[0] || 'Simulação indicou problemas. Revise limites e janelas.')
        return
      }

      const conf = await confirmarLimites(campanhaId)
      setLimitesConfirmados(true)
      setLimitesRevisao(false)
      if (conf.avisos?.length) setAvisos(conf.avisos)

      onCampanhaUpdate?.({ ...campanha, limites_confirmados: true, limites_revisao: false })
      onContinue?.()
    } catch (e) {
      const data = e?.response?.data
      if (data?.erros?.length) setErro(data.erros[0])
      else setErro(disparoApiError(e))
      if (data?.conflitos) setConflitos(data.conflitos)
    } finally {
      setContinuando(false)
    }
  }

  const mostrarBannerRevisao = limitesRevisao || desconectadas.length > 0 || motivosRevisao.length > 0

  const bloqueantes = [
    conflitoImpeditivo && 'Conflitos impeditivos com outras campanhas.',
    desconectadas.length > 0 && `${desconectadas.length} instância(s) desconectada(s).`,
  ].filter(Boolean)

  if (loading) return <LimitesSkeleton />

  return (
    <div className="lim-root">
      {erro && (
        <div className="disparo-alert disparo-alert--error lim-alert">
          <IconAlertTriangle size={16} />
          <span>{erro}</span>
          <button type="button" className="lim-alert__close" onClick={() => setErro('')}>×</button>
        </div>
      )}

      {mostrarBannerRevisao && !erro && (
        <div className="lim-banner-revisao">
          <IconAlertTriangle size={18} />
          <div>
            <strong>Revisão necessária</strong>
            <ul>
              {limitesRevisao && <li>Os limites foram alterados após a confirmação anterior.</li>}
              {motivosRevisao.map((m, i) => <li key={i}>{m}</li>)}
              {desconectadas.map((d) => (
                <li key={d.id}>Instância &quot;{d.nome}&quot; desconectada (status: {d.status}).</li>
              ))}
            </ul>
          </div>
          <button type="button" className="lim-btn-ghost lim-btn--sm" onClick={carregar}>
            <IconRefresh size={14} /> Revalidar
          </button>
        </div>
      )}

      {avisos.length > 0 && (
        <div className="lim-banner-aviso">
          {avisos.map((a, i) => <p key={i}>{a}</p>)}
        </div>
      )}

      {/* Perfis */}
      <section className="lim-section">
        <div className="lim-section__header">
          <IconShield size={18} />
          <div>
            <h2 className="lim-section__title">Perfil operacional</h2>
            <p className="lim-section__sub">Escolha um ponto de partida e ajuste os valores abaixo</p>
          </div>
        </div>
        <div className="lim-perfis">
          {['conservador', 'moderado', 'personalizado'].map((p) => (
            <button
              key={p}
              type="button"
              className={`lim-perfil-btn${globais.perfil === p ? ' lim-perfil-btn--active' : ''}`}
              onClick={() => aplicarPerfil(p)}
            >
              {p === 'conservador' ? 'Conservador' : p === 'moderado' ? 'Moderado' : 'Personalizado'}
            </button>
          ))}
        </div>
        <p className="lim-disclaimer">
          Sugestão operacional — não garante proteção contra bloqueio do WhatsApp/provedor.
        </p>
      </section>

      {/* Limites globais */}
      <section className="lim-section">
        <div className="lim-section__header">
          <IconClock size={18} />
          <div>
            <h2 className="lim-section__title">Limites globais</h2>
            <p className="lim-section__sub">Valem para todas as instâncias que herdarem a configuração</p>
          </div>
        </div>
        <div className="lim-grid lim-grid--3">
          <NumField
            label="Limite total"
            hint="Vazio = sem teto global"
            value={globais.limite_total}
            onChange={(v) => patchGlobais({ limite_total: v })}
            optional
          />
          <NumField
            label="Limite / hora"
            value={globais.limite_por_hora}
            onChange={(v) => patchGlobais({ limite_por_hora: v })}
            min={1}
          />
          <NumField
            label="Limite / dia"
            value={globais.limite_por_dia}
            onChange={(v) => patchGlobais({ limite_por_dia: v })}
            min={1}
          />
          <NumField
            label="Intervalo mín. (s)"
            value={globais.intervalo_min_sec}
            onChange={(v) => patchGlobais({ intervalo_min_sec: v })}
            min={1}
          />
          <NumField
            label="Intervalo máx. (s)"
            value={globais.intervalo_max_sec}
            onChange={(v) => patchGlobais({ intervalo_max_sec: v })}
            min={1}
          />
          <NumField
            label="Tamanho do lote"
            value={globais.lote_tamanho}
            onChange={(v) => patchGlobais({ lote_tamanho: v })}
            min={1}
          />
          <NumField
            label="Pausa lote mín. (s)"
            value={globais.pausa_lote_min_sec}
            onChange={(v) => patchGlobais({ pausa_lote_min_sec: v })}
            min={0}
          />
          <NumField
            label="Pausa lote máx. (s)"
            value={globais.pausa_lote_max_sec}
            onChange={(v) => patchGlobais({ pausa_lote_max_sec: v })}
            min={0}
          />
        </div>
      </section>

      {/* Instâncias */}
      {instancias.length > 0 && (
        <section className="lim-section">
          <div className="lim-section__header">
            <IconServer size={18} />
            <div>
              <h2 className="lim-section__title">Limites por instância</h2>
              <p className="lim-section__sub">{instancias.length} instância(s) na campanha</p>
            </div>
          </div>
          <div className="lim-inst-list">
            {instancias.map((inst) => {
              const id = inst.instancia_id ?? inst.id
              return (
                <CardInstancia
                  key={id}
                  inst={inst}
                  override={instOverrides[id] || { herdar_global: true }}
                  weeklyInst={weeklyPorInst[id] || defaultWeekly()}
                  globais={globais}
                  expandido={instExpandida === id}
                  onToggleExpand={() => setInstExpandida(instExpandida === id ? null : id)}
                  onToggleHerdar={(instId, herdar) => {
                    setInstOverrides((m) => ({
                      ...m,
                      [instId]: { ...m[instId], instancia_id: instId, herdar_global: herdar, janelas_proprias: herdar ? false : m[instId]?.janelas_proprias },
                    }))
                    setSimulado(false)
                  }}
                  onToggleJanelasProprias={(instId, ativo) => {
                    setInstOverrides((m) => ({
                      ...m,
                      [instId]: { ...m[instId], instancia_id: instId, janelas_proprias: ativo, herdar_global: false },
                    }))
                    if (ativo && !weeklyPorInst[instId]) {
                      setWeeklyPorInst((w) => ({ ...w, [instId]: defaultWeekly() }))
                    }
                    setSimulado(false)
                  }}
                  onChangeOverride={(instId, patch) => {
                    setInstOverrides((m) => ({
                      ...m,
                      [instId]: { ...m[instId], instancia_id: instId, herdar_global: false, ...patch },
                    }))
                    setSimulado(false)
                  }}
                  onChangeWeekly={(instId, w) => {
                    setWeeklyPorInst((prev) => ({ ...prev, [instId]: w }))
                    setSimulado(false)
                  }}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* Janelas globais */}
      <section className="lim-section">
        <div className="lim-section__header">
          <IconCalendar size={18} />
          <div>
            <h2 className="lim-section__title">Janelas de envio</h2>
            <p className="lim-section__sub">Horários permitidos para disparo (fuso abaixo)</p>
          </div>
        </div>
        <EditorSemanal weekly={weeklyGlobal} onChange={(w) => { setWeeklyGlobal(w); setSimulado(false) }} />

        <div className="lim-field lim-field--fuso">
          <label className="lim-field__label">Fuso horário</label>
          <select
            className="lim-select"
            value={globais.fuso_horario}
            onChange={(e) => patchGlobais({ fuso_horario: e.target.value })}
          >
            {FUSOS_BR.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Agendamento */}
      <section className="lim-section">
        <div className="lim-section__header">
          <IconPlayerPlay size={18} />
          <div>
            <h2 className="lim-section__title">Agendamento</h2>
            <p className="lim-section__sub">Quando a campanha deve iniciar após confirmação final</p>
          </div>
        </div>
        <div className="lim-agendamento">
          <label className="lim-radio">
            <input
              type="radio"
              name="inicio_modo"
              checked={globais.inicio_modo === 'imediato'}
              onChange={() => patchGlobais({ inicio_modo: 'imediato', agendado_para: null })}
            />
            <span>Iniciar após confirmação final</span>
          </label>
          <label className="lim-radio">
            <input
              type="radio"
              name="inicio_modo"
              checked={globais.inicio_modo === 'agendado'}
              onChange={() => patchGlobais({ inicio_modo: 'agendado' })}
            />
            <span>Agendar data e hora</span>
          </label>

          {globais.inicio_modo === 'agendado' && (
            <div className="lim-agendamento__campos">
              <div className="lim-field">
                <label className="lim-field__label">Data e hora</label>
                <input
                  type="datetime-local"
                  className="lim-input"
                  value={isoToDatetimeLocal(globais.agendado_para)}
                  onChange={(e) => patchGlobais({ agendado_para: datetimeLocalToIso(e.target.value) })}
                />
              </div>
              <div className="lim-field">
                <label className="lim-field__label">Data limite <span className="lim-field__opt">(opcional)</span></label>
                <input
                  type="datetime-local"
                  className="lim-input"
                  value={isoToDatetimeLocal(globais.data_limite)}
                  onChange={(e) => patchGlobais({ data_limite: datetimeLocalToIso(e.target.value) })}
                />
              </div>
              {globais.agendado_para && (
                <button type="button" className="lim-btn-ghost lim-btn--sm" onClick={handleCancelarAgendamento} disabled={saving}>
                  Cancelar agendamento
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Pausas automáticas */}
      <section className="lim-section">
        <div className="lim-section__header">
          <IconShield size={18} />
          <div>
            <h2 className="lim-section__title">Pausas automáticas</h2>
            <p className="lim-section__sub">Critérios para pausar o envio automaticamente</p>
          </div>
        </div>
        <div className="lim-pausas">
          <label className="lim-check">
            <input
              type="checkbox"
              checked={globais.pausa_auto_desconexao}
              onChange={(e) => patchGlobais({ pausa_auto_desconexao: e.target.checked })}
            />
            <span>Pausar ao detectar desconexão da instância</span>
          </label>
          <div className="lim-grid lim-grid--2">
            <NumField
              label="Erros consecutivos"
              hint="Pausa após N falhas seguidas"
              value={globais.pausa_auto_erros_consecutivos}
              onChange={(v) => patchGlobais({ pausa_auto_erros_consecutivos: v })}
              min={1}
              max={100}
            />
            <NumField
              label="Taxa de falha (%)"
              hint="Pausa se taxa ultrapassar"
              value={globais.pausa_auto_taxa_falha_pct}
              onChange={(v) => patchGlobais({ pausa_auto_taxa_falha_pct: v })}
              min={1}
              max={100}
            />
          </div>
        </div>
      </section>

      {/* Simulação */}
      <section className="lim-section">
        <div className="lim-section__header lim-section__header--row">
          <div className="lim-section__header">
            <IconClock size={18} />
            <div>
              <h2 className="lim-section__title">Simulação de duração</h2>
              <p className="lim-section__sub">Estimativa com base nos limites e janelas configurados</p>
            </div>
          </div>
          <button
            type="button"
            className="lim-btn-primary lim-btn--sm"
            onClick={handleSimular}
            disabled={saving}
          >
            {saving ? 'Calculando…' : 'Simular duração'}
          </button>
        </div>
        {simulacao ? (
          <SimulacaoResumo simulacao={simulacao} />
        ) : (
          <p className="lim-empty">Clique em &quot;Simular duração&quot; para ver a previsão.</p>
        )}
        <p className="lim-disclaimer">
          Estimativa sujeita a desconexões, falhas e limites reais do provedor. Não há envio nesta etapa.
        </p>
      </section>

      {/* Conflitos */}
      {conflitos.length > 0 && (
        <section className="lim-section lim-section--warn">
          <div className="lim-section__header">
            <IconAlertTriangle size={18} />
            <div>
              <h2 className="lim-section__title">Conflitos detectados</h2>
              <p className="lim-section__sub">Outras campanhas usando as mesmas instâncias</p>
            </div>
          </div>
          <ul className="lim-conflitos">
            {conflitos.map((c, i) => (
              <li key={i} className={`lim-conflito lim-conflito--${c.tipo}`}>
                <strong>{c.campanha_nome}</strong>
                <span>Instância #{c.instancia_id}</span>
                <span className="lim-badge lim-badge--warn">{c.tipo.replace('_', ' ')}</span>
                {c.agendado_para && <span>Agendado: {fmtIsoLocal(c.agendado_para)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Footer */}
      <footer className="dw-footer lim-footer">
        <div className="dw-footer__left">
          <button type="button" className="disparo-btn-secondary" onClick={onBack}>
            Voltar
          </button>
        </div>
        <div className="lim-footer__center">
          {bloqueantes.length > 0 && (
            <div className="lim-footer__bloqueantes">
              {bloqueantes.map((b, i) => <span key={i}>{b}</span>)}
            </div>
          )}
          {limitesConfirmados && !limitesRevisao && (
            <span className="lim-footer__ok">Limites confirmados</span>
          )}
        </div>
        <div className="dw-footer__right">
          <button
            type="button"
            className="disparo-btn-secondary"
            onClick={handleSalvarRascunho}
            disabled={saving || continuando}
          >
            {saving ? 'Salvando…' : 'Salvar rascunho'}
          </button>
          <button
            type="button"
            className="disparo-btn-primary"
            onClick={handleContinuar}
            disabled={saving || continuando || conflitoImpeditivo || desconectadas.length > 0}
            title={bloqueantes[0] ?? ''}
          >
            {continuando ? 'Confirmando…' : 'Continuar →'}
          </button>
        </div>
      </footer>
    </div>
  )
}
