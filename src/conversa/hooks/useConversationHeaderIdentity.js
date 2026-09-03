import { useEffect, useMemo, useState } from "react";
import {
  getStatusAtendimentoEffective,
  exibirBadgePagamentoConcluido,
  resolveModoSimplesAguardandoEffective,
  buildConversaModoSimplesUiSource,
} from "../../utils/conversaUtils";
import { getDisplayName } from "../../chats/chatListDisplay";
import { useChatStore, getChatByIdFromStore } from "../../chats/chatsStore";
import { chatRowListStoreKey } from "../../chats/chatListStoreCompare";
import { useWhatsappInstancesStore } from "../../chats/whatsappInstancesStore";
import { initials, statusBadge, safeString, resolveConversaAvatarUrl } from "../utils/conversaViewHelpers";

function isLidValue(v) {
  return v != null && String(v).trim().toLowerCase().startsWith("lid:");
}

export function useConversationHeaderIdentity({
  conversa,
  conversaId,
  isGroup,
  mensagens,
  user,
  modoSimplesAtivo,
}) {
  const fromChat = useChatStore(
    (s) => getChatByIdFromStore(conversaId, s.chats),
    (a, b) => chatRowListStoreKey(a) === chatRowListStoreKey(b)
  );

  const showWhatsappInstanceUi = useWhatsappInstancesStore((s) => s.hasMultiple);

  const whatsappInstanceLabel = useMemo(() => {
    if (!showWhatsappInstanceUi || isGroup) return "";
    const source = conversa ?? fromChat ?? {};
    return String(
      source?.whatsapp_instance_nome ||
      source?.whatsappInstanceNome ||
      source?.whatsapp_instance_display_phone ||
      source?.whatsappInstanceDisplayPhone ||
      fromChat?.whatsapp_instance_nome ||
      fromChat?.whatsapp_instance_display_phone ||
      ""
    ).trim();
  }, [conversa, fromChat, isGroup, showWhatsappInstanceUi]);

  const nomeLista = useChatStore((s) => {
    if (conversaId == null || conversaId === "") return "";
    const row = getChatByIdFromStore(conversaId, s.chats);
    return row ? getDisplayName(row) : "";
  });

  const nome = useMemo(() => {
    const valid = (v) => {
      const s = String(v || "").trim();
      if (!s || isLidValue(s) || s === "Contato") return "";
      return s;
    };
    const aberto = valid(conversa ? getDisplayName(conversa) : "");
    const lista = valid(nomeLista);
    // Header estável: a row da lista já tem nome/foto; o GET não deve trocar o título ao chegar.
    if (lista) return lista;
    if (aberto) return aberto;
    if (isGroup) {
      const g =
        conversa?.nome_grupo ||
        conversa?.contato_nome ||
        conversa?.nome ||
        "Grupo";
      return isLidValue(g) ? "Grupo" : g;
    }
    const tel =
      conversa?.telefone_exibivel ||
      conversa?.cliente_telefone ||
      conversa?.telefone ||
      "";
    if (tel && !isLidValue(tel)) return String(tel).trim();
    return "Contato";
  }, [conversa, nomeLista, conversaId, isGroup]);

  const rawAvatarUrl = isGroup
    ? (fromChat?.foto_grupo ?? conversa?.foto_grupo ?? null)
    : (
        fromChat?.foto_perfil ??
        fromChat?.foto_perfil_contato_cache ??
        conversa?.foto_perfil ??
        conversa?.foto_perfil_contato_cache ??
        conversa?.cliente?.foto_perfil ??
        conversa?.clientes?.foto_perfil ??
        null
      );
  const avatarUrl = resolveConversaAvatarUrl(rawAvatarUrl);
  const avatar = useMemo(() => (isGroup ? "👥" : initials(nome)), [isGroup, nome]);
  const [avatarImgError, setAvatarImgError] = useState(false);
  const showAvatarImg = Boolean(avatarUrl && !avatarImgError);

  const conversaModoSimplesUi = useMemo(
    () => buildConversaModoSimplesUiSource(conversa, fromChat, mensagens),
    [conversa, fromChat, mensagens]
  );

  const badge = useMemo(() => {
    if (modoSimplesAtivo && !isGroup) {
      const ag = resolveModoSimplesAguardandoEffective(conversaModoSimplesUi, user);
      if (ag === "atendente") {
        return statusBadge("aguardando_atendente", false, conversaModoSimplesUi?.finalizacao_motivo);
      }
      if (ag === "cliente") {
        return statusBadge("aguardando_cliente", false, conversaModoSimplesUi?.finalizacao_motivo);
      }
      return null;
    }
    const status = getStatusAtendimentoEffective(conversa);
    const statusVisual =
      status === "em_atendimento" && conversa?.atendente_id != null && conversa?.aguardando_cliente_desde != null
        ? "aguardando_cliente"
        : status;
    return statusBadge(
      statusVisual,
      conversa?.exibir_badge_aberta,
      conversa?.finalizacao_motivo
    );
  }, [
    modoSimplesAtivo,
    user,
    isGroup,
    conversaModoSimplesUi,
    conversa,
    conversa?.status_atendimento,
    conversa?.status_atendimento_real,
    conversa?.atendente_id,
    conversa?.aguardando_cliente_desde,
    conversa?.exibir_badge_aberta,
    conversa?.finalizacao_motivo,
  ]);

  const showPagamentoConcluidoBadge = useMemo(
    () => exibirBadgePagamentoConcluido(conversa),
    [
      conversa?.pagamento_concluido_em,
      conversa?.status_atendimento,
      conversa?.status_atendimento_real,
    ]
  );

  const headerCrmAtivoLayout = useMemo(() => {
    const s = safeString(getStatusAtendimentoEffective(conversa)).toLowerCase();
    return s === "em_atendimento" || s === "aguardando_cliente";
  }, [conversa?.status_atendimento, conversa?.status_atendimento_real, conversa]);

  const encerramentoAusenciaHint = useMemo(() => {
    if (modoSimplesAtivo) return null;
    const s = safeString(getStatusAtendimentoEffective(conversa)).toLowerCase();
    if (s !== "fechada") return null;
    if (safeString(conversa?.finalizacao_motivo).toLowerCase() !== "ausencia_cliente" && conversa?.finalizada_automaticamente !== true) {
      return null;
    }
    return "Encerrada automaticamente por ausência do cliente.";
  }, [
    modoSimplesAtivo,
    conversa?.status_atendimento,
    conversa?.status_atendimento_real,
    conversa?.finalizacao_motivo,
    conversa?.finalizada_automaticamente,
  ]);

  useEffect(() => {
    setAvatarImgError(false);
  }, [conversaId, avatarUrl]);

  return {
    fromChat,
    nome,
    avatar,
    avatarUrl,
    showAvatarImg,
    setAvatarImgError,
    badge,
    showPagamentoConcluidoBadge,
    headerCrmAtivoLayout,
    encerramentoAusenciaHint,
    whatsappInstanceLabel,
    conversaModoSimplesUi,
    isLidValue,
  };
}
