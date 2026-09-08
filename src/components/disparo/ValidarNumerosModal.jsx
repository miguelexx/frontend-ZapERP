import { useMemo, useState } from 'react'
import { IconCheck, IconX, IconAlertTriangle } from '@tabler/icons-react'
import { validarNumerosInstancia } from '../../api/whapiInstancesService'

const MAX_PHONES = 500

/**
 * Validação prévia de números (Whapi) — POST /instances/:id/check-phones.
 * NÃO bloqueia o envio; é uma verificação opcional (501 quando o provider não suporta).
 *
 * Como o fluxo de disparo não expõe a lista de telefones em claro (a prévia é mascarada),
 * o usuário cola/informa os números a validar e escolhe a instância.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {Array<{ instancia_id:(number|string), nome:string, provider?:string }>} props.instancias
 */
export default function ValidarNumerosModal({ open, onClose, instancias = [] }) {
  const [instanciaId, setInstanciaId] = useState('')
  const [texto, setTexto] = useState('')
  const [forceCheck, setForceCheck] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState(null)

  const numeros = useMemo(() => {
    return String(texto)
      .split(/[\s,;]+/)
      .map((n) => n.replace(/[^\d+]/g, '').replace(/^\+/, ''))
      .filter(Boolean)
  }, [texto])

  const excedeu = numeros.length > MAX_PHONES

  async function handleValidar() {
    setErro('')
    setResultado(null)
    if (!instanciaId) { setErro('Selecione uma instância.'); return }
    if (!numeros.length) { setErro('Informe ao menos um número.'); return }
    setLoading(true)
    try {
      const res = await validarNumerosInstancia(instanciaId, numeros, forceCheck)
      if (!res.supported) {
        setErro(res.error || 'Esta instância não suporta validação de números (apenas Whapi).')
        return
      }
      if (res.error) { setErro(res.error); return }
      setResultado(res)
    } catch (e) {
      setErro(e?.response?.data?.error || e?.message || 'Erro ao validar números.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="rev-modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div className="rev-modal" style={{ maxWidth: 560 }}>
        <div className="rev-modal__header">
          <div className="rev-modal__icon">
            <IconCheck size={20} />
          </div>
          <div>
            <h2 className="rev-modal__title">Validar números (Whapi)</h2>
            <p className="rev-modal__sub">
              Verificação prévia — não envia mensagens nem bloqueia o disparo. Máx. {MAX_PHONES} números.
            </p>
          </div>
        </div>

        <div style={{ padding: '4px 20px 12px', display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span>Instância</span>
            <select
              className="rev-select"
              value={instanciaId}
              onChange={(e) => { setInstanciaId(e.target.value); setResultado(null) }}
              disabled={loading}
            >
              <option value="">— Selecione —</option>
              {instancias.map((i) => (
                <option key={String(i.instancia_id)} value={String(i.instancia_id)}>
                  {i.nome || `#${i.instancia_id}`}{i.provider ? ` · ${i.provider}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span>Números (um por linha ou separados por vírgula)</span>
            <textarea
              className="rev-select"
              style={{ minHeight: 120, fontFamily: 'monospace', resize: 'vertical' }}
              placeholder={'5534999998888\n5511988887777'}
              value={texto}
              onChange={(e) => { setTexto(e.target.value); setResultado(null) }}
              disabled={loading}
            />
            <span style={{ fontSize: 12, color: excedeu ? '#dc2626' : 'var(--ds-text-muted,#64748b)' }}>
              {numeros.length} número(s) detectado(s){excedeu ? ` — apenas os primeiros ${MAX_PHONES} serão validados.` : ''}
            </span>
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={forceCheck} onChange={(e) => setForceCheck(e.target.checked)} disabled={loading} />
            <span>Forçar reverificação (ignorar cache)</span>
          </label>

          {erro && (
            <div className="disparo-alert disparo-alert--error" style={{ margin: 0 }}>
              <IconAlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              {erro}
            </div>
          )}

          {resultado && (
            <div>
              <div className="dw-stats-bar" style={{ marginBottom: 8 }}>
                <span className="dw-stats-bar__item">Total: <strong>{resultado.total}</strong></span>
                <span className="dw-stats-bar__item dw-stats-bar__item--ok">Válidos: <strong>{resultado.validCount}</strong></span>
                <span className="dw-stats-bar__item dw-stats-bar__item--error">Inválidos: <strong>{resultado.invalidCount}</strong></span>
              </div>
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--ds-border,#e2e8f0)', borderRadius: 8 }}>
                <table className="dw-contacts-table" style={{ width: '100%' }}>
                  <thead>
                    <tr><th>Número</th><th>WhatsApp</th><th>waId</th></tr>
                  </thead>
                  <tbody>
                    {resultado.results.map((r, i) => (
                      <tr key={`${r.input ?? i}-${i}`}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.input}</td>
                        <td>
                          {r.exists
                            ? <span className="inst-badge inst-badge--ok"><IconCheck size={11} /> Existe</span>
                            : <span className="inst-badge inst-badge--err"><IconX size={11} /> Não</span>}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.waId || r.status || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="rev-modal__footer">
          <button type="button" className="disparo-btn-secondary" onClick={onClose} disabled={loading}>
            Fechar
          </button>
          <button type="button" className="disparo-btn-primary" onClick={handleValidar} disabled={loading || !numeros.length}>
            {loading ? 'Validando…' : 'Validar números'}
          </button>
        </div>
      </div>
    </div>
  )
}
