import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clamp, getVisualViewportLayout } from "../../utils/conversaViewHelpers";

function shallowStyleEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export function useMessageMenu({ menuUsesBottomSheet } = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const menuAnchorRef = useRef(null);
  const menuBtnRef = useRef(null);
  const menuElRef = useRef(null);
  const prevStyleRef = useRef(null);
  const menuPointRef = useRef(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Desktop: clique-direito abre o menu ancorado no cursor (estilo WhatsApp Web).
  const openMenuAtPoint = useCallback((x, y) => {
    menuPointRef.current = { x, y };
    setMenuOpen(true);
  }, []);

  // Evita re-render redundante: só publica o estilo quando algum valor realmente muda
  // (o reflow no sheet recomputa a cada resize do teclado/rotação).
  const applyMenuStyle = useCallback((next) => {
    if (shallowStyleEqual(prevStyleRef.current, next)) return;
    prevStyleRef.current = next;
    setMenuStyle(next);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      prevStyleRef.current = null;
      menuPointRef.current = null;
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      const a = menuAnchorRef.current;
      const m = menuElRef.current;
      if (a && a.contains(e.target)) return;
      if (m && m.contains(e.target)) return;
      setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const computeMenuPosition = useCallback(() => {
    const anchorEl = menuBtnRef.current || menuAnchorRef.current;
    if (!anchorEl) return;
    const { innerWidth: vw, visibleHeight, visibleTop, keyboardInsetBottom } = getVisualViewportLayout();
    const visibleBottom = visibleTop + visibleHeight;

    if (menuUsesBottomSheet) {
      const bottomPx = Math.max(8, keyboardInsetBottom + 6);
      const maxSheetPx = Math.max(200, Math.floor(visibleHeight - bottomPx - 14));
      applyMenuStyle({
        position: "fixed",
        left: 10,
        right: 10,
        width: "auto",
        bottom: `${bottomPx}px`,
        top: "auto",
        maxHeight: `${maxSheetPx}px`,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
        zIndex: 10002,
        transformOrigin: "bottom center",
      });
      return;
    }

    // Clique-direito (desktop): menu ancorado no ponto do cursor, abrindo para a
    // direita/baixo e virando quando não cabe — comportamento de context-menu nativo.
    const point = menuPointRef.current;
    if (point) {
      const desiredW = 268;
      const w = Math.max(220, Math.min(desiredW, vw - 16));
      const menuH = Math.max(menuElRef.current?.offsetHeight || 0, 300);

      let left = point.x + 2;
      if (left + w > vw - 8) left = point.x - w - 2;
      left = clamp(left, 8, Math.max(8, vw - w - 8));

      const spaceBelow = visibleBottom - point.y - 10;
      const spaceAbove = point.y - visibleTop - 10;
      let placedV = "down";
      let top = point.y + 2;
      let maxHeight = Math.max(200, spaceBelow);
      if (top + Math.min(menuH, maxHeight) > visibleBottom - 8 && spaceAbove > spaceBelow) {
        placedV = "up";
        top = Math.max(visibleTop + 8, point.y - menuH - 2);
        maxHeight = Math.max(200, spaceAbove);
      }
      if (maxHeight < menuH - 12) {
        const fitH = Math.min(menuH, visibleHeight - 16);
        top = visibleTop + Math.max(8, (visibleHeight - fitH) / 2);
        maxHeight = fitH;
      }
      top = clamp(top, visibleTop + 8, Math.max(visibleTop + 8, visibleBottom - Math.min(menuH, maxHeight) - 8));

      applyMenuStyle({
        position: "fixed",
        top,
        left,
        width: w,
        maxHeight,
        overflowY: maxHeight < menuH - 4 ? "auto" : "visible",
        WebkitOverflowScrolling: "touch",
        zIndex: 10002,
        transformOrigin: `${placedV === "up" ? "bottom" : "top"} left`,
      });
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    const desiredW = 220;
    const w = Math.max(180, Math.min(desiredW, vw - 16));

    let left = rect.right - w;
    left = clamp(left, 8, Math.max(8, vw - w - 8));

    const menuH = Math.max(menuElRef.current?.offsetHeight || 0, 300);
    const spaceBelow = visibleBottom - rect.bottom - 10;
    const spaceAbove = rect.top - visibleTop - 10;
    const openDown = spaceBelow >= spaceAbove;

    let placed = openDown ? "down" : "up";
    let top = openDown ? rect.bottom + 6 : Math.max(visibleTop + 8, rect.top - menuH - 6);
    let maxHeight = Math.max(200, openDown ? spaceBelow : spaceAbove);

    if (openDown && top + menuH > visibleBottom - 8 && spaceAbove > spaceBelow) {
      placed = "up";
      top = Math.max(visibleTop + 8, rect.top - menuH - 6);
      maxHeight = Math.max(200, spaceAbove);
    } else if (!openDown && top < visibleTop + 8 && spaceBelow >= spaceAbove) {
      placed = "down";
      top = rect.bottom + 6;
      maxHeight = Math.max(200, spaceBelow);
    }

    if (maxHeight < menuH - 12) {
      const fitH = Math.min(menuH, visibleHeight - 16);
      top = visibleTop + Math.max(8, (visibleHeight - fitH) / 2);
      maxHeight = fitH;
      placed = "center";
    }

    top = clamp(top, visibleTop + 8, Math.max(visibleTop + 8, visibleBottom - Math.min(menuH, maxHeight) - 8));

    applyMenuStyle({
      position: "fixed",
      top,
      left,
      width: w,
      maxHeight,
      overflowY: maxHeight < menuH - 4 ? "auto" : "visible",
      WebkitOverflowScrolling: "touch",
      zIndex: 10002,
      transformOrigin: `${placed === "up" ? "bottom" : "top"} ${Math.round(clamp(rect.right - left, 0, w))}px`,
    });
  }, [menuUsesBottomSheet, applyMenuStyle]);

  useLayoutEffect(() => {
    if (!menuOpen || menuUsesBottomSheet) return;
    computeMenuPosition();
    const raf = requestAnimationFrame(() => computeMenuPosition());
    return () => cancelAnimationFrame(raf);
  }, [menuOpen, menuUsesBottomSheet, computeMenuPosition]);

  useEffect(() => {
    if (!menuOpen) return;
    const tick = () => computeMenuPosition();
    tick();
    const raf = requestAnimationFrame(tick);

    const onReflow = () => computeMenuPosition();
    window.addEventListener("resize", onReflow);
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    vv?.addEventListener("resize", onReflow);
    // No sheet a posição é fixa ao rodapé (só muda com teclado/rotação → resize). Ouvir
    // scroll do documento aqui recomputava a cada tick de rolagem DENTRO do próprio sheet,
    // gerando re-render em cascata e travando a lista de opções. Só o menu ancorado (desktop)
    // precisa seguir o scroll da thread.
    if (!menuUsesBottomSheet) {
      vv?.addEventListener("scroll", onReflow);
      document.addEventListener("scroll", onReflow, true);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onReflow);
      vv?.removeEventListener("resize", onReflow);
      vv?.removeEventListener("scroll", onReflow);
      document.removeEventListener("scroll", onReflow, true);
    };
  }, [menuOpen, menuUsesBottomSheet, computeMenuPosition]);

  return {
    menuOpen,
    setMenuOpen,
    closeMenu,
    openMenuAtPoint,
    menuStyle,
    menuAnchorRef,
    menuBtnRef,
    menuElRef,
  };
}
