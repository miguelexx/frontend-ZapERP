import { useCallback, useEffect } from "react";
import { IconChevronUp } from "@tabler/icons-react";
import { IconNote as TablerNote } from "@tabler/icons-react";
import {
  IconCamera,
  IconCheck,
  IconEmoji,
  IconMic,
  IconSend,
} from "../../conversaComposerIcons";
import { INTERNAL_NOTE_MAX_LEN } from "../../internalNote";
import AttachmentInputs from "./AttachmentInputs";
import AttachmentMenu from "./AttachmentMenu";
import VoiceRecorder from "./VoiceRecorder";
import { useMobileOverlayBack } from "../../../atendimento/useMobileOverlayBack";

/*
 * Painel de emojis/figurinhas (lazy): o chunk era buscado e avaliado no 1.º clique, somado ao
 * custo de pintar a grade (27/11/2026). Aquece o import (e os glifos, ver aquecerGlifosEmoji)
 * num momento ocioso depois de o composer montar, e de novo ao passar o rato/focar o botão — o
 * React.lazy do shell reaproveita o módulo.
 */
let emojiPanelAquecido = false;
function aquecerPainelEmoji() {
  if (emojiPanelAquecido) return;
  emojiPanelAquecido = true;
  import("./StickerEmojiPicker")
    .then((mod) => mod.aquecerGlifosEmoji?.())
    .catch(() => {
      emojiPanelAquecido = false;
    });
}

/* Itens do menu "Cliente / Nota interna": o clique não tira o foco do campo — antes o texto
   digitado logo depois de trocar de modo não ia para lugar nenhum (26/11/2026). */
function keepComposerFocus(e) {
  if (e.button !== 0) return;
  e.preventDefault();
}

