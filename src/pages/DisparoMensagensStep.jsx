import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  listarVariacoes, criarVariacao, editarVariacao, duplicarVariacao, excluirVariacao,
  reordenarVariacoes, uploadMidia, removerMidia, catalogoVariaveis, salvarValoresPadrao,
  previewDestinatario, resumoMensagens, previewDistribuicaoVariacoes,
  confirmarDistribuicaoVariacoes, atribuirVariacaoManual, recalcularDistribuicaoVariacoes,
  disparoApiError,
} from '../api/disparoVariacoesService'
import api from '../api/http'

const TIPOS = [
  { value: 'texto',     label: 'Texto' },
  { value: 'imagem',    label: 'Imagem' },
  { value: 'video',     label: 'Vídeo' },
  { value: 'audio',     label: 'Áudio' },
  { value: 'documento', label: 'Documento' },
]

const MODOS = [
  { value: 'unica',       label: 'Variação única', desc: 'Todos recebem a mesma variação' },
  { value: 'equilibrada', label: 'Distribuição equilibrada', desc: 'Divisão uniforme entre variações ativas' },
  { value: 'percentual',  label: 'Por percentual', desc: 'Você define o % de cada variação (total = 100%)' },
  { value: 'manual',      label: 'Manual', desc: 'Atribua variação a cada destinatário' },
]

const ICONE_TIPO = { texto: '💬', imagem: '🖼️', video: '🎬', audio: '🎵', documento: '📄' }

// ── Substituição local de variáveis para preview ──────────────────────────────
function substituirVarsLocal(texto, vars = {}) {
  if (!texto) return texto
  return texto.replace(/\{\{([^{}]{1,100})\}\}/g, (match, chave) => {
    const k = chave.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]/g, '_')
    const v = vars[k] ?? vars[chave.trim().toLowerCase()]
    return v !== undefined && v !== null && String(v) !== '' ? String(v) : `[${k}?]`
  })
}

