import { useCallback, useState } from "react";
import { useStableTimeout } from "./useStableTimeout";

/**
 * Toast/feedback da conversa.
 *
 * Extraído de ConversaView.jsx sem alterar comportamento: mesmo auto-dismiss
 * de 3500ms via `useStableTimeout` (timer estável, limpo no unmount), e o
 * `showToast` substitui o toast atual (não empilha). O objeto de toast
 * (`{ type, title, message }`) e o `setToast` continuam disponíveis para o
 * `ChatToast`. Casos silenciosos, tratamento de 409 e rollbacks continuam nos
 * hooks/handlers chamadores — este hook só concentra a mecânica do toast.
 */
export function useConversationToast() {
  const [toast, setToast] = useState(null);
  const toastT = useStableTimeout();

  const showToast = useCallback(
    (next) => {
      setToast(next);
      toastT.set(() => setToast(null), 3500);
    },
    [toastT]
  );

  return { toast, setToast, showToast };
}
