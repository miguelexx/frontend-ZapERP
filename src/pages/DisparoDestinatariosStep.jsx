import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IconCheck,
  IconDownload,
  IconTrash,
  IconSearch,
  IconUpload,
  IconX,
  IconAlertTriangle,
  IconUsers,
} from '@tabler/icons-react'
import {
  addContatos,
  buscarContatos,
  confirmarImportacao,
  disparoApiError,
  downloadCsvRejeitados,
  limparDestinatarios,
  listarDestinatarios,
  previewImportacao,
  removerDestinatario,
  removerVarios,
  resumoDestinatarios,
} from '../api/disparoDestinatariosService'

// ── Constantes ────────────────────────────────────────────────────────────────

const IMPORT_STAGES = ['Arquivo', 'Mapear', 'Prévia', 'Confirmar']
const CONTACTS_PAGE_LIMIT = 25
const DEST_PAGE_LIMIT = 30

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskPhone(tel) {
  if (!tel) return '—'
  const d = tel.replace(/\D/g, '')
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
  return tel
}

function SkeletonRows({ cols }) {
  return Array.from({ length: 5 }).map((_, i) => (
    <tr key={i}>
      {Array.from({ length: cols }).map((_, j) => (
        <td key={j} style={{ padding: '10px 12px' }}>
          <span className="disparo-skeleton" style={{ width: j === 0 ? '40%' : '75%' }} />
        </td>
      ))}
    </tr>
  ))
}

// ── Aba: Contatos do ZapERP ───────────────────────────────────────────────────

