/**
 * ESTADO DO TIQUE DE ENVIO — fonte única da bolha e do card da lista.
 *
 * Até 2026-11-03 cada tela decidia o seu: a bolha em `conversa/bubble/utils/bubbleStatus.js`
 * (com tabela de rank, canonização de ACK cru e marcos de horário) e o card da lista num
 * `ChatTicks` próprio que só comparava strings exatas. Resultado visível em produção: a
 * mesma mensagem com ✓✓ na thread e ✓ no card. As divergências eram quatro:
 *
 *   1. ACK cru. O banco guarda `device` / `server` (o que o provedor manda). A bolha
 *      mapeava `device` → entregue; o card não conhecia a palavra e caía no ✓ genérico.
 *      É esta que aparece logo ao abrir a lista, antes de qualquer evento de socket.
 *   2. Precedência entre os dois campos. Linhas legadas têm `status_mensagem` e `status`
 *      divergentes. A bolha exibe o MAIOR dos dois; o card usava o primeiro não-nulo, por
 *      isso um `status_mensagem: 'pending'` velho vencia um `status: 'read'`.
 *   3. Marcos de horário. `lida_em` / `entregue_em` provam leitura e entrega mesmo com o
 *      status preso. A bolha lia; o card ignorava.
 *   4. `whatsapp_id`. Ter id do provedor significa que o WhatsApp aceitou: a bolha nunca
 *      desenha "não enviei" nesse caso, o card desenhava.
 *
 * Este módulo é folha de propósito (sem imports): entra no chunk da lista sem arrastar o
 * `conversaViewHelpers` inteiro, que tem mais de mil linhas e puxa API, timezone e afins.
 *
 * Devolve o ESTADO, não a marcação: cada tela monta a sua (`wa-ticks` na bolha,
 * `chat-ticks` no card). Quem acrescentar um estado acrescenta-o aqui, uma vez.
 */

function safeString(v) {
  return String(v ?? "").trim();
}

const CONFIRMED_STATUS = [
  "sent",
  "enviada",
  "enviado",
  "delivered",
  "entregue",
  "read",
  "lida",
  "played",
];

/**
 * Linhas legadas no banco podem ter os dois campos DIVERGENTES (ex.: status='played' com
 * status_mensagem='pending', ou ambos com o ACK cru 'device'/'server' sem canonizar).
 * Para EXIBIÇÃO, vale o mais avançado dos dois — normalizado para o nome canônico, senão
 * 'device' não casa com as regexes abaixo e viraria tique único. Estados especiais
 * (erro/blocked/status_indefinido/aguardando_conexao) não entram no rank: neles a regra
 * original (status_mensagem primeiro) permanece intacta.
 */
const PROGRESS_DISPLAY_RANK = {
  pending: 0, sending: 0, enviando: 0,
  sent: 1, enviada: 1, enviado: 1, server: 1,
  delivered: 2, device: 2, entregue: 2, received: 2,
  read: 3, lida: 3, seen: 3,
  played: 4,
};
const PROGRESS_CANONICAL = ["pending", "sent", "delivered", "read", "played"];

function progressRank(v) {
  const s = safeString(v).toLowerCase();
  return Object.prototype.hasOwnProperty.call(PROGRESS_DISPLAY_RANK, s)
    ? PROGRESS_DISPLAY_RANK[s]
    : null;
}

/**
 * O provedor aceitou e identificou a mensagem?
 *
 * `whatsapp_id` só é gravado com um id REAL e rastreável devolvido pelo provedor. Quando o
 * provedor RECUSA o envio não há id nenhum. Logo este campo separa dois erros que a tela
 * tratava como um só:
 *   - `erro` SEM id  → o provedor recusou. "Não foi possível enviar" é verdade.
 *   - `erro` COM id  → o provedor aceitou e NÓS desistimos de esperar a confirmação
 *     (o serviço de reconciliação marca erro após `PENDING_OUTBOUND_WHAPI_UNACKED_FAIL_MINUTES`,
 *     120 min por padrão). Dizer "não foi possível enviar" aí é falso: em produção, em
 *     13/10/2026, mensagens entregues ao cliente apareciam assim, o atendente reenviava e o
 *     cliente recebia duplicado.
 */
