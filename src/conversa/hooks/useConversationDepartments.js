import { useCallback, useState } from "react";
import api from "../../api/http";

/**
 * Setor/departamento da conversa: painel "Transferir setor".
 *
 * Extraído de ConversaView.jsx sem alterar comportamento: mesmos endpoints
 * (GET /dashboard/departamentos, PUT /chats/:id/departamento), mesmo payload
 * ({ departamento_id } ou { remover_setor: true }), mesmo refresh({ silent })
 * e mesmos toasts. Expõe `showTransferirSetor`/`setShowTransferirSetor` para o
 * handler global de Esc (onEscape) continuar fechando o painel.
 *
 * @param {{ conversaId: any, conversa: any, refresh: Function, showToast: Function }} deps
 */
export function useConversationDepartments({ conversaId, conversa, refresh, showToast }) {
  const [showTransferirSetor, setShowTransferirSetor] = useState(false);
  const [departamentos, setDepartamentos] = useState([]);
  const [transferirSetorLoading, setTransferirSetorLoading] = useState(false);

  const setorAtual =
    conversa?.departamento_id != null
      ? (conversa?.setor ?? conversa?.departamento?.nome ?? conversa?.departamentos?.nome ?? null)
      : null;

  const carregarDepartamentos = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard/departamentos");
      setDepartamentos(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Erro ao carregar departamentos:", e);
      setDepartamentos([]);
    }
  }, []);

  const handleOpenTransferirSetor = useCallback(() => {
    setShowTransferirSetor(true);
    carregarDepartamentos();
  }, [carregarDepartamentos]);

  const handleTransferirSetor = useCallback(
    async (departamentoId) => {
      if (!conversaId || !departamentoId || transferirSetorLoading) return;
      setTransferirSetorLoading(true);
      try {
        await api.put(`/chats/${conversaId}/departamento`, {
          departamento_id: Number(departamentoId),
        });
        await refresh({ silent: true });
        setShowTransferirSetor(false);
      } catch (e) {
        console.error("Erro ao transferir setor:", e);
        showToast({
          type: "error",
          title: "Falha ao transferir setor",
          message: e?.response?.data?.error || "Tente novamente.",
        });
      } finally {
        setTransferirSetorLoading(false);
      }
    },
    [conversaId, refresh, showToast, transferirSetorLoading]
  );

  const handleRemoverSetor = useCallback(
    async () => {
      if (!conversaId || transferirSetorLoading) return;
      setTransferirSetorLoading(true);
      try {
        await api.put(`/chats/${conversaId}/departamento`, { remover_setor: true });
        await refresh({ silent: true });
        setShowTransferirSetor(false);
        showToast({ type: "success", title: "Setor removido", message: "A conversa não possui mais setor vinculado." });
      } catch (e) {
        console.error("Erro ao remover setor:", e);
        showToast({
          type: "error",
          title: "Falha ao remover setor",
          message: e?.response?.data?.error || "Tente novamente.",
        });
      } finally {
        setTransferirSetorLoading(false);
      }
    },
    [conversaId, refresh, showToast, transferirSetorLoading]
  );

  return {
    showTransferirSetor,
    setShowTransferirSetor,
    departamentos,
    transferirSetorLoading,
    setorAtual,
    handleOpenTransferirSetor,
    handleTransferirSetor,
    handleRemoverSetor,
  };
}
