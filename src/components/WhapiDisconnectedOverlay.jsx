import { useNavigate, useLocation } from "react-router-dom";
import { IconAlertTriangleFilled } from "@tabler/icons-react";
import { useWhapiChannelStatus } from "../chats/hooks/useWhapiChannelStatus";
import "./whapi-disconnected-overlay.css";

function isConfiguracoesPath(pathname) {
  return pathname === "/configuracoes" || pathname.startsWith("/configuracoes/");
}

/**
 * Overlay vermelho só quando a sessão Whapi caiu de verdade.
 * Em /configuracoes fica oculto para o botão "Reconectar" abrir o painel.
 */
export default function WhapiDisconnectedOverlay() {
  const { whapiDisconnected } = useWhapiChannelStatus();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!whapiDisconnected || isConfiguracoesPath(pathname)) return null;

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