export function temIdDoProvedor(msg) {
  return !!safeString(msg?.whatsapp_id);
}

/**
 * Estado do tique de uma mensagem de saída.
 *
 * @param {object} msg mensagem (da thread ou `ultima_mensagem` do card)
 * @param {{ isGroup?: boolean, out?: boolean }} opts `out` vem de quem chama — a bolha usa
 *   `isOutgoingMessage`, o card usa a direção que já tem — para este módulo ficar sem imports.
 * @returns {null | { kind, title, isErr, isPending, isRetry, isDelivered, isRead, isDemorado }}
 *   `null` quando a mensagem não é de saída (entrada não tem tique).
 */
export function resolveTickState(msg, { isGroup = false, out = true } = {}) {
  if (!out) return null;

  let raw = msg?.status_mensagem ?? msg?.status ?? msg?.situacao;
  const rankSm = progressRank(msg?.status_mensagem);
  const rankSt = progressRank(msg?.status);
  if (rankSm != null) {
    // status_mensagem é progresso: exibe o MAIOR entre os dois, já canônico.
    raw = PROGRESS_CANONICAL[rankSt != null ? Math.max(rankSm, rankSt) : rankSm];
  } else if (msg?.status_mensagem == null && rankSt != null) {
    raw = PROGRESS_CANONICAL[rankSt];
  }
  const maybeNum =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : /^\d+$/.test(String(raw || "").trim())
        ? Number(raw)
        : null;
  const rawStatus = raw != null && maybeNum == null ? safeString(raw).toLowerCase() : String(maybeNum ?? "");
  const hasReadAt = !!(msg?.lida_em || msg?.lidaEm || msg?.read_at || msg?.readAt);
  const hasDeliveredAt = !!(msg?.entregue_em || msg?.entregueEm || msg?.delivered_at || msg?.deliveredAt);

  // ACK numérico (0..4) de alguns provedores.
  if (maybeNum != null) {
    if (maybeNum <= 0) return estado({ kind: "pending", isPending: true });
    if (maybeNum === 1) return estado({ kind: "sent" });
    if (maybeNum === 2) return estado({ kind: "delivered", isDelivered: true });
    if (maybeNum >= 3 && !isGroup) return estado({ kind: "read", isDelivered: true, isRead: true });
    if (maybeNum >= 3 && isGroup) return estado({ kind: "delivered", isDelivered: true });
  }

  const s = rawStatus;
  const hasReadKeyword = /lida|read|seen|visualiz|played/.test(s);
  const hasDeliveredKeyword = /entregue|deliver|receiv/.test(s);
  // "blocked" vem na resposta HTTP quando a proteção de envio barrou a mensagem (no banco a
  // linha fica 'erro'). Sem ele aqui, a bolha caía no fallback "sent" e a falha ficava invisível.
  /*
   * `erro` NUNCA é mascarado aqui, nem quando há id do provedor. Em 15/10/2026 cheguei a
   * esconder esse caso (o relato era de mensagem entregue aparecendo como falha), mas a
   * revisão mostrou que `erro` COM id também é produzido por falha que o provedor INFORMOU
   * (`providerRowIndicatesFailure`: unsent/invalid/expired/failed, e o ACK `failed` da Whapi).
   * Esconder isso trocaria um alarme falso por uma falha silenciosa. A correção certa é não
   * deixar o backend inventar `erro` por decurso de prazo — feita em
   * `pendingOutboundReconciliationService`, que ainda cura as linhas já marcadas.
   */
  const isErr = s === "erro" || s === "error" || s === "failed" || s === "falhou" || s === "blocked";
  const statusJaConfirmado = CONFIRMED_STATUS.includes(s);
  const isAguardandoConexao =
    !isErr &&
    !statusJaConfirmado &&
    (s === "aguardando_conexao" || !!msg?.aguardando_conexao);
  /*
   * `whatsapp_id` só é gravado com um id REAL e rastreável devolvido pelo provedor — o
   * backend é explícito sobre isso ("whatsapp_id só recebe IDs reais do WhatsApp", e a
   * resposta do envio devolve `status: 'sent'` junto com ele). Logo, ter whatsapp_id
   * significa que o WhatsApp ACEITOU a mensagem: ela saiu.
   *
   * Sem isto, uma mensagem entregue cujo ACK de entrega não voltou (status preso em
   * pending/sending, ou rebaixada a `status_indefinido` pelo watchdog) desenhava RELÓGIO —
   * o atendente lia "não enviei" e reenviava, duplicando para o cliente. Observado em
   * produção em 13/10/2026: várias mensagens com whatsapp_id presente e status preso.
   *
   * O tique continua único (enviada) e só vira duplo com o ACK de entrega de verdade —
   * não inventamos entrega, apenas paramos de negar o envio.
   */
  const confirmadoPeloProvedor = temIdDoProvedor(msg) && !isErr && !isAguardandoConexao;

  const isIndefinido =
    !isErr && !isAguardandoConexao && !confirmadoPeloProvedor &&
    (s === "status_indefinido" || !!msg?.envio_incerto);
  const isDemorado =
    !isErr && !isAguardandoConexao && !confirmadoPeloProvedor &&
    !!(msg?.envio_demorado || isIndefinido);
  const isRetry = !isErr && !isIndefinido && !isAguardandoConexao && !confirmadoPeloProvedor && !!(msg?.em_retry);
  const isPending =
    !isRetry &&
    !confirmadoPeloProvedor &&
    (isAguardandoConexao ||
      isIndefinido ||
      s === "pending" ||
      s === "enviando" ||
      s === "sending");
  let isRead =
    s === "lida" || s === "read" || s === "seen" ||
    s === "visualizada" || s === "played" ||
    hasReadAt ||
    hasReadKeyword;
  if (isGroup) isRead = false;
  const isDelivered =
    isRead ||
    s === "entregue" || s === "delivered" || s === "received" ||
    hasDeliveredAt ||
    hasDeliveredKeyword;
  const isSent = !isErr && !isPending && !isDelivered && !isRead &&
    (!s || s === "sent" || s === "enviada" || s === "enviado" || confirmadoPeloProvedor);

  const title = isAguardandoConexao
    ? "Aguardando conexão"
    : isRetry
      ? "Aguardando reenvio automático"
      : isIndefinido
        ? "Verificando se a mensagem foi enviada…"
        : isDemorado
          ? "Envio demorado — ainda verificando…"
          : undefined;

  const kind = isErr
    ? "err"
    : (isPending || isRetry)
      ? "pending"
      : isRead
        ? "read"
        : isDelivered
          ? "delivered"
          : isSent
            ? "sent"
            : "sent";

  return estado({ kind, title, isErr, isPending, isRetry, isDelivered, isRead, isDemorado });
}

