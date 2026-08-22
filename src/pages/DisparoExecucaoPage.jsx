import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowLeft,
  IconBan,
  IconChartBar,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconClock,
  IconDeviceMobile,
  IconMessageReply,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconRotateClockwise,
  IconSettings,
  IconShieldBolt,
  IconSpeakerphone,
  IconTrash,
  IconUserOff,
  IconX,
} from '@tabler/icons-react'
import { getSocket } from '../socket/socket'
import {
  adicionarExclusao,
  cancelar,
  continuar,
  disparoApiError,
  emergencia,
  importarExclusoes,
  iniciarCampanha,
  listarEventos,
  listarExclusoes,
  listarFila,
  obterExecucao,
  pausar,
  removerExclusao,
  reprocessarFalhas,
  resumoExecucao,
  saudeInstancias,
  saudeWorker,
} from '../api/disparoExecucaoService'
import DisparoEtapa8Section from '../components/disparo/DisparoEtapa8Section'
import './disparo.css'
import './disparoExecucao.css'

// ── Constantes ──────────────────────────────────────────────────────────────

const SOCKET_EVENTS = [
  'disparo_campanha_iniciada',
  'disparo_campanha_pausada',
  'disparo_campanha_retomada',
  'disparo_campanha_cancelada',
  'disparo_campanha_concluida',
  'disparo_item_atualizado',
  'disparo_instancia_desconectada',
  'disparo_limite_atingido',
  'disparo_optout',
  'disparo_optout_registrado',
  'disparo_optout_reativado',
  'disparo_resposta',
  'disparo_resposta_vinculada',
  'disparo_reconciliado',
]

const PAGE_TABS = [
  { id: 'execucao', label: 'Execução', icon: IconSpeakerphone },
  { id: 'relatorio', label: 'Relatório', icon: IconChartBar },
  { id: 'respostas', label: 'Respostas', icon: IconMessageReply },
  { id: 'optouts', label: 'Opt-outs', icon: IconUserOff },
  { id: 'incertos', label: 'Incertos', icon: IconAlertTriangle },
  { id: 'config', label: 'Config', icon: IconSettings },
]

const SOCKET_DEBOUNCE_MS = 300

const CAMPANHA_STATUS_LABEL = {
  rascunho: 'Rascunho',
  configurando: 'Configurando',
  pronta: 'Pronta',
  agendada: 'Agendada',
  em_execucao: 'Em execução',
  pausada: 'Pausada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  arquivada: 'Arquivada',
}

const EXECUCAO_STATUS_LABEL = {
  aguardando: 'Aguardando',
  em_execucao: 'Em execução',
  pausada: 'Pausada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  emergencia: 'Emergência',
}

const FILA_STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'reservada', label: 'Reservada' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'lido', label: 'Lido' },
  { value: 'falhou', label: 'Falhou' },
  { value: 'incerto', label: 'Incerto' },
  { value: 'ignorado', label: 'Ignorado' },
  { value: 'cancelada', label: 'Cancelada' },
]

const PROGRESS_CARDS = [
  { key: 'total', label: 'Total', color: '#128c7e', field: 'total_itens' },
  { key: 'pendentes', label: 'Pendentes', color: '#64748b', computed: true },
  { key: 'enviados', label: 'Enviadas', color: '#0891b2', field: 'total_enviados' },
  { key: 'entregues', label: 'Entregues', color: '#2563eb', field: 'total_entregues' },
  { key: 'lidos', label: 'Lidas', color: '#7c3aed', field: 'total_lidos' },
  { key: 'falhas', label: 'Falhas', color: '#dc2626', field: 'total_falhas' },
  { key: 'incertos', label: 'Incertas', color: '#d97706', field: 'total_incertos' },
  { key: 'ignorados', label: 'Ignoradas', color: '#94a3b8', field: 'total_ignorados' },
]

