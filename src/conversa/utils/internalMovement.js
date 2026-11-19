/**
 * "Movimentação interna" (card escuro: assumiu/transferiu). Extraído do ThreadRow (19/11/2026)
 * para o montador de linhas também poder usar — regra idêntica à de antes.
 */
/*
 * Corre para TODAS as mensagens normais (as duas verifica\u00e7\u00f5es baratas acima falham nelas) e,
 * pior, o mesmo teste vive no `estimateSize` do virtualizador \u2014 chamado item a item a cada
 * medi\u00e7\u00e3o. A vers\u00e3o antiga fazia `trim()` + `split()` do corpo inteiro e `normalize("NFD")`,
 * que \u00e9 das opera\u00e7\u00f5es de string mais caras que h\u00e1.
 *
 * Agora: recorta a 1.\u00aa linha sem partir o corpo todo e s\u00f3 decomp\u00f5e acentos se a linha j\u00e1
 * contiver "movimenta" \u2014 prefixo comum a "movimenta\u00e7\u00e3o" e "movimentacao", portanto um
 * superconjunto seguro (nenhuma movimenta\u00e7\u00e3o real escapa ao filtro).
 */
function textLooksInternalMovement(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const nl = raw.indexOf("\n");
  const firstLine = (nl === -1 ? raw : raw.slice(0, nl)).trim() || raw;
  const lower = firstLine.toLowerCase();
  if (!lower.includes("movimenta")) return false;
  const normalized = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized.includes("movimentacao interna");
}

export function isInternalMovementMessage(item) {
  return item?.mensagem_interna === true ||
    String(item?.tipo || "").toLowerCase() === "movimentacao_interna_atendimento" ||
    textLooksInternalMovement(item?.texto || item?.conteudo || item?.message || item?.body);
}

