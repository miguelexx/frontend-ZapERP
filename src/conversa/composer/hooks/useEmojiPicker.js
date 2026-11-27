import { useCallback, useEffect, useRef, useState } from "react";

export function useEmojiPicker({ texto, setTexto, inputRef }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const buttonRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  /*
   * Toque (27/11/2026): focar o campo depois de cada emoji, ainda dentro do gesto, fazia o
   * Chrome do Android abrir o teclado POR CIMA do painel a cada escolha. Como no WhatsApp, com
   * o campo sem foco o painel continua no lugar: o texto entra sem foco e a posição do cursor
   * fica guardada aqui (o React move a seleção para o fim ao trocar o valor). Desktop e campo
   * já focado: igual a antes.
   */
  const caretRef = useRef(null);

  const insert = useCallback((emoji) => {
    const value = String(emoji || "");
    if (!value) return;
    const input = inputRef.current;
    if (!input) {
      setTexto((previous) => (previous ? `${previous}${value}` : value));
      return;
    }
    const current = String(texto || "");
    const hadFocus = typeof document !== "undefined" && document.activeElement === input;
    let start;
    let end;
    if (!hadFocus && caretRef.current && caretRef.current.texto === current) {
      start = Math.min(caretRef.current.pos, current.length);
      end = start;
    } else {
      start = typeof input.selectionStart === "number" ? input.selectionStart : current.length;
      end = typeof input.selectionEnd === "number" ? input.selectionEnd : current.length;
    }
    const next = current.slice(0, start) + value + current.slice(end);
    caretRef.current = { pos: start + value.length, texto: next };
    setTexto(next);
    let coarse = false;
    try {
      coarse = window.matchMedia?.("(pointer: coarse)")?.matches === true;
    } catch {
      coarse = false;
    }
    if (!hadFocus && coarse) return;
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
      if (panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener("mousedown", onDocumentPointer);
    requestAnimationFrame(() => searchRef.current?.focus?.());
    return () => document.removeEventListener("mousedown", onDocumentPointer);
  }, [close, open]);

  return { open, setOpen, query, setQuery, panelRef, searchRef, buttonRef, close, insert };
}
