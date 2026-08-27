import { useCallback, useEffect, useState } from "react";

/**
 * Painel "Histórico" (timeline) da conversa: estado de abertura + carga.
 *
 * Extraído de ConversaView.jsx sem alterar comportamento. Os dados
 * (`atendimentos`/`atendimentosLoading`) continuam no conversaStore; este hook
 * apenas controla a abertura e dispara `carregarAtendimentos(conversaId)` ao
 * abrir com uma conversa selecionada. Expõe `showTimeline`/`setShowTimeline`
 * para o handler global de Esc e para o hotkey de toggle.
 *
 * @param {{ conversaId: any, carregarAtendimentos: Function }} deps
 */
export function useConversationTimeline({ conversaId, carregarAtendimentos }) {
  const [showTimeline, setShowTimeline] = useState(false);

  const toggleTimeline = useCallback(() => {
    setShowTimeline((v) => !v);
  }, []);

  const handleCloseTimeline = useCallback(() => setShowTimeline(false), []);

  useEffect(() => {
    if (showTimeline && conversaId) {
      carregarAtendimentos(conversaId);
    }
  }, [showTimeline, conversaId, carregarAtendimentos]);

  return {
    showTimeline,
    setShowTimeline,
    toggleTimeline,
    handleCloseTimeline,
  };
}
