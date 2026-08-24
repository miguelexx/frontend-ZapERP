import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  IconArrowLeft,
  IconCheck,
  IconChecks,
  IconDeviceMobile,
  IconInfoCircle,
  IconMessage2,
  IconPlayerPlay,
  IconSpeakerphone,
  IconUsers,
  IconWaveSawTool,
} from '@tabler/icons-react'
import { disparoApiError, editarCampanha, obterCampanha } from '../api/disparoService'
import DisparoDestinatariosStep from './DisparoDestinatariosStep'
import DisparoInstanciasStep from './DisparoInstanciasStep'
import DisparoLimitesStep from './DisparoLimitesStep'
import DisparoMensagensStep from './DisparoMensagensStep'
import DisparoRevisaoStep from './DisparoRevisaoStep'
import './disparo.css'
import './disparoWizard.css'
import './disparoExecucao.css'

const EXEC_ACCESS_STATUSES = new Set([
  'pronta', 'agendada', 'em_execucao', 'pausada', 'concluida', 'cancelada',
])

// ── Wizard steps config ───────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { label: 'Informações', hint: 'Identidade', id: 'info', icon: IconInfoCircle },
  { label: 'Destinatários', hint: 'Audiência', id: 'destinatarios', icon: IconUsers },
  { label: 'Instâncias', hint: 'Canais', id: 'instancias', icon: IconDeviceMobile },
  { label: 'Mensagens', hint: 'Conteúdo', id: 'mensagens', icon: IconMessage2 },
  { label: 'Limites', hint: 'Ritmo', id: 'limites', icon: IconWaveSawTool },
  { label: 'Revisão', hint: 'Publicação', id: 'revisao', icon: IconChecks },
]

// ── Step 1: Informações ───────────────────────────────────────────────────────

