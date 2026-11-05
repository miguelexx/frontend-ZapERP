import { useCallback, useEffect, useMemo, useRef } from "react";

export function useStableTimeout() {
  const ref = useRef(null);
  const clear = useCallback(() => {
    if (ref.current) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);
  const set = useCallback(
    (fn, ms) => {
      clear();
      ref.current = setTimeout(fn, ms);
    },
    [clear]
  );

  useEffect(() => clear, [clear]);
  /*
   * O objeto PRECISA ser estável. Devolver `{ set, clear }` cru criava uma identidade nova a
   * cada render; como `useConversationToast` tem esse objeto nas deps do `showToast`, o
   * `showToast` mudava de identidade em TODO render do coordenador — e `showToast` está nas
   * deps de 19 hooks e de ~15 `useCallback` do ConversaView. O efeito da outbox em
   * `usePendingOutgoingLifecycle` reexecutava a cada render (54× numa sessão medida de 25s) e,
   * enquanto um envio estava em voo (`outboxHasItems()` é true até a resposta do POST, ou por
   * `OUTBOX_EM_VOO_MS` = 70s se ela nunca chegar), cada reexecução disparava um
   * `GET /chats/:id` completo: 49 GETs medidos numa sessão com 6 mensagens enviadas.
   * `set`/`clear` já são estáveis, logo o memo nunca recalcula.
   */
  return useMemo(() => ({ set, clear }), [set, clear]);
}
