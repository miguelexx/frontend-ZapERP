import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { IconAlertTriangleFilled } from "@tabler/icons-react";
import { useWhapiChannelStatus } from "../chats/hooks/useWhapiChannelStatus";
import { useAuthStore } from "../auth/authStore";
import { isSupervisorOrAdmin } from "../auth/permissions";
import WhapiReconnectCard from "./WhapiReconnectCard";
import "./whapi-disconnected-overlay.css";

function isConfiguracoesPath(pathname) {
  return pathname === "/configuracoes" || pathname.startsWith("/configuracoes/");
}

/**
 * Overlay só quando a sessão Whapi caiu de verdade.
 * Em /configuracoes fica oculto para o painel de conexão ficar acessível.
 *
 * Quem pode reconectar (supervisor/admin) recebe o QR Code na própria tela — as
 * rotas de instância exigem esse perfil, então atendente continua vendo o aviso
 * vermelho para acionar o supervisor.
 */
export default function WhapiDisconnectedOverlay() {
  const { whapiDisconnected, revalidate } = useWhapiChannelStatus();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const timersRef = useRef([]);

  useEffect(() => {
    const timers = timersRef;
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  /**
   * O canal autenticou nesta tela. O `/chats/whapi-status` lê a saúde ao vivo e
   * pode levar um instante para ver o AUTH, então reconfere mais duas vezes —
   * sem isso o overlay poderia ficar até o próximo poll (60s) com tudo já OK.
   */
  const handleConnected = useCallback(() => {
    revalidate();
    timersRef.current.push(
      setTimeout(revalidate, 2_500),
      setTimeout(revalidate, 6_000)
    );
  }, [revalidate]);

  if (!whapiDisconnected || isConfiguracoesPath(pathname)) return null;

  if (isSupervisorOrAdmin(user)) {
    return (
      <div
        className="whapi-down-overlay whapi-down-overlay--connect"
        role="alertdialog"
        aria-modal="true"
        aria-label="WhatsApp desconectado — reconectar por QR Code"
        aria-live="assertive"
      >
        <WhapiReconnectCard
          onConnected={handleConnected}
          onOpenSettings={() => navigate("/configuracoes/whatsapp")}
        />
      </div>
    );
  }

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
