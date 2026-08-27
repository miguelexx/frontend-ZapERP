import { useNavigate } from "react-router-dom";

export default function BotSection() {
  const navigate = useNavigate();

  return (
    <div className="ia-section">
      <h4>ChatBot / IA</h4>
      <p className="ia-muted">Configure automações, bot, roteamento e IA assistiva.</p>
      <div className="ia-btn-row" style={{ gap: 12 }}>
        <button type="button" className="ia-btn ia-btn--primary" onClick={() => navigate("/ia?tab=chatbot")}>
          Chatbot de Triagem
        </button>
        <button type="button" className="ia-btn ia-btn--outline" onClick={() => navigate("/ia")}>
          Painel completo IA / Bot
        </button>
      </div>
    </div>
  );
}
