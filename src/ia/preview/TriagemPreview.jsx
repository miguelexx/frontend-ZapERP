export default function TriagemPreview({ config, departamentos }) {
  const options = config.options || [];
  const previewDept = departamentos.find((d) => d.id === options.find((o) => o.active)?.departamento_id)?.nome || "Vendas";
  const previewConfirm = (config.confirmSelectionMessage || "").replace(/\{\{departamento\}\}/gi, previewDept);
  const previewFinal = (config.mensagemFinalizacao || "")
    .replace(/\{\{protocolo\}\}/gi, "12345")
    .replace(/\{\{nome_atendente\}\}/gi, "Maria");

  return (
    <div className="chatbot-preview">
      <div className="chatbot-preview-card">
        <h3 className="chatbot-preview-title">Preview — Como o cliente verá</h3>
        <div className="chatbot-preview-phone">
          <div className="chatbot-preview-bubbles">
            <div className="chatbot-bubble chatbot-bubble--in">
              <span className="chatbot-bubble-time">agora</span>
              <div className="chatbot-bubble-text">
                {(config.welcomeMessage || "Digite a mensagem de boas-vindas ao lado.").split("\n").map((line, index) => (
                  <span key={index}>{line || " "}<br /></span>
                ))}
              </div>
            </div>
            <div className="chatbot-bubble chatbot-bubble--out">
              <span className="chatbot-bubble-time">agora</span>
              <div className="chatbot-bubble-text">1</div>
            </div>
            <div className="chatbot-bubble chatbot-bubble--in">
              <span className="chatbot-bubble-time">agora</span>
              <div className="chatbot-bubble-text">
                {previewConfirm || "Mensagem de confirmação (ex: Perfeito! Seu atendimento foi direcionado para o setor Vendas...)"}
              </div>
            </div>
          </div>
        </div>
        <p className="chatbot-preview-hint">Simulação: cliente responde "1" → recebe confirmação com setor "{previewDept}"</p>
        {config.enviarMensagemFinalizacao && (config.mensagemFinalizacao || "").trim() && (
          <div className="chatbot-preview-final" style={{ marginTop: 16, padding: 12, background: "var(--ia-bg-secondary, #1e293b)", borderRadius: 8 }}>
            <p className="chatbot-preview-hint" style={{ marginBottom: 8 }}>Mensagem ao finalizar (ex.: protocolo 12345, atendente Maria):</p>
            <div className="chatbot-bubble chatbot-bubble--in">
              <div className="chatbot-bubble-text" style={{ whiteSpace: "pre-wrap" }}>{previewFinal}</div>
            </div>
          </div>
        )}
        {config.foraHorarioEnabled && (config.mensagemForaHorario || "").trim() && (
          <div className="chatbot-preview-final" style={{ marginTop: 16, padding: 12, background: "var(--ia-bg-secondary, #1e293b)", borderRadius: 8 }}>
            <p className="chatbot-preview-hint" style={{ marginBottom: 8 }}>Mensagem fora do horário ({config.horarioInicio || "09:00"}–{config.horarioFim || "18:00"}):</p>
            <div className="chatbot-bubble chatbot-bubble--in">
              <div className="chatbot-bubble-text" style={{ whiteSpace: "pre-wrap" }}>{(config.mensagemForaHorario || "").trim()}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
