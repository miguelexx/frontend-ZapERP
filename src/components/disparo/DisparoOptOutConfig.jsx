import { useCallback, useEffect, useState } from 'react'
import { IconDeviceFloppy, IconRefresh } from '@tabler/icons-react'
import {
  disparoEtapa8ApiError,
  getOptOutConfig,
  putOptOutConfig,
} from '../../api/disparoEtapa8Service'

export default function DisparoOptOutConfig() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [palavrasTexto, setPalavrasTexto] = useState('')
  const [mensagemConfirmacao, setMensagemConfirmacao] = useState('')
  const [enviarConfirmacao, setEnviarConfirmacao] = useState(true)
  const [reativacaoExplicita, setReativacaoExplicita] = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const cfg = await getOptOutConfig()
      setPalavrasTexto((cfg.palavras_optout ?? []).join(', '))
      setMensagemConfirmacao(cfg.mensagem_confirmacao_optout ?? '')
      setEnviarConfirmacao(cfg.enviar_confirmacao_optout !== false)
      setReativacaoExplicita(cfg.reativacao_exige_explicito !== false)
    } catch (err) {
      setError(disparoEtapa8ApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function handleSalvar(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const palavras = palavrasTexto
        .split(/[,;\n]+/)
        .map((p) => p.trim())
        .filter(Boolean)

      await putOptOutConfig({
        palavras_optout: palavras,
        mensagem_confirmacao_optout: mensagemConfirmacao.trim() || null,
        enviar_confirmacao_optout: enviarConfirmacao,
        reativacao_exige_explicito: reativacaoExplicita,
      })
      setSuccess('Configuração salva com sucesso.')
      await carregar()
    } catch (err) {
      setError(disparoEtapa8ApiError(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="dpex-empty">Carregando configuração…</p>
  }

  return (
    <form className="dpex8-config" onSubmit={handleSalvar}>
      {error && <div className="disparo-alert disparo-alert--error">{error}</div>}
      {success && <div className="disparo-alert disparo-alert--success">{success}</div>}

      <div className="dpex8-config__field">
        <label className="dpex8-config__label" htmlFor="dpex8-palavras">
          Palavras de opt-out
        </label>
        <p className="dpex8-config__hint">
          Comandos exatos (case-insensitive) que removem o contato da lista. Separe por vírgula.
        </p>
        <input
          id="dpex8-palavras"
          type="text"
          className="dpex-input"
          value={palavrasTexto}
          onChange={(e) => setPalavrasTexto(e.target.value)}
          placeholder="PARAR, SAIR, DESCADASTRAR"
        />
      </div>

      <div className="dpex8-config__field">
        <label className="dpex8-config__label" htmlFor="dpex8-msg">
          Mensagem de confirmação (opcional)
        </label>
        <p className="dpex8-config__hint">
          Deixe em branco para usar a mensagem padrão do sistema.
        </p>
        <textarea
          id="dpex8-msg"
          className="dpex-textarea"
          rows={3}
          value={mensagemConfirmacao}
          onChange={(e) => setMensagemConfirmacao(e.target.value)}
          placeholder="Você foi removido da nossa lista…"
          maxLength={1000}
        />
      </div>

      <div className="dpex8-config__checks">
        <label className="dpex8-check">
          <input
            type="checkbox"
            checked={enviarConfirmacao}
            onChange={(e) => setEnviarConfirmacao(e.target.checked)}
          />
          <span>Enviar mensagem de confirmação ao detectar opt-out</span>
        </label>
        <label className="dpex8-check">
          <input
            type="checkbox"
            checked={reativacaoExplicita}
            onChange={(e) => setReativacaoExplicita(e.target.checked)}
          />
          <span>Reativação exige ação explícita de administrador</span>
        </label>
      </div>

      <div className="dpex8-config__actions">
        <button
          type="button"
          className="disparo-btn-secondary dpex-btn-icon"
          onClick={carregar}
          disabled={saving}
        >
          <IconRefresh size={15} />
          Recarregar
        </button>
        <button type="submit" className="disparo-btn-primary dpex-btn-icon" disabled={saving}>
          <IconDeviceFloppy size={15} />
          {saving ? 'Salvando…' : 'Salvar configuração'}
        </button>
      </div>
    </form>
  )
}
