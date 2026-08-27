import { IconClose } from "../conversaViewIcons";

export default function ConversaSetorPanel({
  open,
  departamentos,
  conversa,
  transferirSetorLoading,
  onClose,
  onTransfer,
  onRemove,
}) {
  if (!open) return null;
  return (
    <>
      <button
        type="button"
        className="wa-floatingSheet-backdrop"
        aria-label="Fechar painel de setor"
        onClick={onClose}
      />
      <div
        className="wa-tagsPanel wa-tagsPanel--setor"
        role="dialog"
        aria-label="Transferir setor"
      >
        <div className="wa-tagsPanel-head">
          <span className="wa-tagsPanel-title">Transferir setor</span>
          <button type="button" className="wa-iconBtn" onClick={onClose} title="Fechar">
            <IconClose />
          </button>
        </div>
        <div className="wa-tagsPanel-body">
          {departamentos.length === 0 ? (
            <div className="wa-muted">Carregando setores...</div>
          ) : (
            <div className="wa-tagsList">
              {departamentos.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="wa-tagItem"
                  onClick={() => onTransfer(d.id)}
                  disabled={transferirSetorLoading || Number(d.id) === Number(conversa?.departamento_id)}
                >
                  {d.nome}
                  {Number(d.id) === Number(conversa?.departamento_id) ? " (atual)" : ""}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="wa-tagItem wa-tagItem--remover"
            onClick={onRemove}
            disabled={transferirSetorLoading || !conversa?.departamento_id}
            title={conversa?.departamento_id ? "Remover setor da conversa" : "Conversa já está sem setor"}
          >
            Sem setor
          </button>
          {transferirSetorLoading && (
            <div className="wa-muted" style={{ marginTop: 8 }}>Salvando...</div>
          )}
        </div>
      </div>
    </>
  );
}
