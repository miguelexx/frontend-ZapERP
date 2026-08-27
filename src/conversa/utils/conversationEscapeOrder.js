/**
 * Ordem de fechamento por Escape na conversa (fonte única da verdade).
 *
 * REGRA CRÍTICA (não quebrar): o Escape fecha UM overlay por vez, na ordem
 * de prioridade abaixo. Só quando NENHUM painel está aberto o Escape fecha a
 * própria conversa. Alterar esta ordem muda o comportamento percebido do
 * usuário — se precisar mexer, atualize também o teste
 * `scripts/test-conversa-escape-order.mjs`.
 *
 * Observação: os dois passos imperativos do composer (cancelar gravação e
 * `closePanels()`) rodam ANTES desta cadeia, no coordenador, porque são
 * imperativos/owned pelo Composer (checam e fecham no mesmo passo). Esta
 * cadeia cobre apenas os painéis/overlays controlados por estado.
 */

export const ESCAPE_PANEL_ORDER = [
  "mediaViewer",
  "pendingFile",
  "shareContact",
  "shareLocation",
  "pixModal",
  "msgInfo",
  "transferirSetor",
  "produtosPanel",
  "clienteSide",
  "timeline",
  "tags",
  "forwardOrSelect",
  "reply",
  "messageSearch",
];

/**
 * Monta a cadeia ordenada de entradas { name, active, run } a partir do estado
 * atual e das ações de fechamento. A ordem do array é a de `ESCAPE_PANEL_ORDER`.
 *
 * @param {object} state  flags de abertura de cada painel
 * @param {object} actions funções de fechamento correspondentes
 * @returns {{name:string, active:boolean, run:Function}[]}
 */
export function buildEscapeEntries(state, actions) {
  return [
    { name: "mediaViewer", active: !!state.mediaViewer, run: actions.closeMediaViewer },
    { name: "pendingFile", active: !!state.pendingFile, run: actions.clearPending },
    { name: "shareContact", active: !!state.shareContactOpen, run: actions.closeShareContact },
    { name: "shareLocation", active: !!state.shareLocationOpen, run: actions.closeShareLocation },
    { name: "pixModal", active: !!state.pixModalOpen, run: actions.closePixModal },
    { name: "msgInfo", active: !!state.msgInfoOpen, run: actions.closeMsgInfo },
    { name: "transferirSetor", active: !!state.showTransferirSetor, run: actions.closeTransferirSetor },
    { name: "produtosPanel", active: !!state.showProdutosPanel, run: actions.closeProdutosPanel },
    { name: "clienteSide", active: !!state.showClienteSide, run: actions.closeClienteSide },
    { name: "timeline", active: !!state.showTimeline, run: actions.closeTimeline },
    { name: "tags", active: !!state.tagsOpen, run: actions.closeTags },
    { name: "forwardOrSelect", active: !!(state.forwardOpen || state.selectMode), run: actions.dismissSelectionOverlay },
    { name: "reply", active: !!state.replyTo, run: actions.clearReply },
    { name: "messageSearch", active: !!state.messageSearchOpen, run: actions.closeMessageSearch },
  ];
}

/**
 * Executa o fechamento do primeiro painel ativo (maior prioridade) e retorna
 * seu `name`. Se nenhum estiver ativo, retorna null (o chamador então fecha a
 * conversa).
 *
 * @param {{name:string, active:boolean, run:Function}[]} entries
 * @returns {string|null}
 */
export function runFirstActiveEscape(entries) {
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.active) {
      entry.run?.();
      return entry.name ?? "";
    }
  }
  return null;
}
