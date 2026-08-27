import {
  forwardRef,
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { clearComposerDraft } from "../composerDraftStore";
import {
  WA_INPUT_FALLBACK_MAX_HEIGHT_PX,
  isImageFile,
  safeString,
} from "./utils/composerUtils";
import { composerPropsAreEqual } from "./utils/composerPropsAreEqual";
import ReplyBar from "./components/ReplyBar";
import ComposerFooter from "./components/ComposerFooter";
import { useComposerDraft } from "./hooks/useComposerDraft";
import { useTypingEmitter } from "./hooks/useTypingEmitter";
import { useSavedReplies } from "./hooks/useSavedReplies";
import { useAttachmentPicker } from "./hooks/useAttachmentPicker";
import { useEmojiPicker } from "./hooks/useEmojiPicker";
import { useStickerPicker } from "./hooks/useStickerPicker";
import { useComposerAutocorrect } from "./hooks/useComposerAutocorrect";
import { useVoiceRecording } from "./hooks/useVoiceRecording";
import { getComposerEnterIntent } from "./utils/composerKeyboard";

const CameraCapture = lazy(() => import("./components/CameraCapture"));
const EmojiPicker = lazy(() => import("./components/EmojiPicker"));
const SavedRepliesPanel = lazy(() => import("./components/SavedRepliesPanel"));
const StickerPicker = lazy(() => import("./components/StickerPicker"));

/**
 * Área de digitação (composer) — estado de texto isolado para não re-renderizar o thread a cada tecla.
 */
const ConversaComposer = forwardRef(function ConversaComposer(
  {
    conversaId,
    departamentoId,
    scrollThreadId,
    loading,
    sending,
    podeEnviar,
    autoAssumirHint,
    mensagensBloqueadasHint,
    atendimentoEncerradoHint,
    atendenteNomeHint,
    headerCompact,
    composerEnterInsertsNewline,
    autocorrectToggleInMenu,
    user,
    replyBarPreview,
    onCancelReply,
    onSendMessage,
    onSendAudioFile,
    onPasteImageFile,
    onFileInputChange,
    onFototecaInputChange,
    onDocumentInputChange,
    onCameraInputChange,
    onCameraCaptureFile,
    onStickerInputChange,
    onSendStickerFile,
    onPixMenuClick,
    onOpenPixConfig,
    onShareContact,
    onShareLocation,
    onUpdateAutoCorrectPreference,
    pixActionBusy,
    pixConfigLoading,
    appendTextQueue,
    onAppendConsumed,
    onAppendTextApplied,
    onTextMetrics,
    clearTyping,
    showToast,
    showScrollToRecent = false,
    onScrollToRecent,
    onRecordingStateChange,
    podeAnotar = false,
    onSendInternalNote,
  },
  ref
) {
  const { texto, setTexto, textoRef } = useComposerDraft(conversaId);
  const [notaInternaAtiva, setNotaInternaAtiva] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const modePickerRef = useRef(null);
  const draftDoOutroModoRef = useRef("");

  const inputRef = useRef(null);
  const prevTextLenRef = useRef(0);
  const prevTextConversaRef = useRef(null);
  // Trava síncrona contra double-submit (Enter duplo ou clique duplo antes do re-render do React).
  // Guarda o texto submetido para liberar assim que o utilizador começar o próximo rascunho,
  // sem precisar aguardar a resposta HTTP da mensagem anterior.
  const sendLockedRef = useRef(null);

  const voiceRecording = useVoiceRecording({
    conversaId,
    podeEnviar,
    onSendAudioFile,
    onRecordingStateChange,
    showToast,
  });
  const {
    isRecording,
    recordingSeconds,
    startRecording: handleStartRecording,
    stopRecording: handleStopRecording,
    cancelRecording: handleCancelRecording,
  } = voiceRecording;

  const { emitTypingStop } = useTypingEmitter({
    conversaId,
    texto,
    disabled: notaInternaAtiva,
    clearTyping,
  });
  const savedReplies = useSavedReplies({ conversaId, departamentoId });
  const {
    open: savedRepliesOpen,
    list: savedRepliesList,
    loading: savedRepliesLoading,
    error: savedRepliesError,
    activeIndex: savedRepliesIndex,
    panelRef: savedRepliesPanelRef,
    filtered: filteredSavedReplies,
    close: closeSavedReplies,
    openPicker: activateSavedRepliesPicker,
    syncSlashContext,
    insert: insertSavedReplyAtCursor,
    setActiveIndex: setSavedRepliesIndex,
  } = savedReplies;
  const emojiPicker = useEmojiPicker({ texto, setTexto, inputRef });
  const {
    open: emojiOpen,
    setOpen: setEmojiOpen,
    query: emojiQuery,
    setQuery: setEmojiQuery,
    panelRef: emojiPanelRef,
    searchRef: emojiSearchRef,
    close: closeEmojiPicker,
    insert: insertEmoji,
  } = emojiPicker;
  const stickerPicker = useStickerPicker(user);
  const {
    open: stickerOpen,
    setOpen: setStickerOpen,
    query: stickerQuery,
    setQuery: setStickerQuery,
    panelRef: stickerPanelRef,
    searchRef: stickerSearchRef,
    buttonRef: stickerBtnRef,
    close: closeStickerPicker,
    filtered: filteredRecentStickers,
  } = stickerPicker;
  const attachments = useAttachmentPicker({
    conversaId,
    sending,
    podeEnviar,
    isRecording,
    showToast,
    onBeforeOpenCamera: () => {
      closeSavedReplies();
      setAttachMenuOpen(false);
      setEmojiOpen(false);
      setStickerOpen(false);
    },
    onCameraCaptureFile,
  });
  const {
    menuOpen: attachMenuOpen,
    setMenuOpen: setAttachMenuOpen,
    menuPortal: attachMenuPortal,
    menuRef: attachMenuRef,
    menuPanelRef: attachMenuPanelRef,
    fileInputRef,
    galleryInputRef: fototecaInputRef,
    cameraInputRef,
    cameraVideoRef,
    cameraCanvasRef,
    audioInputRef,
    documentInputRef,
    stickerInputRef,
    cameraOpen: cameraCaptureOpen,
    cameraStarting: cameraCaptureStarting,
    cameraError: cameraCaptureError,
    closeCamera: closeCameraCapture,
    openGallery: openFototecaPicker,
    openCamera: handleOpenCameraCapture,
    captureCameraPhoto: handleCaptureCameraPhoto,
  } = attachments;

  // Reset modo nota quando troca de conversa
  useEffect(() => {
    setNotaInternaAtiva(false);
    draftDoOutroModoRef.current = "";
  }, [conversaId]);

  // Se permissão for removida enquanto no modo nota, volta para modo normal
  useEffect(() => {
    if (!podeAnotar && notaInternaAtiva) {
      setNotaInternaAtiva(false);
      draftDoOutroModoRef.current = "";
    }
  }, [podeAnotar, notaInternaAtiva]);

  // Fecha mode picker ao clicar fora
  useEffect(() => {
    if (!modePickerOpen) return;
    const onDocDown = (e) => {
      if (modePickerRef.current && !modePickerRef.current.contains(e.target)) {
        setModePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown, { capture: true });
    return () => document.removeEventListener("mousedown", onDocDown, { capture: true });
  }, [modePickerOpen]);

  const toggleNotaInterna = useCallback(() => {
    // Troca de gaveta: salva rascunho atual, restaura o do outro modo
    const currentTexto = String(textoRef.current || "");
    const savedOther = draftDoOutroModoRef.current;
    draftDoOutroModoRef.current = currentTexto;
    setTexto(savedOther);
    setNotaInternaAtiva((prev) => !prev);
  }, []);

  const focusInput = useCallback(({ force = false } = {}) => {
    if (typeof window !== "undefined" && !force) {
      const isCoarse = window.matchMedia?.("(pointer: coarse)")?.matches;
      const el = inputRef.current;
      if (isCoarse && el && document.activeElement !== el) return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
      });
    });
  }, []);

  const syncTextareaHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el || el.tagName !== "TEXTAREA") return;
    if (!String(el.value || "").trim()) {
      el.style.height = "";
      delete el.dataset.scrollable;
      delete el.dataset.multiline;
      return;
    }
    el.style.height = "auto";
    const computed = getComputedStyle(el);
    const maxPx = parseFloat(computed.maxHeight);
    const minPx = parseFloat(computed.minHeight);
    const cap = Number.isFinite(maxPx) && maxPx > 0 ? maxPx : WA_INPUT_FALLBACK_MAX_HEIGHT_PX;
    const floor = Number.isFinite(minPx) && minPx > 0 ? minPx : 44;
    const contentHeight = Math.ceil(el.scrollHeight);
    const next = Math.max(floor, Math.min(contentHeight, cap));
    el.style.height = `${next}px`;
    el.dataset.scrollable = contentHeight > cap + 1 ? "true" : "false";
    el.dataset.multiline = contentHeight > floor + 2 ? "true" : "false";
  }, []);

  const {
    enabled: autoCorrectEnabled,
    flash: autoCorrectFlash,
    resetTracking: resetAutocorrectTracking,
    updatePreference: updateAutoCorrectPreference,
    applyFromEvent: applyAutocorrectFromEvent,
    handleInputChange,
  } = useComposerAutocorrect({
    texto,
    setTexto,
    user,
    onUpdatePreference: onUpdateAutoCorrectPreference,
    syncTextareaHeight,
    savedRepliesOpen,
    closeSavedReplies,
    syncSlashContext,
  });

  const openSavedRepliesPicker = useCallback(() => {
    if (!conversaId || !podeEnviar || isRecording) return;
    setEmojiOpen(false);
    setEmojiQuery("");
    setStickerOpen(false);
    setStickerQuery("");
    setAttachMenuOpen(false);
    activateSavedRepliesPicker();
    focusInput();
  }, [activateSavedRepliesPicker, conversaId, focusInput, isRecording, podeEnviar]);

  const closePanels = useCallback(() => {
    /* Um painel por ESC (cascata). */
    if (cameraCaptureOpen) {
      closeCameraCapture();
      return true;
    }
    if (savedRepliesOpen) {
      closeSavedReplies();
      return true;
    }
    if (emojiOpen) {
      setEmojiOpen(false);
      setEmojiQuery("");
      return true;
    }
    if (stickerOpen) {
      setStickerOpen(false);
      setStickerQuery("");
      return true;
    }
    if (attachMenuOpen) {
      setAttachMenuOpen(false);
      return true;
    }
    return false;
  }, [
    attachMenuOpen,
    cameraCaptureOpen,
    closeCameraCapture,
    closeSavedReplies,
    emojiOpen,
    savedRepliesOpen,
    stickerOpen,
  ]);

  // Libera a trava quando o envio termina ou quando já existe um novo rascunho. Assim,
  // dois eventos do mesmo clique/Enter continuam idempotentes, mas mensagens consecutivas
  // podem entrar imediatamente na fila otimista.
  useEffect(() => {
    if (!sending || String(texto || "").trim()) sendLockedRef.current = null;
  }, [sending, texto]);

  useImperativeHandle(
    ref,
    () => ({
      focusInput,
      setText: (value) => setTexto(String(value ?? "")),
      appendText: (value) => {
        const v = String(value || "").trim();
        if (!v) return;
        setTexto((prev) => (prev ? `${prev}\n${v}` : v));
        focusInput();
      },
      getInputElement: () => inputRef.current,
      isRecording: () => isRecording,
      cancelRecording: handleCancelRecording,
      closePanels,
      getText: () => texto,
    }),
    [focusInput, handleCancelRecording, closePanels, isRecording, texto]
  );

  useLayoutEffect(() => {
    syncTextareaHeight();
  }, [texto, syncTextareaHeight]);

  useLayoutEffect(() => {
    const len = String(texto ?? "").length;
    const threadKey = scrollThreadId ?? conversaId;
    const height = Number(inputRef.current?.offsetHeight) || 0;
    onTextMetrics?.({ length: len, height, threadKey, loading });
    if (String(prevTextConversaRef.current) !== String(threadKey ?? "")) {
      prevTextConversaRef.current = threadKey;
      prevTextLenRef.current = len;
      return;
    }
    const prevLen = prevTextLenRef.current;
    prevTextLenRef.current = len;
    if (prevLen <= 0 || len !== 0) return;
    onTextMetrics?.({ length: len, height, threadKey, loading, cleared: true });
  }, [texto, conversaId, scrollThreadId, loading, onTextMetrics]);

  useEffect(() => {
    resetAutocorrectTracking();
    closeSavedReplies();
    setEmojiOpen(false);
    setEmojiQuery("");
    setStickerOpen(false);
    setStickerQuery("");
    setAttachMenuOpen(false);
  }, [closeSavedReplies, conversaId, resetAutocorrectTracking]);

  useEffect(() => {
    if (!appendTextQueue) return;
    const value = appendTextQueue;
    onAppendConsumed?.();
    setTexto((prev) => (prev ? `${prev}\n${value}` : value));
    focusInput();
    onAppendTextApplied?.();
  }, [appendTextQueue, onAppendConsumed, onAppendTextApplied, focusInput]);

  const handleSendFromComposer = useCallback(
    (textToSend) => {
      if (!conversaId) return;
      const t = safeString(textToSend).trim();
      if (!t) return;

      if (notaInternaAtiva) {
        if (!onSendInternalNote) return;
        if (sendLockedRef.current === t) return;
        sendLockedRef.current = t;
        setTexto("");
        draftDoOutroModoRef.current = "";
        onSendInternalNote(t);
        return;
      }

      if (!podeEnviar) return;
      // O mesmo texto ainda travado é o mesmo gesto duplicado. Um novo rascunho libera
      // a trava no efeito acima, mesmo que o POST anterior continue em andamento.
      if (sendLockedRef.current === t) return;
      sendLockedRef.current = t;
      resetAutocorrectTracking();
      clearComposerDraft(conversaId);
      setTexto("");
      onSendMessage?.(t);
    },
    [conversaId, notaInternaAtiva, onSendInternalNote, onSendMessage, podeEnviar, resetAutocorrectTracking]
  );

  const insertSavedReply = useCallback(
    (replyText) => insertSavedReplyAtCursor({
      replyText,
      texto,
      input: inputRef.current,
      setTexto,
    }),
    [insertSavedReplyAtCursor, setTexto, texto]
  );

  const handleKeyDownInput = useCallback(
    (e) => {
      if (e.nativeEvent?.isComposing || e.isComposing) return;

      const key = String(e.key || "");

      if (savedRepliesOpen) {
        const list = filteredSavedReplies;
        if (key === "Escape") {
          e.preventDefault();
          closeSavedReplies();
          return;
        }
        if (key === "ArrowDown" && list.length > 0) {
          e.preventDefault();
          setSavedRepliesIndex((i) => Math.min(i + 1, list.length - 1));
          return;
        }
        if (key === "ArrowUp" && list.length > 0) {
          e.preventDefault();
          setSavedRepliesIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (key === "Enter" || key === "Tab") {
          if (list.length > 0) {
            const item = list[savedRepliesIndex] || list[0];
            if (item?.texto) {
              e.preventDefault();
              insertSavedReply(item.texto);
            }
          } else if (key === "Enter" && !composerEnterInsertsNewline && !e.shiftKey) {
            e.preventDefault();
          }
          return;
        }
      }

      const punctuationTrigger = key.length === 1 && [".", ",", "!", "?", ";", ":"].includes(key);
      if (key === " " || punctuationTrigger) {
        applyAutocorrectFromEvent(e, key);
        return;
      }

      const enterIntent = getComposerEnterIntent({
        key,
        shiftKey: e.shiftKey,
        composerEnterInsertsNewline,
      });
      if (!enterIntent) return;
      if (enterIntent === "newline") {
        applyAutocorrectFromEvent(e, "\n");
        return;
      }

      const edit = applyAutocorrectFromEvent(e, "\n");
      e.preventDefault();
      const textToSend = edit
        ? `${String(e.currentTarget?.value || "")}`.replace(/\n$/, "")
        : texto;
      handleSendFromComposer(textToSend);
    },
    [applyAutocorrectFromEvent, closeSavedReplies, composerEnterInsertsNewline, filteredSavedReplies, handleSendFromComposer, insertSavedReply, savedRepliesIndex, savedRepliesOpen, texto]
  );

  const handlePaste = useCallback(
    (e) => {
      if (!conversaId) return;
      if (notaInternaAtiva) return;
      const dt = e.clipboardData;
      if (!dt) return;

      const files = dt.files && dt.files.length > 0 ? Array.from(dt.files) : [];
      const items = dt.items && dt.items.length > 0 ? Array.from(dt.items) : [];

      let pickedFile = null;

      if (files.length > 0) {
        pickedFile = files.find((f) => f && isImageFile(f)) || files[0];
      } else if (items.length > 0) {
        const fileItem = items.find((it) => it.kind === "file" && it.type && it.type.startsWith("image/"));
        if (fileItem) pickedFile = fileItem.getAsFile();
      }

      if (pickedFile && isImageFile(pickedFile)) {
        e.preventDefault();
        onPasteImageFile?.(pickedFile);
      }
    },
    [conversaId, notaInternaAtiva, onPasteImageFile]
  );

  const hasDraft = Boolean(safeString(texto).trim());

  const autoAssumirText =
    "Envie uma mensagem para assumir esta conversa e iniciar o atendimento.";

  const placeholderText = autoAssumirHint
    ? autoAssumirText
    : podeEnviar
      ? "Digite uma mensagem"
    : atendimentoEncerradoHint
      ? "Reabra o atendimento para enviar mensagens"
      : mensagensBloqueadasHint
        ? "Histórico oculto: atendimento assumido por outro usuário."
        : "Assuma esta conversa para responder";

  const inputAriaLabel = autoAssumirHint
    ? autoAssumirText
    : podeEnviar
      ? composerEnterInsertsNewline
      ? "Digite sua resposta. Retorno ou Enter para nova linha; use o botão enviar para mandar a mensagem. Esc para fechar painéis."
      : "Digite sua resposta. Enter para enviar, Shift+Enter para nova linha, Esc para fechar painéis."
    : atendimentoEncerradoHint
      ? "Reabra o atendimento para enviar mensagens."
      : mensagensBloqueadasHint
        ? "Histórico oculto: este atendimento foi assumido por outro usuário. Você não pode ver nem enviar mensagens."
        : "Assuma esta conversa para responder.";

  const footerHint = autoAssumirHint
    ? null
    : !podeEnviar
      ? atendimentoEncerradoHint
      ? "Reabra o atendimento para enviar mensagens"
      : mensagensBloqueadasHint
        ? `Histórico oculto — atendimento com ${atendenteNomeHint?.trim() ? atendenteNomeHint : "outro usuário"}. Admin/supervisor podem visualizar.`
        : "Assuma esta conversa para enviar mensagens"
    : null;

  const composerPlaceholderText = atendimentoEncerradoHint && !podeEnviar
    ? "Reabra o atendimento para enviar mensagens"
    : placeholderText;
  const composerInputAriaLabel = atendimentoEncerradoHint && !podeEnviar
    ? "Reabra o atendimento para enviar mensagens."
    : inputAriaLabel;
  const composerFooterHint = atendimentoEncerradoHint && !podeEnviar
    ? "Reabra o atendimento para enviar mensagens"
    : footerHint;

  return (
    <>
      <div className="wa-composerStack">
      {showScrollToRecent && !isRecording ? (
        <button
          type="button"
          className="wa-scrollRecentBtn"
          // preventDefault no mousedown: não rouba o foco do input (não fecha/reabre o teclado só por tocar no botão).
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onScrollToRecent?.()}
          aria-label="Ir para as mensagens mais recentes"
          title="Mensagens mais recentes"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M7 10l5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
      {savedRepliesOpen && !isRecording ? (
        <Suspense fallback={null}>
          <SavedRepliesPanel
            open={savedRepliesOpen}
            isRecording={isRecording}
            panelRef={savedRepliesPanelRef}
            loading={savedRepliesLoading}
            error={savedRepliesError}
            replies={filteredSavedReplies}
            allReplies={savedRepliesList}
            activeIndex={savedRepliesIndex}
            onInsert={insertSavedReply}
          />
        </Suspense>
      ) : null}
      <ReplyBar
        preview={replyBarPreview}
        isRecording={isRecording}
        sending={sending}
        onCancel={onCancelReply}
      />

      <ComposerFooter
        conversaId={conversaId}
        sending={sending}
        podeEnviar={podeEnviar}
        atendimentoEncerradoHint={atendimentoEncerradoHint}
        headerCompact={headerCompact}
        composerEnterInsertsNewline={composerEnterInsertsNewline}
        autocorrectToggleInMenu={autocorrectToggleInMenu}
        pixActionBusy={pixActionBusy}
        pixConfigLoading={pixConfigLoading}
        composerFooterHint={composerFooterHint}
        composerPlaceholderText={composerPlaceholderText}
        composerInputAriaLabel={composerInputAriaLabel}
        texto={texto}
        hasDraft={hasDraft}
        inputRef={inputRef}
        autoCorrectEnabled={autoCorrectEnabled}
        autoCorrectFlash={autoCorrectFlash}
        notaInternaAtiva={notaInternaAtiva}
        podeAnotar={podeAnotar}
        modePickerOpen={modePickerOpen}
        modePickerRef={modePickerRef}
        attachments={attachments}
        emojiPicker={emojiPicker}
        stickerPicker={stickerPicker}
        voiceRecording={voiceRecording}
        onCloseSavedReplies={closeSavedReplies}
        onOpenSavedReplies={openSavedRepliesPicker}
        onInputChange={handleInputChange}
        onInputBlur={emitTypingStop}
        onPaste={handlePaste}
        onKeyDown={handleKeyDownInput}
        onSend={handleSendFromComposer}
        onToggleNotaInterna={toggleNotaInterna}
        onSetModePickerOpen={setModePickerOpen}
        onUpdateAutoCorrectPreference={updateAutoCorrectPreference}
        onFileInputChange={onFileInputChange}
        onFototecaInputChange={onFototecaInputChange}
        onCameraInputChange={onCameraInputChange}
        onDocumentInputChange={onDocumentInputChange}
        onStickerInputChange={onStickerInputChange}
        onPixMenuClick={onPixMenuClick}
        onOpenPixConfig={onOpenPixConfig}
        onShareContact={onShareContact}
        onShareLocation={onShareLocation}
      />
      </div>

      {cameraCaptureOpen ? (
        <Suspense fallback={null}>
          <CameraCapture
            open={cameraCaptureOpen}
            videoRef={cameraVideoRef}
            canvasRef={cameraCanvasRef}
            starting={cameraCaptureStarting}
            error={cameraCaptureError}
            onClose={closeCameraCapture}
            onCapture={handleCaptureCameraPhoto}
          />
        </Suspense>
      ) : null}

      {stickerOpen && !isRecording ? (
        <Suspense fallback={null}>
          <StickerPicker
            open={stickerOpen}
            isRecording={isRecording}
            panelRef={stickerPanelRef}
            searchRef={stickerSearchRef}
            inputRef={stickerInputRef}
            query={stickerQuery}
            stickers={filteredRecentStickers}
            onQueryChange={setStickerQuery}
            onSendStickerFile={onSendStickerFile}
            showToast={showToast}
          />
        </Suspense>
      ) : null}

      {emojiOpen && !isRecording ? (
        <Suspense fallback={null}>
          <EmojiPicker
            open={emojiOpen}
            isRecording={isRecording}
            panelRef={emojiPanelRef}
            searchRef={emojiSearchRef}
            query={emojiQuery}
            onQueryChange={setEmojiQuery}
            onClose={() => {
              setEmojiOpen(false);
              setEmojiQuery("");
            }}
            onInsert={insertEmoji}
          />
        </Suspense>
      ) : null}
    </>
  );
});

export default memo(ConversaComposer, composerPropsAreEqual);
