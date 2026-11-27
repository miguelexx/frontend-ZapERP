/**
 * Galeria do visualizador de mídia (26/11/2026).
 *
 * Antes o visualizador guardava UMA mídia ({ url, type, fileName, sourceMsg }) e as setas /
 * o deslizar não faziam nada. Agora, ao abrir, a galeria é montada UMA vez a partir das
 * mensagens da conversa aberta (`useConversaStore.getState().mensagens`): fotos e vídeos com
 * URL, na ordem da thread, sem as "apagadas para todos". O índice inicial vem da mensagem
 * clicada (por `id`, depois por `tempId`/`client_temp_id`).
 *
 * A URL de cada item sai do MESMO caminho da bolha: `resolveBubbleMediaCandidates` (blob local →
 * proxy → URL direta) e, para vídeo, `videoPlaybackUrl` do `classifyBubbleMessage`. O item
 * clicado mantém a URL que o chamador passou (a que já carregou na miniatura), então o
 * comportamento de proxy/blob é idêntico ao de antes.
 *
 * Figurinha fica de fora da galeria de propósito: o WhatsApp também não a mistura com fotos e
 * vídeos, e passar por cada figurinha ao navegar pelas fotos de uma conversa seria ruído.
 * Abrir uma figurinha continua a funcionar, sozinha e sem setas.
 *
 * Funções puras (exceto a leitura das stores no momento da abertura): testáveis fora do React.
 */

import { classifyBubbleMessage } from "../bubble/utils/bubbleClassify";
import {
  isOutgoingMessage,
  normalizeMessageTipo,
  resolveBubbleMediaCandidates,
  resolveConversaAvatarUrl,
  safeString,
} from "../utils/conversaViewHelpers";
import { useConversaStore } from "../conversaStore";
import { useChatStore, getChatByIdFromStore } from "../../chats/chatsStore";
import { contactIdentitiesConflict } from "../../chats/chatContactIdentity";
import { formatPhoneForDisplay, getDisplayName } from "../../chats/chatListDisplay";
import { isGroupConversation } from "../../utils/conversaUtils";
import { getAvatarImageSrc } from "../../utils/avatarProxyUrl";
// Iniciais só com letras (A3-06): o nome de quem não está na agenda é o telefone formatado e o
// `initials` ingênuo dava "(9". Sem letra, "" — o avatar do visualizador desenha o boneco.
import { avatarInitials } from "../../utils/avatarColor";
import { formatDiaEmpresa, formatHoraEmpresa, isSameCompanyDay } from "../../utils/companyTimezone";

/**
 * Normaliza aliases de tipo apenas para o visualizador.
 * Não altera o contrato externo: quem chama pode continuar enviando "imagem", "video", "arquivo" etc.
 */
export function normalizeViewerType(type, fileName) {
  const t = String(type || "").trim().toLowerCase();
  const fn = String(fileName || "").trim().toLowerCase();

  if (t === "image") return "imagem";
  if (t === "foto" || t === "photo" || t === "figurinha") return "imagem";
  if (t === "vídeo") return "video";
  if (t === "document" || t === "file" || t === "documento" || t === "pdf") return "arquivo";

  if (!t && fn.endsWith(".pdf")) return "arquivo";
  return t || "imagem";
}

function isLid(v) {
  return String(v || "").trim().toLowerCase().startsWith("lid:");
}

function validName(v) {
  const s = String(v || "").trim();
  if (!s || isLid(s) || s === "Contato") return "";
  return s;
}

/**
 * Nome e foto do contato da conversa aberta, com a MESMA preferência do cabeçalho
 * (`useConversationHeaderIdentity`): a linha da lista ganha quando é a mesma pessoa.
 */
function readConversationIdentity() {
  let conversa = null;
  let conversaId = null;
  try {
    const st = useConversaStore.getState();
    conversa = st.conversa || null;
    conversaId = st.selectedId ?? conversa?.id ?? null;
  } catch {
    /* store indisponível: segue sem identidade */
  }
  let row = null;
  try {
    row = conversaId != null ? getChatByIdFromStore(conversaId, useChatStore.getState().chats) : null;
  } catch {
    row = null;
  }
  const isGroup = isGroupConversation(conversa) || isGroupConversation(row);
  const confere = !row || !conversa || !contactIdentitiesConflict(conversa, row);
  const nome =
    (confere && row ? validName(getDisplayName(row)) : "") ||
    (conversa ? validName(getDisplayName(conversa)) : "") ||
    "";
  let avatarUrl = "";
  if (!isGroup) {
    const raw =
      (confere ? row?.foto_perfil ?? row?.foto_perfil_contato_cache : null) ??
      conversa?.foto_perfil ??
      conversa?.foto_perfil_contato_cache ??
      conversa?.cliente?.foto_perfil ??
      conversa?.clientes?.foto_perfil ??
      null;
    const resolvida = resolveConversaAvatarUrl(raw);
    avatarUrl = resolvida ? getAvatarImageSrc(resolvida) || resolvida : "";
  }
  return { isGroup, nome, avatarUrl };
}

