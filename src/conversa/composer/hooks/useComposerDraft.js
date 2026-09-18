import { useEffect, useRef, useState } from "react";
import {
  FLUSH_COMPOSER_DRAFT_EVENT,
  loadComposerDraft,
  saveComposerDraft,
} from "../../composerDraftStore";

export function useComposerDraft(conversaId) {
  const [texto, setTexto] = useState(() => loadComposerDraft(conversaId));
  const textoRef = useRef(texto);
  const lastConversaIdRef = useRef(conversaId);

  useEffect(() => {
    textoRef.current = texto;
  }, [texto]);

  useEffect(() => {
    const previousId = lastConversaIdRef.current;
    if (
      previousId != null &&
      previousId !== "" &&
      String(previousId) !== String(conversaId ?? "")
    ) {
      // Troca de conversa é um momento de "saída": grava já, sem depender do debounce.
      saveComposerDraft(previousId, textoRef.current, { immediate: true });
    }
    lastConversaIdRef.current = conversaId;
    const restored = loadComposerDraft(conversaId);
    textoRef.current = restored;
    setTexto(restored);
  }, [conversaId]);

  useEffect(() => {
    if (!conversaId) return;
    saveComposerDraft(conversaId, textoRef.current);
  }, [texto, conversaId]);

  useEffect(() => {
    const flush = () => {
      const id = lastConversaIdRef.current;
      if (id != null && id !== "") {
        saveComposerDraft(id, textoRef.current, { immediate: true });
      }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    window.addEventListener(FLUSH_COMPOSER_DRAFT_EVENT, flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener(FLUSH_COMPOSER_DRAFT_EVENT, flush);
      flush();
    };
  }, []);

  return { texto, setTexto, textoRef };
}
