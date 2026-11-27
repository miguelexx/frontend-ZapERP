import { useCallback, useEffect, useRef } from "react";

/*
 * Teclado de menu (26/11/2026) — "Mais opções" do cabeçalho (desktop) e o menu ⋯ da barra
 * de ações (celular/tablet). Antes: `role="menu"` sem `menuitem`, o foco ficava no gatilho
 * e as setas não faziam nada. Mesmo contrato do EncerrarSplitButton:
 *
 *  - ao abrir, foca o 1.º item habilitado UMA vez por abertura (a posição do menu muda com
 *    scroll/resize e refocar roubaria o item escolhido);
 *  - ↑/↓ circulam, Home/End vão às pontas;
 *  - Esc fecha e devolve o foco ao gatilho (preventDefault: o ESC global sairia da conversa);
 *  - Tab fecha e devolve o foco ao gatilho (o menu vive num portal no fim do body: deixar o
 *    Tab seguir o levaria para fora da conversa).
 */

const ITEM_SEL = '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])';

function itensDo(menu) {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll(ITEM_SEL));
}

/**
 * @param {object} p
 * @param {boolean} p.open
 * @param {{ current: HTMLElement | null }} p.menuRef
 * @param {{ current: HTMLElement | null }} p.triggerRef
 * @param {() => void} p.onClose
 */
export function useMenuKeyboard({ open, menuRef, triggerRef, onClose }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    let frame = 0;
    let tentativas = 0;
    // O menu do celular só monta depois de medir a posição do gatilho (layout effect + render);
    // espera alguns frames por ele em vez de depender da ordem dos efeitos.
    const tentar = () => {
      const items = itensDo(menuRef.current);
      if (items.length > 0) {
        if (!menuRef.current.contains(document.activeElement)) {
          try {
            items[0].focus({ preventScroll: true });
          } catch {
            items[0].focus();
          }
        }
        return;
      }
      tentativas += 1;
      if (tentativas < 6) frame = window.requestAnimationFrame(tentar);
    };
    frame = window.requestAnimationFrame(tentar);
    return () => window.cancelAnimationFrame(frame);
  }, [open, menuRef]);

  const refocusTrigger = useCallback(() => {
    window.requestAnimationFrame(() => {
      const t = triggerRef.current;
      if (t && document.contains(t)) {
        try {
          t.focus({ preventScroll: true });
        } catch {
          t.focus();
        }
      }
    });
  }, [triggerRef]);

  const onMenuKeyDown = useCallback(
    (e) => {
      const items = itensDo(menuRef.current);
      const idx = items.indexOf(document.activeElement);
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          onCloseRef.current?.();
          refocusTrigger();
          break;
        case "Tab":
          e.preventDefault();
          onCloseRef.current?.();
          refocusTrigger();
          break;
        case "ArrowDown":
        case "ArrowUp": {
          e.preventDefault();
          if (!items.length) return;
          const delta = e.key === "ArrowDown" ? 1 : -1;
          const next = idx === -1 ? (delta > 0 ? 0 : items.length - 1) : (idx + delta + items.length) % items.length;
          items[next]?.focus();
          break;
        }
        case "Home":
        case "End":
          e.preventDefault();
          (e.key === "Home" ? items[0] : items[items.length - 1])?.focus();
          break;
        default:
          break;
      }
    },
    [menuRef, refocusTrigger]
  );

  return { onMenuKeyDown, refocusTrigger };
}
