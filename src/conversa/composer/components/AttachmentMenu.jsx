import { memo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import useMotionPresence from "../../../components/ui/useMotionPresence";
import { useMobileOverlayBack } from "../../../atendimento/useMobileOverlayBack";
import {
  IconCamera as TablerCamera,
  IconChartBar,
  IconFileText,
  IconMapPin,
  IconPhoto,
  IconSettings2,
  IconShoppingBag,
  IconTextSpellcheck,
  IconUser,
} from "@tabler/icons-react";
import {
  IconClose,
  IconPix,
  IconPlus,
  IconSavedReplies,
} from "../../conversaComposerIcons";

function AttachmentMenu({
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
  onOpenPoll,
  onOpenCatalog,
  onUpdateAutoCorrectPreference,
}) {
  const motion = useMotionPresence(open);
  const motionProps = { "data-motion-state": motion.state, inert: !open ? "" : undefined, "aria-hidden": !open || undefined };
  /*
   * Teclado (26/11/2026): aberto por Enter/Espaço no "+", o foco vai ao 1.º item e as setas
   * andam pelo menu; ao fechar, volta ao "+". Aberto por rato/toque nada muda (o foco fica no
   * campo e o teclado do celular não abre/fecha).
   */
  const openedByKeyboardRef = useRef(false);
  const plusBtnRef = useRef(null);
  /* "Voltar" do celular fecha o menu de anexos, não a conversa (27/11/2026). */
  useMobileOverlayBack(Boolean(open), onClose, "attach");
  /*
   * Item ativado (Contato, Enquete, Respostas salvas…): a superfície que ele abre é dona do
   * foco. Devolver ao "+" punha o foco ATRÁS do modal recém-aberto — o Enter seguinte reabria
   * o menu por baixo dele. Só ESC, o X e o clique fora devolvem o foco ao "+" (27/11/2026).
   */
  const onPanelClickCapture = (e) => {
    if (e.target?.closest?.(".wa-attachItem")) openedByKeyboardRef.current = false;
  };
  useEffect(() => {
    if (open) {
      if (!openedByKeyboardRef.current) return undefined;
      const id = requestAnimationFrame(() => {
        panelRef?.current?.querySelector?.(".wa-attachItem:not(:disabled)")?.focus?.();
      });
      return () => cancelAnimationFrame(id);
    }
    if (openedByKeyboardRef.current) {
      openedByKeyboardRef.current = false;
      plusBtnRef.current?.focus?.();
    }
    return undefined;
  }, [open, panelRef]);
  const onMenuKeyDown = (e) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const list = Array.from(e.currentTarget.querySelectorAll(".wa-attachItem:not(:disabled)"));
    if (!list.length) return;
    e.preventDefault();
    const i = list.indexOf(document.activeElement);
    let n = 0;
    if (e.key === "End") n = list.length - 1;
    else if (e.key === "ArrowDown") n = i < 0 ? 0 : (i + 1) % list.length;
    else if (e.key === "ArrowUp") n = i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length;
    list[n]?.focus?.();
  };
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
        <span>Fotos e vídeos</span>
      </button>
      {/*
       * Havia aqui um segundo item "Galeria" com onClick IDÊNTICO (onOpenGallery) — dois
       * rótulos e dois ícones para exatamente a mesma ação, o que só fazia o atendente
       * parar para decidir entre opções iguais (auditoria 10/10/2026).
       */}
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
      <button
        type="button"
        className="wa-attachItem"
        role="menuitem"
        onClick={() => {
          onOpenPoll?.();
          onClose();
        }}
        disabled={sending || !conversaId || !podeEnviar}
      >
        <span className="wa-attachItem-icon wa-attachIcon-poll" aria-hidden="true">
          <IconChartBar size={16} strokeWidth={1.6} />
        </span>
        <span>Enquete</span>
      </button>
      {onOpenCatalog ? (
        <button
          type="button"
          className="wa-attachItem"
          role="menuitem"
          onClick={() => {
            onOpenCatalog();
            onClose();
          }}
          disabled={sending || !conversaId || !podeEnviar}
        >
          <span className="wa-attachItem-icon wa-attachIcon-catalog" aria-hidden="true">
            <IconShoppingBag size={16} strokeWidth={1.6} />
          </span>
          <span>Catálogo</span>
        </button>
      ) : null}
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
            <IconTextSpellcheck size={16} strokeWidth={1.6} />
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
        ref={plusBtnRef}
        type="button"
        className={`wa-iconBtn wa-attachPlus ${open ? "isOpen" : ""}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          openedByKeyboardRef.current = !open && event.detail === 0;
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
      {motion.present
        ? portal && typeof document !== "undefined"
          ? createPortal(
              <>
                <button
                  type="button"
                  className="wa-attachBackdrop wa-attachBackdrop--portal"
                  aria-label="Fechar opções de anexo"
                  onClick={onClose}
                  style={!open ? { pointerEvents: "none" } : undefined}
                />
                <div
                  ref={panelRef}
                  {...motionProps}
                  className="wa-attachMenu wa-attachMenu--portal"
                  role="menu"
                  aria-label="Anexos"
                  onKeyDown={onMenuKeyDown}
                  onClickCapture={onPanelClickCapture}
                >
                  {items}
                </div>
              </>,
              document.body
            )
          : (
              <div
                ref={panelRef}
                {...motionProps}
                className="wa-attachMenu"
                role="menu"
                aria-label="Anexos"
                onKeyDown={onMenuKeyDown}
                onClickCapture={onPanelClickCapture}
              >
                {items}
              </div>
            )
        : null}
    </div>
  );
}

/*
 * Memoizado: os itens do menu não dependem do texto digitado. Com os callbacks
 * do ComposerFooter agora estáveis, digitar não re-renderiza nem reconstrói a
 * árvore de ~12 itens do menu (que fica montada para a animação de abrir/fechar).
 */
export default memo(AttachmentMenu);
