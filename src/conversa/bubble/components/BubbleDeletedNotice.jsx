import { memo } from "react";
import { formatHora, formatDia } from "../../utils/conversaViewHelpers";

/**
 * Aviso de auditoria exibido ACIMA do conteúdo do balão quando a mensagem foi apagada
 * "para todos". O balão original permanece no lugar; só sinalizamos quem apagou e quando.
 *
 * - Cliente apagou → "O contato apagou esta mensagem".
 * - Nosso atendente apagou → "Você apagou esta mensagem" (se fui eu) ou "Fulano apagou…".
 *
 * `info` vem de classifyBubbleMessage.deletionInfo: { kind, at, porUsuarioId, porNome }.
 */
function BubbleDeletedNotice({ info, currentUserId }) {
  if (!info) return null;

  const isCliente = info.kind === "cliente";
  let quem;
  if (isCliente) {
    quem = "O contato apagou esta mensagem";
  } else {
    const souEu =
      info.porUsuarioId != null &&
      currentUserId != null &&
      String(info.porUsuarioId) === String(currentUserId);
    if (souEu) {
      quem = "Você apagou esta mensagem";
    } else {
      const nome = info.porNome ? String(info.porNome).trim() : "";
      quem = nome ? `${nome} apagou esta mensagem` : "Um atendente apagou esta mensagem";
    }
  }

  // Data/hora do evento (registro de auditoria). Best-effort: se não veio timestamp, omite.
  let quando = "";
  if (info.at) {
    const dia = formatDia(info.at);
    const hora = formatHora(info.at);
    quando = [dia, hora].filter(Boolean).join(" ");
  }

  const titulo = isCliente
    ? "O contato apagou esta mensagem para todos no WhatsApp"
    : "Mensagem apagada para todos no WhatsApp";

  return (
    <div
      className={`wa-bubble-deletedNote ${isCliente ? "wa-bubble-deletedNote--cliente" : "wa-bubble-deletedNote--atendente"}`}
      role="note"
      title={quando ? `${titulo} · ${quando}` : titulo}
    >
      <svg
        className="wa-bubble-deletedNote-ic"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M5.6 5.6l12.8 12.8" />
      </svg>
      <span className="wa-bubble-deletedNote-txt">{quem}</span>
      {quando ? <span className="wa-bubble-deletedNote-when">· {quando}</span> : null}
    </div>
  );
}

export default memo(BubbleDeletedNotice);
