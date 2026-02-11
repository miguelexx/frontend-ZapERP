import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/http'
import * as dashboardApi from '../api/dashboardService'
import './dashboard.css'
import ConversasPorAtendente from './charts/ConversasPorAtendente'
import AtendimentoPorHora from './charts/AtendimentoPorHora'

const TABS = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'respostas', label: 'Respostas salvas' },
  { id: 'sla', label: 'SLA' },
]

export default function Dashboard() {
  const [tab, setTab] = useState('overview')
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  async function loadDashboard() {
    try {
      setLoading(true)
      const res = await api.get('/dashboard/overview')
      setOverview(res.data)
    } catch (e) {
      console.error('Erro ao carregar dashboard', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  return (
    <div className="dash-wrap">
      <header className="dash-header">
        <h1 className="dash-title">Dashboard</h1>
        <p className="dash-subtitle">Métricas, relatórios, respostas por setor e SLA</p>
      </header>

      <nav className="dash-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`dash-tab ${tab === t.id ? 'dash-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="dash-tab-content">
        {tab === 'overview' && (
          <DashboardOverview overview={overview} loading={loading} onRefresh={loadDashboard} />
        )}
        {tab === 'relatorios' && <DashboardRelatorios />}
        {tab === 'respostas' && <DashboardRespostasSalvas />}
        {tab === 'sla' && <DashboardSLA navigate={navigate} />}
      </div>
    </div>
  )
}

// --- Visão geral (KPIs + gráficos) ---
function DashboardOverview({ overview, loading, onRefresh }) {
  if (loading) {
    return <div className="dash-loading">Carregando métricas...</div>
  }
  if (!overview) {
    return (
      <div className="dash-empty">
        Nenhum dado disponível. Verifique sua conexão.
        <button type="button" className="dash-btn dash-btn--primary" onClick={onRefresh}>
          Tentar novamente
        </button>
      </div>
    )
  }

  const { kpis = {}, conversas_por_atendente = [], conversas_por_hora = [] } = overview
  const atendimentosHoje = kpis.atendimentos_hoje ?? 0
  const tempoMedioResposta = kpis.tempo_medio_resposta_min ?? kpis.tempo_primeira_resposta_min
  const slaPercent = kpis.sla_percent
  const atendenteMaisProdutivo = kpis.atendente_mais_produtivo
  const ticketsAbertos = kpis.tickets_abertos ?? (kpis.abertas + kpis.em_atendimento)
  const taxaConversao = kpis.taxa_conversao_percent

  return (
    <>
      <div className="dash-grid">
        <div className="dash-card">
          <div className="dash-card-label">Atendimentos hoje</div>
          <div className="dash-card-value">{atendimentosHoje}</div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">Tempo médio resposta</div>
          <div className="dash-card-value dash-card-value--blue">{formatMin(tempoMedioResposta)}</div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">SLA (1ª resp. ≤ 5 min)</div>
          <div className="dash-card-value dash-card-value--green">
            {slaPercent != null ? `${slaPercent}%` : '—'}
          </div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">Atendente mais produtivo</div>
          <div className="dash-card-value dash-card-value--muted">
            {atendenteMaisProdutivo || '—'}
          </div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">Tickets abertos</div>
          <div className="dash-card-value dash-card-value--amber">{ticketsAbertos}</div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">Taxa conversão</div>
          <div className="dash-card-value dash-card-value--green">
            {taxaConversao != null ? `${taxaConversao}%` : '—'}
          </div>
        </div>
      </div>

      <section className="dash-charts">
        <div className="dash-chart-card">
          <h4>Conversas por atendente</h4>
          <ConversasPorAtendente data={conversas_por_atendente} />
        </div>
        <div className="dash-chart-card">
          <h4>Conversas por hora</h4>
          <AtendimentoPorHora data={conversas_por_hora} />
        </div>
      </section>
    </>
  )
}

// --- Relatórios (filtros + tabela + export CSV/Excel/PDF) ---
function DashboardRelatorios() {
  const [filters, setFilters] = useState({
    data_inicio: '',
    data_fim: '',
    status_atendimento: '',
    atendente_id: '',
    departamento_id: '',
  })
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(null)
  const [departamentos, setDepartamentos] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [erroCarregar, setErroCarregar] = useState('')
  const [erroExportar, setErroExportar] = useState('')

  useEffect(() => {
    Promise.all([dashboardApi.getDepartamentos(), dashboardApi.getUsuarios()]).then(
      ([dept, usr]) => {
        setDepartamentos(dept || [])
        setUsuarios(usr || [])
      }
    ).catch(() => {
      setErroCarregar('Erro ao carregar departamentos/atendentes.')
    })
  }, [])

  async function carregar() {
    setLoading(true)
    setErroCarregar('')
    try {
      const params = {}
      if (filters.data_inicio) params.data_inicio = filters.data_inicio
      if (filters.data_fim) params.data_fim = filters.data_fim
      if (filters.status_atendimento) params.status_atendimento = filters.status_atendimento
      if (filters.atendente_id) params.atendente_id = filters.atendente_id
      if (filters.departamento_id) params.departamento_id = filters.departamento_id
      const list = await dashboardApi.getRelatorioConversas(params)
      setData(list)
    } catch (e) {
      setErroCarregar(e?.response?.data?.error || 'Erro ao carregar relatório.')
      setData([])
    } finally {
      setLoading(false)
    }
  }

  async function exportar(format) {
    setExporting(format)
    setErroExportar('')
    try {
      const params = {}
      if (filters.data_inicio) params.data_inicio = filters.data_inicio
      if (filters.data_fim) params.data_fim = filters.data_fim
      if (filters.status_atendimento) params.status_atendimento = filters.status_atendimento
      if (filters.atendente_id) params.atendente_id = filters.atendente_id
      if (filters.departamento_id) params.departamento_id = filters.departamento_id
      await dashboardApi.exportRelatorio(format, params)
    } catch (e) {
      setErroExportar(e?.response?.data?.error || `Erro ao exportar ${format.toUpperCase()}.`)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="dash-relatorios">
      <div className="dash-filters">
        <input
          type="date"
          value={filters.data_inicio}
          onChange={(e) => setFilters((f) => ({ ...f, data_inicio: e.target.value }))}
          className="dash-input"
          placeholder="Data início"
        />
        <input
          type="date"
          value={filters.data_fim}
          onChange={(e) => setFilters((f) => ({ ...f, data_fim: e.target.value }))}
          className="dash-input"
          placeholder="Data fim"
        />
        <select
          value={filters.status_atendimento}
          onChange={(e) => setFilters((f) => ({ ...f, status_atendimento: e.target.value }))}
          className="dash-select"
        >
          <option value="">Status</option>
          <option value="aberta">Aberta</option>
          <option value="em_atendimento">Em atendimento</option>
          <option value="fechada">Fechada</option>
        </select>
        <select
          value={filters.atendente_id}
          onChange={(e) => setFilters((f) => ({ ...f, atendente_id: e.target.value }))}
          className="dash-select"
        >
          <option value="">Atendente</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
        <select
          value={filters.departamento_id}
          onChange={(e) => setFilters((f) => ({ ...f, departamento_id: e.target.value }))}
          className="dash-select"
        >
          <option value="">Setor</option>
          {departamentos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </select>
        <button type="button" className="dash-btn dash-btn--primary" onClick={carregar} disabled={loading}>
          {loading ? 'Carregando...' : 'Aplicar'}
        </button>
      </div>

      {(erroCarregar || erroExportar) && (
        <div className="dash-erro" role="alert">
          {erroCarregar && <span>{erroCarregar}</span>}
          {erroCarregar && erroExportar && ' '}
          {erroExportar && <span>{erroExportar}</span>}
        </div>
      )}

      <div className="dash-export-buttons">
        <span className="dash-export-label">Exportar:</span>
        <button
          type="button"
          className="dash-btn dash-btn--outline"
          onClick={() => exportar('csv')}
          disabled={!!exporting}
        >
          {exporting === 'csv' ? '...' : 'CSV'}
        </button>
        <button
          type="button"
          className="dash-btn dash-btn--outline"
          onClick={() => exportar('xlsx')}
          disabled={!!exporting}
        >
          {exporting === 'xlsx' ? '...' : 'Excel'}
        </button>
        <button
          type="button"
          className="dash-btn dash-btn--outline"
          onClick={() => exportar('pdf')}
          disabled={!!exporting}
        >
          {exporting === 'pdf' ? '...' : 'PDF'}
        </button>
      </div>

      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Telefone</th>
              <th>Setor</th>
              <th>Status</th>
              <th>Atendente</th>
              <th>Tags</th>
              <th>Criado em</th>
              <th>Min sem responder</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="dash-table-empty">
                  Aplique os filtros e clique em Aplicar para carregar o relatório.
                </td>
              </tr>
            )}
            {data.map((r) => (
              <tr key={r.id}>
                <td>{r.cliente_nome || '—'}</td>
                <td>{r.telefone || '—'}</td>
                <td>{r.setor || '—'}</td>
                <td>{r.status_atendimento || '—'}</td>
                <td>{r.atendente_nome || '—'}</td>
                <td>{r.tags || '—'}</td>
                <td>{r.criado_em ? new Date(r.criado_em).toLocaleString('pt-BR') : '—'}</td>
                <td>{r.tempo_sem_responder_min != null ? r.tempo_sem_responder_min : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// --- Respostas salvas por setor ---
function DashboardRespostasSalvas() {
  const [departamentos, setDepartamentos] = useState([])
  const [respostas, setRespostas] = useState([])
  const [departamentoId, setDepartamentoId] = useState('')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ titulo: '', texto: '', departamento_id: '' })
  const [saving, setSaving] = useState(false)

  async function loadDept() {
    const list = await dashboardApi.getDepartamentos()
    setDepartamentos(list || [])
  }

  async function loadRespostas() {
    setLoading(true)
    try {
      const list = await dashboardApi.getRespostasSalvas(departamentoId || null)
      setRespostas(list)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDept()
  }, [])

  useEffect(() => {
    loadRespostas()
  }, [departamentoId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.titulo?.trim() || !form.texto?.trim()) return
    setSaving(true)
    try {
      await dashboardApi.criarRespostaSalva({
        titulo: form.titulo.trim(),
        texto: form.texto.trim(),
        departamento_id: form.departamento_id || null,
      })
      setForm({ titulo: '', texto: '', departamento_id: '' })
      loadRespostas()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dash-respostas">
      <div className="dash-respostas-filters">
        <label>
          Setor (departamento):
          <select
            value={departamentoId}
            onChange={(e) => setDepartamentoId(e.target.value)}
            className="dash-select"
          >
            <option value="">Todos</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="dash-respostas-form-card">
        <h4>Nova resposta salva</h4>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Título"
            value={form.titulo}
            onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
            className="dash-input"
            required
          />
          <select
            value={form.departamento_id}
            onChange={(e) => setForm((f) => ({ ...f, departamento_id: e.target.value }))}
            className="dash-select"
          >
            <option value="">Setor (opcional)</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
          <textarea
            placeholder="Texto da resposta"
            value={form.texto}
            onChange={(e) => setForm((f) => ({ ...f, texto: e.target.value }))}
            className="dash-textarea"
            rows={3}
            required
          />
          <button type="submit" className="dash-btn dash-btn--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </form>
      </section>

      <section className="dash-respostas-list">
        <h4>Respostas salvas ({respostas.length})</h4>
        {loading ? (
          <p className="dash-muted">Carregando...</p>
        ) : respostas.length === 0 ? (
          <p className="dash-muted">Nenhuma resposta salva para o setor selecionado.</p>
        ) : (
          <ul className="dash-respostas-ul">
            {respostas.map((r) => (
              <li key={r.id} className="dash-resposta-item">
                <strong>{r.titulo}</strong>
                {r.departamentos?.nome && (
                  <span className="dash-resposta-setor">{r.departamentos.nome}</span>
                )}
                <p className="dash-resposta-texto">{r.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// --- SLA: config + alertas ---
function DashboardSLA({ navigate }) {
  const [config, setConfig] = useState({ sla_minutos_sem_resposta: 30 })
  const [alertas, setAlertas] = useState({ limite_min: 30, alertas: [] })
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [loadingAlertas, setLoadingAlertas] = useState(true)
  const [saving, setSaving] = useState(false)
  const [minutosInput, setMinutosInput] = useState('')

  async function loadConfig() {
    setLoadingConfig(true)
    try {
      const c = await dashboardApi.getSlaConfig()
      setConfig(c)
      setMinutosInput(String(c.sla_minutos_sem_resposta ?? 30))
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingConfig(false)
    }
  }

  async function loadAlertas() {
    setLoadingAlertas(true)
    try {
      const a = await dashboardApi.getSlaAlertas()
      setAlertas(a)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingAlertas(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  useEffect(() => {
    loadAlertas()
    const t = setInterval(loadAlertas, 60000)
    return () => clearInterval(t)
  }, [])

  async function salvarSla() {
    const min = Math.max(1, Math.min(1440, parseInt(minutosInput, 10) || 30))
    setSaving(true)
    try {
      await dashboardApi.setSlaConfig(min)
      setConfig({ sla_minutos_sem_resposta: min })
      loadAlertas()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  function abrirConversa(conversaId) {
    navigate('/atendimento', { state: { openConversaId: conversaId } })
  }

  return (
    <div className="dash-sla">
      <section className="dash-sla-config dash-card">
        <h4>Configuração do SLA</h4>
        <p className="dash-muted">
          Alerta quando um cliente ficar mais de X minutos sem resposta (conversa aberta ou em
          atendimento).
        </p>
        {loadingConfig ? (
          <p className="dash-muted">Carregando...</p>
        ) : (
          <div className="dash-sla-form">
            <input
              type="number"
              min={1}
              max={1440}
              value={minutosInput}
              onChange={(e) => setMinutosInput(e.target.value)}
              className="dash-input"
              style={{ width: 80 }}
            />
            <span>minutos</span>
            <button
              type="button"
              className="dash-btn dash-btn--primary"
              onClick={salvarSla}
              disabled={saving}
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        )}
        <p className="dash-muted">Atual: {config.sla_minutos_sem_resposta ?? 30} minutos.</p>
      </section>

      <section className="dash-sla-alertas dash-card">
        <h4>Alertas de SLA ({alertas.alertas?.length ?? 0})</h4>
        <p className="dash-muted">
          Conversas em que o cliente está há mais de {alertas.limite_min ?? 30} min sem resposta.
        </p>
        <button
          type="button"
          className="dash-btn dash-btn--outline"
          onClick={loadAlertas}
          disabled={loadingAlertas}
        >
          {loadingAlertas ? 'Atualizando...' : 'Atualizar'}
        </button>
        {loadingAlertas ? (
          <p className="dash-muted">Carregando alertas...</p>
        ) : !alertas.alertas?.length ? (
          <p className="dash-muted">Nenhum alerta no momento.</p>
        ) : (
          <ul className="dash-sla-lista">
            {alertas.alertas.map((a) => (
              <li key={a.conversa_id} className="dash-sla-item">
                <span className="dash-sla-item-nome">{a.cliente_nome || a.telefone}</span>
                <span className="dash-sla-item-tempo">
                  {a.tempo_sem_responder_min} min sem resposta
                </span>
                <span className="dash-sla-item-atendente">Atendente: {a.atendente_nome || '—'}</span>
                <button
                  type="button"
                  className="dash-btn dash-btn--small"
                  onClick={() => abrirConversa(a.conversa_id)}
                >
                  Abrir conversa
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function formatMin(min) {
  if (min === null || min === undefined) return '—'
  if (min < 1) return `${Math.round(min * 60)}s`
  if (min < 60) return `${min.toFixed(1)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}h ${m}m`
}
