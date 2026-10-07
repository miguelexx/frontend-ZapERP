import { useCallback, useEffect, useRef } from "react";
import {
  LONG_PRESS_MS,
  LONG_PRESS_MOVE_PX,
  MEDIA_TAP_MOVE_PX,
  SKIP_NEXT_MEDIA_TAP_MS,
  MEDIA_POINTER_OPENED_MS,
  LONG_PRESS_IGNORE_SELECTOR,
  LONG_PRESS_IGNORE_BUTTON_OR_LINK,
} from "../utils/gestureConstants";

/** Segura o viewer depois do long-press: o clique fantasma do iOS/Android abre a foto por cima do menu. */
const MEDIA_OPEN_BLOCK_MS = 700;

export function useMessageGestures({
  mobileMessageChrome,
  selectMode,
  menuOpen,
  setMenuOpen,
  onOpenMedia,
}) {
  const longPressTimerRef = useRef(null);
  const longPressCleanupRef = useRef(null);
  const skipNextMediaTapTimerRef = useRef(null);
  const mediaTapStartRef = useRef(null);
  const mediaPointerOpenedRef = useRef(false);
  const mediaPointerOpenedTimerRef = useRef(null);
  const skipNextMediaTapRef = useRef(false);
  const pressMetaRef = useRef(null);
  const longPressCommittedRef = useRef(false);
  const blockMediaOpenUntilRef = useRef(0);

  const clearSkipNextMediaTap = useCallback(() => {
    skipNextMediaTapRef.current = false;
    if (skipNextMediaTapTimerRef.current != null) {
      clearTimeout(skipNextMediaTapTimerRef.current);
      skipNextMediaTapTimerRef.current = null;
    }
  }, []);

  const armSkipNextMediaTap = useCallback(() => {
    clearSkipNextMediaTap();
    skipNextMediaTapRef.current = true;
    blockMediaOpenUntilRef.current = Date.now() + MEDIA_OPEN_BLOCK_MS;
    skipNextMediaTapTimerRef.current = window.setTimeout(() => {
      skipNextMediaTapRef.current = false;
      skipNextMediaTapTimerRef.current = null;
    }, SKIP_NEXT_MEDIA_TAP_MS);
  }, [clearSkipNextMediaTap]);

  const isMediaOpenBlocked = useCallback(() => {
    return (
      longPressCommittedRef.current ||
      skipNextMediaTapRef.current ||
      Date.now() < blockMediaOpenUntilRef.current
    );
  }, []);

  const clearLongPressTracking = useCallback(() => {
    if (longPressTimerRef.current != null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    const rm = longPressCleanupRef.current;
    longPressCleanupRef.current = null;
    if (typeof rm === "function") rm();
  }, []);

  const commitLongPress = useCallback(() => {
    if (longPressCommittedRef.current) {
      blockMediaOpenUntilRef.current = Date.now() + MEDIA_OPEN_BLOCK_MS;
      return;
    }
    longPressCommittedRef.current = true;
    clearLongPressTracking();
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
    } catch (_) {}
    armSkipNextMediaTap();
    setMenuOpen(true);
  }, [armSkipNextMediaTap, clearLongPressTracking, setMenuOpen]);

  const onBubblePointerDown = useCallback(
    (e) => {
      if (!mobileMessageChrome || selectMode || menuOpen) return;
      if (e.button !== 0) return;
      const el = e.target;
      if (el && typeof el.closest === "function") {
        if (el.closest(LONG_PRESS_IGNORE_SELECTOR)) return;
        if (el.closest(LONG_PRESS_IGNORE_BUTTON_OR_LINK)) return;
      }
      clearLongPressTracking();
      longPressCommittedRef.current = false;
      const x0 = e.clientX;
      const y0 = e.clientY;
      const t0 = Date.now();
      pressMetaRef.current = { x: x0, y: y0, t: t0 };

      const movedPastSlop = (ev) =>
        Math.abs(ev.clientX - x0) > LONG_PRESS_MOVE_PX ||
        Math.abs(ev.clientY - y0) > LONG_PRESS_MOVE_PX;

      const onMove = (ev) => {
        if (movedPastSlop(ev)) clearLongPressTracking();
      };
      const onEnd = (ev) => {
        const moved = movedPastSlop(ev);
        const elapsed = Date.now() - t0;
        // Foto/vídeo: o browser manda pointercancel no lugar de pointerup para o menu nativo.
        // Só confirma se o dedo ficou parado o tempo do long-press — rolagem curta não abre o menu.
        if (!moved && elapsed >= LONG_PRESS_MS - 80) {
          commitLongPress();
          return;
        }
        clearLongPressTracking();
      };

      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);

      longPressCleanupRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
      };

      longPressTimerRef.current = window.setTimeout(() => {
        commitLongPress();
      }, LONG_PRESS_MS);
    },
    [mobileMessageChrome, selectMode, menuOpen, clearLongPressTracking, commitLongPress]
  );

  const onBubbleContextMenu = useCallback(
    (e) => {
      if (!mobileMessageChrome) return;
      e.preventDefault();
      if (selectMode || menuOpen) return;
      const el = e.target;
      if (el && typeof el.closest === "function") {
        if (el.closest(LONG_PRESS_IGNORE_SELECTOR)) return;
        if (el.closest(LONG_PRESS_IGNORE_BUTTON_OR_LINK)) return;
      }
      commitLongPress();
    },
    [mobileMessageChrome, selectMode, menuOpen, commitLongPress]
  );

  useEffect(() => () => {
    clearLongPressTracking();
    clearSkipNextMediaTap();
    if (mediaPointerOpenedTimerRef.current != null) {
      clearTimeout(mediaPointerOpenedTimerRef.current);
      mediaPointerOpenedTimerRef.current = null;
    }
  }, [clearLongPressTracking, clearSkipNextMediaTap]);

  const handleMediaPointerDown = useCallback((e) => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") {
      mediaTapStartRef.current = null;
      return;
    }
    mediaTapStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const swallowMediaOpen = useCallback((e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    mediaPointerOpenedRef.current = true;
    if (mediaPointerOpenedTimerRef.current != null) {
      clearTimeout(mediaPointerOpenedTimerRef.current);
    }
    mediaPointerOpenedTimerRef.current = window.setTimeout(() => {
      mediaPointerOpenedRef.current = false;
      mediaPointerOpenedTimerRef.current = null;
    }, MEDIA_POINTER_OPENED_MS);
  }, []);

  const openMediaFromEvent = useCallback(
    (e, url, kind) => {
      if (selectMode) return;
      e?.stopPropagation?.();
      if (isMediaOpenBlocked()) {
        swallowMediaOpen(e);
        clearSkipNextMediaTap();
        return;
      }
      clearLongPressTracking();
      onOpenMedia?.(url, kind);
    },
    [clearLongPressTracking, clearSkipNextMediaTap, isMediaOpenBlocked, onOpenMedia, selectMode, swallowMediaOpen]
  );

  const handleMediaPointerUp = useCallback(
    (e, url, kind) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      if (selectMode) return;
      const start = mediaTapStartRef.current;
      mediaTapStartRef.current = null;
      if (!start) return;
      const moved =
        Math.abs(e.clientX - start.x) > MEDIA_TAP_MOVE_PX ||
        Math.abs(e.clientY - start.y) > MEDIA_TAP_MOVE_PX;
      if (moved) {
        clearLongPressTracking();
        return;
      }
      const elapsed = pressMetaRef.current ? Date.now() - pressMetaRef.current.t : 0;
      if (isMediaOpenBlocked() || elapsed >= LONG_PRESS_MS - 80) {
        swallowMediaOpen(e);
        if (elapsed >= LONG_PRESS_MS - 80) commitLongPress();
        return;
      }
      // Toque curto: cancela o long-press antes do stopPropagation do viewer.
      clearLongPressTracking();
      e.preventDefault();
      mediaPointerOpenedRef.current = true;
      if (mediaPointerOpenedTimerRef.current != null) {
        clearTimeout(mediaPointerOpenedTimerRef.current);
      }
      mediaPointerOpenedTimerRef.current = window.setTimeout(() => {
        mediaPointerOpenedRef.current = false;
        mediaPointerOpenedTimerRef.current = null;
      }, MEDIA_POINTER_OPENED_MS);
      openMediaFromEvent(e, url, kind);
    },
    [clearLongPressTracking, commitLongPress, isMediaOpenBlocked, openMediaFromEvent, selectMode, swallowMediaOpen]
  );

  const handleMediaClick = useCallback(
    (e, url, kind) => {
      if (mediaPointerOpenedRef.current) {
        mediaPointerOpenedRef.current = false;
        e?.stopPropagation?.();
        return;
      }
      openMediaFromEvent(e, url, kind);
    },
    [openMediaFromEvent]
  );

  return {
    onBubblePointerDown,
    onBubbleContextMenu,
    handleMediaPointerDown,
    handleMediaPointerUp,
    handleMediaClick,
    clearSkipNextMediaTap,
    clearLongPressTracking,
  };
}