function AbaContatos({ campanhaId, onAdded }) {
  const [contatos, setContatos] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [selectAll, setSelectAll] = useState(false) // "selecionar todos da busca"
  const [adding, setAdding] = useState(false)
  const [addResult, setAddResult] = useState(null)
  const [lgpdOk, setLgpdOk] = useState(false)
  const debounceRef = useRef(null)
  const searchRef = useRef(null)

  const totalPages = Math.max(1, Math.ceil(total / CONTACTS_PAGE_LIMIT))

  const fetchContatos = useCallback(async (opts = {}) => {
    setLoading(true); setError('')
    try {
      const res = await buscarContatos(campanhaId, {
        page: opts.page ?? page,
        limit: CONTACTS_PAGE_LIMIT,
        search: opts.search ?? search,
      })
      setContatos(res.contatos ?? [])
      setTotal(res.total ?? 0)
    } catch (e) {
      setError(disparoApiError(e))
    } finally {
      setLoading(false)
    }
  }, [campanhaId, page, search])

  useEffect(() => { fetchContatos() }, [page]) // eslint-disable-line

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      setSelectAll(false)
      fetchContatos({ page: 1, search })
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [search]) // eslint-disable-line

  function toggleSelect(id) {
    if (!id) return
    setSelectAll(false)
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function limparSelecao() {
    setSelected(new Set())
    setSelectAll(false)
    setLgpdOk(false)
  }

  function toggleAllPage() {
    const pageIds = contatos.filter(c => !c.ja_na_campanha).map(c => c.id)
    const allSelected = pageIds.every(id => selected.has(id))
    setSelectAll(false)
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) pageIds.forEach(id => next.delete(id))
      else pageIds.forEach(id => next.add(id))
      return next
    })
  }

  async function handleAdicionar() {
    if (!lgpdOk) return
    setAdding(true); setAddResult(null); setError('')
    try {
      const payload = selectAll
        ? { select_all: true, search }
        : { cliente_ids: Array.from(selected) }
      const res = await addContatos(campanhaId, payload)
      setAddResult(res)
      limparSelecao()
      fetchContatos({ page: 1 })
      onAdded?.()
    } catch (e) {
      setError(disparoApiError(e))
    } finally {
      setAdding(false)
    }
  }

  const naoAdicionados = contatos.filter(c => !c.ja_na_campanha)
  const todosPagina = naoAdicionados.length > 0 && naoAdicionados.every(c => selected.has(c.id))
  const qtdSelecionados = selectAll
    ? Math.max(0, total - contatos.filter(c => c.ja_na_campanha).length)
    : selected.size
  const temSelecao = qtdSelecionados > 0 || selectAll

  return (
    <div>
      <p className="dw-select-hint">
        Marque os contatos que deseja incluir. Nada entra na campanha até você clicar em <strong>Confirmar</strong>.
      </p>
      {/* Barra de busca */}
      <div className="dw-search-bar">
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 0 }}>
          <IconSearch size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ds-text-muted,#94a3b8)', pointerEvents: 'none' }} aria-hidden />
          <input
            ref={searchRef}
            type="search"
            className="dw-search-input"
            style={{ paddingLeft: 30 }}
            placeholder="Buscar por nome ou telefone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Buscar contato"
          />
        </div>
      </div>

      {/* Barra "selecionar todos da busca" */}
      {selected.size > 0 && !selectAll && total > CONTACTS_PAGE_LIMIT && (
        <div className="dw-select-all-bar">
          <span><strong>{selected.size}</strong> contato{selected.size !== 1 ? 's' : ''} marcado{selected.size !== 1 ? 's' : ''} (a busca não apaga a seleção).</span>
          <button type="button" onClick={() => { setSelectAll(true); setSelected(new Set()) }}>
            Selecionar todos os {total} resultados desta busca
          </button>
        </div>
      )}
      {selectAll && (
        <div className="dw-select-all-bar">
          <span>Todos os <strong>{total}</strong> resultados desta busca serão adicionados ao confirmar.</span>
          <button type="button" onClick={() => setSelectAll(false)}>Cancelar seleção total</button>
        </div>
      )}

      {error && <div className="disparo-alert disparo-alert--error">{error}</div>}
      {addResult && (
        <div className="disparo-alert" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', marginBottom: 12 }}>
          <strong>{addResult.inseridos}</strong> contato{addResult.inseridos !== 1 ? 's' : ''} adicionado{addResult.inseridos !== 1 ? 's' : ''}.
          {addResult.ignorados?.length > 0 && <> <strong>{addResult.ignorados.length}</strong> ignorado{addResult.ignorados.length !== 1 ? 's' : ''} (telefone inválido ou duplicado).</>}
        </div>
      )}

      {/* Tabela de contatos */}
      <div className="disparo-list" style={{ marginBottom: 16 }}>
        <table className="dw-contacts-table" aria-label="Contatos do ZapERP">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={naoAdicionados.length > 0 && todosPagina} onChange={toggleAllPage} aria-label="Selecionar todos da página" disabled={loading || naoAdicionados.length === 0} />
              </th>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <SkeletonRows cols={4} />
              : contatos.length === 0
                ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ds-text-muted,#64748b)' }}>
                      {search ? 'Nenhum contato encontrado para essa busca.' : 'Nenhum contato cadastrado.'}
                    </td>
                  </tr>
                )
                : contatos.map(c => {
                  const nome = c.nome ?? c.pushname
                  const marcado = !c.ja_na_campanha && (selectAll || selected.has(c.id))
                  return (
                    <tr
                      key={c.id}
                      className={[
                        c.ja_na_campanha ? 'is-already' : '',
                        marcado ? 'is-selected' : '',
                        c.ja_na_campanha ? 'is-disabled' : 'is-pickable',
                      ].filter(Boolean).join(' ')}
                      onClick={() => { if (!c.ja_na_campanha) toggleSelect(c.id) }}
                    >
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={marcado}
                          disabled={c.ja_na_campanha}
                          onChange={() => toggleSelect(c.id)}
                          aria-label={c.ja_na_campanha ? `${nome || 'Contato'} já na campanha` : `Selecionar ${nome || 'contato'}`}
                        />
                      </td>
                      <td style={{ fontWeight: 500 }}>{nome || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{maskPhone(c.telefone ?? c.wa_id)}</td>
                      <td>
                        {c.ja_na_campanha
                          ? <span className="dw-already-tag">Já adicionado</span>
                          : marcado
                            ? <span className="dw-pending-tag">Na seleção</span>
                            : null}
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>

        {/* Paginação */}
        {total > CONTACTS_PAGE_LIMIT && (
          <div className="disparo-pagination">
            <span className="disparo-pagination__info">{total} contato{total !== 1 ? 's' : ''} — pág. {page}/{totalPages}</span>
            <button className="disparo-pagination__btn" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>‹ Anterior</button>
            <button className="disparo-pagination__btn" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Próxima ›</button>
          </div>
        )}
      </div>

      {temSelecao && (
        <div className="dw-confirm-bar">
          <label className="dw-lgpd dw-lgpd--inline">
            <input type="checkbox" checked={lgpdOk} onChange={e => setLgpdOk(e.target.checked)} />
            <span>
              Confirmo autorização/relação legítima (LGPD) para os {qtdSelecionados} selecionado{qtdSelecionados !== 1 ? 's' : ''}.
            </span>
          </label>
          <div className="dw-confirm-bar__actions">
            <button type="button" className="disparo-btn-secondary" onClick={limparSelecao} disabled={adding}>
              Limpar seleção
            </button>
            <button
              type="button"
              className="disparo-btn-primary"
              onClick={handleAdicionar}
              disabled={adding || !lgpdOk}
              title={!lgpdOk ? 'Marque o aceite LGPD para confirmar.' : undefined}
            >
              <IconCheck size={15} />
              {adding ? 'Confirmando…' : `Confirmar ${qtdSelecionados} contato${qtdSelecionados !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Aba: Importar planilha ─────────────────────────────────────────────────────

function AbaImportacao({ campanhaId, onImported }) {
  const [stage, setStage] = useState(0) // 0=upload 1=mapear 2=previa 3=confirmar
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [previewData, setPreviewData] = useState(null)
  const [sheetId, setSheetId] = useState(null)
  const [mapping, setMapping] = useState({ nome: null, telefone: null })
  const [lgpdOk, setLgpdOk] = useState(false)
  const [result, setResult] = useState(null)
  const [over, setOver] = useState(false)
  const fileInputRef = useRef(null)

  function resetImport() {
    setStage(0); setFile(null); setPreviewData(null)
    setSheetId(null); setMapping({ nome: null, telefone: null })
    setLgpdOk(false); setResult(null); setError('')
  }

  // ── Stage 0: upload ───────────────────────────────
  function handleFileSelect(f) {
    if (!f) return
    const ext = f.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setError('Formato inválido. Use .xlsx, .xls ou .csv.'); return
    }
    setFile(f); setError('')
  }

  function onDrop(e) {
    e.preventDefault(); setOver(false)
    handleFileSelect(e.dataTransfer?.files?.[0])
  }

  async function handlePreview() {
    if (!file) { setError('Selecione um arquivo.'); return }
    setLoading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      if (sheetId != null) fd.append('sheet_id', sheetId)
      if (mapping.nome != null) fd.append('mapping', JSON.stringify(mapping))
      const res = await previewImportacao(campanhaId, fd)
      setPreviewData(res)
      setMapping({ nome: res.mapping?.nome ?? null, telefone: res.mapping?.telefone ?? null })
      setSheetId(res.sheet_id_atual)
      setStage(res.sheets?.length > 1 ? 1 : 2) // pula mapear se 1 aba
    } catch (e) {
      setError(disparoApiError(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleRefreshPreview() {
    if (!file || !previewData) return
    setLoading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      if (sheetId != null) fd.append('sheet_id', sheetId)
      fd.append('mapping', JSON.stringify(mapping))
      const res = await previewImportacao(campanhaId, fd)
      setPreviewData(res)
      setMapping({ nome: res.mapping?.nome ?? null, telefone: res.mapping?.telefone ?? null })
    } catch (e) {
      setError(disparoApiError(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmar() {
    if (!lgpdOk || !file) return
    setLoading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      if (sheetId != null) fd.append('sheet_id', sheetId)
      fd.append('mapping', JSON.stringify(mapping))
      fd.append('arquivo_nome', file.name)
      const res = await confirmarImportacao(campanhaId, fd)
      setResult(res)
      setStage(3)
      onImported?.()
    } catch (e) {
      setError(disparoApiError(e))
    } finally {
      setLoading(false)
    }
  }

  // ── Render por stage ─────────────────────────────
  return (
    <div>
      {/* Indicador de stages */}
      <div className="dw-import-stages">
        {IMPORT_STAGES.map((s, i) => (
          <div key={s} className={`dw-import-stage${i === stage ? ' dw-import-stage--active' : i < stage ? ' dw-import-stage--done' : ''}`}>
            {s}
          </div>
        ))}
      </div>

      {error && <div className="disparo-alert disparo-alert--error">{error}</div>}

      {/* Stage 0 – Upload */}
      {stage === 0 && (
        <div>
          <div
            className={`dw-upload-zone${over ? ' dw-upload-zone--over' : ''}`}
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
            aria-label="Área de upload de planilha"
          >
            <div className="dw-upload-zone__icon"><IconUpload size={40} /></div>
            <p className="dw-upload-zone__text">{file ? file.name : 'Clique ou arraste o arquivo aqui'}</p>
            <p className="dw-upload-zone__sub">Formatos aceitos: .xlsx, .xls, .csv — máx. 20 MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={e => handleFileSelect(e.target.files?.[0])}
              aria-hidden
            />
          </div>
          {file && (
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="disparo-btn-primary" onClick={handlePreview} disabled={loading}>
                {loading ? 'Analisando…' : 'Analisar planilha →'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stage 1 – Selecionar aba (multi-sheet xlsx) */}
      {stage === 1 && previewData && (
        <div>
          <p style={{ fontSize: 13, marginBottom: 12 }}>Esta planilha tem múltiplas abas. Selecione qual importar:</p>
          {previewData.sheets?.map(s => (
            <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" name="sheet" checked={sheetId === s.id} onChange={() => setSheetId(s.id)} />
              <strong>{s.name}</strong> <span style={{ color: 'var(--ds-text-muted,#64748b)' }}>({s.rowCount} linha{s.rowCount !== 1 ? 's' : ''})</span>
            </label>
          ))}
          <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="disparo-btn-secondary" onClick={resetImport}>Cancelar</button>
            <button className="disparo-btn-primary" onClick={async () => { await handleRefreshPreview(); setStage(2) }} disabled={loading || sheetId == null}>
              {loading ? 'Carregando…' : 'Continuar →'}
            </button>
          </div>
        </div>
      )}

      {/* Stage 2 – Mapear colunas + Prévia */}
      {stage === 2 && previewData && (
        <div>
          <p style={{ fontSize: 13, marginBottom: 14, color: 'var(--ds-text-muted,#64748b)' }}>
            Confirme o mapeamento das colunas. As colunas adicionais serão salvas como variáveis personalizadas.
          </p>
          <div className="dw-mapping-grid">
            {['nome', 'telefone'].map(campo => (
              <div key={campo} className="dw-mapping-field">
                <label htmlFor={`map-${campo}`}>{campo === 'nome' ? 'Nome *' : 'Telefone *'}</label>
                <select
                  id={`map-${campo}`}
                  value={mapping[campo] ?? ''}
                  onChange={e => setMapping(prev => ({ ...prev, [campo]: e.target.value === '' ? null : Number(e.target.value) }))}
                >
                  <option value="">— Selecione a coluna —</option>
                  {previewData.headers?.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>

          {previewData.colunas_extras?.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--ds-text-muted,#64748b)', marginBottom: 12 }}>
              Colunas extras detectadas:{' '}
              <strong>{previewData.colunas_extras.map(c => c.nome).join(', ')}</strong>
              {' '}— serão salvas como variáveis <code>{'{{nome_da_coluna}}'}</code>.
            </p>
          )}

          {/* Stats */}
          <div className="dw-stats-bar">
            <span className="dw-stats-bar__item dw-stats-bar__item--ok">Válidas: <strong>{previewData.stats?.validas ?? 0}</strong></span>
            <span className="dw-stats-bar__item dw-stats-bar__item--error">Inválidas: <strong>{previewData.stats?.invalidas ?? 0}</strong></span>
            <span className="dw-stats-bar__item">Total de linhas: <strong>{previewData.stats?.totalLinhas ?? 0}</strong></span>
          </div>

          {/* Prévia válidas / inválidas */}
          <div className="dw-preview-grid">
            <div className="dw-preview-box dw-preview-box--valid">
              <div className="dw-preview-box__header">✓ Válidas ({previewData.amostra_validas?.length ?? 0})</div>
              <div className="dw-preview-box__list">
                {previewData.amostra_validas?.slice(0, 50).map((r, i) => (
                  <div key={i} className="dw-preview-box__row">
                    <span className="dw-preview-box__name">{r.nome}</span>
                    <span className="dw-preview-box__phone">{maskPhone(r.telefone_normalizado)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="dw-preview-box dw-preview-box--invalid">
              <div className="dw-preview-box__header">✗ Rejeitadas ({previewData.rejeitados?.length ?? 0})</div>
              <div className="dw-preview-box__list">
                {previewData.rejeitados?.slice(0, 50).map((r, i) => (
                  <div key={i} className="dw-preview-box__row" style={{ flexDirection: 'column' }}>
                    <span className="dw-preview-box__name">Linha {r.linha}: {r.nome || '(sem nome)'}</span>
                    <span className="dw-preview-box__motivo">{r.motivo}</span>
                  </div>
                ))}
                {(previewData.rejeitados?.length ?? 0) === 0 && (
                  <div className="dw-preview-box__row" style={{ color: '#059669', fontStyle: 'italic' }}>Nenhuma rejeição</div>
                )}
              </div>
            </div>
          </div>

          {previewData.rejeitados?.length > 0 && (
            <button
              type="button"
              className="disparo-btn-secondary"
              style={{ fontSize: 12, padding: '6px 12px', marginBottom: 10 }}
              onClick={() => downloadCsvRejeitados(previewData.rejeitados, 'rejeitados_preview.csv')}
            >
              <IconDownload size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Baixar CSV de rejeitadas
            </button>
          )}

          {/* LGPD */}
          <label className="dw-lgpd">
            <input type="checkbox" checked={lgpdOk} onChange={e => setLgpdOk(e.target.checked)} />
            <span>Confirmo que os destinatários possuem autorização ou relação legítima para receber esta comunicação, em conformidade com a LGPD.</span>
          </label>

          <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="disparo-btn-secondary" onClick={resetImport}>← Voltar</button>
            <button
              className="disparo-btn-primary"
              onClick={handleConfirmar}
              disabled={loading || !lgpdOk || mapping.nome == null || mapping.telefone == null || (previewData.stats?.validas ?? 0) === 0}
            >
              {loading ? 'Importando…' : `Importar ${previewData.stats?.validas ?? 0} destinatário${(previewData.stats?.validas ?? 0) !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* Stage 3 – Resultado */}
      {stage === 3 && result && (
        <div>
          <div className="disparo-alert" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', marginBottom: 16 }}>
            <strong>{result.inseridos}</strong> destinatário{result.inseridos !== 1 ? 's' : ''} importado{result.inseridos !== 1 ? 's' : ''} com sucesso.
            {result.rejeitados?.length > 0 && <> <strong>{result.rejeitados.length}</strong> linha{result.rejeitados.length !== 1 ? 's' : ''} rejeitada{result.rejeitados.length !== 1 ? 's' : ''}.</>}
          </div>

          {result.rejeitados?.length > 0 && (
            <button
              type="button"
              className="disparo-btn-secondary"
              style={{ fontSize: 12, padding: '6px 12px', marginBottom: 12 }}
              onClick={() => downloadCsvRejeitados(result.rejeitados)}
            >
              <IconDownload size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Baixar CSV de rejeitadas
            </button>
          )}

          <button className="disparo-btn-secondary" onClick={resetImport}>
            Importar outro arquivo
          </button>
        </div>
      )}
    </div>
  )
}

// ── Lista de destinatários já na campanha ─────────────────────────────────────

function ListaDestinatarios({ campanhaId, refresh, onChanged }) {
  const [destinatarios, setDestinatarios] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [confirmLimpar, setConfirmLimpar] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [resumo, setResumo] = useState(null)
  const totalPages = Math.max(1, Math.ceil(total / DEST_PAGE_LIMIT))

  const fetchList = useCallback(async (p) => {
    setLoading(true); setError('')
    try {
      const [res, r] = await Promise.all([
        listarDestinatarios(campanhaId, { page: p ?? page, limit: DEST_PAGE_LIMIT }),
        resumoDestinatarios(campanhaId),
      ])
      setDestinatarios(res.destinatarios ?? [])
      setTotal(res.total ?? 0)
      setResumo(r)
    } catch (e) {
      setError(disparoApiError(e))
    } finally {
      setLoading(false)
    }
  }, [campanhaId, page])

  useEffect(() => { fetchList() }, [refresh, page]) // eslint-disable-line

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
    })
  }

  function toggleAll() {
    if (selected.size === destinatarios.length) setSelected(new Set())
    else setSelected(new Set(destinatarios.map(d => d.id)))
  }

  async function handleRemoverUm(id) {
    setRemoving(true)
    try {
      await removerDestinatario(campanhaId, id)
      await fetchList()
      onChanged?.()
    } catch (e) {
      setError(disparoApiError(e))
    } finally {
      setRemoving(false)
    }
  }

  async function handleRemoverSelecionados() {
    if (selected.size === 0) return
    setRemoving(true)
    try {
      await removerVarios(campanhaId, Array.from(selected))
      setSelected(new Set())
      await fetchList()
      onChanged?.()
    } catch (e) {
      setError(disparoApiError(e))
    } finally {
      setRemoving(false)
    }
  }

  async function handleLimpar() {
    setRemoving(true)
    try {
      await limparDestinatarios(campanhaId)
      setConfirmLimpar(false)
      setSelected(new Set())
      await fetchList()
      onChanged?.()
    } catch (e) {
      setError(disparoApiError(e))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="dw-recipients-section">
      <div className="dw-recipients-header">
        <h3 className="dw-recipients-title">
          <IconUsers size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} aria-hidden />
          Destinatários da campanha
          {resumo && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ds-text-muted,#64748b)', marginLeft: 8 }}>({resumo.total} no total)</span>}
        </h3>
        <div className="dw-recipients-actions">
          {selected.size > 0 && (
            <button
              className="disparo-btn-secondary"
              style={{ fontSize: 12, padding: '6px 12px', color: '#dc2626', borderColor: '#fecaca' }}
              onClick={handleRemoverSelecionados}
              disabled={removing}
            >
              <IconTrash size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Remover {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
            </button>
          )}
          {total > 0 && !confirmLimpar && (
            <button
              className="disparo-btn-secondary"
              style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => setConfirmLimpar(true)}
            >
              <IconX size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Limpar todos
            </button>
          )}
          {confirmLimpar && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
              <span style={{ color: '#dc2626' }}>Confirma limpar todos?</span>
              <button className="disparo-btn-secondary" style={{ fontSize: 12, padding: '5px 10px', color: '#dc2626' }} onClick={handleLimpar} disabled={removing}>Sim, limpar</button>
              <button className="disparo-btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setConfirmLimpar(false)}>Não</button>
            </div>
          )}
        </div>
      </div>

      {/* Resumo */}
      {resumo && (
        <div className="dw-stats-bar" style={{ marginBottom: 12 }}>
          <span className="dw-stats-bar__item">Total: <strong>{resumo.total}</strong></span>
          <span className="dw-stats-bar__item">Contatos ZapERP: <strong>{resumo.contato_salvo}</strong></span>
          <span className="dw-stats-bar__item">Importados: <strong>{resumo.importacao_planilha}</strong></span>
        </div>
      )}

      {error && <div className="disparo-alert disparo-alert--error">{error}</div>}

      <div className="disparo-list">
        <table className="dw-contacts-table" aria-label="Destinatários da campanha">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={destinatarios.length > 0 && selected.size === destinatarios.length} onChange={toggleAll} disabled={loading || destinatarios.length === 0} aria-label="Selecionar todos" />
              </th>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Origem</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <SkeletonRows cols={5} />
              : destinatarios.length === 0
                ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ds-text-muted,#64748b)' }}>
                      Nenhum destinatário adicionado ainda.
                    </td>
                  </tr>
                )
                : destinatarios.map(d => (
                  <tr key={d.id}>
                    <td><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} aria-label={`Selecionar ${d.nome}`} /></td>
                    <td style={{ fontWeight: 500 }}>{d.nome ?? '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{maskPhone(d.telefone_normalizado)}</td>
                    <td>
                      <span style={{ fontSize: 11, background: d.origem === 'contato_salvo' ? '#eff6ff' : '#f0fdf4', color: d.origem === 'contato_salvo' ? '#2563eb' : '#059669', padding: '2px 7px', borderRadius: 10, fontWeight: 600 }}>
                        {d.origem === 'contato_salvo' ? 'Contato' : d.origem === 'importacao_planilha' ? 'Planilha' : 'Manual'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="disparo-btn-icon disparo-btn-icon--danger"
                        onClick={() => handleRemoverUm(d.id)}
                        disabled={removing}
                        title="Remover"
                        aria-label={`Remover ${d.nome}`}
                      >
                        <IconTrash size={13} />
                      </button>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
        {total > DEST_PAGE_LIMIT && (
          <div className="disparo-pagination">
            <span className="disparo-pagination__info">{total} destinatário{total !== 1 ? 's' : ''} — pág. {page}/{totalPages}</span>
            <button className="disparo-pagination__btn" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>‹</button>
            <button className="disparo-pagination__btn" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>›</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Componente principal: Step 2 ──────────────────────────────────────────────

export default function DisparoDestinatariosStep({ campanhaId, onBack, onNext }) {
  const [tab, setTab] = useState('contatos')
  const [listRefresh, setListRefresh] = useState(0)
  const [totalDestinatarios, setTotalDestinatarios] = useState(0)

  function refresh() { setListRefresh(r => r + 1) }

  // Busca o total para habilitar "Continuar"
  useEffect(() => {
    resumoDestinatarios(campanhaId)
      .then(r => setTotalDestinatarios(r.total ?? 0))
      .catch(() => {})
  }, [campanhaId, listRefresh])

  return (
    <div>
      {/* Abas */}
      <div className="dw-tabs" role="tablist">
        <button
          className={`dw-tab${tab === 'contatos' ? ' dw-tab--active' : ''}`}
          onClick={() => setTab('contatos')}
          role="tab"
          aria-selected={tab === 'contatos'}
        >
          Contatos do ZapERP
        </button>
        <button
          className={`dw-tab${tab === 'importar' ? ' dw-tab--active' : ''}`}
          onClick={() => setTab('importar')}
          role="tab"
          aria-selected={tab === 'importar'}
        >
          Importar planilha
        </button>
      </div>

      {tab === 'contatos' && (
        <AbaContatos campanhaId={campanhaId} onAdded={refresh} />
      )}
      {tab === 'importar' && (
        <AbaImportacao campanhaId={campanhaId} onImported={refresh} />
      )}

      {/* Lista de destinatários atuais */}
      <ListaDestinatarios
        campanhaId={campanhaId}
        refresh={listRefresh}
        onChanged={refresh}
      />

      {/* Rodapé do step */}
      <div className="dw-footer">
        <div className="dw-footer__left">
          <button className="disparo-btn-secondary" onClick={onBack}>← Informações</button>
        </div>
        <div className="dw-footer__right">
          <button
            className="disparo-btn-primary"
            disabled={totalDestinatarios === 0}
            onClick={onNext}
            title={totalDestinatarios === 0 ? 'Adicione ao menos um destinatário para continuar.' : undefined}
          >
            Instâncias →
          </button>
        </div>
      </div>

      {totalDestinatarios === 0 && (
        <p style={{ fontSize: 12, color: 'var(--ds-text-muted,#64748b)', textAlign: 'right', marginTop: 6 }}>
          <IconAlertTriangle size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} aria-hidden />
          Adicione ao menos um destinatário para avançar.
        </p>
      )}
    </div>
  )
}
