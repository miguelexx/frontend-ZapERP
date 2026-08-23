import { useCallback, useEffect, useState } from 'react'
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconRefresh,
  IconServer,
  IconWifi,
  IconWifiOff,
  IconX,
} from '@tabler/icons-react'
import {
  atribuirManual,
  confirmarDistribuicao,
  destinatariosNaoAtribuidos,
  disparoApiError,
  listarInstanciasDisponiveis,
  moverDestinatarios,
  previewDistribuicao,
  recalcularDistribuicao,
  removerInstancia,
  resumoInstancias,
  selecionarInstancias,
} from '../api/disparoInstanciasService'

// ── Constantes ────────────────────────────────────────────────────────────────

const MODOS = [
  { id: 'equilibrada', label: 'Equilibrada', desc: 'Divide os destinatários igualmente entre as instâncias (diferença máxima: 1).' },
  { id: 'quantidade', label: 'Por quantidade', desc: 'Você define quantos destinatários cada instância receberá.' },
  { id: 'percentual', label: 'Por percentual', desc: 'Você define o % de cada instância (soma deve ser 100%).' },
  { id: 'manual', label: 'Manual', desc: 'Você atribui cada destinatário individualmente a uma instância.' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = status === 'connected' || status === 'authenticated' || status === 'standby'
    ? { icon: <IconWifi size={11} />, label: 'Conectada', cls: 'inst-badge--ok' }
    : status === 'qr_code' || status === 'qrcode'
      ? { icon: <IconWifiOff size={11} />, label: 'Aguardando QR', cls: 'inst-badge--warn' }
      : status === 'unknown' || !status
        ? { icon: <IconWifiOff size={11} />, label: 'Status a confirmar', cls: 'inst-badge--warn' }
        : { icon: <IconWifiOff size={11} />, label: status ?? 'Desconectada', cls: 'inst-badge--err' }
  return (
    <span className={`inst-badge ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function BarraDistribuicao({ instancias, total }) {
  if (!total || !instancias?.length) return null
  const cores = ['#128c7e', '#25d366', '#34b7f1', '#6b7280', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
  return (
    <div className="inst-barra" title="Distribuição visual" aria-label="Barra de distribuição">
      {instancias.map((inst, i) => {
        const pct = total > 0 ? (inst.quantidade / total * 100) : 0
        return pct > 0 ? (
          <div
            key={inst.instancia_id}
            className="inst-barra__segmento"
            style={{ flex: inst.quantidade, background: cores[i % cores.length], minWidth: 2 }}
            title={`${inst.nome}: ${inst.quantidade} (${pct.toFixed(1)}%)`}
          />
        ) : null
      })}
    </div>
  )
}

function SkeletonRows({ cols, rows = 4 }) {
  return Array.from({ length: rows }).map((_, i) => (
    <tr key={i}>
      {Array.from({ length: cols }).map((_, j) => (
        <td key={j} style={{ padding: '10px 12px' }}>
          <span className="disparo-skeleton" style={{ width: j === 0 ? '35%' : '70%' }} />
        </td>
      ))}
    </tr>
  ))
}

// ── Cards de instância ────────────────────────────────────────────────────────

function InstanciaCard({ inst, selected, onToggle, disabled }) {
  const selecionavel = inst.ativo !== false && (inst.selecionavel !== false)
  const conectada = inst.conectada === true || inst.status === 'connected'
  const jaAtribuidos = inst.destinatarios_atribuidos ?? 0
  const podeClicar = !disabled && selecionavel
  return (
    <label
      className={`inst-card${selected ? ' inst-card--selected' : ''}${!selecionavel ? ' inst-card--unavailable' : ''}${selecionavel && !conectada ? ' inst-card--warn' : ''}`}
      style={{ cursor: podeClicar ? 'pointer' : 'not-allowed' }}
      title={!selecionavel
        ? 'Instância inativa'
        : (!conectada ? 'Pode selecionar — status ainda não confirma conexão. Valide antes do envio.' : undefined)}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => podeClicar && onToggle(inst.id)}
        disabled={!podeClicar}
        aria-label={`Selecionar instância ${inst.nome}`}
        style={{ display: 'none' }}
      />
      <div className="inst-card__icon">
        {selected
          ? <IconCheck size={18} style={{ color: '#fff' }} />
          : <IconServer size={18} style={{ opacity: selecionavel ? 1 : 0.4 }} />
        }
      </div>
      <div className="inst-card__body">
        <span className="inst-card__nome">{inst.nome}</span>
        <span className="inst-card__phone">{inst.display_phone ?? inst.telefone_conectado ?? '—'}</span>
        <StatusBadge status={inst.status} />
        {inst.is_default && (
          <span className="inst-card__default">Padrão do atendimento</span>
        )}
        {selecionavel && !conectada && (
          <span className="inst-card__warn-txt">
            Pode usar no disparo — a conexão será validada no envio
          </span>
        )}
        {selected && jaAtribuidos > 0 && (
          <span className="inst-card__count">{jaAtribuidos} destinatário{jaAtribuidos !== 1 ? 's' : ''}</span>
        )}
      </div>
      {selected && (
        <button
          type="button"
          className="inst-card__remover"
          onClick={e => { e.preventDefault(); onToggle(inst.id) }}
          title="Remover da campanha"
          aria-label="Remover instância"
        ><IconX size={12} /></button>
      )}
    </label>
  )
}

// ── Painel de configuração por modo ──────────────────────────────────────────

function PainelConfiguracao({ modo, instancias, total, config, onChange }) {
  if (modo === 'equilibrada') {
    const base = instancias.length ? Math.floor(total / instancias.length) : 0
    const extras = instancias.length ? total % instancias.length : 0
    return (
      <div className="inst-config-info">
        <p style={{ margin: '0 0 8px', fontSize: 13 }}>
          <strong>{total}</strong> destinatários ÷ <strong>{instancias.length}</strong> instância{instancias.length !== 1 ? 's' : ''} =
          cada instância recebe <strong>{base}{extras > 0 ? ` ou ${base + 1}` : ''}</strong> destinatários.
        </p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ds-text-muted,#64748b)' }}>
          As primeiras {extras} instância{extras !== 1 ? 's' : ''} recebem 1 a mais para que todos sejam atribuídos.
        </p>
      </div>
    )
  }

  if (modo === 'quantidade') {
    const soma = instancias.reduce((s, inst) => s + (Number(config[inst.id]?.quantidade) || 0), 0)
    const diff = soma - total
    return (
      <div>
        <div className="inst-config-grid">
          {instancias.map(inst => (
            <div key={inst.id} className="inst-config-row">
              <label htmlFor={`qtd-${inst.id}`} className="inst-config-row__label">{inst.nome}</label>
              <input
                id={`qtd-${inst.id}`}
                type="number"
                min="0"
                max={total}
                className="inst-config-row__input"
                value={config[inst.id]?.quantidade ?? ''}
                onChange={e => onChange(inst.id, 'quantidade', e.target.value)}
                aria-label={`Quantidade para ${inst.nome}`}
              />
            </div>
          ))}
        </div>
        <p className={`inst-soma${diff !== 0 ? ' inst-soma--erro' : ' inst-soma--ok'}`}>
          Soma: <strong>{soma}</strong> / <strong>{total}</strong>
          {diff > 0 && ` (+${diff} a mais)`}
          {diff < 0 && ` (${Math.abs(diff)} faltando)`}
          {diff === 0 && ' ✓'}
        </p>
      </div>
    )
  }

  if (modo === 'percentual') {
    const soma = instancias.reduce((s, inst) => s + (Number(config[inst.id]?.percentual) || 0), 0)
    const diff = +Math.abs(soma - 100).toFixed(2)
    return (
      <div>
        <div className="inst-config-grid">
          {instancias.map(inst => {
            const pct = Number(config[inst.id]?.percentual) || 0
            const qtdPreview = Math.round(total * pct / 100)
            return (
              <div key={inst.id} className="inst-config-row">
                <label htmlFor={`pct-${inst.id}`} className="inst-config-row__label">{inst.nome}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    id={`pct-${inst.id}`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    className="inst-config-row__input"
                    value={config[inst.id]?.percentual ?? ''}
                    onChange={e => onChange(inst.id, 'percentual', e.target.value)}
                    aria-label={`Percentual para ${inst.nome}`}
                  />
                  <span style={{ fontSize: 11, color: 'var(--ds-text-muted,#64748b)', whiteSpace: 'nowrap' }}>
                    % ≈ {qtdPreview} dest.
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        <p className={`inst-soma${diff > 0.01 ? ' inst-soma--erro' : ' inst-soma--ok'}`}>
          Soma: <strong>{soma.toFixed(2)}%</strong> {diff < 0.01 ? '✓' : `(diferença: ${diff}%)`}
        </p>
      </div>
    )
  }

  // Manual
  return (
    <div className="inst-config-info" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
      <p style={{ margin: 0, fontSize: 13 }}>
        No modo manual, use a seção abaixo para atribuir cada destinatário individualmente a uma instância.
      </p>
    </div>
  )
}

// ── Painel de atribuição manual ───────────────────────────────────────────────

function PainelManual({ campanhaId, instanciasSelecionadas, onAtribuido }) {
  const [dest, setDest] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [instDestino, setInstDestino] = useState('')
  const [atribuindo, setAtribuindo] = useState(false)
  const [error, setError] = useState('')

  const fetch = useCallback(async (p) => {
    setLoading(true); setError('')
    try {
      const r = await destinatariosNaoAtribuidos(campanhaId, { page: p ?? page, limit: 30 })
      setDest(r.destinatarios ?? [])
      setTotal(r.total ?? 0)
    } catch (e) { setError(disparoApiError(e)) } finally { setLoading(false) }
  }, [campanhaId, page])

  useEffect(() => { fetch() }, [page]) // eslint-disable-line

  async function handleAtribuir() {
    if (!instDestino || selected.size === 0) return
    setAtribuindo(true); setError('')
    try {
      await atribuirManual(campanhaId, Array.from(selected), Number(instDestino))
      setSelected(new Set())
      fetch(1); setPage(1)
      onAtribuido?.()
    } catch (e) { setError(disparoApiError(e)) } finally { setAtribuindo(false) }
  }

  const totalPages = Math.max(1, Math.ceil(total / 30))

  return (
    <div className="inst-manual">
      <div className="inst-manual__header">
        <span style={{ fontSize: 13, fontWeight: 600 }}>Destinatários sem instância ({total})</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="inst-select-sm"
            value={instDestino}
            onChange={e => setInstDestino(e.target.value)}
            aria-label="Instância destino"
          >
            <option value="">— Selecione instância —</option>
            {instanciasSelecionadas.map(inst => (
              <option key={inst.id} value={inst.id}>{inst.nome}</option>
            ))}
          </select>
          <button
            className="disparo-btn-primary"
            style={{ padding: '6px 14px', fontSize: 12 }}
            disabled={atribuindo || selected.size === 0 || !instDestino}
            onClick={handleAtribuir}
          >
            {atribuindo ? 'Atribuindo…' : `Atribuir ${selected.size || ''}`}
          </button>
        </div>
      </div>
      {error && <div className="disparo-alert disparo-alert--error">{error}</div>}
      <div className="disparo-list">
        <table className="dw-contacts-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={dest.length > 0 && selected.size === dest.length}
                  onChange={() => setSelected(selected.size === dest.length ? new Set() : new Set(dest.map(d => d.id)))}
                  aria-label="Selecionar todos" />
              </th>
              <th>Nome</th><th>Telefone</th><th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <SkeletonRows cols={4} /> : dest.length === 0
              ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--ds-text-muted,#64748b)' }}>Todos os destinatários estão atribuídos.</td></tr>
              : dest.map(d => (
                <tr key={d.id}>
                  <td><input type="checkbox" checked={selected.has(d.id)} onChange={() => {
                    setSelected(prev => { const n = new Set(prev); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n })
                  }} /></td>
                  <td>{d.nome ?? '—'}</td>
                  <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{d.telefone_normalizado}</td>
                  <td style={{ fontSize: 11 }}>{d.origem === 'contato_salvo' ? 'Contato' : 'Planilha'}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {total > 30 && (
          <div className="disparo-pagination">
            <span className="disparo-pagination__info">Pág. {page}/{totalPages}</span>
            <button className="disparo-pagination__btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
            <button className="disparo-pagination__btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Componente principal: Step 3 ──────────────────────────────────────────────

export default function DisparoInstanciasStep({ campanhaId, totalDestinatarios, onBack, onNext }) {
  const [instancias, setInstancias] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selecionadas, setSelecionadas] = useState(new Set())
  const [modo, setModo] = useState('equilibrada')
  const [config, setConfig] = useState({}) // { [instanciaId]: { quantidade?, percentual? } }
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [resumo, setResumo] = useState(null)
  const [confirmRecalcular, setConfirmRecalcular] = useState(false)
  const [preservar, setPreservar] = useState(false)
  const [refreshManual, setRefreshManual] = useState(0)

  const instSelecionadas = instancias.filter(i => selecionadas.has(i.id))
  const distribuicaoConfirmada = resumo?.distribuicao_confirmada ?? false
  const precisaRevisao = resumo?.distribuicao_revisao ?? false

  // ── Carregamento inicial ──────────────────────────────────────────────────
  const carregarDados = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [dispData, resData] = await Promise.all([
        listarInstanciasDisponiveis(campanhaId),
        resumoInstancias(campanhaId),
      ])
      const lista = dispData.instancias ?? []
      setInstancias(lista)
      let selSet = new Set(lista.filter(i => i.selecionada).map(i => i.id))

      // Se ainda não há instância na campanha, pré-seleciona a padrão do atendimento
      // (ou a única ativa), sem impedir escolher outras depois.
      if (selSet.size === 0) {
        const candidata = lista.find(i => i.is_default && i.ativo !== false)
          || (lista.filter(i => i.ativo !== false).length === 1
            ? lista.find(i => i.ativo !== false)
            : null)
        if (candidata?.id) {
          try {
            await selecionarInstancias(campanhaId, [candidata.id])
            selSet = new Set([candidata.id])
            setInstancias(prev => prev.map(i => (
              i.id === candidata.id ? { ...i, selecionada: true } : i
            )))
          } catch (_) { /* usuário pode selecionar manualmente */ }
        }
      }

      setSelecionadas(selSet)
      setResumo(resData)
      if (resData.distribuicao_modo) setModo(resData.distribuicao_modo)
    } catch (e) { setError(disparoApiError(e)) } finally { setLoading(false) }
  }, [campanhaId])

  useEffect(() => { carregarDados() }, [carregarDados])

  // ── Toggle instância ──────────────────────────────────────────────────────
  async function toggleInstancia(id) {
    const isSelected = selecionadas.has(id)
    setError('')
    try {
      if (isSelected) {
        await removerInstancia(campanhaId, id)
        setSelecionadas(prev => { const n = new Set(prev); n.delete(id); return n })
      } else {
        await selecionarInstancias(campanhaId, [id])
        setSelecionadas(prev => new Set([...prev, id]))
      }
      setPreview(null)
      const resData = await resumoInstancias(campanhaId)
      setResumo(resData)
    } catch (e) { setError(disparoApiError(e)); carregarDados() }
  }

  // ── Configuração por instância ────────────────────────────────────────────
  function handleConfigChange(instId, campo, valor) {
    setConfig(prev => ({
      ...prev,
      [instId]: { ...(prev[instId] ?? {}), [campo]: valor },
    }))
    setPreview(null)
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  async function handlePreview() {
    if (!instSelecionadas.length) { setError('Selecione ao menos uma instância.'); return }
    setPreviewLoading(true); setError('')
    try {
      const configuracoes = instSelecionadas.map(inst => ({
        instancia_id: inst.id,
        quantidade: Number(config[inst.id]?.quantidade) || 0,
        percentual: Number(config[inst.id]?.percentual) || 0,
      }))
      const res = await previewDistribuicao(campanhaId, { modo, configuracoes, preservar_existentes: preservar })
      setPreview(res)
    } catch (e) { setError(disparoApiError(e)) } finally { setPreviewLoading(false) }
  }

  // ── Confirmar ─────────────────────────────────────────────────────────────
  async function handleConfirmar() {
    if (!preview || preview.erros?.length) { setError('Corrija os erros antes de confirmar.'); return }
    setConfirmando(true); setError('')
    try {
      const configuracoes = instSelecionadas.map(inst => ({
        instancia_id: inst.id,
        quantidade: Number(config[inst.id]?.quantidade) || 0,
        percentual: Number(config[inst.id]?.percentual) || 0,
      }))
      await confirmarDistribuicao(campanhaId, { modo, configuracoes, preservar_existentes: preservar })
      await carregarDados()
      setPreview(null)
    } catch (e) { setError(disparoApiError(e)) } finally { setConfirmando(false) }
  }

  // ── Recalcular ────────────────────────────────────────────────────────────
  async function handleRecalcular() {
    setError('')
    try {
      await recalcularDistribuicao(campanhaId)
      await carregarDados()
      setPreview(null); setConfirmRecalcular(false)
    } catch (e) { setError(disparoApiError(e)) }
  }

  // ── Pode avançar? ─────────────────────────────────────────────────────────
  // Pode avançar com distribuição confirmada; conexão é revalidada no envio/revisão.
  const podeAvancar = distribuicaoConfirmada && !precisaRevisao &&
    (resumo?.sem_instancia ?? 0) === 0 &&
    instSelecionadas.length > 0

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ds-text-muted,#64748b)' }}>Carregando instâncias…</div>
  }

  return (
    <div>
      {error && <div className="disparo-alert disparo-alert--error">{error}</div>}

      {/* Alerta de revisão necessária */}
      {precisaRevisao && (
        <div className="disparo-alert" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 14 }}>
          <IconAlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Destinatários foram adicionados ou removidos após a última distribuição. Revise e confirme novamente antes de avançar.
        </div>
      )}

      {/* ── Seção 1: Cards de instâncias ─────────────────────────── */}
      <h4 className="inst-section-title">1. Selecione as instâncias</h4>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ds-text-muted,#64748b)', lineHeight: 1.45 }}>
        Você pode usar a <strong>mesma instância do atendimento</strong> (já pré-selecionada quando houver uma padrão).
        Se quiser, marque outras instâncias ativas para distribuir o envio.
      </p>
      {instancias.length === 0
        ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ds-text-muted,#64748b)' }}>
            <IconServer size={36} style={{ opacity: .3, display: 'block', margin: '0 auto 10px' }} />
            <p style={{ margin: 0, fontWeight: 600 }}>Nenhuma instância configurada para esta empresa.</p>
            <p style={{ margin: '4px 0 0', fontSize: 12 }}>Configure instâncias WhatsApp em Configurações para prosseguir.</p>
          </div>
        )
        : (
          <div className="inst-cards-grid">
            {instancias.map(inst => (
              <InstanciaCard
                key={inst.id}
                inst={inst}
                selected={selecionadas.has(inst.id)}
                onToggle={toggleInstancia}
                disabled={loading}
              />
            ))}
          </div>
        )
      }

      {instSelecionadas.length > 0 && (
        <>
          {/* ── Seção 2: Modo de distribuição ────────────────────── */}
          <h4 className="inst-section-title" style={{ marginTop: 24 }}>2. Modo de distribuição</h4>
          <div className="inst-modos">
            {MODOS.map(m => (
              <label key={m.id} className={`inst-modo${modo === m.id ? ' inst-modo--active' : ''}`}>
                <input type="radio" name="modo" value={m.id} checked={modo === m.id}
                  onChange={() => { setModo(m.id); setPreview(null) }}
                  style={{ display: 'none' }} />
                <strong>{m.label}</strong>
                <span className="inst-modo__desc">{m.desc}</span>
              </label>
            ))}
          </div>

          {/* ── Seção 3: Configuração específica do modo ──────────── */}
          <div style={{ marginTop: 16 }}>
            <PainelConfiguracao
              modo={modo}
              instancias={instSelecionadas}
              total={totalDestinatarios}
              config={config}
              onChange={handleConfigChange}
            />
          </div>

          {/* Opção preservar existentes (se já confirmado) */}
          {distribuicaoConfirmada && (
            <label className="dw-lgpd" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={preservar} onChange={e => { setPreservar(e.target.checked); setPreview(null) }} />
              <span>Preservar atribuições existentes e distribuir apenas os destinatários sem instância.</span>
            </label>
          )}

          {/* ── Botão Preview ─────────────────────────────────────── */}
          <div style={{ marginTop: 14 }}>
            <button
              className="disparo-btn-secondary"
              onClick={handlePreview}
              disabled={previewLoading || instSelecionadas.length === 0}
            >
              {previewLoading ? 'Calculando…' : <><IconChevronDown size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Ver prévia da distribuição</>}
            </button>
          </div>

          {/* ── Prévia da distribuição ───────────────────────────── */}
          {preview && (
            <div className="inst-preview" style={{ marginTop: 14 }}>
              <h4 className="inst-section-title" style={{ marginTop: 0 }}>Prévia da distribuição</h4>
              {preview.erros?.length > 0 && (
                <div className="disparo-alert disparo-alert--error">
                  {preview.erros.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
              {preview.avisos?.length > 0 && !preview.erros?.length && (
                <div className="disparo-alert" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
                  {preview.avisos.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
              <div className="dw-stats-bar" style={{ marginBottom: 10 }}>
                <span className="dw-stats-bar__item">Total: <strong>{preview.plano?.total ?? 0}</strong></span>
                <span className="dw-stats-bar__item dw-stats-bar__item--ok">Atribuídos: <strong>{preview.plano?.atribuidos ?? 0}</strong></span>
                {(preview.plano?.nao_atribuidos ?? 0) > 0 && (
                  <span className="dw-stats-bar__item dw-stats-bar__item--error">Sem instância: <strong>{preview.plano.nao_atribuidos}</strong></span>
                )}
              </div>
              <BarraDistribuicao instancias={preview.plano?.instancias ?? []} total={preview.plano?.total ?? 0} />
              <table className="dw-contacts-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Instância</th><th>Status</th><th>Destinatários</th><th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.plano?.instancias ?? []).map(inst => (
                    <tr key={inst.instancia_id}>
                      <td style={{ fontWeight: 500 }}>{inst.nome}</td>
                      <td><StatusBadge status={inst.status} /></td>
                      <td><strong>{inst.quantidade}</strong></td>
                      <td>{inst.percentual.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!preview.erros?.length && (preview.plano?.nao_atribuidos ?? 0) === 0 && modo !== 'manual' && (
                <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="disparo-btn-primary" onClick={handleConfirmar} disabled={confirmando}>
                    {confirmando ? 'Confirmando…' : '✓ Confirmar distribuição'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Confirmada — exibe resumo ────────────────────────── */}
          {distribuicaoConfirmada && resumo && (
            <div className="inst-resumo-confirmado" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span className="inst-badge inst-badge--ok" style={{ fontSize: 12 }}>
                  <IconCheck size={12} /> Distribuição confirmada
                </span>
                {!confirmRecalcular
                  ? (
                    <button className="disparo-btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}
                      onClick={() => setConfirmRecalcular(true)}>
                      <IconRefresh size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      Recalcular
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                      <span style={{ color: '#dc2626' }}>As atribuições atuais serão substituídas.</span>
                      <button className="disparo-btn-secondary" style={{ fontSize: 12, padding: '5px 10px', color: '#dc2626' }} onClick={handleRecalcular}>Confirmar</button>
                      <button className="disparo-btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setConfirmRecalcular(false)}>Cancelar</button>
                    </div>
                  )
                }
              </div>
              <BarraDistribuicao instancias={resumo.instancias ?? []} total={resumo.total_destinatarios ?? 0} />
              <div className="dw-stats-bar" style={{ marginTop: 8 }}>
                <span className="dw-stats-bar__item">Total: <strong>{resumo.total_destinatarios}</strong></span>
                {resumo.sem_instancia > 0 && (
                  <span className="dw-stats-bar__item dw-stats-bar__item--error">Sem instância: <strong>{resumo.sem_instancia}</strong></span>
                )}
              </div>
            </div>
          )}

          {/* ── Atribuição manual ────────────────────────────────── */}
          {modo === 'manual' && (
            <div style={{ marginTop: 20 }}>
              <h4 className="inst-section-title">Atribuição manual</h4>
              <PainelManual
                campanhaId={campanhaId}
                instanciasSelecionadas={instSelecionadas}
                onAtribuido={() => { setRefreshManual(r => r + 1); carregarDados() }}
              />
            </div>
          )}
        </>
      )}

      {/* ── Rodapé ───────────────────────────────────────────────── */}
      <div className="dw-footer">
        <div className="dw-footer__left">
          <button className="disparo-btn-secondary" onClick={onBack}>← Destinatários</button>
        </div>
        <div className="dw-footer__right">
          <button
            className="disparo-btn-primary"
            disabled={!podeAvancar}
            onClick={onNext}
            title={!podeAvancar ? 'Confirme a distribuição antes de continuar.' : undefined}
          >
            Mensagens →
          </button>
        </div>
      </div>
      {!podeAvancar && distribuicaoConfirmada && (resumo?.sem_instancia ?? 0) > 0 && (
        <p style={{ fontSize: 12, color: '#dc2626', textAlign: 'right', marginTop: 4 }}>
          <IconAlertTriangle size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Existem {resumo.sem_instancia} destinatário{resumo.sem_instancia !== 1 ? 's' : ''} sem instância atribuída.
        </p>
      )}
      {!podeAvancar && !distribuicaoConfirmada && instSelecionadas.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--ds-text-muted,#64748b)', textAlign: 'right', marginTop: 4 }}>
          Calcule a prévia e confirme a distribuição para avançar.
        </p>
      )}
    </div>
  )
}