function InfoStep({ campanha, onSaved, onNext }) {
  const [nome, setNome] = useState(campanha?.nome ?? '')
  const [descricao, setDescricao] = useState(campanha?.descricao ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    setNome(campanha?.nome ?? '')
    setDescricao(campanha?.descricao ?? '')
  }, [campanha?.id])

  const canEdit = campanha?.status === 'rascunho' || campanha?.status === 'configurando'

  async function handleSave(e) {
    e.preventDefault()
    const nomeTrimmed = nome.trim()
    if (!nomeTrimmed) { setError('O nome é obrigatório.'); return }
    setSaving(true); setError(''); setSuccess(false)
    try {
      const updated = await editarCampanha(campanha.id, { nome: nomeTrimmed, descricao: descricao.trim() })
      onSaved?.(updated)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      setError(disparoApiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dw-info-step">
      <div className="dw-step-intro">
        <span className="dw-step-intro__index">01</span>
        <div>
          <p className="dw-step-intro__eyebrow">Identidade da campanha</p>
          <h2 className="dw-step-intro__title">Comece com o essencial</h2>
          <p className="dw-step-intro__desc">Dê um nome claro para sua equipe e registre o objetivo deste disparo.</p>
        </div>
      </div>
      {error && <div className="disparo-alert disparo-alert--error">{error}</div>}
      {success && (
        <div className="rev-alert--success" style={{ marginBottom: 12 }}>
          Informações salvas com sucesso.
        </div>
      )}

      <form onSubmit={handleSave} noValidate>
        <div className="disparo-field">
          <label htmlFor="wiz-nome">Nome da campanha *</label>
          <input
            id="wiz-nome"
            type="text"
            maxLength={180}
            value={nome}
            onChange={e => setNome(e.target.value)}
            disabled={saving || !canEdit}
            placeholder="Ex: Promoção de outubro"
          />
        </div>
        <div className="disparo-field">
          <label htmlFor="wiz-desc">Descrição (opcional)</label>
          <textarea
            id="wiz-desc"
            rows={3}
            maxLength={5000}
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            disabled={saving || !canEdit}
            placeholder="Objetivo desta campanha…"
          />
        </div>

        <div className="dw-footer">
          <div className="dw-footer__left">
            {canEdit && (
              <button type="submit" className="disparo-btn-secondary" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar rascunho'}
              </button>
            )}
          </div>
          <div className="dw-footer__right">
            <button
              type="button"
              className="disparo-btn-primary"
              onClick={onNext}
            >
              Destinatários →
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// ── Step locked ───────────────────────────────────────────────────────────────

function LockedStep({ label, message }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ds-text-muted,#64748b)' }}>
      <div style={{ fontSize: 40, opacity: .3, marginBottom: 12 }}>🔒</div>
      <p style={{ fontWeight: 600, color: 'var(--ds-text,#111b21)', margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: 13, margin: 0 }}>{message ?? 'Esta etapa estará disponível após completar as anteriores.'}</p>
    </div>
  )
}

// ── Página do Wizard ──────────────────────────────────────────────────────────

export default function DisparoWizardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const campanhaId = Number(id)

  const [campanha, setCampanha] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeStep, setActiveStep] = useState(0)

  const fetchCampanha = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await obterCampanha(campanhaId)
      setCampanha(data)
    } catch (err) {
      setError(disparoApiError(err))
    } finally {
      setLoading(false)
    }
  }, [campanhaId])

  useEffect(() => { fetchCampanha() }, [fetchCampanha])

  const STATUS_LABEL = {
    rascunho: 'Rascunho', configurando: 'Configurando', pronta: 'Pronta', agendada: 'Agendada',
    em_execucao: 'Em execução', pausada: 'Pausada', concluida: 'Concluída',
    cancelada: 'Cancelada', arquivada: 'Arquivada',
  }

  if (loading) {
    return (
      <div className="dw-page">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--ds-text-muted,#64748b)' }}>
          Carregando…
        </div>
      </div>
    )
  }

  if (error || !campanha) {
    return (
      <div className="dw-page">
        <div className="disparo-alert disparo-alert--error">{error || 'Campanha não encontrada.'}</div>
        <button className="disparo-btn-secondary" onClick={() => navigate('/disparo')}>← Voltar às campanhas</button>
      </div>
    )
  }

  return (
    <div className="dw-page">
      {/* Voltar */}
      <button className="dw-back" onClick={() => navigate('/disparo')}>
        <IconArrowLeft size={14} /> Campanhas
      </button>

      {/* Cabeçalho da campanha */}
      <div className="dw-campaign-header">
        <div className="dw-campaign-header__icon">
          <IconSpeakerphone size={24} aria-hidden />
        </div>
        <div className="dw-campaign-header__copy">
          <div className="dw-campaign-header__eyebrow">Editor de campanha</div>
          <h1 className="dw-campaign-header__name">{campanha.nome}</h1>
          {campanha.descricao && <p className="dw-campaign-header__desc">{campanha.descricao}</p>}
        </div>
        <div className="dw-campaign-header__meta">
          <span className="dw-campaign-header__progress">Etapa {activeStep + 1} de {WIZARD_STEPS.length}</span>
          <span className={`disparo-status disparo-status--${campanha.status}`}>
            {STATUS_LABEL[campanha.status] ?? campanha.status}
          </span>
        </div>
      </div>

      {/* Banner execução */}
      {EXEC_ACCESS_STATUSES.has(campanha.status) && (
        <div className="dpex-wizard-banner">
          <span>
            Esta campanha está em fase operacional ({STATUS_LABEL[campanha.status] ?? campanha.status}).
            Acompanhe o progresso, fila e eventos em tempo real.
          </span>
          <Link to={`/disparo/campanhas/${campanhaId}/execucao`} className="dpex-wizard-banner__link">
            <IconPlayerPlay size={14} />
            Ir para execução
          </Link>
        </div>
      )}

      {/* Steps */}
      <div className="dw-steps" role="tablist" aria-label="Etapas da campanha">
        {WIZARD_STEPS.map((step, idx) => {
          const StepIcon = step.icon
          const isActive = idx === activeStep
          const isDone = idx < activeStep
          const isLocked = step.locked
          return (
            <div
              key={step.id}
              className={`dw-step${isActive ? ' dw-step--active' : isDone ? ' dw-step--done' : isLocked ? ' dw-step--locked' : ''}`}
              role="tab"
              aria-selected={isActive}
            >
              <div className="dw-step__circle">
                {isDone ? <IconCheck size={15} stroke={2.5} /> : <StepIcon size={15} stroke={1.9} />}
              </div>
              <span className="dw-step__copy">
                <span className="dw-step__label">{step.label}</span>
                <span className="dw-step__hint">{step.hint}</span>
              </span>
            </div>
          )
        })}
      </div>

      {/* Conteúdo do step */}
      <div className="dw-content">
        {activeStep === 0 && (
          <InfoStep
            campanha={campanha}
            onSaved={updated => setCampanha(updated)}
            onNext={() => setActiveStep(1)}
          />
        )}
        {activeStep === 1 && (
          <DisparoDestinatariosStep
            campanhaId={campanhaId}
            onBack={() => setActiveStep(0)}
            onNext={() => setActiveStep(2)}
          />
        )}
        {activeStep === 2 && (
          <DisparoInstanciasStep
            campanhaId={campanhaId}
            totalDestinatarios={campanha?.total_destinatarios ?? 0}
            onBack={() => setActiveStep(1)}
            onNext={() => setActiveStep(3)}
          />
        )}
        {activeStep === 3 && (
          <DisparoMensagensStep
            campanhaId={campanhaId}
            totalDestinatarios={campanha?.total_destinatarios ?? 0}
            onBack={() => setActiveStep(2)}
            onNext={() => setActiveStep(4)}
          />
        )}
        {activeStep === 4 && (
          <DisparoLimitesStep
            campanha={campanha}
            onCampanhaUpdate={updated => setCampanha(updated)}
            onBack={() => setActiveStep(3)}
            onContinue={() => setActiveStep(5)}
          />
        )}
        {activeStep === 5 && (
          <DisparoRevisaoStep
            campanha={campanha}
            onCampanhaUpdate={updated => setCampanha(updated)}
            onBack={() => setActiveStep(4)}
            onGoToStep={setActiveStep}
          />
        )}
      </div>
    </div>
  )
}
