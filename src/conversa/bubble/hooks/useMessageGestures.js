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
    skipNextMediaTapTimerRef.current = window.setTimeout(() => {
      skipNextMediaTapRef.current = false;
      skipNextMediaTapTimerRef.current = null;
    }, SKIP_NEXT_MEDIA_TAP_MS);
  }, [clearSkipNextMediaTap]);

  const clearLongPressTracking = useCallback(() => {
    if (longPressTimerRef.current != null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    const rm = longPressCleanupRef.current;
    longPressCleanupRef.current = null;
    if (typeof rm === "function") rm();
  }, []);

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
      const x0 = e.clientX;
      const y0 = e.clientY;

      const onMove = (ev) => {
        if (
          Math.abs(ev.clientX - x0) > LONG_PRESS_MOVE_PX ||
          Math.abs(ev.clientY - y0) > LONG_PRESS_MOVE_PX
        ) {
          clearLongPressTracking();
        }
      };
      const onEnd = () => {
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
        longPressTimerRef.current = null;
        const rmListeners = longPressCleanupRef.current;
        longPressCleanupRef.current = null;
        if (typeof rmListeners === "function") rmListeners();
        try {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
        } catch (_) {}
        armSkipNextMediaTap();
        setMenuOpen(true);
      }, LONG_PRESS_MS);
    },
    [mobileMessageChrome, selectMode, menuOpen, clearLongPressTracking, armSkipNextMediaTap, setMenuOpen]
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

  const openMediaFromEvent = useCallback(
    (e, url, kind) => {
      if (selectMode) return;
      clearLongPressTracking();
      e?.stopPropagation?.();
      if (skipNextMediaTapRef.current) {
        clearSkipNextMediaTap();
        return;
      }
      onOpenMedia?.(url, kind);
    },
    [clearLongPressTracking, clearSkipNextMediaTap, onOpenMedia, selectMode]
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
      clearLongPressTracking();
      if (moved) return;
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
    [clearLongPressTracking, openMediaFromEvent, selectMode]
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
    handleMediaPointerDown,
    handleMediaPointerUp,
    handleMediaClick,
    clearSkipNextMediaTap,
    clearLongPressTracking,
  };
}
