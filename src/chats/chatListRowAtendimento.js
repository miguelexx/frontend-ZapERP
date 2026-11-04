import {
  isGroupConversation,
  getStatusAtendimentoEffective,
  isAguardandoClienteManual,
  isCobrancaFinanceiraStatus,
  isModoSimplesAguardandoAtendente,
  isModoSimplesAguardandoCliente,
  resolveModoSimplesAguardandoEffective,
  exibirBadgePagamentoConcluido,
} from "../utils/conversaUtils";
import { parseToDate } from "../utils/parseToDate.js";
import { getContactDisplay } from "./chatListDisplay";
import { useWhatsappLabelsStore } from "./whatsappLabelsStore";
import { useWhatsappInstancesStore } from "./whatsappInstancesStore";
import { isAutoTagAguardandoCliente } from "../atendimento/aguardarClientePrazo";

/** Timestamp em ms alinhado ao horário exibido no card (ISO sem TZ = UTC, como no Supabase). */
function toChatListTimestampMs(raw) {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const d = parseToDate(raw);
  if (!d) return 0;
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Preferências por item (API pode enviar `silenciada` ou `silenciado`). */
export function rowPrefs(c) {
  return {
    silenciado: !!(c?.silenciado ?? c?.silenciada),
    fixada: !!c?.fixada,
    favorita: !!c?.favorita,
  };
}

export const EMPTY_PENDENTES_SET = new Set();

function cleanAssigneeName(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.replace(/\s+/g, " ");
}

function getAssigneeId(item) {
  return item?.usuario_id ?? item?.user_id ?? item?.atendente_id ?? item?.id ?? null;
}

function getAssigneeNameFromItem(item, currentUserId, currentUserName) {
  const id = getAssigneeId(item);
  const currentName =
    currentUserId != null &&
    id != null &&
    String(id) === String(currentUserId)
      ? cleanAssigneeName(currentUserName)
      : "";

  return (
    cleanAssigneeName(
      item?.nome ??
        item?.name ??
        item?.usuario_nome ??
        item?.user_nome ??
        item?.atendente_nome ??
        item?.responsavel_nome ??
        item?.email
    ) ||
    currentName
  );
}

function collectAssigneeItems(c) {
  const sources = [
    c?.atendentes,
    c?.usuarios_atendimento,
    c?.atendimento_usuarios,
    c?.responsaveis,
    c?.usuarios,
  ];
  return sources.find((items) => Array.isArray(items) && items.length > 0) || [];
}

export function getAtendimentoAssigneeNames(c, currentUserId = null, currentUserName = "") {
  if (!c || isGroupConversation(c)) return [];

  const byKey = new Map();
  const pushName = (name, id = null) => {
    const clean = cleanAssigneeName(name);
    if (!clean) return;
    const key = id != null ? `id:${String(id)}` : `name:${clean.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, clean);
  };

  for (const item of collectAssigneeItems(c)) {
    if (!item || typeof item !== "object") continue;
    pushName(getAssigneeNameFromItem(item, currentUserId, currentUserName), getAssigneeId(item));
  }

  const atendenteId = c?.atendente_id ?? c?.responsavel_id ?? null;
  const atendenteNome =
    cleanAssigneeName(
      c?.atendente_nome ??
        c?.atendente?.nome ??
        c?.atendente?.name ??
        c?.responsavel_nome ??
        c?.responsavel?.nome ??
        c?.responsavel?.name
    ) ||
    (currentUserId != null && atendenteId != null && String(atendenteId) === String(currentUserId)
      ? cleanAssigneeName(currentUserName)
      : "");

  pushName(atendenteNome, atendenteId);

  return Array.from(byKey.values()).slice(0, 3);
}

export function getLastMessage(chat) {
  const msgs = chat?.mensagens || chat?.messages || [];
  if (!Array.isArray(msgs) || msgs.length === 0) return null;
  return msgs[msgs.length - 1];
}

function normalizeDirection(v) {
  const d = String(v || "").toLowerCase().trim();
  if (!d) return "";
  if (d === "inbound" || d === "recebida" || d === "entrada") return "in";
  if (d === "outbound" || d === "enviada" || d === "saida") return "out";
  return d;
}

function directionCandidateTs(iso) {
  return toChatListTimestampMs(iso);
}

/** Última direção pela mensagem mais recente (preview, ultima_mensagem, mensagens[0], fallback). */
export function getLastDirection(chat) {
  const candidates = [];
  const push = (dir, criadoEm) => {
    const d = normalizeDirection(dir);
    if (!d) return;
    candidates.push({ dir: d, ts: directionCandidateTs(criadoEm) });
  };

  const preview = chat?.ultima_mensagem_preview;
  const ultima = chat?.ultima_mensagem;
  const m0 = chat?.mensagens?.[0] ?? chat?.messages?.[0];
  const last = getLastMessage(chat);

  push(preview?.direcao, preview?.criado_em);
  push(ultima?.direcao, ultima?.criado_em);
  push(m0?.direcao, m0?.criado_em);
  push(last?.direcao, last?.criado_em);

  if (!candidates.length) return "";

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].ts >= best.ts) best = candidates[i];
  }
  return best.dir;
}

function messageTs(msg) {
  if (!msg) return 0;
  return toChatListTimestampMs(msg.criado_em);
}

/** Escolhe a mensagem com `criado_em` mais recente entre candidatos. */
export function pickListaUltimaMensagem(c) {
  if (!c) return null;
  const candidates = [
    c?.ultima_mensagem,
    c?.ultima_mensagem_preview,
    c?.mensagens?.[0],
    c?.messages?.[0],
    getLastMessage(c),
  ].filter(Boolean);
  // `ultima_mensagem`/preview são as fontes atualizadas pelo socket. Em empate de
  // criado_em, preserve a primeira em vez de deixar o array legado de `mensagens`
  // sobrescrever o ACK novo com um status antigo.
  let best = null;
  for (const candidate of candidates) {
    if (!best || messageTs(candidate) > messageTs(best)) best = candidate;
  }
  return best;
}

/** Entre várias mensagens, retorna a de timestamp mais recente. */
export function pickNewerMessage(...msgs) {
  let best = null;
  for (const m of msgs) {
    if (!m) continue;
    if (!best || messageTs(m) >= messageTs(best)) best = m;
  }
  return best;
}

/** Timestamp da última mensagem visível na lista — sempre o mais recente entre fontes. */
export function getListaUltimaMensagemCriadoEm(c) {
  const last = pickListaUltimaMensagem(c);
  const iso = last?.criado_em;
  return iso != null && String(iso).trim() !== "" ? String(iso).trim() : null;
}

/** Timestamp efetivo para ordenação estilo WhatsApp (mais recente no topo). */
export function getChatListSortTimestampMs(c) {
  if (!c) return 0;
  // Prioriza o tempo da ÚLTIMA MENSAGEM real (estilo WhatsApp). `ultima_atividade` pode ser
  // inflado por eventos sem mensagem visível (placeholder de mídia, sync de histórico/contatos),
  // o que embaralharia a ordem — por isso entra só como fallback quando não há mensagem.
  // Usa o mesmo parseToDate da hora do card: ISO sem timezone = UTC (evita inverter 20:29 vs 20:46).
  const msgMs = Math.max(
    toChatListTimestampMs(pickListaUltimaMensagem(c)?.criado_em),
    toChatListTimestampMs(c?.ultima_mensagem?.criado_em),
    toChatListTimestampMs(c?.ultima_mensagem_preview?.criado_em)
  );
  if (msgMs > 0) return msgMs;
  return Math.max(toChatListTimestampMs(c?.ultima_atividade), toChatListTimestampMs(c?.criado_em));
}

const LISTA_STATUS_MEMBERSHIP_KEYS = [
  "status_atendimento",
  "status_atendimento_real",
  "aguardando_cliente_desde",
  "exibir_badge_aberta",
  "pagamento_prazo_ate",
  "pagamento_prazo_origem",
  "pagamento_concluido_em",
  "finalizacao_motivo",
  "finalizada_automaticamente",
  "ui_status_optimistic_at",
  "modo_simples_aguardando",
  "atendimento_modo_simples",
  "atendente_id",
  "atendente_nome",
  "departamento_id",
];

/** Mescla campos de preview/atividade preservando sempre o timestamp mais recente (socket > API stale). */
export function mergeChatRowListaAtividade(apiRow, localRow) {
  const base = { ...(localRow && typeof localRow === "object" ? localRow : {}), ...(apiRow && typeof apiRow === "object" ? apiRow : {}) };
  const ultima = pickNewerMessage(
    localRow?.ultima_mensagem,
    apiRow?.ultima_mensagem,
    localRow?.ultima_mensagem_preview,
    apiRow?.ultima_mensagem_preview
  );
  const tsMs = Math.max(getChatListSortTimestampMs(apiRow), getChatListSortTimestampMs(localRow));
  const ultimaAtividade =
    tsMs > 0
      ? new Date(tsMs).toISOString()
      : base.ultima_atividade ?? localRow?.ultima_atividade ?? apiRow?.ultima_atividade ?? null;
  if (ultima) {
    base.ultima_mensagem = ultima;
    base.ultima_mensagem_preview = ultima;
  }
  if (ultimaAtividade) base.ultima_atividade = ultimaAtividade;
  const localStatusMs = Number(localRow?.ui_status_optimistic_at || 0);
  const apiStatusMs = Number(apiRow?.ui_status_optimistic_at || 0);
  if (localRow && localStatusMs > apiStatusMs) {
    for (const key of LISTA_STATUS_MEMBERSHIP_KEYS) {
      if (localRow[key] !== undefined) base[key] = localRow[key];
    }
  }
  return base;
}

/** GET / socket não podem desfazer encerrar/assumir otimista mais recente. */
export function applyNewerOptimisticMembershipTo(target, apiRow, localRow) {
  if (!target || !localRow) return target;
  const localStatusMs = Number(localRow.ui_status_optimistic_at || 0);
  const apiStatusMs = Number(apiRow?.ui_status_optimistic_at || 0);
  if (localStatusMs <= apiStatusMs) return target;
  for (const key of LISTA_STATUS_MEMBERSHIP_KEYS) {
    if (localRow[key] !== undefined) target[key] = localRow[key];
  }
  return target;
}

export function preserveNewerOptimisticMembership(apiRow, localRow) {
  if (!apiRow) return apiRow;
  const next = { ...apiRow };
  return applyNewerOptimisticMembershipTo(next, apiRow, localRow);
}

/**
 * Desempate determinístico quando duas conversas têm o MESMO timestamp de atividade.
 * Espelha o `id DESC` do backend. Sem isso, o `sort` (estável) mantinha a ordem do array de
 * entrada — que difere entre a lista ao vivo (store) e o GET de reconciliação — fazendo duas
 * conversas recentes "trocarem" de lugar a cada atualização. Com o desempate, a ordem é a
 * mesma dos dois lados: some o pisca-pisca.
 */
export function compareChatRowIdDesc(a, b) {
  const na = Number(a?.id);
  const nb = Number(b?.id);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
  const sa = String(a?.id ?? "");
  const sb = String(b?.id ?? "");
  if (sa === sb) return 0;
  return sa < sb ? 1 : -1;
}

/** Ordena conversas por atividade mais recente (DESC), com desempate estável por id. */
export function sortChatListByRecent(arr) {
  if (!Array.isArray(arr) || arr.length <= 1) return arr;
  // Decorate-sort-undecorate: getChatListSortTimestampMs faz vários parses de data;
  // dentro do comparador ele rodaria O(n·log n) vezes — aqui roda 1× por linha.
  const decorated = arr.map((c) => ({ c, ts: getChatListSortTimestampMs(c) }));
  decorated.sort((a, b) => {
    const d = b.ts - a.ts;
    if (d !== 0) return d;
    // Sem atividade confiável, preserve a ordem da API/estado. Usar o ID
    // como desempate fazia rajadas de resync inverterem visualmente a lista.
    if (a.ts === 0 && b.ts === 0) return 0;
    return compareChatRowIdDesc(a.c, b.c);
  });
  return decorated.map((d) => d.c);
}

/**
 * Ordena RESULTADOS DE BUSCA por relevância (estilo WhatsApp):
 *   1) fixadas primeiro;
 *   2) match em nome/telefone (busca_rank=0) antes de match só no texto (busca_rank=1);
 *   3) recência dentro de cada faixa.
 * O `busca_rank` vem do backend; na ausência dele, cai para recência pura.
 */
export function sortChatRowsBySearchRelevance(arr) {
  if (!Array.isArray(arr) || arr.length <= 1) return arr;
  const rank = (c) => (Number.isFinite(Number(c?.busca_rank)) ? Number(c.busca_rank) : 0);
  return [...arr].sort((a, b) => {
    const ap = a?.fixada === true ? 1 : 0;
    const bp = b?.fixada === true ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const ar = rank(a);
    const br = rank(b);
    if (ar !== br) return ar - br;
    const d = getChatListSortTimestampMs(b) - getChatListSortTimestampMs(a);
    // Empate de recência dentro da mesma faixa → desempate estável por id (sem "troca").
    return d !== 0 ? d : compareChatRowIdDesc(a, b);
  });
}

export function isConversaAguardandoCliente(c, user) {
  if (!c) return false;
  if (isModoSimplesAguardandoCliente(c, user)) return true;
  if (c?.atendente_id == null) return false;
  if (isAguardandoClienteManual(c)) return true;
  return (
    getStatusAtendimentoEffective(c) === "em_atendimento" &&
    c?.aguardando_cliente_desde != null
  );
}

export function isConversaEmAtendimentoBadge(c) {
  if (!c || c?.atendente_id == null) return false;
  const s = getStatusAtendimentoEffective(c);
  return s === "em_atendimento" || s === "aguardando_cliente";
}

export function isConversaPagamentoPendente(c) {
  if (!c || c?.atendente_id == null) return false;
  return getStatusAtendimentoEffective(c) === "pagamento_pendente";
}

export function isConversaEmAtrasoPagamento(c) {
  if (!c || c?.atendente_id == null) return false;
  return getStatusAtendimentoEffective(c) === "em_atraso";
}

/**
 * Cliente foi o último a falar (ou há novas mensagens) e a equipe deve responder.
 */
function cobrancaFinanceiraPorUltimaMensagem(c) {
  const st = getStatusAtendimentoEffective(c);
  if (st !== "pagamento_pendente" && st !== "em_atraso") return null;
  if (c?.atendente_id == null) return null;
  const lastDir = getLastDirection(c);
  const unread = Number(c?.unread_count ?? c?.unread ?? 0);
  const hintNovaMsg =
    !lastDir && (Boolean(c?.tem_novas_mensagens_em_atendimento) || unread > 0);
  if (lastDir === "in" || hintNovaMsg) return "funcionario";
  if (lastDir === "out") return "cliente";
  return null;
}

/** Cobrança: última mensagem foi da equipe → etiqueta Aguardando cliente. */
export function isConversaAguardandoClienteEmCobranca(c) {
  return cobrancaFinanceiraPorUltimaMensagem(c) === "cliente";
}

export function isConversaAguardandoFuncionario(c, pendentesIdSet, user) {
  if (!c || isGroupConversation(c)) return false;
  if (isModoSimplesAguardandoAtendente(c, user)) return true;
  if (c?.id != null && pendentesIdSet?.has?.(String(c.id))) return true;
  if (c?.atendente_id == null) return false;

  const cobranca = cobrancaFinanceiraPorUltimaMensagem(c);
  if (cobranca === "funcionario") return true;
  if (cobranca === "cliente") return false;

  if (getStatusAtendimentoEffective(c) !== "em_atendimento") return false;
  if (isConversaAguardandoCliente(c)) return false;
  const lastDir = getLastDirection(c);
  const unread = Number(c?.unread_count ?? c?.unread ?? 0);
  const hintNovaMsg =
    !lastDir && (Boolean(c?.tem_novas_mensagens_em_atendimento) || unread > 0);
  return lastDir === "in" || hintNovaMsg;
}

export function atendimentoRowVisualClass(c, pendentesIdSet, semConversaRow, currentUserId, user) {
  if (!c || semConversaRow || isGroupConversation(c)) return "";
  // Modo simples: só a tag “Aguardando atendente/cliente”, sem card âmbar destacado.
  if (c?.atendimento_modo_simples === true || user?.atendimento_modo_simples === true) {
    return "";
  }
  const isResponsavel =
    currentUserId != null &&
    c?.atendente_id != null &&
    String(c.atendente_id) === String(currentUserId);
  const stAt = getStatusAtendimentoEffective(c);
  const isHumanAtendimentoRow =
    stAt === "em_atendimento" ||
    stAt === "aguardando_cliente" ||
    isCobrancaFinanceiraStatus(c);
  const lastDir = getLastDirection(c);
  const unread = Number(c?.unread_count ?? c?.unread ?? 0);
  const hintNovaMsg =
    !lastDir &&
    (Boolean(c?.tem_novas_mensagens_em_atendimento) || unread > 0);
  const showAtendimentoDot =
    isResponsavel &&
    isHumanAtendimentoRow &&
    (lastDir === "in" || hintNovaMsg);

  if (isConversaAguardandoFuncionario(c, pendentesIdSet) || showAtendimentoDot) {
    return "chat-list-row--atendimento-alerta";
  }
  if (isConversaEmAtendimentoBadge(c)) return "chat-list-row--atendimento-calm";
  return "";
}

export function isEmAtendimentoUltimaDoCliente(c) {
  if (!c || isGroupConversation(c)) return false;
  if (c?.atendente_id == null) return false;
  if (cobrancaFinanceiraPorUltimaMensagem(c) === "funcionario") return true;
  if (getStatusAtendimentoEffective(c) !== "em_atendimento") return false;
  if (isConversaAguardandoCliente(c)) return false;
  const lastDir = getLastDirection(c);
  const unread = Number(c?.unread_count ?? c?.unread ?? 0);
  const hintNovaMsg =
    !lastDir &&
    (Boolean(c?.tem_novas_mensagens_em_atendimento) || unread > 0);
  return lastDir === "in" || hintNovaMsg;
}

export function getEsperaMinutosAnchorIso(c, pendentesIdSet, user) {
  if (!c || isGroupConversation(c)) return "";
  const modoSimplesUi =
    c?.atendimento_modo_simples === true || user?.atendimento_modo_simples === true;
  if (modoSimplesUi && resolveModoSimplesAguardandoEffective(c, user) === "atendente") {
    const lastMsgTs = getListaUltimaMensagemCriadoEm(c);
    const ultimaAtiv = c?.ultima_atividade != null ? String(c.ultima_atividade).trim() : "";
    return lastMsgTs || ultimaAtiv || "";
  }
  if (c?.atendente_id == null) return "";
  const st = getStatusAtendimentoEffective(c);
  const cobrancaStaff = st === "pagamento_pendente" || st === "em_atraso";
  if (!cobrancaStaff && st !== "em_atendimento") return "";
  if (!cobrancaStaff && isConversaAguardandoCliente(c)) return "";
  if (!isConversaAguardandoFuncionario(c, pendentesIdSet)) return "";

  const lastDir = getLastDirection(c);
  const previewDir = normalizeDirection(c?.ultima_mensagem_preview?.direcao);
  const lastMsgTs = getListaUltimaMensagemCriadoEm(c);
  const ultimaAtiv = c?.ultima_atividade != null ? String(c.ultima_atividade).trim() : "";
  const pendenteSupervisor = c?.id != null && pendentesIdSet?.has?.(String(c.id));

  let anchorIso = "";
  if ((lastDir === "in" || previewDir === "in") && lastMsgTs) anchorIso = lastMsgTs;
  else if (pendenteSupervisor && ultimaAtiv) anchorIso = ultimaAtiv;
  else anchorIso = ultimaAtiv || lastMsgTs || "";

  return anchorIso ? String(anchorIso).trim() : "";
}

export function esperaMinutosAnchorKey(c, pendentesIdSet) {
  return getEsperaMinutosAnchorIso(c, pendentesIdSet);
}

/**
 * Espaço vertical entre linhas da lista (espelha --cl-chat-row-gap).
 * Zero desde que a lista deixou de ser feita de cartões — ver chatList.flat.css.
 * Entra como `gap` do virtualizador, fora de `estimateChatListRowSize`.
 */
export const CHAT_LIST_ROW_GAP = 0;

/**
 * Métricas da linha da lista — espelho EXATO de `chats/chatList.flat.css`, que por sua
 * vez espelha os tokens `--zs-m-*` de `styles/zap-simples.css`. São três sítios que têm
 * de andar juntos: a lista é virtualizada por estimativa (sem `measureElement`), logo o
 * que passar daqui é recortado no ecrã.
 *
 * O arranjo medido é:
 *     nome [+ sublinhas]   |  hora
 *     prévia               |  selo
 *     (faixa de etiquetas do WhatsApp)
 *     (faixa de tags)
 */
const ROW_METRICS = {
  avatar: 48,
  /** padding vertical da linha: 8 em cima + 8 em baixo */
  padY: 24,
  title: 20,
  subline: 15,
  /** a pílula do atendente responsável leva avatar: 2 de margem + 18 */
  sublineAdmin: 20,
  time: 16,
  preview: 18,
  /** margin-top de `.chat-list-row-mid` / `.chat-list-statusRow` */
  gap: 2,
  /** faixa de etiquetas ou de tags: 4 de margem + 20 de conteúdo */
  extraRow: 24,
  /** selo simples */
  badge: 20,
  /** selo com segunda linha (cobrança, reaberta por falta, pagamento concluído) */
  badgeStack: 44,
  minRow: 64,
  /** folga para arredondamento de fonte entre sistemas */
  margem: 4,
};

/** Selos que desenham uma segunda linha dentro de `.chat-list-statusRow`. */
function seloTemSegundaLinha(chat) {
  if (isCobrancaFinanceiraStatus(chat)) return true;
  if (exibirBadgePagamentoConcluido(chat)) return true;
  if (chat?.reaberta_por_falta_interacao === true) return true;
  if (chat?.reaberta_falta_interacao_em) return true;
  // Nota "Reaberto pelo cliente" — some sozinha ao fim de 2 minutos.
  if (
    typeof chat?.ui_hint_reaberto_ausencia_cliente === "number" &&
    Date.now() - chat.ui_hint_reaberto_ausencia_cliente < 120000
  ) {
    return true;
  }
  return false;
}

/**
 * Altura reservada para uma linha da lista. Tem de ser >= à altura real; sobrar só
 * acrescenta ar, faltar recorta texto.
 *
 * @param {boolean} modoSimples  Esconde sublinhas e faixas de etiquetas (chatList.whatsapp.css).
 */
export function estimateChatListRowSize(
  chat,
  isMobileLayout,
  pendentesIdSet = null,
  showAssigneeNames = false,
  showAdminAtendente = false,
  modoSimples = false
) {
  const m = ROW_METRICS;
  if (!chat) return m.minRow + m.margem;

  const { isGroup } = getContactDisplay(chat);

  // ---- 1ª faixa: nome (+ sublinhas) à esquerda, hora à direita ----
  let blocoNome = m.title;
  if (!modoSimples && !isGroup) {
    if (String(chat?.encontrado_por || "").trim()) blocoNome += m.subline;

    const temSetor =
      chat?.departamento_id != null &&
      Boolean(String(chat.setor ?? chat?.departamento?.nome ?? chat?.departamentos?.nome ?? "").trim());
    if (temSetor) blocoNome += m.subline;

    const nomesAtendimento =
      showAssigneeNames || showAdminAtendente ? getAtendimentoAssigneeNames(chat) : [];
    const temAdminAtendente =
      showAdminAtendente && nomesAtendimento.length > 0 && isConversaEmAtendimentoBadge(chat);
    if (temAdminAtendente) blocoNome += m.sublineAdmin;
    else if (showAssigneeNames && nomesAtendimento.length > 0) blocoNome += m.subline;

    // Número do WhatsApp: só aparece quando a empresa tem mais de uma instância.
    if (
      useWhatsappInstancesStore.getState().hasMultiple &&
      String(
        chat?.whatsapp_instance_nome ||
          chat?.whatsappInstanceNome ||
          chat?.whatsapp_instance_display_phone ||
          chat?.whatsappInstanceDisplayPhone ||
          ""
      ).trim()
    ) {
      blocoNome += m.subline;
    }

    if (String(chat?.cliente?.empresa ?? chat?.cliente_empresa ?? chat?.empresa ?? "").trim()) {
      blocoNome += m.subline;
    }
  }
  const faixaNome = Math.max(blocoNome, m.time);

  /*
   * 2ª faixa: prévia à esquerda, selo à direita.
   * No modo simples o `StatusPill` sai mais cedo e desenha no máximo UMA pílula
   * ("Aguardando atendente/cliente"), nunca as pilhas de cobrança ou de reabertura —
   * por isso lá o selo é sempre de uma linha, e a lista fica toda à mesma altura.
   */
  const selo = !modoSimples && seloTemSegundaLinha(chat) ? m.badgeStack : m.badge;
  const faixaPrevia = Math.max(m.preview, selo);

  // ---- faixas extra, de largura inteira ----
  let extras = 0;
  if (!modoSimples && !isGroup) {
    if (chat?.id != null) {
      const etiquetas = useWhatsappLabelsStore.getState().byConversa?.[String(chat.id)];
      if (Array.isArray(etiquetas) && etiquetas.length > 0) extras += m.extraRow;
    }
    if (Array.isArray(chat?.tags) && chat.tags.some((t) => t && !isAutoTagAguardandoCliente(t))) {
      extras += m.extraRow;
    }
  }

  const conteudo = faixaNome + m.gap + faixaPrevia + extras;
  const altura = Math.max(m.avatar, conteudo) + m.padY;
  return Math.ceil(Math.max(altura, m.minRow)) + m.margem;
}
