import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconArrowLeft, IconSpeakerphone } from '@tabler/icons-react'
import { disparoApiError, editarCampanha, obterCampanha } from '../api/disparoService'
import DisparoDestinatariosStep from './DisparoDestinatariosStep'
import DisparoInstanciasStep from './DisparoInstanciasStep'
import DisparoLimitesStep from './DisparoLimitesStep'
import DisparoMensagensStep from './DisparoMensagensStep'
import DisparoRevisaoStep from './DisparoRevisaoStep'
import './disparo.css'
import './disparoWizard.css'

// ── Wizard steps config ───────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { label: 'Informações', id: 'info' },
  { label: 'Destinatários', id: 'destinatarios' },
  { label: 'Instâncias', id: 'instancias' },
  { label: 'Mensagens', id: 'mensagens' },
  { label: 'Limites', id: 'limites' },
  { label: 'Revisão', id: 'revisao' },
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
    <div>
      {error && <div className="disparo-alert disparo-alert--error">{error}</div>}
      {success && (
        <div className="disparo-alert" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', marginBottom: 12 }}>
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
        <IconSpeakerphone size={22} style={{ color: 'var(--ds-primary,#128c7e)', flexShrink: 0 }} aria-hidden />
        <div>
          <h1 className="dw-campaign-header__name">{campanha.nome}</h1>
          {campanha.descricao && <p className="dw-campaign-header__desc">{campanha.descricao}</p>}
        </div>
        <span className={`disparo-status disparo-status--${campanha.status}`} style={{ marginLeft: 'auto' }}>
          {STATUS_LABEL[campanha.status] ?? campanha.status}
        </span>
      </div>

      {/* Steps */}
      <div className="dw-steps" role="tablist" aria-label="Etapas da campanha">
        {WIZARD_STEPS.map((step, idx) => {
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
                {isDone ? '✓' : idx + 1}
              </div>
              <span className="dw-step__label">{step.label}</span>
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