const EVENTO_LABEL = {
  iniciada: 'Campanha iniciada',
  pausada: 'Campanha pausada',
  retomada: 'Campanha retomada',
  cancelada: 'Campanha cancelada',
  concluida: 'Campanha concluída',
  emergencia: 'Parada de emergência',
  reprocessamento: 'Reprocessamento de falhas',
  item_enviado: 'Item enviado',
  item_falhou: 'Item falhou',
  limite_atingido: 'Limite atingido',
  instancia_desconectada: 'Instância desconectada',
}

const FILA_PAGE_LIMIT = 25
const EVENTOS_LIMIT = 30
const EXCLUSOES_LIMIT = 20

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(iso) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso))
  } catch {
    return '—'
  }
}

function fmtRelative(iso) {
  if (!iso) return '—'
  try {
    const diff = Date.now() - new Date(iso).getTime()
    if (diff < 60_000) return 'Agora'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min atrás`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h atrás`
    return fmtDateTime(iso)
  } catch {
    return '—'
  }
}

function calcPendentes(contadores = {}, porStatus = {}) {
  if (porStatus.pendente != null || porStatus.reservada != null) {
    return (porStatus.pendente ?? 0) + (porStatus.reservada ?? 0)
  }
  const c = contadores
  const done =
    (c.total_enviados ?? 0) +
    (c.total_falhas ?? 0) +
    (c.total_ignorados ?? 0) +
    (c.total_cancelados ?? 0)
  return Math.max(0, (c.total_itens ?? 0) - done)
}

function extrairTimings(filaItens = []) {
  let ultimoEnvio = null
  let proximoPrevisto = null

  for (const item of filaItens) {
    const enviado = item.enviado_em || item.entregue_em || item.lido_em
    if (enviado && (!ultimoEnvio || enviado > ultimoEnvio)) {
      ultimoEnvio = enviado
    }
    if (['pendente', 'reservada'].includes(item.status)) {
      const prox = item.proxima_tentativa_em || item.planejado_para
      if (prox && (!proximoPrevisto || prox < proximoPrevisto)) {
        proximoPrevisto = prox
      }
    }
  }

  return { ultimoEnvio, proximoPrevisto }
}

function eventoResumo(evento) {
  const tipo = evento?.tipo
  const base = EVENTO_LABEL[tipo] || tipo || 'Evento'
  const payload = evento?.payload
  if (payload && typeof payload === 'object') {
    if (payload.motivo) return `${base}: ${payload.motivo}`
    if (payload.quantidade != null) return `${base} (${payload.quantidade})`
  }
  return base
}

// ── Modais ────────────────────────────────────────────────────────────────────