function contarVarsAusentesMensagem(texto, valoresPadrao = {}) {
  const regex = /\{\{([^{}]{1,100})\}\}/g
  const ausentes = new Set()
  let m
  while ((m = regex.exec(texto || '')) !== null) {
    const k = m[1].trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]/g, '_')
    if (k === 'nome' || k === 'telefone') continue
    if (!(valoresPadrao[k] || valoresPadrao[m[1].trim().toLowerCase()])) ausentes.add(k)
  }
  return [...ausentes]
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function DisparoMensagensStep({ campanhaId, totalDestinatarios, onBack, onNext }) {
  const [loading, setLoading] = useState(true)
  const [variacoes, setVariacoes] = useState([])
  const [campanha, setCampanha] = useState(null)
  const [varSelecionadaId, setVarSelecionadaId] = useState(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [modoDistrib, setModoDistrib] = useState('equilibrada')
  const [configPerc, setConfigPerc] = useState({}) // id -> percentual
  const [preview, setPreview] = useState(null)
  const [previewDestId, setPreviewDestId] = useState('')
  const [previewCarregando, setPreviewCarregando] = useState(false)
  const [catalogo, setCatalogo] = useState(null)
  const [valoresPadrao, setValoresPadrao] = useState({})
  const [resumo, setResumo] = useState(null)
  const [planoPreview, setPlanoPreview] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState('editor') // editor | variaveis | distribuicao | resumo
  const [uploadingMidia, setUploadingMidia] = useState(false)
  const [excluindoId, setExcluindoId] = useState(null)
  const [editandoNome, setEditandoNome] = useState(false)
  const [listaDestPreview, setListaDestPreview] = useState([])
  const fileRef = useRef(null)
  const textareaRef = useRef(null)

  const varSelecionada = variacoes.find(v => v.id === varSelecionadaId) ?? null

  // ── Carga inicial ──────────────────────────────────────────────────────────

  const carregarTudo = useCallback(async () => {
    try {
      setLoading(true)
      const [dadosVar, dadosCatalogo, dadosResumo] = await Promise.all([
        listarVariacoes(campanhaId),
        catalogoVariaveis(campanhaId),
        resumoMensagens(campanhaId),
      ])
      setVariacoes(dadosVar.variacoes ?? [])
      setCampanha(dadosVar.campanha)
      setCatalogo(dadosCatalogo)
      setValoresPadrao(dadosCatalogo.valores_padrao ?? {})
      setResumo(dadosResumo)
      setConfirmado(dadosResumo.variacao_confirmada ?? false)
      if (dadosResumo.variacao_modo) setModoDistrib(dadosResumo.variacao_modo)
      if (!varSelecionadaId && dadosVar.variacoes?.length) setVarSelecionadaId(dadosVar.variacoes[0].id)
    } catch (e) {
      setErro(disparoApiError(e))
    } finally {
      setLoading(false)
    }
  }, [campanhaId])

  useEffect(() => { carregarTudo() }, [carregarTudo])

  // Carrega amostra de destinatários para preview
  useEffect(() => {
    if (!campanhaId) return
    api.get(`/api/disparo/campanhas/${campanhaId}/destinatarios`, { params: { limit: 20 } })
      .then(r => setListaDestPreview(r.data?.destinatarios ?? []))
      .catch(() => {})
  }, [campanhaId])

  // ── Ações sobre variações ──────────────────────────────────────────────────

  async function handleCriar() {
    try {
      setSalvando(true)
      const v = await criarVariacao(campanhaId, { tipo_mensagem: 'texto' })
      setVariacoes(prev => [...prev, v])
      setVarSelecionadaId(v.id)
      setAbaAtiva('editor')
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setSalvando(false) }
  }

  async function handleDuplicar(varId) {
    try {
      setSalvando(true)
      const v = await duplicarVariacao(campanhaId, varId)
      setVariacoes(prev => [...prev, v])
      setVarSelecionadaId(v.id)
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setSalvando(false) }
  }

  async function handleExcluir(varId) {
    if (!window.confirm('Excluir esta variação? Esta ação não pode ser desfeita.')) return
    try {
      setExcluindoId(varId)
      await excluirVariacao(campanhaId, varId)
      const nova = variacoes.filter(v => v.id !== varId)
      setVariacoes(nova)
      if (varSelecionadaId === varId) setVarSelecionadaId(nova[0]?.id ?? null)
      await carregarResumo()
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setExcluindoId(null) }
  }

  async function handleToggleAtiva(varId, ativa) {
    try {
      const atualizada = await editarVariacao(campanhaId, varId, { ativa: !ativa })
      setVariacoes(prev => prev.map(v => v.id === varId ? atualizada : v))
      await carregarResumo()
    } catch (e) { setErro(disparoApiError(e)) }
  }

  async function handleSalvarTexto(texto) {
    if (!varSelecionadaId) return
    try {
      setSalvando(true)
      const atualizada = await editarVariacao(campanhaId, varSelecionadaId, { texto })
      setVariacoes(prev => prev.map(v => v.id === varSelecionadaId ? atualizada : v))
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setSalvando(false) }
  }

  async function handleSalvarNome(nome) {
    if (!varSelecionadaId) return
    try {
      const atualizada = await editarVariacao(campanhaId, varSelecionadaId, { nome })
      setVariacoes(prev => prev.map(v => v.id === varSelecionadaId ? atualizada : v))
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setEditandoNome(false) }
  }

  // ── Upload de mídia ────────────────────────────────────────────────────────

  async function handleUploadMidia(e) {
    const file = e.target.files?.[0]
    if (!file || !varSelecionadaId) return
    try {
      setUploadingMidia(true)
      const atualizada = await uploadMidia(campanhaId, varSelecionadaId, file)
      setVariacoes(prev => prev.map(v => v.id === varSelecionadaId ? atualizada : v))
    } catch (e2) { setErro(disparoApiError(e2)) }
    finally { setUploadingMidia(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function handleRemoverMidia() {
    if (!varSelecionadaId) return
    if (!window.confirm('Remover a mídia desta variação?')) return
    try {
      const atualizada = await removerMidia(campanhaId, varSelecionadaId)
      setVariacoes(prev => prev.map(v => v.id === varSelecionadaId ? atualizada : v))
    } catch (e) { setErro(disparoApiError(e)) }
  }

  // ── Inserir variável no cursor ─────────────────────────────────────────────

  function inserirVariavel(chave) {
    const ta = textareaRef.current
    if (!ta || !varSelecionada) return
    const inicio = ta.selectionStart ?? ta.value.length
    const fim = ta.selectionEnd ?? ta.value.length
    const textoAtual = varSelecionada.texto ?? ''
    const novoTexto = textoAtual.slice(0, inicio) + `{{${chave}}}` + textoAtual.slice(fim)
    setVariacoes(prev => prev.map(v => v.id === varSelecionadaId ? { ...v, texto: novoTexto } : v))
    setTimeout(() => {
      ta.focus()
      const pos = inicio + `{{${chave}}}`.length
      ta.setSelectionRange(pos, pos)
    }, 0)
  }

  // ── Valores padrão ─────────────────────────────────────────────────────────

  async function handleSalvarPadrao() {
    try {
      setSalvando(true)
      await salvarValoresPadrao(campanhaId, valoresPadrao)
      await carregarTudo()
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setSalvando(false) }
  }

  // ── Preview ────────────────────────────────────────────────────────────────

  async function carregarPreview(destId) {
    if (!destId) return
    try {
      setPreviewCarregando(true)
      const p = await previewDestinatario(campanhaId, destId, { variacao_id: varSelecionadaId })
      setPreview(p)
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setPreviewCarregando(false) }
  }

  useEffect(() => {
    if (previewDestId) carregarPreview(previewDestId)
  }, [previewDestId, varSelecionadaId])

  // ── Resumo / distribuição ──────────────────────────────────────────────────

  async function carregarResumo() {
    try { const r = await resumoMensagens(campanhaId); setResumo(r) } catch (_) {}
  }

  async function handlePreviewDistrib() {
    try {
      setSalvando(true)
      const config = variacoes.filter(v => v.ativa).map(v => ({
        variacao_id: v.id,
        percentual: Number(configPerc[v.id] ?? 0),
      }))
      const r = await previewDistribuicaoVariacoes(campanhaId, { modo: modoDistrib, configuracoes: config })
      setPlanoPreview(r.plano)
      if (r.erros?.length) setErro(r.erros[0])
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setSalvando(false) }
  }

  async function handleConfirmarDistrib() {
    const ok = variacoes.filter(v => v.ativa)
    if (!ok.length) return setErro('Crie e ative pelo menos uma variação antes de confirmar.')
    for (const v of ok) {
      const ausentes = contarVarsAusentesMensagem(v.texto, valoresPadrao)
      if (ausentes.length) return setErro(`Variação "${v.nome}": variáveis sem valor ou padrão: ${ausentes.join(', ')}. Configure os padrões antes de confirmar.`)
    }
    try {
      setConfirmando(true)
      const config = ok.map(v => ({ variacao_id: v.id, percentual: Number(configPerc[v.id] ?? 0) }))
      await confirmarDistribuicaoVariacoes(campanhaId, { modo: modoDistrib, configuracoes: config })
      setConfirmado(true)
      await carregarTudo()
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setConfirmando(false) }
  }

  async function handleRecalcular() {
    if (!window.confirm('Limpar a distribuição atual e recomeçar?')) return
    try {
      await recalcularDistribuicaoVariacoes(campanhaId)
      setConfirmado(false)
      setPlanoPreview(null)
      await carregarTudo()
    } catch (e) { setErro(disparoApiError(e)) }
  }

  // ── Continuar wizard ───────────────────────────────────────────────────────

  function handleContinuar() {
    if (!confirmado) return setErro('Confirme a distribuição das variações antes de continuar.')
    onNext?.()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="disparo-step-loading">
      {[1,2,3].map(i => <div key={i} className="disparo-skeleton-row" />)}
    </div>
  )

  const somaPerc = variacoes.filter(v => v.ativa).reduce((s, v) => s + Number(configPerc[v.id] ?? 0), 0)
  const varsAusentesTotal = variacoes.filter(v => v.ativa).flatMap(v => contarVarsAusentesMensagem(v.texto, valoresPadrao))
  const bloqueantes = [
    !variacoes.some(v => v.ativa) && 'Crie pelo menos uma variação ativa.',
    varsAusentesTotal.length > 0 && `Variáveis sem valor padrão: ${[...new Set(varsAusentesTotal)].join(', ')}.`,
    !confirmado && 'A distribuição de variações ainda não foi confirmada.',
  ].filter(Boolean)

  return (
    <div className="disparo-mensagens-root">

      {/* ── Cabeçalho ─────────────────────────────────────────────── */}
      <div className="disparo-step-header">
        <div>
          <h2>Etapa 4 — Mensagens</h2>
          <p className="disparo-step-sub">Configure as variações de mensagem e como serão distribuídas.</p>
        </div>
        {campanha?.variacao_revisao && (
          <div className="disparo-alerta-revisao">
            ⚠️ Destinatários ou variações mudaram após a confirmação. Revise a distribuição.
          </div>
        )}
      </div>

      {erro && (
        <div className="disparo-erro-banner">
          <span>{erro}</span>
          <button onClick={() => setErro('')} className="disparo-erro-fechar">×</button>
        </div>
      )}

      {/* ── Abas ──────────────────────────────────────────────────── */}
      <div className="disparo-abas">
        {[
          { id: 'editor',      label: '✏️ Editor' },
          { id: 'variaveis',   label: `📌 Variáveis${varsAusentesTotal.length ? ` (⚠️ ${[...new Set(varsAusentesTotal)].length})` : ''}` },
          { id: 'distribuicao',label: '⚖️ Distribuição' },
          { id: 'resumo',      label: `📊 Resumo${confirmado ? ' ✅' : ''}` },
        ].map(a => (
          <button key={a.id} className={`disparo-aba-btn${abaAtiva === a.id ? ' ativo' : ''}`} onClick={() => setAbaAtiva(a.id)}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ═══ ABA: EDITOR ════════════════════════════════════════════ */}
      {abaAtiva === 'editor' && (
        <div className="disparo-editor-layout">

          {/* Sidebar de variações */}
          <div className="disparo-variacoes-sidebar">
            <div className="disparo-sidebar-header">
              <span>Variações ({variacoes.length})</span>
              <button className="disparo-btn-icon" onClick={handleCriar} disabled={salvando} title="Nova variação">＋</button>
            </div>
            {!variacoes.length && (
              <div className="disparo-empty-state">
                <p>Nenhuma variação criada.</p>
                <button className="disparo-btn-primario" onClick={handleCriar}>Criar variação</button>
              </div>
            )}
            {variacoes.map(v => (
              <div
                key={v.id}
                className={`disparo-variacao-card${varSelecionadaId === v.id ? ' selecionado' : ''}${!v.ativa ? ' inativa' : ''}`}
                onClick={() => setVarSelecionadaId(v.id)}
              >
                <div className="disparo-var-card-header">
                  <span className="disparo-var-tipo">{ICONE_TIPO[v.tipo_mensagem] ?? '💬'}</span>
                  <span className="disparo-var-nome" title={v.nome}>{v.nome}</span>
                  {!v.ativa && <span className="disparo-var-badge-inativa">inativa</span>}
                </div>
                <div className="disparo-var-card-acoes" onClick={e => e.stopPropagation()}>
                  <button title="Duplicar" onClick={() => handleDuplicar(v.id)} className="disparo-btn-icon-sm">⧉</button>
                  <button title={v.ativa ? 'Desativar' : 'Ativar'} onClick={() => handleToggleAtiva(v.id, v.ativa)} className="disparo-btn-icon-sm">
                    {v.ativa ? '⏸' : '▶'}
                  </button>
                  <button title="Excluir" onClick={() => handleExcluir(v.id)} className="disparo-btn-icon-sm perigo" disabled={excluindoId === v.id}>
                    {excluindoId === v.id ? '…' : '🗑'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Editor central */}
          <div className="disparo-editor-central">
            {!varSelecionada ? (
              <div className="disparo-empty-state">Selecione ou crie uma variação.</div>
            ) : (
              <>
                {/* Nome */}
                <div className="disparo-editor-nome-linha">
                  {editandoNome ? (
                    <NomeEditor
                      nome={varSelecionada.nome}
                      onSalvar={handleSalvarNome}
                      onCancelar={() => setEditandoNome(false)}
                    />
                  ) : (
                    <h3 onClick={() => setEditandoNome(true)} className="disparo-editor-nome" title="Clique para editar">
                      {varSelecionada.nome} <span className="disparo-editor-editar-icon">✎</span>
                    </h3>
                  )}
                  <div className="disparo-editor-tipo-select">
                    <label>Tipo:</label>
                    <select
                      value={varSelecionada.tipo_mensagem}
                      onChange={e => editarVariacao(campanhaId, varSelecionada.id, { tipo_mensagem: e.target.value })
                        .then(a => setVariacoes(p => p.map(v => v.id === varSelecionada.id ? a : v)))}
                    >
                      {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Texto */}
                <TextEditor
                  varId={varSelecionada.id}
                  texto={varSelecionada.texto ?? ''}
                  onSalvar={handleSalvarTexto}
                  salvando={salvando}
                  textareaRef={textareaRef}
                />

                {/* Mídia */}
                {varSelecionada.tipo_mensagem !== 'texto' && (
                  <MidiaPanel
                    variacao={varSelecionada}
                    uploadingMidia={uploadingMidia}
                    fileRef={fileRef}
                    onUpload={handleUploadMidia}
                    onRemover={handleRemoverMidia}
                  />
                )}

                {/* Botão inserir variável */}
                <div className="disparo-inserir-var-barra">
                  <span>Inserir variável:</span>
                  {(catalogo?.variaveis ?? []).map(cv => (
                    <button key={cv.chave} className="disparo-var-chip" onClick={() => inserirVariavel(cv.chave)}>
                      {`{{${cv.chave}}}`}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Preview */}
          <div className="disparo-preview-panel">
            <div className="disparo-preview-header">
              <strong>Prévia</strong>
              <select
                value={previewDestId}
                onChange={e => setPreviewDestId(e.target.value)}
                className="disparo-preview-dest-select"
              >
                <option value="">Selecione destinatário…</option>
                {listaDestPreview.map(d => (
                  <option key={d.id} value={d.id}>{d.nome || d.telefone_normalizado}</option>
                ))}
              </select>
            </div>
            {previewCarregando ? (
              <div className="disparo-skeleton-row" />
            ) : preview ? (
              <PreviewBubble preview={preview} />
            ) : varSelecionada ? (
              <BubbleSimples variacao={varSelecionada} valoresPadrao={valoresPadrao} />
            ) : (
              <div className="disparo-empty-state">Selecione uma variação.</div>
            )}
          </div>
        </div>
      )}

      {/* ═══ ABA: VARIÁVEIS ═════════════════════════════════════════ */}
      {abaAtiva === 'variaveis' && (
        <div className="disparo-variaveis-layout">
          <div className="disparo-variaveis-catalogo">
            <h3>Catálogo de variáveis</h3>
            <p className="disparo-step-sub">Total de destinatários: {catalogo?.total_destinatarios ?? 0}</p>
            <table className="disparo-variaveis-table">
              <thead>
                <tr>
                  <th>Variável</th>
                  <th>Com valor</th>
                  <th>Sem valor</th>
                  <th>Exemplo</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {(catalogo?.variaveis ?? []).map(cv => (
                  <tr key={cv.chave} className={cv.sem_valor > 0 ? 'disparo-var-linha-alerta' : ''}>
                    <td><code>{`{{${cv.chave}}}`}</code>{cv.sistema && <span className="disparo-var-badge-sistema">sistema</span>}</td>
                    <td className="disparo-var-td-ok">{cv.total_com_valor}</td>
                    <td className={cv.sem_valor > 0 ? 'disparo-var-td-erro' : ''}>{cv.sem_valor}</td>
                    <td className="disparo-var-td-exemplo">{cv.exemplo ?? '—'}</td>
                    <td>
                      <button className="disparo-var-chip" onClick={() => inserirVariavel(cv.chave)}>
                        Inserir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="disparo-variaveis-padrao">
            <h3>Valores padrão</h3>
            <p className="disparo-step-sub">Defina o valor a usar quando o destinatário não tiver a variável preenchida.</p>
            {(catalogo?.variaveis ?? []).filter(cv => !cv.sistema && cv.sem_valor > 0).map(cv => (
              <div key={cv.chave} className="disparo-padrao-linha">
                <label>
                  <code>{`{{${cv.chave}}}`}</code>
                  <span className="disparo-padrao-hint">{cv.sem_valor} sem valor</span>
                </label>
                <input
                  type="text"
                  placeholder={`Padrão para ${cv.chave}…`}
                  value={valoresPadrao[cv.chave] ?? ''}
                  onChange={e => setValoresPadrao(p => ({ ...p, [cv.chave]: e.target.value }))}
                  className="disparo-padrao-input"
                  maxLength={200}
                />
              </div>
            ))}
            {(catalogo?.variaveis ?? []).filter(cv => !cv.sistema && cv.sem_valor > 0).length === 0 && (
              <p className="disparo-ok-msg">✅ Todos os destinatários têm valores para as variáveis usadas.</p>
            )}
            <button className="disparo-btn-primario" onClick={handleSalvarPadrao} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar valores padrão'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ ABA: DISTRIBUIÇÃO ══════════════════════════════════════ */}
      {abaAtiva === 'distribuicao' && (
        <div className="disparo-distrib-layout">
          <div className="disparo-distrib-modos">
            <h3>Modo de distribuição</h3>
            {MODOS.map(m => (
              <label key={m.value} className={`disparo-modo-card${modoDistrib === m.value ? ' selecionado' : ''}`}>
                <input type="radio" name="modo" value={m.value} checked={modoDistrib === m.value} onChange={() => setModoDistrib(m.value)} />
                <div>
                  <strong>{m.label}</strong>
                  <p>{m.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {modoDistrib === 'percentual' && (
            <div className="disparo-distrib-percentual">
              <h4>Percentuais</h4>
              {variacoes.filter(v => v.ativa).map(v => (
                <div key={v.id} className="disparo-perc-linha">
                  <span>{v.nome}</span>
                  <input
                    type="number" min="0" max="100" step="1"
                    value={configPerc[v.id] ?? ''}
                    onChange={e => setConfigPerc(p => ({ ...p, [v.id]: e.target.value }))}
                    className="disparo-perc-input"
                  />
                  <span>%</span>
                </div>
              ))}
              <div className={`disparo-perc-soma${Math.abs(somaPerc - 100) > 0.01 ? ' erro' : ' ok'}`}>
                Soma: {somaPerc.toFixed(1)}%{Math.abs(somaPerc - 100) > 0.01 ? ' (deve ser 100%)' : ' ✅'}
              </div>
            </div>
          )}

          <div className="disparo-distrib-acoes">
            <button className="disparo-btn-secundario" onClick={handlePreviewDistrib} disabled={salvando}>
              {salvando ? 'Calculando…' : 'Calcular prévia'}
            </button>
            {planoPreview && <DistribuicaoPreview plano={planoPreview} totalDestinatarios={totalDestinatarios} />}
          </div>

          {confirmado ? (
            <div className="disparo-confirmado-banner">
              ✅ Distribuição confirmada.{campanha?.variacao_revisao ? ' ⚠️ Revisão necessária.' : ''}
              <button className="disparo-btn-link" onClick={handleRecalcular}>Recalcular</button>
            </div>
          ) : (
            <button className="disparo-btn-primario" onClick={handleConfirmarDistrib} disabled={confirmando || bloqueantes.length > 0}>
              {confirmando ? 'Confirmando…' : 'Confirmar distribuição'}
            </button>
          )}

          {bloqueantes.length > 0 && (
            <ul className="disparo-bloqueantes">
              {bloqueantes.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* ═══ ABA: RESUMO ════════════════════════════════════════════ */}
      {abaAtiva === 'resumo' && (
        <div className="disparo-resumo-layout">
          {resumo && <ResumoMensagens resumo={resumo} />}
        </div>
      )}

      {/* ── Rodapé do wizard ──────────────────────────────────────── */}
      <div className="disparo-wizard-footer">
        <button className="disparo-btn-secundario" onClick={onBack}>Voltar</button>
        <div className="disparo-footer-right">
          <button className="disparo-btn-secundario" onClick={carregarTudo}>Salvar rascunho</button>
          <button
            className="disparo-btn-primario"
            onClick={handleContinuar}
            disabled={bloqueantes.length > 0}
            title={bloqueantes.length ? bloqueantes[0] : ''}
          >
            Continuar →
          </button>
        </div>
      </div>

    </div>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function NomeEditor({ nome, onSalvar, onCancelar }) {
  const [v, setV] = useState(nome)
  return (
    <div className="disparo-nome-editor">
      <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSalvar(v); if (e.key === 'Escape') onCancelar() }} autoFocus maxLength={100} className="disparo-nome-input" />
      <button onClick={() => onSalvar(v)} className="disparo-btn-icon">✓</button>
      <button onClick={onCancelar} className="disparo-btn-icon">✕</button>
    </div>
  )
}

function TextEditor({ varId, texto, onSalvar, salvando, textareaRef }) {
  const [local, setLocal] = useState(texto)
  const timerRef = useRef(null)

  useEffect(() => { setLocal(texto) }, [varId, texto])

  function handleChange(e) {
    const val = e.target.value
    setLocal(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSalvar(val), 1200)
  }

  const excedido = local.length > 4000

  return (
    <div className="disparo-textarea-wrap">
      <textarea
        ref={textareaRef}
        value={local}
        onChange={handleChange}
        placeholder="Digite o texto da mensagem…&#10;&#10;Use {{nome}}, {{telefone}}, {{cidade}} para personalizar."
        rows={8}
        className={`disparo-textarea${excedido ? ' excedido' : ''}`}
        maxLength={5000}
      />
      <div className="disparo-textarea-footer">
        <span className={`disparo-char-count${excedido ? ' excedido' : ''}`}>{local.length} / 5000</span>
        {excedido && <span className="disparo-alerta-longo">⚠️ Texto muito longo para WhatsApp</span>}
        {salvando && <span className="disparo-salvando-hint">salvando…</span>}
      </div>
    </div>
  )
}

function MidiaPanel({ variacao, uploadingMidia, fileRef, onUpload, onRemover }) {
  const aceitaMime = variacao.tipo_mensagem === 'imagem'    ? 'image/jpeg,image/png,image/webp,image/gif'
                   : variacao.tipo_mensagem === 'video'     ? 'video/mp4,video/3gpp,video/quicktime'
                   : variacao.tipo_mensagem === 'audio'     ? 'audio/mpeg,audio/ogg,audio/aac,audio/opus'
                   : /* documento */ '.pdf,.docx,.doc,.xlsx,.xls,.pptx,.txt,.csv,.zip'

  return (
    <div className="disparo-midia-panel">
      <div className="disparo-midia-label">
        <strong>Mídia</strong>
        <span className="disparo-midia-tipo-hint">({variacao.tipo_mensagem})</span>
      </div>

      {variacao.midia_url ? (
        <div className="disparo-midia-preview">
          {variacao.tipo_mensagem === 'imagem' && <img src={variacao.midia_url} alt={variacao.midia_nome_original} className="disparo-midia-thumb" />}
          {variacao.tipo_mensagem === 'audio'  && <audio controls src={variacao.midia_url} className="disparo-midia-audio" />}
          {variacao.tipo_mensagem === 'video'  && <video controls src={variacao.midia_url} className="disparo-midia-video" />}
          {variacao.tipo_mensagem === 'documento' && (
            <div className="disparo-midia-doc">
              📄 {variacao.midia_nome_original} ({variacao.midia_mime}) — {Math.round((variacao.midia_tamanho ?? 0) / 1024)} KB
            </div>
          )}
          <button onClick={onRemover} className="disparo-btn-link perigo">Remover mídia</button>
        </div>
      ) : (
        <div className="disparo-midia-upload">
          <input ref={fileRef} type="file" accept={aceitaMime} onChange={onUpload} id="midia-upload-input" style={{ display: 'none' }} />
          <label htmlFor="midia-upload-input" className={`disparo-upload-label${uploadingMidia ? ' carregando' : ''}`}>
            {uploadingMidia ? '⏳ Enviando…' : '📎 Selecionar arquivo'}
          </label>
          <span className="disparo-midia-hint">
            {variacao.tipo_mensagem === 'imagem' && 'JPG, PNG, WebP, GIF — máx 5 MB'}
            {variacao.tipo_mensagem === 'video'  && 'MP4, 3GP, MOV — máx 32 MB'}
            {variacao.tipo_mensagem === 'audio'  && 'MP3, OGG, AAC, Opus — máx 16 MB'}
            {variacao.tipo_mensagem === 'documento' && 'PDF, DOCX, XLSX, etc. — máx 100 MB'}
          </span>
        </div>
      )}
    </div>
  )
}

function BubbleSimples({ variacao, valoresPadrao }) {
  const textoExibido = substituirVarsLocal(variacao.texto ?? '', { nome: 'Destinatário', telefone: '11999999999', ...valoresPadrao })
  return (
    <div className="disparo-bubble-wrap">
      {variacao.midia_url && variacao.tipo_mensagem === 'imagem' && (
        <img src={variacao.midia_url} alt="prévia" className="disparo-bubble-img" />
      )}
      {variacao.midia_url && variacao.tipo_mensagem === 'audio' && (
        <audio controls src={variacao.midia_url} className="disparo-bubble-audio" />
      )}
      {variacao.midia_url && variacao.tipo_mensagem === 'documento' && (
        <div className="disparo-bubble-doc">📄 {variacao.midia_nome_original}</div>
      )}
      {textoExibido && (
        <div className="disparo-bubble">
          <p className="disparo-bubble-text">{textoExibido}</p>
          <span className="disparo-bubble-hora">12:00</span>
        </div>
      )}
      {!textoExibido && !variacao.midia_url && <p className="disparo-empty-state">Sem conteúdo ainda.</p>}
    </div>
  )
}

function PreviewBubble({ preview }) {
  return (
    <div className="disparo-bubble-wrap">
      <div className="disparo-preview-info">
        <strong>{preview.destinatario?.nome || preview.destinatario?.telefone}</strong>
        <span className="disparo-preview-var-nome">Variação: {preview.variacao?.nome ?? 'não atribuída'}</span>
        {preview.variaveis_ausentes?.length > 0 && (
          <span className="disparo-preview-alerta">⚠️ Variáveis sem valor: {preview.variaveis_ausentes.join(', ')}</span>
        )}
      </div>
      {preview.variacao?.midia_url && preview.variacao?.tipo_mensagem === 'imagem' && (
        <img src={preview.variacao.midia_url} alt="prévia" className="disparo-bubble-img" />
      )}
      {preview.variacao?.midia_url && preview.variacao?.tipo_mensagem === 'audio' && (
        <audio controls src={preview.variacao.midia_url} className="disparo-bubble-audio" />
      )}
      {preview.variacao?.midia_url && preview.variacao?.tipo_mensagem === 'documento' && (
        <div className="disparo-bubble-doc">📄 {preview.variacao.midia_nome_original}</div>
      )}
      {preview.texto_substituido && (
        <div className="disparo-bubble">
          <p className="disparo-bubble-text">{preview.texto_substituido}</p>
          <span className="disparo-bubble-hora">12:00</span>
        </div>
      )}
    </div>
  )
}

function DistribuicaoPreview({ plano, totalDestinatarios }) {
  const N = plano.total || totalDestinatarios || 1
  return (
    <div className="disparo-distrib-preview">
      <h4>Prévia da distribuição</h4>
      {(plano.variacoes ?? []).map(vp => (
        <div key={vp.variacao_id} className="disparo-distrib-barra-linha">
          <span className="disparo-distrib-barra-nome">{vp.nome}</span>
          <div className="disparo-distrib-barra-fundo">
            <div className="disparo-distrib-barra-fill" style={{ width: `${vp.percentual}%` }} />
          </div>
          <span className="disparo-distrib-barra-pct">{vp.quantidade} ({vp.percentual}%)</span>
        </div>
      ))}
      {(plano.sem_variacao ?? 0) > 0 && (
        <p className="disparo-alerta-sem-var">⚠️ {plano.sem_variacao} destinatário(s) sem variação atribuída.</p>
      )}
    </div>
  )
}

function ResumoMensagens({ resumo }) {
  return (
    <div className="disparo-resumo">
      <h3>Resumo das mensagens</h3>
      <div className="disparo-resumo-grid">
        <div className="disparo-resumo-card">
          <strong>{(resumo.variacoes ?? []).filter(v => v.ativa).length}</strong>
          <span>Variações ativas</span>
        </div>
        <div className="disparo-resumo-card">
          <strong>{resumo.total_destinatarios}</strong>
          <span>Total de destinatários</span>
        </div>
        <div className={`disparo-resumo-card${(resumo.sem_variacao ?? 0) > 0 ? ' alerta' : ''}`}>
          <strong>{resumo.sem_variacao ?? 0}</strong>
          <span>Sem variação</span>
        </div>
        <div className={`disparo-resumo-card${resumo.variacao_confirmada ? ' ok' : ''}`}>
          <strong>{resumo.variacao_confirmada ? '✅' : '⏳'}</strong>
          <span>Distribuição {resumo.variacao_confirmada ? 'confirmada' : 'pendente'}</span>
        </div>
      </div>

      <table className="disparo-resumo-table">
        <thead>
          <tr>
            <th>Variação</th>
            <th>Tipo</th>
            <th>Destinatários</th>
            <th>% real</th>
            <th>Ativa</th>
          </tr>
        </thead>
        <tbody>
          {(resumo.variacoes ?? []).map(v => (
            <tr key={v.id}>
              <td>{v.nome}</td>
              <td>{ICONE_TIPO[v.tipo_mensagem]} {v.tipo_mensagem}</td>
              <td>{v.destinatarios_atribuidos ?? 0}</td>
              <td>{v.percentual_real ?? 0}%</td>
              <td>{v.ativa ? '✅' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {resumo.variacao_revisao && (
        <div className="disparo-alerta-revisao">⚠️ Necessita revisão após alterações recentes.</div>
      )}
    </div>
  )
}
