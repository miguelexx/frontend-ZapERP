export default function SavedRepliesPanel({
  open,
  isRecording,
  panelRef,
  loading,
  error,
  replies,
  allReplies,
  activeIndex,
  onInsert,
}) {
  if (!open || isRecording) return null;

  return (
    <div
      ref={panelRef}
      className="wa-savedRepliesPanel"
      role="listbox"
      aria-label="Respostas salvas"
    >
      <div className="wa-savedRepliesPanel-head">
        <span className="wa-savedRepliesPanel-title">Respostas salvas</span>
        <span className="wa-muted wa-savedRepliesPanel-hint">↑↓ navegar · Enter inserir · Esc fechar</span>
      </div>
      <div className="wa-savedRepliesPanel-body">
        {loading ? (
          <div className="wa-muted">Carregando...</div>
        ) : error ? (
          <div className="wa-muted" role="status">{error}</div>
        ) : replies.length === 0 ? (
          <div className="wa-muted wa-savedRepliesPanel-empty">
            {allReplies.length === 0 ? (
              <>
                <p>Nenhuma resposta salva pessoal.</p>
                <p className="wa-savedRepliesPanel-empty-hint">
                  Cadastre em <strong>Configurações → Respostas salvas</strong> (não confundir com
                  &quot;Respostas automáticas&quot; do Bot em IA).
                </p>
              </>
            ) : (
              "Nenhuma resposta encontrada para esta busca."
            )}
          </div>
        ) : (
          <div className="wa-savedRepliesList">
            {replies.map((reply, index) => (
              <button
                key={reply.id}
                type="button"
                className={`wa-savedReplyItem ${index === activeIndex ? "isActive" : ""}`}
                role="option"
                aria-selected={index === activeIndex ? "true" : "false"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onInsert(reply.texto)}
                title={reply.titulo}
              >
                <strong>{reply.titulo}</strong>
                <span className="wa-muted wa-savedReplyItem-preview">
                  {String(reply.texto || "").slice(0, 80)}
                  {(reply.texto || "").length > 80 ? "…" : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
