export default function ConversaDropOverlay({ open, onDragOver, onDragLeave, onDrop }) {
  if (!open) return null;
  return (
    <div
      className="wa-dropOverlay"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      role="presentation"
    >
      <div className="wa-dropCard">
        <div className="wa-dropTitle">Solte para anexar</div>
        <div className="wa-dropSub">Envie imagens e arquivos diretamente na conversa.</div>
      </div>
    </div>
  );
}
