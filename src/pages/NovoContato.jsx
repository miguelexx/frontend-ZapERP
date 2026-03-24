import { Navigate } from "react-router-dom";

/** Rota legada: abre o modal na lista de atendimento (mesmo fluxo do menu Novo → Novo contato). */
export default function NovoContato() {
  return <Navigate to="/atendimento" replace state={{ openNovoContatoModal: true }} />;
}
