import { MessageSquarePlus, Search, MessageCircle, CheckCheck, Sparkles, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ZapERPLogo from "../brand/ZapERPLogo";
import Button from "../components/ui/Button";
import "../components/ui/button.css";
import { ZAPERP_FOCUS_CHAT_SEARCH_EVENT } from "./atendimentoUiEvents";
import "./atendimentoEmptyState.css";

/**
 * Área central quando nenhuma conversa está selecionada.
 * Lista à esquerda permanece; sem dashboard/métricas.
 */
export default function AtendimentoEmptyState() {
  const navigate = useNavigate();

  const handleNovaConversa = () => {
    navigate("/atendimento", { state: { openNovoContatoModal: true } });
  };

  const handleBuscarConversa = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ZAPERP_FOCUS_CHAT_SEARCH_EVENT));
    }
  };

  return (
    <div className="atendimento-empty atendimento-empty--studio">
      <div className="atendimento-empty__glow" aria-hidden="true" />
      <div className="atendimento-empty__grid" aria-hidden="true" />

      <div className="atendimento-empty__inner">
        <div className="studio-scene" aria-hidden="true">
          <div className="studio-scene__orbit studio-scene__orbit--outer" />
          <div className="studio-scene__orbit studio-scene__orbit--inner" />
          <div className="studio-scene__core"><ZapERPLogo variant="compact" size="lg" interactive={false} /></div>
          <div className="studio-scene__message studio-scene__message--in">
            <span className="studio-scene__avatar"><MessageCircle size={19} /></span>
            <span><i /><i /></span>
          </div>
          <div className="studio-scene__message studio-scene__message--out">
            <span><i /><i /></span><CheckCheck size={18} />
          </div>
          <span className="studio-scene__spark"><Sparkles size={20} strokeWidth={1.6} /></span>
          <span className="studio-scene__dot" />
        </div>

        <div className="atendimento-empty__panel">
          <span className="studio-eyebrow">CONEXÕES QUE FAZEM A DIFERENÇA</span>
          <h2 className="atendimento-empty__title">Grandes relações.<br /><span>Uma conversa de cada vez.</span></h2>
          <p className="atendimento-empty__desc">
            Seu próximo bom atendimento começa aqui. Selecione uma conversa ao lado ou dê início a uma nova conexão.
          </p>

          <div className="atendimento-empty__divider" aria-hidden="true">
            <span />
            <i />
            <span />
          </div>

          <div className="atendimento-empty__actions">
            <Button
              type="button"
              variant="primary"
              className="atendimento-empty__btn atendimento-empty__btn--primary"
              onClick={handleNovaConversa}
            >
              <MessageSquarePlus size={18} strokeWidth={1.75} aria-hidden />
              Nova conversa
              <ArrowUpRight size={16} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="atendimento-empty__btn atendimento-empty__btn--secondary"
              onClick={handleBuscarConversa}
            >
              <Search size={18} strokeWidth={1.75} aria-hidden />
              Buscar conversa
            </Button>
          </div>
        </div>

        <p className="atendimento-empty__hint">
          Atalho: pressione <kbd className="atendimento-empty__kbd">ESC</kbd> para sair de uma
          conversa.
        </p>
      </div>
    </div>
  );
}

