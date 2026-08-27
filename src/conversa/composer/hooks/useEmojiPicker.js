import { useCallback, useEffect, useRef, useState } from "react";

export function useEmojiPicker({ texto, setTexto, inputRef }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panelRef = useRef(null);
  const searchRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const insert = useCallback((emoji) => {
    const value = String(emoji || "");
    if (!value) return;
    const input = inputRef.current;
    if (!input) {
      setTexto((previous) => (previous ? `${previous}${value}` : value));
      return;
    }
    const current = String(texto || "");
    const start = typeof input.selectionStart === "number" ? input.selectionStart : current.length;
    const end = typeof input.selectionEnd === "number" ? input.selectionEnd : current.length;
    const next = current.slice(0, start) + value + current.slice(end);
    setTexto(next);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          input.focus({ preventScroll: true });
          const position = start + value.length;
          input.setSelectionRange?.(position, position);
        } catch {
          /* ignore */
        }
      });
    });
  }, [inputRef, setTexto, texto]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocumentPointer = (event) => {
      if (panelRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener("mousedown", onDocumentPointer);
    requestAnimationFrame(() => searchRef.current?.focus?.());
    return () => document.removeEventListener("mousedown", onDocumentPointer);
  }, [close, open]);

  return { open, setOpen, query, setQuery, panelRef, searchRef, close, insert };
}
