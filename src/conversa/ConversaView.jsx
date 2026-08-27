import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { shallow } from "zustand/shallow";
import { useConversaStore, getMessageListReactKey, isPendingOutgoingTemp } from "./conversaStore";
import {
  enviarMensagem,
  excluirMensagem,
  reenviarMidiaFalha,
  reenviarTextoFalha,
} from "./conversaService";
import {
  isGroupConversation,
  getStatusAtendimentoEffective,
  isClosedAttendance,
  isConversaModoSimplesAtiva,
} from "../utils/conversaUtils";
import "./conversa.css";
import "../styles/zap-animations.css";
import {
  classifyOutboundAxiosError,
  shouldShowOutboundToast,
  OUTBOUND_ERROR_KIND,
} from "./outboundSendError";
import {
  enqueueOutboxText,
  isBrowserOffline,
  removeFromOutbox,
} from "./offlineOutbox";
import { useAuthStore } from "../auth/authStore";
import { canAssumir, canNotaInterna, canReabrir, canTag, canTransferirSetorConversa } from "../auth/permissions";
import "../atendimento/atendentes.css";
import { criarNotaInterna } from "./conversaService";
import {
  abrirConversaPorTelefone,
  conversaFromContatoResponse,
  resolveWhatsappInstanceIdForSharedContact,
} from "../chats/chatService";
import { getSocket } from "../socket/socket";
import { scheduleAfterInitialPaint } from "../chats/scheduleAfterInitialPaint";
import { saveReplyMeta } from "./replyMeta";
import {
  buildOptimisticOutgoingMessage,
  bumpChatListWithOptimisticMessage,
  applyModoSimplesClienteOnOutgoingSend,
  normalizeTextSendApiToMessage,
} from "./conversaOptimisticMessage";
import {
  isNearBottom,
  captureMessagesScrollAnchor,
  restoreMessagesScrollAnchor,
} from "./scrollUtils";
import ConversaThread from "./ConversaThread";
import ConversaComposer from "./ConversaComposer";

import {
  safeString,
  isOutgoingMessage,
  isImageFile,
  isVideoFile,
  isArquivoBloqueadoWhatsApp,
  mensagemArquivoBloqueadoWhatsApp,
  getMediaUrl,
  fileToPreviewURL,
  isRichMediaMessage,
} from "./utils/conversaViewHelpers";
import { buildMensagensComSeparadores } from "./utils/buildMensagensComSeparadores";
import {
  snippetFromMsg,
  buildReplyMetaForPersist,
  replySnippetDisplay,
  getReplySenderLabel,
} from "./utils/conversaMessageDisplay";
import {
  normalizeDepartamentoIdForAccess,
  getUserDepartamentoIdSet,
} from "./utils/conversaAccessHelpers";
import { buildEscapeEntries, runFirstActiveEscape } from "./utils/conversationEscapeOrder";
import Bubble from "./ConversaBubble";
import { useConversationToast } from "./hooks/useConversationToast";
import { usePendingOutgoingLifecycle } from "./hooks/usePendingOutgoingLifecycle";
import { useConversationHeaderIdentity } from "./hooks/useConversationHeaderIdentity";
import { useConversationReactions } from "./hooks/useConversationReactions";
import { useConversationSelection } from "./hooks/useConversationSelection";
import { useConversationThreadActions } from "./hooks/useConversationThreadActions";
import { useConversationOutboundMedia } from "./hooks/useConversationOutboundMedia";
import { useAutoScroll, snapThreadToBottom } from "./hooks/useAutoScroll";
import { useMobileKeyboardViewport } from "./hooks/useMobileKeyboardViewport";
import { useGlobalHotkeys } from "./hooks/useGlobalHotkeys";
import { useForwardFlow } from "./hooks/useForwardFlow";
import { useMediaViewer } from "./hooks/useMediaViewer";
import { useAddToGroup } from "./hooks/useAddToGroup";
import { useConversationCall } from "./hooks/useConversationCall";
import { useConversationSearch } from "./hooks/useConversationSearch";
import { useConversationTimeline } from "./hooks/useConversationTimeline";
import { useConversationParticipants } from "./hooks/useConversationParticipants";
import { useConversationDepartments } from "./hooks/useConversationDepartments";
import { useConversationTags } from "./hooks/useConversationTags";
import { usePixConfig } from "./hooks/usePixConfig";
import { useShareContact } from "./hooks/useShareContact";
import { useShareLocation } from "./hooks/useShareLocation";
import ConversaSelectionBar from "./components/ConversaSelectionBar";
import PendingMediaPreview from "./components/PendingMediaPreview";
import ConversaHeader from "./components/ConversaHeader";
import ConversaViewOverlays from "./components/ConversaViewOverlays";
import ConversaTimelinePanel from "./components/ConversaTimelinePanel";
import ConversaDropOverlay from "./components/ConversaDropOverlay";

import { useChatStore } from "../chats/chatsStore";
import { useMatchMedia } from "../hooks/useMatchMedia";
import EmptyState from "../components/feedback/EmptyState";
import ConversaLoadingScreen from "./ConversaLoadingScreen";
import { closeSelectedConversation } from "../atendimento/closeSelectedConversation";
import "../components/feedback/empty-state.css";
import "../components/feedback/skeleton.css";
import "../components/feedback/toast.css";




/* =========================================================
   ConversaView — coordenador
========================================================= */

