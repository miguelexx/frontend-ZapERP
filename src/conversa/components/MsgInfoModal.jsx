import { createPortal } from "react-dom";
import { formatDia, formatHora, safeString } from "../utils/conversaViewHelpers";
import { snippetFromMsg } from "../utils/conversaMessageDisplay";
import { IconClose } from "../conversaViewIcons";

/** Rótulo em português do status cru da coluna (a tela mostrava "delivered"/"read"). */
const STATUS_LABEL = {
  pending: "Enviando",
  sending: "Enviando",
  enviando: "Enviando",
  sent: "Enviada",
  enviada: "Enviada",
  enviado: "Enviada",
  server: "Enviada",
  delivered: "Entregue",
  device: "Entregue",
  entregue: "Entregue",
  received: "Entregue",
  read: "Visualizada",
  lida: "Visualizada",
  seen: "Visualizada",
  visualizada: "Visualizada",
  played: "Ouvida",
  erro: "Não enviada",
  failed: "Não enviada",
  status_indefinido: "Verificando",
  aguardando_conexao: "Aguardando conexão",
};

function statusLegivel(msg) {
  const cru = safeString(msg?.status_mensagem || msg?.status).toLowerCase().trim();
  if (!cru) return "Enviada";
  return STATUS_LABEL[cru] || cru;
}

export default function MsgInfoModal({ open, msgInfo, onClose }) {
  if (!open || !msgInfo) return null;

  // F9 do doc 33: horário de entrega/leitura (colunas entregue_em/lida_em, preenchidas pelo
  // ACK). Nulo = sem informação — a linha nem aparece, em vez de mostrar "—" como se fosse dado.
  const entregueEm = msgInfo?.entregue_em || msgInfo?.entregueEm || null;
  const lidaEm = msgInfo?.lida_em || msgInfo?.lidaEm || null;

  return createPortal(
    <div
      className="wa-modalOverlay"
      role="dialog"
      aria-label="Dados da mensagem"
      onMouseDown={onClose}
    >
      <div className="wa-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wa-modal-head">
          <div className="wa-modal-title">Dados da mensagem</div>
          <button type="button" className="wa-iconBtn" onClick={onClose} title="Fechar">
            <IconClose />
          </button>
        </div>

        <div className="wa-modal-body">
          <div className="wa-modal-row">
            <span className="wa-modal-label">Conteúdo</span>
            <span className="wa-modal-value">{snippetFromMsg(msgInfo)}</span>
          </div>
          <div className="wa-modal-row">
            <span className="wa-modal-label">Horário</span>
            <span className="wa-modal-value">
              {formatDia(msgInfo?.criado_em)} {formatHora(msgInfo?.criado_em)}
            </span>
          </div>
          <div className="wa-modal-row">
            <span className="wa-modal-label">Status</span>
            <span className="wa-modal-value">{statusLegivel(msgInfo)}</span>
          </div>
          {entregueEm ? (
            <div className="wa-modal-row">
              <span className="wa-modal-label">Entregue</span>
              <span className="wa-modal-value">
                {formatDia(entregueEm)} {formatHora(entregueEm)}
              </span>
            </div>
          ) : null}
          {lidaEm ? (
            <div className="wa-modal-row">
              <span className="wa-modal-label">Visualizada</span>
              <span className="wa-modal-value">
                {formatDia(lidaEm)} {formatHora(lidaEm)}
              </span>
            </div>
          ) : null}
          {safeString(msgInfo?.whatsapp_id) ? (
            <div className="wa-modal-row">
              <span className="wa-modal-label">ID WhatsApp</span>
              <span className="wa-modal-value wa-mono">{String(msgInfo.whatsapp_id)}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
