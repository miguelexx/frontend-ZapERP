import { createPortal } from "react-dom";
import {
  IconCamera as TablerCamera,
  IconFileText,
  IconLayoutGrid,
  IconMapPin,
  IconPhoto,
  IconSettings2,
  IconUser,
} from "@tabler/icons-react";
import {
  IconClose,
  IconPix,
  IconPlus,
  IconSavedReplies,
} from "../../conversaComposerIcons";

export default function AttachmentMenu({
  open,
  portal,
  wrapRef,
  panelRef,
  sending,
  conversaId,
  podeEnviar,
  pixActionBusy,
  pixConfigLoading,
  autocorrectToggleInMenu,
  autoCorrectEnabled,
  documentInputRef,
  onToggle,
  onClose,
  onBeforeOpen,
  onOpenSavedReplies,
  onOpenGallery,
  onOpenCamera,
  onPixMenuClick,
  onOpenPixConfig,
  onShareContact,
  onShareLocation,
  onUpdateAutoCorrectPreference,
}) {
  const items = (
    <>
      <div className="wa-attachMenu-head">
        <button
          type="button"
          className="wa-attachMenu-close wa-iconBtn"
          aria-label="Fechar opções"
          title="Fechar"
          onClick={onClose}
        >
          <IconClose />
        </button>
      </div>
      <button
        type="button"
        className="wa-attachItem"
        role="menuitem"
        onClick={onOpenSavedReplies}
        disabled={sending || !conversaId || !podeEnviar}
      >
        <span className="wa-attachItem-icon wa-attachIcon-savedReplies" aria-hidden="true">
          <IconSavedReplies />
        </span>
        <span>Respostas salvas</span>
      </button>
      <div className="wa-attachDivider" role="separator" />
      <button
        type="button"
        className="wa-attachItem"
        role="menuitem"
        onClick={() => {
          onOpenGallery();
          onClose();
        }}
        disabled={sending || !conversaId || !podeEnviar}
      >
        <span className="wa-attachItem-icon wa-attachIcon-doc" aria-hidden="true">
          <IconPhoto size={16} strokeWidth={1.6} />
        </span>
        <span>Fototeca/Galeria</span>
      </button>
      <button
        type="button"
        className="wa-attachItem"
        role="menuitem"
        onClick={() => {
          onOpenGallery();
          onClose();
        }}
        disabled={sending || !conversaId || !podeEnviar}
      >
        <span className="wa-attachItem-icon wa-attachIcon-gallery" aria-hidden="true">
          <IconLayoutGrid size={16} strokeWidth={1.6} />
        </span>
        <span>Galeria</span>
      </button>
      <button
        type="button"
        className="wa-attachItem"
        role="menuitem"
        onClick={onOpenCamera}
        disabled={sending || !conversaId || !podeEnviar}
      >
        <span className="wa-attachItem-icon wa-attachIcon-camera" aria-hidden="true">
          <TablerCamera size={16} strokeWidth={1.6} />
        </span>
        <span>Câmera</span>
      </button>
      <div className="wa-attachDivider" role="separator" />
      <button
        type="button"
        className="wa-attachItem"
        role="menuitem"
        onClick={() => {
          documentInputRef.current?.click();
          onClose();
        }}
        disabled={sending || !conversaId || !podeEnviar}
      >
        <span className="wa-attachItem-icon wa-attachIcon-document" aria-hidden="true">
          <IconFileText size={16} strokeWidth={1.6} />
        </span>
        <span>Documentos</span>
      </button>
      <button
        type="button"
        className="wa-attachItem"
        role="menuitem"
        onClick={() => {
          onPixMenuClick?.();
          onClose();
        }}
        disabled={pixActionBusy || sending || !conversaId || !podeEnviar}
      >
        <span className="wa-attachItem-icon wa-attachIcon-pix" aria-hidden="true">
          <IconPix />
        </span>
        <span>{pixActionBusy ? "Enviando Pix..." : "Pix"}</span>
      </button>
      <button
        type="button"
        className="wa-attachItem"
        role="menuitem"
        onClick={() => {
          onClose();
          onOpenPixConfig?.();
        }}
        disabled={pixConfigLoading || sending}
      >
        <span className="wa-attachItem-icon wa-attachIcon-clip" aria-hidden="true">
          <IconSettings2 size={16} strokeWidth={1.6} />
        </span>
        <span>Configurar Pix</span>
      </button>
      <div className="wa-attachDivider" role="separator" />
      <button
        type="button"
        className="wa-attachItem"
        role="menuitem"
        onClick={() => {
          onShareContact?.();
          onClose();
        }}
        disabled={sending || !conversaId || !podeEnviar}
      >
        <span className="wa-attachItem-icon wa-attachIcon-contact" aria-hidden="true">
          <IconUser size={16} strokeWidth={1.6} />
        </span>
        <span>Contato</span>
      </button>
      <button
        type="button"
        className="wa-attachItem"
        role="menuitem"
        onClick={() => {
          onShareLocation?.();
          onClose();
        }}
        disabled={sending || !conversaId || !podeEnviar}
      >
        <span className="wa-attachItem-icon wa-attachIcon-location" aria-hidden="true">
          <IconMapPin size={16} strokeWidth={1.6} />
        </span>
        <span>Localização</span>
      </button>
      {autocorrectToggleInMenu ? (
        <button
          type="button"
          className="wa-attachItem wa-attachItem--autocorrect"
          role="menuitemcheckbox"
          aria-checked={autoCorrectEnabled ? "true" : "false"}
          onClick={() => {
            onUpdateAutoCorrectPreference(!autoCorrectEnabled);
            onClose();
          }}
        >
          <span className="wa-attachItem-icon wa-attachIcon-clip" aria-hidden="true">
            ✓
          </span>
          <span>
            {autoCorrectEnabled ? "Desativar correção automática" : "Ativar correção automática"}
          </span>
        </button>
      ) : null}
    </>
  );

  return (
    <div className="wa-attachWrap" ref={wrapRef}>
      <button
        type="button"
        className={`wa-iconBtn wa-attachPlus ${open ? "isOpen" : ""}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onBeforeOpen();
          onToggle();
        }}
        title="Anexos e mais"
        aria-label="Anexos e mais"
        aria-expanded={open}
        disabled={sending || !conversaId || !podeEnviar}
      >
        <IconPlus />
      </button>
      {open
        ? portal && typeof document !== "undefined"
          ? createPortal(
              <>
                <button
                  type="button"
                  className="wa-attachBackdrop wa-attachBackdrop--portal"
                  aria-label="Fechar opções de anexo"
                  onClick={onClose}
                />
                <div
                  ref={panelRef}
                  className="wa-attachMenu wa-attachMenu--portal"
                  role="menu"
                  aria-label="Anexos"
                >
                  {items}
                </div>
              </>,
              document.body
            )
          : (
              <div ref={panelRef} className="wa-attachMenu" role="menu" aria-label="Anexos">
                {items}
              </div>
            )
        : null}
    </div>
  );
}
