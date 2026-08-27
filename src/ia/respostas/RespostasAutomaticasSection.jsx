import { Link } from "react-router-dom";

export default function RespostasAutomaticasView({ regras, formRegra, setFormRegra, departamentos, tags, onAdd, onDelete }) {
  return (
    <div className="ia-section ia-auto-reply-section">
      <header className="ia-auto-reply-header">
        <span className="ia-auto-reply-eyebrow">Automação do bot</span>
        <h4 className="ia-auto-reply-title">Respostas automáticas</h4>
        <p className="ia-auto-reply-lead">
          O sistema responde <strong>sozinho</strong> quando o cliente envia uma palavra-chave na conversa.
          Ideal para horário, endereço, prazos e mensagens repetitivas.
        </p>
      </header>

      <div className="ia-callout ia-callout--warn" role="note">
        <div className="ia-callout-icon" aria-hidden="true">!</div>
        <div className="ia-callout-body">
          <p className="ia-callout-title">Isto não aparece no atalho <kbd>/</kbd> do atendimento</p>
          <p className="ia-callout-text">
            Regras aqui são do <strong>chatbot</strong> (resposta automática ao cliente).
            Para o atendente preencher o campo de mensagem com <kbd>/</kbd>, cadastre em{" "}
            <Link to="/configuracoes?tab=respostas" className="ia-callout-link">
              Configurações → Respostas salvas
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="ia-auto-reply-form-card">
        <h5 className="ia-auto-reply-card-title">Nova regra automática</h5>
        <p className="ia-muted ia-auto-reply-card-hint">
          Exemplo: cliente digita &quot;horário&quot; → o bot envia a resposta cadastrada.
        </p>

        <form onSubmit={onAdd} className="ia-auto-reply-form">
          <div className="ia-auto-reply-form-grid">
            <div className="ia-field">
              <label htmlFor="regra-palavra">Palavra-chave do cliente</label>
              <input
                id="regra-palavra"
                type="text"
                className="ia-input"
                value={formRegra.palavra_chave}
                onChange={(e) => setFormRegra((f) => ({ ...f, palavra_chave: e.target.value }))}
                placeholder="ex: horário, teste, preço"
              />
            </div>
            <div className="ia-field ia-field--span2">
              <label htmlFor="regra-resposta">Resposta que o bot enviará</label>
              <textarea
                id="regra-resposta"
                className="ia-textarea ia-auto-reply-textarea"
                value={formRegra.resposta}
                onChange={(e) => setFormRegra((f) => ({ ...f, resposta: e.target.value }))}
                placeholder="Nosso horário de atendimento é de segunda a sexta, das 9h às 18h."
                rows={3}
              />
            </div>
            <div className="ia-field">
              <label htmlFor="regra-setor">Setor ao casar (opcional)</label>
              <select
                id="regra-setor"
                className="ia-select"
                value={formRegra.departamento_id}
                onChange={(e) => setFormRegra((f) => ({ ...f, departamento_id: e.target.value }))}
              >
                <option value="">Não alterar setor</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            </div>
            <div className="ia-field">
              <label htmlFor="regra-tag">Tag a aplicar (opcional)</label>
              <select
                id="regra-tag"
                className="ia-select"
                value={formRegra.tag_id}
                onChange={(e) => setFormRegra((f) => ({ ...f, tag_id: e.target.value }))}
              >
                <option value="">Nenhuma</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="ia-auto-reply-options">
            <label className="ia-auto-reply-check">
              <input
                type="checkbox"
                checked={formRegra.aplicar_tag}
                onChange={(e) => setFormRegra((f) => ({ ...f, aplicar_tag: e.target.checked }))}
              />
              <span>Aplicar tag automaticamente na conversa</span>
            </label>
            <label className="ia-auto-reply-check">
              <input
                type="checkbox"
                checked={formRegra.horario_comercial_only}
                onChange={(e) => setFormRegra((f) => ({ ...f, horario_comercial_only: e.target.checked }))}
              />
              <span>Responder apenas em horário comercial</span>
            </label>
          </div>

          <div className="ia-btn-row">
            <button type="submit" className="ia-btn ia-btn--primary">
              Salvar regra automática
            </button>
          </div>
        </form>
      </div>

      <div className="ia-auto-reply-rules">
        <div className="ia-auto-reply-rules-head">
          <h5 className="ia-auto-reply-card-title">Regras cadastradas</h5>
          <span className="ia-auto-reply-count">{regras.length}</span>
        </div>

        {regras.length === 0 ? (
          <div className="ia-auto-reply-empty">
            <p>Nenhuma regra automática ainda.</p>
            <p className="ia-muted">Quando o cliente enviar a palavra-chave, o bot responderá sozinho.</p>
          </div>
        ) : (
          <ul className="ia-auto-reply-list">
            {regras.map((r) => (
              <li key={r.id} className="ia-auto-reply-card">
                <div className="ia-auto-reply-card-top">
                  <span className="ia-auto-reply-keyword">{r.palavra_chave}</span>
                  <span className="ia-auto-reply-arrow" aria-hidden="true">→</span>
                  <p className="ia-auto-reply-response">{r.resposta}</p>
                </div>
                <div className="ia-auto-reply-card-meta">
                  {r.departamentos?.nome ? (
                    <span className="ia-auto-reply-pill">Setor: {r.departamentos.nome}</span>
                  ) : null}
                  {r.tags?.nome ? (
                    <span className="ia-auto-reply-pill ia-auto-reply-pill--tag">Tag: {r.tags.nome}</span>
                  ) : null}
                  {r.horario_comercial_only ? (
                    <span className="ia-auto-reply-pill ia-auto-reply-pill--muted">Horário comercial</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="ia-btn ia-btn--outline ia-btn--small ia-auto-reply-delete"
                  onClick={() => onDelete(r.id)}
                >
                  Excluir
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

