import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatStore } from "../../chats/chatsStore";
import { FORWARD_SELECT_MAX, FORWARD_DEST_MAX } from "../conversaConstants";
import { snippetFromMsg } from "../utils/conversaMessageDisplay";
import { isInternalNoteEditTipo } from "../bubble/utils/bubbleClassify";
import { useLazyHookImpl } from "./lazyHookImpl";

const EMPTY_LIST = [];
const loadImpl = () => import("./useForwardFlow.impl");
const prefetchModal = () => import("../components/ForwardModal");

/**
 * Estado e lógica do fluxo de encaminhamento (modal, destinos, APIs).
 * Seleção múltipla (selectMode) permanece no ConversaView.
 *
 * Casca (este arquivo): estado, refs, abrir/fechar, seleção de destinos e o snapshot da
 * lista. Corpo (`useForwardFlow.impl.js`): listas derivadas, busca de destinos e envio.
 *
 * Armadilha: `openForwardFromSelection` valida a seleção SÍNCRONO no clique (as
 * mensagens vêm por argumento, lidas na hora) e só abre o modal DEPOIS do corpo chegar —
 * os memos/efeitos de destino precisam dele no mesmo commit da abertura. O chunk do
 * ForwardModal é aquecido junto, então a primeira abertura custa uma viagem, não duas.
 * Com o chunk em cache, abrir é 100% síncrono como antes.
 */
