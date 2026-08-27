import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clamp, getVisualViewportLayout } from "../../utils/conversaViewHelpers";

export function useMessageMenu({ menuUsesBottomSheet } = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const menuAnchorRef = useRef(null);
  const menuBtnRef = useRef(null);
  const menuElRef = useRef(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

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
      setMenuStyle({
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

    setMenuStyle({
      position: "fixed",
      top,
      left,
      width: w,
      maxHeight,
      overflowY: maxHeight < menuH - 4 ? "auto" : "visible",
      WebkitOverflowScrolling: "touch",
      zIndex: 10002,
    });
  }, [menuUsesBottomSheet]);

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
    vv?.addEventListener("scroll", onReflow);
    document.addEventListener("scroll", onReflow, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onReflow);
      vv?.removeEventListener("resize", onReflow);
      vv?.removeEventListener("scroll", onReflow);
      document.removeEventListener("scroll", onReflow, true);
    };
  }, [menuOpen, computeMenuPosition]);

  return {
    menuOpen,
    setMenuOpen,
    closeMenu,
    menuStyle,
    menuAnchorRef,
    menuBtnRef,
    menuElRef,
  };
}
