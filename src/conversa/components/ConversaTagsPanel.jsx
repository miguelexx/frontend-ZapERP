import { IconClose } from "../conversaViewIcons";

export default function ConversaTagsPanel({
  open,
  allTags,
  tagsLoading,
  selectedTagIds,
  tagMutatingId,
  onClose,
  onToggleTag,
}) {
  if (!open) return null;
  return (
    <>
      <button
        type="button"
        className="wa-floatingSheet-backdrop"
        aria-label="Fechar painel de tags"
        onClick={onClose}
      />
      <div className="wa-tagsPanel wa-tagsPanel--tags" role="dialog" aria-label="Tags da conversa">
        <div className="wa-tagsPanel-head">
          <span className="wa-tagsPanel-title">Tags do cliente</span>
          <button type="button" className="wa-iconBtn" onClick={onClose} title="Fechar">
            <IconClose />
          </button>
        </div>
        <div className="wa-tagsPanel-body">
          {tagsLoading && allTags.length === 0 ? (
            <div className="wa-muted">Carregando tags...</div>
          ) : allTags.length === 0 ? (
            <div className="wa-muted">Nenhuma tag cadastrada.</div>
          ) : (
            <div className="wa-tagsList">
              {allTags.map((tag) => {
                const selected = selectedTagIds.includes(String(tag.id));
                const busy = tagMutatingId === tag.id;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={`wa-tagChip ${selected ? "isSelected" : ""}`}
                    onClick={() => onToggleTag(tag)}
                    disabled={busy}
                  >
                    <span className="wa-tagChip-label">{tag.nome}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
