import { Link } from "react-router-dom";
import ZapERPLogo from "../brand/ZapERPLogo";
import "./campanhas.css";

export default function Campanhas() {
  return (
    <div className="coming-soon-page">
      <div className="coming-soon-card">
        <div className="coming-soon-icon" aria-hidden>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <h1 className="coming-soon-title">Campanhas em breve</h1>
        <p className="coming-soon-desc">
          Envie mensagens em massa para sua base de contatos. Agendamento, segmentação e relatórios de entrega — tudo em um só lugar.
        </p>
        <p className="coming-soon-hint">
          Esta funcionalidade está em desenvolvimento. Em breve você poderá criar campanhas, definir horários e acompanhar resultados.
        </p>
        <div className="coming-soon-features">
          <span className="coming-soon-feature">Envio em massa</span>
          <span className="coming-soon-feature">Agendamento</span>
          <span className="coming-soon-feature">Segmentação</span>
          <span className="coming-soon-feature">Relatórios</span>
        </div>
        <Link to="/atendimento" className="coming-soon-btn">
          Voltar ao Atendimento
        </Link>
      </div>
      <div className="coming-soon-brand">
        <ZapERPLogo variant="horizontal" size="sm" />
      </div>
    </div>
  );
}
