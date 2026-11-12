import { useChatStore } from "../../chats/chatsStore";
import { scheduleAfterInitialPaint } from "../../chats/scheduleAfterInitialPaint";
import { abrirConversaCliente, fetchGruposEncaminhar } from "../../chats/chatService";
import { isGroupConversation } from "../../utils/conversaUtils";
import {
  getForwardColaboradoresCache,
  loadForwardColaboradoresOnce,
  setForwardColaboradoresCache,
} from "../forwardDestinationsCache";
import { forwardAtendimentoMessageToColaborador } from "../../api/internalChatService";
import {
  enviarMensagem,
  encaminharArquivo,
  encaminharMensagemViaAPI,
  assumirChat,
  reabrirChat,
} from "../conversaService";
import { FORWARD_DEST_MAX } from "../conversaConstants";
import { safeString, formatForwardHttpError, getMediaUrl } from "../utils/conversaViewHelpers";
import { classifyOutboundAxiosError } from "../outboundSendError";
import * as cfg from "../../api/configService";
import { useConversaStore } from "../conversaStore";
import {
  pushOptimisticForwardToDest,
  reconcileForwardOptimisticTemps,
} from "../conversaOptimisticMessage";

/**
 * Corpo do fluxo de encaminhamento (fora do chunk crítico — ver lazyHookImpl.js).
 *
 * Estado, refs e abrir/fechar vivem na casca (`useForwardFlow.js`). Aqui ficam:
 * - as listas derivadas (memos da casca chamam `compute*`);
 * - os efeitos de busca de destinos (colaboradores/contatos/grupos) — devolvem o cleanup;
 * - o envio em si, com a bolha otimista no destino e o job em segundo plano.
 *
 * `ctx` é o snapshot da casca no momento do clique: estado + setters + refs + props.
 */

const FORWARD_GRUPOS_FETCH_LIMIT = 400;

function grupoMatchesForwardQuery(grupo, queryLower) {
  if (!queryLower) return true;
  const n = safeString(
    grupo?.nome_grupo || grupo?.contato_nome || grupo?.nome_contato_cache || grupo?.nome || grupo?.telefone
  ).toLowerCase();
  const tel = safeString(grupo?.telefone).toLowerCase();
  return n.includes(queryLower) || tel.includes(queryLower);
}

function isForwardGroupDestination(meta) {
  if (!meta) return false;
  const tipo = safeString(meta?.tipo).toLowerCase();
  const telefone = safeString(meta?.telefone ?? meta?.remoteJid ?? meta?.chat_id);
  return tipo === "grupo" || telefone.includes("@g.us");
}

function getForwardDestinationAssigneeId(meta) {
  if (!meta) return null;
  return meta?.atendente_id ?? meta?.atendenteId ?? meta?.responsavel_id ?? meta?.responsavelId ?? null;
}

function shouldAssumeForwardDestination(meta, user) {
  if (isForwardGroupDestination(meta)) return false;
  if (["fechada", "encerrada", "finalizada", "finalizado"].includes(safeString(meta?.status_atendimento).toLowerCase().trim())) return true;
  const assigneeId = getForwardDestinationAssigneeId(meta);
  if (assigneeId != null && user?.id != null && String(assigneeId) === String(user.id)) return false;
  return true;
}

function buildForwardText(m) {
  if (!m) return "";
  const t = safeString(m?.texto);
  if (t) return `[Encaminhado]\n${t}`;
  const url = getForwardMediaUrl(m);
  const nome = safeString(m?.nome_arquivo);
  if (url) return `[Encaminhado]\n${nome ? `${nome}\n` : ""}${url}`;
  return "[Encaminhado]\n(mídia)";
}

const FORWARD_MEDIA_TYPES = new Set([
  "arquivo",
  "audio",
  "document",
  "documento",
  "file",
  "foto",
  "image",
  "imagem",
  "pdf",
  "photo",
  "ptt",
  "sticker",
  "video",
  "voice",
]);

