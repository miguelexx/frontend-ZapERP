import { useEffect, useRef, useState } from "react";
import {
  loadComposerDraft,
  saveComposerDraft,
} from "../../composerDraftStore";
import { COMPOSER_DRAFT_SAVE_MS } from "../utils/composerUtils";

export function useComposerDraft(conversaId) {
  const [texto, setTexto] = useState(() => loadComposerDraft(conversaId));
  const textoRef = useRef(texto);
  const lastConversaIdRef = useRef(conversaId);
  const saveTimerRef = useRef(0);

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
      saveComposerDraft(previousId, textoRef.current);
    }
    lastConversaIdRef.current = conversaId;
    const restored = loadComposerDraft(conversaId);
    textoRef.current = restored;
    setTexto(restored);
  }, [conversaId]);

  useEffect(() => {
    if (!conversaId) return undefined;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = 0;
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = 0;
      saveComposerDraft(conversaId, textoRef.current);
    }, COMPOSER_DRAFT_SAVE_MS);
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = 0;
      }
    };
  }, [texto, conversaId]);

  useEffect(() => {
    return () => {
      const id = lastConversaIdRef.current;
      if (id != null && id !== "") {
        saveComposerDraft(id, textoRef.current);
      }
    };
  }, []);

  return { texto, setTexto, textoRef };
}
