import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconMessageReply,
  IconRefresh,
  IconRotateClockwise,
  IconUserOff,
} from '@tabler/icons-react'
import {
  decisaoIncerto,
  disparoEtapa8ApiError,
  erros,
  exportRelatorio,
  getRelatorio,
  listIncertos,
  listOptOuts,
  listRespostas,
  metricasInstancias,
  metricasVariacoes,
  reativarOptOut,
  reconciliar,
} from '../../api/disparoEtapa8Service'
import DisparoOptOutConfig from './DisparoOptOutConfig'

const PAGE_LIMIT = 25
const EXPORT_TIPOS = [
  { tipo: 'resumo', label: 'Resumo' },
  { tipo: 'destinatarios', label: 'Destinatários' },
  { tipo: 'falhas', label: 'Falhas' },
  { tipo: 'optouts', label: 'Opt-outs' },
  { tipo: 'eventos', label: 'Eventos' },
]

const DECISAO_OPCOES = [
  { value: 'enviada', label: 'Marcar enviada', desc: 'Confirma que a mensagem foi enviada com sucesso.' },
  { value: 'falhou', label: 'Marcar falha', desc: 'Registra falha definitiva neste item.' },
  { value: 'reatentar', label: 'Reatentar', desc: 'Devolve o item à fila para nova tentativa.' },
  { value: 'manter_incerta', label: 'Manter incerta', desc: 'Mantém o status incerto sem alteração.' },
]

const RELATORIO_CARDS = [
  { key: 'planejado', label: 'Planejado', color: '#64748b' },
  { key: 'processado', label: 'Processado', color: '#0891b2' },
  { key: 'enviadas', label: 'Enviadas', color: '#2563eb' },
  { key: 'entregues', label: 'Entregues', color: '#059669' },
  { key: 'lidas', label: 'Lidas', color: '#7c3aed' },
  { key: 'respondidas', label: 'Respondidas', color: '#128c7e' },
  { key: 'optouts', label: 'Opt-outs', color: '#dc2626' },
  { key: 'falhas', label: 'Falhas', color: '#ef4444' },
  { key: 'incertos', label: 'Incertas', color: '#d97706' },
]

const TAXA_CARDS = [
  { key: 'processamento', label: 'Processamento' },
  { key: 'envio', label: 'Envio' },
  { key: 'entrega', label: 'Entrega' },
  { key: 'leitura', label: 'Leitura' },
  { key: 'resposta', label: 'Resposta' },
  { key: 'falha', label: 'Falha' },
  { key: 'incerteza', label: 'Incerteza' },
]

function fmtDateTime(iso) {
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

function fmtPct(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `${Number(v).toFixed(1)}%`
}

function fmtDuracao(seg) {
  if (seg == null) return '—'
  const s = Number(seg)
  if (!Number.isFinite(s)) return '—'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return r ? `${m}min ${r}s` : `${m}min`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}min`
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function Pagination({ page, totalPages, total, onPrev, onNext, disabled }) {
  if (totalPages <= 1) return null
  return (
    <div className="dp-pagination dpex-pagination">
      <span className="dp-pagination__info">
        {total} itens · página {page} de {totalPages}
      </span>
      <div className="dp-pagination__btns">
        <button type="button" className="dp-pagination__btn" disabled={page <= 1 || disabled} onClick={onPrev}>
          <IconChevronLeft size={15} />
        </button>
        <button type="button" className="dp-pagination__btn" disabled={page >= totalPages || disabled} onClick={onNext}>
          <IconChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}

function BarChart({ items, labelKey, valueKey, maxValue }) {
  if (!items?.length) return <p className="dpex-empty">Sem dados para exibir.</p>
  const max = maxValue ?? Math.max(...items.map((i) => i[valueKey] ?? 0), 1)
  return (
    <div className="dpex8-bars">
      {items.map((item) => {
        const val = item[valueKey] ?? 0
        const pct = max ? Math.round((val / max) * 100) : 0
        const label = item[labelKey] ?? `#${item.instancia_id ?? item.variacao_id ?? '?'}`
        return (
          <div key={item.instancia_id ?? item.variacao_id ?? label} className="dpex8-bar-row">
            <span className="dpex8-bar-row__label" title={label}>{label}</span>
            <div className="dpex8-bar-row__track">
              <div className="dpex8-bar-row__fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="dpex8-bar-row__value">{val}</span>
          </div>
        )
      })}
    </div>
  )
}

