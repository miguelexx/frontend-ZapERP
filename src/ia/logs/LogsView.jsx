export default function LogsView({ logs, onRefresh }) {
  return (
    <div className="ia-section">
      <h4>6. Logs do bot</h4>
      <p className="ia-muted">Ações do bot, respostas automáticas enviadas e erros.</p>
      <div className="ia-btn-row">
        <button type="button" className="ia-btn ia-btn--outline" onClick={onRefresh}>
          Atualizar
        </button>
      </div>

      {logs.length === 0 ? (
        <p className="ia-muted">Nenhum log registrado.</p>
      ) : (
        <div style={{ marginTop: 12, maxHeight: 400, overflowY: "auto" }}>
          {logs.map((l) => (
            <div key={l.id} className="ia-log-item">
              <span className={`ia-log-tipo ${l.tipo === "erro" ? "erro" : ""}`}>{l.tipo}</span>
              {l.detalhes?.texto && <span>{l.detalhes.texto}</span>}
              <span style={{ marginLeft: 8, color: "#64748b", fontSize: 12 }}>
                {l.criado_em ? new Date(l.criado_em).toLocaleString("pt-BR") : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
