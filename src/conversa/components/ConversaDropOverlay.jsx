import { IconAttach } from "../conversaViewIcons";

export default function ConversaDropOverlay({ open }) {
  return (
    <div
      className={`wa-dropOverlay${open ? " wa-dropOverlay--open" : ""}`}
      aria-hidden={!open}
      role="status"
    >
      <div className="wa-dropOverlay-frame">
        <div className="wa-dropCard">
          <div className="wa-dropIcon" aria-hidden="true">
            <IconAttach width={28} height={28} />
          </div>
          <div className="wa-dropTitle">Solte para anexar</div>
          <div className="wa-dropSub">Imagens, vídeos e documentos entram direto na conversa.</div>
        </div>
      </div>
    </div>
  );
}
