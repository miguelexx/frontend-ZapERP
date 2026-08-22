import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconArchive,
  IconArchiveOff,
  IconEdit,
  IconExternalLink,
  IconSpeakerphone,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconUsers,
  IconDeviceMobile,
  IconMessage2,
  IconCheck,
  IconClock,
  IconPlayerPlay,
  IconAlertCircle,
  IconX,
  IconChevronLeft,
  IconChevronRight,
  IconCalendar,
  IconFilter,
} from '@tabler/icons-react'
import {
  arquivarCampanha,
  criarCampanha,
  disparoApiError,
  editarCampanha,
  listarCampanhas,
  restaurarCampanha,
  resumoCampanhas,
} from '../api/disparoService'
import './disparo.css'

// ── Constantes ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  rascunho:    { label: 'Rascunho',     color: '#64748b', bg: '#f1f5f9', icon: IconEdit },
  configurando:{ label: 'Configurando', color: '#2563eb', bg: '#eff6ff', icon: IconAlertCircle },
  pronta:      { label: 'Pronta',       color: '#0891b2', bg: '#ecfeff', icon: IconCheck },
  agendada:    { label: 'Agendada',     color: '#d97706', bg: '#fffbeb', icon: IconClock },
  em_execucao: { label: 'Em execução',  color: '#059669', bg: '#ecfdf5', icon: IconPlayerPlay },
  pausada:     { label: 'Pausada',      color: '#b45309', bg: '#fef3c7', icon: IconAlertCircle },
  concluida:   { label: 'Concluída',    color: '#16a34a', bg: '#f0fdf4', icon: IconCheck },
  cancelada:   { label: 'Cancelada',    color: '#dc2626', bg: '#fef2f2', icon: IconX },
  arquivada:   { label: 'Arquivada',    color: '#9ca3af', bg: '#f9fafb', icon: IconArchive },
}

const SUMMARY_ITEMS = [
  { key: 'total',       label: 'Total',       color: '#128c7e', icon: IconSpeakerphone },
  { key: 'rascunho',    label: 'Rascunhos',   color: '#64748b', icon: IconEdit },
  { key: 'agendada',    label: 'Agendadas',   color: '#d97706', icon: IconClock },
  { key: 'concluida',   label: 'Concluídas',  color: '#16a34a', icon: IconCheck },
  { key: 'em_execucao', label: 'Em execução', color: '#059669', icon: IconPlayerPlay },
]

const STATUS_FILTERS = [
  { value: '',            label: 'Todas' },
  { value: 'rascunho',    label: 'Rascunho' },
  { value: 'configurando',label: 'Configurando' },
  { value: 'agendada',    label: 'Agendada' },
  { value: 'em_execucao', label: 'Execução' },
  { value: 'concluida',   label: 'Concluída' },
  { value: 'cancelada',   label: 'Cancelada' },
  { value: 'arquivada',   label: 'Arquivada' },
]

const WIZARD_STEPS = [
  'Informações', 'Destinatários', 'Instâncias', 'Mensagens', 'Limites', 'Revisão',
]

const PAGE_LIMIT = 20

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch { return '—' }
}

function formatDateShort(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const hoje = new Date()
    const diff = hoje - d
    if (diff < 60_000) return 'Agora'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min atrás`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h atrás`
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d)
  } catch { return '—' }
}

// ── Componentes auxiliares ───────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#64748b', bg: '#f1f5f9', icon: IconAlertCircle }
  const Icon = cfg.icon
  return (
    <span className="dp-status-badge" style={{ '--sc': cfg.color, '--sb': cfg.bg }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  )
}

function SkeletonCards() {
  return Array.from({ length: 6 }).map((_, i) => (
    <div key={i} className="dp-card dp-card--skeleton">
      <div className="dp-skel dp-skel--title" />
      <div className="dp-skel dp-skel--line" />
      <div className="dp-skel dp-skel--line dp-skel--short" />
    </div>
  ))
}

// ── Dialog base ──────────────────────────────────────────────────────────────

function Modal({ children, onClose }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="dp-overlay" role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dp-modal">{children}</div>
    </div>
  )
}