function ModalDecisao({ item, onClose, onConfirm, loading }) {
  const [decisao, setDecisao] = useState('enviada')
  const [justificativa, setJustificativa] = useState('')
  const [autorizarRetentativa, setAutorizarRetentativa] = useState(false)

  const opcao = DECISAO_OPCOES.find((o) => o.value === decisao)

  return (
    <div
      className="dp-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="dp-modal dpex-modal">
        <h3 className="dpex-modal__title">Decisão manual — item #{item.id}</h3>
        <p className="dpex-modal__desc">
          Registre a decisão sobre este item incerto. Justificativa obrigatória.
        </p>

        <div className="dpex8-decisao-opcoes">
          {DECISAO_OPCOES.map((o) => (
            <label key={o.value} className={`dpex8-decisao-opt${decisao === o.value ? ' is-active' : ''}`}>
              <input
                type="radio"
                name="decisao"
                value={o.value}
                checked={decisao === o.value}
                onChange={() => setDecisao(o.value)}
              />
              <span className="dpex8-decisao-opt__label">{o.label}</span>
              <span className="dpex8-decisao-opt__desc">{o.desc}</span>
            </label>
          ))}
        </div>

        {decisao === 'reatentar' && (
          <label className="dpex8-check dpex8-check--modal">
            <input
              type="checkbox"
              checked={autorizarRetentativa}
              onChange={(e) => setAutorizarRetentativa(e.target.checked)}
            />
            <span>Autorizar retentativa (mensagem não aceita pelo provedor)</span>
          </label>
        )}

        <textarea
          className="dpex-textarea"
          rows={3}
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Justificativa da decisão…"
          required
        />

        {opcao && (
          <p className="dpex8-decisao-resumo">
            <IconAlertTriangle size={14} />
            {opcao.desc}
          </p>
        )}

        <div className="dpex-modal__actions">
          <button type="button" className="disparo-btn-secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            type="button"
            className="disparo-btn-primary"
            disabled={loading || !justificativa.trim()}
            onClick={() => onConfirm({
              decisao,
              justificativa: justificativa.trim(),
              confirmacao: true,
              autorizarRetentativa: decisao === 'reatentar' ? autorizarRetentativa : undefined,
            })}
          >
            {loading ? 'Registrando…' : 'Confirmar decisão'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalReativar({ telefone, onClose, onConfirm, loading }) {
  const [motivo, setMotivo] = useState('')

  return (
    <div
      className="dp-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="dp-modal dpex-modal">
        <h3 className="dpex-modal__title">Reativar telefone</h3>
        <p className="dpex-modal__desc">
          Remove <strong>{telefone}</strong> da lista de exclusão. Motivo obrigatório.
        </p>
        <textarea
          className="dpex-textarea"
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo da reativação…"
          required
        />
        <div className="dpex-modal__actions">
          <button type="button" className="disparo-btn-secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            type="button"
            className="disparo-btn-primary"
            disabled={loading || !motivo.trim()}
            onClick={() => onConfirm(motivo.trim())}
          >
            {loading ? 'Reativando…' : 'Confirmar reativação'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Painéis ───────────────────────────────────────────────────────────────────

function RelatorioPanel({ campanhaId }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [relatorio, setRelatorio] = useState(null)
  const [instancias, setInstancias] = useState([])
  const [variacoes, setVariacoes] = useState([])
  const [errosList, setErrosList] = useState([])
  const [exportando, setExportando] = useState('')
  const [maskExport, setMaskExport] = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [rel, inst, vari, errRes] = await Promise.all([
        getRelatorio(campanhaId),
        metricasInstancias(campanhaId),
        metricasVariacoes(campanhaId),
        erros(campanhaId),
      ])
      setRelatorio(rel)
      setInstancias(inst?.instancias ?? rel?.instancias ?? [])
      setVariacoes(vari?.variacoes ?? rel?.variacoes ?? [])
      setErrosList(errRes?.erros ?? rel?.erros ?? [])
    } catch (err) {
      setError(disparoEtapa8ApiError(err))
    } finally {
      setLoading(false)
    }
  }, [campanhaId])

  useEffect(() => { carregar() }, [carregar])

  async function handleExport(tipo) {
    setExportando(tipo)
    setError('')
    try {
      const blob = await exportRelatorio(campanhaId, tipo, { mask: maskExport, format: 'csv' })
      downloadBlob(blob, `disparo-${tipo}-${campanhaId}.csv`)
    } catch (err) {
      setError(disparoEtapa8ApiError(err))
    } finally {
      setExportando('')
    }
  }

  if (loading) return <p className="dpex-empty">Carregando relatório…</p>

  const metricas = relatorio?.metricas ?? {}
  const taxas = relatorio?.taxas ?? {}

  const instBars = instancias.map((i) => ({
    ...i,
    _label: i.instancia?.nome ?? `Instância #${i.instancia_id}`,
  }))

  const varBars = variacoes.map((v) => ({
    ...v,
    _label: v.variacao?.nome ?? `Variação #${v.variacao_id}`,
  }))

  return (
    <div className="dpex8-panel">
      {error && <div className="disparo-alert disparo-alert--error">{error}</div>}

      <div className="dpex8-panel__head">
        <button type="button" className="disparo-btn-secondary dpex-btn-icon" onClick={carregar}>
          <IconRefresh size={15} />
          Atualizar
        </button>
        {relatorio?.duracao_segundos != null && (
          <span className="dpex8-meta">Duração: {fmtDuracao(relatorio.duracao_segundos)}</span>
        )}
      </div>

      <section className="dpex-progress" aria-label="Métricas da campanha">
        {RELATORIO_CARDS.map((card) => (
          <div key={card.key} className="dpex-progress-card" style={{ '--dpex-color': card.color }}>
            <span className="dpex-progress-card__value">{metricas[card.key] ?? 0}</span>
            <span className="dpex-progress-card__label">{card.label}</span>
          </div>
        ))}
      </section>

      <section className="dpex8-taxas">
        <h3 className="dpex8-subtitle">Taxas</h3>
        <div className="dpex8-taxas-grid">
          {TAXA_CARDS.map((t) => (
            <div key={t.key} className="dpex8-taxa-card">
              <span className="dpex8-taxa-card__value">{fmtPct(taxas[t.key])}</span>
              <span className="dpex8-taxa-card__label">{t.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="dpex8-charts">
        <section className="dpex-section">
          <h3 className="dpex8-subtitle">Por instância — enviadas</h3>
          <BarChart
            items={instBars.map((i) => ({ ...i, instancia_id: i.instancia_id, _label: i._label }))}
            labelKey="_label"
            valueKey="enviadas"
          />
        </section>
        <section className="dpex-section">
          <h3 className="dpex8-subtitle">Por variação — enviadas</h3>
          <p className="dpex8-disclaimer">
            Métricas por variação são operacionais (distribuição de envio) e não comprovam causalidade de performance.
          </p>
          <BarChart
            items={varBars.map((v) => ({ ...v, variacao_id: v.variacao_id, _label: v._label }))}
            labelKey="_label"
            valueKey="enviadas"
          />
        </section>
      </div>

      {errosList.length > 0 && (
        <section className="dpex-section">
          <h3 className="dpex8-subtitle">Erros agrupados</h3>
          <div className="dpex-table-wrap">
            <table className="dpex-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Classificação</th>
                  <th>Total</th>
                  <th>Falhas</th>
                  <th>Incertas</th>
                </tr>
              </thead>
              <tbody>
                {errosList.map((e) => (
                  <tr key={`${e.erro_codigo}-${e.erro_classificacao}`}>
                    <td>
                      <span className="dpex-table__name">{e.erro_codigo}</span>
                      {e.erro_mensagem && (
                        <span className="dpex-table__sub">{e.erro_mensagem}</span>
                      )}
                    </td>
                    <td>{e.erro_classificacao || '—'}</td>
                    <td>{e.total}</td>
                    <td>{e.falhas}</td>
                    <td>{e.incertos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="dpex-section dpex8-export">
        <h3 className="dpex8-subtitle">Exportar relatório</h3>
        <label className="dpex8-check">
          <input type="checkbox" checked={maskExport} onChange={(e) => setMaskExport(e.target.checked)} />
          <span>Mascarar telefones no CSV</span>
        </label>
        <div className="dpex8-export-btns">
          {EXPORT_TIPOS.map(({ tipo, label }) => (
            <button
              key={tipo}
              type="button"
              className="disparo-btn-secondary dpex-btn-icon"
              disabled={!!exportando}
              onClick={() => handleExport(tipo)}
            >
              <IconDownload size={14} />
              {exportando === tipo ? 'Exportando…' : label}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function RespostasPanel({ campanhaId }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState({ itens: [], page: 1, total: 0, total_pages: 0 })
  const [page, setPage] = useState(1)

  const carregar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await listRespostas(campanhaId, { page, limit: PAGE_LIMIT, mask: '1' })
      setData({
        itens: res.itens ?? [],
        page: res.page ?? 1,
        total: res.total ?? 0,
        total_pages: res.total_pages ?? 0,
      })
    } catch (err) {
      setError(disparoEtapa8ApiError(err))
    } finally {
      setLoading(false)
    }
  }, [campanhaId, page])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="dpex8-panel">
      {error && <div className="disparo-alert disparo-alert--error">{error}</div>}
      <div className="dpex8-panel__head">
        <span className="dpex8-meta">
          <IconMessageReply size={14} />
          {data.total} resposta(s) vinculada(s)
        </span>
        <button type="button" className="disparo-btn-secondary dpex-btn-icon" onClick={carregar} disabled={loading}>
          <IconRefresh size={15} className={loading ? 'dpex-spin' : ''} />
          Atualizar
        </button>
      </div>

      {loading && !data.itens.length ? (
        <p className="dpex-empty">Carregando respostas…</p>
      ) : data.itens.length === 0 ? (
        <p className="dpex-empty">Nenhuma resposta vinculada a esta campanha.</p>
      ) : (
        <>
          <div className="dpex-table-wrap">
            <table className="dpex-table">
              <thead>
                <tr>
                  <th>Telefone</th>
                  <th>Item fila</th>
                  <th>Instância</th>
                  <th>Recebida em</th>
                </tr>
              </thead>
              <tbody>
                {data.itens.map((r) => (
                  <tr key={r.id}>
                    <td>{r.telefone_normalizado || '—'}</td>
                    <td>#{r.fila_item_id ?? '—'}</td>
                    <td>{r.instancia_id ?? '—'}</td>
                    <td>{fmtDateTime(r.criado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            totalPages={data.total_pages}
            total={data.total}
            disabled={loading}
            onPrev={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
          />
        </>
      )}
    </div>
  )
}

function OptOutsPanel({ campanhaId }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState({ itens: [], page: 1, total: 0, total_pages: 0 })
  const [page, setPage] = useState(1)
  const [reativando, setReativando] = useState(false)
  const [modalTel, setModalTel] = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await listOptOuts({ page, limit: PAGE_LIMIT })
      setData({
        itens: res.itens ?? [],
        page: res.page ?? 1,
        total: res.total ?? 0,
        total_pages: res.total_pages ?? 0,
      })
    } catch (err) {
      setError(disparoEtapa8ApiError(err))
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { carregar() }, [carregar])

  async function handleReativar(motivo) {
    setReativando(true)
    setError('')
    try {
      await reativarOptOut({ telefone: modalTel, motivo })
      setModalTel(null)
      await carregar()
    } catch (err) {
      setError(disparoEtapa8ApiError(err))
    } finally {
      setReativando(false)
    }
  }

  return (
    <div className="dpex8-panel">
      {error && <div className="disparo-alert disparo-alert--error">{error}</div>}
      <div className="dpex8-panel__head">
        <span className="dpex8-meta">
          <IconUserOff size={14} />
          {data.total} evento(s) de opt-out
        </span>
        <button type="button" className="disparo-btn-secondary dpex-btn-icon" onClick={carregar} disabled={loading}>
          <IconRefresh size={15} className={loading ? 'dpex-spin' : ''} />
          Atualizar
        </button>
      </div>

      {loading && !data.itens.length ? (
        <p className="dpex-empty">Carregando opt-outs…</p>
      ) : data.itens.length === 0 ? (
        <p className="dpex-empty">Nenhum evento de opt-out registrado.</p>
      ) : (
        <>
          <div className="dpex-table-wrap">
            <table className="dpex-table">
              <thead>
                <tr>
                  <th>Telefone</th>
                  <th>Tipo</th>
                  <th>Palavra</th>
                  <th>Campanha</th>
                  <th>Data</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.itens.map((o) => (
                  <tr key={o.id}>
                    <td>{o.telefone_normalizado || '—'}</td>
                    <td>
                      <span className={`dpex8-tipo dpex8-tipo--${o.tipo}`}>{o.tipo}</span>
                    </td>
                    <td>{o.palavra || '—'}</td>
                    <td>{o.campanha_id === campanhaId ? 'Esta' : (o.campanha_id ?? '—')}</td>
                    <td>{fmtDateTime(o.criado_em)}</td>
                    <td>
                      {o.tipo === 'optout' && (
                        <button
                          type="button"
                          className="disparo-btn-secondary dpex8-btn-sm"
                          onClick={() => setModalTel(o.telefone_normalizado)}
                        >
                          Reativar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            totalPages={data.total_pages}
            total={data.total}
            disabled={loading}
            onPrev={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
          />
        </>
      )}

      {modalTel && (
        <ModalReativar
          telefone={modalTel}
          onClose={() => setModalTel(null)}
          onConfirm={handleReativar}
          loading={reativando}
        />
      )}
    </div>
  )
}

function IncertosPanel({ campanhaId, onReconciled }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState({ itens: [], page: 1, total: 0, total_pages: 0 })
  const [page, setPage] = useState(1)
  const [reconciliando, setReconciliando] = useState(false)
  const [decisaoItem, setDecisaoItem] = useState(null)
  const [decisaoLoading, setDecisaoLoading] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await listIncertos(campanhaId, { page, limit: PAGE_LIMIT })
      setData({
        itens: res.itens ?? [],
        page: res.page ?? 1,
        total: res.total ?? 0,
        total_pages: res.total_pages ?? 0,
      })
    } catch (err) {
      setError(disparoEtapa8ApiError(err))
    } finally {
      setLoading(false)
    }
  }, [campanhaId, page])

  useEffect(() => { carregar() }, [carregar])

  async function handleReconciliar() {
    setReconciliando(true)
    setError('')
    try {
      await reconciliar(campanhaId)
      await carregar()
      onReconciled?.()
    } catch (err) {
      setError(disparoEtapa8ApiError(err))
    } finally {
      setReconciliando(false)
    }
  }

  async function handleDecisao(payload) {
    setDecisaoLoading(true)
    setError('')
    try {
      await decisaoIncerto(campanhaId, decisaoItem.id, payload)
      setDecisaoItem(null)
      await carregar()
      onReconciled?.()
    } catch (err) {
      setError(disparoEtapa8ApiError(err))
    } finally {
      setDecisaoLoading(false)
    }
  }

  return (
    <div className="dpex8-panel">
      {error && <div className="disparo-alert disparo-alert--error">{error}</div>}
      <div className="dpex8-panel__head">
        <span className="dpex8-meta">
          <IconAlertTriangle size={14} />
          {data.total} item(ns) incerto(s)
        </span>
        <div className="dpex8-panel__head-actions">
          <button
            type="button"
            className="disparo-btn-primary dpex-btn-icon"
            onClick={handleReconciliar}
            disabled={reconciliando || loading}
          >
            <IconRotateClockwise size={15} className={reconciliando ? 'dpex-spin' : ''} />
            {reconciliando ? 'Reconciliando…' : 'Reconciliar lote'}
          </button>
          <button type="button" className="disparo-btn-secondary dpex-btn-icon" onClick={carregar} disabled={loading}>
            <IconRefresh size={15} className={loading ? 'dpex-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {loading && !data.itens.length ? (
        <p className="dpex-empty">Carregando incertos…</p>
      ) : data.itens.length === 0 ? (
        <p className="dpex-empty">Nenhum item incerto pendente.</p>
      ) : (
        <>
          <div className="dpex-table-wrap">
            <table className="dpex-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Tentativas</th>
                  <th>Erro</th>
                  <th>Enviado em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.itens.map((item) => (
                  <tr key={item.id}>
                    <td>#{item.id}</td>
                    <td>{item.tentativas ?? 0}/{item.max_tentativas ?? '—'}</td>
                    <td>
                      <span className="dpex-table__name">{item.erro_codigo || '—'}</span>
                      {item.erro_mensagem && (
                        <span className="dpex-table__sub">{item.erro_mensagem}</span>
                      )}
                    </td>
                    <td>{fmtDateTime(item.enviado_em)}</td>
                    <td>
                      <button
                        type="button"
                        className="disparo-btn-secondary dpex8-btn-sm"
                        onClick={() => setDecisaoItem(item)}
                      >
                        Decidir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            totalPages={data.total_pages}
            total={data.total}
            disabled={loading}
            onPrev={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
          />
        </>
      )}

      {decisaoItem && (
        <ModalDecisao
          item={decisaoItem}
          onClose={() => setDecisaoItem(null)}
          onConfirm={handleDecisao}
          loading={decisaoLoading}
        />
      )}
    </div>
  )
}

// ── Export principal ────────────────────────────────────────────────────────────

export default function DisparoEtapa8Section({ campanhaId, tab, refreshKey, onReconciled }) {
  const prevKey = useRef(refreshKey)

  useEffect(() => {
    if (refreshKey !== prevKey.current) {
      prevKey.current = refreshKey
    }
  }, [refreshKey])

  switch (tab) {
    case 'relatorio':
      return <RelatorioPanel key={refreshKey} campanhaId={campanhaId} />
    case 'respostas':
      return <RespostasPanel key={refreshKey} campanhaId={campanhaId} />
    case 'optouts':
      return <OptOutsPanel key={refreshKey} campanhaId={campanhaId} />
    case 'incertos':
      return (
        <IncertosPanel
          key={refreshKey}
          campanhaId={campanhaId}
          onReconciled={onReconciled}
        />
      )
    case 'config':
      return (
        <section className="dpex-section">
          <h2 className="dpex-section__title">Configuração de opt-out</h2>
          <DisparoOptOutConfig />
        </section>
      )
    default:
      return null
  }
}

export { RelatorioPanel, RespostasPanel, OptOutsPanel, IncertosPanel }
