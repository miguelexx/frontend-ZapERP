import { useNotificationStore } from "../../notifications/notificationStore";
import WhapiConnectPanel from "../../pages/WhapiConnectPanel";

export default function WhapiSection() {
  const showToast = useNotificationStore((s) => s.showToast);

  return (
    <div className="config-geral-section">
      <header className="config-geral-header">
        <span className="ia-auto-reply-eyebrow">WhatsApp</span>
        <h4 className="config-geral-title">Conectar Whapi</h4>
        <p className="config-geral-lead">
          O ZapERP consulta a instância na Whapi. Se ainda não houver canal, um clique cria e gera o QR — sem colar Channel ID ou token.
        </p>
      </header>
      <WhapiConnectPanel showToast={showToast} />
    </div>
  );
}
