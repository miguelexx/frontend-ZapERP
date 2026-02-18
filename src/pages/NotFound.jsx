import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="not-found-page">
      <div className="not-found-content">
        <h1 className="not-found-title">404</h1>
        <p className="not-found-message">Página não encontrada.</p>
        <p className="not-found-hint">O endereço pode estar incorreto ou a página foi movida.</p>
        <Link to="/atendimento" className="not-found-link">
          Ir para Atendimento
        </Link>
      </div>
    </div>
  );
}