function ConversaViewBody() {
  const {
    conversa,
    mensagens,
    loading,
    loadError,
    loadingMore,
    hasMore,
    cursor,
  } = useConversaStore(
    (s) => ({
      conversa: s.conversa,
      mensagens: s.mensagens,
      loading: s.loading,
      loadError: s.loadError,
      loadingMore: s.loadingMore,
      hasMore: s.hasMore,
      cursor: s.cursor,
    }),
    shallow
  );

  const { tags, atendimentos, atendimentosLoading } = useConversaStore(
    (s) => ({
      tags: s.tags,
      atendimentos: s.atendimentos,
      atendimentosLoading: s.atendimentosLoading,
    }),
    shallow
  );

  const selectedId = useConversaStore((s) => s.selectedId);
  const setSelectedId = useConversaStore((s) => s.setSelectedId);

  /** Só a entrada da conversa atual — não re-renderiza quando outro chat recebe typing_start. */
  const typingInfo = useConversaStore((s) => {
    const id = s.conversa?.id ?? s.selectedId;
    if (id == null || id === "") return null;
    return s.typing[String(id)] ?? null;
  });

  const {
    refresh,
    loadMore,
    carregarConversa,
    anexarMensagem,
    anexarMensagemImediata,
    reconciliarMensagem,
    marcarMensagemApagadaParaTodos,
    removerMensagem,
    removerMensagemTemp,
    marcarMensagemTempErro,
    marcarMensagemEnvioIncerto,
    marcarMensagemAguardandoConexao,
    applyPendingOutgoingWatchdog,
    carregarAtendimentos,
    clearTyping,
    assumirConversa,
    reabrirConversa,
    setTags,
  } = useConversaStore(
    (s) => ({
      refresh: s.refresh,
      loadMore: s.loadMore,
      carregarConversa: s.carregarConversa,
      anexarMensagem: s.anexarMensagem,
      anexarMensagemImediata: s.anexarMensagemImediata,
      reconciliarMensagem: s.reconciliarMensagem,
      marcarMensagemApagadaParaTodos: s.marcarMensagemApagadaParaTodos,
      removerMensagem: s.removerMensagem,
      removerMensagemTemp: s.removerMensagemTemp,
      marcarMensagemTempErro: s.marcarMensagemTempErro,
      marcarMensagemEnvioIncerto: s.marcarMensagemEnvioIncerto,
      marcarMensagemAguardandoConexao: s.marcarMensagemAguardandoConexao,
      applyPendingOutgoingWatchdog: s.applyPendingOutgoingWatchdog,
      carregarAtendimentos: s.carregarAtendimentos,
      clearTyping: s.clearTyping,
      assumirConversa: s.assumirConversa,
      reabrirConversa: s.reabrirConversa,
      setTags: s.setTags,
    }),
    shallow
  );

  const user = useAuthStore((s) => s.user);
  const myUserId = user?.id != null && user.id !== "" ? String(user.id) : null;
  const podeTransferirSetor = canTransferirSetorConversa(user);
  const podeGerenciarTags = canTag(user);
  const mostrarEnviarCrm = user?.crm_habilitado !== false;
  const headerCompact = useMatchMedia("(max-width: 640px)");
  /** Tablet atendimento: mesmo padrão do mobile — correção no menu (+), barra em uma linha */
  const atendimentoTabletComposer = useMatchMedia("(min-width: 740px) and (max-width: 1024px)");
  /** Cabeçalho compacto (toolbar ⋯ + ações inline) — mobile e tablet; desktop largo mantém fileira completa */
  const headerAtendCompact = headerCompact || atendimentoTabletComposer;
  /** Bolhas: long press + folha de opções; barra de seleção premium (sem alterar desktop largo). */
  const compactMessageUx = headerCompact || atendimentoTabletComposer;
  const autocorrectToggleInMenu = headerCompact || atendimentoTabletComposer;
  /** Mobile/tablet: tecla Retorno do teclado virtual insere nova linha; enviar só pelo botão (evita enterKeyHint=send esconder o enter). */
  const composerEnterInsertsNewline = headerCompact || atendimentoTabletComposer;
  const composerAppendQueue = useConversaStore((s) => s.composerAppendQueue);
  const clearComposerAppendQueue = useConversaStore((s) => s.clearComposerAppendQueue);
  const queueComposerAppend = useConversaStore((s) => s.queueComposerAppend);

  const modoSimplesAtivo = useMemo(
    () => isConversaModoSimplesAtiva(conversa, user),
    [conversa, user, user?.atendimento_modo_simples, conversa?.atendimento_modo_simples]
  );

  const conversaElegivelAutoAssumir = useMemo(() => {
    if (modoSimplesAtivo) return false;
    if (!user?.id || !conversa?.id) return false;
    if (!canAssumir(user)) return false;
    if (isGroupConversation(conversa)) return false;
    if (isClosedAttendance(conversa)) return false;
    if (conversa?.mensagens_bloqueadas) return false;

    const atendenteId = conversa?.atendente_id ?? null;
    const departamentoId = normalizeDepartamentoIdForAccess(conversa?.departamento_id);
    const semAtendente = atendenteId == null || atendenteId === "";
    const userRole = String(user?.role || user?.perfil || "").toLowerCase();
    const isPrivileged = userRole === "admin" || userRole === "supervisor";
    const userDepIds = getUserDepartamentoIdSet(user);
    const podeVerSetor =
      isPrivileged ||
      !departamentoId ||
      userDepIds.has(departamentoId);

    return semAtendente && podeVerSetor;
  }, [
    modoSimplesAtivo,
    user,
    user?.id,
    user?.role,
    user?.perfil,
    user?.departamento_id,
    user?.departamento_ids,
    user?.departamentos,
    conversa?.id,
    conversa?.remoteJid,
    conversa?.telefone,
    conversa?.phone,
    conversa?.is_group,
    conversa?.isGroup,
    conversa?.tipo,
    conversa?.status_atendimento_real,
    conversa?.status_atendimento,
    conversa?.mensagens_bloqueadas,
    conversa?.atendente_id,
    conversa?.departamento_id,
  ]);

  const conversaElegivelAutoReabrir = useMemo(() => {
    if (!user?.id || !conversa?.id) return false;
    if (!canReabrir(user)) return false;
    if (isGroupConversation(conversa)) return false;
    if (!isClosedAttendance(conversa)) return false;
    if (conversa?.mensagens_bloqueadas) return false;
    return true;
  }, [
    user,
    user?.id,
    user?.role,
    user?.perfil,
    conversa?.id,
    conversa?.remoteJid,
    conversa?.telefone,
    conversa?.phone,
    conversa?.is_group,
    conversa?.isGroup,
    conversa?.tipo,
    conversa?.status_atendimento_real,
    conversa?.status_atendimento,
    conversa?.mensagens_bloqueadas,
  ]);

  // Hook de participantes — antes de podeEnviar pois co-atendentes também podem enviar
  const {
    atendentesParticipantes,
    totalAtendentes,
    reloadAtendentes,
    atendentesModalOpen,
    setAtendentesModalOpen,
    handleOpenAdicionarAtendente,
  } = useConversationParticipants({ conversa });

  const podeEnviar = useMemo(() => {
    if (!user?.id || !conversa?.id) return false;
    /** Grupos: qualquer usuário pode enviar sem assumir atendimento (modelo WhatsApp). */
    if (isGroupConversation(conversa)) return true;
    if (isClosedAttendance(conversa)) return conversaElegivelAutoReabrir;
    if (conversa?.mensagens_bloqueadas) return false;
    const atendenteId = conversa?.atendente_id ?? null;
    if (atendenteId == null || atendenteId === "") {
      if (user?.atendimento_modo_simples === true || conversa?.atendimento_modo_simples === true) {
        const departamentoId = normalizeDepartamentoIdForAccess(conversa?.departamento_id);
        const userRole = String(user?.role || user?.perfil || "").toLowerCase();
        const isPrivileged = userRole === "admin" || userRole === "supervisor";
        const userDepIds = getUserDepartamentoIdSet(user);
        return isPrivileged || !departamentoId || userDepIds.has(departamentoId);
      }
      return conversaElegivelAutoAssumir;
    }
    // Principal OU co-atendente ativo podem enviar
    if (String(atendenteId) === String(user.id)) return true;
    return atendentesParticipantes.some(
      (p) => p.tipo === "participante" && Number(p.usuario_id) === Number(user.id)
    );
  }, [
    user?.id,
    user?.atendimento_modo_simples,
    conversa?.id,
    conversa?.atendimento_modo_simples,
    conversa?.remoteJid,
    conversa?.telefone,
    conversa?.phone,
    conversa?.is_group,
    conversa?.isGroup,
    conversa?.tipo,
    conversa?.status_atendimento_real,
    conversa?.status_atendimento,
    conversa?.mensagens_bloqueadas,
    conversa?.atendente_id,
    conversaElegivelAutoAssumir,
    conversaElegivelAutoReabrir,
    atendentesParticipantes,
  ]);

  const [sending, setSending] = useState(false);
  const [threadOpening, setThreadOpening] = useState(false);
  /** Garante máscara no 1º frame da troca (setState no render), não só no useLayoutEffect pós-paint. */
  const threadOpeningForIdRef = useRef(null);
  const threadOpeningRef = useRef(false);
  threadOpeningRef.current = threadOpening;
  const sendingCountRef = useRef(0);
  const setSendingTracked = useCallback((active) => {
    if (active) {
      sendingCountRef.current += 1;
      setSending(true);
    } else {
      sendingCountRef.current = Math.max(0, sendingCountRef.current - 1);
      if (sendingCountRef.current === 0) setSending(false);
    }
  }, []);

  const { toast, setToast, showToast } = useConversationToast();

  const [dragOver, setDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingPreview, setPendingPreview] = useState(null);
  const [pendingSendOptions, setPendingSendOptions] = useState({});
  /** Legenda opcional digitada no preview (apenas imagem/vídeo, estilo WhatsApp). */
  const [pendingCaption, setPendingCaption] = useState("");
  const pendingCaptionRef = useRef(null);
  const mediaPreviewRootRef = useRef(null);
  const pendingBlobUrlRef = useRef(null);
  const pendingConversaIdRef = useRef(null);
  const confirmSendLockRef = useRef(false);
  /** Evita POST duplicado do mesmo arquivo (double-click / Enter + botão). */
  const arquivoEnvioInFlightRef = useRef(new Set());
  /** Fila FIFO de envio de áudios: cada gravação envia em sequência (ordem preservada). */
  const enviarAudioQueueRef = useRef(Promise.resolve());
  /**
   * Retenção transitória do File por tempId → { file, tipo, attempts } durante o envio inicial.
   * O retry manual usa o mensagem_id e o arquivo persistido no servidor. Removido ao confirmar
   * o envio ou o retry; limpo ao desmontar.
   */
  const audioRetryFilesRef = useRef(new Map());
  /** Evita clique duplo no retry manual da mesma mensagem enquanto o endpoint responde. */
  const audioRetryRequestInFlightRef = useRef(new Set());
  useEffect(() => {
    const retidos = audioRetryFilesRef.current;
    const retries = audioRetryRequestInFlightRef.current;
    return () => {
      retidos.clear();
      retries.clear();
    };
  }, []);

  const messagesContainerRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  /** Meta do último snap via ResizeObserver — evita reancorar em ticks de status. */
  const lastResizeSnapMetaRef = useRef({ contentKey: null, scrollHeight: 0 });
  const messagesLastScrollTopRef = useRef(0);
  /** Botão "ir para recentes": visível quando o utilizador está lendo histórico (longe do fim). */
  const [showScrollToRecent, setShowScrollToRecent] = useState(false);
  const scrollToRecentVisibleRef = useRef(false);
  /** Gravação ativa: mantém a âncora ao fim quando o teclado fecha ao iniciar a gravação. */
  const recordingActiveRef = useRef(false);
  const recordingSnapCleanupRef = useRef(null);
  /** Bloqueia snap automático ao fundo (Assumir, etc.). */
  const suppressAutoScrollRef = useRef(false);
  /** Enquanto o utilizador arrasta o thread (touch), bloqueia reancoragem programática. */
  const userScrollLockRef = useRef(false);
  const userScrollUnlockTimerRef = useRef(0);
  const userInterruptedOpenSnapRef = useRef(false);
  const cancelOpenSnapPendingRef = useRef(null);
  const messagesScrollPreserveSnapRef = useRef(null);
  const [showClienteSide, setShowClienteSide] = useState(false);
  const [showProdutosPanel, setShowProdutosPanel] = useState(false);

  const userRole = String(user?.role || user?.perfil || "").toLowerCase();
  const canConsultarProdutos = ["admin", "supervisor", "atendente"].includes(userRole);
  const canVerSyncProdutos = ["admin", "supervisor"].includes(userRole);
  const canSincronizarProdutos = userRole === "admin";

  // ações estilo WhatsApp: responder, encaminhar, fixar, favoritar, selecionar, apagar
  const [replyTo, setReplyTo] = useState(null);

  const [msgInfoOpen, setMsgInfoOpen] = useState(false);
  const [msgInfo, setMsgInfo] = useState(null);

  const bottomRef = useRef(null);
  const virtualThreadRef = useRef(null);
  const composerRef = useRef(null);
  const mensagensComSeparadoresRef = useRef([]);
  const waShellRef = useRef(null);
  const waHeaderRef = useRef(null);
  const sendCrmRef = useRef(null);
  const zapSeenMsgKeysRef = useRef(new Set());
  const zapMsgsInitialPassRef = useRef(true);
  const zapPassConversaIdRef = useRef(null);

  const focusMessageInput = useCallback(({ force = false } = {}) => {
    composerRef.current?.focusInput?.({ force });
  }, []);

  const composerTextareaHeightRef = useRef({ threadKey: null, height: 0 });

  /**
   * Quando o textarea ganha uma linha, a viewport das mensagens encolhe. Como o thread
   * desliga o scroll anchoring nativo, preservamos explicitamente a âncora inferior antes
   * do paint. Ao limpar/enviar, a viewport cresce; reancoramos aqui também para não
   * expor um espaço temporário no rodapé até o efeito de auto-scroll seguinte.
   */
  const handleComposerTextMetrics = useCallback(({ height, threadKey, cleared } = {}) => {
    const nextThreadKey = threadKey == null ? null : String(threadKey);
    const nextHeight = Math.max(0, Number(height) || 0);
    const previous = composerTextareaHeightRef.current;

    if (previous.threadKey !== nextThreadKey) {
      composerTextareaHeightRef.current = { threadKey: nextThreadKey, height: nextHeight };
      return;
    }

    composerTextareaHeightRef.current = { threadKey: nextThreadKey, height: nextHeight };
    if (userScrollLockRef.current || !shouldStickToBottomRef.current) return;

    const heightChanged = nextHeight !== previous.height;
    if (!heightChanged && !cleared) return;

    const container = messagesContainerRef.current;
    if (!container) return;
    try {
      container.scrollTop = container.scrollHeight;
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const currentBlobUrl = pendingPreview || null;
    pendingBlobUrlRef.current = currentBlobUrl;

    return () => {
      if (currentBlobUrl && String(currentBlobUrl).startsWith("blob:")) {
        try {
          URL.revokeObjectURL(currentBlobUrl);
        } catch {
          /* ignore */
        }
      }
    };
  }, [pendingPreview]);

  const conversaId = conversa?.id || null;

  const { localReactions, reactionLoading, handleSendReaction, handleRemoveReaction } =
    useConversationReactions({ conversaId, showToast });

  usePendingOutgoingLifecycle({
    conversaId,
    refresh,
    showToast,
    applyPendingOutgoingWatchdog,
  });

  const onConversationChange = useCallback(() => {
    setReplyTo(null);
    lastResizeSnapMetaRef.current = { contentKey: null, scrollHeight: 0 };
  }, []);

  const {
    selectMode,
    selectedMsgIds,
    selectModeAnchorRef,
    forwardSelectIntent,
    setForwardSelectIntent,
    pinnedIds,
    pinnedSet,
    starredSet,
    selectedSet,
    orderedSelectedIds,
    togglePin,
    toggleStar,
    startSelect,
    toggleSelected,
    exitSelectMode,
  } = useConversationSelection({
    conversaId,
    messagesContainerRef,
    showToast,
    onConversationChange,
  });

  const debugMessageBoundary = useCallback((event, payload = {}) => {
    if (!import.meta?.env?.DEV) return;
    console.debug(`[message-boundary] ${event}`, payload);
  }, []);

  /** Enquanto `carregarConversa` limpa `conversa`, `selectedId` mantém o chat — necessário para scroll até à última mensagem não falhar a meio do load. */
  const scrollThreadId =
    selectedId != null && selectedId !== "" ? selectedId : conversaId;

  /*
   * Máscara de abertura no mesmo render da troca de conversa (padrão React: ajustar state
   * durante o render quando a identidade muda). O antigo useLayoutEffect só marcava
   * threadOpening=true DEPOIS do primeiro commit — com cache hit o utilizador via 1 frame
   * no topo (lista remontada em scrollTop=0) antes do snap, ou um blink da máscara.
   */
  const openingThreadKey =
    scrollThreadId != null && scrollThreadId !== ""
      ? String(scrollThreadId)
      : conversaId != null && conversaId !== ""
        ? String(conversaId)
        : null;
  if (openingThreadKey !== threadOpeningForIdRef.current) {
    threadOpeningForIdRef.current = openingThreadKey;
    if (openingThreadKey) {
      if (!threadOpening) setThreadOpening(true);
    } else if (threadOpening) {
      setThreadOpening(false);
    }
  }

  /*
   * Reset no MESMO render da troca de conversa. O useLayoutEffect rodava depois do paint:
   * o 1º frame herdava isInitialPass=false da conversa anterior e as 2 últimas bolhas
   * animavam (parecia pulo ao entrar).
   */
  if (conversaId !== zapPassConversaIdRef.current) {
    zapPassConversaIdRef.current = conversaId;
    zapSeenMsgKeysRef.current = new Set();
    zapMsgsInitialPassRef.current = true;
  }

  useEffect(() => {
    setMessageSearchOpen(false);
  }, [conversaId]);

  /* Mobile: cabeçalho fixo (viewport) + padding no shell; teclado via visualViewport.
     Corpo extraído para o hook useMobileKeyboardViewport (mesmo comportamento). */
  useMobileKeyboardViewport({
    conversaId,
    waShellRef,
    waHeaderRef,
    composerRef,
    messagesContainerRef,
    virtualThreadRef,
    shouldStickToBottomRef,
    userScrollLockRef,
    recordingActiveRef,
  });

  const isSomeoneTyping = Boolean(
    typingInfo &&
    (myUserId == null || String(typingInfo.usuario_id ?? "") !== String(myUserId)) &&
    (typingInfo.expiresAt == null || typingInfo.expiresAt > Date.now())
  );

  const isGroup = useMemo(() => isGroupConversation(conversa), [conversa]);
  const podeAdicionarAtendente =
    ["admin", "supervisor", "atendente"].includes(userRole) &&
    !!conversaId &&
    !isGroup &&
    !isClosedAttendance(conversa);

  // Ver atendentes: visível mesmo quando conversa encerrada (para consultar participantes)
  const podeVerAtendentes =
    ["admin", "supervisor", "atendente"].includes(userRole) &&
    !!conversaId &&
    !isGroup;
  const podeAnotar = !isGroup && !!conversaId && canNotaInterna(user);

  const {
    fromChat,
    nome,
    avatar,
    avatarUrl,
    showAvatarImg,
    setAvatarImgError,
    badge,
    showPagamentoConcluidoBadge,
    headerCrmAtivoLayout,
    encerramentoAusenciaHint,
    whatsappInstanceLabel,
    conversaModoSimplesUi,
    isLidValue,
  } = useConversationHeaderIdentity({
    conversa,
    conversaId,
    isGroup,
    mensagens,
    user,
    modoSimplesAtivo,
  });

  const replyBarPreview = useMemo(() => {
    if (!replyTo) return null;
    const chatParaNome = fromChat ?? conversa;
    const rt = safeString(replyTo?.tipo).toLowerCase();
    const thumb = rt === "imagem" || rt === "sticker" ? getMediaUrl(replyTo?.url, replyTo?.url_absoluta) : "";
    const meta = buildReplyMetaForPersist(replyTo, nome, chatParaNome);
    return {
      thumb: thumb || null,
      title: getReplySenderLabel(replyTo, nome, chatParaNome),
      text: replySnippetDisplay(meta) || snippetFromMsg(replyTo),
    };
  }, [replyTo, nome, fromChat, conversa]);

  const lastMsg = useMemo(
    () => (mensagens?.length ? mensagens[mensagens.length - 1] : null),
    [mensagens]
  );
  const lastMsgKey = useMemo(() => {
    if (!lastMsg) return null;
    return String(
      lastMsg.tempId ??
      lastMsg.id ??
      lastMsg.whatsapp_id ??
      `${lastMsg.criado_em || ""}-${lastMsg.direcao || ""}-${(lastMsg.texto || lastMsg.conteudo || "").slice(0, 24)}`
    );
  }, [lastMsg]);

  const pinnedTop = useMemo(() => {
    if (!mensagens?.length || !(pinnedIds || []).length) return null;
    const lastPinnedId = String((pinnedIds || [])[pinnedIds.length - 1]);
    return (mensagens || []).find((m) => String(m.id) === lastPinnedId) || null;
  }, [mensagens, pinnedIds]);

  const tempoSemResponder = useMemo(() => {
    const list = Array.isArray(mensagens) ? mensagens : [];
    let ultimaIn = null;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]?.direcao === "in") { ultimaIn = list[i]; break; }
    }
    if (!ultimaIn?.criado_em) return null;
    const diffMs = Date.now() - new Date(ultimaIn.criado_em).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);
    if (diffMin < 1) return "Agora";
    if (diffMin < 60) return `${diffMin} min`;
    if (diffH < 24) return `${diffH}h`;
    return `${diffD} dia(s)`;
  }, [mensagens]);

  /** Só reancora ao fundo se o utilizador ainda está colado ao fim (evita “puxar” ao meio ao ler histórico). */
  const snapIfStickBottom = useCallback(() => {
    const c = messagesContainerRef.current;
    if (!c || loadingMore || userScrollLockRef.current) return;
    /* Abertura: o snap é só do useAutoScroll. ResizeObserver a competir = pulo ao revelar. */
    if (threadOpeningRef.current) return;
    if (!shouldStickToBottomRef.current) return;
    const list = useConversaStore.getState().mensagens || [];
    const last = list.length ? list[list.length - 1] : null;
    const contentKey = last
      ? `${list.length}:${String(last.tempId ?? last.id ?? last.whatsapp_id ?? "")}`
      : "0:";
    const scrollHeight = c.scrollHeight || 0;
    const prev = lastResizeSnapMetaRef.current;
    const keyChanged = prev.contentKey !== contentKey;
    const heightDelta = scrollHeight - (prev.scrollHeight || 0);
    /*
     * ResizeObserver dispara em qualquer remedião (ticks sent→delivered→read).
     * Sem mudança de mensagem nem crescimento real de altura, reancorar causa o “pulo”.
     * Mídia que carrega (altura sobe) e mensagem nova (contentKey) continuam a snapar.
     */
    if (!keyChanged && Math.abs(heightDelta) < 4) {
      lastResizeSnapMetaRef.current = { contentKey, scrollHeight };
      return;
    }
    const distanceToBottom = scrollHeight - (c.scrollTop || 0) - (c.clientHeight || 0);
    if (!keyChanged && distanceToBottom < 2 && heightDelta <= 0) {
      lastResizeSnapMetaRef.current = { contentKey, scrollHeight };
      return;
    }
    lastResizeSnapMetaRef.current = { contentKey, scrollHeight };
    const guard = {
      canSnap: () => !userScrollLockRef.current && shouldStickToBottomRef.current,
      followUpFrame: false,
    };
    if (last && isPendingOutgoingTemp(last)) {
      snapThreadToBottom(c, virtualThreadRef, { min: true, ...guard });
      return;
    }
    snapThreadToBottom(c, virtualThreadRef, { followUpFrame: false, ...guard });
  }, [loadingMore]);

  /**
   * Compensa o deslocamento causado pela barra de seleção (sticky, em fluxo) ao
   * entrar/sair do modo seleção — mantém as mensagens visualmente fixas (sem "pulo").
   * Roda antes do paint (useLayoutEffect) para não haver flash visível.
   */
  useLayoutEffect(() => {
    const anchor = selectModeAnchorRef.current;
    if (!anchor) return;
    selectModeAnchorRef.current = null;
    restoreMessagesScrollAnchor(messagesContainerRef.current, anchor);
  }, [selectMode]);

  /** Evita animação zapAnimateIn na bolha otimista (parece “pulo” ao enviar). */
  const markOptimisticSeen = useCallback(
    (msg) => {
      if (!msg || conversaId == null) return;
      zapSeenMsgKeysRef.current.add(getMessageListReactKey(msg, conversaId));
    },
    [conversaId]
  );

  const appendOutgoingOptimisticMessage = useCallback(
    (optimisticMsg, opts = {}) => {
      if (!optimisticMsg) return null;
      if (!userScrollLockRef.current) {
        shouldStickToBottomRef.current = true;
      }
      markOptimisticSeen(optimisticMsg);
      try {
        flushSync(() => anexarMensagemImediata(optimisticMsg));
      } catch {
        anexarMensagemImediata(optimisticMsg);
      }
      const meta = fromChat ?? conversa;
      let modoSimplesRevert = null;
      if (opts.bumpList !== false) {
        if (modoSimplesAtivo) {
          modoSimplesRevert = applyModoSimplesClienteOnOutgoingSend(conversaId, optimisticMsg, {
            conversaMeta: meta,
            modoSimplesAtivo: true,
            bumpList: true,
          }).revert;
        } else {
          bumpChatListWithOptimisticMessage(conversaId, optimisticMsg, meta);
        }
      } else if (modoSimplesAtivo) {
        modoSimplesRevert = applyModoSimplesClienteOnOutgoingSend(conversaId, optimisticMsg, {
          conversaMeta: meta,
          modoSimplesAtivo: true,
          bumpList: false,
        }).revert;
      }
      return modoSimplesRevert;
    },
    [
      anexarMensagemImediata,
      conversa,
      conversaId,
      fromChat,
      markOptimisticSeen,
      modoSimplesAtivo,
    ]
  );

  const scheduleArquivoSendConsistencyCheck = useCallback((targetConversaId, tempIds, opts = {}) => {
    if (!targetConversaId) return;
    const tempSet = new Set(
      (Array.isArray(tempIds) ? tempIds : [tempIds])
        .map((v) => String(v || "").trim())
        .filter(Boolean)
    );
    const knownIdSet = new Set(
      (Array.isArray(opts.knownIds) ? opts.knownIds : [opts.knownIds])
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    );
    if (!tempSet.size && !knownIdSet.size) return;

    const matchesTrackedUpload = (msg) => {
      if (!msg) return false;
      if (msg.tempId && tempSet.has(String(msg.tempId))) return true;
      if (msg.id != null && knownIdSet.has(String(msg.id))) return true;
      return false;
    };
    const hasPersistedIdentity = (msg) =>
      (msg?.id != null && String(msg.id).trim() !== "") ||
      (msg?.whatsapp_id != null && String(msg.whatsapp_id).trim() !== "");
    const isStillPending = (msg) => {
      const s = String(msg?.status_mensagem ?? msg?.status ?? "").toLowerCase();
      return s === "" || s === "pending" || s === "sending" || s === "enviando";
    };

    const run = (phase) => {
      const st = useConversaStore.getState();
      if (String(st.selectedId) !== String(targetConversaId)) return;
      const found = (st.mensagens || []).filter(matchesTrackedUpload);
      const hasEveryTemp =
        !tempSet.size ||
        [...tempSet].every((tid) => found.some((m) => String(m?.tempId || "") === tid)) ||
        (tempSet.size === 1 &&
          knownIdSet.size > 0 &&
          found.some((m) => m?.id != null && knownIdSet.has(String(m.id))));
      const hasAnyKnownId =
        !knownIdSet.size ||
        found.some((m) => m?.id != null && knownIdSet.has(String(m.id)));
      const allTrackedReconciled =
        (tempSet.size === 0 ||
          [...tempSet].every((tid) =>
            found.some((m) => String(m?.tempId || "") === tid && hasPersistedIdentity(m))
          )) &&
        (knownIdSet.size === 0 ||
          [...knownIdSet].every((kid) => found.some((m) => m?.id != null && knownIdSet.has(String(m.id)))));
      const needsPresenceRefresh =
        found.length === 0 ||
        !hasEveryTemp ||
        !hasAnyKnownId ||
        found.some((m) => !hasPersistedIdentity(m));
      const needsStatusRefresh =
        phase === "status" && found.some((m) => hasPersistedIdentity(m) && isStillPending(m));

      if (allTrackedReconciled && !needsStatusRefresh) return;
      if (needsPresenceRefresh || needsStatusRefresh) {
        void st.refresh({ silent: true });
      }
    };

    scheduleAfterInitialPaint(() => run("presence"), 700);
    if (!opts.skipPendingStatusRefresh) {
      scheduleAfterInitialPaint(() => run("status"), 2600);
    }
  }, []);

  const applyOutgoingStatusOptimistic = useCallback(() => {
    if (!conversaId || isGroup) return null;

    const convStore = useConversaStore.getState();
    const chatStore = useChatStore.getState();
    const openConv =
      convStore.conversa && String(convStore.conversa.id) === String(conversaId)
        ? convStore.conversa
        : conversa;
    const row = (chatStore.chats || []).find((c) => String(c?.id) === String(conversaId));
    const source = openConv || row || fromChat;

    if (getStatusAtendimentoEffective(source) !== "em_atendimento") return null;

    // aguardando_cliente_desde NÃO entra aqui: o backend só marca quando
    // outboundQualificaParaAguardandoCliente() permite (ex.: não marca para
    // mensagem de ausência) — adivinhar isso no frontend pode setar um valor
    // que o backend nunca confirma, e também reseta um aguardando_cliente_desde
    // real pré-existente para "agora" sem necessidade.
    const patch = {
      id: conversaId,
      status_atendimento: "em_atendimento",
      status_atendimento_real: "em_atendimento",
      exibir_badge_aberta: false,
      tem_novas_mensagens_em_atendimento: false,
      ui_status_optimistic_at: Date.now(),
    };
    const revertOpen = openConv
      ? {
          id: conversaId,
          status_atendimento: openConv.status_atendimento,
          status_atendimento_real: openConv.status_atendimento_real,
          aguardando_cliente_desde: openConv.aguardando_cliente_desde,
          exibir_badge_aberta: openConv.exibir_badge_aberta,
          tem_novas_mensagens_em_atendimento: openConv.tem_novas_mensagens_em_atendimento,
          ui_status_optimistic_at: openConv.ui_status_optimistic_at ?? null,
        }
      : null;
    const revertRow = row
      ? {
          id: conversaId,
          status_atendimento: row.status_atendimento,
          status_atendimento_real: row.status_atendimento_real,
          aguardando_cliente_desde: row.aguardando_cliente_desde,
          exibir_badge_aberta: row.exibir_badge_aberta,
          tem_novas_mensagens_em_atendimento: row.tem_novas_mensagens_em_atendimento,
          ui_status_optimistic_at: row.ui_status_optimistic_at ?? null,
        }
      : null;

    convStore.patchConversa(patch);
    chatStore.updateChat(patch);

    return () => {
      if (revertOpen) useConversaStore.getState().patchConversa(revertOpen);
      if (revertRow) useChatStore.getState().updateChat(revertRow);
    };
  }, [conversa, conversaId, fromChat, isGroup]);

  /*
   * Âncora usada pelas ações de atendimento (assumir/encerrar/reabrir/aguardar/retomar/
   * transferir) enquanto o banner de encerrado e o aviso do composer entram/saem do layout.
   *
   * Quem já estava colado ao fim (caso normal ao clicar Encerrar) fica colado ao fim: manter
   * um scrollTop absoluto aqui deixaria a última mensagem meio cortada porque o virtualizer
   * ainda remede as bolhas. Quem está a ler histórico mantém o mesmo trecho visível.
   */
  useEffect(() => {
    const begin = () => {
      const el = messagesContainerRef.current;
      const snap = captureMessagesScrollAnchor(el);
      messagesScrollPreserveSnapRef.current = snap
        ? { ...snap, atBottom: el ? isNearBottom(el, 120) : true }
        : null;
      suppressAutoScrollRef.current = true;
      shouldStickToBottomRef.current = false;
    };
    const end = () => {
      const snap = messagesScrollPreserveSnapRef.current;
      const el = messagesContainerRef.current;
      if (!snap || !el) return;
      if (snap.atBottom) {
        snapThreadToBottom(el, virtualThreadRef, { min: true, followUpFrame: false });
        return;
      }
      restoreMessagesScrollAnchor(el, snap);
    };
    const release = () => {
      const snap = messagesScrollPreserveSnapRef.current;
      const el = messagesContainerRef.current;
      messagesScrollPreserveSnapRef.current = null;
      suppressAutoScrollRef.current = false;
      /*
       * `begin` desligou a âncora inferior para o snap não competir com o restauro.
       * Sem repor aqui, a conversa ficava sem auto-scroll até o próximo evento de scroll:
       * o atendente encerrava, recebia mensagem e ela nascia fora do ecrã.
       */
      if (el) shouldStickToBottomRef.current = snap?.atBottom ? true : isNearBottom(el, 120);
    };
    useConversaStore.getState().registerMessagesScrollPreserve({ begin, end, release });
    return () => useConversaStore.getState().registerMessagesScrollPreserve(null);
  }, []);

  useAutoScroll({
    conversaId: scrollThreadId,
    loading,
    lastMsgKey,
    lastMsg,
    myUserId,
    messagesContainerRef,
    shouldStickToBottomRef,
    virtualListRef: virtualThreadRef,
    mensagensCount: Array.isArray(mensagens) ? mensagens.length : 0,
    suppressAutoScrollRef,
    userScrollLockRef,
    cancelOpenSnapPendingRef,
    onOpenSnapReady: () => setThreadOpening(false),
  });

  useLayoutEffect(() => {
    if (loading || !conversaId) return;
    const list = Array.isArray(mensagens) ? mensagens : [];
    if (!zapMsgsInitialPassRef.current) return;
    if (list.length === 0) return;
    list.forEach((m) => {
      zapSeenMsgKeysRef.current.add(getMessageListReactKey(m, conversaId));
    });
    zapMsgsInitialPassRef.current = false;
  }, [loading, conversaId, mensagens]);

  /**
   * Timeout/rede: status_indefinido + refresh (não erro/provedor).
   * Falha confirmada: erro. Preserva client_temp_id; não cria segunda mensagem.
   */
  const applyOutboundSendFailure = useCallback(
    (tempId, err, { toastTitle = "Falha ao enviar", mensagemId = null } = {}) => {
      const classified = classifyOutboundAxiosError(err);
      const toastKey = `out-${tempId || mensagemId || "x"}-${classified.kind}`;
      if (classified.uncertain) {
        marcarMensagemEnvioIncerto(tempId, {
          erro_mensagem: classified.message,
          ...(mensagemId != null ? { mensagem_id: mensagemId } : {}),
        });
        void refresh({ silent: true });
        if (shouldShowOutboundToast(toastKey)) {
          showToast({
            type: "warning",
            title:
              classified.kind === OUTBOUND_ERROR_KIND.TIMEOUT
                ? "Demora no envio"
                : classified.kind === OUTBOUND_ERROR_KIND.OFFLINE
                  ? "Sem conexão"
                  : "Verificando envio",
            message: classified.message,
          });
        }
        return classified;
      }
      marcarMensagemTempErro(tempId, {
        erro_mensagem: classified.message,
        ...(mensagemId != null ? { mensagem_id: mensagemId } : {}),
      });
      if (shouldShowOutboundToast(toastKey)) {
        showToast({
          type: "error",
          title: classified.httpStatus === 403 ? "Acesso restrito" : toastTitle,
          message: classified.message,
        });
      }
      return classified;
    },
    [marcarMensagemEnvioIncerto, marcarMensagemTempErro, refresh, showToast]
  );

  const {
    mediaViewer,
    mediaPdfBlobUrl,
    mediaPdfLoading,
    mediaPdfError,
    mediaPrintLoading,
    mediaViewerImgRef,
    mediaViewerVideoRef,
    openMediaViewer,
    closeMediaViewer,
    handleMediaViewerPrint,
  } = useMediaViewer({ showToast });

  const {
    addToGroupModal,
    addToGroupGrupos,
    addToGroupLoading,
    addToGroupSending,
    handleAdicionarGrupoContact,
    closeAddToGroupModal,
    confirmAddToGroup,
  } = useAddToGroup(showToast);

  const {
    callModalOpen,
    setCallModalOpen,
    callDuration,
    callSending,
    handleCallDurationChange,
    handleCallConfirm,
  } = useConversationCall({ conversaId, showToast });

  const {
    showTimeline,
    setShowTimeline,
    toggleTimeline,
    handleCloseTimeline,
  } = useConversationTimeline({ conversaId, carregarAtendimentos });

  const {
    showTransferirSetor,
    setShowTransferirSetor,
    departamentos,
    transferirSetorLoading,
    setorAtual,
    handleOpenTransferirSetor,
    handleTransferirSetor,
    handleRemoverSetor,
  } = useConversationDepartments({ conversaId, conversa, refresh, showToast });

  const {
    allTags,
    tagsOpen,
    setTagsOpen,
    tagsLoading,
    tagMutatingId,
    selectedTagIds,
    handleToggleTagPanel,
    handleToggleTag,
  } = useConversationTags({ conversaId, tags, setTags, showToast });

  const {
    shareContactOpen,
    shareContactQuery,
    setShareContactQuery,
    shareContactList,
    shareContactLoading,
    shareContactSending,
    openShareContact,
    handleShareContactClose,
    handleShareContactSelect,
  } = useShareContact({ conversaId, showToast });

  const {
    shareLocationOpen,
    shareLocationGeoLoading,
    shareLocationGeoError,
    shareLocationLat,
    setShareLocationLat,
    shareLocationLng,
    setShareLocationLng,
    shareLocationNome,
    setShareLocationNome,
    shareLocationEndereco,
    setShareLocationEndereco,
    shareLocationSending,
    openShareLocation,
    handleEnviarLocalizacao,
    handleShareLocationClose,
  } = useShareLocation({ conversaId, showToast, composerRef });

  const handleComposerAppendApplied = useCallback(() => {
    showToast({
      type: "success",
      title: "Produto pronto",
      message: "O produto foi adicionado na caixa de mensagem.",
    });
  }, [showToast]);

  const clearPending = useCallback(() => {
    if (pendingPreview) {
      try {
        URL.revokeObjectURL(pendingPreview);
      } catch {}
    }
    pendingConversaIdRef.current = null;
    setPendingFile(null);
    setPendingPreview(null);
    setPendingSendOptions({});
    setPendingCaption("");
  }, [pendingPreview]);

  const openMediaSendPreview = useCallback((file, opts = {}) => {
    if (!file || !conversaId) return;
    if (isArquivoBloqueadoWhatsApp(file)) {
      showToast({
        type: "error",
        title: "Arquivo não permitido",
        message: mensagemArquivoBloqueadoWhatsApp(file),
      });
      return;
    }
    pendingConversaIdRef.current = conversaId;
    setPendingFile(file);
    setPendingSendOptions(opts && typeof opts === "object" ? opts : {});
    setPendingCaption("");
    if (isImageFile(file) || isVideoFile(file)) {
      requestAnimationFrame(() => {
        try {
          const url = fileToPreviewURL(file);
          setPendingPreview(url);
        } catch {
          setPendingPreview(null);
        }
      });
    } else {
      setPendingPreview(null);
    }
  }, [conversaId, showToast]);

  const onHeaderAvatarClick = useCallback(() => {
    if (showAvatarImg && avatarUrl) {
      openMediaViewer(avatarUrl, "imagem", nome);
    }
  }, [showAvatarImg, avatarUrl, nome, openMediaViewer]);

  const handleBackToList = useCallback(() => {
    /* Mesmo comportamento do ESC: só fecha a seleção, sem alterar status/atendimento. */
    closeSelectedConversation({ preferHistoryBack: headerCompact });
  }, [headerCompact]);

  const handleHeaderAvatarError = useCallback(() => {
    setAvatarImgError(true);
  }, []);

  const handleOpenProdutosPanel = useCallback(() => {
    setShowProdutosPanel(true);
  }, []);

  const handleOpenClienteSide = useCallback(() => {
    setShowClienteSide(true);
  }, []);

  const loadMoreScrollRef = useRef({ top: 0, height: 0 });
  const loadMoreAnchorRef = useRef(null);
  const loadMorePrevSeparatorCountRef = useRef(0);
  const scrollEndTimerRef = useRef(0);

  const captureLoadMoreAnchor = useCallback(() => {
    loadMorePrevSeparatorCountRef.current = mensagensComSeparadoresRef.current.length;
    const el = messagesContainerRef.current;
    if (el) {
      /* Fallback capturado mesmo quando há âncora virtual. Assim uma troca
         estática→virtual no mobile ainda consegue preservar a posição. */
      loadMoreScrollRef.current = { top: el.scrollTop, height: el.scrollHeight };
    }
    const anchor = virtualThreadRef.current?.getScrollAnchor?.();
    if (anchor) {
      loadMoreAnchorRef.current = anchor;
    }
  }, []);

  const tryLoadOlderMessages = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el || el.scrollTop >= 140) return;
    const st = useConversaStore.getState();
    if (!st.hasMore || st.loadingMore || !st.cursor || st.conversa?.mensagens_bloqueadas) return;
    captureLoadMoreAnchor();
    st.loadMore();
  }, [captureLoadMoreAnchor]);

  const releaseStickToBottom = useCallback(() => {
    shouldStickToBottomRef.current = false;
  }, []);

  const lockUserScroll = useCallback(() => {
    userScrollLockRef.current = true;
    window.clearTimeout(userScrollUnlockTimerRef.current);
  }, []);

  const scheduleUserScrollUnlock = useCallback((delayMs = 160) => {
    window.clearTimeout(userScrollUnlockTimerRef.current);
    userScrollUnlockTimerRef.current = window.setTimeout(() => {
      userScrollLockRef.current = false;
      const el = messagesContainerRef.current;
      if (el) {
        shouldStickToBottomRef.current = isNearBottom(el, 120);
      }
    }, delayMs);
  }, []);

  /** Mostra/esconde o botão "ir para recentes" só quando o valor muda (evita re-render por scroll). */
  const syncScrollToRecentVisibility = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const next = !isNearBottom(el, 120);
    if (scrollToRecentVisibleRef.current !== next) {
      scrollToRecentVisibleRef.current = next;
      setShowScrollToRecent(next);
    }
  }, []);

  const handleScrollToRecent = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // Ação deliberada do utilizador: reancora ao fim e desbloqueia o snap automático.
    userScrollLockRef.current = false;
    window.clearTimeout(userScrollUnlockTimerRef.current);
    shouldStickToBottomRef.current = true;
    snapThreadToBottom(el, virtualThreadRef, { min: true });
    scrollToRecentVisibleRef.current = false;
    setShowScrollToRecent(false);
  }, []);

  /**
   * Ao iniciar/parar a gravação, a barra do composer troca de altura (linha de digitação <->
   * barra de gravação) e, no mobile, o teclado fecha — a altura da lista muda e, como o container
   * tem overflow-anchor:none, o browser mantém o scrollTop e a tela "pula". Se o utilizador já
   * estava no fim (caso típico: acabou de enviar áudios), reancora ao fim ao longo da transição
   * (snaps instantâneos escalonados) para a tela ficar fixa nas últimas mensagens, sem pulo.
   * Se estiver a ler histórico, não faz nada (não o puxa para baixo).
   */
  const handleRecordingStateChange = useCallback((recording) => {
    recordingActiveRef.current = !!recording;
    if (recordingSnapCleanupRef.current) {
      recordingSnapCleanupRef.current();
      recordingSnapCleanupRef.current = null;
    }
    const el = messagesContainerRef.current;
    if (!el) return;
    if (userScrollLockRef.current) return;
    if (!isNearBottom(el, 200)) return;
    shouldStickToBottomRef.current = true;
    const snap = () => {
      if (userScrollLockRef.current) return;
      snapThreadToBottom(messagesContainerRef.current, virtualThreadRef, {
        min: true,
        canSnap: () => !userScrollLockRef.current,
      });
    };
    snap();
    const raf = requestAnimationFrame(snap);
    const t1 = window.setTimeout(snap, 120);
    const t2 = window.setTimeout(snap, 280);
    recordingSnapCleanupRef.current = () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  // Uma troca rápida de conversa não pode deixar os snaps da gravação anterior atuarem
  // sobre o novo thread. A mesma limpeza cobre o desmonte da tela.
  useEffect(() => {
    return () => {
      recordingSnapCleanupRef.current?.();
      recordingSnapCleanupRef.current = null;
      recordingActiveRef.current = false;
    };
  }, [conversaId]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const prevTop = messagesLastScrollTopRef.current;
    /*
     * Um scroll para cima não prova intenção do utilizador: o virtualizer também
     * altera scrollTop durante medições. Só bloqueamos a âncora quando wheel/touch
     * já marcou uma interação humana, evitando confundir correção interna com gesto.
     */
    if (top < prevTop - 1 && userScrollLockRef.current) {
      shouldStickToBottomRef.current = false;
      cancelOpenSnapPendingRef.current?.();
      scheduleUserScrollUnlock(headerCompact ? 320 : 240);
    } else {
      if (isNearBottom(el, 120)) {
        shouldStickToBottomRef.current = true;
      }
    }
    messagesLastScrollTopRef.current = top;
    syncScrollToRecentVisibility();

    window.clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = window.setTimeout(
      tryLoadOlderMessages,
      headerCompact ? 200 : 140
    );
  }, [tryLoadOlderMessages, headerCompact, lockUserScroll, scheduleUserScrollUnlock]);

  useLayoutEffect(() => {
    messagesLastScrollTopRef.current = 0;
    userScrollLockRef.current = false;
    userInterruptedOpenSnapRef.current = false;
    window.clearTimeout(userScrollUnlockTimerRef.current);
    // Ao trocar de conversa, esconde o botão de recentes (abre sempre ancorado ao fim).
    scrollToRecentVisibleRef.current = false;
    setShowScrollToRecent(false);
  }, [scrollThreadId]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleMessagesScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleMessagesScroll);
      window.clearTimeout(scrollEndTimerRef.current);
    };
  }, [handleMessagesScroll, conversaId]);

  // Reavalia o botão "ir para recentes" quando chega mensagem nova: mostra se o utilizador está
  // lendo histórico; esconde se o snap automático o manteve no fim. rAF lê a posição pós-layout.
  useEffect(() => {
    const id = requestAnimationFrame(() => syncScrollToRecentVisibility());
    return () => cancelAnimationFrame(id);
  }, [lastMsgKey, loading, syncScrollToRecentVisibility]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    let touchStartY = 0;
    let touchActive = false;

    const onTouchStart = (e) => {
      touchActive = true;
      userInterruptedOpenSnapRef.current = true;
      touchStartY = e.touches?.[0]?.clientY ?? 0;
      lockUserScroll();
      releaseStickToBottom();
      cancelOpenSnapPendingRef.current?.();
    };
    const onTouchMove = (e) => {
      if (!touchActive) return;
      lockUserScroll();
      const y = e.touches?.[0]?.clientY ?? 0;
      if (Math.abs(touchStartY - y) > 4) releaseStickToBottom();
    };
    const onTouchEnd = () => {
      touchActive = false;
      const el = messagesContainerRef.current;
      if (el) {
        shouldStickToBottomRef.current = isNearBottom(el, 120);
      }
      scheduleUserScrollUnlock(headerCompact ? 200 : 160);
    };
    const onWheel = (e) => {
      if (e.deltaY < 0) {
        userInterruptedOpenSnapRef.current = true;
        lockUserScroll();
        releaseStickToBottom();
        cancelOpenSnapPendingRef.current?.();
        scheduleUserScrollUnlock(180);
      }
    };
    const onPointerDown = (e) => {
      const isTouchPointer = !e.pointerType || e.pointerType === "touch";
      const isScrollbarPointer = e.pointerType === "mouse" && e.target === el;
      if (!isTouchPointer && !isScrollbarPointer) return;
      userInterruptedOpenSnapRef.current = true;
      lockUserScroll();
      releaseStickToBottom();
      cancelOpenSnapPendingRef.current?.();
      if (isScrollbarPointer) scheduleUserScrollUnlock(240);
    };
    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(userScrollUnlockTimerRef.current);
    };
  }, [scrollThreadId, releaseStickToBottom, lockUserScroll, scheduleUserScrollUnlock]);

  /*
   * Reancoragem após carregar histórico antigo. Corre em `useLayoutEffect` e sem esperar
   * frames: o lote anterior é prepended no mesmo commit em que `loadingMore` volta a false,
   * e o antigo `rAF(rAF(restore))` deixava 2 frames pintados com o histórico já inserido mas
   * o scroll ainda na posição velha — era esse o salto ao chegar ao topo da conversa.
   * O reajuste tardio (rAF) continua, agora só para acomodar a remedição do virtualizer.
   */
  useLayoutEffect(() => {
    if (loadingMore) return undefined;
    const anchor = loadMoreAnchorRef.current;
    const fallback = loadMoreScrollRef.current;
    const hadCapture =
      anchor != null || (fallback.top !== 0 && fallback.height !== 0);
    if (!hadCapture) return undefined;

    /* Lê o valor do render atual: o ref homónimo só é atualizado num layout effect posterior. */
    const prepended =
      mensagensComSeparadores.length - loadMorePrevSeparatorCountRef.current;
    const el = messagesContainerRef.current;

    const applyAnchor = () => {
      let restored = false;
      if (anchor && prepended > 0 && virtualThreadRef.current?.restoreAfterPrepend) {
        restored = virtualThreadRef.current.restoreAfterPrepend(anchor, prepended) === true;
      }
      if (!restored && el && fallback.height > 0) {
        const diff = el.scrollHeight - fallback.height;
        if (diff > 0) el.scrollTop = fallback.top + diff;
      }
    };

    lockUserScroll();
    applyAnchor();
    loadMoreAnchorRef.current = null;
    loadMoreScrollRef.current = { top: 0, height: 0 };
    scheduleUserScrollUnlock(headerCompact ? 280 : 220);
  }, [loadingMore]);

  /** Mesma estratégia do scroll ao topo: grava âncora antes do `loadMore` para restaurar posição após o lote. */
  const handleLoadOlderMessagesClick = useCallback(() => {
    const st = useConversaStore.getState();
    if (!st.hasMore || st.loadingMore || !st.cursor || st.conversa?.mensagens_bloqueadas) return;
    captureLoadMoreAnchor();
    st.loadAllMessages?.();
  }, [captureLoadMoreAnchor]);

  const handleDropFile = useCallback(
    (file, opts = {}) => {
      if (!file) return;
      openMediaSendPreview(file, opts);
    },
    [openMediaSendPreview]
  );

  const onDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragOver = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dragOver) setDragOver(true);
    },
    [dragOver]
  );

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const file = e.dataTransfer?.files?.[0];
      if (file) handleDropFile(file);
    },
    [handleDropFile]
  );

  const garantirConversaAbertaParaEnvio = useCallback(async () => {
    const atual = useConversaStore.getState().conversa;
    const alvo = atual && String(atual.id) === String(conversaId) ? atual : conversa;
    if (!isClosedAttendance(alvo)) return true;
    try {
      await reabrirConversa(conversaId);
      return true;
    } catch (e) {
      showToast({
        type: "error",
        title: "Erro ao reabrir",
        message: e?.response?.data?.error || e?.message || "Tente novamente.",
      });
      return false;
    }
  }, [conversaId, conversa, reabrirConversa, showToast]);

  const {
    handleEnviarArquivo,
    handleFileInputChange,
    handleCameraInputChange,
    handleFototecaInputChange,
    handleDocumentInputChange,
    handleConfirmSendFile,
    handleConfirmSendImageMobile,
    sendStickerFile,
    handleStickerInputChange,
  } = useConversationOutboundMedia({
    conversaId,
    conversa,
    user,
    podeEnviar,
    showToast,
    debugMessageBoundary,
    clearPending,
    garantirConversaAbertaParaEnvio,
    focusMessageInput,
    reconciliarMensagem,
    marcarMensagemTempErro,
    marcarMensagemEnvioIncerto,
    applyOutboundSendFailure,
    removerMensagemTemp,
    appendOutgoingOptimisticMessage,
    applyOutgoingStatusOptimistic,
    scheduleArquivoSendConsistencyCheck,
    setSendingTracked,
    refresh,
    handleDropFile,
    composerRef,
    arquivoEnvioInFlightRef,
    audioRetryFilesRef,
    enviarAudioQueueRef,
    shouldStickToBottomRef,
    pendingFile,
    pendingPreview,
    pendingCaption,
    pendingSendOptions,
    pendingConversaIdRef,
    confirmSendLockRef,
  });

  const enviarTextoEmAndamentoRef = useRef(false);
  const enviarTextoQueueRef = useRef(Promise.resolve());
  // Mantém a mesma chave idempotente somente para uma nova tentativa explícita do mesmo texto.
  // É memória local de transporte; não altera interface, bolhas, ícones ou fluxos de mídia.
  const manualTextRetryRef = useRef(null);

  const handleEnviar = useCallback(async (forcedText) => {
    if (!conversaId) return;
    if (!podeEnviar) {
      showToast({
        type: "warning",
        title: "Conversa não assumida",
        message: "Clique em Assumir para enviar mensagens.",
      });
      return;
    }

    const forcedLooksLikeEvent =
      forcedText &&
      typeof forcedText === "object" &&
      ("nativeEvent" in forcedText || "preventDefault" in forcedText || "currentTarget" in forcedText);
    const t = safeString(forcedLooksLikeEvent ? undefined : forcedText).trim();
    if (!t) return;
    const conversaAberta = await garantirConversaAbertaParaEnvio();
    if (!conversaAberta) return;
    const socket = getSocket();
    if (socket?.connected) socket.emit("typing_stop", { conversa_id: conversaId });
    const chatParaNome = fromChat ?? conversa;
    const replyMeta = buildReplyMetaForPersist(replyTo, nome, chatParaNome);
    const retryCandidate = manualTextRetryRef.current;
    const isManualRetry =
      retryCandidate &&
      String(retryCandidate.conversaId) === String(conversaId) &&
      retryCandidate.texto === t;
    if (retryCandidate && !isManualRetry) manualTextRetryRef.current = null;

    const optimisticMsg = buildOptimisticOutgoingMessage({
      conversaId,
      texto: t,
      replyMeta: replyMeta || undefined,
      ...(isManualRetry ? { tempId: retryCandidate.tempId } : {}),
    });
    const tempId = optimisticMsg.tempId;
    const revertOutgoingStatus = applyOutgoingStatusOptimistic();
    const revertModoSimples = appendOutgoingOptimisticMessage(optimisticMsg);
    setReplyTo(null);

    const enfileirarOffline = () => {
      enqueueOutboxText({
        conversaId,
        texto: t,
        tempId,
        replyMeta: replyMeta || null,
        criadoEm: optimisticMsg.criado_em,
      });
      marcarMensagemAguardandoConexao(tempId);
      const toastKey = `out-${tempId}-offline`;
      if (shouldShowOutboundToast(toastKey)) {
        showToast({
          type: "warning",
          title: "Aguardando conexão",
          message: "A mensagem ficará visível e será enviada automaticamente quando a internet voltar.",
        });
      }
      // Preserva o tempId para retry manual do mesmo texto, se o usuario insistir.
      manualTextRetryRef.current = { conversaId, texto: t, tempId };
    };

    const runSend = async () => {
      let envioFalhou = false;
      enviarTextoEmAndamentoRef.current = true;
      setSendingTracked(true);
      try {
        // Sem internet: bolha ja esta na tela; persiste e espera reconexao.
        // Nao chama a API (evitaria timeout longo) e nao marca erro.
        if (isBrowserOffline()) {
          enfileirarOffline();
          return;
        }

        const res = await enviarMensagem(
          conversaId,
          t,
          replyMeta || undefined,
          tempId,
          { retryManual: !!isManualRetry }
        );
        // Se chegou resposta, nao ha pendencia offline deste tempId.
        removeFromOutbox(tempId);
        const resMsgId = res?.mensagem?.id ?? res?.id;
        const realMsg = normalizeTextSendApiToMessage(res, conversaId);
        if (realMsg) {
          reconciliarMensagem(tempId, realMsg);
        }
        if (res?.mensagem?.id && replyMeta) {
          saveReplyMeta(conversaId, res.mensagem.id, replyMeta);
        }
        if (res?.ok === false && (resMsgId == null || resMsgId === "")) {
          marcarMensagemTempErro(tempId);
        }
        manualTextRetryRef.current = null;
      } catch (err) {
        envioFalhou = true;
        console.error("Erro ao enviar mensagem:", err);
        const classifiedEarly = classifyOutboundAxiosError(err);
        // Offline puro: a mensagem nunca chegou ao backend. Persistir e manter relogio.
        // Nao reverter status otimista da conversa nem tratar como "incerto".
        if (classifiedEarly.kind === OUTBOUND_ERROR_KIND.OFFLINE || isBrowserOffline()) {
          enfileirarOffline();
          focusMessageInput();
          return;
        }

        revertModoSimples?.();
        revertOutgoingStatus?.();
        const is403 = err?.response?.status === 403;
        const failureData = err?.response?.data;
        const persistedFailure = normalizeTextSendApiToMessage(failureData, conversaId);
        if (persistedFailure) {
          reconciliarMensagem(tempId, persistedFailure);
        }
        const classified = applyOutboundSendFailure(tempId, err, {
          toastTitle: "Falha ao enviar",
          mensagemId: failureData?.id ?? persistedFailure?.id ?? null,
        });
        // Timeout/rede: preserva client_temp_id para reconciliar sem duplicar.
        // Falha confirmada: mesmo texto no próximo clique reutiliza o tempId.
        if (!is403 && (failureData?.id != null || classified.uncertain || !err?.response)) {
          manualTextRetryRef.current = {
            conversaId,
            texto: t,
            tempId,
          };
        } else if (manualTextRetryRef.current?.tempId === tempId) {
          manualTextRetryRef.current = null;
        }
        // Restaura o texto no composer SOMENTE se estiver vazio — se o atendente já
        // continuou digitando um novo rascunho, não sobrescrever/misturar com o texto
        // que falhou (ele fica preservado na bolha de erro, com botão de retry).
        if (!classified.uncertain) {
          const draftAtual = String(composerRef.current?.getText?.() ?? "").trim();
          if (!draftAtual) {
            composerRef.current?.setText?.(t);
          }
          if (replyTo) setReplyTo(replyTo);
        }
        focusMessageInput();
      } finally {
        enviarTextoEmAndamentoRef.current = false;
        setSendingTracked(false);
      }
      if (!envioFalhou) {
        focusMessageInput();
      }
    };

    enviarTextoQueueRef.current = enviarTextoQueueRef.current
      .catch(() => {})
      .then(runSend);
    await enviarTextoQueueRef.current;
  }, [
    conversaId,
    replyTo,
    showToast,
    appendOutgoingOptimisticMessage,
    applyOutgoingStatusOptimistic,
    reconciliarMensagem,
    marcarMensagemTempErro,
    marcarMensagemAguardandoConexao,
    applyOutboundSendFailure,
    nome,
    conversa,
    fromChat,
    podeEnviar,
    garantirConversaAbertaParaEnvio,
    focusMessageInput,
    setSendingTracked,
  ]);

  const {
    pixModalOpen,
    setPixModalOpen,
    pixConfigLoading,
    pixConfigSaving,
    pixActionBusy,
    pixTipoChave,
    setPixTipoChave,
    pixChave,
    setPixChave,
    pixNomeRecebedor,
    setPixNomeRecebedor,
    pixMensagemPadrao,
    setPixMensagemPadrao,
    fetchPixConfigIfNeeded,
    handleSalvarPixConfig,
    handlePixMenuClick,
  } = usePixConfig({
    conversaId,
    sending,
    podeEnviar,
    showToast,
    handleEnviar,
    composerRef,
  });

  const handleThreadReaction = useCallback(
    (msg, reaction) => {
      handleSendReaction(msg, reaction);
      if (compactMessageUx && selectMode && msg?.id && selectedMsgIds?.[String(msg.id)]) {
        exitSelectMode();
      }
    },
    [compactMessageUx, exitSelectMode, handleSendReaction, selectMode, selectedMsgIds]
  );

  const handleThreadRemoveReaction = useCallback(
    (msg) => {
      handleRemoveReaction(msg);
      if (compactMessageUx && selectMode && msg?.id && selectedMsgIds?.[String(msg.id)]) {
        exitSelectMode();
      }
    },
    [compactMessageUx, exitSelectMode, handleRemoveReaction, selectMode, selectedMsgIds]
  );

  const {
    forwardOpen,
    forwardMsgs,
    forwardQuery,
    setForwardQuery,
    forwardSending,
    forwardCandidates,
    forwardClientes,
    forwardClientesLoading,
    forwardColaboradoresFiltered,
    forwardColaboradoresLoading,
    forwardSelectedConversaIds,
    forwardMax10Msg,
    forwardMultiProgress,
    forwardPreviewLabel,
    closeForward,
    openForwardFromSelection,
    toggleForwardConversaSelect,
    confirmForwardToCliente,
    confirmForwardTo,
    confirmForwardToColaborador,
    confirmForwardToMany,
  } = useForwardFlow({
    conversa,
    conversaId,
    user,
    showToast,
    exitSelectMode,
  });

  const handleReplyAction = useCallback((msg) => {
    setReplyTo(msg || null);
    focusMessageInput();
  }, [focusMessageInput]);

  const handleInfoAction = useCallback((msg) => {
    if (!msg) return;
    setMsgInfo(msg);
    setMsgInfoOpen(true);
  }, []);

  const handleCopyResult = useCallback((ok) => {
    showToast({
      type: ok ? "success" : "error",
      title: ok ? "Copiado" : "Falha ao copiar",
      message: ok ? "Mensagem copiada para a área de transferência." : "Não foi possível copiar. Tente novamente.",
    });
  }, [showToast]);

  const handleForwardAction = useCallback((msg) => {
    if (!msg?.id || msg.apagada_para_todos) {
      if (msg?.apagada_para_todos) {
        showToast({
          type: "info",
          title: "Não disponível",
          message: "Não é possível encaminhar uma mensagem apagada.",
        });
      }
      return;
    }
    // Go directly to the forward modal — no intermediate selection step needed
    openForwardFromSelection([String(msg.id)], mensagens);
  }, [showToast, openForwardFromSelection, mensagens]);

  const handleForwardAdvance = useCallback(() => {
    openForwardFromSelection(orderedSelectedIds, mensagens);
  }, [openForwardFromSelection, orderedSelectedIds, mensagens]);

  const handleDeleteForMe = useCallback(
    async (msg) => {
      if (!conversaId || !msg?.id) return;
      const preview = snippetFromMsg(msg).slice(0, 120);
      const isMedia = isRichMediaMessage(msg);
      const ok = window.confirm(
        isMedia
          ? `Ocultar esta mídia só para você?

` +
              `• Ela continua no histórico para os outros atendentes.
` +
              `• Não apaga o arquivo no servidor nem no WhatsApp.

` +
              `Prévia: "${preview || "(mídia)"}"`
          : `Ocultar esta mensagem só para você?

` +
              `Os outros da conversa continuam vendo.

` +
              `Prévia: "${preview || "(sem texto)"}"`
      );
      if (!ok) return;
      try {
        await excluirMensagem(conversaId, msg.id, { scope: "me" });
        removerMensagem(msg.id);
        showToast({ type: "success", title: "Apagada para mim", message: "A mensagem foi removida da sua visualização." });
      } catch (e) {
        console.error("Erro ao apagar pra mim:", e);
        showToast({ type: "error", title: "Falha ao apagar", message: e.response?.data?.error || "Não foi possível apagar a mensagem." });
      }
    },
    [conversaId, showToast, removerMensagem]
  );

  const handleDeleteForEveryone = useCallback(
    async (msg) => {
      if (!conversaId || msg?.apagada_para_todos) return;
      const mid = msg?.id;
      if (mid == null || String(mid).trim() === "") {
        showToast({
          type: "warning",
          title: "Aguarde confirmação",
          message: "Só é possível apagar para todos depois que a mensagem for confirmada pelo servidor.",
        });
        return;
      }
      if (!msg?.whatsapp_id) {
        showToast({
          type: "warning",
          title: "Aguarde confirmacao",
          message: "So e possivel apagar para todos depois que o WhatsApp confirmar a mensagem.",
        });
        return;
      }
      // regra: "para todos" somente para mensagens enviadas por mim
      const souAutor =
        (msg?.autor_usuario_id != null && String(msg.autor_usuario_id) === String(myUserId)) ||
        (msg?.autor_usuario_id == null && isOutgoingMessage(msg));
      if (!myUserId || !souAutor) {
        showToast({
          type: "info",
          title: "Somente suas mensagens",
          message: "Você só pode apagar para todos mensagens enviadas por você.",
        });
        return;
      }
      const pk = String(mid);
      const preview = snippetFromMsg(msg).slice(0, 120);
      const isMedia = isRichMediaMessage(msg);
      const ok = window.confirm(
        isMedia
          ? `Apagar para todos esta mídia?

` +
              `• Só é permitido para mensagens que você enviou.
` +
              `• A conversa passará a mostrar um aviso no lugar da mídia.
` +
              `• A remoção no WhatsApp depende do provedor (UltraMsg).

` +
              `Prévia: "${preview || "(mídia)"}"
(id ${pk})`
          : `Apagar para todos esta mensagem?

"${preview || "(sem texto)"}"

Somente esta mensagem (id ${pk}) será substituída por um aviso.`
      );
      if (!ok) return;
      try {
        const res = await excluirMensagem(conversaId, mid);
        marcarMensagemApagadaParaTodos(mid, { euQueApaguei: true });
        if (res?.texto) {
          useConversaStore.getState().patchMensagem(mid, {
            texto: res.texto,
            apagada_para_todos: true,
            reply_meta: null,
          });
        }
        showToast({
          type: "success",
          title: "Apagada para todos",
          message: "A mensagem foi substituída por um aviso nesta conversa.",
        });
      } catch (e) {
        console.error("Erro ao excluir mensagem:", e);
        const apiMsg = e?.response?.data?.error;
        showToast({
          type: "error",
          title: "Falha ao apagar",
          message: apiMsg || "Não foi possível apagar a mensagem.",
        });
      }
    },
    [conversaId, myUserId, showToast, marcarMensagemApagadaParaTodos]
  );

  const handleDeleteSelected = useCallback(async () => {
    if (!conversaId) return;
    const ids = Array.from(selectedSet);
    if (ids.length === 0) return;
    const ok = window.confirm(`Apagar ${ids.length} mensagem(ns) selecionada(s) do sistema?`);
    if (!ok) return;
    try {
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await excluirMensagem(conversaId, id, { scope: "me" });
      }
      showToast({ type: "success", title: "Apagadas", message: `${ids.length} mensagem(ns) removida(s).` });
      exitSelectMode();
    } catch (e) {
      console.error("Erro ao excluir selecionadas:", e);
      showToast({ type: "error", title: "Falha ao apagar", message: "Algumas mensagens podem não ter sido apagadas." });
    }
  }, [conversaId, selectedSet, exitSelectMode, showToast]);

  const flashMessageById = useCallback((msgId) => {
    if (!msgId) return;
    const escaped =
      typeof CSS !== "undefined" && CSS.escape
        ? CSS.escape(String(msgId))
        : String(msgId).replace(/"/g, '\\"');
    const el = document.querySelector(`[data-msg-id="${escaped}"]`);
    if (!el) return;
    el.classList.remove("highlight-reply");
    void el.offsetWidth;
    el.classList.add("highlight-reply");
    window.setTimeout(() => el.classList.remove("highlight-reply"), 1700);
  }, []);

  const scrollToMsg = useCallback((msgId) => {
    if (!msgId) return;
    const scrollBehavior = headerCompact ? "auto" : "smooth";
    const list = mensagensComSeparadoresRef.current;
    const idx = list.findIndex((it) => it && it.__type === "msg" && String(it.id) === String(msgId));
    if (idx >= 0 && virtualThreadRef.current?.scrollToIndex) {
      virtualThreadRef.current.scrollToIndex(idx, { align: "center", behavior: scrollBehavior });
      window.setTimeout(() => flashMessageById(msgId), 260);
      return;
    }
    const escaped =
      typeof CSS !== "undefined" && CSS.escape
        ? CSS.escape(String(msgId))
        : String(msgId).replace(/"/g, '\\"');
    const el = document.querySelector(`[data-msg-id="${escaped}"]`);
    el?.scrollIntoView?.({ behavior: scrollBehavior, block: "center" });
    window.setTimeout(() => flashMessageById(msgId), 260);
  }, [flashMessageById, headerCompact]);

  const {
    messageSearchOpen,
    setMessageSearchOpen,
    openMessageSearch,
    closeMessageSearch,
    handleSelectMessageSearchResult,
  } = useConversationSearch({ conversaId, headerCompact, scrollToMsg, showToast });

  const jumpToReply = useCallback((replyToId) => {
    const rid = safeString(replyToId);
    if (!rid) return;

    const list = Array.isArray(mensagens) ? mensagens : [];
    const byWaId = list.find((m) => safeString(m?.whatsapp_id) && String(m.whatsapp_id) === rid);
    if (byWaId?.id) return scrollToMsg(byWaId.id);

    // fallback: se veio id numérico do banco
    if (/^\d{1,15}$/.test(rid)) return scrollToMsg(rid);

    showToast({
      type: "info",
      title: "Mensagem não encontrada",
      message: "A mensagem respondida não está carregada neste histórico.",
    });
  }, [mensagens, scrollToMsg, showToast]);

  /** Fecha modal de encaminhar (se aberto) e sai do modo seleção — botão X estilo WhatsApp. */
  const dismissSelectionOverlay = useCallback(() => {
    closeForward();
    exitSelectMode();
  }, [closeForward, exitSelectMode]);

  const onEscape = useCallback(() => {
    /* Cascata: 1 overlay/menu por ESC; sem overlay, sai só da conversa (sem alterar status). */
    // Passos imperativos do Composer primeiro (checam e fecham no mesmo passo).
    if (composerRef.current?.isRecording?.()) {
      composerRef.current?.cancelRecording?.();
      return;
    }
    if (composerRef.current?.closePanels?.()) return;

    const handled = runFirstActiveEscape(
      buildEscapeEntries(
        {
          mediaViewer,
          pendingFile,
          shareContactOpen,
          shareLocationOpen,
          pixModalOpen,
          msgInfoOpen,
          showTransferirSetor,
          showProdutosPanel,
          showClienteSide,
          showTimeline,
          tagsOpen,
          forwardOpen,
          selectMode,
          replyTo,
          messageSearchOpen,
        },
        {
          closeMediaViewer,
          clearPending,
          closeShareContact: handleShareContactClose,
          closeShareLocation: handleShareLocationClose,
          closePixModal: () => setPixModalOpen(false),
          closeMsgInfo: () => {
            setMsgInfoOpen(false);
            setMsgInfo(null);
          },
          closeTransferirSetor: () => setShowTransferirSetor(false),
          closeProdutosPanel: () => setShowProdutosPanel(false),
          closeClienteSide: () => setShowClienteSide(false),
          closeTimeline: () => setShowTimeline(false),
          closeTags: () => setTagsOpen(false),
          dismissSelectionOverlay,
          clearReply: () => setReplyTo(null),
          closeMessageSearch: () => setMessageSearchOpen(false),
        }
      )
    );
    if (handled) return;

    closeSelectedConversation({ preferHistoryBack: headerCompact });
  }, [
    mediaViewer,
    closeMediaViewer,
    pendingFile,
    clearPending,
    shareContactOpen,
    handleShareContactClose,
    shareLocationOpen,
    handleShareLocationClose,
    pixModalOpen,
    msgInfoOpen,
    showTransferirSetor,
    showProdutosPanel,
    showClienteSide,
    showTimeline,
    tagsOpen,
    forwardOpen,
    selectMode,
    dismissSelectionOverlay,
    replyTo,
    messageSearchOpen,
    setMessageSearchOpen,
    setShowTimeline,
    headerCompact,
  ]);

  useGlobalHotkeys({
    onToggleTimeline: () => setShowTimeline((v) => !v),
    onFocusInput: focusMessageInput,
    onEscape,
    disabled: loading,
  });

  const contactConversationOpeningRef = useRef(false);
  const handleConversarContact = useCallback(
    async (meta) => {
      if (!meta?.telefone) {
        showToast({ type: "warning", title: "Telefone indisponível", message: "Este contato não possui número para iniciar conversa." });
        return;
      }
      if (contactConversationOpeningRef.current) return;
      contactConversationOpeningRef.current = true;
      try {
        const whatsappInstanceId = resolveWhatsappInstanceIdForSharedContact(
          meta,
          conversa,
          fromChat
        );
        const data = await abrirConversaPorTelefone(
          meta.nome || "Contato",
          meta.telefone,
          whatsappInstanceId
        );
        const conv = data?.conversa ?? conversaFromContatoResponse(data) ?? null;
        if (!conv?.id) throw new Error("Não foi possível abrir a conversa.");
        try { useChatStore.getState().addChat(conv); } catch {}
        // carregarConversa faz a troca atômica: sai da sala socket anterior, seleciona e carrega
        // a conversa nova. Chamar setSelectedId antes perdia o ID anterior e mantinha a sala antiga.
        await carregarConversa(conv.id);
        const openedState = useConversaStore.getState();
        if (String(openedState.selectedId ?? "") !== String(conv.id)) {
          throw new Error("A conversa foi localizada, mas não pôde ser exibida.");
        }
        if (openedState.loadError) throw new Error(openedState.loadError);
        showToast({ type: "success", title: "Conversa aberta", message: `Conversa com ${meta.nome || "contato"} iniciada.` });
      } catch (e) {
        console.error("Erro ao abrir conversa do contato:", e);
        showToast({
          type: "error",
          title: "Falha ao abrir conversa",
          message: e.response?.data?.error || e.response?.data?.erro || e.message || "Não foi possível abrir a conversa com este contato.",
        });
      } finally {
        contactConversationOpeningRef.current = false;
      }
    },
    [showToast, carregarConversa, conversa?.whatsapp_instance_id, fromChat?.whatsapp_instance_id]
  );

  useEffect(() => {
    clearPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaId]);

  const mensagensComSeparadores = useMemo(
    () => buildMensagensComSeparadores(mensagens, isGroup),
    [mensagens, isGroup]
  );
  const hasThreadMessageRows = useMemo(
    () => mensagensComSeparadores.some((item) => item?.__type === "msg"),
    [mensagensComSeparadores]
  );

  useLayoutEffect(() => {
    mensagensComSeparadoresRef.current = mensagensComSeparadores;
  }, [mensagensComSeparadores]);

  useLayoutEffect(() => {
    if (!threadOpening || !openingThreadKey) return undefined;
    /*
     * A máscara só cai quando o snap de abertura assenta (onOpenSnapReady).
     * Este timeout evita thread invisível se o snap não disparar.
     */
    const fallback = window.setTimeout(() => setThreadOpening(false), 1000);
    return () => window.clearTimeout(fallback);
  }, [threadOpening, openingThreadKey]);

  useEffect(() => {
    if (!import.meta?.env?.DEV) return;
    console.debug("[message-boundary] render_conversation", {
      conversa_id: conversaId,
      mensagens_filtradas: Array.isArray(mensagens) ? mensagens.length : 0,
    });
  }, [conversaId, mensagens.length]);

  const {
    showAssumeEmptyCta,
    showMarcarLidaModoSimplesBar,
    marcarLidaModoSimplesBusy,
    handleMarcarLidaModoSimples,
    assumeEmptyBusy,
    reopenClosedBusy,
    oldContactSyncBusy,
    showReopenClosedCta,
    showContactOldSyncCta,
    showLidPhoneMissingHint,
    handleAssumeEmpty,
    handleReopenClosed,
    handleCarregarMensagensAntigasContato,
  } = useConversationThreadActions({
    conversa,
    conversaId,
    isGroup,
    user,
    modoSimplesAtivo,
    conversaModoSimplesUi,
    isLidValue,
    assumirConversa,
    reabrirConversa,
    refresh,
    showToast,
  });

  const handleComposerAppendConsumed = useCallback(() => {
    clearComposerAppendQueue();
  }, [clearComposerAppendQueue]);

  const handleComposerCancelReply = useCallback(() => setReplyTo(null), []);

  const handleComposerPasteImage = useCallback(
    (file) => handleDropFile(file),
    [handleDropFile]
  );

  const handleComposerSendAudio = useCallback(
    (file) => handleEnviarArquivo(file, { tipo: "voice", enqueueAudio: true }),
    [handleEnviarArquivo]
  );

  const handleAdicionarNotaInterna = useCallback(
    async (texto) => {
      if (!conversaId) return;
      try {
        await criarNotaInterna(conversaId, texto);
      } catch (e) {
        const dbg = e?.response?.data;
        console.error("[notaInterna] 500 debug:", dbg);
        showToast({
          type: "error",
          title: "Erro ao salvar nota",
          message: dbg?._debug || dbg?.error || "Tente novamente.",
        });
      }
    },
    [conversaId, showToast]
  );

  /**
   * Reenvio manual seguro: reutiliza mensagem_id (texto ou mídia).
   * Não cria bolha/registro novos; CAS no backend impede clique duplo / dois atendentes.
   */
  const reenviarMensagemFalha = useCallback(
    async ({ mensagemId, tempId, kind } = {}) => {
      const mid = Number(mensagemId);
      if (!Number.isSafeInteger(mid) || mid <= 0 || !conversaId) {
        showToast({
          type: "warning",
          title: "Não é possível reenviar",
          message: "Esta mensagem não foi salva no servidor.",
        });
        return;
      }

      const retryKey = String(mid);
      if (audioRetryRequestInFlightRef.current.has(retryKey)) return;
      audioRetryRequestInFlightRef.current.add(retryKey);

      const store = useConversaStore.getState();
      store.patchMensagem(
        mid,
        {
          status: "sending",
          status_mensagem: "sending",
          em_retry: true,
          envio_erro: false,
          envio_incerto: false,
          tempId: tempId || undefined,
        },
        { conversa_id: conversaId }
      );

      try {
        const isText = kind === "text";
        const data = isText
          ? await reenviarTextoFalha(conversaId, mid)
          : await reenviarMidiaFalha(conversaId, mid);

        const realMsg = data?.mensagem
          ? { ...data.mensagem, em_retry: false, envio_erro: false }
          : data?.id != null
            ? {
                id: data.id,
                status: data.status,
                status_mensagem: data.status_mensagem || data.status,
                whatsapp_id: data.whatsapp_id,
                client_temp_id: data.client_temp_id,
                em_retry: false,
                envio_erro: false,
              }
            : null;

        // Sucesso / already_sent: atualiza a mesma bolha. Sem toast verde — ticks bastam.
        if (data?.ok === false && !realMsg) {
          throw Object.assign(new Error(data?.error || data?.motivo || "Falha ao reenviar"), {
            response: { status: 502, data },
          });
        }

        if (realMsg && tempId) {
          reconciliarMensagem(String(tempId), { ...realMsg, id: realMsg.id ?? mid });
        } else if (realMsg?.id != null || mid) {
          store.patchMensagem(
            realMsg?.id ?? mid,
            {
              ...(realMsg || {}),
              status: realMsg?.status || data?.status || "sending",
              status_mensagem: realMsg?.status_mensagem || data?.status_mensagem || data?.status || "sending",
              em_retry: false,
              envio_erro: false,
            },
            { conversa_id: conversaId }
          );
        } else {
          await refresh({ silent: true });
        }
        if (tempId) audioRetryFilesRef.current.delete(String(tempId));
        if (data?.ok === false) {
          showToast({
            type: "error",
            title: "Falha ao reenviar",
            message: data?.error || data?.motivo || "Não foi possível reenviar.",
          });
        }
      } catch (err) {
        const httpSt = Number(err?.response?.status) || 0;
        const apiMsg = err?.response?.data?.error || err?.message || "Não foi possível reenviar.";
        // 409: outra tentativa em andamento ou já resolvida — não forçar erro local.
        if (httpSt === 409) {
          await refresh({ silent: true });
          showToast({
            type: "warning",
            title: "Reenvio em andamento",
            message: apiMsg,
          });
          return;
        }
        const bodyMsg = err?.response?.data?.mensagem;
        if (bodyMsg?.id != null) {
          store.patchMensagem(
            bodyMsg.id,
            { ...bodyMsg, status: "erro", status_mensagem: "erro", em_retry: false, envio_erro: true, erro_mensagem: apiMsg },
            { conversa_id: conversaId }
          );
        } else if (tempId) {
          marcarMensagemTempErro(String(tempId), { mensagem_id: mid, erro_mensagem: apiMsg });
        } else {
          store.patchMensagem(
            mid,
            { status: "erro", status_mensagem: "erro", em_retry: false, envio_erro: true, erro_mensagem: apiMsg },
            { conversa_id: conversaId }
          );
        }
        showToast({
          type: "error",
          title: "Falha ao reenviar",
          message: apiMsg,
        });
      } finally {
        audioRetryRequestInFlightRef.current.delete(retryKey);
      }
    },
    [conversaId, marcarMensagemTempErro, reconciliarMensagem, refresh, showToast]
  );

  /** Compat: áudio antigo chama o mesmo fluxo de mídia. */
  const reenviarAudioFalho = useCallback(
    (payload) => reenviarMensagemFalha({ ...payload, kind: "media" }),
    [reenviarMensagemFalha]
  );

  const handleComposerOpenPixConfig = useCallback(async () => {
    await fetchPixConfigIfNeeded();
    setPixModalOpen(true);
  }, [fetchPixConfigIfNeeded]);

  const handleCloseMsgInfo = useCallback(() => {
    setMsgInfoOpen(false);
    setMsgInfo(null);
  }, []);

  const handleClosePixModal = useCallback(() => {
    if (!pixConfigSaving) setPixModalOpen(false);
  }, [pixConfigSaving]);

  const mensagensBloqueadasHint = Boolean(conversa?.mensagens_bloqueadas);
  const atendimentoEncerradoHint = !modoSimplesAtivo && !isGroup && isClosedAttendance(conversa);
  const atendenteNomeHint = conversa?.atendente_nome ?? "";
  const maskThreadOpening = threadOpening && !loading;

  /* Só tela cheia sem shell; com header da lista o thread mostra “Carregando mensagens…” inline. */
  if (!headerCompact && loading && !conversa) {
    return <ConversaLoadingScreen />;
  }

  if (!conversa) {
    if (selectedId && loadError) {
      return (
        <div className="wa-empty">
          <div className="wa-empty-card">
            <div className="wa-empty-title">Não foi possível abrir a conversa</div>
            <div className="wa-empty-sub">
              {loadError || "Selecione outra na lista ou tente novamente."}
            </div>
            <button
              type="button"
              className="wa-btn wa-btn-primary"
              style={{ marginTop: 12 }}
              onClick={() => carregarConversa(selectedId)}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="wa-empty">
        <EmptyState
          title="Selecione uma conversa"
          description="Abra uma conversa na lista à esquerda para visualizar e responder às mensagens."
        />
      </div>
    );
  }

  return (
    <div ref={waShellRef} className="wa-shell" onDragEnter={onDragEnter}>
        <ConversaDropOverlay
          open={dragOver}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        />


        <ConversaHeader
          headerRef={waHeaderRef}
          onBack={handleBackToList}
          isGroup={isGroup}
          headerCompact={headerCompact}
          headerAtendCompact={headerAtendCompact}
          headerCrmAtivoLayout={headerCrmAtivoLayout}
          nome={nome}
          avatar={avatar}
          avatarUrl={avatarUrl}
          showAvatarImg={showAvatarImg}
          onAvatarError={handleHeaderAvatarError}
          onAvatarClick={onHeaderAvatarClick}
          badge={badge}
          showPagamentoConcluidoBadge={showPagamentoConcluidoBadge}
          encerramentoAusenciaHint={encerramentoAusenciaHint}
          setorAtual={setorAtual}
          podeTransferirSetor={podeTransferirSetor}
          onOpenTransferirSetor={handleOpenTransferirSetor}
          podeVerAtendentes={podeVerAtendentes}
          totalAtendentes={totalAtendentes}
          onOpenAtendentes={handleOpenAdicionarAtendente}
          isSomeoneTyping={isSomeoneTyping}
          podeGerenciarTags={podeGerenciarTags}
          tagsOpen={tagsOpen}
          onToggleTagPanel={handleToggleTagPanel}
          conversaId={conversaId}
          showTimeline={showTimeline}
          onToggleTimeline={toggleTimeline}
          mostrarEnviarCrm={mostrarEnviarCrm}
          sendCrmRef={sendCrmRef}
          canConsultarProdutos={canConsultarProdutos}
          showProdutosPanel={showProdutosPanel}
          onOpenProdutosPanel={handleOpenProdutosPanel}
          onOpenClienteSide={handleOpenClienteSide}
          onOpenMessageSearch={openMessageSearch}
          whatsappInstanceLabel={whatsappInstanceLabel}
        />

        <ConversaViewOverlays
          toast={toast}
          onToastClose={() => setToast(null)}
          messageSearchOpen={messageSearchOpen}
          conversaId={conversaId}
          closeMessageSearch={closeMessageSearch}
          handleSelectMessageSearchResult={handleSelectMessageSearchResult}
          isGroup={isGroup}
          podeTransferirSetor={podeTransferirSetor}
          showTransferirSetor={showTransferirSetor}
          departamentos={departamentos}
          conversa={conversa}
          transferirSetorLoading={transferirSetorLoading}
          setShowTransferirSetor={setShowTransferirSetor}
          handleTransferirSetor={handleTransferirSetor}
          handleRemoverSetor={handleRemoverSetor}
          atendentesModalOpen={atendentesModalOpen}
          atendentesParticipantes={atendentesParticipantes}
          podeAdicionarAtendente={podeAdicionarAtendente}
          setAtendentesModalOpen={setAtendentesModalOpen}
          reloadAtendentes={reloadAtendentes}
          podeGerenciarTags={podeGerenciarTags}
          tagsOpen={tagsOpen}
          allTags={allTags}
          tagsLoading={tagsLoading}
          selectedTagIds={selectedTagIds}
          tagMutatingId={tagMutatingId}
          handleToggleTagPanel={handleToggleTagPanel}
          handleToggleTag={handleToggleTag}
          showClienteSide={showClienteSide}
          setShowClienteSide={setShowClienteSide}
          tags={tags}
          tempoSemResponder={tempoSemResponder}
          refresh={refresh}
          forwardOpen={forwardOpen}
          forwardMsgs={forwardMsgs}
          forwardPreviewLabel={forwardPreviewLabel}
          forwardQuery={forwardQuery}
          setForwardQuery={setForwardQuery}
          forwardSending={forwardSending}
          forwardSelectedConversaIds={forwardSelectedConversaIds}
          forwardMax10Msg={forwardMax10Msg}
          forwardMultiProgress={forwardMultiProgress}
          forwardColaboradoresLoading={forwardColaboradoresLoading}
          forwardColaboradoresFiltered={forwardColaboradoresFiltered}
          forwardCandidates={forwardCandidates}
          forwardClientesLoading={forwardClientesLoading}
          forwardClientes={forwardClientes}
          closeForward={closeForward}
          confirmForwardToColaborador={confirmForwardToColaborador}
          toggleForwardConversaSelect={toggleForwardConversaSelect}
          confirmForwardTo={confirmForwardTo}
          confirmForwardToCliente={confirmForwardToCliente}
          confirmForwardToMany={confirmForwardToMany}
          pixModalOpen={pixModalOpen}
          pixTipoChave={pixTipoChave}
          pixChave={pixChave}
          pixNomeRecebedor={pixNomeRecebedor}
          pixMensagemPadrao={pixMensagemPadrao}
          pixConfigSaving={pixConfigSaving}
          pixConfigLoading={pixConfigLoading}
          handleClosePixModal={handleClosePixModal}
          setPixTipoChave={setPixTipoChave}
          setPixChave={setPixChave}
          setPixNomeRecebedor={setPixNomeRecebedor}
          setPixMensagemPadrao={setPixMensagemPadrao}
          handleSalvarPixConfig={handleSalvarPixConfig}
          msgInfoOpen={msgInfoOpen}
          msgInfo={msgInfo}
          handleCloseMsgInfo={handleCloseMsgInfo}
          mediaViewer={mediaViewer}
          mediaPdfBlobUrl={mediaPdfBlobUrl}
          mediaPdfLoading={mediaPdfLoading}
          mediaPdfError={mediaPdfError}
          mediaPrintLoading={mediaPrintLoading}
          mediaViewerImgRef={mediaViewerImgRef}
          mediaViewerVideoRef={mediaViewerVideoRef}
          closeMediaViewer={closeMediaViewer}
          handleMediaViewerPrint={handleMediaViewerPrint}
          shareContactOpen={shareContactOpen}
          shareContactQuery={shareContactQuery}
          setShareContactQuery={setShareContactQuery}
          shareContactList={shareContactList}
          shareContactLoading={shareContactLoading}
          shareContactSending={shareContactSending}
          handleShareContactClose={handleShareContactClose}
          handleShareContactSelect={handleShareContactSelect}
          shareLocationOpen={shareLocationOpen}
          shareLocationGeoLoading={shareLocationGeoLoading}
          shareLocationGeoError={shareLocationGeoError}
          shareLocationLat={shareLocationLat}
          shareLocationLng={shareLocationLng}
          shareLocationNome={shareLocationNome}
          shareLocationEndereco={shareLocationEndereco}
          shareLocationSending={shareLocationSending}
          handleShareLocationClose={handleShareLocationClose}
          setShareLocationLat={setShareLocationLat}
          setShareLocationLng={setShareLocationLng}
          setShareLocationNome={setShareLocationNome}
          setShareLocationEndereco={setShareLocationEndereco}
          handleEnviarLocalizacao={handleEnviarLocalizacao}
          showProdutosPanel={showProdutosPanel}
          canConsultarProdutos={canConsultarProdutos}
          setShowProdutosPanel={setShowProdutosPanel}
          canVerSyncProdutos={canVerSyncProdutos}
          canSincronizarProdutos={canSincronizarProdutos}
          showToast={showToast}
          queueComposerAppend={queueComposerAppend}
          addToGroupModal={addToGroupModal}
          addToGroupGrupos={addToGroupGrupos}
          addToGroupLoading={addToGroupLoading}
          addToGroupSending={addToGroupSending}
          closeAddToGroupModal={closeAddToGroupModal}
          confirmAddToGroup={confirmAddToGroup}
          callModalOpen={callModalOpen}
          callDuration={callDuration}
          callSending={callSending}
          setCallModalOpen={setCallModalOpen}
          handleCallDurationChange={handleCallDurationChange}
          handleCallConfirm={handleCallConfirm}
        />

        {/* TIMELINE */}
        <ConversaTimelinePanel
          open={showTimeline}
          atendimentos={atendimentos}
          atendimentosLoading={atendimentosLoading}
          conversa={conversa}
          onClose={handleCloseTimeline}
        />

        {/* MENSAGENS */}
        <div
          ref={messagesContainerRef}
          className={[
            "wa-messages",
            selectMode ? "wa-messages--selectDim" : "",
            maskThreadOpening ? "wa-messages--opening" : "",
          ].filter(Boolean).join(" ")}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragLeave={onDragLeave}
          role="log"
          aria-label="Mensagens"
        >
          <ConversaSelectionBar
            open={selectMode}
            forwardSelectIntent={forwardSelectIntent}
            compactMessageUx={compactMessageUx}
            selectedCount={selectedSet.size}
            forwardSending={forwardSending}
            onDismiss={dismissSelectionOverlay}
            onForward={handleForwardAdvance}
            onDelete={handleDeleteSelected}
          />
          {!selectMode && showMarcarLidaModoSimplesBar ? (
            <div className="wa-modoSimplesLidaBar">
              <button
                type="button"
                className="wa-modoSimplesLidaBar-btn"
                onClick={() => void handleMarcarLidaModoSimples()}
                disabled={marcarLidaModoSimplesBusy}
                aria-label="Marcar conversa como lida"
              >
                {marcarLidaModoSimplesBusy ? "Marcando…" : "Marcar como lida"}
              </button>
            </div>
          ) : null}
          {!selectMode && pinnedTop ? (
            <div className="wa-pinBar" role="button" tabIndex={0} onClick={() => scrollToMsg(pinnedTop.id)}>
              <span className="wa-pinBar-ic" aria-hidden="true">📌</span>
              <span className="wa-pinBar-text">Fixada: {snippetFromMsg(pinnedTop)}</span>
              <span className="wa-pinBar-hint">Ver</span>
            </div>
          ) : null}

          <ConversaThread
            virtualThreadRef={virtualThreadRef}
            messagesContainerRef={messagesContainerRef}
            scrollThreadId={scrollThreadId}
            conversaId={conversaId}
            headerCompact={headerCompact}
            mensagensComSeparadores={mensagensComSeparadores}
            mensagens={mensagens}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            cursor={cursor}
            conversa={conversa}
            showAssumeEmptyCta={showAssumeEmptyCta}
            assumeEmptyBusy={assumeEmptyBusy}
            onAssumeEmpty={handleAssumeEmpty}
            showReopenClosedCta={showReopenClosedCta}
            reopenClosedBusy={reopenClosedBusy}
            onReopenClosed={handleReopenClosed}
            showContactOldSyncCta={showContactOldSyncCta}
            showLidPhoneMissingHint={showLidPhoneMissingHint}
            contactOldSyncBusy={oldContactSyncBusy || loadingMore}
            onContactOldSync={handleCarregarMensagensAntigasContato}
            onLoadOlderMessagesClick={handleLoadOlderMessagesClick}
            onVirtualContentResize={snapIfStickBottom}
            BubbleComponent={Bubble}
            zapSeenMsgKeysRef={zapSeenMsgKeysRef}
            zapMsgsInitialPassRef={zapMsgsInitialPassRef}
            isGroup={isGroup}
            avatarUrl={avatarUrl}
            nome={nome}
            selectMode={selectMode}
            forwardSelectIntent={forwardSelectIntent}
            selectedSet={selectedSet}
            pinnedSet={pinnedSet}
            starredSet={starredSet}
            localReactions={localReactions}
            reactionLoading={reactionLoading}
            myUserId={myUserId}
            mostrarNomeAoCliente={user?.mostrar_nome_ao_cliente !== false}
            swipeReplyEnabled={headerCompact && !selectMode}
            compactMessageUx={compactMessageUx}
            onToggleSelected={toggleSelected}
            onInfo={handleInfoAction}
            onReply={handleReplyAction}
            onCopy={handleCopyResult}
            onForward={handleForwardAction}
            onTogglePin={togglePin}
            onToggleStar={toggleStar}
            onStartSelect={startSelect}
            onDeleteForMe={handleDeleteForMe}
            onDeleteForEveryone={handleDeleteForEveryone}
            onJumpToReply={jumpToReply}
            onOpenMedia={openMediaViewer}
            onReenviarAudio={reenviarAudioFalho}
            onReenviarFalha={reenviarMensagemFalha}
            onReact={handleThreadReaction}
            onRemoveReaction={handleThreadRemoveReaction}
            onConversarContact={handleConversarContact}
            onAdicionarGrupoContact={handleAdicionarGrupoContact}
          />

          <div ref={bottomRef} />
        </div>

        <PendingMediaPreview
          pendingFile={pendingFile}
          pendingPreview={pendingPreview}
          pendingCaption={pendingCaption}
          onCaptionChange={setPendingCaption}
          sending={sending}
          headerCompact={headerCompact}
          rootRef={mediaPreviewRootRef}
          captionRef={pendingCaptionRef}
          onCancel={clearPending}
          onConfirmSendFile={handleConfirmSendFile}
          onConfirmSendImageMobile={handleConfirmSendImageMobile}
        />

        <ConversaComposer
          ref={composerRef}
          conversaId={conversaId}
          departamentoId={conversa?.departamento_id ?? null}
          scrollThreadId={scrollThreadId}
          loading={loading}
          sending={sending}
          podeEnviar={podeEnviar}
          autoAssumirHint={!modoSimplesAtivo && conversaElegivelAutoAssumir}
          mensagensBloqueadasHint={mensagensBloqueadasHint}
          atendimentoEncerradoHint={atendimentoEncerradoHint}
          atendenteNomeHint={atendenteNomeHint}
          headerCompact={headerCompact}
          composerEnterInsertsNewline={composerEnterInsertsNewline}
          autocorrectToggleInMenu={autocorrectToggleInMenu}
          user={user}
          replyBarPreview={replyBarPreview}
          onCancelReply={handleComposerCancelReply}
          onSendMessage={handleEnviar}
          onSendAudioFile={handleComposerSendAudio}
          onPasteImageFile={handleComposerPasteImage}
          onFileInputChange={handleFileInputChange}
          onFototecaInputChange={handleFototecaInputChange}
          onDocumentInputChange={handleDocumentInputChange}
          onCameraInputChange={handleCameraInputChange}
          onCameraCaptureFile={handleDropFile}
          onStickerInputChange={handleStickerInputChange}
          onSendStickerFile={sendStickerFile}
          onPixMenuClick={handlePixMenuClick}
          onOpenPixConfig={handleComposerOpenPixConfig}
          onShareContact={openShareContact}
          onShareLocation={openShareLocation}
          pixActionBusy={pixActionBusy}
          pixConfigLoading={pixConfigLoading}
          appendTextQueue={composerAppendQueue}
          onAppendConsumed={handleComposerAppendConsumed}
          onAppendTextApplied={handleComposerAppendApplied}
          onTextMetrics={handleComposerTextMetrics}
          showScrollToRecent={showScrollToRecent}
          onScrollToRecent={handleScrollToRecent}
          onRecordingStateChange={handleRecordingStateChange}
          clearTyping={clearTyping}
          showToast={showToast}
          podeAnotar={podeAnotar}
          onSendInternalNote={handleAdicionarNotaInterna}
        />

    </div>
  );
}

/** Gate leve: não monta o painel pesado durante loading (crítico no mobile + aba Todas). */
export default function ConversaView() {
  const { loading, selectedId, conversa, loadError, carregarConversa } = useConversaStore(
    (s) => ({
      loading: s.loading,
      selectedId: s.selectedId,
      conversa: s.conversa,
      loadError: s.loadError,
      carregarConversa: s.carregarConversa,
    }),
    shallow
  );
  const headerCompact = useMatchMedia("(max-width: 640px)");

  if (headerCompact && (selectedId == null || selectedId === "")) {
    return null;
  }

  if (headerCompact && loadError && !loading) {
      return (
      <div className="wa-empty">
        <div className="wa-empty-card">
          <div className="wa-empty-title">Não foi possível abrir a conversa</div>
          <div className="wa-empty-sub">
            {loadError || "Selecione outra na lista ou tente novamente."}
          </div>
          <button
            type="button"
            className="wa-btn wa-btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => carregarConversa(selectedId)}
          >
            Tentar novamente
          </button>
        </div>
      </div>
      );
  }

  /* conversa já vem da lista no carregarConversa — monta o painel e mostra "Carregando mensagens…" no thread. */
  if (headerCompact && loading && !conversa) {
    return <ConversaLoadingScreen />;
  }

  return <ConversaViewBody />;
}
