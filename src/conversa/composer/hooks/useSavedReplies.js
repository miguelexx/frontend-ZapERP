import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRespostasSalvas } from "../../../api/configService";
import { getSlashContext } from "../utils/composerUtils";

export function useSavedReplies({ conversaId, departamentoId }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viaPicker, setViaPicker] = useState(false);
  const panelRef = useRef(null);
  const cacheRef = useRef({ depKey: null, list: null });
  const slashContextRef = useRef(null);
  const modeRef = useRef("slash");
  const requestGenerationRef = useRef(0);

  const close = useCallback(() => {
    slashContextRef.current = null;
    modeRef.current = "slash";
    setViaPicker(false);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setError(null);
  }, []);

  const openPicker = useCallback(() => {
    modeRef.current = "picker";
    slashContextRef.current = null;
    setViaPicker(true);
    setQuery("");
    setError(null);
    setOpen(true);
  }, []);

  const syncSlashContext = useCallback((value, cursor) => {
    const slashContext = getSlashContext(value, cursor);
    if (!slashContext) return false;
    slashContextRef.current = slashContext;
    modeRef.current = "slash";
    setViaPicker(false);
    setOpen(true);
    setQuery(slashContext.query);
    setError(null);
    return true;
  }, []);

  const insert = useCallback(({ replyText, texto, input, setTexto }) => {
    const text = String(replyText || "");
    if (!text) return;
    const mode = modeRef.current;

    if (mode === "slash") {
      const context = slashContextRef.current;
      if (!context) return;
      const current = String(texto || "");
      const next = current.slice(0, context.start) + text + current.slice(context.end);
      close();
      setTexto(next);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            input?.focus({ preventScroll: true });
            const position = context.start + text.length;
            input?.setSelectionRange?.(position, position);
          } catch {
            /* ignore */
          }
        });
      });
      return;
    }

    const current = String(texto || "");
    const start = typeof input?.selectionStart === "number" ? input.selectionStart : current.length;
    const end = typeof input?.selectionEnd === "number" ? input.selectionEnd : current.length;
    const next = current.slice(0, start) + text + current.slice(end);
    close();
    setTexto(next);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          input?.focus({ preventScroll: true });
          const position = start + text.length;
          input?.setSelectionRange?.(position, position);
        } catch {
          /* ignore */
        }
      });
    });
  }, [close]);

  useEffect(() => {
    if (!open || !conversaId) return undefined;
    const depKey = departamentoId != null ? String(departamentoId) : "none";
    const cached = cacheRef.current;
    if (cached.depKey === depKey && Array.isArray(cached.list)) {
      setList(cached.list);
      return undefined;
    }
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    setLoading(true);
    setError(null);
    getRespostasSalvas(departamentoId ?? null, { contexto: "atendimento" })
      .then((result) => {
        if (generation !== requestGenerationRef.current) return;
        const replies = Array.isArray(result) ? result : [];
        cacheRef.current = { depKey, list: replies };
        setList(replies);
      })
      .catch(() => {
        if (generation !== requestGenerationRef.current) return;
        setList([]);
        setError("Não foi possível carregar respostas salvas.");
      })
      .finally(() => {
        if (generation === requestGenerationRef.current) setLoading(false);
      });
    return () => {
      if (generation === requestGenerationRef.current) requestGenerationRef.current += 1;
    };
  }, [open, conversaId, departamentoId]);

  useEffect(() => {
    requestGenerationRef.current += 1;
    cacheRef.current = { depKey: null, list: null };
  }, [conversaId, departamentoId]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, list]);

  useEffect(() => {
    if (!open) return;
    const active = panelRef.current?.querySelector?.(".wa-savedReplyItem.isActive");
    active?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open]);

  const filtered = useMemo(() => {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) return list;
    return list.filter((reply) => {
      const text = `${reply?.titulo || ""} ${reply?.texto || ""}`.toLowerCase();
      return text.includes(normalizedQuery);
    });
  }, [list, query]);

  return {
    open,
    query,
    list,
    loading,
    error,
    activeIndex,
    viaPicker,
    panelRef,
    setActiveIndex,
    close,
    openPicker,
    syncSlashContext,
    insert,
    filtered,
  };
}