function normalizeForwardMessageType(tipo) {
  return String(tipo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function isForwardMediaMessage(msg) {
  return FORWARD_MEDIA_TYPES.has(normalizeForwardMessageType(msg?.tipo));
}

function getForwardMediaUrl(msg) {
  if (!msg || typeof msg !== "object") return "";
  return (
    getMediaUrl(msg?.url, msg?.url_absoluta) ||
    getMediaUrl(msg?.media_url ?? msg?.mediaUrl, null) ||
    getMediaUrl(msg?.file_url ?? msg?.fileUrl, null) ||
    getMediaUrl(msg?.download_url ?? msg?.downloadUrl, null)
  );
}

/* ----------------------------- listas derivadas ----------------------------- */

export function computeForwardCandidates(forwardChatSnap, forwardQuery, conversaId) {
  const list = Array.isArray(forwardChatSnap) ? forwardChatSnap : [];
  const q = safeString(forwardQuery).toLowerCase();
  const byName = (c) => {
    if (!q) return true;
    const n = safeString(
      c?.nome_grupo ||
      c?.contato_nome ||
      c?.nome_contato_cache ||
      c?.cliente_nome ||
      c?.nome ||
      c?.cliente?.nome ||
      c?.telefone
    );
    const at = safeString(c?.atendente_nome ?? c?.atendenteNome);
    const atMail = safeString(c?.atendente_email ?? c?.atendenteEmail);
    const tel = safeString(c?.telefone);
    const telEx = safeString(c?.telefone_exibivel ?? c?.telefoneExibivel);
    const hay = `${n} ${at} ${atMail} ${tel} ${telEx}`.toLowerCase();
    return hay.includes(q);
  };
  return list
    .filter((c) => c?.id != null && String(c.id) !== String(conversaId))
    .filter(byName)
    .slice(0, 80);
}

// Grupos já carregados no store (aparecem mesmo sem busca).
export function computeForwardGruposStore(forwardChatSnap, forwardQuery, conversaId) {
  const list = Array.isArray(forwardChatSnap) ? forwardChatSnap : [];
  const q = safeString(forwardQuery).toLowerCase();
  return list
    .filter((c) => c?.id != null && String(c.id) !== String(conversaId))
    .filter((c) => isGroupConversation(c))
    .filter((c) => {
      if (!q) return true;
      const n = safeString(c?.nome_grupo || c?.contato_nome || c?.nome_contato_cache || c?.nome || c?.telefone).toLowerCase();
      return n.includes(q);
    });
}

// Lista final de grupos: os do store + os carregados para encaminhar (dedup por id).
export function computeForwardGrupos(forwardGruposStore, forwardGruposFetched, forwardQuery, conversaId) {
  const q = safeString(forwardQuery).toLowerCase();
  const map = new Map();
  const accept = (g) =>
    g?.id != null &&
    String(g.id) !== String(conversaId) &&
    grupoMatchesForwardQuery(g, q);
  for (const g of forwardGruposStore) {
    if (accept(g)) map.set(String(g.id), g);
  }
  for (const g of Array.isArray(forwardGruposFetched) ? forwardGruposFetched : []) {
    if (accept(g) && !map.has(String(g.id))) map.set(String(g.id), g);
  }
  return Array.from(map.values()).slice(0, 200);
}

export function computeForwardColaboradoresFiltered(forwardColaboradores, forwardQuery, userId) {
  const list = Array.isArray(forwardColaboradores) ? forwardColaboradores : [];
  const me = userId != null ? String(userId) : null;
  const semEu = me
    ? list.filter((colab) => {
        const uid = colab?.id ?? colab?.user_id ?? colab?.usuario_id;
        return uid == null || String(uid) !== me;
      })
    : list;
  const q = safeString(forwardQuery).toLowerCase();
  if (!q) return semEu.slice(0, 80);
  return semEu
    .filter((colab) => {
      const n = safeString(colab?.nome ?? colab?.name ?? colab?.full_name).toLowerCase();
      const em = safeString(colab?.email).toLowerCase();
      return n.includes(q) || em.includes(q);
    })
    .slice(0, 80);
}

/* ------------------------------ efeitos (modal aberto) ------------------------------ */

/**
 * Encaminhar: GET /chats com colaboradores + busca de clientes (contatos).
 * Roda com o modal ABERTO; a casca cuida do ramo "fechado". Devolve o cleanup.
 */
export function runForwardDestinationsEffect({
  forwardQuery,
  clienteId,
  forwardAllContatosRef,
  setForwardClientes,
  setForwardClientesLoading,
  setForwardColaboradores,
  setForwardColaboradoresLoading,
}) {
  let cancelled = false;
  const cachedCols = getForwardColaboradoresCache();
  if (cachedCols != null) {
    setForwardColaboradores(cachedCols);
    setForwardColaboradoresLoading(false);
  } else {
    setForwardColaboradoresLoading(true);
  }

  const cancelColabSchedule = scheduleAfterInitialPaint(() => {
    if (cancelled) return;
    loadForwardColaboradoresOnce(async () => {
      const usuarios = await cfg.getUsuarios();
      const cols = (Array.isArray(usuarios) ? usuarios : [])
        .filter((u) => u?.ativo !== false)
        .map((u) => ({
          usuario_id: Number(u.id ?? u.usuario_id ?? u.user_id),
          id: Number(u.id ?? u.usuario_id ?? u.user_id),
          nome: u.nome ?? u.name ?? null,
          email: u.email ?? null,
          perfil: u.perfil ?? u.role ?? null,
        }))
        .filter((u) => Number.isFinite(u.usuario_id) && u.usuario_id > 0);
      setForwardColaboradoresCache(cols);
      return cols;
    })
      .then((cols) => {
        if (cancelled) return;
        setForwardColaboradores(cols);
      })
      .catch(() => {
        if (!cancelled) setForwardColaboradores([]);
      })
      .finally(() => {
        if (!cancelled) setForwardColaboradoresLoading(false);
      });
  }, 0);

  const curClienteId = clienteId != null ? String(clienteId) : null;
  const excludeCurrent = (arr) =>
    curClienteId ? arr.filter((c) => String(c.id) !== curClienteId) : arr;

  const q = safeString(forwardQuery).trim();
  let clientesTimer = null;
  if (q.length < 2) {
    // Sem busca: mostra TODOS os contatos (carregados uma vez e cacheados).
    const cached = forwardAllContatosRef.current;
    if (Array.isArray(cached)) {
      setForwardClientes(excludeCurrent(cached));
      setForwardClientesLoading(false);
    } else {
      setForwardClientesLoading(true);
      clientesTimer = setTimeout(async () => {
        if (cancelled) return;
        try {
          const list = await cfg.getClientes({ limit: 500 });
          if (cancelled) return;
          const arr = Array.isArray(list) ? list : [];
          forwardAllContatosRef.current = arr;
          setForwardClientes(excludeCurrent(arr));
        } catch (_) {
          if (!cancelled) setForwardClientes([]);
        } finally {
          if (!cancelled) setForwardClientesLoading(false);
        }
      }, 0);
    }
  } else {
    setForwardClientesLoading(true);
    clientesTimer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const list = await cfg.getClientes({ palavra: q, limit: 60 });
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setForwardClientes(excludeCurrent(arr));
      } catch (_) {
        if (!cancelled) setForwardClientes([]);
      } finally {
        if (!cancelled) setForwardClientesLoading(false);
      }
    }, 260);
  }

  return () => {
    cancelled = true;
    cancelColabSchedule();
    if (clientesTimer) clearTimeout(clientesTimer);
  };
}

