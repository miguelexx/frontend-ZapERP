import { useCallback, useState } from "react";
import { useConversaParticipantes } from "../../atendimento/useConversaParticipantes";
import { isGroupConversation } from "../../utils/conversaUtils";

/**
 * Participantes/co-atendentes da conversa.
 *
 * Envolve o hook de dados `useConversaParticipantes` (carregamento + reload) e
 * concentra o estado do modal de atendentes. Extraído de ConversaView.jsx sem
 * alterar comportamento. Precisa ser chamado cedo no corpo do componente
 * porque `atendentesParticipantes` alimenta o cálculo de `podeEnviar`
 * (co-atendente também envia). Por isso deriva `conversaId` de `conversa?.id`
 * (idêntico ao `conversaId` do coordenador) em vez de recebê-lo pronto.
 *
 * @param {{ conversa: any }} deps
 */
export function useConversationParticipants({ conversa }) {
  const conversaId = conversa?.id || null;
  const isGroup = isGroupConversation(conversa);

  const {
    participantes: atendentesParticipantes,
    total: totalAtendentes,
    reload: reloadAtendentes,
  } = useConversaParticipantes(
    isGroup ? null : conversaId,
    conversa?.atendente_id ?? null
  );

  const [atendentesModalOpen, setAtendentesModalOpen] = useState(false);

  const handleOpenAdicionarAtendente = useCallback(() => {
    if (!conversaId) return;
    reloadAtendentes();
    setAtendentesModalOpen(true);
  }, [conversaId, reloadAtendentes]);

  return {
    atendentesParticipantes,
    totalAtendentes,
    reloadAtendentes,
    atendentesModalOpen,
    setAtendentesModalOpen,
    handleOpenAdicionarAtendente,
  };
}