function estado({
  kind,
  title,
  isErr = false,
  isPending = false,
  isRetry = false,
  isDelivered = false,
  isRead = false,
  isDemorado = false,
}) {
  return { kind, title, isErr, isPending, isRetry, isDelivered, isRead, isDemorado };
}

/**
 * Campos que `resolveTickState` lê. Os comparadores da lista usam isto para saber quando a
 * linha tem de repintar: comparar só `status_mensagem` deixava o card parado quando o que
 * mudava era `status`, `lida_em` ou `entregue_em` — e a lista discordava da thread até ao F5.
 */
export function tickSignature(msg) {
  if (!msg) return "";
  return [
    safeString(msg.status_mensagem).toLowerCase(),
    safeString(msg.status).toLowerCase(),
    safeString(msg.situacao).toLowerCase(),
    safeString(msg.lida_em ?? msg.lidaEm ?? msg.read_at ?? msg.readAt),
    safeString(msg.entregue_em ?? msg.entregueEm ?? msg.delivered_at ?? msg.deliveredAt),
    safeString(msg.whatsapp_id),
    msg.em_retry ? "1" : "",
    msg.envio_incerto ? "1" : "",
    msg.envio_demorado ? "1" : "",
    msg.aguardando_conexao ? "1" : "",
  ].join("|");
}
