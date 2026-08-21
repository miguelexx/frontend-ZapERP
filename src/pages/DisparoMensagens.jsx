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

const STATUS_LABEL = {
  rascunho: 'Rascunho',
  configurando: 'Configurando',
  agendada: 'Agendada',
  em_execucao: 'Em execução',
  pausada: 'Pausada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  arquivada: 'Arquivada',
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'configurando', label: 'Configurando' },
  { value: 'agendada', label: 'Agendada' },
  { value: 'em_execucao', label: 'Em execução' },
  { value: 'pausada', label: 'Pausada' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'cancelada', label: 'Cancelada' },
  { value: 'arquivada', label: 'Arquivada' },
]

const WIZARD_STEPS = [
  { label: 'Informações', active: true },
  { label: 'Destinatários', active: false },
  { label: 'Instâncias', active: false },
  { label: 'Mensagens', active: false },
  { label: 'Limites', active: false },
  { label: 'Revisão', active: false },
]

const PAGE_LIMIT = 20

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return '—'
  }
}

// ── Componentes auxiliares ───────────────────────────────────────────────────

function StatusBadge({ status }) {
  return (
    <span className={`disparo-status disparo-status--${status}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function SkeletonRows() {
  return Array.from({ length: 5 }).map((_, i) => (
    <tr key={i} className="disparo-skeleton-row">
      {Array.from({ length: 6 }).map((_, j) => (
        <td key={j}>
          <span className="disparo-skeleton" style={{ width: j === 0 ? '60%' : '80%' }} />
        </td>
      ))}
    </tr>
  ))
}

// ── Dialog: confirmar arquivar ───────────────────────────────────────────────

function ConfirmArquivarDialog({ campanha, onConfirm, onCancel, loading }) {
  return (
    <div className="disparo-overlay" role="dialog" aria-modal="true">
      <div className="disparo-dialog">
        <p className="disparo-dialog__title">Arquivar campanha</p>
        <p className="disparo-dialog__sub">
          Deseja arquivar a campanha <strong>{campanha.nome}</strong>?
          Ela poderá ser restaurada depois.
        </p>
        <div className="disparo-dialog__footer">
          <button className="disparo-btn-secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button className="disparo-btn-primary disparo-btn-primary--danger" onClick={onConfirm} disabled={loading}
            style={{ background: '#dc2626' }}>
            {loading ? 'Arquivando…' : 'Arquivar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dialog: Nova campanha (wizard step 1) ────────────────────────────────────

function NovaCampanhaDialog({ onSaved, onClose }) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const nomeRef = useRef(null)

  useEffect(() => {
    nomeRef.current?.focus()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    const nomeTrimmed = nome.trim()
    if (!nomeTrimmed) {
      setError('O nome da campanha é obrigatório.')
      nomeRef.current?.focus()
      return
    }
    try {
      setSaving(true)
      setError('')
      const nova = await criarCampanha({ nome: nomeTrimmed, descricao: descricao.trim() })
      onSaved(nova)
    } catch (err) {
      setError(disparoApiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="disparo-overlay" role="dialog" aria-modal="true">
      <div className="disparo-dialog">
        {/* Wizard steps */}
        <div className="disparo-wizard-steps" aria-label="Etapas da campanha">
          {WIZARD_STEPS.map((step, idx) => (
            <div
              key={step.label}
              className={`disparo-wizard-step${step.active ? ' disparo-wizard-step--active' : ' disparo-wizard-step--locked'}`}
            >
              <div className="disparo-wizard-step__circle">
                {step.active ? idx + 1 : <span className="disparo-wizard-step__lock">🔒</span>}
              </div>
              <span className="disparo-wizard-step__label">{step.label}</span>
            </div>
          ))}
        </div>

        <p className="disparo-dialog__title">Nova campanha</p>
        <p className="disparo-dialog__sub">
          Preencha as informações básicas. A campanha será salva como rascunho.
        </p>

        {error && <div className="disparo-alert disparo-alert--error">{error}</div>}

        <form onSubmit={handleSave} noValidate>
          <div className="disparo-field">
            <label htmlFor="disparo-nome">
              Nome da campanha <span aria-hidden>*</span>
            </label>
            <input
              id="disparo-nome"
              ref={nomeRef}
              type="text"
              maxLength={180}
              placeholder="Ex: Promoção de agosto"
              value={nome}
              onChange={e => setNome(e.target.value)}
              disabled={saving}
            />
            {!nome.trim() && nome.length > 0 && (
              <span className="disparo-field__error">Campo obrigatório.</span>
            )}
          </div>
          <div className="disparo-field">
            <label htmlFor="disparo-descricao">Descrição (opcional)</label>
            <textarea
              id="disparo-descricao"
              rows={3}
              maxLength={5000}
              placeholder="Descreva o objetivo desta campanha…"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="disparo-dialog__footer">
            <button type="button" className="disparo-btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="disparo-btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar rascunho'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Dialog: Editar campanha ──────────────────────────────────────────────────

function EditarCampanhaDialog({ campanha, onSaved, onClose }) {
  const [nome, setNome] = useState(campanha.nome || '')
  const [descricao, setDescricao] = useState(campanha.descricao || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const nomeRef = useRef(null)

  useEffect(() => {
    nomeRef.current?.focus()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    const nomeTrimmed = nome.trim()
    if (!nomeTrimmed) {
      setError('O nome é obrigatório.')
      nomeRef.current?.focus()
      return
    }
    try {
      setSaving(true)
      setError('')
      const atualizada = await editarCampanha(campanha.id, { nome: nomeTrimmed, descricao: descricao.trim() })
      onSaved(atualizada)
    } catch (err) {
      setError(disparoApiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="disparo-overlay" role="dialog" aria-modal="true">
      <div className="disparo-dialog">
        <p className="disparo-dialog__title">Editar campanha</p>
        <p className="disparo-dialog__sub">Apenas campanhas em rascunho podem ser editadas aqui.</p>
        {error && <div className="disparo-alert disparo-alert--error">{error}</div>}
        <form onSubmit={handleSave} noValidate>
          <div className="disparo-field">
            <label htmlFor="disparo-edit-nome">Nome da campanha <span aria-hidden>*</span></label>
            <input
              id="disparo-edit-nome"
              ref={nomeRef}
              type="text"
              maxLength={180}
              value={nome}
              onChange={e => setNome(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="disparo-field">
            <label htmlFor="disparo-edit-desc">Descrição (opcional)</label>
            <textarea
              id="disparo-edit-desc"
              rows={3}
              maxLength={5000}
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="disparo-dialog__footer">
            <button type="button" className="disparo-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="disparo-btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function DisparoMensagens() {
  const navigate = useNavigate()
  const [campanhas, setCampanhas] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [resumo, setResumo] = useState(null)
  const [loadingResumo, setLoadingResumo] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')
  const [orderBy, setOrderBy] = useState('criado')
  const [order, setOrder] = useState('desc')

  const [showNova, setShowNova] = useState(false)
  const [editando, setEditando] = useState(null)
  const [confirmArquivar, setConfirmArquivar] = useState(null)
  const [arquivando, setArquivando] = useState(false)
  const [restaurandoId, setRestaurandoId] = useState(null)

  const searchRef = useRef(null)
  const debounceRef = useRef(null)

  // ── Carrega campanhas ────────────────────────────────────────────────────

  const fetchCampanhas = useCallback(async (opts = {}) => {
    setLoading(true)
    setError('')
    try {
      const params = {
        page: opts.page ?? page,
        limit: PAGE_LIMIT,
        search: opts.search ?? search,
        status: opts.status ?? statusFiltro,
        orderBy: opts.orderBy ?? orderBy,
        order: opts.order ?? order,
      }
      const result = await listarCampanhas(params)
      setCampanhas(result.campanhas || [])
      setTotal(result.total || 0)
    } catch (err) {
      setError(disparoApiError(err))
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFiltro, orderBy, order])

  const fetchResumo = useCallback(async () => {
    setLoadingResumo(true)
    try {
      const r = await resumoCampanhas()
      setResumo(r)
    } catch {
      // resumo é opcional; ignora silenciosamente
    } finally {
      setLoadingResumo(false)
    }
  }, [])

  useEffect(() => {
    fetchCampanhas()
    fetchResumo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFiltro, orderBy, order])

  // busca com debounce
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      fetchCampanhas({ page: 1, search })
    }, 350)
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleChangeStatus(e) {
    setStatusFiltro(e.target.value)
    setPage(1)
  }

  function handleChangeOrderBy(e) {
    setOrderBy(e.target.value)
    setPage(1)
  }

  function handleChangeOrder(e) {
    setOrder(e.target.value)
    setPage(1)
  }

  function handleCampanhaSalva(nova) {
    setShowNova(false)
    setPage(1)
    fetchCampanhas({ page: 1 })
    fetchResumo()
  }

  function handleCampanhaEditada(atualizada) {
    setEditando(null)
    setCampanhas(prev => prev.map(c => c.id === atualizada.id ? atualizada : c))
  }

  async function handleConfirmArquivar() {
    if (!confirmArquivar) return
    setArquivando(true)
    try {
      const atualizada = await arquivarCampanha(confirmArquivar.id)
      setCampanhas(prev => prev.map(c => c.id === atualizada.id ? atualizada : c))
      setConfirmArquivar(null)
      fetchResumo()
    } catch (err) {
      setError(disparoApiError(err))
      setConfirmArquivar(null)
    } finally {
      setArquivando(false)
    }
  }

  async function handleRestaurar(campanha) {
    setRestaurandoId(campanha.id)
    try {
      const atualizada = await restaurarCampanha(campanha.id)
      setCampanhas(prev => prev.map(c => c.id === atualizada.id ? atualizada : c))
      fetchResumo()
    } catch (err) {
      setError(disparoApiError(err))
    } finally {
      setRestaurandoId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT))

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="disparo-page">

      {/* Cabeçalho */}
      <div className="disparo-header">
        <div>
          <h1 className="disparo-header__title">
            <IconSpeakerphone size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} aria-hidden />
            Disparo de Mensagens
          </h1>
          <p className="disparo-header__desc">
            Crie e gerencie campanhas de disparo em massa para seus contatos via WhatsApp.
          </p>
        </div>
        <button className="disparo-btn-primary" onClick={() => setShowNova(true)}>
          <IconPlus size={16} />
          Nova campanha
        </button>
      </div>

      {/* Erro global */}
      {error && <div className="disparo-alert disparo-alert--error">{error}</div>}

      {/* Cards resumo */}
      <div className="disparo-summary">
        <div className="disparo-summary-card">
          <span className="disparo-summary-card__value">
            {loadingResumo ? '…' : (resumo?.total ?? '—')}
          </span>
          <span className="disparo-summary-card__label">Total</span>
        </div>
        <div className="disparo-summary-card disparo-summary-card--rascunho">
          <span className="disparo-summary-card__value">
            {loadingResumo ? '…' : (resumo?.rascunho ?? '—')}
          </span>
          <span className="disparo-summary-card__label">Rascunhos</span>
        </div>
        <div className="disparo-summary-card disparo-summary-card--agendada">
          <span className="disparo-summary-card__value">
            {loadingResumo ? '…' : (resumo?.agendada ?? '—')}
          </span>
          <span className="disparo-summary-card__label">Agendadas</span>
        </div>
        <div className="disparo-summary-card disparo-summary-card--concluida">
          <span className="disparo-summary-card__value">
            {loadingResumo ? '…' : (resumo?.concluida ?? '—')}
          </span>
          <span className="disparo-summary-card__label">Concluídas</span>
        </div>
        <div className="disparo-summary-card disparo-summary-card--execucao">
          <span className="disparo-summary-card__value">
            {loadingResumo ? '…' : (resumo?.em_execucao ?? '—')}
          </span>
          <span className="disparo-summary-card__label">Em execução</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="disparo-filters">
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
          <IconSearch
            size={15}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ds-text-muted, #94a3b8)', pointerEvents: 'none' }}
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            className="disparo-filters__search"
            style={{ paddingLeft: 32 }}
            placeholder="Buscar por nome…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Buscar campanha por nome"
          />
        </div>

        <select className="disparo-filters__select" value={statusFiltro} onChange={handleChangeStatus} aria-label="Filtrar por status">
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select className="disparo-filters__select" value={orderBy} onChange={handleChangeOrderBy} aria-label="Ordenar por">
          <option value="criado">Ordenar: criação</option>
          <option value="atualizado">Ordenar: atualização</option>
        </select>

        <select className="disparo-filters__select" value={order} onChange={handleChangeOrder} aria-label="Direção da ordenação">
          <option value="desc">Mais recente</option>
          <option value="asc">Mais antigo</option>
        </select>

        <button
          className="disparo-btn-icon"
          onClick={() => fetchCampanhas()}
          title="Atualizar lista"
          aria-label="Atualizar lista"
          disabled={loading}
        >
          <IconRefresh size={16} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {/* Lista */}
      <div className="disparo-list">
        {campanhas.length === 0 && !loading ? (
          <div className="disparo-empty">
            <div className="disparo-empty__icon">
              <IconSpeakerphone size={56} />
            </div>
            <p className="disparo-empty__title">
              {search || statusFiltro ? 'Nenhuma campanha encontrada' : 'Nenhuma campanha criada ainda'}
            </p>
            <p className="disparo-empty__desc">
              {search || statusFiltro
                ? 'Tente outros filtros ou limpe a busca.'
                : 'Clique em "Nova campanha" para começar.'}
            </p>
            {!search && !statusFiltro && (
              <button className="disparo-btn-primary" onClick={() => setShowNova(true)}>
                <IconPlus size={15} /> Nova campanha
              </button>
            )}
          </div>
        ) : (
          <>
            <table className="disparo-list__table" aria-label="Campanhas de disparo">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Status</th>
                  <th>Criador</th>
                  <th>Criado em</th>
                  <th>Atualizado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? <SkeletonRows />
                  : campanhas.map(campanha => (
                    <tr key={campanha.id}>
                      <td style={{ fontWeight: 500 }}>{campanha.nome}</td>
                      <td><StatusBadge status={campanha.status} /></td>
                      <td>{campanha.criador?.nome || '—'}</td>
                      <td>{formatDate(campanha.criado_em)}</td>
                      <td>{formatDate(campanha.atualizado_em)}</td>
                      <td>
                        <div className="disparo-actions">
                          {(campanha.status === 'rascunho' || campanha.status === 'configurando') && (
                            <button
                              className="disparo-btn-icon"
                              title="Abrir wizard de configuração"
                              aria-label={`Configurar campanha ${campanha.nome}`}
                              onClick={() => navigate(`/disparo/campanhas/${campanha.id}`)}
                            >
                              <IconExternalLink size={15} />
                            </button>
                          )}
                          {campanha.status === 'rascunho' && (
                            <button
                              className="disparo-btn-icon"
                              title="Editar nome"
                              aria-label={`Editar campanha ${campanha.nome}`}
                              onClick={() => setEditando(campanha)}
                            >
                              <IconEdit size={15} />
                            </button>
                          )}
                          {campanha.status !== 'arquivada' && (
                            <button
                              className="disparo-btn-icon disparo-btn-icon--danger"
                              title="Arquivar"
                              aria-label={`Arquivar campanha ${campanha.nome}`}
                              onClick={() => setConfirmArquivar(campanha)}
                            >
                              <IconArchive size={15} />
                            </button>
                          )}
                          {campanha.status === 'arquivada' && (
                            <button
                              className="disparo-btn-icon"
                              title="Restaurar"
                              aria-label={`Restaurar campanha ${campanha.nome}`}
                              onClick={() => handleRestaurar(campanha)}
                              disabled={restaurandoId === campanha.id}
                            >
                              <IconArchiveOff size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {/* Paginação */}
            {total > PAGE_LIMIT && (
              <div className="disparo-pagination">
                <span className="disparo-pagination__info">
                  {total} campanha{total !== 1 ? 's' : ''} — página {page} de {totalPages}
                </span>
                <button
                  className="disparo-pagination__btn"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(p => p - 1)}
                  aria-label="Página anterior"
                >
                  ‹ Anterior
                </button>
                <button
                  className="disparo-pagination__btn"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(p => p + 1)}
                  aria-label="Próxima página"
                >
                  Próxima ›
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialogs */}
      {showNova && (
        <NovaCampanhaDialog
          onSaved={handleCampanhaSalva}
          onClose={() => setShowNova(false)}
        />
      )}

      {editando && (
        <EditarCampanhaDialog
          campanha={editando}
          onSaved={handleCampanhaEditada}
          onClose={() => setEditando(null)}
        />
      )}

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