/** Quem enviou: "Você" para mensagem nossa; senão o remetente (grupo) ou o contato. */
function resolveAuthor(msg, identity) {
  if (!msg) return null;
  if (isOutgoingMessage(msg)) {
    return { name: "Você", initials: "V", avatarUrl: "", out: true };
  }
  const telefone = safeString(msg?.remetente_telefone);
  const telefoneFmt = telefone && !isLid(telefone) ? formatPhoneForDisplay(telefone) || telefone : "";
  if (identity.isGroup) {
    const nome = validName(msg?.remetente_nome) || telefoneFmt || "Participante";
    return { name: nome, initials: avatarInitials(nome), avatarUrl: "", out: false };
  }
  const nome = identity.nome || validName(msg?.remetente_nome) || telefoneFmt || "Contato";
  return { name: nome, initials: avatarInitials(nome), avatarUrl: identity.avatarUrl || "", out: false };
}

function messageKey(msg, fallback) {
  if (msg?.id != null && String(msg.id) !== "") return `id:${msg.id}`;
  const temp = msg?.tempId ?? msg?.client_temp_id;
  if (temp != null && String(temp) !== "") return `tmp:${temp}`;
  if (msg?.whatsapp_id) return `wa:${msg.whatsapp_id}`;
  return `idx:${fallback}`;
}

function sameMessage(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.id != null && b.id != null && String(a.id) === String(b.id)) return true;
  const ta = a.tempId ?? a.client_temp_id;
  const tb = b.tempId ?? b.client_temp_id;
  if (ta != null && tb != null && String(ta) !== "" && String(ta) === String(tb)) return true;
  return false;
}

/**
 * Item do visualizador. Os campos de antes (`url`, `type`, `fileName`, `originalType`,
 * `sourceMsg`, `downloadMsg`) mantêm o mesmo significado: o ConversaView lê `sourceMsg` para
 * encaminhar e o hook lê o resto para salvar/imprimir.
 */
export function makeViewerItem({ url, type, fileName, sourceMsg, identity, caption, key }) {
  const normalizedType = normalizeViewerType(type, fileName);
  const vivo = sourceMsg && !sourceMsg?.apagada_para_todos ? sourceMsg : null;
  const canForward = vivo?.id != null;
  const author = sourceMsg ? resolveAuthor(sourceMsg, identity) : null;
  return {
    key: key || messageKey(sourceMsg, url),
    url,
    type: normalizedType,
    fileName: fileName || sourceMsg?.nome_arquivo || null,
    originalType: type || null,
    sourceMsg: canForward ? vivo : null,
    /*
     * Salvar não depende de poder encaminhar: bolha otimista (ainda sem id do banco) e foto
     * de perfil (sem mensagem nenhuma) também baixam. Só mídia revogada fica de fora.
     */
    downloadMsg: vivo,
    caption: caption || "",
    author,
    at: sourceMsg?.criado_em || null,
    /* Sem mensagem = foto de perfil (SidebarCliente/SidebarGrupo): o cabeçalho mostra o nome. */
    isProfilePhoto: !sourceMsg,
  };
}

/** Legenda real da mídia (não placeholder nem nome de arquivo), pela mesma regra da bolha. */
function captionOf(classified) {
  if (!classified?.showCaption) return "";
  return safeString(classified.texto).trim();
}

const GALLERY_TIPOS = new Set(["imagem", "video"]);

