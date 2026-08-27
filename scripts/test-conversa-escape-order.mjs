/**
 * Regressão: ordem de fechamento por Escape na conversa.
 * O Escape fecha UM painel por vez, na prioridade definida, e só fecha a
 * conversa quando nenhum painel está aberto.
 * Executar: node scripts/test-conversa-escape-order.mjs
 */
import {
  ESCAPE_PANEL_ORDER,
  buildEscapeEntries,
  runFirstActiveEscape,
} from "../src/conversa/utils/conversationEscapeOrder.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let passed = 0;

/** Ações espionadas: registram qual foi chamada. */
function makeActions(log) {
  const names = [
    "closeMediaViewer",
    "clearPending",
    "closeShareContact",
    "closeShareLocation",
    "closePixModal",
    "closeMsgInfo",
    "closeTransferirSetor",
    "closeProdutosPanel",
    "closeClienteSide",
    "closeTimeline",
    "closeTags",
    "dismissSelectionOverlay",
    "clearReply",
    "closeMessageSearch",
  ];
  const actions = {};
  for (const n of names) actions[n] = () => log.push(n);
  return actions;
}

/** Mapeia name da entrada → chave da flag de estado usada em buildEscapeEntries. */
const NAME_TO_STATE = {
  mediaViewer: "mediaViewer",
  pendingFile: "pendingFile",
  shareContact: "shareContactOpen",
  shareLocation: "shareLocationOpen",
  pixModal: "pixModalOpen",
  msgInfo: "msgInfoOpen",
  transferirSetor: "showTransferirSetor",
  produtosPanel: "showProdutosPanel",
  clienteSide: "showClienteSide",
  timeline: "showTimeline",
  tags: "tagsOpen",
  forwardOrSelect: "forwardOpen",
  reply: "replyTo",
  messageSearch: "messageSearchOpen",
};

/** Mapeia name da entrada → ação esperada. */
const NAME_TO_ACTION = {
  mediaViewer: "closeMediaViewer",
  pendingFile: "clearPending",
  shareContact: "closeShareContact",
  shareLocation: "closeShareLocation",
  pixModal: "closePixModal",
  msgInfo: "closeMsgInfo",
  transferirSetor: "closeTransferirSetor",
  produtosPanel: "closeProdutosPanel",
  clienteSide: "closeClienteSide",
  timeline: "closeTimeline",
  tags: "closeTags",
  forwardOrSelect: "dismissSelectionOverlay",
  reply: "clearReply",
  messageSearch: "closeMessageSearch",
};

// 1) A ordem das entradas deve bater exatamente com ESCAPE_PANEL_ORDER.
{
  const entries = buildEscapeEntries({}, makeActions([]));
  const order = entries.map((e) => e.name);
  assert(
    JSON.stringify(order) === JSON.stringify(ESCAPE_PANEL_ORDER),
    `ordem divergente: ${JSON.stringify(order)}`
  );
  passed += 1;
}

// 2) Nenhum painel aberto → nada roda e o resolver retorna null (conversa fecha).
{
  const log = [];
  const handled = runFirstActiveEscape(buildEscapeEntries({}, makeActions(log)));
  assert(handled === null, "sem painel aberto deveria retornar null");
  assert(log.length === 0, "sem painel aberto nenhuma ação deveria rodar");
  passed += 1;
}

// 3) Com TODOS abertos, roda somente o de maior prioridade (mediaViewer).
{
  const state = {};
  for (const key of Object.values(NAME_TO_STATE)) state[key] = true;
  state.selectMode = true;
  const log = [];
  const handled = runFirstActiveEscape(buildEscapeEntries(state, makeActions(log)));
  assert(handled === "mediaViewer", `esperado mediaViewer, veio ${handled}`);
  assert(log.length === 1 && log[0] === "closeMediaViewer", `ação errada: ${log.join(",")}`);
  passed += 1;
}

// 4) Para cada painel isolado, o Escape roda exatamente a ação daquele painel.
for (const name of ESCAPE_PANEL_ORDER) {
  const state = { [NAME_TO_STATE[name]]: true };
  const log = [];
  const handled = runFirstActiveEscape(buildEscapeEntries(state, makeActions(log)));
  assert(handled === name, `isolado: esperado ${name}, veio ${handled}`);
  assert(
    log.length === 1 && log[0] === NAME_TO_ACTION[name],
    `isolado ${name}: ação errada -> ${log.join(",")}`
  );
  passed += 1;
}

// 5) Prioridade em pares: o de maior prioridade vence quando dois estão abertos.
{
  // tags (11º) vs messageSearch (14º) → tags vence
  const log = [];
  const handled = runFirstActiveEscape(
    buildEscapeEntries({ tagsOpen: true, messageSearchOpen: true }, makeActions(log))
  );
  assert(handled === "tags", `par tags/search: esperado tags, veio ${handled}`);
  passed += 1;
}

// 6) forwardOrSelect ativa tanto por forwardOpen quanto por selectMode.
{
  const log1 = [];
  assert(
    runFirstActiveEscape(buildEscapeEntries({ forwardOpen: true }, makeActions(log1))) === "forwardOrSelect",
    "forwardOpen deveria ativar forwardOrSelect"
  );
  const log2 = [];
  assert(
    runFirstActiveEscape(buildEscapeEntries({ selectMode: true }, makeActions(log2))) === "forwardOrSelect",
    "selectMode deveria ativar forwardOrSelect"
  );
  passed += 1;
}

console.log(`OK — ordem do Escape da conversa passou (${passed} cenários).`);
