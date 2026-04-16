import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useConversationActionMenu({ selectedConversationId, visibleConversationIds }) {
  const [openConversationId, setOpenConversationId] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const [restoreFocusEl, setRestoreFocusEl] = useState(null);
  const restoreFocusRef = useRef(null);
  const prevSelectedRef = useRef(selectedConversationId);

  const closeMenu = useCallback(() => {
    setOpenConversationId(null);
    setAnchorRect(null);
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    setRestoreFocusEl(null);
    if (target && typeof target.focus === "function") {
      requestAnimationFrame(() => target.focus());
    }
  }, []);

  const openMenu = useCallback((conversationId, triggerEl) => {
    if (!conversationId || !triggerEl) return;
    const nextId = String(conversationId);
    if (openConversationId === nextId) {
      closeMenu();
      return;
    }
    const rect = triggerEl.getBoundingClientRect();
    restoreFocusRef.current = triggerEl;
    setRestoreFocusEl(triggerEl);
    setAnchorRect(rect);
    setOpenConversationId(nextId);
  }, [closeMenu, openConversationId]);

  useEffect(() => {
    if (!openConversationId) return;
    const onWindowChange = () => setAnchorRect((prev) => {
      if (!prev || !restoreFocusRef.current) return prev;
      return restoreFocusRef.current.getBoundingClientRect();
    });
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);
    return () => {
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
    };
  }, [openConversationId]);

  useEffect(() => {
    if (!openConversationId) return;
    const prevSelected = prevSelectedRef.current;
    prevSelectedRef.current = selectedConversationId;
    if (prevSelected == null || selectedConversationId == null) return;
    if (String(prevSelected) === String(selectedConversationId)) return;
    closeMenu();
  }, [selectedConversationId, openConversationId, closeMenu]);

  useEffect(() => {
    if (!openConversationId) return;
    if (!Array.isArray(visibleConversationIds)) return;
    const exists = visibleConversationIds.some((id) => String(id) === String(openConversationId));
    if (!exists) closeMenu();
  }, [visibleConversationIds, openConversationId, closeMenu]);

  return useMemo(() => ({
    openConversationId,
    anchorRect,
    restoreFocusEl,
    openMenu,
    closeMenu,
  }), [openConversationId, anchorRect, restoreFocusEl, openMenu, closeMenu]);
}

