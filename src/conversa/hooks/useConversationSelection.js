import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FORWARD_SELECT_MAX } from "../conversaConstants";
import { snippetFromMsg } from "../utils/conversaMessageDisplay";
import {
  captureMessagesScrollAnchor,
} from "../scrollUtils";

export function useConversationSelection({
  conversaId,
  messagesContainerRef,
  showToast,
  onConversationChange,
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState({});
  const [selectionOrder, setSelectionOrder] = useState([]);
  const selectionOrderRef = useRef([]);
  const selectModeAnchorRef = useRef(null);
  const [forwardSelectIntent, setForwardSelectIntent] = useState(false);
  const [pinnedIds, setPinnedIds] = useState([]);
  const [starredIds, setStarredIds] = useState([]);

  useEffect(() => {
    selectModeAnchorRef.current = null;
    setSelectMode(false);
    setSelectedMsgIds({});
    selectionOrderRef.current = [];
    setSelectionOrder([]);
    setForwardSelectIntent(false);
    onConversationChange?.();

    if (!conversaId) {
      setPinnedIds([]);
      setStarredIds([]);
      return;
    }

    try {
      const pins = JSON.parse(localStorage.getItem(`zap:pins:${conversaId}`) || "[]");
      const stars = JSON.parse(localStorage.getItem(`zap:stars:${conversaId}`) || "[]");
      setPinnedIds(Array.isArray(pins) ? pins : []);
      setStarredIds(Array.isArray(stars) ? stars : []);
    } catch {
      setPinnedIds([]);
      setStarredIds([]);
    }
  }, [conversaId, onConversationChange]);

  const persistPins = useCallback((next) => {
    if (!conversaId) return;
    try {
      localStorage.setItem(`zap:pins:${conversaId}`, JSON.stringify(next || []));
    } catch {}
  }, [conversaId]);

  const persistStars = useCallback((next) => {
    if (!conversaId) return;
    try {
      localStorage.setItem(`zap:stars:${conversaId}`, JSON.stringify(next || []));
    } catch {}
  }, [conversaId]);

  const togglePin = useCallback((msg) => {
    if (!msg?.id || !conversaId) return;
    setPinnedIds((cur) => {
      const id = String(msg.id);
      const has = (cur || []).map(String).includes(id);
      const next = has ? (cur || []).filter((x) => String(x) !== id) : [...(cur || []), id];
      persistPins(next);
      showToast({ type: "info", title: has ? "Desafixada" : "Fixada", message: snippetFromMsg(msg) });
      return next;
    });
  }, [conversaId, persistPins, showToast]);

  const toggleStar = useCallback((msg) => {
    if (!msg?.id || !conversaId) return;
    setStarredIds((cur) => {
      const id = String(msg.id);
      const has = (cur || []).map(String).includes(id);
      const next = has ? (cur || []).filter((x) => String(x) !== id) : [...(cur || []), id];
      persistStars(next);
      showToast({ type: "info", title: has ? "Removida dos favoritos" : "Favoritada", message: snippetFromMsg(msg) });
      return next;
    });
  }, [conversaId, persistStars, showToast]);

  const startSelect = useCallback((msg) => {
    if (!msg?.id || msg.apagada_para_todos) return;
    selectModeAnchorRef.current = captureMessagesScrollAnchor(messagesContainerRef.current);
    setForwardSelectIntent(false);
    setSelectMode(true);
    const key = String(msg.id);
    setSelectedMsgIds((cur) => {
      const next = { ...(cur || {}), [key]: true };
      let ord = selectionOrderRef.current;
      ord = ord.includes(key) ? ord : [...ord, key];
      selectionOrderRef.current = ord;
      setSelectionOrder(ord);
      return next;
    });
  }, [messagesContainerRef]);

  const toggleSelected = useCallback(
    (msg) => {
      if (!msg?.id || msg.apagada_para_todos) return;
      setSelectedMsgIds((cur) => {
        const key = String(msg.id);
        const wasOn = !!cur[key];
        const nextOn = !wasOn;
        let ord = selectionOrderRef.current;
        if (nextOn && forwardSelectIntent && ord.length >= FORWARD_SELECT_MAX && !ord.includes(key)) {
          showToast({
            type: "warning",
            title: "Limite",
            message: `No máximo ${FORWARD_SELECT_MAX} mensagens por encaminhamento.`,
          });
          return cur;
        }
        ord = nextOn ? (ord.includes(key) ? ord : [...ord, key]) : ord.filter((k) => k !== key);
        selectionOrderRef.current = ord;
        setSelectionOrder(ord);
        return { ...cur, [key]: nextOn };
      });
    },
    [forwardSelectIntent, showToast]
  );

  const exitSelectMode = useCallback(() => {
    selectModeAnchorRef.current = captureMessagesScrollAnchor(messagesContainerRef.current);
    selectionOrderRef.current = [];
    setSelectionOrder([]);
    setSelectedMsgIds({});
    setSelectMode(false);
    setForwardSelectIntent(false);
  }, [messagesContainerRef]);

  const pinnedSet = useMemo(() => new Set((pinnedIds || []).map(String)), [pinnedIds]);
  const starredSet = useMemo(() => new Set((starredIds || []).map(String)), [starredIds]);
  const selectedSet = useMemo(
    () => new Set(Object.keys(selectedMsgIds || {}).filter((k) => selectedMsgIds[k])),
    [selectedMsgIds]
  );
  const orderedSelectedIds = useMemo(
    () => (selectionOrder || []).filter((id) => selectedMsgIds?.[id]),
    [selectionOrder, selectedMsgIds]
  );

  return {
    selectMode,
    selectedMsgIds,
    selectionOrder,
    selectionOrderRef,
    selectModeAnchorRef,
    forwardSelectIntent,
    setForwardSelectIntent,
    pinnedIds,
    starredIds,
    pinnedSet,
    starredSet,
    selectedSet,
    orderedSelectedIds,
    togglePin,
    toggleStar,
    startSelect,
    toggleSelected,
    exitSelectMode,
  };
}
