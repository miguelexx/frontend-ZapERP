import { useEffect, useState } from "react";

export default function AutomacoesView({ config, onSave, saving }) {
  const [v, setV] = useState(config);
  useEffect(() => setV(config), [config]);
  const inatividadeAtivo = (v.encerrar_automatico_min ?? 0) > 0;

  return (
    <div className="ia-section auto-section">
      <div className="auto-header">
        <h4 className="auto-title">5. Automações</h4>
        <p className="auto-subtitle">Comportamentos automáticos que economizam tempo e organizam o atendimento.</p>
      </div>

      {/* Card: Encerramento por inatividade */}
      <div className={`auto-card ${inatividadeAtivo ? "auto-card--active" : ""}`}>
        <div className="auto-card-header">
          <span className="auto-card-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </span>
          <div>
            <h3 className="auto-card-title">Encerramento por inatividade do cliente</h3>
            <p className="auto-card-desc">
              Fecha automaticamente conversas em que o cliente não responde ao chatbot dentro do prazo configurado.
            </p>
          </div>
        </div>

        <div className="auto-card-body">
          <div className="ia-field auto-field-inline">
            <label>
              Tempo limite (minutos)
              <span className="auto-label-hint">0 = desativado · máx. 10080 (7 dias)</span>
            </label>
            <input
              type="number"
              className="ia-input auto-input-num"
              min={0}
              max={10080}
              value={v.encerrar_automatico_min ?? 0}
              onChange={(e) => setV((c) => ({ ...c, encerrar_automatico_min: Number(e.target.value) || 0 }))}
            />
          </div>

          {inatividadeAtivo ? (
            <div className="ia-field auto-field-expand">
              <label>Mensagem enviada ao cliente ao encerrar</label>
              <textarea
                className="ia-textarea auto-textarea"
                rows={3}
                value={v.mensagem_encerramento_inatividade ?? ""}
                onChange={(e) => setV((c) => ({ ...c, mensagem_encerramento_inatividade: e.target.value }))}
                placeholder="-conversa encerrada por conta de inatividade-"
              />
              <p className="auto-hint">
                Enviada quando a conversa é fechada por falta de resposta. <strong>Exceção:</strong> não encerra se a última mensagem do bot foi a de &quot;fora do horário&quot; — a conversa permanece aberta para atendimento no próximo dia.
              </p>
            </div>
          ) : (
            <p className="auto-hint auto-hint--muted">
              Defina minutos acima de zero para ativar. Um novo campo permitirá configurar a mensagem enviada ao cliente ao fechar.
            </p>
          )}
        </div>
      </div>

      {/* Card: Comportamento do chatbot */}
      <div className="auto-card">
        <h3 className="auto-card-title">Comportamento do chatbot</h3>
        <div className="auto-card-body">
          <div className="ia-checkbox-row auto-checkbox">
            <input
              type="checkbox"
              id="transferir_humano"
              checked={v.transferir_para_humano_apos_bot}
              onChange={(e) => setV((c) => ({ ...c, transferir_para_humano_apos_bot: e.target.checked }))}
            />
            <div className="auto-checkbox-content">
              <label htmlFor="transferir_humano">Transferir para humano após limite do bot</label>
              <span className="auto-checkbox-hint">Quando o bot atingir o limite de mensagens, encaminha a conversa para atendente.</span>
            </div>
          </div>

          <div className="ia-field auto-field-inline">
            <label>Limite de mensagens do bot antes de transferir</label>
            <input
              type="number"
              className="ia-input auto-input-num"
              min={1}
              max={50}
              value={v.limite_mensagens_bot ?? 5}
              onChange={(e) => setV((c) => ({ ...c, limite_mensagens_bot: Number(e.target.value) || 5 }))}
            />
          </div>
        </div>
      </div>

      {/* Card: Conversas */}
      <div className="auto-card">
        <h3 className="auto-card-title">Conversas</h3>
        <div className="auto-card-body">
          <div className="ia-checkbox-row auto-checkbox">
            <input
              type="checkbox"
              id="auto_assumir"
              checked={v.auto_assumir}
              onChange={(e) => setV((c) => ({ ...c, auto_assumir: e.target.checked }))}
            />
            <div className="auto-checkbox-content">
              <label htmlFor="auto_assumir">Auto assumir conversa</label>
              <span className="auto-checkbox-hint">Atribui automaticamente ao primeiro atendente disponível.</span>
            </div>
          </div>

          <div className="ia-checkbox-row auto-checkbox">
            <input
              type="checkbox"
              id="reabrir_auto"
              checked={v.reabrir_automaticamente}
              onChange={(e) => setV((c) => ({ ...c, reabrir_automaticamente: e.target.checked }))}
            />
            <div className="auto-checkbox-content">
              <label htmlFor="reabrir_auto">Reabrir conversa automaticamente</label>
              <span className="auto-checkbox-hint">Ao receber nova mensagem de uma conversa encerrada, reabre para atendimento.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="auto-actions">
        <button className="ia-btn ia-btn--primary auto-btn-save" onClick={() => onSave(v)} disabled={saving}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}

