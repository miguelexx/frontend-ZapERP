import { Navigate } from "react-router-dom";

/**
 * Protege rota baseado em permissão.
 * @param {object} props
 * @param {boolean} props.canAccess - se o usuário tem permissão
 * @param {string} props.redirectTo - rota de redirecionamento (ex: /atendimento)
 * @param {React.ReactNode} props.children - conteúdo a renderizar se autorizado
 */
export default function ProtectedRoute({ canAccess, redirectTo = "/atendimento", children }) {
  if (!canAccess) {
    return <Navigate to={redirectTo} replace />;
  }
  return children;
}
