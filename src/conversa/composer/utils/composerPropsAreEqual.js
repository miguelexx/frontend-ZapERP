export function composerPropsAreEqual(prev, next) {
  if (prev.conversaId !== next.conversaId) return false;
  if (prev.departamentoId !== next.departamentoId) return false;
  if (prev.scrollThreadId !== next.scrollThreadId) return false;
  if (prev.loading !== next.loading) return false;
  if (prev.sending !== next.sending) return false;
  if (prev.podeEnviar !== next.podeEnviar) return false;
  if (prev.autoAssumirHint !== next.autoAssumirHint) return false;
  if (prev.headerCompact !== next.headerCompact) return false;
  if (prev.composerEnterInsertsNewline !== next.composerEnterInsertsNewline) return false;
  if (prev.autocorrectToggleInMenu !== next.autocorrectToggleInMenu) return false;
  if (prev.pixActionBusy !== next.pixActionBusy) return false;
  if (prev.pixConfigLoading !== next.pixConfigLoading) return false;
  if (prev.appendTextQueue !== next.appendTextQueue) return false;
  if (prev.mensagensBloqueadasHint !== next.mensagensBloqueadasHint) return false;
  if (prev.atendimentoEncerradoHint !== next.atendimentoEncerradoHint) return false;
  if (prev.atendenteNomeHint !== next.atendenteNomeHint) return false;
  if (prev.podeAnotar !== next.podeAnotar) return false;
  if (prev.onSendInternalNote !== next.onSendInternalNote) return false;
  const previousReply = prev.replyBarPreview;
  const nextReply = next.replyBarPreview;
  if (previousReply !== nextReply) {
    if (!previousReply || !nextReply) return false;
    if (
      previousReply.thumb !== nextReply.thumb ||
      previousReply.title !== nextReply.title ||
      previousReply.text !== nextReply.text
    ) {
      return false;
    }
  }
  return true;
}