function Modal({ children, onClose, className = '' }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="dp-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`dp-modal dpex-modal ${className}`.trim()}>{children}</div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function DisparoExecucaoPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const campanhaId = Number(id)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [acaoLoading, setAcaoLoading] = useState('')

  const [execData, setExecData] = useState(null)
  const [resumo, setResumo] = useState(null)
  const [instancias, setInstancias] = useState([])
  const [workerSaude, setWorkerSaude] = useState(null)

  const [fila, setFila] = useState({ itens: [], page: 1, total: 0, total_pages: 0 })
  const [filaStatus, setFilaStatus] = useState('')
  const [filaPage, setFilaPage] = useState(1)

  const [eventos, setEventos] = useState([])

  const [exclusoesOpen, setExclusoesOpen] = useState(false)
  const [exclusoes, setExclusoes] = useState({ itens: [], total: 0 })
  const [exclSearch, setExclSearch] = useState('')
  const [exclTelefone, setExclTelefone] = useState('')
  const [exclMotivo, setExclMotivo] = useState('')
  const [exclImportTexto, setExclImportTexto] = useState('')
  const [exclLoading, setExclLoading] = useState(false)

  const [showPausar, setShowPausar] = useState(false)
  const [pausaMotivo, setPausaMotivo] = useState('')
  const [showCancelar, setShowCancelar] = useState(false)
  const [showEmergencia, setShowEmergencia] = useState(false)
  const [emergenciaTexto, setEmergenciaTexto] = useState('')

  const [activeTab, setActiveTab] = useState('execucao')
  const [etapa8RefreshKey, setEtapa8RefreshKey] = useState(0)

  const socketTimerRef = useRef(null)
  const etapa8TimerRef = useRef(null)
  const filaTimingRef = useRef({ ultimoEnvio: null, proximoPrevisto: null })

  const campanha = execData?.campanha ?? null
  const execucao = execData?.execucao ?? null
  const contadores = resumo?.contadores ?? execData?.contadores ?? {}
  const porStatus = resumo?.por_status ?? {}

  const timings = useMemo(() => {
    const fromFila = extrairTimings(fila.itens)
    return {
      ultimoEnvio: fromFila.ultimoEnvio || filaTimingRef.current.ultimoEnvio,
      proximoPrevisto: fromFila.proximoPrevisto || filaTimingRef.current.proximoPrevisto,
    }
  }, [fila.itens])

  const reconcile = useCallback(async (opts = {}) => {
    const silent = opts.silent === true
    if (!campanhaId) return
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const [exec, res, inst, worker, filaRes, evRes] = await Promise.all([
        obterExecucao(campanhaId),
        resumoExecucao(campanhaId),
        saudeInstancias(campanhaId),
        saudeWorker().catch(() => null),
        listarFila(campanhaId, {
          page: opts.filaPage ?? filaPage,
          limit: FILA_PAGE_LIMIT,
          status: (opts.filaStatus ?? filaStatus) || undefined,
        }),
        listarEventos(campanhaId, { page: 1, limit: EVENTOS_LIMIT }),
      ])

      setExecData(exec)
      setResumo(res)
      setInstancias(inst?.instancias ?? [])
      setWorkerSaude(worker)
      setFila({
        itens: filaRes.itens ?? [],
        page: filaRes.page ?? 1,
        total: filaRes.total ?? 0,
        total_pages: filaRes.total_pages ?? 0,
      })
      setEventos(evRes.eventos ?? [])

      const timing = extrairTimings(filaRes.itens ?? [])
      if (timing.ultimoEnvio) filaTimingRef.current.ultimoEnvio = timing.ultimoEnvio
      if (timing.proximoPrevisto) filaTimingRef.current.proximoPrevisto = timing.proximoPrevisto
    } catch (err) {
      setError(disparoApiError(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [campanhaId, filaPage, filaStatus])

  const carregarExclusoes = useCallback(async (search = exclSearch) => {
    setExclLoading(true)
    try {
      const data = await listarExclusoes({
        page: 1,
        limit: EXCLUSOES_LIMIT,
        search: search || undefined,
      })
      setExclusoes({ itens: data.itens ?? [], total: data.total ?? 0 })
    } catch (err) {
      setError(disparoApiError(err))
    } finally {
      setExclLoading(false)
    }
  }, [exclSearch])

  useEffect(() => {
    reconcile()
  }, [reconcile])

  useEffect(() => {
    if (exclusoesOpen) carregarExclusoes()
  }, [exclusoesOpen, carregarExclusoes])

  // Socket.IO + visibility reconcile
  useEffect(() => {
    const socket = getSocket()

    const scheduleRefresh = () => {
      window.clearTimeout(socketTimerRef.current)
      socketTimerRef.current = window.setTimeout(() => {
        reconcile({ silent: true })
      }, SOCKET_DEBOUNCE_MS)
    }

    const scheduleEtapa8Refresh = () => {
      window.clearTimeout(etapa8TimerRef.current)
      etapa8TimerRef.current = window.setTimeout(() => {
        setEtapa8RefreshKey((k) => k + 1)
        reconcile({ silent: true })
      }, SOCKET_DEBOUNCE_MS)
    }

    const ETAPA8_EVENTS = new Set([
      'disparo_optout',
      'disparo_optout_registrado',
      'disparo_optout_reativado',
      'disparo_resposta',
      'disparo_resposta_vinculada',
      'disparo_reconciliado',
    ])

    const onDisparoEvent = (payload = {}, eventName = '') => {
      const payloadCampanha = payload.campanha_id != null ? Number(payload.campanha_id) : null
      const isEtapa8 = ETAPA8_EVENTS.has(eventName)

      if (isEtapa8) {
        if (payloadCampanha != null && payloadCampanha !== campanhaId) return
        scheduleEtapa8Refresh()
        return
      }

      if (payloadCampanha !== campanhaId) return
      scheduleRefresh()
    }

    const onReconnect = () => reconcile({ silent: true })
    const onVisibility = () => {
      if (document.visibilityState === 'visible') reconcile({ silent: true })
    }

    for (const ev of SOCKET_EVENTS) {
      socket?.on(ev, (payload) => onDisparoEvent(payload, ev))
    }
    socket?.on('connect', onReconnect)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearTimeout(socketTimerRef.current)
      window.clearTimeout(etapa8TimerRef.current)
      for (const ev of SOCKET_EVENTS) {
        socket?.off(ev)
      }
      socket?.off('connect', onReconnect)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [campanhaId, reconcile])

  async function runAcao(key, fn) {
    setAcaoLoading(key)
    setError('')
    try {
      await fn()
      await reconcile({ silent: true })
    } catch (err) {
      setError(disparoApiError(err))
    } finally {
      setAcaoLoading('')
    }
  }

  async function handleIniciar() {
    await runAcao('iniciar', () => iniciarCampanha(campanhaId))
  }

  async function handlePausar() {
    await runAcao('pausar', () => pausar(campanhaId, { motivo: pausaMotivo.trim() || undefined }))
    setShowPausar(false)
    setPausaMotivo('')
  }

  async function handleContinuar() {
    await runAcao('continuar', () => continuar(campanhaId))
  }

  async function handleCancelar() {
    await runAcao('cancelar', () => cancelar(campanhaId, { confirmacao: true }))
    setShowCancelar(false)
  }

  async function handleEmergencia() {
    if (emergenciaTexto.trim() !== 'EMERGENCIA') return
    await runAcao('emergencia', () => emergencia({ confirmacao: 'EMERGENCIA' }))
    setShowEmergencia(false)
    setEmergenciaTexto('')
  }

  async function handleReprocessar() {
    await runAcao('reprocessar', () => reprocessarFalhas(campanhaId))
  }

  async function handleAddExclusao(e) {
    e.preventDefault()
    const tel = exclTelefone.trim()
    if (!tel) return
    setExclLoading(true)
    setError('')
    try {
      await adicionarExclusao({ telefone: tel, motivo: exclMotivo.trim() || undefined })
      setExclTelefone('')
      setExclMotivo('')
      await carregarExclusoes()
    } catch (err) {
      setError(disparoApiError(err))
    } finally {
      setExclLoading(false)
    }
  }

  async function handleRemoverExclusao(exclId) {
    setExclLoading(true)
    try {
      await removerExclusao(exclId)
      await carregarExclusoes()
    } catch (err) {
      setError(disparoApiError(err))
    } finally {
      setExclLoading(false)
    }
  }

  async function handleImportarExclusoes() {
    const texto = exclImportTexto.trim()
    if (!texto) return
    setExclLoading(true)
    try {
      await importarExclusoes({ texto, motivo: exclMotivo.trim() || undefined })
      setExclImportTexto('')
      await carregarExclusoes()
    } catch (err) {
      setError(disparoApiError(err))
    } finally {
      setExclLoading(false)
    }
  }

  const campanhaStatus = campanha?.status ?? ''
  const execStatus = execucao?.status ?? null
  const podeIniciar = campanhaStatus === 'pronta' || campanhaStatus === 'agendada'
  const podePausar = campanhaStatus === 'em_execucao'
  const podeContinuar = campanhaStatus === 'pausada'
  const podeCancelar = ['em_execucao', 'pausada', 'agendada', 'pronta'].includes(campanhaStatus)
  const podeReprocessar = ['em_execucao', 'pausada'].includes(campanhaStatus)

  if (loading && !execData) {
    return (
      <div className="dpex-page">
        <div className="dpex-loading">Carregando execução…</div>
      </div>
    )
  }

  if (!campanha && error) {
    return (
      <div className="dpex-page">
        <div className="disparo-alert disparo-alert--error">{error}</div>
        <button type="button" className="disparo-btn-secondary" onClick={() => navigate('/disparo')}>
          ← Voltar às campanhas
        </button>
      </div>
    )
  }

  return (
    <div className="dpex-page">
      {/* Voltar */}
      <button type="button" className="dpex-back" onClick={() => navigate('/disparo')}>
        <IconArrowLeft size={14} /> Campanhas
      </button>

      {/* Header */}
      <header className="dpex-header">
        <div className="dpex-header__main">
          <div className="dpex-header__icon">
            <IconSpeakerphone size={22} />
          </div>
          <div>
            <h1 className="dpex-header__title">{campanha?.nome ?? 'Campanha'}</h1>
            <div className="dpex-header__badges">
              <span className={`dpex-badge dpex-badge--campanha dpex-badge--${campanhaStatus}`}>
                {CAMPANHA_STATUS_LABEL[campanhaStatus] ?? campanhaStatus}
              </span>
              {execStatus && (
                <span className={`dpex-badge dpex-badge--exec dpex-badge--${execStatus}`}>
                  Exec: {EXECUCAO_STATUS_LABEL[execStatus] ?? execStatus}
                </span>
              )}
              {execucao?.dry_run && (
                <span className="dpex-badge dpex-badge--dry">Dry run</span>
              )}
              {execucao?.versao != null && (
                <span className="dpex-badge dpex-badge--muted">v{execucao.versao}</span>
              )}
            </div>
          </div>
        </div>
        <div className="dpex-header__actions">
          <button
            type="button"
            className="disparo-btn-secondary dpex-btn-icon"
            onClick={() => reconcile({ silent: true })}
            disabled={refreshing || !!acaoLoading}
            title="Atualizar dados"
          >
            <IconRefresh size={15} className={refreshing ? 'dpex-spin' : ''} />
            {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
          <Link to={`/disparo/campanhas/${campanhaId}`} className="disparo-btn-secondary dpex-btn-link">
            Wizard
          </Link>
        </div>
      </header>

      {error && (
        <div className="dp-alert dp-alert--global">
          <IconAlertCircle size={15} />
          <span>{error}</span>
          <button type="button" className="dp-alert__close" onClick={() => setError('')}>
            <IconX size={13} />
          </button>
        </div>
      )}

      <nav className="dpex-tabs" aria-label="Seções da execução">
        {PAGE_TABS.map(({ id, label, icon: TabIcon }) => (
          <button
            key={id}
            type="button"
            className={`dpex-tabs__btn${activeTab === id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <TabIcon size={15} />
            {label}
          </button>
        ))}
      </nav>

      {activeTab !== 'execucao' && (
        <DisparoEtapa8Section
          campanhaId={campanhaId}
          tab={activeTab}
          refreshKey={etapa8RefreshKey}
          onReconciled={() => reconcile({ silent: true })}
        />
      )}

      {activeTab === 'execucao' && (
      <>
      {/* Worker saúde compacta */}
      {workerSaude && (
        <div className={`dpex-worker${workerSaude.workers_ativos > 0 ? ' dpex-worker--ok' : ' dpex-worker--warn'}`}>
          <IconShieldBolt size={14} />
          <span>
            Worker: {workerSaude.workers_ativos > 0
              ? `${workerSaude.workers_ativos} ativo(s) nos últimos ${workerSaude.janela_minutos} min`
              : 'Nenhum worker ativo detectado'}
          </span>
          {workerSaude.flags?.live_enabled === false && (
            <span className="dpex-worker__flag">Live desabilitado</span>
          )}
        </div>
      )}

      {/* Cards de progresso */}
      <section className="dpex-progress" aria-label="Progresso da execução">
        {PROGRESS_CARDS.map((card) => {
          const value = card.computed
            ? calcPendentes(contadores, porStatus)
            : (contadores[card.field] ?? 0)
          return (
            <div key={card.key} className="dpex-progress-card" style={{ '--dpex-color': card.color }}>
              <span className="dpex-progress-card__value">{value}</span>
              <span className="dpex-progress-card__label">{card.label}</span>
            </div>
          )
        })}
      </section>

      {/* Timing + motivo pausa */}
      <section className="dpex-timing">
        <div className="dpex-timing__item">
          <IconClock size={14} />
          <div>
            <span className="dpex-timing__label">Último envio</span>
            <span className="dpex-timing__value">{fmtDateTime(timings.ultimoEnvio)}</span>
          </div>
        </div>
        <div className="dpex-timing__item">
          <IconClock size={14} />
          <div>
            <span className="dpex-timing__label">Próximo previsto</span>
            <span className="dpex-timing__value">{fmtDateTime(timings.proximoPrevisto)}</span>
          </div>
        </div>
        {execucao?.motivo_pausa && (
          <div className="dpex-timing__item dpex-timing__item--warn">
            <IconAlertTriangle size={14} />
            <div>
              <span className="dpex-timing__label">Motivo da pausa</span>
              <span className="dpex-timing__value">{execucao.motivo_pausa}</span>
            </div>
          </div>
        )}
      </section>

      {/* Ações operacionais */}
      <section className="dpex-actions">
        {podeIniciar && (
          <button
            type="button"
            className="disparo-btn-primary"
            onClick={handleIniciar}
            disabled={!!acaoLoading}
          >
            <IconPlayerPlay size={15} />
            {acaoLoading === 'iniciar' ? 'Iniciando…' : 'Iniciar campanha'}
          </button>
        )}
        {podePausar && (
          <button
            type="button"
            className="disparo-btn-secondary"
            onClick={() => setShowPausar(true)}
            disabled={!!acaoLoading}
          >
            <IconPlayerPause size={15} />
            Pausar
          </button>
        )}
        {podeContinuar && (
          <button
            type="button"
            className="disparo-btn-primary"
            onClick={handleContinuar}
            disabled={!!acaoLoading}
          >
            <IconPlayerPlay size={15} />
            {acaoLoading === 'continuar' ? 'Retomando…' : 'Continuar'}
          </button>
        )}
        {podeCancelar && (
          <button
            type="button"
            className="dpex-btn-danger"
            onClick={() => setShowCancelar(true)}
            disabled={!!acaoLoading}
          >
            <IconBan size={15} />
            Cancelar
          </button>
        )}
        {podeReprocessar && (
          <button
            type="button"
            className="disparo-btn-secondary"
            onClick={handleReprocessar}
            disabled={!!acaoLoading}
          >
            <IconRotateClockwise size={15} />
            {acaoLoading === 'reprocessar' ? 'Reprocessando…' : 'Reprocessar falhas elegíveis'}
          </button>
        )}
        <button
          type="button"
          className="dpex-btn-emergency"
          onClick={() => setShowEmergencia(true)}
          disabled={!!acaoLoading}
        >
          <IconAlertTriangle size={15} />
          Emergência
        </button>
      </section>

      {/* Instâncias */}
      <section className="dpex-section">
        <h2 className="dpex-section__title">
          <IconDeviceMobile size={16} />
          Instâncias
        </h2>
        {instancias.length === 0 ? (
          <p className="dpex-empty">Nenhuma instância configurada.</p>
        ) : (
          <div className="dpex-inst-grid">
            {instancias.map((inst) => (
              <div
                key={inst.instancia_id}
                className={`dpex-inst-card${inst.conectada ? ' dpex-inst-card--ok' : ' dpex-inst-card--off'}`}
              >
                <div className="dpex-inst-card__top">
                  <span className="dpex-inst-card__name">{inst.nome}</span>
                  <span className={`dpex-inst-dot${inst.conectada ? ' is-on' : ''}`} title={inst.status} />
                </div>
                {inst.display_phone && (
                  <span className="dpex-inst-card__phone">{inst.display_phone}</span>
                )}
                <div className="dpex-inst-card__stats">
                  <span>{inst.fila?.total ?? 0} itens na fila</span>
                  {inst.fila?.por_status && (
                    <span className="dpex-inst-card__detail">
                      {Object.entries(inst.fila.por_status)
                        .filter(([, v]) => v > 0)
                        .slice(0, 4)
                        .map(([s, v]) => `${s}: ${v}`)
                        .join(' · ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="dpex-columns">
        {/* Fila */}
        <section className="dpex-section dpex-section--fila">
          <div className="dpex-section__head">
            <h2 className="dpex-section__title">Fila de envio</h2>
            <select
              className="dp-select dpex-select-sm"
              value={filaStatus}
              onChange={(e) => { setFilaStatus(e.target.value); setFilaPage(1) }}
            >
              {FILA_STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {fila.itens.length === 0 ? (
            <p className="dpex-empty">Nenhum item na fila{filaStatus ? ` com status "${filaStatus}"` : ''}.</p>
          ) : (
            <>
              <div className="dpex-table-wrap">
                <table className="dpex-table">
                  <thead>
                    <tr>
                      <th>Destinatário</th>
                      <th>Status</th>
                      <th>Tentativas</th>
                      <th>Previsto</th>
                      <th>Enviado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fila.itens.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="dpex-table__name">{item.destinatario_nome || '—'}</span>
                          {item.telefone_mascarado && (
                            <span className="dpex-table__sub">{item.telefone_mascarado}</span>
                          )}
                        </td>
                        <td>
                          <span className={`dpex-fila-status dpex-fila-status--${item.status}`}>
                            {item.status}
                          </span>
                        </td>
                        <td>{item.tentativas ?? 0}/{item.max_tentativas ?? '—'}</td>
                        <td>{fmtDateTime(item.proxima_tentativa_em || item.planejado_para)}</td>
                        <td>{fmtDateTime(item.enviado_em)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {fila.total_pages > 1 && (
                <div className="dp-pagination dpex-pagination">
                  <span className="dp-pagination__info">
                    {fila.total} itens · página {fila.page} de {fila.total_pages}
                  </span>
                  <div className="dp-pagination__btns">
                    <button
                      type="button"
                      className="dp-pagination__btn"
                      disabled={filaPage <= 1 || refreshing}
                      onClick={() => setFilaPage((p) => p - 1)}
                    >
                      <IconChevronLeft size={15} />
                    </button>
                    <button
                      type="button"
                      className="dp-pagination__btn"
                      disabled={filaPage >= fila.total_pages || refreshing}
                      onClick={() => setFilaPage((p) => p + 1)}
                    >
                      <IconChevronRight size={15} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Eventos */}
        <section className="dpex-section dpex-section--eventos">
          <h2 className="dpex-section__title">Eventos recentes</h2>
          {eventos.length === 0 ? (
            <p className="dpex-empty">Nenhum evento registrado.</p>
          ) : (
            <ul className="dpex-eventos">
              {eventos.map((ev) => (
                <li key={ev.id} className="dpex-evento">
                  <span className="dpex-evento__time" title={fmtDateTime(ev.criado_em)}>
                    {fmtRelative(ev.criado_em)}
                  </span>
                  <span className="dpex-evento__text">{eventoResumo(ev)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Exclusões */}
      <section className="dpex-section dpex-exclusoes">
        <button
          type="button"
          className="dpex-exclusoes__toggle"
          onClick={() => setExclusoesOpen((o) => !o)}
          aria-expanded={exclusoesOpen}
        >
          <IconUserOff size={16} />
          <span>Lista de exclusão ({exclusoes.total})</span>
          {exclusoesOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </button>

        {exclusoesOpen && (
          <div className="dpex-exclusoes__body">
            <form className="dpex-excl-form" onSubmit={handleAddExclusao}>
              <input
                type="text"
                className="dpex-input"
                placeholder="Telefone"
                value={exclTelefone}
                onChange={(e) => setExclTelefone(e.target.value)}
              />
              <input
                type="text"
                className="dpex-input"
                placeholder="Motivo (opcional)"
                value={exclMotivo}
                onChange={(e) => setExclMotivo(e.target.value)}
              />
              <button type="submit" className="disparo-btn-primary" disabled={exclLoading}>
                Adicionar
              </button>
            </form>

            <div className="dpex-excl-search">
              <input
                type="search"
                className="dpex-input"
                placeholder="Buscar telefone…"
                value={exclSearch}
                onChange={(e) => setExclSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); carregarExclusoes(e.target.value) } }}
              />
              <button type="button" className="disparo-btn-secondary" onClick={() => carregarExclusoes()} disabled={exclLoading}>
                Buscar
              </button>
            </div>

            <div className="dpex-excl-import">
              <textarea
                className="dpex-textarea"
                rows={3}
                placeholder="Importar telefones (um por linha)"
                value={exclImportTexto}
                onChange={(e) => setExclImportTexto(e.target.value)}
              />
              <button
                type="button"
                className="disparo-btn-secondary"
                onClick={handleImportarExclusoes}
                disabled={exclLoading || !exclImportTexto.trim()}
              >
                Importar lote
              </button>
            </div>

            {exclusoes.itens.length === 0 ? (
              <p className="dpex-empty">Nenhuma exclusão ativa.</p>
            ) : (
              <ul className="dpex-excl-list">
                {exclusoes.itens.map((ex) => (
                  <li key={ex.id} className="dpex-excl-item">
                    <div>
                      <span className="dpex-excl-item__tel">{ex.telefone_original || ex.telefone_normalizado}</span>
                      {ex.motivo && <span className="dpex-excl-item__motivo">{ex.motivo}</span>}
                    </div>
                    <button
                      type="button"
                      className="dpex-excl-item__remove"
                      onClick={() => handleRemoverExclusao(ex.id)}
                      disabled={exclLoading}
                      title="Remover"
                    >
                      <IconTrash size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      </>
      )}

      {/* Modais */}
      {showPausar && (
        <Modal onClose={() => setShowPausar(false)}>
          <h3 className="dpex-modal__title">Pausar execução</h3>
          <p className="dpex-modal__desc">Informe um motivo opcional para a pausa.</p>
          <textarea
            className="dpex-textarea"
            rows={3}
            value={pausaMotivo}
            onChange={(e) => setPausaMotivo(e.target.value)}
            placeholder="Motivo da pausa…"
          />
          <div className="dpex-modal__actions">
            <button type="button" className="disparo-btn-secondary" onClick={() => setShowPausar(false)}>
              Voltar
            </button>
            <button
              type="button"
              className="disparo-btn-primary"
              onClick={handlePausar}
              disabled={acaoLoading === 'pausar'}
            >
              {acaoLoading === 'pausar' ? 'Pausando…' : 'Confirmar pausa'}
            </button>
          </div>
        </Modal>
      )}

      {showCancelar && (
        <Modal onClose={() => setShowCancelar(false)}>
          <h3 className="dpex-modal__title">Cancelar campanha</h3>
          <p className="dpex-modal__desc">Confirma cancelar? Itens pendentes serão cancelados.</p>
          <div className="dpex-modal__actions">
            <button type="button" className="disparo-btn-secondary" onClick={() => setShowCancelar(false)}>
              Não
            </button>
            <button
              type="button"
              className="dpex-btn-danger"
              onClick={handleCancelar}
              disabled={acaoLoading === 'cancelar'}
            >
              {acaoLoading === 'cancelar' ? 'Cancelando…' : 'Sim, cancelar'}
            </button>
          </div>
        </Modal>
      )}

      {showEmergencia && (
        <Modal onClose={() => setShowEmergencia(false)} className="dpex-modal--danger">
          <h3 className="dpex-modal__title">Parada de emergência</h3>
          <p className="dpex-modal__desc">
            Interrompe <strong>todas</strong> as execuções ativas da empresa. Digite <code>EMERGENCIA</code> para confirmar.
          </p>
          <input
            type="text"
            className="dpex-input dpex-input--danger"
            value={emergenciaTexto}
            onChange={(e) => setEmergenciaTexto(e.target.value)}
            placeholder="EMERGENCIA"
            autoComplete="off"
          />
          <div className="dpex-modal__actions">
            <button type="button" className="disparo-btn-secondary" onClick={() => setShowEmergencia(false)}>
              Voltar
            </button>
            <button
              type="button"
              className="dpex-btn-emergency"
              onClick={handleEmergencia}
              disabled={emergenciaTexto.trim() !== 'EMERGENCIA' || acaoLoading === 'emergencia'}
            >
              {acaoLoading === 'emergencia' ? 'Acionando…' : 'Confirmar emergência'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