/**
 * Grupos para encaminhar: carga própria, sem depender da aba atual da lista.
 * Roda com o modal ABERTO; a casca cuida do ramo "fechado". Devolve o cleanup.
 */
export function runForwardGruposEffect({
  forwardQuery,
  conversaId,
  forwardAllGruposRef,
  forwardGruposByIdRef,
  setForwardGruposFetched,
  setForwardGruposLoading,
}) {
  const q = safeString(forwardQuery).trim().toLowerCase();
  const publish = (arr) => {
    const list = (Array.isArray(arr) ? arr : []).filter(
      (c) => c?.id != null && String(c.id) !== String(conversaId) && grupoMatchesForwardQuery(c, q)
    );
    list.forEach((g) => forwardGruposByIdRef.current.set(String(g.id), g));
    setForwardGruposFetched(list);
  };

  const cached = forwardAllGruposRef.current;
  const cacheCoversSearch =
    Array.isArray(cached) && (q.length < 2 || cached.length < FORWARD_GRUPOS_FETCH_LIMIT);
  if (cacheCoversSearch) {
    publish(cached);
    setForwardGruposLoading(false);
    return undefined;
  }

  let cancelled = false;
  setForwardGruposLoading(true);
  const timer = setTimeout(async () => {
    if (cancelled) return;
    try {
      const list = await fetchGruposEncaminhar(
        {
          limit: FORWARD_GRUPOS_FETCH_LIMIT,
          ...(q.length >= 2 ? { palavra: safeString(forwardQuery).trim() } : {}),
        },
        { silent: true }
      );
      if (cancelled) return;
      const arr = Array.isArray(list) ? list : [];
      arr.forEach((g) => forwardGruposByIdRef.current.set(String(g.id), g));
      if (q.length < 2) forwardAllGruposRef.current = arr;
      publish(arr);
    } catch (_) {
      if (!cancelled) setForwardGruposFetched([]);
    } finally {
      if (!cancelled) setForwardGruposLoading(false);
    }
  }, q.length >= 2 ? 260 : 0);

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

/* ----------------------------------- envio ----------------------------------- */

function resolveDestConversaMeta(ctx, destConversaId) {
  const chats = useChatStore.getState().chats;
  const list = Array.isArray(chats) ? chats : [];
  const found = list.find((c) => String(c?.id) === String(destConversaId));
  if (found) return found;
  // Grupo vindo da busca (ainda não está no store): usa a meta guardada no ref.
  return ctx.forwardGruposByIdRef.current.get(String(destConversaId)) || null;
}

function applyForwardOptimisticFor(ctx, destConversaId, msgs) {
  const list = Array.isArray(msgs) ? msgs : [];
  if (!list.length || destConversaId == null) return [];
  const st = useConversaStore.getState();
  return pushOptimisticForwardToDest(
    destConversaId,
    list,
    resolveDestConversaMeta(ctx, destConversaId),
    {
      selectedId: st.selectedId,
      anexarMensagemImediata: st.anexarMensagemImediata,
    }
  );
}

export async function execEncaminharFor(ctx, destConversaId, msgs, opts = {}) {
  const { showToast } = ctx;
  const { quietBatchItemToasts = false } = opts;
  const list = Array.isArray(msgs) ? msgs : [];
  if (!list.length) return null;

  const orderedIds = list.map((m) => m.id).filter((id) => id != null);
  if (!orderedIds.length) {
    for (const m of list) {
      if (isForwardMediaMessage(m)) {
        if (!getForwardMediaUrl(m)) {
          throw new Error("Esta mídia não possui URL disponível para encaminhar.");
        }
        // eslint-disable-next-line no-await-in-loop
        await encaminharArquivo(destConversaId, m, getMediaUrl);
        continue;
      }
      // client_temp_id: dedupe no backend se este POST for repetido (double-submit/reconexão).
      // eslint-disable-next-line no-await-in-loop
      await enviarMensagem(
        destConversaId,
        buildForwardText(m),
        undefined,
        `fwd-${m.tempId ?? m.id ?? "s"}-${destConversaId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      );
    }
    return null;
  }

  if (orderedIds.length === 1) {
    const forwardMsg = list[0];
    const isMediaForward = isForwardMediaMessage(forwardMsg);
    const hasMediaUrl = !!getForwardMediaUrl(forwardMsg);
    try {
      const apiRes = await encaminharMensagemViaAPI(destConversaId, forwardMsg.id);
      // Falha silenciosa: o backend persiste a mensagem (status 'erro') e responde 200 mesmo
      // quando o WhatsApp não recebeu (ex.: mídia original expirada). Avisar de forma clara.
      if (apiRes?.raw?.enviado_whatsapp === false) {
        showToast({
          type: "error",
          title: "Não entregue no WhatsApp",
          message:
            "A mensagem foi registrada, mas o WhatsApp não a recebeu (o arquivo original pode ter expirado). Reenvie o arquivo original.",
        });
      }
      if (apiRes?.kind === "single") return apiRes;
      return { kind: "single", mensagem: apiRes?.mensagem ?? apiRes };
    } catch (e) {
      // Resposta AMBÍGUA (timeout/rede/5xx): o backend PODE ter encaminhado — o fallback
      // abaixo reenviava às cegas e o cliente recebia a mensagem DUPLICADA. Nesses casos,
      // não reenviar: o erro sobe e o atendente confere a conversa antes de tentar de novo.
      const classificado = classifyOutboundAxiosError(e, { media: isMediaForward });
      if (classificado.uncertain) {
        console.warn("Encaminhar via API sem resposta conclusiva — sem fallback para não duplicar:", e?.message);
        throw Object.assign(
          new Error("O servidor não confirmou o encaminhamento. Confira a conversa de destino antes de tentar novamente."),
          { cause: e }
        );
      }
      // Recusa DEFINITIVA (4xx/recusa no corpo): o backend não encaminhou — fallback é seguro.
      console.warn("Encaminhar via API recusado, tentando fallback:", e?.response?.data?.error || e?.message);
      if (hasMediaUrl && isMediaForward) {
        try {
          await encaminharArquivo(destConversaId, forwardMsg, getMediaUrl);
          return null;
        } catch (e2) {
          console.warn("Fallback arquivo também falhou:", e2);
          throw e2;
        }
      }
      if (isMediaForward) throw e;
      await enviarMensagem(
        destConversaId,
        buildForwardText(forwardMsg),
        undefined,
        `fwd-${forwardMsg.id ?? "s"}-${destConversaId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      );
    }
    return null;
  }

  const res = await encaminharMensagemViaAPI(destConversaId, orderedIds);
  if (!res || res.kind !== "batch") {
    throw new Error("Resposta de encaminhamento em lote inválida.");
  }
  const items = res.encaminhamentos || [];
  if (!items.length) {
    throw new Error("Resposta de encaminhamento em lote sem itens.");
  }
  let okCount = 0;
  let failCount = 0;
  let deliveryFailCount = 0;
  for (const item of items) {
    if (item?.ok) {
      okCount++;
      // Persistido, mas o WhatsApp não recebeu — não é falha de encaminhamento, é falha de entrega.
      if (item.enviado_whatsapp === false) deliveryFailCount++;
    } else if (item && item.ok === false) {
      failCount++;
      if (!quietBatchItemToasts) {
        const hint = item.mensagem_id != null ? ` (#${item.mensagem_id})` : "";
        showToast({
          type: "error",
          title: "Falha ao encaminhar",
          message: String(item.error || item.status || `Item${hint}`),
        });
      }
    }
  }
  if (deliveryFailCount > 0 && !quietBatchItemToasts) {
    showToast({
      type: "error",
      title: "Não entregue no WhatsApp",
      message:
        deliveryFailCount === 1
          ? "1 item foi registrado, mas o WhatsApp não o recebeu (arquivo original pode ter expirado). Reenvie o original."
          : `${deliveryFailCount} itens foram registrados, mas o WhatsApp não os recebeu. Reenvie os originais.`,
    });
  }
  if (okCount === 0 && items.length) {
    throw new Error("Nenhuma mensagem foi encaminhada.");
  }
  return {
    kind: "batch",
    encaminhamentos: items,
    successes: okCount,
    failures: failCount,
    total: items.length,
  };
}

function releaseForwardUi(ctx, { destCount = 1, msgCount } = {}) {
  const { closeForward, exitSelectMode, showToast } = ctx;
  const n = msgCount ?? 0;
  closeForward();
  exitSelectMode?.();
  showToast({
    type: "info",
    title: "Encaminhando",
    message:
      destCount > 1
        ? `Enviando para ${destCount} conversa(s) em segundo plano. Você pode continuar usando o sistema.`
        : n > 1
          ? `Enviando ${n} mensagens em segundo plano.`
          : "Mensagem sendo encaminhada em segundo plano.",
  });
}

async function processForwardToDest(ctx, destConversaId, msgs, tempIds, { quietBatchItemToasts = false } = {}) {
  const convStore = useConversaStore.getState();
  const destMeta = resolveDestConversaMeta(ctx, destConversaId);
  let assumeError = null;
  // Mensagens persistidas usam a API, que reabre e assume o destino antes de enviar.
  // Evita o POST /assumir, que recusa atendimentos finalizados.
  if (!msgs.some((m) => m.id != null) && shouldAssumeForwardDestination(destMeta, ctx.user)) {
    try {
      const status = safeString(destMeta?.status_atendimento).toLowerCase().trim();
      if (["fechada", "encerrada", "finalizada", "finalizado"].includes(status)) {
        await reabrirChat(destConversaId);
      } else {
        await assumirChat(destConversaId);
      }
    } catch (ae) {
      throw new Error(formatForwardHttpError(ae));
    }
  }
  const stats = await execEncaminharFor(ctx, destConversaId, msgs, { quietBatchItemToasts });
  reconcileForwardOptimisticTemps(tempIds, stats, convStore.reconciliarMensagem);
  return { stats, assumeError };
}

function runForwardInBackground(ctx, job) {
  const { showToast, forwardJobLockRef } = ctx;
  void (async () => {
    try {
      await job();
    } catch (e) {
      console.error("Erro no encaminhamento em background:", e);
      showToast({
        type: "error",
        title: "Encaminhamento",
        message: formatForwardHttpError(e),
      });
    } finally {
      forwardJobLockRef.current = false;
      try {
        useChatStore.getState().requestChatListResync();
      } catch (_) {}
    }
  })();
}

export function confirmForwardToMany(ctx) {
  const { forwardSelectedConversaIds, forwardMsgs, forwardJobLockRef, showToast } = ctx;
  const ids = (forwardSelectedConversaIds || []).filter((x) => x != null && String(x) !== "");
  const msgs = Array.isArray(forwardMsgs) ? [...forwardMsgs] : [];
  if (ids.length < 1 || ids.length > FORWARD_DEST_MAX || !msgs.length) return;
  if (forwardJobLockRef.current) return;
  forwardJobLockRef.current = true;

  const jobs = ids.map((destId) => ({
    destId,
    tempIds: applyForwardOptimisticFor(ctx, destId, msgs),
  }));

  releaseForwardUi(ctx, { destCount: ids.length, msgCount: msgs.length });

  runForwardInBackground(ctx, async () => {
    const forwardOk = [];
    const forwardFail = [];
    const assumeFail = [];

    for (const { destId, tempIds } of jobs) {
      try {
        const { stats, assumeError } = await processForwardToDest(ctx, destId, msgs, tempIds, {
          quietBatchItemToasts: true,
        });
        forwardOk.push(destId);
        if (stats?.failures > 0) {
          /* lote parcial — POST aceitou; assumir segue */
        }
        if (assumeError) {
          assumeFail.push({ id: destId, error: assumeError });
        }
      } catch (e) {
        const errMsg = formatForwardHttpError(e);
        tempIds.forEach((tid) =>
          useConversaStore.getState().marcarMensagemTempErro(tid, { erro_mensagem: errMsg })
        );
        forwardFail.push({ id: destId, error: errMsg });
      }
    }

    if (forwardOk.length > 0 && forwardFail.length === 0 && assumeFail.length === 0) {
      showToast({
        type: "success",
        title: "Encaminhamento concluído",
        message: `Concluído para ${forwardOk.length} destino(s).`,
      });
    } else if (forwardOk.length > 0) {
      const bits = [];
      if (forwardFail.length) {
        bits.push(
          `Falha em ${forwardFail.length} destino(s): ${forwardFail.map((f) => `#${f.id}`).join(", ")}.`
        );
      }
      if (assumeFail.length) {
        bits.push(
          `Não foi possível assumir em ${assumeFail.length} destino(s): ${assumeFail.map((a) => `#${a.id}`).join(", ")}.`
        );
      }
      showToast({ type: "warning", title: "Resultado parcial", message: bits.join(" ") });
    } else {
      showToast({
        type: "error",
        title: "Falha ao encaminhar",
        message: forwardFail.map((f) => f.error).filter(Boolean).join(" · ") || "Não foi possível encaminhar.",
      });
    }
  });
}

/**
 * Envio unificado (estilo WhatsApp): destinos marcados podem ser conversas
 * existentes e/ou contatos (clientes). Reusa as mesmas primitivas de envio.
 */
export function confirmForwardToSelected(ctx) {
  const {
    forwardSelectedConversaIds,
    forwardSelectedClienteIds,
    forwardMsgs,
    forwardJobLockRef,
    forwardClientesByIdRef,
    showToast,
  } = ctx;
  const convIds = (forwardSelectedConversaIds || []).filter((x) => x != null && String(x) !== "");
  const cliIds = (forwardSelectedClienteIds || []).filter((x) => x != null && String(x) !== "");
  const msgs = Array.isArray(forwardMsgs) ? [...forwardMsgs] : [];
  const total = convIds.length + cliIds.length;
  if (total < 1 || total > FORWARD_DEST_MAX || !msgs.length) return;
  if (forwardJobLockRef.current) return;
  forwardJobLockRef.current = true;

  const convJobs = convIds.map((destId) => ({
    destId,
    tempIds: applyForwardOptimisticFor(ctx, destId, msgs),
  }));
  const cliJobs = cliIds
    .map((cid) => forwardClientesByIdRef.current.get(cid))
    .filter((c) => c && c.id != null);

  releaseForwardUi(ctx, { destCount: total, msgCount: msgs.length });

  runForwardInBackground(ctx, async () => {
    const ok = [];
    const fail = [];
    const assumeFail = [];

    for (const { destId, tempIds } of convJobs) {
      try {
        const { assumeError } = await processForwardToDest(ctx, destId, msgs, tempIds, {
          quietBatchItemToasts: true,
        });
        ok.push(destId);
        if (assumeError) assumeFail.push({ id: destId, error: assumeError });
      } catch (e) {
        const errMsg = formatForwardHttpError(e);
        tempIds.forEach((tid) =>
          useConversaStore.getState().marcarMensagemTempErro(tid, { erro_mensagem: errMsg })
        );
        fail.push({ id: destId, error: errMsg });
      }
    }

    for (const cliente of cliJobs) {
      let tempIds = [];
      try {
        const data = await abrirConversaCliente(cliente.id);
        const conv = data?.conversa || data || null;
        const destId = conv?.id || null;
        if (!destId) throw new Error("Não foi possível abrir a conversa do contato.");
        try {
          useChatStore.getState().addChat(conv);
        } catch (_) {}
        tempIds = applyForwardOptimisticFor(ctx, destId, msgs);
        const { assumeError } = await processForwardToDest(ctx, destId, msgs, tempIds, {
          quietBatchItemToasts: true,
        });
        ok.push(destId);
        if (assumeError) assumeFail.push({ id: destId, error: assumeError });
      } catch (e) {
        const errMsg = formatForwardHttpError(e);
        tempIds.forEach((tid) =>
          useConversaStore.getState().marcarMensagemTempErro(tid, { erro_mensagem: errMsg })
        );
        fail.push({ id: cliente?.id, error: errMsg });
      }
    }

    if (ok.length > 0 && fail.length === 0 && assumeFail.length === 0) {
      showToast({
        type: "success",
        title: "Encaminhamento concluído",
        message: `Concluído para ${ok.length} destino(s).`,
      });
    } else if (ok.length > 0) {
      const bits = [];
      if (fail.length) {
        bits.push(`Falha em ${fail.length} destino(s): ${fail.map((f) => `#${f.id}`).join(", ")}.`);
      }
      if (assumeFail.length) {
        bits.push(
          `Não foi possível assumir em ${assumeFail.length} destino(s): ${assumeFail.map((a) => `#${a.id}`).join(", ")}.`
        );
      }
      showToast({ type: "warning", title: "Resultado parcial", message: bits.join(" ") });
    } else {
      showToast({
        type: "error",
        title: "Falha ao encaminhar",
        message: fail.map((f) => f.error).filter(Boolean).join(" · ") || "Não foi possível encaminhar.",
      });
    }
  });
}

export function confirmForwardTo(ctx, destConversaId) {
  const { forwardMsgs, forwardJobLockRef, showToast } = ctx;
  const msgs = Array.isArray(forwardMsgs) ? [...forwardMsgs] : [];
  if (!destConversaId || !msgs.length || forwardJobLockRef.current) return;
  forwardJobLockRef.current = true;

  const tempIds = applyForwardOptimisticFor(ctx, destConversaId, msgs);
  releaseForwardUi(ctx, { destCount: 1, msgCount: msgs.length });

  runForwardInBackground(ctx, async () => {
    const n = msgs.length;
    try {
      const { stats, assumeError } = await processForwardToDest(ctx, destConversaId, msgs, tempIds);
      if (stats?.failures > 0) {
        showToast({
          type: "info",
          title: "Encaminhamento parcial",
          message: `${stats.successes} de ${stats.total} encaminhada(s); ${stats.failures} falha(s).`,
        });
      } else {
        showToast({
          type: "success",
          title: n > 1 ? "Encaminhadas" : "Encaminhada",
          message: n > 1 ? `${n} mensagens encaminhadas.` : "Mensagem encaminhada.",
        });
      }
      if (assumeError) {
        showToast({
          type: "warning",
          title: "Encaminhado, mas não foi possível assumir",
          message: assumeError,
        });
      }
    } catch (e) {
      const errMsg = formatForwardHttpError(e);
      tempIds.forEach((tid) =>
        useConversaStore.getState().marcarMensagemTempErro(tid, { erro_mensagem: errMsg })
      );
      showToast({ type: "error", title: "Falha ao encaminhar", message: errMsg });
    }
  });
}

export function confirmForwardToCliente(ctx, cliente) {
  const { forwardMsgs, forwardJobLockRef, showToast } = ctx;
  const msgs = Array.isArray(forwardMsgs) ? [...forwardMsgs] : [];
  if (!cliente?.id || !msgs.length || forwardJobLockRef.current) return;
  forwardJobLockRef.current = true;

  releaseForwardUi(ctx, { destCount: 1, msgCount: msgs.length });

  runForwardInBackground(ctx, async () => {
    const n = msgs.length;
    let tempIds = [];
    try {
      const data = await abrirConversaCliente(cliente.id);
      const conv = data?.conversa || data || null;
      const destId = conv?.id || null;
      if (!destId) throw new Error("Não foi possível abrir a conversa do cliente.");
      try {
        useChatStore.getState().addChat(conv);
      } catch (_) {}
      tempIds = applyForwardOptimisticFor(ctx, destId, msgs);
      const { stats, assumeError } = await processForwardToDest(ctx, destId, msgs, tempIds);
      if (stats?.failures > 0) {
        showToast({
          type: "info",
          title: "Encaminhamento parcial",
          message: `${stats.successes} de ${stats.total} encaminhada(s); ${stats.failures} falha(s).`,
        });
      } else {
        showToast({
          type: "success",
          title: n > 1 ? "Encaminhadas" : "Encaminhada",
          message: n > 1 ? `${n} mensagens encaminhadas.` : "Mensagem encaminhada.",
        });
      }
      if (assumeError) {
        showToast({
          type: "warning",
          title: "Encaminhado, mas não foi possível assumir",
          message: assumeError,
        });
      }
    } catch (e) {
      const errMsg = formatForwardHttpError(e);
      tempIds.forEach((tid) =>
        useConversaStore.getState().marcarMensagemTempErro(tid, { erro_mensagem: errMsg })
      );
      showToast({ type: "error", title: "Falha ao encaminhar", message: errMsg });
    }
  });
}

export function confirmForwardToColaborador(ctx, colab) {
  const { forwardMsgs, conversaId, forwardJobLockRef, showToast } = ctx;
  const targetUserId = colab?.id ?? colab?.user_id ?? colab?.usuario_id;
  const msgs = Array.isArray(forwardMsgs) ? [...forwardMsgs] : [];
  const ids = msgs.map((m) => m.id).filter((id) => id != null);
  const originId = conversaId;
  if (!ids.length || !originId || targetUserId == null || forwardJobLockRef.current) return;
  forwardJobLockRef.current = true;

  releaseForwardUi(ctx, { destCount: 1, msgCount: msgs.length });

  runForwardInBackground(ctx, async () => {
    try {
      const data = await forwardAtendimentoMessageToColaborador({
        conversaOrigemId: originId,
        mensagemIds: ids,
        targetUserId,
      });
      const many = Array.isArray(data?.messages) ? data.messages : null;
      const one = data?.message;
      const n = many?.length || (one ? 1 : 0);
      showToast({
        type: "success",
        title: n > 1 ? "Encaminhadas" : "Encaminhada",
        message:
          n > 1
            ? `${n} mensagens enviadas para o chat interno do colaborador.`
            : "Mensagem enviada para o chat interno do colaborador.",
      });
    } catch (e) {
      console.error("Erro ao encaminhar (colaborador):", e);
      showToast({
        type: "error",
        title: "Falha ao encaminhar",
        message: e?.response?.data?.error || e?.message || "Não foi possível encaminhar para o colaborador.",
      });
    }
  });
}
