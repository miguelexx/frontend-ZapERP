import { IconChevronUp } from "@tabler/icons-react";
import { IconNote as TablerNote } from "@tabler/icons-react";
import {
  IconCamera,
  IconEmoji,
  IconMic,
  IconSend,
  IconSticker,
} from "../../conversaComposerIcons";
import { INTERNAL_NOTE_MAX_LEN } from "../../internalNote";
import AttachmentInputs from "./AttachmentInputs";
import AttachmentMenu from "./AttachmentMenu";
import VoiceRecorder from "./VoiceRecorder";

export default function ComposerFooter({
  conversaId,
  sending,
  podeEnviar,
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
}) {
  return (
    <>
      {podeAnotar && notaInternaAtiva && !voiceRecording.isRecording ? (
        <div className="wa-composerModeBar" style={{ padding: "5px 12px 0", borderTop: "1px solid var(--wa-border,#e5e7eb)", display: "flex", alignItems: "center", gap: 6 }}>
          <span className="wa-notaBadge">
            <TablerNote size={11} strokeWidth={2.5} />
            NOTA INTERNA
          </span>
          <span style={{ fontSize: 11.5, color: "var(--wa-text-muted)", flex: 1 }}>
            Visível apenas para a equipe
          </span>
        </div>
      ) : null}

      {/* O textarea permanece montado sob o overlay para preservar o teclado mobile. */}
      <div className={`wa-footer ${voiceRecording.isRecording ? "wa-footer--recording" : ""} ${notaInternaAtiva ? "wa-footer--nota" : ""}`}>
        {composerFooterHint && !voiceRecording.isRecording ? (
          <div className="wa-footer-hint" role="status">{composerFooterHint}</div>
        ) : null}
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
          onBeforeOpen={() => {
            onCloseSavedReplies();
            emojiPicker.setOpen(false);
            stickerPicker.setOpen(false);
          }}
          onToggle={() => attachments.setMenuOpen((value) => !value)}
          onClose={() => attachments.setMenuOpen(false)}
          onOpenSavedReplies={onOpenSavedReplies}
          onOpenGallery={attachments.openGallery}
          onOpenCamera={attachments.openCamera}
          onPixMenuClick={onPixMenuClick}
          onOpenPixConfig={onOpenPixConfig}
          onShareContact={onShareContact}
          onShareLocation={onShareLocation}
          onUpdateAutoCorrectPreference={onUpdateAutoCorrectPreference}
        />
        <div className="wa-stickerWrap">
          <button
            ref={stickerPicker.buttonRef}
            type="button"
            className={`wa-iconBtn wa-stickerBtn ${stickerPicker.open ? "isActive" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onCloseSavedReplies();
              stickerPicker.setOpen((value) => !value);
              attachments.setMenuOpen(false);
              emojiPicker.setOpen(false);
            }}
            title="Figurinhas"
            aria-label="Figurinhas"
            aria-expanded={stickerPicker.open}
            disabled={sending || !conversaId || !podeEnviar}
          >
            <IconSticker />
          </button>
        </div>
        {!autocorrectToggleInMenu ? (
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
            <span className="wa-autocorrectToggle-text">Correção automática</span>
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
          placeholder={notaInternaAtiva ? "Escreva uma nota interna (visível apenas para a equipe)…" : composerPlaceholderText}
          className={`wa-input ${autoCorrectFlash ? "wa-input--autocorrect-flash" : ""} ${atendimentoEncerradoHint && !podeEnviar ? "wa-input--closedAttendance" : ""} ${notaInternaAtiva ? "wa-input--nota" : ""}`}
          onKeyDown={onKeyDown}
          disabled={notaInternaAtiva ? !conversaId : (!conversaId || !podeEnviar)}
          aria-label={notaInternaAtiva ? "Escrever nota interna" : composerInputAriaLabel}
          rows={1}
          enterKeyHint={composerEnterInsertsNewline ? "enter" : "send"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={notaInternaAtiva ? INTERNAL_NOTE_MAX_LEN : undefined}
        />

        {!headerCompact ? (
          <button
            type="button"
            className={`wa-iconBtn ${emojiPicker.open ? "isActive" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onCloseSavedReplies();
              emojiPicker.setOpen((value) => !value);
              attachments.setMenuOpen(false);
              stickerPicker.setOpen(false);
            }}
            title="Emojis"
            aria-label="Emojis"
            disabled={sending || !conversaId || !podeEnviar}
          >
            <IconEmoji />
          </button>
        ) : null}

        {headerCompact && !hasDraft ? (
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
          {!notaInternaAtiva && (headerCompact ? !hasDraft : true) ? (
            <button
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) => event.preventDefault()}
              onClick={voiceRecording.startRecording}
              disabled={!conversaId || !podeEnviar}
              className="wa-micBtn"
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
                  <div className="wa-modePicker" role="menu">
                    {notaInternaAtiva ? (
                      <>
                        <button
                          type="button"
                          className="wa-modePicker-item wa-modePicker-item--nota isActive"
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
                  aria-haspopup="true"
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
        </div>

        <VoiceRecorder
          open={voiceRecording.isRecording}
          seconds={voiceRecording.recordingSeconds}
          onCancel={voiceRecording.cancelRecording}
          onSend={voiceRecording.stopRecording}
        />
      </div>
    </>
  );
}
