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
  /** "idle" | "loading" | "ready" | "error" — antes `[]` valia "a carregar" para sempre. */
  const [departamentosStatus, setDepartamentosStatus] = useState("idle");
  const [transferirSetorLoading, setTransferirSetorLoading] = useState(false);

  const setorAtual =
    conversa?.departamento_id != null
      ? (conversa?.setor ?? conversa?.departamento?.nome ?? conversa?.departamentos?.nome ?? null)
      : null;

  const carregarDepartamentos = useCallback(async () => {
    setDepartamentosStatus((prev) => (prev === "ready" ? prev : "loading"));
    try {
      const { data } = await api.get("/dashboard/departamentos");
      setDepartamentos(Array.isArray(data) ? data : []);
      setDepartamentosStatus("ready");
    } catch (e) {
      console.error("Erro ao carregar departamentos:", e);
      setDepartamentosStatus("error");
    }
  }, []);

  const handleOpenTransferirSetor = useCallback(() => {
    setShowTransferirSetor(true);
    carregarDepartamentos();
  }, [carregarDepartamentos]);

  /*
   * Trocar setor (26/11/2026): o PUT já é a confirmação. Antes o painel esperava o PUT E um
   * GET completo da conversa (~2,6s com a latência de produção) e fechava sem dizer nada —
   * "remover setor" tinha toast, "trocar" não. Agora fecha e confirma logo após o PUT; o
   * refresh silencioso segue em 2.º plano e atualiza o cabeçalho (mesmo padrão do Transferir,
   * doc 14 "Ações do cabeçalho"). Nada de patch otimista na lista: o GET é a autoridade.
   */
  const handleTransferirSetor = useCallback(
    async (departamentoId) => {
      if (!conversaId || !departamentoId || transferirSetorLoading) return;
      setTransferirSetorLoading(true);
      try {
        await api.put(`/chats/${conversaId}/departamento`, {
          departamento_id: Number(departamentoId),
        });
        setShowTransferirSetor(false);
        const nome = (departamentos || []).find((d) => Number(d?.id) === Number(departamentoId))?.nome;
        showToast({
          type: "success",
          variant: "snack",
          title: nome ? `Setor alterado para ${nome}` : "Setor alterado",
        });
        Promise.resolve(refresh({ silent: true })).catch(() => {});
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
    [conversaId, departamentos, refresh, showToast, transferirSetorLoading]
  );

  const handleRemoverSetor = useCallback(
    async () => {
      if (!conversaId || transferirSetorLoading) return;
      setTransferirSetorLoading(true);
      try {
        await api.put(`/chats/${conversaId}/departamento`, { remover_setor: true });
        setShowTransferirSetor(false);
        showToast({ type: "success", variant: "snack", title: "Setor removido da conversa" });
        Promise.resolve(refresh({ silent: true })).catch(() => {});
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
    departamentosStatus,
    carregarDepartamentos,
    transferirSetorLoading,
    setorAtual,
    handleOpenTransferirSetor,
    handleTransferirSetor,
    handleRemoverSetor,
  };
}
