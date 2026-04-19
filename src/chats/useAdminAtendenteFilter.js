import { useCallback, useState } from "react";

/**
 * Estado do filtro administrativo por funcionário (lista lateral).
 *
 * Prioridade vs pílulas / filtros avançados de atendente: quando `selectedUserId`
 * está definido, o GET /chats usa apenas `atendente_id` (inteiro de usuarios.id), sem
 * minha_fila nem status_atendimento na query. Em ChatList alinha-se o que vier da API
 * ao mesmo atendente_id (grupos / sem responsável excluídos); pílulas e select de status
 * avançado não recortam este modo.
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
