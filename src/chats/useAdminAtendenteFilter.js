import { useCallback, useState } from "react";

/**
 * Estado do filtro administrativo por funcionário (lista lateral).
 *
 * Prioridade vs pílulas / filtros avançados de atendente: quando `selectedUserId`
 * está definido, o GET /chats usa apenas `atendente_id` deste modo (sem minha_fila,
 * sem status_atendimento na query). Os chips visuais não são alterados; o recorte
 * por aba é ignorado em `chatsFiltrados` enquanto este modo estiver ativo — ver ChatList.
 */
export function useAdminAtendenteFilter() {
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const clearSelection = useCallback(() => {
    setSelectedUserId(null);
    setPanelOpen(false);
  }, []);

  return {
    selectedUserId,
    setSelectedUserId,
    panelOpen,
    setPanelOpen,
    clearSelection,
  };
}
