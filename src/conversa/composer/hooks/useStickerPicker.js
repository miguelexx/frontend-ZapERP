import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readRecentStickers, safeString } from "../utils/composerUtils";

export function useStickerPicker(user) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState([]);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const buttonRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    setRecent(readRecentStickers(user));
  }, [user?.id, user?.company_id, user?.empresa_id]);

  useEffect(() => {
    if (open) setRecent(readRecentStickers(user));
  }, [open, user?.id, user?.company_id, user?.empresa_id]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocumentPointer = (event) => {
      if (panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener("mousedown", onDocumentPointer);
    requestAnimationFrame(() => searchRef.current?.focus?.());
    return () => document.removeEventListener("mousedown", onDocumentPointer);
  }, [close, open]);

  const filtered = useMemo(() => recent.filter((item) => {
    if (!safeString(query)) return true;
    return safeString(item?.name).toLowerCase().includes(safeString(query).toLowerCase());
  }), [query, recent]);

  return {
    open,
    setOpen,
    query,
    setQuery,
    panelRef,
    searchRef,
    buttonRef,
    close,
    filtered,
  };
}
