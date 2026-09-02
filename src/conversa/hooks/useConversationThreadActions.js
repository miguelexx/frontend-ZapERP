import { useCallback, useMemo, useState } from "react";
import {
  getStatusAtendimentoEffective,
  isClosedAttendance,
  isModoSimplesAguardandoAtendente,
} from "../../utils/conversaUtils";
import { canAssumir, canReabrir } from "../../auth/permissions";
import { marcarLidaModoSimplesChat } from "../conversaService";
import { carregarMensagensAntigasContato } from "../../chats/chatService";
import { useConversaStore } from "../conversaStore";
import { useChatStore } from "../../chats/chatsStore";

export function useConversationThreadActions({
  conversa,
  conversaId,
  isGroup,
  user,
  modoSimplesAtivo,
  conversaModoSimplesUi,
  isLidValue,
  assumirConversa,
  reabrirConversa,
  refresh,
  showToast,
}) {
  const showAssumeEmptyCta = useMemo(() => {
    if (modoSimplesAtivo) return false;
    if (isGroup) return false;
    if (!conversa?.id || conversa?.mensagens_bloqueadas) return false;
    if (conversa?.exibir_cta_assumir_sem_mensagens !== true) return false;
    if (!canAssumir(user)) return false;
    const status = getStatusAtendimentoEffective(conversa);
    if (status === "fechada" || status === "encerrada") return false;
    const atendenteId = conversa?.atendente_id ?? null;
    const hasAtendente = atendenteId !== null && atendenteId !== "";
    if (hasAtendente) return false;
    const userRole = String(user?.role || user?.perfil || "").toLowerCase();
    const isPrivileged = userRole === "admin" || userRole === "supervisor";
    const convDepId = conversa?.departamento_id ?? null;
    const userDepIds = Array.isArray(user?.departamento_ids)
      ? user.departamento_ids.map((id) => Number(id))
      : user?.departamento_id != null
        ? [Number(user.departamento_id)]
        : [];
    const mesmaSetorOuSemRestricao =
      isPrivileged ||
      convDepId == null ||
      (userDepIds.length > 0 && userDepIds.includes(Number(convDepId)));
    return mesmaSetorOuSemRestricao;
  }, [modoSimplesAtivo, conversa, user, isGroup]);

  const showMarcarLidaModoSimplesBar = useMemo(() => {
    if (!modoSimplesAtivo) return false;
    if (!conversaId || isClosedAttendance(conversaModoSimplesUi)) return false;
    return isModoSimplesAguardandoAtendente(conversaModoSimplesUi, user);
  }, [modoSimplesAtivo, conversaId, conversaModoSimplesUi, user]);

  const [marcarLidaModoSimplesBusy, setMarcarLidaModoSimplesBusy] = useState(false);

  const handleMarcarLidaModoSimples = useCallback(async () => {
    if (!conversa?.id || marcarLidaModoSimplesBusy) return;
    setMarcarLidaModoSimplesBusy(true);
    try {
      const data = await marcarLidaModoSimplesChat(conversa.id);
      const patch = {
        modo_simples_aguardando: null,
        lida: true,
        unread_count: 0,
        tem_novas_mensagens: false,
        tem_novas_mensagens_em_atendimento: false,
        atendimento_modo_simples: true,
        ...(data?.conversa && typeof data.conversa === "object" ? data.conversa : {}),
      };
      useConversaStore.getState().patchConversa(patch);
      useChatStore.getState().setUnread(conversa.id, 0);
      useChatStore.getState().updateChat({ id: conversa.id, ...patch });
      useChatStore.getState().requestChatListResync?.();
      showToast({
        type: "success",
        title: data?.already_cleared ? "Já estava marcada como lida" : "Marcada como lida",
        message: data?.already_cleared
          ? "Conversa fora da fila Aguardando atendente."
          : "Conversa removida da fila Aguardando atendente.",
      });
    } catch (e) {
      console.error("Erro ao marcar como lida (modo simples):", e);
      showToast({
        type: "error",
        title: "Não foi possível marcar como lida",
        message: e?.response?.data?.error || e?.message || "Tente novamente.",
      });
    } finally {
      setMarcarLidaModoSimplesBusy(false);
    }
  }, [conversa?.id, marcarLidaModoSimplesBusy, showToast]);

  const [assumeEmptyBusy, setAssumeEmptyBusy] = useState(false);
  const [reopenClosedBusy, setReopenClosedBusy] = useState(false);
  const [oldContactSyncBusy, setOldContactSyncBusy] = useState(false);

  const showReopenClosedCta = useMemo(() => {
    if (modoSimplesAtivo) return false;
    if (isGroup) return false;
    if (!conversa?.id) return false;
    if (!canReabrir(user)) return false;
    return isClosedAttendance(conversa);
  }, [modoSimplesAtivo, conversa, user, isGroup]);

  const contactDisplayPhone = useMemo(() => {
    const candidates = [
      conversa?.telefone_exibivel,
      conversa?.cliente_telefone,
      conversa?.cliente?.telefone,
      conversa?.clientes?.telefone,
      isLidValue(conversa?.telefone) ? "" : conversa?.telefone,
    ];
    for (const raw of candidates) {
      const phone = String(raw || "").trim();
      if (phone && !isLidValue(phone)) return phone;
    }
    return "";
  }, [conversa, isLidValue]);

  const showContactOldSyncCta = useMemo(() => {
    if (isGroup) return false;
    if (!conversa?.id || conversa?.mensagens_bloqueadas) return false;
    return Boolean(contactDisplayPhone);
  }, [conversa, isGroup, contactDisplayPhone]);

  const showLidPhoneMissingHint = useMemo(() => {
    if (isGroup || !conversa?.id || conversa?.mensagens_bloqueadas) return false;
    if (contactDisplayPhone) return false;
    return isLidValue(conversa?.telefone);
  }, [conversa, isGroup, contactDisplayPhone, isLidValue]);

  const handleAssumeEmpty = useCallback(async () => {
    if (!conversaId || assumeEmptyBusy) return;
    setAssumeEmptyBusy(true);
    try {
      await assumirConversa(conversaId);
      if ((useConversaStore.getState().mensagens || []).length === 0) {
        await refresh({ silent: true });
      }
    } catch (e) {
      showToast({
        type: "error",
        title: "Erro ao assumir",
        message: e?.response?.data?.error || e?.message || "Tente novamente.",
      });
    } finally {
      setAssumeEmptyBusy(false);
    }
  }, [conversaId, assumeEmptyBusy, assumirConversa, refresh, showToast]);

  const handleReopenClosed = useCallback(async () => {
    if (!conversaId || reopenClosedBusy) return;
    setReopenClosedBusy(true);
    try {
      await reabrirConversa(conversaId);
      await refresh({ silent: true });
      showToast({
        type: "success",
        title: "Atendimento reaberto",
        message: "Você já está em atendimento nesta conversa.",
      });
    } catch (e) {
      showToast({
        type: "error",
        title: "Erro ao reabrir",
        message: e?.response?.data?.error || e?.message || "Tente novamente.",
      });
    } finally {
      setReopenClosedBusy(false);
    }
  }, [conversaId, reopenClosedBusy, reabrirConversa, refresh, showToast]);

  const handleCarregarMensagensAntigasContato = useCallback(async () => {
    if (!conversaId || oldContactSyncBusy || useConversaStore.getState().loadingMore) return;
    setOldContactSyncBusy(true);
    try {
      const res = await carregarMensagensAntigasContato(conversaId);
      await refresh({ silent: true });
      const loadResult = await useConversaStore.getState().loadAllMessages?.();
      if (loadResult && loadResult.ok === false && !loadResult.aborted) {
        throw loadResult.error || new Error("Nao foi possivel carregar todas as mensagens salvas.");
      }
      const importadas = Number(res?.mensagens_importadas || 0);
      const atualizadas = Number(res?.mensagens_atualizadas || 0);
      const alteradas = importadas + atualizadas;
      const carregadas = Number(loadResult?.messagesAdded || 0);
      showToast({
        type: (alteradas + carregadas) > 0 ? "success" : "info",
        title: (alteradas + carregadas) > 0 ? "Historico carregado" : "Sem mensagens antigas",
        message: alteradas > 0 || carregadas > 0
          ? `${importadas} mensagem(ns) importada(s), ${atualizadas} atualizada(s) e ${carregadas} carregada(s) na conversa.`
          : (res?.message || "Nenhuma mensagem antiga encontrada para este contato."),
      });
    } catch (e) {
      showToast({
        type: "error",
        title: "Falha ao carregar historico",
        message: e?.response?.data?.error || e?.message || "Tente novamente.",
      });
    } finally {
      setOldContactSyncBusy(false);
    }
  }, [conversaId, oldContactSyncBusy, refresh, showToast]);

  return {
    showAssumeEmptyCta,
    showMarcarLidaModoSimplesBar,
    marcarLidaModoSimplesBusy,
    handleMarcarLidaModoSimples,
    assumeEmptyBusy,
    reopenClosedBusy,
    oldContactSyncBusy,
    showReopenClosedCta,
    showContactOldSyncCta,
    showLidPhoneMissingHint,
    handleAssumeEmpty,
    handleReopenClosed,
    handleCarregarMensagensAntigasContato,
  };
}
