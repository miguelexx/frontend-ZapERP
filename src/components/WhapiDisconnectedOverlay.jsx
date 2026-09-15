import { useNavigate } from "react-router-dom";
import { IconAlertTriangleFilled } from "@tabler/icons-react";
import { useWhapiChannelStatus } from "../chats/hooks/useWhapiChannelStatus";
import "./whapi-disconnected-overlay.css";

/**
 * Overlay vermelho de tela cheia quando TODOS os canais Whapi caem.
 *
 * Montado uma única vez no MainLayout. Fica invisível enquanto pelo menos um
 * canal está AUTH (ou a empresa não usa Whapi) e cobre TODO o sistema —
 * inclusive a sidebar — quando o hook confirma a desconexão. Mensagem grande
 * e pulsante para que ninguém continue atendendo sem perceber que nada será
 * entregue. Com 2+ números conectados o overlay não aparece.
 *
 * Escopo atual: somente Whapi (pedido do Miguel — "por enquanto só a whapi").
 */
export default function WhapiDisconnectedOverlay() {
  const { whapiDisconnected } = useWhapiChannelStatus();
  const navigate = useNavigate();

  if (!whapiDisconnected) return null;

  return (
    <div className="whapi-down-overlay" role="alertdialog" aria-modal="true" aria-live="assertive">
      <div className="whapi-down-overlay__content">
        <IconAlertTriangleFilled className="whapi-down-overlay__icon" size={96} aria-hidden />
        <h1 className="whapi-down-overlay__title">WhatsApp DESCONECTADO</h1>
        <p className="whapi-down-overlay__lead">
          O canal do WhatsApp caiu. Enquanto esta tela estiver vermelha,
          <strong> nenhuma mensagem é enviada nem recebida.</strong>
        </p>
        <p className="whapi-down-overlay__hint">
          Reconecte o canal para voltar a atender. Se você não tem acesso às
          configurações, avise o supervisor imediatamente.
        </p>
        <button
          type="button"
          className="whapi-down-overlay__btn"
          onClick={() => navigate("/configuracoes")}
        >
          Reconectar canal
        </button>
      </div>
    </div>
  );
}
