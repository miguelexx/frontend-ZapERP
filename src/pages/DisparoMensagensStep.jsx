import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  listarVariacoes, criarVariacao, editarVariacao, duplicarVariacao, excluirVariacao,
  reordenarVariacoes, uploadMidia, removerMidia, catalogoVariaveis, salvarValoresPadrao,
  previewDestinatario, resumoMensagens, previewDistribuicaoVariacoes,
  confirmarDistribuicaoVariacoes, atribuirVariacaoManual, recalcularDistribuicaoVariacoes,
  disparoApiError,
} from '../api/disparoVariacoesService'
import api from '../api/http'

// ── Constantes ────────────────────────────────────────────────────────────────

const TIPOS = [
  { value: 'texto',     label: 'Texto',     icon: '💬', color: '#128c7e', desc: 'Somente texto' },
  { value: 'imagem',   label: 'Imagem',     icon: '🖼️',  color: '#8b5cf6', desc: 'Imagem com legenda' },
  { value: 'video',    label: 'Vídeo',      icon: '🎬', color: '#ef4444', desc: 'Vídeo com legenda' },
  { value: 'audio',    label: 'Áudio',      icon: '🎵', color: '#f59e0b', desc: 'Arquivo de áudio' },
  { value: 'documento',label: 'Documento',  icon: '📄', color: '#3b82f6', desc: 'PDF, planilha ou arquivo' },
]

const MODOS_DIST = [
  {
    value: 'unica', icon: '🎯',
    label: 'Variação única',
    desc: 'Todos os destinatários recebem exatamente a mesma mensagem.',
  },
  {
    value: 'equilibrada', icon: '⚖️',
    label: 'Distribuição equilibrada',
    desc: 'As variações são divididas de forma uniforme entre os destinatários.',
  },
  {
    value: 'percentual', icon: '📊',
    label: 'Por percentual',
    desc: 'Você define a porcentagem de cada variação. O total deve ser 100%.',
  },
  {
    value: 'manual', icon: '✋',
    label: 'Atribuição manual',
    desc: 'Você escolhe a variação de cada destinatário individualmente ou em lote.',
  },
]

const TIPO_MAP = Object.fromEntries(TIPOS.map(t => [t.value, t]))

// ── Helpers ───────────────────────────────────────────────────────────────────

function normKey(chave) {
  return String(chave ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '')
}

function substituirVarsLocal(texto, vars = {}) {
  if (!texto) return texto
  return texto.replace(/\{\{([^{}]{1,100})\}\}/g, (_, chave) => {
    const k = normKey(chave)
    const v = vars[k] ?? vars[chave.trim().toLowerCase()]
    return v !== undefined && v !== null && String(v) !== '' ? String(v) : `[${k}?]`
  })
}

function extrairVarsTexto(texto) {
  const regex = /\{\{([^{}]{1,100})\}\}/g
  const s = new Set(); let m
  while ((m = regex.exec(texto || '')) !== null) {
    const k = normKey(m[1])
    if (k && !['__proto__','constructor','prototype'].includes(k)) s.add(k)
  }
  return [...s]
}

function varsAusentes(texto, padrao = {}) {
  return extrairVarsTexto(texto).filter(k => k !== 'nome' && k !== 'telefone' && !padrao[k])
}

function getEditorial(variacao) {
  if (!variacao) return ''
  if (variacao.tipo_mensagem === 'texto') return variacao.texto ?? ''
  return variacao.legenda ?? variacao.texto ?? ''
}

function editorialLabel(tipo) {
  return tipo === 'texto' ? 'Texto da mensagem' : 'Legenda'
}

