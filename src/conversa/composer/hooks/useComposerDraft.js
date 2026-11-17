import { useEffect, useRef, useState } from "react";
import {
  FLUSH_COMPOSER_DRAFT_EVENT,
  loadComposerDraft,
  saveComposerDraft,
} from "../../composerDraftStore";

/**
 * @param {string|number|null} conversaId
 * @param {{ getPersistText?: () => string | null }} [opts]
 *   `getPersistText` decide O QUE vai para o rascunho persistido da conversa. O composer usa
 *   isto no modo "nota interna": o campo mostra a nota, mas o rascunho da conversa tem de
 *   continuar a ser o texto para o CLIENTE (guardado na outra gaveta). Sem isto a nota era
 *   gravada como rascunho e, ao voltar à conversa (ou após F5), reaparecia no modo cliente —
 *   um Enter mandava a nota interna para o WhatsApp do cliente. `null` = usar o campo.
 */
export function useComposerDraft(conversaId, opts = {}) {
  const [texto, setTexto] = useState(() => loadComposerDraft(conversaId));
  const textoRef = useRef(texto);
  const lastConversaIdRef = useRef(conversaId);
  const getPersistTextRef = useRef(opts.getPersistText);
  getPersistTextRef.current = opts.getPersistText;
  const persistText = () => {
    const override = getPersistTextRef.current?.();
    return override == null ? textoRef.current : override;
  };

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
      saveComposerDraft(previousId, persistText(), { immediate: true });
    }
    lastConversaIdRef.current = conversaId;
    const restored = loadComposerDraft(conversaId);
    textoRef.current = restored;
    setTexto(restored);
  }, [conversaId]);

  useEffect(() => {
    if (!conversaId) return;
    saveComposerDraft(conversaId, persistText());
  }, [texto, conversaId]);

  useEffect(() => {
    const flush = () => {
      const id = lastConversaIdRef.current;
      if (id != null && id !== "") {
        saveComposerDraft(id, persistText(), { immediate: true });
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