/** Item de galeria para uma mensagem da thread, ou null se ela não entra (sem URL, apagada...). */
function galleryItemFromMessage(msg, identity, idx) {
  if (!msg || typeof msg !== "object") return null;
  if (msg.apagada_para_todos) return null;
  const tipo = normalizeMessageTipo(msg.tipo);
  if (!GALLERY_TIPOS.has(tipo)) return null;
  const mediaUrl = resolveBubbleMediaCandidates(msg)[0] || "";
  if (!mediaUrl) return null;
  // contactMeta = null: mídia nunca é cartão de contato, e poupa a resolução por mensagem.
  const c = classifyBubbleMessage(msg, mediaUrl, null);
  let type = null;
  let url = "";
  if (c.isImg) {
    type = "imagem";
    url = mediaUrl;
  } else if (c.isVideo) {
    type = "video";
    url = c.videoPlaybackUrl || mediaUrl;
  }
  if (!type || !url) return null;
  return makeViewerItem({
    url,
    type,
    fileName: msg?.nome_arquivo || undefined,
    sourceMsg: msg,
    identity,
    caption: captionOf(c),
    key: messageKey(msg, idx),
  });
}

/**
 * Monta { items, index } na abertura. Sem mensagem de origem (foto de perfil), com uma mídia
 * que não entra na galeria (figurinha, documento, apagada) ou fora da lista carregada, devolve
 * um único item — o comportamento de antes, sem setas.
 */
export function buildMediaViewerGallery({ url, type, fileName, sourceMsg }) {
  const identity = readConversationIdentity();

  let caption = "";
  if (sourceMsg) {
    try {
      const mediaUrl = resolveBubbleMediaCandidates(sourceMsg)[0] || url || "";
      caption = captionOf(classifyBubbleMessage(sourceMsg, mediaUrl, null));
    } catch {
      caption = "";
    }
  }
  const single = makeViewerItem({ url, type, fileName, sourceMsg, identity, caption });
  const startType = normalizeViewerType(type, fileName);
  const tipoOrigem = normalizeMessageTipo(sourceMsg?.tipo);
  const podeTerGaleria =
    !!sourceMsg &&
    !sourceMsg.apagada_para_todos &&
    GALLERY_TIPOS.has(tipoOrigem) &&
    (startType === "imagem" || startType === "video") &&
    String(type || "").toLowerCase() !== "figurinha";
  if (!podeTerGaleria) return { items: [single], index: 0 };

  let mensagens = [];
  try {
    mensagens = useConversaStore.getState().mensagens || [];
  } catch {
    mensagens = [];
  }

  const items = [];
  let index = -1;
  for (let i = 0; i < mensagens.length; i += 1) {
    const m = mensagens[i];
    const item = galleryItemFromMessage(m, identity, i);
    if (!item) continue;
    if (index < 0 && sameMessage(m, sourceMsg)) {
      index = items.length;
      // O item clicado usa a URL que o chamador passou (a fonte que já carregou na bolha).
      items.push({ ...item, url, type: startType, originalType: type || item.originalType });
      continue;
    }
    items.push(item);
  }
  if (index < 0) return { items: [single], index: 0 };
  return { items, index };
}

/**
 * Item de envio otimista guarda a URL `blob:` do momento da abertura. Se o servidor reconciliou
 * enquanto o viewer estava aberto, o blob pode ter sido revogado: ao navegar até ele, relê a
 * mensagem na store e usa a URL atual. Outros itens ficam como estão (o clicado mantém a fonte
 * que já tinha carregado na bolha).
 */
export function refreshViewerItem(item) {
  if (!item || !String(item.url || "").startsWith("blob:")) return item;
  const alvo = item.downloadMsg || item.sourceMsg;
  if (!alvo) return item;
  try {
    const mensagens = useConversaStore.getState().mensagens || [];
    const atual = mensagens.find((m) => sameMessage(m, alvo));
    if (!atual || atual === alvo) return item;
    const fresco = galleryItemFromMessage(atual, readConversationIdentity(), 0);
    return fresco ? { ...fresco, key: item.key } : item;
  } catch {
    return item;
  }
}

/** "Hoje às 14:03" / "Ontem às 09:12" / "03/11/2026 às 14:03", sempre no fuso da empresa. */
export function formatMediaViewerWhen(at, now = new Date()) {
  if (!at) return "";
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const hora = formatHoraEmpresa(d);
  if (!hora) return "";
  if (isSameCompanyDay(d, now)) return `Hoje às ${hora}`;
  if (isSameCompanyDay(d, new Date(now.getTime() - 86400000))) return `Ontem às ${hora}`;
  const dia = formatDiaEmpresa(d);
  return dia ? `${dia} às ${hora}` : hora;
}