function fmtBytes(n) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function DisparoMensagensStep({ campanhaId, totalDestinatarios, onBack, onNext }) {
  const [loading, setLoading]         = useState(true)
  const [variacoes, setVariacoes]     = useState([])
  const [campanha, setCampanha]       = useState(null)
  const [varAtiva, setVarAtiva]       = useState(null)     // id da variação selecionada
  const [erro, setErro]               = useState('')
  const [salvando, setSalvando]       = useState(false)
  const [catalogo, setCatalogo]       = useState(null)
  const [valoresPadrao, setValoresPadrao] = useState({})
  const [resumo, setResumo]           = useState(null)
  const [confirmado, setConfirmado]   = useState(false)
  const [revisao, setRevisao]         = useState(false)

  // Distribuição
  const [modoDistrib, setModoDistrib] = useState('equilibrada')
  const [configPerc, setConfigPerc]   = useState({})
  const [plano, setPlano]             = useState(null)
  const [calculando, setCalculando]   = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  // Preview
  const [previewDest, setPreviewDest]         = useState(null)
  const [previewData, setPreviewData]         = useState(null)
  const [previewLoading, setPreviewLoading]   = useState(false)
  const [listaDest, setListaDest]             = useState([])

  // Mídia
  const [uploadingMidia, setUploadingMidia]   = useState(false)
  const fileRef  = useRef(null)
  const textaRef = useRef(null)

  // Aba ativa no painel direito
  const [painelDir, setPainelDir] = useState('preview') // preview | variaveis | distribuicao

  const varSel = variacoes.find(v => v.id === varAtiva) ?? null

  // ── Carga inicial ─────────────────────────────────────────────────────────

  const carregar = useCallback(async () => {
    try {
      setLoading(true)
      const [resVar, resCat, resRes] = await Promise.all([
        listarVariacoes(campanhaId),
        catalogoVariaveis(campanhaId),
        resumoMensagens(campanhaId),
      ])
      setVariacoes(resVar.variacoes ?? [])
      setCampanha(resVar.campanha)
      setCatalogo(resCat)
      setValoresPadrao(resCat.valores_padrao ?? {})
      setResumo(resRes)
      setConfirmado(resRes.variacao_confirmada ?? false)
      setRevisao(resRes.variacao_revisao ?? false)
      if (resRes.variacao_modo) setModoDistrib(resRes.variacao_modo)
      if (!varAtiva && resVar.variacoes?.length) setVarAtiva(resVar.variacoes[0].id)
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setLoading(false) }
  }, [campanhaId])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!campanhaId) return
    api.get(`/api/disparo/campanhas/${campanhaId}/destinatarios`, { params: { limit: 50 } })
      .then(r => setListaDest(r.data?.destinatarios ?? []))
      .catch(() => {})
  }, [campanhaId])

  useEffect(() => {
    if (previewDest && varAtiva) carregarPreview(previewDest)
  }, [previewDest, varAtiva])

  // ── Variações ─────────────────────────────────────────────────────────────

  async function criarNovaVariacao() {
    try {
      setSalvando(true)
      const ct = variacoes.length
      const v = await criarVariacao(campanhaId, {
        tipo_mensagem: 'texto',
        nome: `Variação ${String.fromCharCode(65 + ct)}`,
      })
      setVariacoes(p => [...p, v])
      setVarAtiva(v.id)
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setSalvando(false) }
  }

  async function handleDuplicar(id) {
    try {
      setSalvando(true)
      const v = await duplicarVariacao(campanhaId, id)
      setVariacoes(p => [...p, v])
      setVarAtiva(v.id)
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setSalvando(false) }
  }

  async function handleExcluir(id) {
    if (!window.confirm('Excluir esta variação? Esta ação não pode ser desfeita.')) return
    try {
      await excluirVariacao(campanhaId, id)
      const nova = variacoes.filter(v => v.id !== id)
      setVariacoes(nova)
      if (varAtiva === id) setVarAtiva(nova[0]?.id ?? null)
      await atualizarResumo()
    } catch (e) { setErro(disparoApiError(e)) }
  }

  async function handleToggle(id, ativa) {
    try {
      const a = await editarVariacao(campanhaId, id, { ativa: !ativa })
      setVariacoes(p => p.map(v => v.id === id ? a : v))
      await atualizarResumo()
    } catch (e) { setErro(disparoApiError(e)) }
  }

  async function salvarEditorial(conteudo) {
    if (!varAtiva || !varSel) return
    try {
      const payload = varSel.tipo_mensagem === 'texto'
        ? { texto: conteudo }
        : { legenda: conteudo }
      const a = await editarVariacao(campanhaId, varAtiva, payload)
      setVariacoes(p => p.map(v => v.id === varAtiva ? a : v))
    } catch (e) { setErro(disparoApiError(e)) }
  }

  async function salvarNome(nome) {
    if (!varAtiva) return
    try {
      const a = await editarVariacao(campanhaId, varAtiva, { nome })
      setVariacoes(p => p.map(v => v.id === varAtiva ? a : v))
    } catch (e) { setErro(disparoApiError(e)) }
  }

  async function salvarTipo(tipo) {
    if (!varAtiva) return
    try {
      const a = await editarVariacao(campanhaId, varAtiva, { tipo_mensagem: tipo })
      setVariacoes(p => p.map(v => v.id === varAtiva ? a : v))
    } catch (e) { setErro(disparoApiError(e)) }
  }

  // ── Mídia ─────────────────────────────────────────────────────────────────

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !varAtiva) return
    try {
      setUploadingMidia(true)
      const a = await uploadMidia(campanhaId, varAtiva, file)
      setVariacoes(p => p.map(v => v.id === varAtiva ? a : v))
    } catch (e2) { setErro(disparoApiError(e2)) }
    finally { setUploadingMidia(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function handleRemoverMidia() {
    if (!varAtiva || !window.confirm('Remover a mídia desta variação?')) return
    try {
      const a = await removerMidia(campanhaId, varAtiva)
      setVariacoes(p => p.map(v => v.id === varAtiva ? a : v))
    } catch (e) { setErro(disparoApiError(e)) }
  }

  // ── Variáveis ─────────────────────────────────────────────────────────────

  function inserirVar(chave) {
    const ta = textaRef.current
    if (!ta || !varSel) return
    const s = ta.selectionStart ?? ta.value.length
    const e = ta.selectionEnd ?? ta.value.length
    const atual = getEditorial(varSel)
    const novo  = atual.slice(0, s) + `{{${chave}}}` + atual.slice(e)
    const patch = varSel.tipo_mensagem === 'texto'
      ? { texto: novo }
      : { legenda: novo, texto: varSel.texto }
    setVariacoes(p => p.map(v => v.id === varAtiva ? { ...v, ...patch } : v))
    setTimeout(() => {
      ta.focus()
      const pos = s + `{{${chave}}}`.length
      ta.setSelectionRange(pos, pos)
    }, 0)
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  async function carregarPreview(destId) {
    if (!destId) return
    try {
      setPreviewLoading(true)
      const p = await previewDestinatario(campanhaId, destId, { variacao_id: varAtiva })
      setPreviewData(p)
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setPreviewLoading(false) }
  }

  // ── Distribuição ──────────────────────────────────────────────────────────

  async function calcularPlano() {
    try {
      setCalculando(true)
      const config = variacoes.filter(v => v.ativa).map(v => ({
        variacao_id: v.id, percentual: Number(configPerc[v.id] ?? 0),
      }))
      const r = await previewDistribuicaoVariacoes(campanhaId, { modo: modoDistrib, configuracoes: config })
      setPlano(r.plano)
      if (r.erros?.length) setErro(r.erros[0])
    } catch (e) { setErro(disparoApiError(e)) }
    finally { setCalculando(false) }
  }

  async function handleConfirmar() {
    const ausentes = variacoes.filter(v => v.ativa).flatMap(v => varsAusentes(getEditorial(v), valoresPadrao))
    if ([...new Set(ausentes)].length) {
      setErro(`Variáveis sem valor padrão: ${[...new Set(ausentes)].join(', ')}. Configure os padrões antes de confirmar.`)
      return false
    }
    try {
      setConfirmando(true)
      const config = variacoes.filter(v => v.ativa).map(v => ({
        variacao_id: v.id, percentual: Number(configPerc[v.id] ?? 0),
      }))
      await confirmarDistribuicaoVariacoes(campanhaId, { modo: modoDistrib, configuracoes: config })
      setConfirmado(true)
      setRevisao(false)
      await carregar()
      return true
    } catch (e) { setErro(disparoApiError(e)); return false }
    finally { setConfirmando(false) }
  }

  // Salva os valores padrão sem exigir clique (autosave ao sair do campo).
  async function salvarPadroesSilent() {
    try { await salvarValoresPadrao(campanhaId, valoresPadrao) }
    catch (e) { setErro(disparoApiError(e)) }
  }

  // Botão único do rodapé: confirma a distribuição (se preciso) e avança.
  async function handleContinuar() {
    if (!ativas.length) { setErro('Crie pelo menos uma variação ativa.'); return }
    const ausentes = ativas.flatMap(v => varsAusentes(getEditorial(v), valoresPadrao))
    if ([...new Set(ausentes)].length) {
      setPainelDir('variaveis')
      setErro(`Variáveis sem valor padrão: ${[...new Set(ausentes)].join(', ')}. Preencha antes de continuar.`)
      return
    }
    if (modoDistrib === 'percentual' &&
        Math.abs(ativas.reduce((s, v) => s + Number(configPerc[v.id] ?? 0), 0) - 100) > 0.01) {
      setPainelDir('distribuicao')
      setErro('A soma dos percentuais precisa ser 100% antes de continuar.')
      return
    }
    if (!confirmado || revisao) {
      const ok = await handleConfirmar()
      if (!ok) return
    }
    onNext?.()
  }

  async function handleRecalcular() {
    if (!window.confirm('Limpar a distribuição atual e recomeçar do zero?')) return
    try {
      await recalcularDistribuicaoVariacoes(campanhaId)
      setConfirmado(false); setPlano(null)
      await carregar()
    } catch (e) { setErro(disparoApiError(e)) }
  }

  async function atualizarResumo() {
    try { const r = await resumoMensagens(campanhaId); setResumo(r) } catch (_) {}
  }

  // ── Bloqueantes para "Continuar" ──────────────────────────────────────────

  const ativas = variacoes.filter(v => v.ativa)
  const todasVarsOk = ativas.every(v => varsAusentes(getEditorial(v), valoresPadrao).length === 0)
  const totalAusentes = ativas.flatMap(v => varsAusentes(getEditorial(v), valoresPadrao))
  const bloqueantes = [
    !ativas.length        && 'Crie pelo menos uma variação ativa.',
    !todasVarsOk          && `Variáveis sem padrão: ${[...new Set(totalAusentes)].join(', ')}.`,
  ].filter(Boolean)

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <MensagensLoading />

  return (
    <div className="msg-root">

      {/* ── Erro global ───────────────────────────────── */}
      {erro && (
        <div className="msg-erro">
          <span className="msg-erro__icon">⚠️</span>
          <span className="msg-erro__txt">{erro}</span>
          <button className="msg-erro__close" onClick={() => setErro('')}>✕</button>
        </div>
      )}

      {/* ── Revisão necessária ────────────────────────── */}
      {revisao && !erro && (
        <div className="msg-aviso">
          <span>⚠️</span>
          <span>Destinatários ou variações foram alterados após a confirmação. Revise a distribuição antes de continuar.</span>
          <button className="msg-aviso__btn" onClick={() => setPainelDir('distribuicao')}>Ir para distribuição →</button>
        </div>
      )}

      {/* ── Layout de 3 colunas ───────────────────────── */}
      <div className="msg-layout">

        {/* ╔══════════════════════════╗
            ║  Coluna 1 — Variações   ║
            ╚══════════════════════════╝ */}
        <aside className="msg-sidebar">

          <div className="msg-sidebar__header">
            <div>
              <p className="msg-sidebar__titulo">Variações</p>
              <p className="msg-sidebar__sub">{ativas.length} ativa{ativas.length !== 1 ? 's' : ''} de {variacoes.length}</p>
            </div>
            <button className="msg-add-btn" onClick={criarNovaVariacao} disabled={salvando} title="Nova variação">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Nova
            </button>
          </div>

          {!variacoes.length ? (
            <div className="msg-sidebar__empty">
              <div className="msg-sidebar__empty-icon">💬</div>
              <p className="msg-sidebar__empty-txt">Nenhuma variação ainda</p>
              <button className="msg-btn-primary msg-btn--sm" onClick={criarNovaVariacao}>
                Criar primeira variação
              </button>
            </div>
          ) : (
            <ul className="msg-var-list">
              {variacoes.map(v => {
                const tipo = TIPO_MAP[v.tipo_mensagem] ?? TIPO_MAP.texto
                const ausentes = varsAusentes(getEditorial(v), valoresPadrao)
                return (
                  <li
                    key={v.id}
                    className={`msg-var-item${varAtiva === v.id ? ' is-active' : ''}${!v.ativa ? ' is-inactive' : ''}`}
                    onClick={() => setVarAtiva(v.id)}
                  >
                    <div className="msg-var-item__tipo-dot" style={{ background: tipo.color }} />
                    <div className="msg-var-item__body">
                      <span className="msg-var-item__nome">{v.nome}</span>
                      <div className="msg-var-item__meta">
                        <span className="msg-var-item__badge" style={{ background: tipo.color + '18', color: tipo.color }}>
                          {tipo.icon} {tipo.label}
                        </span>
                        {!v.ativa && <span className="msg-var-item__badge msg-badge--off">pausada</span>}
                        {ausentes.length > 0 && <span className="msg-var-item__badge msg-badge--warn">⚠ vars</span>}
                      </div>
                    </div>
                    <div className="msg-var-item__acoes" onClick={e => e.stopPropagation()}>
                      <button
                        className="msg-icon-btn"
                        title="Duplicar variação"
                        onClick={() => handleDuplicar(v.id)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                      </button>
                      <button
                        className="msg-icon-btn"
                        title={v.ativa ? 'Pausar variação' : 'Ativar variação'}
                        onClick={() => handleToggle(v.id, v.ativa)}
                      >
                        {v.ativa
                          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                          : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        }
                      </button>
                      <button
                        className="msg-icon-btn msg-icon-btn--danger"
                        title="Excluir variação"
                        onClick={() => handleExcluir(v.id)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* ╔══════════════════════════╗
            ║  Coluna 2 — Editor      ║
            ╚══════════════════════════╝ */}
        <main className="msg-editor">
          {!varSel ? (
            <div className="msg-editor__empty">
              <div className="msg-editor__empty-icon">✏️</div>
              <p className="msg-editor__empty-title">Nenhuma variação selecionada</p>
              <p className="msg-editor__empty-desc">Selecione uma variação na lista ou crie uma nova para começar a editar.</p>
              <button className="msg-btn-primary" onClick={criarNovaVariacao}>Criar variação</button>
            </div>
          ) : (
            <>
              {/* Cabeçalho do editor */}
              <div className="msg-editor__header">
                <NomeInline nome={varSel.nome} onSalvar={salvarNome} />
                <div className="msg-editor__tipo-row">
                  <span className="msg-editor__tipo-label">Tipo de mensagem</span>
                  <div className="msg-tipo-pills">
                    {TIPOS.map(t => (
                      <button
                        key={t.value}
                        className={`msg-tipo-pill${varSel.tipo_mensagem === t.value ? ' is-active' : ''}`}
                        style={varSel.tipo_mensagem === t.value ? { '--pill-color': t.color } : {}}
                        onClick={() => salvarTipo(t.value)}
                        title={t.desc}
                      >
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Área de texto */}
              <TextareaEditor
                varId={varSel.id}
                tipo={varSel.tipo_mensagem}
                texto={getEditorial(varSel)}
                onSalvar={salvarEditorial}
                onRef={r => { textaRef.current = r }}
              />

              {/* Variáveis rápidas */}
              {catalogo?.variaveis?.length > 0 && (
                <div className="msg-vars-barra">
                  <span className="msg-vars-barra__label">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                    Inserir variável:
                  </span>
                  <div className="msg-vars-chips">
                    {catalogo.variaveis.map(cv => (
                      <button
                        key={cv.chave}
                        className={`msg-var-chip${cv.sem_valor > 0 ? ' msg-var-chip--warn' : ''}`}
                        onClick={() => inserirVar(cv.chave)}
                        title={cv.sem_valor > 0 ? `${cv.sem_valor} destinatário(s) sem este valor` : `Exemplo: ${cv.exemplo ?? '—'}`}
                      >
                        {`{{${cv.chave}}}`}
                        {cv.sem_valor > 0 && <span className="msg-var-chip__warn">!</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Painel de mídia */}
              {varSel.tipo_mensagem !== 'texto' && (
                <MidiaUpload
                  variacao={varSel}
                  uploading={uploadingMidia}
                  fileRef={fileRef}
                  onUpload={handleUpload}
                  onRemover={handleRemoverMidia}
                />
              )}

              {/* Alertas de variáveis ausentes */}
              {varsAusentes(getEditorial(varSel), valoresPadrao).length > 0 && (
                <div className="msg-alerta-vars">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <div>
                    <strong>Variáveis sem valor padrão:</strong>{' '}
                    {varsAusentes(getEditorial(varSel), valoresPadrao).map(k => (
                      <code key={k} className="msg-var-ausente-code">{`{{${k}}}`}</code>
                    ))}
                    <button className="msg-link" onClick={() => setPainelDir('variaveis')}>
                      Definir padrões →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* ╔══════════════════════════════════╗
            ║  Coluna 3 — Painel direito      ║
            ╚══════════════════════════════════╝ */}
        <aside className="msg-painel">

          {/* Abas do painel */}
          <div className="msg-painel__abas">
            {[
              { id: 'preview',      icon: '👁️',  label: 'Prévia' },
              { id: 'variaveis',    icon: '🏷️',  label: 'Variáveis' },
              { id: 'distribuicao', icon: '⚖️',  label: 'Distribuição' },
            ].map(a => (
              <button
                key={a.id}
                className={`msg-painel__aba${painelDir === a.id ? ' is-active' : ''}`}
                onClick={() => setPainelDir(a.id)}
              >
                <span>{a.icon}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>

          {/* ── Prévia ──────────────────────────────── */}
          {painelDir === 'preview' && (
            <div className="msg-preview-area">
              <div className="msg-preview__dest-row">
                <label className="msg-preview__dest-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Destinatário para prévia
                </label>
                <select
                  className="msg-select"
                  value={previewDest ?? ''}
                  onChange={e => setPreviewDest(e.target.value || null)}
                >
                  <option value="">Selecionar destinatário…</option>
                  {listaDest.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.nome || d.telefone_normalizado}
                    </option>
                  ))}
                </select>
              </div>

              <div className="msg-wa-bg">
                {previewLoading ? (
                  <div className="msg-preview__loading">Carregando prévia…</div>
                ) : previewData ? (
                  <ChatPreview data={previewData} />
                ) : varSel ? (
                  <ChatBubbleSimples variacao={varSel} padrao={valoresPadrao} />
                ) : (
                  <div className="msg-preview__empty">Selecione uma variação para ver a prévia</div>
                )}
              </div>

              {previewData?.variaveis_ausentes?.length > 0 && (
                <div className="msg-preview__vars-ausentes">
                  ⚠️ Variáveis não preenchidas para este destinatário:{' '}
                  {previewData.variaveis_ausentes.map(k => (
                    <code key={k} className="msg-var-ausente-code">{`{{${k}}}`}</code>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Variáveis ────────────────────────────── */}
          {painelDir === 'variaveis' && (
            <div className="msg-vars-area">
              <div className="msg-section-header">
                <div>
                  <p className="msg-section-title">Catálogo de variáveis</p>
                  <p className="msg-section-sub">
                    {catalogo?.total_destinatarios ?? 0} destinatários na campanha
                  </p>
                </div>
              </div>

              {/* Lista de variáveis */}
              <div className="msg-var-cards">
                {(catalogo?.variaveis ?? []).map(cv => (
                  <div key={cv.chave} className={`msg-var-card${cv.sem_valor > 0 ? ' msg-var-card--warn' : ''}`}>
                    <div className="msg-var-card__top">
                      <div className="msg-var-card__info">
                        <code className="msg-var-card__chave">{`{{${cv.chave}}}`}</code>
                        {cv.sistema && <span className="msg-badge msg-badge--sistema">sistema</span>}
                      </div>
                      <button
                        className="msg-var-inserir-btn"
                        onClick={() => inserirVar(cv.chave)}
                        title="Inserir no editor"
                      >
                        + Inserir
                      </button>
                    </div>
                    <div className="msg-var-card__stats">
                      <span className="msg-var-stat msg-var-stat--ok">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        {cv.total_com_valor} com valor
                      </span>
                      {cv.sem_valor > 0 && (
                        <span className="msg-var-stat msg-var-stat--warn">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/><circle cx="12" cy="12" r="10"/></svg>
                          {cv.sem_valor} sem valor
                        </span>
                      )}
                    </div>
                    {cv.exemplo && <p className="msg-var-card__exemplo">Ex: {cv.exemplo}</p>}

                    {/* Campo de valor padrão */}
                    {!cv.sistema && cv.sem_valor > 0 && (
                      <div className="msg-var-padrao">
                        <label className="msg-var-padrao__label">Valor padrão se ausente:</label>
                        <input
                          type="text"
                          className="msg-input msg-input--sm"
                          placeholder={`Padrão para ${cv.chave}…`}
                          value={valoresPadrao[cv.chave] ?? ''}
                          onChange={e => setValoresPadrao(p => ({ ...p, [cv.chave]: e.target.value }))}
                          onBlur={salvarPadroesSilent}
                          maxLength={200}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {(catalogo?.variaveis ?? []).some(cv => !cv.sistema && cv.sem_valor > 0) && (
                <p className="msg-vars-hint">
                  Os valores padrão são salvos automaticamente ao sair do campo.
                </p>
              )}

              {!(catalogo?.variaveis ?? []).some(cv => !cv.sistema && cv.sem_valor > 0) && (
                <div className="msg-vars-ok">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="20 6 9 17 4 12"/></svg>
                  Todas as variáveis têm valores para todos os destinatários.
                </div>
              )}
            </div>
          )}

          {/* ── Distribuição ─────────────────────────── */}
          {painelDir === 'distribuicao' && (
            <div className="msg-distrib-area">
              <div className="msg-section-header">
                <div>
                  <p className="msg-section-title">Distribuição das variações</p>
                  <p className="msg-section-sub">Como as mensagens serão divididas entre os destinatários</p>
                </div>
              </div>

              <div className="msg-modos">
                {MODOS_DIST.map(m => (
                  <label
                    key={m.value}
                    className={`msg-modo${modoDistrib === m.value ? ' is-active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="modo"
                      value={m.value}
                      checked={modoDistrib === m.value}
                      onChange={() => { setModoDistrib(m.value); setPlano(null) }}
                    />
                    <span className="msg-modo__icon">{m.icon}</span>
                    <div className="msg-modo__texto">
                      <strong>{m.label}</strong>
                      <p>{m.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Configuração de percentuais */}
              {modoDistrib === 'percentual' && (
                <PercConfig
                  variacoes={ativas}
                  config={configPerc}
                  onChange={setConfigPerc}
                />
              )}

              {/* Plano calculado */}
              {plano && <PlanoBarra plano={plano} />}

              <div className="msg-distrib-btns">
                <button
                  className="msg-btn-ghost"
                  onClick={calcularPlano}
                  disabled={calculando || !ativas.length}
                >
                  {calculando ? 'Calculando…' : '🔍 Calcular prévia (opcional)'}
                </button>

                {confirmado && !revisao && (
                  <div className="msg-confirmado">
                    <div className="msg-confirmado__info">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/><circle cx="12" cy="12" r="10"/></svg>
                      Distribuição confirmada
                    </div>
                    <button className="msg-link" onClick={handleRecalcular}>Recalcular</button>
                  </div>
                )}
              </div>
              {!confirmado && (
                <p className="msg-section-sub" style={{ marginTop: 8 }}>
                  Não precisa confirmar aqui — ao clicar em <strong>Continuar</strong>, a distribuição é aplicada automaticamente.
                </p>
              )}

              {/* Mini resumo */}
              {resumo && <MiniResumo resumo={resumo} />}
            </div>
          )}
        </aside>
      </div>

      {/* ── Rodapé do wizard ─────────────────────────── */}
      <footer className="msg-footer">
        <button className="msg-btn-ghost" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Voltar
        </button>

        <div className="msg-footer__center">
          {bloqueantes.length > 0 && (
            <div className="msg-footer__bloqueantes">
              {bloqueantes.map((b, i) => <span key={i}>⛔ {b}</span>)}
            </div>
          )}
        </div>

        <div className="msg-footer__right">
          <span className="dw-autosave-hint">
            {salvando || confirmando ? 'Salvando…' : 'Salvamento automático'}
          </span>
          <button
            className="msg-btn-primary"
            onClick={handleContinuar}
            disabled={bloqueantes.length > 0 || confirmando}
            title={bloqueantes[0] ?? 'Confirma a distribuição e avança'}
          >
            {confirmando ? 'Confirmando…' : 'Continuar'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </footer>

    </div>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function MensagensLoading() {
  return (
    <div className="msg-loading">
      {[1, 2, 3].map(i => <div key={i} className="msg-skeleton" />)}
    </div>
  )
}

function NomeInline({ nome, onSalvar }) {
  const [editando, setEditando] = useState(false)
  const [val, setVal]           = useState(nome)
  const ref = useRef(null)

  useEffect(() => { setVal(nome) }, [nome])
  useEffect(() => { if (editando) ref.current?.focus() }, [editando])

  function confirmar() {
    onSalvar(val.trim() || nome)
    setEditando(false)
  }

  if (!editando) return (
    <button className="msg-nome-btn" onClick={() => setEditando(true)} title="Clique para renomear">
      <span>{nome}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    </button>
  )

  return (
    <div className="msg-nome-edit">
      <input
        ref={ref}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') setEditando(false) }}
        maxLength={100}
        className="msg-input"
      />
      <button className="msg-btn-primary msg-btn--sm" onClick={confirmar}>Salvar</button>
      <button className="msg-btn-ghost msg-btn--sm" onClick={() => setEditando(false)}>Cancelar</button>
    </div>
  )
}

function TextareaEditor({ varId, tipo, texto, onSalvar, onRef }) {
  const [local, setLocal] = useState(texto)
  const timer = useRef(null)
  const ref   = useRef(null)
  const label = editorialLabel(tipo)

  useEffect(() => { setLocal(texto) }, [varId, texto, tipo])

  function onChange(e) {
    const v = e.target.value
    setLocal(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onSalvar(v), 1200)
  }

  useEffect(() => { if (onRef && ref.current) onRef(ref.current) }, [onRef])

  const excedido = local.length > 4000
  const pct = Math.min(100, (local.length / 4096) * 100)

  return (
    <div className="msg-textarea-wrap">
      <label className="msg-editor__tipo-label">{label}</label>
      <textarea
        ref={ref}
        value={local}
        onChange={onChange}
        className={`msg-textarea${excedido ? ' is-over' : ''}`}
        placeholder={tipo === 'texto'
          ? 'Digite o texto da mensagem…\n\nUse {{nome}}, {{telefone}}, {{cidade}} para personalizar.'
          : 'Legenda opcional para a mídia…\n\nUse {{nome}}, {{telefone}} para personalizar.'}
        rows={7}
        maxLength={5000}
        spellCheck
      />
      <div className="msg-textarea__bar">
        <div className="msg-textarea__ring" title={`${local.length} caracteres`}>
          <svg width="20" height="20" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" fill="none" stroke="#e2e8f0" strokeWidth="2"/>
            <circle
              cx="10" cy="10" r="8"
              fill="none"
              stroke={excedido ? '#ef4444' : pct > 75 ? '#f59e0b' : '#128c7e'}
              strokeWidth="2"
              strokeDasharray={`${2 * Math.PI * 8}`}
              strokeDashoffset={`${2 * Math.PI * 8 * (1 - pct / 100)}`}
              strokeLinecap="round"
              transform="rotate(-90 10 10)"
            />
          </svg>
        </div>
        <span className={`msg-textarea__count${excedido ? ' is-over' : ''}`}>{local.length}</span>
        {excedido && <span className="msg-textarea__aviso">⚠ Texto muito longo para WhatsApp</span>}
        <span className="msg-textarea__hint">Salvamento automático ativo</span>
      </div>
    </div>
  )
}

function MidiaUpload({ variacao, uploading, fileRef, onUpload, onRemover }) {
  const tipo = TIPO_MAP[variacao.tipo_mensagem] ?? TIPO_MAP.texto
  const aceitaMime = {
    imagem:    'image/jpeg,image/png,image/webp,image/gif',
    video:     'video/mp4,video/3gpp,video/quicktime',
    audio:     'audio/mpeg,audio/ogg,audio/aac,audio/opus',
    documento: '.pdf,.docx,.doc,.xlsx,.xls,.pptx,.txt,.csv',
  }[variacao.tipo_mensagem] ?? '*'

  const limites = {
    imagem: '5 MB', video: '32 MB', audio: '16 MB', documento: '100 MB',
  }[variacao.tipo_mensagem] ?? ''

  return (
    <div className="msg-midia-panel">
      <div className="msg-midia-panel__header">
        <span className="msg-midia-panel__titulo" style={{ color: tipo.color }}>
          {tipo.icon} Arquivo {tipo.label}
        </span>
        <span className="msg-midia-panel__dica">Máximo {limites}</span>
      </div>

      {variacao.midia_url ? (
        <div className="msg-midia-preview">
          {variacao.tipo_mensagem === 'imagem' && (
            <img src={variacao.midia_url} alt={variacao.midia_nome_original} className="msg-midia-img" />
          )}
          {variacao.tipo_mensagem === 'audio' && (
            <div className="msg-midia-audio-wrap">
              <audio controls src={variacao.midia_url} className="msg-midia-audio" />
            </div>
          )}
          {variacao.tipo_mensagem === 'video' && (
            <video controls src={variacao.midia_url} className="msg-midia-video" />
          )}
          {variacao.tipo_mensagem === 'documento' && (
            <div className="msg-midia-doc">
              <div className="msg-midia-doc__icon">📄</div>
              <div className="msg-midia-doc__info">
                <span className="msg-midia-doc__nome">{variacao.midia_nome_original}</span>
                <span className="msg-midia-doc__meta">{variacao.midia_mime} · {fmtBytes(variacao.midia_tamanho)}</span>
              </div>
            </div>
          )}
          <button className="msg-midia-remover" onClick={onRemover}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Remover
          </button>
        </div>
      ) : (
        <label className={`msg-midia-upload${uploading ? ' is-loading' : ''}`} htmlFor="midia-input">
          <input
            id="midia-input"
            ref={fileRef}
            type="file"
            accept={aceitaMime}
            onChange={onUpload}
            style={{ display: 'none' }}
          />
          <div className="msg-midia-upload__icon" style={{ color: tipo.color }}>{tipo.icon}</div>
          <p className="msg-midia-upload__label">
            {uploading ? '⏳ Enviando arquivo…' : `Clique para selecionar ${tipo.label.toLowerCase()}`}
          </p>
          <p className="msg-midia-upload__hint">
            {!uploading && (
              variacao.tipo_mensagem === 'imagem'    ? 'JPG, PNG, WebP, GIF — máx 5 MB' :
              variacao.tipo_mensagem === 'video'     ? 'MP4, 3GP, MOV — máx 32 MB' :
              variacao.tipo_mensagem === 'audio'     ? 'MP3, OGG, AAC, Opus — máx 16 MB' :
              variacao.tipo_mensagem === 'documento' ? 'PDF, DOCX, XLSX e outros — máx 100 MB' : ''
            )}
          </p>
        </label>
      )}
    </div>
  )
}

function ChatBubbleSimples({ variacao, padrao }) {
  const tipoMsg = variacao.tipo_mensagem
  const editorial = getEditorial(variacao)
  const textoRender = substituirVarsLocal(editorial, {
    nome: 'Destinatário', telefone: '11 9 9999-9999', ...padrao,
  })
  const isTexto = tipoMsg === 'texto'

  return (
    <div className="msg-wa-bubbles">
      {variacao.midia_url && tipoMsg === 'imagem' && (
        <div className="msg-bubble msg-bubble--media">
          <img src={variacao.midia_url} alt="" className="msg-bubble__img" />
          {textoRender && <p className="msg-bubble__legenda">{textoRender}</p>}
        </div>
      )}
      {variacao.midia_url && tipoMsg === 'video' && (
        <div className="msg-bubble msg-bubble--media">
          <video controls src={variacao.midia_url} className="msg-bubble__video" />
          {textoRender && <p className="msg-bubble__legenda">{textoRender}</p>}
        </div>
      )}
      {variacao.midia_url && tipoMsg === 'audio' && (
        <div className="msg-bubble msg-bubble--audio">
          <audio controls src={variacao.midia_url} style={{ width: '100%', height: 32 }} />
          {textoRender && <p className="msg-bubble__legenda">{textoRender}</p>}
        </div>
      )}
      {variacao.midia_url && tipoMsg === 'documento' && (
        <div className="msg-bubble msg-bubble--doc">
          <div className="msg-bubble-doc">
            <div className="msg-bubble-doc__icon">📄</div>
            <div>
              <p className="msg-bubble-doc__nome">{variacao.midia_nome_original ?? 'documento'}</p>
              <p className="msg-bubble-doc__meta">{variacao.midia_mime}</p>
            </div>
          </div>
          {textoRender && <p className="msg-bubble__legenda">{textoRender}</p>}
        </div>
      )}
      {isTexto && textoRender && (
        <div className="msg-bubble">
          <p className="msg-bubble__texto">{textoRender}</p>
          <div className="msg-bubble__rodape">
            <span className="msg-bubble__hora">12:00</span>
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none"><path d="M1 5l3 3 9-7" stroke="#4fc3f7" strokeWidth="1.5" strokeLinecap="round"/><path d="M4 5l3 3 9-7" stroke="#4fc3f7" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
        </div>
      )}
      {!textoRender && !variacao.midia_url && (
        <div className="msg-wa-empty">Escreva uma mensagem para visualizar a prévia</div>
      )}
    </div>
  )
}

function ChatPreview({ data }) {
  return (
    <div className="msg-wa-bubbles">
      {data.variacao?.midia_url && data.variacao.tipo_mensagem === 'imagem' && (
        <div className="msg-bubble msg-bubble--media">
          <img src={data.variacao.midia_url} alt="" className="msg-bubble__img" />
          {data.legenda_substituida && <p className="msg-bubble__legenda">{data.legenda_substituida}</p>}
        </div>
      )}
      {data.variacao?.midia_url && data.variacao.tipo_mensagem === 'audio' && (
        <div className="msg-bubble msg-bubble--audio">
          <audio controls src={data.variacao.midia_url} style={{ width: '100%', height: 32 }} />
        </div>
      )}
      {data.variacao?.midia_url && data.variacao.tipo_mensagem === 'video' && (
        <div className="msg-bubble msg-bubble--media">
          <video controls src={data.variacao.midia_url} className="msg-bubble__video" />
          {data.legenda_substituida && <p className="msg-bubble__legenda">{data.legenda_substituida}</p>}
        </div>
      )}
      {data.variacao?.midia_url && data.variacao.tipo_mensagem === 'documento' && (
        <div className="msg-bubble msg-bubble--doc">
          <div className="msg-bubble-doc">
            <div className="msg-bubble-doc__icon">📄</div>
            <div>
              <p className="msg-bubble-doc__nome">{data.variacao.midia_nome_original ?? 'documento'}</p>
            </div>
          </div>
          {data.legenda_substituida && <p className="msg-bubble__legenda">{data.legenda_substituida}</p>}
        </div>
      )}
      {data.texto_substituido && data.variacao?.tipo_mensagem === 'texto' && (
        <div className="msg-bubble">
          <p className="msg-bubble__texto">{data.texto_substituido}</p>
          <div className="msg-bubble__rodape">
            <span className="msg-bubble__hora">12:00</span>
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none"><path d="M1 5l3 3 9-7" stroke="#4fc3f7" strokeWidth="1.5" strokeLinecap="round"/><path d="M4 5l3 3 9-7" stroke="#4fc3f7" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
        </div>
      )}
      <div className="msg-preview__meta">
        <span>🏷 <strong>Variação:</strong> {data.variacao?.nome ?? '—'}</span>
        {data.instancia_id && <span>📡 <strong>Instância:</strong> {data.instancia_id}</span>}
      </div>
    </div>
  )
}

function PercConfig({ variacoes, config, onChange }) {
  const soma = variacoes.reduce((s, v) => s + Number(config[v.id] ?? 0), 0)
  const ok   = Math.abs(soma - 100) < 0.01

  return (
    <div className="msg-perc-config">
      <div className="msg-perc-config__header">
        <span className="msg-section-sub">Percentual por variação</span>
        <span className={`msg-perc-soma${ok ? ' is-ok' : ' is-error'}`}>
          {soma.toFixed(1)}%{ok ? ' ✓' : ' (deve ser 100%)'}
        </span>
      </div>
      {variacoes.map(v => (
        <div key={v.id} className="msg-perc-linha">
          <span className="msg-perc-linha__nome">{v.nome}</span>
          <div className="msg-perc-linha__input-wrap">
            <input
              type="number" min="0" max="100" step="1"
              className="msg-input msg-input--num"
              value={config[v.id] ?? ''}
              onChange={e => onChange(p => ({ ...p, [v.id]: e.target.value }))}
            />
            <span className="msg-perc-linha__sym">%</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function PlanoBarra({ plano }) {
  const N = plano.total || 1
  const cores = ['#128c7e','#8b5cf6','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6']

  return (
    <div className="msg-plano">
      <p className="msg-plano__titulo">Distribuição calculada — {plano.total} destinatários</p>
      <div className="msg-plano__barra-total">
        {(plano.variacoes ?? []).map((vp, i) => (
          vp.quantidade > 0 && (
            <div
              key={vp.variacao_id}
              className="msg-plano__segmento"
              style={{ width: `${vp.percentual}%`, background: cores[i % cores.length] }}
              title={`${vp.nome}: ${vp.quantidade} (${vp.percentual}%)`}
            />
          )
        ))}
      </div>
      <div className="msg-plano__linhas">
        {(plano.variacoes ?? []).map((vp, i) => (
          <div key={vp.variacao_id} className="msg-plano__linha">
            <span className="msg-plano__dot" style={{ background: cores[i % cores.length] }} />
            <span className="msg-plano__nome">{vp.nome}</span>
            <span className="msg-plano__qtd"><strong>{vp.quantidade}</strong> dest.</span>
            <span className="msg-plano__pct">{vp.percentual}%</span>
          </div>
        ))}
        {(plano.sem_variacao ?? 0) > 0 && (
          <div className="msg-plano__sem-var">
            ⚠ {plano.sem_variacao} sem variação
          </div>
        )}
      </div>
    </div>
  )
}

function MiniResumo({ resumo }) {
  return (
    <div className="msg-mini-resumo">
      <div className="msg-mini-resumo__grid">
        <div className="msg-mini-resumo__card">
          <strong>{(resumo.variacoes ?? []).filter(v => v.ativa).length}</strong>
          <span>Variações ativas</span>
        </div>
        <div className="msg-mini-resumo__card">
          <strong>{resumo.total_destinatarios}</strong>
          <span>Destinatários</span>
        </div>
        <div className={`msg-mini-resumo__card${(resumo.sem_variacao ?? 0) > 0 ? ' is-warn' : ' is-ok'}`}>
          <strong>{resumo.sem_variacao ?? 0}</strong>
          <span>Sem variação</span>
        </div>
      </div>
    </div>
  )
}
