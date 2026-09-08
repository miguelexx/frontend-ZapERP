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
          Cadastre o canal, leia o QR Code no celular e conecte a instância sozinho — sem suporte no meio.
        </p>
      </header>
      <WhapiConnectPanel showToast={showToast} />
    </div>
  );
}