export default function ComposerFooter({
  conversaId,
  sending,
  podeEnviar,
  editMode = false,
  editAllowEmpty = false,
  editMaxLength,
  atendimentoEncerradoHint,
  headerCompact,
  composerEnterInsertsNewline,
  autocorrectToggleInMenu,
  pixActionBusy,
  pixConfigLoading,
  composerFooterHint,
  composerPlaceholderText,
  composerInputAriaLabel,
  texto,
  hasDraft,
  inputRef,
  autoCorrectEnabled,
  autoCorrectFlash,
  notaInternaAtiva,
  podeAnotar,
  modePickerOpen,
  modePickerRef,
  attachments,
  emojiPicker,
  stickerPicker,
  voiceRecording,
  onCloseSavedReplies,
  onOpenSavedReplies,
  onInputChange,
  onInputBlur,
  onPaste,
  onKeyDown,
  onSend,
  onToggleNotaInterna,
  onSetModePickerOpen,
  onUpdateAutoCorrectPreference,
  onFileInputChange,
  onFototecaInputChange,
  onCameraInputChange,
  onDocumentInputChange,
  onStickerInputChange,
  onPixMenuClick,
  onOpenPixConfig,
  onShareContact,
  onShareLocation,
  onOpenPoll,
  onOpenCatalog,
}) {
  const canType = Boolean(conversaId) && (editMode || notaInternaAtiva || podeEnviar);
  const canConfirmEdit = Boolean(conversaId) && (editAllowEmpty || hasDraft);

  // Callbacks estáveis para o AttachmentMenu (memoizado): os setters de useState
  // são referências estáveis, então estes useCallback não mudam a cada tecla e o
  // menu deixa de reconstruir seus ~12 itens durante a digitação.
  const { setMenuOpen: setAttachMenuOpen } = attachments;
  const { setOpen: setEmojiOpen } = emojiPicker;
  const { setOpen: setStickerOpen } = stickerPicker;
  const handleAttachBeforeOpen = useCallback(() => {
    onCloseSavedReplies();
    setEmojiOpen(false);
    setStickerOpen(false);
  }, [onCloseSavedReplies, setEmojiOpen, setStickerOpen]);
  const handleAttachToggle = useCallback(
    () => setAttachMenuOpen((value) => !value),
    [setAttachMenuOpen]
  );
  const handleAttachClose = useCallback(() => setAttachMenuOpen(false), [setAttachMenuOpen]);
  /* "Voltar" do celular fecha o painel de emojis/figurinhas, não a conversa (27/11/2026). */
  useMobileOverlayBack(
    Boolean(stickerPicker.open) && !voiceRecording.isRecording,
    stickerPicker.close,
    "emoji"
  );
  useEffect(() => {
    if (emojiPanelAquecido || typeof window === "undefined") return undefined;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(aquecerPainelEmoji, { timeout: 5000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(aquecerPainelEmoji, 2500);
    return () => window.clearTimeout(id);
  }, []);
  const inputMaxLength = editMode
    ? editMaxLength
    : notaInternaAtiva
      ? INTERNAL_NOTE_MAX_LEN
      : undefined;

  return (
    <>
      {podeAnotar && notaInternaAtiva && !editMode && !voiceRecording.isRecording ? (
        <div className="wa-composerModeBar" style={{ padding: "5px 12px 0", borderTop: "1px solid var(--wa-border,#e5e7eb)", display: "flex", alignItems: "center", gap: 6 }}>
          <span className="wa-notaBadge">
            <TablerNote size={11} strokeWidth={2.5} />
            NOTA INTERNA
          </span>
          <span className="wa-composerModeBar-hint">
            Visível apenas para a equipe
          </span>
        </div>
      ) : null}

      {/* O textarea permanece montado sob o overlay para preservar o teclado mobile. */}
      <div className={`wa-footer ${voiceRecording.isRecording || voiceRecording.hasDraft ? "wa-footer--recording" : ""} ${notaInternaAtiva && !editMode ? "wa-footer--nota" : ""} ${editMode ? "wa-footer--edit" : ""}`}>
        {composerFooterHint && !voiceRecording.isRecording ? (
          <div className="wa-footer-hint" role="status">{composerFooterHint}</div>
        ) : null}
        {!editMode ? (
        <AttachmentMenu
          open={attachments.menuOpen}
          portal={attachments.menuPortal}
          wrapRef={attachments.menuRef}
          panelRef={attachments.menuPanelRef}
          sending={sending}
          conversaId={conversaId}
          podeEnviar={podeEnviar}
          pixActionBusy={pixActionBusy}
          pixConfigLoading={pixConfigLoading}
          autocorrectToggleInMenu={autocorrectToggleInMenu}
          autoCorrectEnabled={autoCorrectEnabled}
          documentInputRef={attachments.documentInputRef}
          onBeforeOpen={handleAttachBeforeOpen}
          onToggle={handleAttachToggle}
          onClose={handleAttachClose}
          onOpenSavedReplies={onOpenSavedReplies}
          onOpenGallery={attachments.openGallery}
          onOpenCamera={attachments.openCamera}
          onPixMenuClick={onPixMenuClick}
          onOpenPixConfig={onOpenPixConfig}
          onShareContact={onShareContact}
          onShareLocation={onShareLocation}
          onOpenPoll={onOpenPoll}
          onOpenCatalog={onOpenCatalog}
          onUpdateAutoCorrectPreference={onUpdateAutoCorrectPreference}
        />
        ) : null}
        <div className="wa-stickerWrap">
          <button
            ref={stickerPicker.buttonRef}
            type="button"
            className={`wa-iconBtn wa-mediaBtn ${stickerPicker.open ? "isActive" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onPointerEnter={aquecerPainelEmoji}
            onFocus={aquecerPainelEmoji}
            onClick={() => {
              onCloseSavedReplies();
              stickerPicker.setOpen((value) => !value);
              attachments.setMenuOpen(false);
              emojiPicker.setOpen(false);
            }}
            title="Emojis e figurinhas"
            aria-label="Emojis e figurinhas"
            aria-expanded={stickerPicker.open}
            aria-haspopup="dialog"
            disabled={sending || !canType}
          >
            <IconEmoji />
          </button>
        </div>
        {!editMode && !autocorrectToggleInMenu ? (
          <label
            className={`wa-autocorrectToggle ${autoCorrectEnabled ? "isEnabled" : ""}`}
            title="Ativar ou desativar correção ortográfica automática"
          >
            <input
              type="checkbox"
              checked={autoCorrectEnabled}
              onChange={(event) => onUpdateAutoCorrectPreference(event.target.checked)}
              aria-label="Correção automática"
            />
            <span className="wa-autocorrectToggle-track" aria-hidden="true">
              <span className="wa-autocorrectToggle-thumb" />
            </span>
            <span className="wa-autocorrectToggle-text">Correção/A</span>
          </label>
        ) : null}
        <AttachmentInputs
          fileInputRef={attachments.fileInputRef}
          fototecaInputRef={attachments.galleryInputRef}
          cameraInputRef={attachments.cameraInputRef}
          audioInputRef={attachments.audioInputRef}
          documentInputRef={attachments.documentInputRef}
          stickerInputRef={attachments.stickerInputRef}
          onFileInputChange={onFileInputChange}
          onFototecaInputChange={onFototecaInputChange}
          onCameraInputChange={onCameraInputChange}
          onDocumentInputChange={onDocumentInputChange}
          onStickerInputChange={onStickerInputChange}
        />

        <textarea
          ref={inputRef}
          value={texto}
          onChange={onInputChange}
          onBlur={onInputBlur}
          onPaste={onPaste}
          placeholder={
            editMode
              ? composerPlaceholderText
              : notaInternaAtiva
                ? "Escreva uma nota interna (visível apenas para a equipe)…"
                : composerPlaceholderText
          }
          className={`wa-input ${autoCorrectFlash ? "wa-input--autocorrect-flash" : ""} ${atendimentoEncerradoHint && !podeEnviar && !editMode ? "wa-input--closedAttendance" : ""} ${notaInternaAtiva && !editMode ? "wa-input--nota" : ""}`}
          onKeyDown={onKeyDown}
          disabled={!canType}
          aria-label={
            editMode
              ? composerInputAriaLabel
              : notaInternaAtiva
                ? "Escrever nota interna"
                : composerInputAriaLabel
          }
          rows={1}
          enterKeyHint={composerEnterInsertsNewline ? "enter" : "send"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={inputMaxLength}
        />

        {headerCompact && !hasDraft && !editMode ? (
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={attachments.openCamera}
            disabled={sending || !conversaId || !podeEnviar}
            className="wa-iconBtn wa-cameraQuickBtn"
            title="Câmera"
            type="button"
            aria-label="Abrir câmera"
          >
            <IconCamera />
          </button>
        ) : null}

        <div className="wa-footer-right">
          {editMode ? (
            <button
              type="button"
              onMouseDown={(event) => { if (event.button !== 0) return; event.preventDefault(); }}
              onClick={() => onSend(texto)}
              disabled={sending || !canConfirmEdit}
              className="wa-sendBtn"
              title="Salvar edição"
              aria-label="Salvar edição"
            >
              <IconCheck />
            </button>
          ) : (
          <>
          {!notaInternaAtiva && (headerCompact ? !hasDraft : true) ? (
            <button
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) => event.preventDefault()}
              onClick={voiceRecording.startRecording}
              disabled={!conversaId || !podeEnviar}
              className={`wa-micBtn${voiceRecording.isStarting ? " isStarting" : ""}`}
              aria-busy={voiceRecording.isStarting || undefined}
              title="Gravar áudio"
              type="button"
              aria-label="Gravar áudio"
            >
              <IconMic />
            </button>
          ) : null}

          {(notaInternaAtiva || (headerCompact ? hasDraft : true)) ? (
            podeAnotar ? (
              <div
                className={`wa-sendSplit${notaInternaAtiva ? " wa-sendSplit--nota" : ""}`}
                ref={modePickerRef}
              >
                {modePickerOpen ? (
                  <div className="wa-modePicker" role="menu" aria-label="Modo de envio">
                    {notaInternaAtiva ? (
                      <>
                        <button
                          type="button"
                          className="wa-modePicker-item wa-modePicker-item--nota isActive"
                          role="menuitemradio"
                          aria-checked="true"
                          onMouseDown={keepComposerFocus}
                          onClick={() => onSetModePickerOpen(false)}
                        >
                          <TablerNote size={16} strokeWidth={2} style={{ color: "#f59e0b", flexShrink: 0 }} />
                          <span>
                            Nota interna
                            <span className="wa-modePicker-itemSub">Visível só para a equipe</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="wa-modePicker-item"
                          role="menuitemradio"
                          aria-checked="false"
                          onMouseDown={keepComposerFocus}
                          onClick={() => { onToggleNotaInterna(); onSetModePickerOpen(false); }}
                        >
                          <IconSend size={16} style={{ color: "var(--wa-green)", flexShrink: 0 }} />
                          <span>
                            Mensagem para cliente
                            <span className="wa-modePicker-itemSub">Enviada pelo WhatsApp</span>
                          </span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="wa-modePicker-item isActive"
                          role="menuitemradio"
                          aria-checked="true"
                          onMouseDown={keepComposerFocus}
                          onClick={() => onSetModePickerOpen(false)}
                        >
                          <IconSend size={16} style={{ color: "var(--wa-green)", flexShrink: 0 }} />
                          <span>
                            Mensagem para cliente
                            <span className="wa-modePicker-itemSub">Enviada pelo WhatsApp</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="wa-modePicker-item wa-modePicker-item--nota"
                          role="menuitemradio"
                          aria-checked="false"
                          onMouseDown={keepComposerFocus}
                          onClick={() => { onToggleNotaInterna(); onSetModePickerOpen(false); }}
                        >
                          <TablerNote size={16} strokeWidth={2} style={{ color: "#f59e0b", flexShrink: 0 }} />
                          <span>
                            Nota interna
                            <span className="wa-modePicker-itemSub">Visível só para a equipe</span>
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="wa-sendSplit-main"
                  onMouseDown={(event) => { if (event.button !== 0) return; event.preventDefault(); }}
                  onClick={() => onSend(texto)}
                  disabled={!hasDraft || !conversaId || (!notaInternaAtiva && !podeEnviar)}
                  title={notaInternaAtiva ? "Salvar nota interna" : "Enviar mensagem"}
                  aria-label={notaInternaAtiva ? "Salvar nota interna" : "Enviar mensagem"}
                >
                  {notaInternaAtiva ? <TablerNote size={18} strokeWidth={2} /> : <IconSend />}
                </button>
                <span className="wa-sendSplit-divider" aria-hidden="true" />
                <button
                  type="button"
                  className={`wa-sendSplit-arrow${modePickerOpen ? " isOpen" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSetModePickerOpen((value) => !value)}
                  title="Mudar modo de envio"
                  aria-label="Selecionar modo de envio"
                  aria-expanded={modePickerOpen}
                  aria-haspopup="menu"
                >
                  <IconChevronUp size={12} strokeWidth={2.8} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onMouseDown={(event) => { if (event.button !== 0) return; event.preventDefault(); }}
                onClick={() => onSend(texto)}
                disabled={!hasDraft || !conversaId || !podeEnviar}
                className="wa-sendBtn"
                title="Enviar"
                aria-label="Enviar mensagem"
              >
                <IconSend />
              </button>
            )
          ) : null}
          </>
          )}
        </div>

        <VoiceRecorder
          open={voiceRecording.isRecording || voiceRecording.hasDraft}
          interrupted={!voiceRecording.isRecording && voiceRecording.hasDraft}
          preparing={!voiceRecording.isRecording && Boolean(voiceRecording.draft?.preparing)}
          seconds={
            !voiceRecording.isRecording && voiceRecording.draft
              ? voiceRecording.draft.seconds
              : voiceRecording.recordingSeconds
          }
          onCancel={voiceRecording.cancelRecording}
          onSend={voiceRecording.stopRecording}
        />
      </div>
    </>
  );
}
