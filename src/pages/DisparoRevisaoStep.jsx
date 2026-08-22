import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardCheck,
  IconClock,
  IconDeviceMobile,
  IconDownload,
  IconEye,
  IconHistory,
  IconLock,
  IconMessage2,
  IconPlayerPlay,
  IconShieldCheck,
  IconSpeakerphone,
  IconUsers,
  IconX,
} from '@tabler/icons-react'
import {
  confirmarCampanha,
  disparoApiError,
  exportarResumo,
  historicoRevisoes,
  obterRevisao,
  previaDestinatarios,
  validarRevisao,
  voltarEdicao,
} from '../api/disparoRevisaoService'
import './disparoExecucao.css'

const EXEC_ACCESS_STATUSES = new Set([
  'pronta', 'agendada', 'em_execucao', 'pausada', 'concluida', 'cancelada',
])

// ── Constantes ────────────────────────────────────────────────────────────────

const ETAPA_TO_STEP = {
  info: 0,
  destinatarios: 1,
  instancias: 2,
  mensagens: 3,
  limites: 4,
  revisao: 5,
}

const PREVIA_LIMIT = 20

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtIsoLocal(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function hashCurto(hash) {
  if (!hash) return '—'
  const s = String(hash)
  return s.length <= 10 ? s : `${s.slice(0, 8)}…`
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  downloadBlob(blob, filename)
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function RevisaoSkeleton() {
  return (
    <div className="rev-root">
      <div className="rev-skeleton rev-skeleton--banner" />
      <div className="rev-cards rev-cards--skeleton">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rev-skeleton rev-skeleton--card" />
        ))}
      </div>
      <div className="rev-skeleton rev-skeleton--section" />
      <div className="rev-skeleton rev-skeleton--section" />
    </div>
  )
}

function ResumoCard({ icon: Icon, titulo, children, className }) {
  return (
    <div className={`rev-card${className ? ` ${className}` : ''}`}>
      <div className="rev-card__head">
        <Icon size={17} aria-hidden />
        <span>{titulo}</span>
      </div>
      <div className="rev-card__body">{children}</div>
    </div>
  )
}