export function useForwardFlow({ conversa, conversaId, user, showToast, exitSelectMode }) {
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardMsgs, setForwardMsgs] = useState(null);
  const [forwardQuery, setForwardQuery] = useState("");
  const [forwardSending, setForwardSending] = useState(false);
  const [forwardClientes, setForwardClientes] = useState([]);
  const [forwardClientesLoading, setForwardClientesLoading] = useState(false);
  const [forwardColaboradores, setForwardColaboradores] = useState([]);
  const [forwardColaboradoresLoading, setForwardColaboradoresLoading] = useState(false);
  const [forwardSelectedConversaIds, setForwardSelectedConversaIds] = useState([]);
  const [forwardSelectedClienteIds, setForwardSelectedClienteIds] = useState([]);
  /** Grupos carregados em GET /chats/grupos (independente da aba da lista). */
  const [forwardGruposFetched, setForwardGruposFetched] = useState([]);
  const [forwardGruposLoading, setForwardGruposLoading] = useState(false);
  const [forwardMax10Msg, setForwardMax10Msg] = useState("");
  const [forwardMultiProgress, setForwardMultiProgress] = useState(null);
  /** Snapshot da lista enquanto o modal está aberto. getState() dentro de useMemo não assina o store. */
  const [forwardChatSnap, setForwardChatSnap] = useState([]);
  const forwardMax10TimerRef = useRef(null);
  /** Cache da lista completa de contatos (carregada ao abrir, sem busca). */
  const forwardAllContatosRef = useRef(null);
  /** Cache dos grupos que o usuário pode encaminhar (carregada ao abrir o modal). */
  const forwardAllGruposRef = useRef(null);
  /** Mapa id->cliente dos contatos marcados, para resolver no envio. */
  const forwardClientesByIdRef = useRef(new Map());
  /** Mapa id->conversa de grupos vindos da busca (não estão no store) para resolver meta no envio. */
  const forwardGruposByIdRef = useRef(new Map());
  /** Evita duplo clique; não bloqueia o modal (envio segue em background). */
  const forwardJobLockRef = useRef(false);
  const { impl, withImpl } = useLazyHookImpl(loadImpl, {
    showToast,
    label: "Encaminhar",
    prefetch: prefetchModal,
  });

  const flashForwardMaxMsg = useCallback(() => {
    setForwardMax10Msg(`Máximo de ${FORWARD_DEST_MAX} destinos.`);
    if (forwardMax10TimerRef.current) clearTimeout(forwardMax10TimerRef.current);
    forwardMax10TimerRef.current = setTimeout(() => {
      setForwardMax10Msg("");
      forwardMax10TimerRef.current = null;
    }, 4000);
  }, []);

  useEffect(() => {
    if (!forwardOpen) return undefined;
    const pull = () => {
      const list = useChatStore.getState().chats;
      setForwardChatSnap(Array.isArray(list) ? list : []);
    };
    pull();
    return useChatStore.subscribe((state, prev) => {
      if (state.chats === prev?.chats) return;
      setForwardChatSnap(Array.isArray(state.chats) ? state.chats : []);
    });
  }, [forwardOpen]);

  const forwardCandidates = useMemo(
    () => (impl ? impl.computeForwardCandidates(forwardChatSnap, forwardQuery, conversaId) : EMPTY_LIST),
    [impl, forwardChatSnap, forwardQuery, conversaId]
  );

  // Grupos já carregados no store (aparecem mesmo sem busca).
  const forwardGruposStore = useMemo(
    () => (impl ? impl.computeForwardGruposStore(forwardChatSnap, forwardQuery, conversaId) : EMPTY_LIST),
    [impl, forwardChatSnap, forwardQuery, conversaId]
  );

  // Lista final de grupos: os do store + os carregados para encaminhar (dedup por id).
  const forwardGrupos = useMemo(
    () =>
      impl
        ? impl.computeForwardGrupos(forwardGruposStore, forwardGruposFetched, forwardQuery, conversaId)
        : EMPTY_LIST,
    [impl, forwardGruposStore, forwardGruposFetched, forwardQuery, conversaId]
  );

  const forwardColaboradoresFiltered = useMemo(
    () => (impl ? impl.computeForwardColaboradoresFiltered(forwardColaboradores, forwardQuery, user?.id) : EMPTY_LIST),
    [impl, forwardColaboradores, forwardQuery, user?.id]
  );

  const forwardPreviewLabel = useMemo(() => {
    if (!forwardMsgs?.length) return "";
    if (forwardMsgs.length === 1) return snippetFromMsg(forwardMsgs[0]);
    const first = snippetFromMsg(forwardMsgs[0]);
    return `${first} · e mais ${forwardMsgs.length - 1} mensagem(ns)`;
  }, [forwardMsgs]);

  // Encaminhar: GET /chats com colaboradores + busca de clientes (contatos)
  useEffect(() => {
    if (!forwardOpen) {
      setForwardClientes([]);
      setForwardClientesLoading(false);
      setForwardColaboradores([]);
      setForwardColaboradoresLoading(false);
      forwardAllContatosRef.current = null;
      return undefined;
    }
    // Só abre com o impl carregado (openForwardFromSelection); o guard é defensivo.
    if (!impl) return undefined;
    return impl.runForwardDestinationsEffect({
      forwardQuery,
      clienteId: conversa?.cliente_id,
      forwardAllContatosRef,
      setForwardClientes,
      setForwardClientesLoading,
      setForwardColaboradores,
      setForwardColaboradoresLoading,
    });
  }, [impl, forwardOpen, forwardQuery, conversa?.cliente_id]);

  // Grupos para encaminhar: carga própria, sem depender da aba atual da lista.
  useEffect(() => {
    if (!forwardOpen) {
      setForwardGruposFetched([]);
      setForwardGruposLoading(false);
      forwardAllGruposRef.current = null;
      return undefined;
    }
    if (!impl) return undefined;
    return impl.runForwardGruposEffect({
      forwardQuery,
      conversaId,
      forwardAllGruposRef,
      forwardGruposByIdRef,
      setForwardGruposFetched,
      setForwardGruposLoading,
    });
  }, [impl, forwardOpen, forwardQuery, conversaId]);

  useEffect(
    () => () => {
      if (forwardMax10TimerRef.current) {
        clearTimeout(forwardMax10TimerRef.current);
        forwardMax10TimerRef.current = null;
      }
    },
    []
  );

  const closeForward = useCallback(() => {
    if (forwardMax10TimerRef.current) {
      clearTimeout(forwardMax10TimerRef.current);
      forwardMax10TimerRef.current = null;
    }
    setForwardOpen(false);
    setForwardMsgs(null);
    setForwardQuery("");
    setForwardSending(false);
    setForwardSelectedConversaIds([]);
    setForwardSelectedClienteIds([]);
    forwardClientesByIdRef.current = new Map();
    forwardGruposByIdRef.current = new Map();
    setForwardGruposFetched([]);
    forwardAllGruposRef.current = null;
    forwardAllContatosRef.current = null;
    setForwardMax10Msg("");
    setForwardMultiProgress(null);
  }, []);

  const resetForwardFlow = useCallback(() => {
    closeForward();
  }, [closeForward]);

  useEffect(() => {
    resetForwardFlow();
  }, [conversaId, resetForwardFlow]);

  /** Snapshot do clique para o corpo (equivale ao closure dos useCallback originais). */
  const ctxRef = useRef(null);
  ctxRef.current = {
    conversaId,
    user,
    showToast,
    exitSelectMode,
    forwardMsgs,
    forwardSelectedConversaIds,
    forwardSelectedClienteIds,
    closeForward,
    forwardClientesByIdRef,
    forwardGruposByIdRef,
    forwardJobLockRef,
  };

  const openForwardWithMsgs = useCallback((msgs) => {
    if (!msgs?.length) return;
    const list = useChatStore.getState().chats;
    setForwardChatSnap(Array.isArray(list) ? list : []);
    setForwardMsgs(msgs);
    setForwardQuery("");
    setForwardSelectedConversaIds([]);
    setForwardSelectedClienteIds([]);
    forwardClientesByIdRef.current = new Map();
    setForwardOpen(true);
  }, []);

  const openForwardFromSelection = useCallback(
    (orderedSelectedIds, mensagens) => {
      if (!orderedSelectedIds?.length) return;
      const byId = new Map((mensagens || []).filter((m) => m?.id).map((m) => [String(m.id), m]));
      const orderedMsgs = orderedSelectedIds.map((id) => byId.get(String(id))).filter(Boolean);
      if (!orderedMsgs.length) {
        showToast({
          type: "warning",
          title: "Mensagens indisponíveis",
          message: "Não foi possível resolver as mensagens selecionadas nesta conversa.",
        });
        return;
      }
      const forwardable = orderedMsgs.filter(
        (m) => !isInternalNoteEditTipo(m) && !m?.apagada_para_todos
      );
      if (!forwardable.length) {
        showToast({
          type: "info",
          title: "Não disponível",
          message: "Notas internas e mensagens apagadas não podem ser encaminhadas.",
        });
        return;
      }
      if (forwardable.length < orderedMsgs.length) {
        showToast({
          type: "info",
          title: "Algumas mensagens foram ignoradas",
          message: "Notas internas e mensagens apagadas não entram no encaminhamento.",
        });
      }
      const capped = forwardable.slice(0, FORWARD_SELECT_MAX);
      if (forwardable.length > capped.length) {
        showToast({
          type: "info",
          title: "Limite",
          message: `Encaminhando as primeiras ${FORWARD_SELECT_MAX} mensagens selecionadas.`,
        });
      }
      withImpl(() => openForwardWithMsgs(capped));
    },
    [showToast, openForwardWithMsgs, withImpl]
  );

  const toggleForwardConversaSelect = useCallback(
    (rawId) => {
      if (rawId == null) return;
      const s = String(rawId);
      setForwardSelectedConversaIds((prev) => {
        if (prev.includes(s)) return prev.filter((x) => x !== s);
        if (prev.length + forwardSelectedClienteIds.length >= FORWARD_DEST_MAX) {
          flashForwardMaxMsg();
          return prev;
        }
        return [...prev, s];
      });
    },
    [forwardSelectedClienteIds.length, flashForwardMaxMsg]
  );

  const toggleForwardClienteSelect = useCallback(
    (cliente) => {
      const id = cliente?.id;
      if (id == null) return;
      const s = String(id);
      forwardClientesByIdRef.current.set(s, cliente);
      setForwardSelectedClienteIds((prev) => {
        if (prev.includes(s)) return prev.filter((x) => x !== s);
        if (prev.length + forwardSelectedConversaIds.length >= FORWARD_DEST_MAX) {
          flashForwardMaxMsg();
          return prev;
        }
        return [...prev, s];
      });
    },
    [forwardSelectedConversaIds.length, flashForwardMaxMsg]
  );

  const execEncaminharFor = useCallback(
    (destConversaId, msgs, opts) => {
      const ctx = ctxRef.current;
      return withImpl((m) => m.execEncaminharFor(ctx, destConversaId, msgs, opts));
    },
    [withImpl]
  );

  const confirmForwardToMany = useCallback(() => {
    const ctx = ctxRef.current;
    return withImpl((m) => m.confirmForwardToMany(ctx));
  }, [withImpl]);

  const confirmForwardToSelected = useCallback(() => {
    const ctx = ctxRef.current;
    return withImpl((m) => m.confirmForwardToSelected(ctx));
  }, [withImpl]);

  const confirmForwardTo = useCallback(
    (destConversaId) => {
      const ctx = ctxRef.current;
      return withImpl((m) => m.confirmForwardTo(ctx, destConversaId));
    },
    [withImpl]
  );

  const confirmForwardToCliente = useCallback(
    (cliente) => {
      const ctx = ctxRef.current;
      return withImpl((m) => m.confirmForwardToCliente(ctx, cliente));
    },
    [withImpl]
  );

  const confirmForwardToColaborador = useCallback(
    (colab) => {
      const ctx = ctxRef.current;
      return withImpl((m) => m.confirmForwardToColaborador(ctx, colab));
    },
    [withImpl]
  );

  return {
    forwardOpen,
    forwardMsgs,
    forwardQuery,
    setForwardQuery,
    forwardSending,
    forwardCandidates,
    forwardGrupos,
    forwardGruposLoading,
    forwardClientes,
    forwardClientesLoading,
    forwardColaboradoresFiltered,
    forwardColaboradoresLoading,
    forwardSelectedConversaIds,
    forwardSelectedClienteIds,
    forwardMax10Msg,
    forwardMultiProgress,
    forwardPreviewLabel,
    closeForward,
    resetForwardFlow,
    openForwardFromSelection,
    toggleForwardConversaSelect,
    toggleForwardClienteSelect,
    execEncaminharFor,
    confirmForwardToCliente,
    confirmForwardTo,
    confirmForwardToColaborador,
    confirmForwardToMany,
    confirmForwardToSelected,
  };
}