// ── Dialog: Nova campanha ────────────────────────────────────────────────────

function NovaCampanhaDialog({ onSaved, onClose }) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const nomeRef = useRef(null)

  useEffect(() => { nomeRef.current?.focus() }, [])

  async function handleSave(e) {
    e.preventDefault()
    const n = nome.trim()
    if (!n) { setError('O nome da campanha é obrigatório.'); return }
    try {
      setSaving(true); setError('')
      const nova = await criarCampanha({ nome: n, descricao: descricao.trim() })
      onSaved(nova)
    } catch (err) { setError(disparoApiError(err)) }
    finally { setSaving(false) }
  }

  return (
    <Modal onClose={onClose}>
      {/* Header */}
      <div className="dp-modal__header">
        <div className="dp-modal__icon">
          <IconSpeakerphone size={22} />
        </div>
        <div>
          <p className="dp-modal__title">Nova campanha</p>
          <p className="dp-modal__sub">Preencha as informações básicas para criar o rascunho.</p>
        </div>
        <button className="dp-modal__close" onClick={onClose} aria-label="Fechar">
          <IconX size={16} />
        </button>
      </div>

      {/* Steps */}
      <div className="dp-modal__steps">
        {WIZARD_STEPS.map((s, i) => (
          <div key={s} className={`dp-mstep${i === 0 ? ' is-active' : ' is-locked'}`}>
            <div className="dp-mstep__circle">{i === 0 ? 1 : '🔒'}</div>
            <span className="dp-mstep__label">{s}</span>
          </div>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSave} noValidate className="dp-modal__form">
        {error && (
          <div className="dp-alert">
            <IconAlertCircle size={14} />
            {error}
          </div>
        )}
        <div className="dp-field">
          <label className="dp-field__label" htmlFor="nc-nome">
            Nome da campanha <span className="dp-field__req">*</span>
          </label>
          <input
            id="nc-nome" ref={nomeRef} type="text" maxLength={180}
            placeholder="Ex: Promoção de agosto 2026"
            value={nome} onChange={e => setNome(e.target.value)}
            className={`dp-field__input${!nome.trim() && nome ? ' is-error' : ''}`}
            disabled={saving}
          />
          <p className="dp-field__hint">Este nome aparece internamente — não é exibido aos destinatários.</p>
        </div>
        <div className="dp-field">
          <label className="dp-field__label" htmlFor="nc-desc">Descrição <span className="dp-field__opt">(opcional)</span></label>
          <textarea
            id="nc-desc" rows={3} maxLength={5000}
            placeholder="Descreva o objetivo desta campanha…"
            value={descricao} onChange={e => setDescricao(e.target.value)}
            className="dp-field__input"
            disabled={saving}
          />
        </div>
        <div className="dp-modal__footer">
          <button type="button" className="dp-btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="dp-btn-primary" disabled={saving}>
            {saving ? (
              <><span className="dp-spinner" /> Salvando…</>
            ) : (
              <><IconCheck size={14} /> Criar campanha</>
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Dialog: Editar campanha ──────────────────────────────────────────────────

function EditarCampanhaDialog({ campanha, onSaved, onClose }) {
  const [nome, setNome] = useState(campanha.nome || '')
  const [descricao, setDescricao] = useState(campanha.descricao || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const nomeRef = useRef(null)

  useEffect(() => { nomeRef.current?.focus() }, [])

  async function handleSave(e) {
    e.preventDefault()
    const n = nome.trim()
    if (!n) { setError('O nome é obrigatório.'); return }
    try {
      setSaving(true); setError('')
      const atualizada = await editarCampanha(campanha.id, { nome: n, descricao: descricao.trim() })
      onSaved(atualizada)
    } catch (err) { setError(disparoApiError(err)) }
    finally { setSaving(false) }
  }

  return (
    <Modal onClose={onClose}>
      <div className="dp-modal__header">
        <div className="dp-modal__icon dp-modal__icon--edit"><IconEdit size={20} /></div>
        <div>
          <p className="dp-modal__title">Editar campanha</p>
          <p className="dp-modal__sub">Apenas campanhas em rascunho podem ser renomeadas aqui.</p>
        </div>
        <button className="dp-modal__close" onClick={onClose}><IconX size={16} /></button>
      </div>
      <form onSubmit={handleSave} noValidate className="dp-modal__form">
        {error && <div className="dp-alert"><IconAlertCircle size={14}/>{error}</div>}
        <div className="dp-field">
          <label className="dp-field__label" htmlFor="ec-nome">Nome da campanha <span className="dp-field__req">*</span></label>
          <input id="ec-nome" ref={nomeRef} type="text" maxLength={180} value={nome}
            onChange={e => setNome(e.target.value)} className="dp-field__input" disabled={saving} />
        </div>
        <div className="dp-field">
          <label className="dp-field__label" htmlFor="ec-desc">Descrição <span className="dp-field__opt">(opcional)</span></label>
          <textarea id="ec-desc" rows={3} maxLength={5000} value={descricao}
            onChange={e => setDescricao(e.target.value)} className="dp-field__input" disabled={saving} />
        </div>
        <div className="dp-modal__footer">
          <button type="button" className="dp-btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="dp-btn-primary" disabled={saving}>
            {saving ? <><span className="dp-spinner" />Salvando…</> : <><IconCheck size={14} />Salvar</>}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Dialog: confirmar arquivar ────────────────────────────────────────────────

function ConfirmArquivarDialog({ campanha, onConfirm, onCancel, loading }) {
  return (
    <Modal onClose={onCancel}>
      <div className="dp-modal__header">
        <div className="dp-modal__icon dp-modal__icon--danger"><IconArchive size={20}/></div>
        <div>
          <p className="dp-modal__title">Arquivar campanha</p>
          <p className="dp-modal__sub">Ela ficará oculta mas poderá ser restaurada quando precisar.</p>
        </div>
        <button className="dp-modal__close" onClick={onCancel}><IconX size={16}/></button>
      </div>
      <div className="dp-modal__form">
        <div className="dp-confirm-box">
          <p>Deseja arquivar <strong>"{campanha.nome}"</strong>?</p>
        </div>
        <div className="dp-modal__footer">
          <button className="dp-btn-ghost" onClick={onCancel} disabled={loading}>Cancelar</button>
          <button className="dp-btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <><span className="dp-spinner" />Arquivando…</> : <><IconArchive size={14}/>Arquivar</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Card de campanha ─────────────────────────────────────────────────────────

function CampanhaCard({ campanha, onEditar, onArquivar, onRestaurar, restaurando }) {
  const navigate = useNavigate()
  const cfg = STATUS_CONFIG[campanha.status] ?? STATUS_CONFIG.rascunho
  const podeContinuar = campanha.status === 'rascunho' || campanha.status === 'configurando'

  return (
    <div
      className={`dp-card${podeContinuar ? ' dp-card--clickable' : ''}`}
      onClick={podeContinuar ? () => navigate(`/disparo/campanhas/${campanha.id}`) : undefined}
      role={podeContinuar ? 'button' : undefined}
      tabIndex={podeContinuar ? 0 : undefined}
      onKeyDown={podeContinuar ? e => { if (e.key === 'Enter') navigate(`/disparo/campanhas/${campanha.id}`) } : undefined}
    >
      {/* Acento lateral */}
      <div className="dp-card__accent" style={{ background: cfg.color }} />

      {/* Corpo */}
      <div className="dp-card__body">
        <div className="dp-card__top">
          <div className="dp-card__name-wrap">
            <p className="dp-card__name">{campanha.nome}</p>
            {campanha.descricao && (
              <p className="dp-card__desc">{campanha.descricao}</p>
            )}
          </div>
          <StatusBadge status={campanha.status} />
        </div>

        {/* Barra de progresso para em_execucao */}
        {campanha.status === 'em_execucao' && campanha.total_destinatarios > 0 && (
          <div className="dp-card__progress-wrap">
            <div className="dp-card__progress-bar">
              <div
                className="dp-card__progress-fill"
                style={{
                  width: `${Math.min(100, ((campanha.enviados ?? 0) / campanha.total_destinatarios) * 100)}%`
                }}
              />
            </div>
            <span className="dp-card__progress-label">
              {campanha.enviados ?? 0}/{campanha.total_destinatarios} enviados
            </span>
          </div>
        )}

        {/* Metadados */}
        <div className="dp-card__meta">
          {campanha.total_destinatarios != null && (
            <span className="dp-card__meta-item">
              <IconUsers size={12} />
              {campanha.total_destinatarios} dest.
            </span>
          )}
          {campanha.total_instancias != null && (
            <span className="dp-card__meta-item">
              <IconDeviceMobile size={12} />
              {campanha.total_instancias} inst.
            </span>
          )}
          {campanha.criador?.nome && (
            <span className="dp-card__meta-item">
              <IconMessage2 size={12} />
              {campanha.criador.nome}
            </span>
          )}
          <span className="dp-card__meta-item dp-card__meta-item--date">
            <IconCalendar size={12} />
            {formatDateShort(campanha.atualizado_em || campanha.criado_em)}
          </span>
        </div>
      </div>

      {/* Ações */}
      <div className="dp-card__actions" onClick={e => e.stopPropagation()}>
        {podeContinuar && (
          <button
            className="dp-card__action-btn dp-card__action-btn--primary"
            title="Continuar configurando"
            onClick={() => navigate(`/disparo/campanhas/${campanha.id}`)}
          >
            <IconExternalLink size={14} />
            <span>Abrir</span>
          </button>
        )}
        {campanha.status === 'rascunho' && (
          <button
            className="dp-card__action-btn"
            title="Renomear"
            onClick={() => onEditar(campanha)}
          >
            <IconEdit size={14} />
          </button>
        )}
        {campanha.status !== 'arquivada' && (
          <button
            className="dp-card__action-btn dp-card__action-btn--muted"
            title="Arquivar"
            onClick={() => onArquivar(campanha)}
          >
            <IconArchive size={14} />
          </button>
        )}
        {campanha.status === 'arquivada' && (
          <button
            className="dp-card__action-btn"
            title="Restaurar"
            onClick={() => onRestaurar(campanha)}
            disabled={restaurando}
          >
            <IconArchiveOff size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function DisparoMensagens() {
  const navigate = useNavigate()
  const [campanhas, setCampanhas]       = useState([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')

  const [resumo, setResumo]             = useState(null)
  const [loadingResumo, setLoadingResumo] = useState(false)

  const [search, setSearch]             = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')
  const [orderBy, setOrderBy]           = useState('criado')
  const [order, setOrder]               = useState('desc')

  const [showNova, setShowNova]                 = useState(false)
  const [editando, setEditando]                 = useState(null)
  const [confirmArquivar, setConfirmArquivar]   = useState(null)
  const [arquivando, setArquivando]             = useState(false)
  const [restaurandoId, setRestaurandoId]       = useState(null)

  const debounceRef = useRef(null)

  // ── Carrega ─────────────────────────────────────────────────────────────

  const fetchCampanhas = useCallback(async (opts = {}) => {
    setLoading(true); setError('')
    try {
      const r = await listarCampanhas({
        page: opts.page ?? page, limit: PAGE_LIMIT,
        search: opts.search ?? search,
        status: opts.status ?? statusFiltro,
        orderBy: opts.orderBy ?? orderBy,
        order: opts.order ?? order,
      })
      setCampanhas(r.campanhas || [])
      setTotal(r.total || 0)
    } catch (err) { setError(disparoApiError(err)) }
    finally { setLoading(false) }
  }, [page, search, statusFiltro, orderBy, order])

  const fetchResumo = useCallback(async () => {
    setLoadingResumo(true)
    try { setResumo(await resumoCampanhas()) } catch { /* silencioso */ }
    finally { setLoadingResumo(false) }
  }, [])

  useEffect(() => { fetchCampanhas(); fetchResumo() }, [page, statusFiltro, orderBy, order])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1); fetchCampanhas({ page: 1, search })
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleCampanhaSalva() {
    setShowNova(false); setPage(1)
    fetchCampanhas({ page: 1 }); fetchResumo()
  }
  function handleCampanhaEditada(a) {
    setEditando(null)
    setCampanhas(p => p.map(c => c.id === a.id ? a : c))
  }
  async function handleConfirmArquivar() {
    if (!confirmArquivar) return
    setArquivando(true)
    try {
      const a = await arquivarCampanha(confirmArquivar.id)
      setCampanhas(p => p.map(c => c.id === a.id ? a : c))
      setConfirmArquivar(null); fetchResumo()
    } catch (err) { setError(disparoApiError(err)); setConfirmArquivar(null) }
    finally { setArquivando(false) }
  }
  async function handleRestaurar(campanha) {
    setRestaurandoId(campanha.id)
    try {
      const a = await restaurarCampanha(campanha.id)
      setCampanhas(p => p.map(c => c.id === a.id ? a : c))
      fetchResumo()
    } catch (err) { setError(disparoApiError(err)) }
    finally { setRestaurandoId(null) }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT))
  const temFiltro  = !!search || !!statusFiltro

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="dp-page">

      {/* ── Hero header ──────────────────────────────────── */}
      <div className="dp-hero">
        <div className="dp-hero__left">
          <div className="dp-hero__icon">
            <IconSpeakerphone size={26} />
          </div>
          <div>
            <h1 className="dp-hero__title">Disparo de Mensagens</h1>
            <p className="dp-hero__sub">Crie e gerencie campanhas de envio em massa via WhatsApp</p>
          </div>
        </div>
        <div className="dp-hero__actions">
          <button className="dp-btn-ghost dp-btn-ghost--sm" onClick={() => { fetchCampanhas(); fetchResumo() }} disabled={loading} title="Atualizar">
            <IconRefresh size={15} className={loading ? 'dp-spin' : ''} />
            Atualizar
          </button>
          <button className="dp-btn-primary" onClick={() => setShowNova(true)}>
            <IconPlus size={15} />
            Nova campanha
          </button>
        </div>
      </div>

      {/* ── Erro global ──────────────────────────────────── */}
      {error && (
        <div className="dp-alert dp-alert--global">
          <IconAlertCircle size={15} />
          <span>{error}</span>
          <button className="dp-alert__close" onClick={() => setError('')}><IconX size={13} /></button>
        </div>
      )}

      {/* ── Cards de resumo ──────────────────────────────── */}
      <div className="dp-summary">
        {SUMMARY_ITEMS.map(item => {
          const Icon = item.icon
          return (
            <div
              key={item.key}
              className={`dp-sum-card${statusFiltro === item.key ? ' is-active' : ''}${item.key === 'total' ? ' dp-sum-card--main' : ''}`}
              style={{ '--sc': item.color }}
              onClick={() => {
                if (item.key !== 'total') {
                  setStatusFiltro(p => p === item.key ? '' : item.key)
                  setPage(1)
                }
              }}
            >
              <div className="dp-sum-card__icon">
                <Icon size={18} />
              </div>
              <div className="dp-sum-card__data">
                <span className="dp-sum-card__value">
                  {loadingResumo ? <span className="dp-sum-skel" /> : (resumo?.[item.key] ?? 0)}
                </span>
                <span className="dp-sum-card__label">{item.label}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Filtros ──────────────────────────────────────── */}
      <div className="dp-toolbar">
        {/* Busca */}
        <div className="dp-search-wrap">
          <IconSearch size={14} className="dp-search-wrap__icon" />
          <input
            type="search"
            className="dp-search"
            placeholder="Buscar campanha por nome…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="dp-search-wrap__clear" onClick={() => setSearch('')} title="Limpar">
              <IconX size={12} />
            </button>
          )}
        </div>

        {/* Filtro de status em pills */}
        <div className="dp-pills">
          <span className="dp-pills__label"><IconFilter size={12}/></span>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              className={`dp-pill${statusFiltro === f.value ? ' is-active' : ''}`}
              onClick={() => { setStatusFiltro(f.value); setPage(1) }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Ordenação */}
        <div className="dp-sort-wrap">
          <select className="dp-select" value={`${orderBy}-${order}`} onChange={e => {
            const [ob, od] = e.target.value.split('-')
            setOrderBy(ob); setOrder(od); setPage(1)
          }}>
            <option value="criado-desc">Mais recente</option>
            <option value="criado-asc">Mais antigo</option>
            <option value="atualizado-desc">Atualizado recente</option>
            <option value="atualizado-asc">Atualizado antigo</option>
          </select>
        </div>
      </div>

      {/* ── Grid de campanhas ────────────────────────────── */}
      {!loading && campanhas.length === 0 ? (
        <EmptyState temFiltro={temFiltro} onNova={() => setShowNova(true)} onLimpar={() => { setSearch(''); setStatusFiltro('') }} />
      ) : (
        <>
          <div className="dp-grid">
            {loading ? <SkeletonCards /> : campanhas.map(c => (
              <CampanhaCard
                key={c.id}
                campanha={c}
                onEditar={setEditando}
                onArquivar={setConfirmArquivar}
                onRestaurar={handleRestaurar}
                restaurando={restaurandoId === c.id}
              />
            ))}
          </div>

          {/* Paginação */}
          {total > PAGE_LIMIT && (
            <div className="dp-pagination">
              <span className="dp-pagination__info">
                {total} campanha{total !== 1 ? 's' : ''} · página {page} de {totalPages}
              </span>
              <div className="dp-pagination__btns">
                <button
                  className="dp-pagination__btn"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(p => p - 1)}
                  aria-label="Anterior"
                >
                  <IconChevronLeft size={15} />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = i + 1
                  return (
                    <button
                      key={p}
                      className={`dp-pagination__btn${page === p ? ' is-active' : ''}`}
                      onClick={() => setPage(p)}
                      disabled={loading}
                    >
                      {p}
                    </button>
                  )
                })}
                <button
                  className="dp-pagination__btn"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(p => p + 1)}
                  aria-label="Próxima"
                >
                  <IconChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modais ───────────────────────────────────────── */}
      {showNova && <NovaCampanhaDialog onSaved={handleCampanhaSalva} onClose={() => setShowNova(false)} />}
      {editando && <EditarCampanhaDialog campanha={editando} onSaved={handleCampanhaEditada} onClose={() => setEditando(null)} />}
      {confirmArquivar && (
        <ConfirmArquivarDialog
          campanha={confirmArquivar}
          onConfirm={handleConfirmArquivar}
          onCancel={() => setConfirmArquivar(null)}
          loading={arquivando}
        />
      )}
    </div>
  )
}

// ── Estado vazio ─────────────────────────────────────────────────────────────

function EmptyState({ temFiltro, onNova, onLimpar }) {
  return (
    <div className="dp-empty">
      <div className="dp-empty__art">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden>
          <circle cx="40" cy="40" r="40" fill="#f0fdf9" />
          <rect x="20" y="28" width="40" height="6" rx="3" fill="#a7f3d0" />
          <rect x="20" y="38" width="30" height="4" rx="2" fill="#d1fae5" />
          <rect x="20" y="46" width="24" height="4" rx="2" fill="#d1fae5" />
          <circle cx="58" cy="50" r="12" fill="#128c7e" />
          <path d="M53 50l3 3 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="dp-empty__title">
        {temFiltro ? 'Nenhuma campanha encontrada' : 'Tudo pronto para seu primeiro disparo'}
      </p>
      <p className="dp-empty__desc">
        {temFiltro
          ? 'Tente outros filtros ou limpe a busca para ver todas as campanhas.'
          : 'Crie uma campanha, adicione destinatários, configure as mensagens e dispare via WhatsApp em minutos.'}
      </p>
      <div className="dp-empty__actions">
        {temFiltro
          ? <button className="dp-btn-ghost" onClick={onLimpar}>Limpar filtros</button>
          : <button className="dp-btn-primary" onClick={onNova}><IconPlus size={14}/> Nova campanha</button>
        }
      </div>
    </div>
  )
}