function ChecklistGrupo({ titulo, itens, severidade, onCorrigir }) {
  if (!itens?.length) return null
  return (
    <div className={`rev-checklist__grupo rev-checklist__grupo--${severidade}`}>
      <h3 className="rev-checklist__grupo-titulo">{titulo}</h3>
      <ul className="rev-checklist__lista">
        {itens.map((item) => (
          <li key={item.codigo} className={`rev-checklist__item rev-checklist__item--${severidade}`}>
            <div className="rev-checklist__item-main">
              <strong>{item.titulo}</strong>
              <p>{item.detalhe}</p>
              {item.como_corrigir && (
                <span className="rev-checklist__hint">{item.como_corrigir}</span>
              )}
            </div>
            {item.etapa && item.etapa !== 'revisao' && onCorrigir && (
              <button
                type="button"
                className="rev-btn-corrigir"
                onClick={() => onCorrigir(item.etapa)}
              >
                Corrigir
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SimulacaoTimeline({ previsao, simulacao }) {
  const resumo = previsao || simulacao?.resumo
  if (!resumo && !simulacao?.instancias?.length) return null

  return (
    <div className="rev-timeline">
      {resumo && (
        <div className="rev-timeline__grid">
          <div className="rev-timeline__cell">
            <span>Início previsto</span>
            <strong>{resumo.inicio_previsto_local || fmtIsoLocal(resumo.inicio_previsto)}</strong>
          </div>
          <div className="rev-timeline__cell">
            <span>Conclusão aprox.</span>
            <strong>{resumo.conclusao_aproximada_local || fmtIsoLocal(resumo.conclusao_aproximada)}</strong>
          </div>
          <div className="rev-timeline__cell">
            <span>Duração</span>
            <strong>{resumo.duracao_total_horas != null ? `${resumo.duracao_total_horas} h` : '—'}</strong>
          </div>
          <div className="rev-timeline__cell">
            <span>Destinatários</span>
            <strong>{resumo.total_destinatarios ?? '—'}</strong>
          </div>
        </div>
      )}
      {(simulacao?.instancias || []).length > 0 && (
        <div className="rev-timeline__instancias">
          <p className="rev-timeline__sub">Por instância</p>
          {simulacao.instancias.map((inst) => (
            <div key={inst.instancia_id} className="rev-timeline__linha">
              <span>{inst.nome}</span>
              <span>{inst.quantidade} msgs</span>
              <span>{inst.duracao_horas} h</span>
              <span>{fmtIsoLocal(inst.inicio)} → {fmtIsoLocal(inst.fim)}</span>
            </div>
          ))}
        </div>
      )}
      {resumo?.disclaimer && (
        <p className="rev-disclaimer">{resumo.disclaimer}</p>
      )}
    </div>
  )
}

function PreviaBubble({ item }) {
  const texto = item.tipo_mensagem === 'texto'
    ? item.mensagem_final
    : item.legenda_final || item.mensagem_final

  return (
    <div className="rev-previa-item">
      <div className="rev-previa-item__meta">
        <strong>{item.nome || 'Sem nome'}</strong>
        <span>{item.telefone_mascarado}</span>
        {item.instancia_nome && <span>{item.instancia_nome}</span>}
        {item.variacao_nome && <span>{item.variacao_nome}</span>}
      </div>
      <div className="rev-previa-bubble">
        {item.tipo_mensagem !== 'texto' && item.midia && (
          <div className="rev-previa-bubble__midia">
            {item.tipo_mensagem === 'imagem' && item.midia.url_relativa && (
              <img src={item.midia.url_relativa} alt="" />
            )}
            <span className="rev-previa-bubble__tipo">{item.tipo_mensagem}</span>
            {item.midia.nome && <span className="rev-previa-bubble__arquivo">{item.midia.nome}</span>}
          </div>
        )}
        <p>{texto || '(sem conteúdo)'}</p>
        <span className="rev-previa-bubble__hora">
          <IconClock size={11} />
          {fmtIsoLocal(item.horario_estimado)}
        </span>
      </div>
      <p className="rev-previa-item__note">Prévia — nenhuma mensagem será enviada nesta etapa.</p>
    </div>
  )
}

function ConfirmarModal({
  campanha,
  revisao,
  avisos,
  confirmacaoTexto,
  onConfirmacaoChange,
  onClose,
  onConfirm,
  confirming,
  erro,
}) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !confirming) onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, confirming])

  const totalDest = revisao?.destinatarios?.total ?? 0
  const instCount = revisao?.instancias?.length ?? 0
  const inicio = revisao?.inicio

  return (
    <div
      className="rev-modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && !confirming) onClose() }}
    >
      <div className="rev-modal">
        <div className="rev-modal__header">
          <div className="rev-modal__icon">
            <IconShieldCheck size={22} />
          </div>
          <div>
            <h2 className="rev-modal__title">Confirmar campanha</h2>
            <p className="rev-modal__sub">Revise os dados antes de congelar a configuração.</p>
          </div>
          <button type="button" className="rev-modal__close" onClick={onClose} disabled={confirming} aria-label="Fechar">
            <IconX size={16} />
          </button>
        </div>

        <div className="rev-modal__body">
          {erro && <div className="disparo-alert disparo-alert--error">{erro}</div>}

          <dl className="rev-modal__resumo">
            <div><dt>Campanha</dt><dd>{campanha?.nome}</dd></div>
            <div><dt>Destinatários</dt><dd>{totalDest}</dd></div>
            <div><dt>Instâncias</dt><dd>{instCount}</dd></div>
            <div>
              <dt>Início</dt>
              <dd>
                {inicio?.modo === 'agendado'
                  ? `Agendado: ${fmtIsoLocal(inicio.agendado_para)} (${inicio.fuso || 'UTC'})`
                  : 'Imediato após execução (Etapa 7)'}
              </dd>
            </div>
          </dl>

          {avisos?.length > 0 && (
            <div className="rev-modal__avisos">
              <strong>Avisos pendentes de ciência:</strong>
              <ul>
                {avisos.map((a) => (
                  <li key={a.codigo}>{a.titulo}: {a.detalhe}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rev-field">
            <label htmlFor="rev-confirm-text">
              Digite <strong>{campanha?.nome}</strong> ou <strong>CONFIRMAR</strong> para confirmar
            </label>
            <input
              id="rev-confirm-text"
              type="text"
              className="rev-input"
              value={confirmacaoTexto}
              onChange={(e) => onConfirmacaoChange(e.target.value)}
              disabled={confirming}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="rev-modal__footer">
          <button type="button" className="disparo-btn-secondary" onClick={onClose} disabled={confirming}>
            Cancelar
          </button>
          <button
            type="button"
            className="disparo-btn-primary"
            onClick={onConfirm}
            disabled={confirming || !confirmacaoTexto.trim()}
          >
            {confirming ? 'Confirmando…' : 'Confirmar campanha'}
          </button>
        </div>
      </div>
    </div>
  )
}

function VoltarEdicaoDialog({ onCancel, onConfirm, loading }) {
  return (
    <div className="rev-modal-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel() }}>
      <div className="rev-modal rev-modal--sm">
        <div className="rev-modal__header">
          <div className="rev-modal__icon rev-modal__icon--warn">
            <IconAlertTriangle size={20} />
          </div>
          <div>
            <h2 className="rev-modal__title">Voltar para edição?</h2>
            <p className="rev-modal__sub">
              A confirmação será invalidada. Instâncias, mensagens e limites precisarão ser revisados novamente.
            </p>
          </div>
        </div>
        <div className="rev-modal__footer">
          <button type="button" className="disparo-btn-secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="rev-btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Processando…' : 'Sim, voltar para edição'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function DisparoRevisaoStep({ campanha, onCampanhaUpdate, onBack, onGoToStep }) {
  const campanhaId = campanha?.id

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [revisao, setRevisao] = useState(null)
  const [historico, setHistorico] = useState([])

  const [autorizacaoAceita, setAutorizacaoAceita] = useState(false)
  const [cienciaAvisos, setCienciaAvisos] = useState(false)
  const [checklistValidacao, setChecklistValidacao] = useState(null)

  const [previa, setPrevia] = useState(null)
  const [previaLoading, setPreviaLoading] = useState(false)
  const [previaPage, setPreviaPage] = useState(1)
  const [filtroInstancia, setFiltroInstancia] = useState('')
  const [filtroVariacao, setFiltroVariacao] = useState('')

  const [exportando, setExportando] = useState('')
  const [voltandoEdicao, setVoltandoEdicao] = useState(false)
  const [showVoltarDialog, setShowVoltarDialog] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmacaoTexto, setConfirmacaoTexto] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [confirmErro, setConfirmErro] = useState('')

  const checklist = checklistValidacao?.checklist ?? revisao?.checklist
  const bloqueado = revisao?.bloqueado === true
  const podeVoltarEdicao = revisao?.pode_voltar_edicao === true
  const temAvisos = (checklist?.avisos?.length ?? 0) > 0
  const temBloqueios = (checklist?.bloqueios?.length ?? 0) > 0

  const opcoesInstancias = useMemo(
    () => (revisao?.instancias || []).map((i) => ({ value: i.instancia_id, label: i.nome })),
    [revisao?.instancias],
  )

  const opcoesVariacoes = useMemo(
    () => (revisao?.mensagens || []).map((v) => ({ value: v.id, label: v.nome })),
    [revisao?.mensagens],
  )

  const carregarRevisao = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const [rev, hist] = await Promise.all([
        obterRevisao(campanhaId),
        historicoRevisoes(campanhaId),
      ])
      setRevisao(rev)
      setHistorico(hist?.revisoes || [])
      setAutorizacaoAceita(Boolean(rev?.campanha?.autorizacao_aceita_em))
    } catch (err) {
      setErro(disparoApiError(err))
    } finally {
      setLoading(false)
    }
  }, [campanhaId])

  const carregarPrevia = useCallback(async (page = previaPage) => {
    setPreviaLoading(true)
    try {
      const params = { page, limit: PREVIA_LIMIT }
      if (filtroInstancia) params.instancia_id = Number(filtroInstancia)
      if (filtroVariacao) params.variacao_id = Number(filtroVariacao)
      const data = await previaDestinatarios(campanhaId, params)
      setPrevia(data)
    } catch (err) {
      setErro(disparoApiError(err))
    } finally {
      setPreviaLoading(false)
    }
  }, [campanhaId, filtroInstancia, filtroVariacao, previaPage])

  useEffect(() => { carregarRevisao() }, [carregarRevisao])

  useEffect(() => {
    if (!loading && revisao) carregarPrevia(previaPage)
  }, [loading, revisao, previaPage, filtroInstancia, filtroVariacao, carregarPrevia])

  useEffect(() => {
    if (!revisao || bloqueado) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await validarRevisao(campanhaId, { autorizacao_aceita: autorizacaoAceita })
        if (!cancelled) setChecklistValidacao(data)
      } catch {
        /* silencioso — checklist base permanece */
      }
    })()
    return () => { cancelled = true }
  }, [autorizacaoAceita, campanhaId, revisao, bloqueado])

  function handleCorrigir(etapa) {
    const step = ETAPA_TO_STEP[etapa]
    if (step != null) onGoToStep?.(step)
  }

  function handleFiltroInstancia(value) {
    setFiltroInstancia(value)
    setPreviaPage(1)
  }

  function handleFiltroVariacao(value) {
    setFiltroVariacao(value)
    setPreviaPage(1)
  }

  async function handleExportar(format) {
    setExportando(format)
    setErro('')
    try {
      if (format === 'csv') {
        const blob = await exportarResumo(campanhaId, 'csv')
        downloadBlob(blob, `disparo-revisao-${campanhaId}.csv`)
      } else {
        const json = await exportarResumo(campanhaId, 'json')
        downloadJson(json, `disparo-revisao-${campanhaId}.json`)
      }
      setSucesso(`Resumo exportado (${format.toUpperCase()}).`)
      setTimeout(() => setSucesso(''), 3000)
    } catch (err) {
      setErro(disparoApiError(err))
    } finally {
      setExportando('')
    }
  }

  async function handleVoltarEdicao() {
    setVoltandoEdicao(true)
    setErro('')
    try {
      const result = await voltarEdicao(campanhaId, { confirmacao: true })
      setShowVoltarDialog(false)
      setSucesso(result.mensagem || 'Campanha retornou para edição.')
      onCampanhaUpdate?.({ ...campanha, status: result.status || 'configurando' })
      await carregarRevisao()
    } catch (err) {
      setErro(disparoApiError(err))
    } finally {
      setVoltandoEdicao(false)
    }
  }

  function abrirConfirmModal() {
    setConfirmacaoTexto('')
    setConfirmErro('')
    setShowConfirmModal(true)
  }

  async function handleConfirmarCampanha() {
    if (confirmando) return
    setConfirmando(true)
    setConfirmErro('')
    try {
      const result = await confirmarCampanha(campanhaId, {
        autorizacao_aceita: true,
        ciencia_avisos: temAvisos ? cienciaAvisos : true,
        confirmacao_texto: confirmacaoTexto.trim(),
      })
      setShowConfirmModal(false)
      const novoStatus = result.status || 'pronta'
      setSucesso(
        result.idempotente
          ? 'Campanha já estava confirmada com a mesma configuração.'
          : `Campanha confirmada! Status: ${novoStatus === 'agendada' ? 'Agendada' : 'Pronta'}.`,
      )
      onCampanhaUpdate?.({
        ...campanha,
        status: novoStatus,
        versao_atual: result.versao,
        config_hash: result.hash,
      })
      await carregarRevisao()
    } catch (err) {
      setConfirmErro(disparoApiError(err))
    } finally {
      setConfirmando(false)
    }
  }

  const podeConfirmar =
    !bloqueado &&
    !temBloqueios &&
    autorizacaoAceita &&
    (!temAvisos || cienciaAvisos)

  const conflitos = revisao?.planejamento?.conflitos?.conflitos || []

  if (loading) return <RevisaoSkeleton />

  return (
    <div className="rev-root">
      {erro && <div className="disparo-alert disparo-alert--error">{erro}</div>}
      {sucesso && (
        <div className="disparo-alert rev-alert--success">
          <div className="dpex-revisao-cta">
            <span>{sucesso}</span>
            {EXEC_ACCESS_STATUSES.has(campanha?.status) && (
              <Link
                to={`/disparo/campanhas/${campanhaId}/execucao`}
                className="dpex-revisao-cta__link"
              >
                <IconPlayerPlay size={14} />
                Ir para execução
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Banner congelada vs editável */}
      <div className={`rev-banner${bloqueado ? ' rev-banner--frozen' : ' rev-banner--editable'}`}>
        {bloqueado ? (
          <>
            <IconLock size={18} />
            <div>
              <strong>Campanha congelada</strong>
              <p>
                Status: {revisao?.campanha?.status === 'agendada' ? 'Agendada' : 'Pronta'}.
                {revisao?.campanha?.confirmada_em && (
                  <> Confirmada em {fmtIsoLocal(revisao.campanha.confirmada_em)}.</>
                )}
                {' '}Nenhum envio ocorre nesta etapa.
              </p>
              {EXEC_ACCESS_STATUSES.has(campanha?.status) && (
                <p style={{ marginTop: 8 }}>
                  <Link
                    to={`/disparo/campanhas/${campanhaId}/execucao`}
                    className="dpex-revisao-cta__link"
                  >
                    <IconPlayerPlay size={14} />
                    Ir para execução
                  </Link>
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <IconClipboardCheck size={18} />
            <div>
              <strong>Revisão final — editável</strong>
              <p>Confira todos os dados, aceite a declaração e confirme para congelar a configuração. Sem envio nesta etapa.</p>
            </div>
          </>
        )}
      </div>

      {/* Cards resumo */}
      <div className="rev-cards">
        <ResumoCard icon={IconSpeakerphone} titulo="Campanha">
          <p className="rev-card__valor">{revisao?.campanha?.nome}</p>
          <p className="rev-card__meta">v{revisao?.campanha?.versao_atual ?? 0} · hash {hashCurto(revisao?.campanha?.config_hash)}</p>
          {revisao?.campanha?.criador && (
            <p className="rev-card__meta">Criador: {revisao.campanha.criador}</p>
          )}
        </ResumoCard>

        <ResumoCard icon={IconUsers} titulo="Destinatários">
          <p className="rev-card__valor">{revisao?.destinatarios?.total ?? 0}</p>
          <p className="rev-card__meta">
            {revisao?.destinatarios?.contato_salvo ?? 0} contatos ·{' '}
            {revisao?.destinatarios?.importacao ?? 0} importados ·{' '}
            {revisao?.destinatarios?.manuais ?? 0} manuais
          </p>
        </ResumoCard>

        <ResumoCard icon={IconDeviceMobile} titulo="Instâncias">
          <ul className="rev-card__lista">
            {(revisao?.instancias || []).map((inst) => (
              <li key={inst.instancia_id}>
                <span>{inst.nome}</span>
                <span>{inst.destinatarios} dest.</span>
                <span className={`rev-badge rev-badge--${inst.conectada ? 'ok' : 'err'}`}>
                  {inst.status || (inst.conectada ? 'connected' : 'offline')}
                </span>
              </li>
            ))}
          </ul>
        </ResumoCard>

        <ResumoCard icon={IconMessage2} titulo="Mensagens">
          <ul className="rev-card__lista">
            {(revisao?.mensagens || []).slice(0, 4).map((msg) => (
              <li key={msg.id}>
                <span>{msg.nome}</span>
                <span>{msg.quantidade_destinatarios} dest.</span>
                <span className="rev-badge">{msg.tipo_mensagem}</span>
              </li>
            ))}
            {(revisao?.mensagens?.length ?? 0) > 4 && (
              <li className="rev-card__more">+{(revisao.mensagens.length - 4)} variações</li>
            )}
          </ul>
        </ResumoCard>

        <ResumoCard icon={IconClock} titulo="Planejamento" className="rev-card--wide">
          <p className="rev-card__meta">
            Início: {revisao?.inicio?.modo === 'agendado'
              ? fmtIsoLocal(revisao.inicio.agendado_para)
              : 'Imediato (após execução)'}
            {' · '}Fuso: {revisao?.inicio?.fuso || revisao?.planejamento?.fuso || '—'}
          </p>
          {(revisao?.planejamento?.janelas_globais || []).length > 0 && (
            <div className="rev-janelas">
              {(revisao.planejamento.janelas_globais || [])
                .filter((j) => j.ativo !== false)
                .slice(0, 7)
                .map((j, idx) => (
                  <span key={idx} className="rev-janela-chip">
                    {DIAS[j.dia_semana] ?? j.dia_semana} {String(j.hora_inicio).slice(0, 5)}–{String(j.hora_fim).slice(0, 5)}
                  </span>
                ))}
            </div>
          )}
        </ResumoCard>
      </div>

      {/* Checklist */}
      <section className="rev-section">
        <div className="rev-section__header">
          <IconClipboardCheck size={18} />
          <div>
            <h2 className="rev-section__title">Checklist de validação</h2>
            <p className="rev-section__sub">
              {checklist?.ok
                ? 'Todos os requisitos atendidos.'
                : `${checklist?.totais?.bloqueios ?? 0} bloqueio(s), ${checklist?.totais?.avisos ?? 0} aviso(s).`}
            </p>
          </div>
          {checklist?.totais && (
            <div className="rev-checklist__totais">
              <span className="rev-total rev-total--ok">{checklist.totais.aprovados} ok</span>
              <span className="rev-total rev-total--warn">{checklist.totais.avisos} avisos</span>
              <span className="rev-total rev-total--err">{checklist.totais.bloqueios} bloqueios</span>
            </div>
          )}
        </div>

        <div className="rev-checklist">
          <ChecklistGrupo
            titulo="Bloqueios"
            severidade="bloqueio"
            itens={checklist?.bloqueios}
            onCorrigir={handleCorrigir}
          />
          <ChecklistGrupo
            titulo="Avisos"
            severidade="aviso"
            itens={checklist?.avisos}
            onCorrigir={handleCorrigir}
          />
          <ChecklistGrupo
            titulo="Aprovados"
            severidade="aprovado"
            itens={checklist?.aprovados}
          />
        </div>
      </section>

      {/* Prévia destinatários */}
      <section className="rev-section">
        <div className="rev-section__header rev-section__header--row">
          <div className="rev-section__header">
            <IconEye size={18} />
            <div>
              <h2 className="rev-section__title">Prévia de mensagens</h2>
              <p className="rev-section__sub">Telefones mascarados — sem envio real</p>
            </div>
          </div>
          <div className="rev-previa-filtros">
            <select
              className="rev-select"
              value={filtroInstancia}
              onChange={(e) => handleFiltroInstancia(e.target.value)}
            >
              <option value="">Todas instâncias</option>
              {opcoesInstancias.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              className="rev-select"
              value={filtroVariacao}
              onChange={(e) => handleFiltroVariacao(e.target.value)}
            >
              <option value="">Todas variações</option>
              {opcoesVariacoes.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {previaLoading ? (
          <div className="rev-previa-loading">Carregando prévia…</div>
        ) : (
          <>
            <div className="rev-previa-lista">
              {(previa?.itens || []).length === 0 ? (
                <p className="rev-empty">Nenhum destinatário encontrado com os filtros atuais.</p>
              ) : (
                previa.itens.map((item) => <PreviaBubble key={item.id} item={item} />)
              )}
            </div>

            {(previa?.total_pages ?? 0) > 1 && (
              <div className="rev-previa-pag">
                <span>
                  Página {previa.page} de {previa.total_pages} · {previa.total} destinatários
                </span>
                <div className="rev-previa-pag__btns">
                  <button
                    type="button"
                    className="rev-btn-ghost"
                    disabled={previaPage <= 1 || previaLoading}
                    onClick={() => setPreviaPage((p) => Math.max(1, p - 1))}
                  >
                    <IconChevronLeft size={14} /> Anterior
                  </button>
                  <button
                    type="button"
                    className="rev-btn-ghost"
                    disabled={previaPage >= previa.total_pages || previaLoading}
                    onClick={() => setPreviaPage((p) => p + 1)}
                  >
                    Próximo <IconChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Simulação / timeline */}
      {(revisao?.previsao || revisao?.planejamento?.simulacao) && (
        <section className="rev-section">
          <div className="rev-section__header">
            <IconClock size={18} />
            <div>
              <h2 className="rev-section__title">Simulação e timeline</h2>
              <p className="rev-section__sub">Estimativa com base nos limites configurados</p>
            </div>
          </div>
          <SimulacaoTimeline
            previsao={revisao.previsao}
            simulacao={revisao.planejamento?.simulacao}
          />
        </section>
      )}

      {/* Conflitos */}
      {conflitos.length > 0 && (
        <section className="rev-section rev-section--warn">
          <div className="rev-section__header">
            <IconAlertTriangle size={18} />
            <div>
              <h2 className="rev-section__title">Conflitos detectados</h2>
              <p className="rev-section__sub">Outras campanhas usando as mesmas instâncias</p>
            </div>
          </div>
          <ul className="rev-conflitos">
            {conflitos.map((c, i) => (
              <li key={i} className={`rev-conflito rev-conflito--${c.tipo}`}>
                <strong>{c.campanha_nome}</strong>
                <span>Instância #{c.instancia_id}</span>
                <span className="rev-badge rev-badge--warn">{String(c.tipo).replace('_', ' ')}</span>
                {c.agendado_para && <span>{fmtIsoLocal(c.agendado_para)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Declarações */}
      {!bloqueado && (
        <section className="rev-section rev-section--decl">
          <label className="rev-check">
            <input
              type="checkbox"
              checked={autorizacaoAceita}
              onChange={(e) => setAutorizacaoAceita(e.target.checked)}
            />
            <span>{revisao?.declaracao_texto || 'Declaração de autorização.'}</span>
          </label>

          {temAvisos && (
            <label className="rev-check rev-check--warn">
              <input
                type="checkbox"
                checked={cienciaAvisos}
                onChange={(e) => setCienciaAvisos(e.target.checked)}
              />
              <span>Declaro ciência dos avisos listados acima e assumo a responsabilidade pelos riscos indicados.</span>
            </label>
          )}
        </section>
      )}

      {/* Histórico */}
      <section className="rev-section">
        <div className="rev-section__header rev-section__header--row">
          <div className="rev-section__header">
            <IconHistory size={18} />
            <div>
              <h2 className="rev-section__title">Histórico de revisões</h2>
              <p className="rev-section__sub">Versões confirmadas anteriormente</p>
            </div>
          </div>
          <div className="rev-export-btns">
            <button
              type="button"
              className="rev-btn-ghost"
              onClick={() => handleExportar('json')}
              disabled={!!exportando}
            >
              <IconDownload size={14} />
              {exportando === 'json' ? 'Exportando…' : 'JSON'}
            </button>
            <button
              type="button"
              className="rev-btn-ghost"
              onClick={() => handleExportar('csv')}
              disabled={!!exportando}
            >
              <IconDownload size={14} />
              {exportando === 'csv' ? 'Exportando…' : 'CSV'}
            </button>
          </div>
        </div>

        {historico.length === 0 ? (
          <p className="rev-empty">Nenhuma revisão confirmada ainda.</p>
        ) : (
          <div className="rev-historico-wrap">
            <table className="rev-historico">
              <thead>
                <tr>
                  <th>Versão</th>
                  <th>Data</th>
                  <th>Usuário</th>
                  <th>Hash</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((rev) => (
                  <tr key={rev.id}>
                    <td>v{rev.versao}</td>
                    <td>{fmtIsoLocal(rev.confirmado_em || rev.criado_em)}</td>
                    <td title={rev.confirmado_por || ''}>
                      {rev.confirmado_por ? hashCurto(rev.confirmado_por) : '—'}
                    </td>
                    <td><code>{hashCurto(rev.hash)}</code></td>
                    <td>
                      <span className={`rev-badge rev-badge--${rev.status === 'ativa' ? 'ok' : 'muted'}`}>
                        {rev.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="dw-footer rev-footer">
        <div className="dw-footer__left">
          <button type="button" className="disparo-btn-secondary" onClick={onBack}>
            <IconArrowLeft size={14} /> Voltar
          </button>
        </div>
        <div className="rev-footer__center">
          {temBloqueios && !bloqueado && (
            <span className="rev-footer__hint">Corrija os bloqueios antes de confirmar.</span>
          )}
        </div>
        <div className="dw-footer__right">
          {podeVoltarEdicao && (
            <button
              type="button"
              className="rev-btn-ghost rev-btn-ghost--warn"
              onClick={() => setShowVoltarDialog(true)}
              disabled={voltandoEdicao}
            >
              Voltar para edição
            </button>
          )}
          {!bloqueado && (
            <button
              type="button"
              className="disparo-btn-primary"
              onClick={abrirConfirmModal}
              disabled={!podeConfirmar}
              title={
                !autorizacaoAceita
                  ? 'Aceite a declaração de autorização'
                  : temAvisos && !cienciaAvisos
                    ? 'Marque ciência dos avisos'
                    : temBloqueios
                      ? 'Existem bloqueios pendentes'
                      : 'Confirmar campanha'
              }
            >
              <IconCheck size={14} />
              Confirmar campanha
            </button>
          )}
        </div>
      </footer>

      {showVoltarDialog && (
        <VoltarEdicaoDialog
          onCancel={() => setShowVoltarDialog(false)}
          onConfirm={handleVoltarEdicao}
          loading={voltandoEdicao}
        />
      )}

      {showConfirmModal && (
        <ConfirmarModal
          campanha={campanha}
          revisao={revisao}
          avisos={checklist?.avisos}
          confirmacaoTexto={confirmacaoTexto}
          onConfirmacaoChange={setConfirmacaoTexto}
          onClose={() => !confirmando && setShowConfirmModal(false)}
          onConfirm={handleConfirmarCampanha}
          confirming={confirmando}
          erro={confirmErro}
        />
      )}
    </div>
  )
}
