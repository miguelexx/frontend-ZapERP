import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Pin, Star } from "lucide-react";
import {
  safeString,
  copyTextToClipboard,
  formatHora,
  resolveBubbleMediaCandidates,
  resolveAudioPlaybackCandidates,
} from "../utils/conversaViewHelpers";
import BubbleDeletedNotice from "./components/BubbleDeletedNotice";
import { SwipeReplyTrack } from "../SwipeReplyTrack";
import { resolveContactMetaFromMessage } from "../../utils/conversaUtils";
import { classifyBubbleMessage, canDeleteMessageForEveryone, canEditMessage, isInternalNoteEditTipo } from "./utils/bubbleClassify";
import { temIdDoProvedor } from "./utils/bubbleStatus";
import { buildRetryPayload } from "./utils/bubbleRetry";
import { useMessageMenu } from "./hooks/useMessageMenu";
import { useMessageGestures } from "./hooks/useMessageGestures";
import { useMediaRetry } from "./hooks/useMediaRetry";
import { useInboundMediaAutoHeal } from "./hooks/useInboundMediaAutoHeal";
import MessageStatus from "./components/MessageStatus";
import EditedLabel from "./components/EditedLabel";
import QuotedReply from "./components/QuotedReply";
import MessageMenu from "./components/MessageMenu";
import MessageRetry from "./components/MessageRetry";
import { LOCAL_MEDIA_LOSS_NOTICE, shouldShowLocalMediaNotice, localMediaFailureText } from "../localMediaNotice";
import BubbleTypedContent from "./components/BubbleTypedContent";
import { ReactionPicker, ReactionButton, ReactionBadge } from "./components/MessageReactions";
import { useOfflineAudioSource } from "./hooks/useOfflineAudioSource";
import { useOnlineStatus } from "../../utils/useOnlineStatus";
import { podeBaixarMidiaDaMensagem, salvarMidiaComFeedback } from "../mediaDownload";
import { getAvatarColor } from "../../utils/avatarColor";

/**
 * Matiz (0–359) do nome do participante: o hash OKLCH do avatar (utils/avatarColor) espalhado
 * pelo "passo de ouro" (×137, primo com 360). Sem o espalhamento, sementes vizinhas
 * (5511988880001 / …002) davam matizes a 1° de distância — todos os nomes da mesma cor.
 */
function matizDaSemente(semente) {
  const m = /\s(\d+(?:\.\d+)?)\)\s*$/.exec(getAvatarColor(semente));
  const base = m ? Math.round(Number(m[1])) : 0;
  return (base * 137) % 360;
}

/**
 * Motivo da recusa de mídia local sem repetir a frase do aviso (27/11/2026). Alguns motivos já
 * começam por "Não foi possível enviar" (fila offline: "…o arquivo salvo offline."; fallback do
 * classificador: "Não foi possível enviar.") — com o "Tentar novamente", cujo aviso diz a mesma
 * frase, a bolha mostrava a frase duas vezes. `resto` = o que sobra de motivo próprio:
 * "…enviar: arquivo grande" → "Arquivo grande"; "…enviar o arquivo salvo offline." → "".
 */
const FRASE_FALHA_ENVIO = /^n[ãa]o foi poss[íi]vel enviar\b[\s:.,;—–-]*/i;
function motivoDaFalhaLocal(msg) {
  const motivo = String(msg?.erro_mensagem || "").trim();
  const m = FRASE_FALHA_ENVIO.exec(motivo);
  if (!m) return { motivo, repete: false, resto: motivo };
  const resto = motivo.slice(m[0].length).trim();
  const temMotivoProprio = /[:;—–-]/.test(m[0]) && resto;
  return {
    motivo,
    repete: true,
    resto: temMotivoProprio ? resto.charAt(0).toUpperCase() + resto.slice(1) : "",
  };
}

/**
 * Tira `access_token` só de URLs do proxy de mídia da própria API (`/media/proxy?...`), onde o
 * JWT de sessão viaja na query. Qualquer outro link do texto fica exatamente como o usuário
 * escreveu (ex.: `checkoutnow?token=EC-...` do PayPal).
 */
function semTokenDoProxyDeMidia(texto) {
  return String(texto || "").replace(/\S*\/media\/proxy\S*/gi, (url) =>
    url
      .replace(/([?&])access_token=[^&#\s]*(&?)/gi, (_m, sep, amp) => (amp ? sep : ""))
      .replace(/[?&]$/, "")
  );
}

const Bubble = memo(function Bubble({
  msg,
  showRemetente,
  isGroup,
  peerAvatarUrl,
  peerName,
  selectMode,
  selected,
  onToggleSelected,
  onInfo,
  onReply,
  onCopy,
  onForward,
  onTogglePin,
  onToggleStar,
  onStartSelect,
  onDeleteForMe,
  onDeleteForEveryone,
  onEdit,
  isPinned,
  isStarred,
  currentUserId,
  whatsappInstanceProvider,
  onJumpToReply,
  onOpenMedia,
  onReenviarAudio,
  onReenviarFalha,
  localReaction,
  reactionFromPeer = false,
  onReact,
  onRemoveReaction,
  reactionBusy,
  onConversarContact,
  onAdicionarGrupoContact,
  mostrarNomeAoCliente = true,
  swipeReplyEnabled = false,
  captionBundleTop = false,
  captionBundleFollow = false,
  /** Mobile/tablet: sem setinha fixa; menu por long press + folha inferior */
  mobileMessageChrome = false,
  menuUsesBottomSheet = false,
  showMobileReactionPicker = false,
  zapAnimateIn = false,
}) {
  const mediaCandidates = useMemo(
    () => resolveBubbleMediaCandidates(msg),
    [
      msg?._optimisticBlobUrl,
      msg?.url,
      msg?.url_absoluta,
      msg?.media_url,
      msg?.mediaUrl,
      msg?.file_url,
      msg?.fileUrl,
      msg?.download_url,
      msg?.downloadUrl,
    ]
  );
  const mediaUrl = mediaCandidates[0] || "";
  const audioPlaybackCandidatesBase = useMemo(
    () => resolveAudioPlaybackCandidates(msg),
    [
      msg?._optimisticBlobUrl,
      msg?.url,
      msg?.url_absoluta,
      msg?.media_url,
      msg?.mediaUrl,
      msg?.file_url,
      msg?.fileUrl,
      msg?.download_url,
      msg?.downloadUrl,
      msg?.tipo,
    ]
  );
  // Áudio OFFLINE (IndexedDB): quando a conexão cai, o blob local é a ÚNICA fonte que toca —
  // vai na frente. Online, entra como ÚLTIMO fallback (ordem atual preservada; zero mudança
  // no caminho feliz). Trocar a lista no MEIO de uma reprodução é seguro: o useAudioPlayback
  // adia a adoção (playList/pendingList).
  const tipoMsgLower = String(msg?.tipo || "").toLowerCase();
  const ehBolhaAudio = tipoMsgLower === "audio" || tipoMsgLower === "voice";
  const online = useOnlineStatus();
  const offlineAudioUrl = useOfflineAudioSource(msg, ehBolhaAudio);
  const audioPlaybackCandidates = useMemo(() => {
    if (!offlineAudioUrl) return audioPlaybackCandidatesBase;
    return online
      ? [...audioPlaybackCandidatesBase, offlineAudioUrl]
      : [offlineAudioUrl, ...audioPlaybackCandidatesBase];
  }, [audioPlaybackCandidatesBase, offlineAudioUrl, online]);
  const contactBubbleMeta = useMemo(() => resolveContactMetaFromMessage(msg), [msg]);
  const classified = classifyBubbleMessage(msg, mediaUrl, contactBubbleMeta);
  const {
    out,
    isImg,
    isSticker,
    isFile,
    isAudioOrVoice,
    audioTemPlayer,
    isVideo,
    isContact,
    isLocation,
    isCall,
    isApagadaParaTodos,
    isApagadaPeloCliente,
    deletionInfo,
    hasInlineMetaClass,
    showFloatingMetaTime,
    isEncaminhado,
    replyMeta,
    hasReply,
  } = classified;
  const canDeleteForEveryone = useMemo(
    () => canDeleteMessageForEveryone(msg, { out, currentUserId }),
    [out, currentUserId, msg?.autor_usuario_id, msg?.apagada_para_todos]
  );
  const remetente = showRemetente && !out && (msg?.remetente_nome || msg?.remetente_telefone);
  /* Nome do participante do grupo com cor própria, como no WhatsApp (27/11/2026). Matiz da
     MESMA semente/algoritmo do avatar (OKLCH); misturado à cor do texto do tema, sai escuro no
     claro e claro no escuro — contraste ≥ 4,5:1 nos dois. Sem suporte a color-mix o navegador
     descarta o valor e vale a cor do CSS. Semente = TELEFONE antes do nome, a mesma chave que
     agrupa o bloco do remetente (buildMensagensComSeparadores): a mesma pessoa mantém a cor
     quando uma mensagem chega sem nome (histórico importado) ou ela troca o nome de exibição. */
  const remetenteSemente = remetente ? String(msg?.remetente_telefone || msg?.remetente_nome || "") : "";
  /* Autor na prévia da folha (celular): mensagem de OUTRO atendente leva o nome dele (não
     "Você"); em grupo vale o participante mesmo nas mensagens seguidas do bloco, onde
     `remetente` fica vazio (só a 1.ª do bloco mostra o nome). */
  const usuarioNome = safeString(msg?.usuario_nome);
  const previewAuthor = out
    ? usuarioNome && currentUserId != null && String(msg?.autor_usuario_id) !== String(currentUserId)
      ? usuarioNome
      : "Você"
    : safeString(msg?.remetente_nome) || safeString(msg?.remetente_telefone) || peerName || "Contato";
  const remetenteNomeStyle = useMemo(() => {
    if (!remetenteSemente) return undefined;
    const hue = matizDaSemente(remetenteSemente);
    return { color: `color-mix(in oklch, oklch(58% 0.15 ${hue}) 65%, var(--wa-text, #111b21))` };
  }, [remetenteSemente]);
  const retry = useMediaRetry(msg, classified, { onReenviarFalha, onReenviarAudio });
  /* Recusa de mídia local (27/11/2026): com o "Tentar novamente" na bolha, o aviso dele já diz
     "Não foi possível enviar" — esta linha fica só com o motivo, sem repetir a frase. Sem botão
     de reenvio, continua a frase completa. */
  const localFailureText = localMediaFailureText(msg);
  const retryMostraAviso = retry.canShowRetry && !isAudioOrVoice && !temIdDoProvedor(msg);
  const falhaLocal = localFailureText ? motivoDaFalhaLocal(msg) : null;
  const localFailureLine = !falhaLocal
    ? ""
    : retryMostraAviso
      ? falhaLocal.resto
      : falhaLocal.repete
        ? falhaLocal.motivo
        : localFailureText;
  // Mídia recebida cuja cópia p/ /uploads não chegou pelo socket se cura sozinha (sem F5).
  useInboundMediaAutoHeal(msg, out, isImg || isSticker || isVideo || isAudioOrVoice || isFile);
  const showMenuButton = !selectMode;
  const bubbleRef = useRef(null);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [reactionExpanded, setReactionExpanded] = useState(false);
  const showReactionPicker = !isCall && (reactionOpen || showMobileReactionPicker);

  /*
   * Seletor de reação do hover (desktop): fecha com ESC e com clique fora, como o menu. Antes o
   * ESC caía no "fechar a conversa" inteira e o clique fora deixava o seletor aberto (26/11/2026).
   * pointerdown em captura: o próprio ReactionPicker para a propagação do React.
   */
  useEffect(() => {
    if (!reactionOpen) return undefined;
    const onDown = (e) => {
      if (bubbleRef.current?.contains(e.target)) return;
      setReactionOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setReactionOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [reactionOpen]);

  // Barra de reações no topo do menu (igual WhatsApp Web) — vale para o menu da setinha, para
  // o clique-direito e para o bottom-sheet mobile. Só não aparece em ligação ou mensagem
  // apagada para todos, onde reagir não existe.
  const menuShowsReactionBar = !isCall && !msg?.apagada_para_todos;

  const {
    menuOpen,
    setMenuOpen,
    openMenuAtPoint,
    menuStyle,
    menuAnchorRef,
    menuBtnRef,
    menuElRef,
  } = useMessageMenu({
    menuUsesBottomSheet,
    anchoredWidth: menuShowsReactionBar ? 268 : 220,
    reflowKey: reactionExpanded,
  });

  // Fechou o menu (backdrop/Esc) ou o picker: a barra volta compacta na proxima abertura.
  useEffect(() => {
    if (!menuOpen && !reactionOpen) setReactionExpanded(false);
  }, [menuOpen, reactionOpen]);

  const onBubbleContextMenuDesktop = useCallback(
    (e) => {
      // Em link/campo editável, deixa o menu nativo do navegador.
      const el = e.target;
      if (el && typeof el.closest === "function" && el.closest('a[href], input, textarea, [contenteditable="true"]')) {
        return;
      }
      e.preventDefault();
      if (selectMode) return;
      openMenuAtPoint(e.clientX, e.clientY);
    },
    [selectMode, openMenuAtPoint]
  );

  /*
   * A janela de edicao do WhatsApp (15 min) expira com o RELOGIO, nao com uma mudanca na
   * mensagem. Antes isto era um useMemo com dependencias so de campos da mensagem: o
   * `Date.now()` ficava congelado no ultimo render da linha — e o comparador de memo da
   * linha (threadRowPropsAreEqual) existe justamente para evitar re-renders. Na pratica, uma
   * mensagem lida aos 3 minutos nunca mais recalculava e o menu seguia oferecendo "Editar"
   * horas depois; o atendente entrava em modo de edicao, redigitava o texto e so entao
   * levava 409 EDIT_WINDOW_EXPIRED do backend.
   *
   * Avaliar na ABERTURA do menu custa nada (acontece uma vez por clique) e e sempre verdade
   * no instante em que a opcao e exibida. A segunda barreira esta em handleEditAction, que
   * reconfere antes de entrar em edicao — cobre o menu aberto na virada dos 15 minutos.
   */
  const canEditLatchRef = useRef(false);
  if (menuOpen) {
    canEditLatchRef.current = canEditMessage(msg, {
      out, currentUserId, provider: whatsappInstanceProvider,
    });
  }
  // Travado enquanto o menu esta na tela: o MessageMenu usa useMotionPresence e continua
  // montado durante a animacao de saida. Recalcular ali faria o item "Editar" sumir no meio
  // do fade e o menu saltar de altura. Avaliar so na ABERTURA basta e e sempre fresco.
  const canEdit = canEditLatchRef.current;

  const openBubbleMedia = useCallback(
    (url, type) => {
      onOpenMedia?.(url, type, msg?.nome_arquivo || undefined, msg);
    },
    [onOpenMedia, msg]
  );

  const {
    onBubblePointerDown,
    onBubbleContextMenu,
    handleMediaPointerDown,
    handleMediaPointerUp,
    handleMediaClick,
    clearSkipNextMediaTap,
  } = useMessageGestures({
    mobileMessageChrome,
    selectMode,
    menuOpen,
    setMenuOpen,
    onOpenMedia: openBubbleMedia,
  });

  useEffect(() => {
    if (!menuOpen) clearSkipNextMediaTap();
  }, [menuOpen, clearSkipNextMediaTap]);

  /*
   * Entrada da bolha como ESTADO, não como classList (16/11/2026). Antes:
   * - o snap ao fim punha `.is-scrolling`, que cancela a animação (`animationcancel`, não
   *   `animationend`); ao sair a classe, a entrada recomeçava do zero — a bolha aparecia,
   *   sumia e entrava de novo;
   * - abrir o menu numa das 2 últimas bolhas re-renderizava a Bubble, o React reescrevia o
   *   className e apagava o `zap-anim-settled` posto à mão: a entrada tocava outra vez.
   * Agora a classe sai pelo React, uma vez, no fim OU no cancelamento da animação.
   */
  const [entering, setEntering] = useState(Boolean(zapAnimateIn));
  useEffect(() => {
    if (!entering || !bubbleRef.current) return undefined;
    const el = bubbleRef.current;
    const done = (event) => {
      if (event && event.target !== el) return; // animações dos filhos (onda do áudio etc.)
      setEntering(false);
    };
    el.addEventListener("animationend", done);
    el.addEventListener("animationcancel", done);
    /* Rede de segurança: se nenhuma animação correr (reduced-motion, regra suprimida), a
       classe não pode ficar pendurada. */
    const t = window.setTimeout(() => setEntering(false), 900);
    return () => {
      el.removeEventListener("animationend", done);
      el.removeEventListener("animationcancel", done);
      window.clearTimeout(t);
    };
  }, [entering]);

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const onSelectStart = (ev) => {
      // Desktop: permite selecionar o texto da mensagem (WhatsApp Web).
      // Mobile/tablet e modo seleção: bloqueia a seleção nativa para não brigar com long-press / checkbox.
      if (selectMode || mobileMessageChrome) ev.preventDefault();
    };
    el.addEventListener("selectstart", onSelectStart);
    return () => el.removeEventListener("selectstart", onSelectStart);
  }, [msg?.id, selectMode, mobileMessageChrome]);

  const canSelectMessage = Boolean(msg?.id) && !msg?.apagada_para_todos;

  const handleToggleSelect = useCallback(
    (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      onToggleSelected?.(msg);
    },
    [onToggleSelected, msg]
  );

  const handleStartSelectFromMouse = useCallback(
    (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (!canSelectMessage) return;
      if (selectMode) {
        onToggleSelected?.(msg);
        return;
      }
      onStartSelect?.(msg);
    },
    [canSelectMessage, selectMode, onToggleSelected, onStartSelect, msg]
  );

  const handleRowClick = useCallback(
    (e) => {
      if (!canSelectMessage) return;
      if (selectMode) {
        if (e.target?.closest?.(".wa-selectChk, .wa-msgMenuBtn, .wa-reactionBtn, .wa-reactionPicker, a[href], button")) {
          return;
        }
        handleToggleSelect(e);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        onStartSelect?.(msg);
      }
    },
    [canSelectMessage, selectMode, handleToggleSelect, onStartSelect, msg]
  );

  /*
   * O que "Copiar" copia (26/11/2026). Antes, mídia sem legenda copiava a URL da mídia — e a de
   * fora do /uploads passa pelo /media/proxy com `access_token=<JWT>` na query: colar num chat
   * entregava a SESSÃO do atendente. Agora só texto da mensagem/legenda; mídia sem legenda não
   * oferece "Copiar" (o "Salvar como…" cobre o arquivo), como no WhatsApp Web.
   */
  const ehMidiaParaCopia = isImg || isSticker || isVideo || isAudioOrVoice || isFile;
  const copyText = ehMidiaParaCopia
    ? classified.showCaption ||
      classified.showAudioText ||
      (isFile && classified.hasText && classified.texto !== msg?.nome_arquivo)
      ? safeString(classified.texto)
      : ""
    : safeString(classified.texto) || safeString(msg?.texto);
  const canCopy = Boolean(String(copyText || "").trim());
  const doCopy = useCallback(async () => {
    // Copia o texto como está (27/11/2026): o filtro antigo tirava `token=` de QUALQUER link —
    // link de pagamento/redefinição de senha ia quebrado. Só a URL do nosso /media/proxy (que
    // leva o JWT de sessão em `access_token`) continua sem o token, por precaução.
    const text = semTokenDoProxyDeMidia(copyText);
    if (!text.trim()) {
      onCopy?.(false);
      return;
    }
    const ok = await copyTextToClipboard(text);
    onCopy?.(ok);
  }, [copyText, onCopy]);

  /*
   * "Salvar como…" da mídia. Sem isto não existe NENHUMA forma de salvar foto/vídeo/áudio/
   * figurinha: o menu nativo do navegador não alcança a mídia (`pointer-events: none` na
   * imagem e `-webkit-touch-callout: none` na bolha existem para o gesto cair neste menu).
   * O guard por ref evita um segundo download enquanto o primeiro está em voo — o menu fecha
   * no clique, então não há estado visual para barrar o toque repetido.
   */
  const downloadInFlightRef = useRef(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const ehBolhaDeMidia = isImg || isSticker || isVideo || isAudioOrVoice || isFile;
  const canDownload = useMemo(
    () => podeBaixarMidiaDaMensagem(msg, { mediaUrl, out, ehMidia: ehBolhaDeMidia }),
    [msg, mediaUrl, out, ehBolhaDeMidia]
  );
  const handleDownloadAction = useCallback(async () => {
    if (downloadInFlightRef.current) return;
    downloadInFlightRef.current = true;
    setDownloadBusy(true);
    try {
      await salvarMidiaComFeedback({
        msg,
        url: mediaUrl,
        tipo: msg?.tipo,
        fileName: msg?.nome_arquivo || undefined,
      });
    } finally {
      downloadInFlightRef.current = false;
      setDownloadBusy(false);
    }
  }, [msg, mediaUrl]);

  const runAction = useCallback(
    async (action) => {
      setMenuOpen(false);
      if (action === "info") onInfo?.(msg);
      if (action === "reply") onReply?.(msg);
      if (action === "copy") await doCopy();
      if (action === "forward") onForward?.(msg);
      if (action === "download") await handleDownloadAction();
      if (action === "pin") onTogglePin?.(msg);
      if (action === "star") onToggleStar?.(msg);
      if (action === "select") onStartSelect?.(msg);
      if (action === "deleteForMe") onDeleteForMe?.(msg);
      if (action === "deleteForEveryone") onDeleteForEveryone?.(msg);
      if (action === "edit") onEdit?.(msg);
    },
    [msg, onInfo, onReply, doCopy, onForward, handleDownloadAction, onTogglePin, onToggleStar, onStartSelect, onDeleteForMe, onDeleteForEveryone, onEdit, setMenuOpen]
  );

  const typedProps = {
    classified,
    msg,
    isPinned,
    isStarred,
    mediaUrl,
    audioPlaybackCandidates,
    selectMode,
    isGroup,
    peerAvatarUrl,
    peerName,
    onOpenMedia,
    onConversarContact,
    onAdicionarGrupoContact,
    handleMediaPointerDown,
    handleMediaPointerUp,
    handleMediaClick,
    retry,
    offlineAudioDisponivel: !!offlineAudioUrl,
    estaOffline: !online,
  };

  return (
      <div
        className={`wa-row ${out ? "wa-row-out" : "wa-row-in"}${localReaction ? " wa-row--hasReaction" : ""}${
          captionBundleTop ? " wa-row--captionBundleTop" : ""
        }${captionBundleFollow ? " wa-row--captionBundleFollow" : ""}${menuOpen ? " wa-row--menuOpen" : ""}`}
        data-msg-id={msg?.id}
        data-group-start={showRemetente && !out ? "1" : "0"}
        onClick={canSelectMessage ? handleRowClick : undefined}
        onClickCapture={selectMode && canSelectMessage ? (event) => {
          // A media button/link must select, never open its viewer in selection mode.
          if (event.target.closest?.(".wa-selectChk")) return;
          event.preventDefault();
          event.stopPropagation();
          handleToggleSelect(event);
        } : undefined}
      >
      {selectMode && canSelectMessage ? (
        <button
          type="button"
          className={`wa-selectChk ${selected ? "isOn" : ""}`}
          onClick={handleToggleSelect}
          title={selected ? "Desmarcar" : "Selecionar"}
          aria-label={selected ? "Desmarcar mensagem" : "Selecionar mensagem"}
          aria-pressed={selected}
        >
          <svg className="wa-selectChk-check" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3.5 8.4 6.6 11.4 12.5 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}

      <SwipeReplyTrack
        enabled={Boolean(swipeReplyEnabled && !isCall && !msg?.apagada_para_todos)}
        outgoing={out}
        gestureBlocked={menuOpen || showReactionPicker || selectMode}
        onCommit={() => {
          setMenuOpen(false);
          setReactionOpen(false);
          setReactionExpanded(false);
          onReply?.(msg);
        }}
      >
      {showMobileReactionPicker && !isCall ? (
        <ReactionPicker
          mobileSelected
          reactionExpanded={reactionExpanded}
          reactionBusy={reactionBusy}
          apagadaParaTodos={msg?.apagada_para_todos}
          localReaction={reactionFromPeer ? null : localReaction}
          onReact={(emo) => onReact?.(msg, emo)}
          onRemoveReaction={() => onRemoveReaction?.(msg)}
          onExpandToggle={() => setReactionExpanded((v) => !v)}
          onPicked={() => {
            setReactionOpen(false);
            setReactionExpanded(false);
          }}
        />
      ) : null}
      <div
        ref={(node) => {
          menuAnchorRef.current = node;
          bubbleRef.current = node;
        }}
        className={[
          "wa-bubble",
          entering ? "zap-message-enter" : "",
          out ? "wa-bubble-out" : "wa-bubble-in",
          hasInlineMetaClass ? "hasInlineMeta" : "",
          (isImg || isSticker) ? "wa-bubble-media" : "",
          isSticker ? "wa-bubble-sticker sticker-message" : "",
          isImg && !isSticker ? "image-message" : "",
          isFile ? "wa-bubble-fileWrap" : "",
          isContact ? "wa-bubble-contactWrap" : "",
          isLocation ? "wa-bubble-locationWrap" : "",
          isAudioOrVoice ? "wa-bubble-audio audio-message" : "",
          isVideo ? "wa-bubble-video" : "",
          selected ? "isSelected" : "",
          menuOpen ? "wa-bubble--menuOpen" : "",
          mobileMessageChrome ? "wa-bubble--mobileUx" : "",
          msg?.apagada_para_todos ? "wa-bubble--revokedEveryone" : "",
          isApagadaPeloCliente ? "wa-bubble--clientDeleted" : "",
        ].filter(Boolean).join(" ")}
        onPointerDown={mobileMessageChrome && !selectMode ? onBubblePointerDown : undefined}
        onContextMenu={mobileMessageChrome ? onBubbleContextMenu : onBubbleContextMenuDesktop}
        role="group"
        aria-label="Mensagem"
      >
        {showMenuButton && !mobileMessageChrome ? (
          <button
            ref={menuBtnRef}
            type="button"
            className={`wa-msgMenuBtn wa-msgMenuBtn--top ${menuOpen ? "isOpen" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            title="Mais opções"
            aria-label="Abrir opções da mensagem"
          >
            <svg
              className="wa-msgMenuBtn-caret"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4.6 6.4 8 9.6l3.4-3.2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
        <div className="wa-bubble-body">
          {deletionInfo ? (
            <BubbleDeletedNotice info={deletionInfo} currentUserId={currentUserId} />
          ) : null}
          {isEncaminhado && !isFile && !isContact && !isLocation ? (
            <div className="wa-bubble-fwd-badge">
              <svg className="wa-bubble-fwd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 10 20 15 15 20" />
                <path d="M4 4v7a4 4 0 0 0 4 4h12" />
              </svg>
              <span>Encaminhado</span>
            </div>
          ) : null}
          {hasReply && (
            <QuotedReply
              replyMeta={replyMeta}
              out={out}
              peerName={peerName}
              onJumpToReply={onJumpToReply}
            />
          )}
          {out &&
          msg?.enviado_por_usuario &&
          !isApagadaParaTodos &&
          safeString(msg?.usuario_nome) &&
          !(
            !msg?.id &&
            !msg?.whatsapp_id &&
            msg?.tempId &&
            safeString(msg?.usuario_nome).toLowerCase() === safeString(peerName).toLowerCase()
          ) ? (
            <div
              className="wa-bubble-atendente"
              aria-label={`Enviado por ${msg.usuario_nome}`}
              title={`Enviado por ${msg.usuario_nome}`}
            >
              <svg
                className="wa-bubble-atendente-ic"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="8" r="3.4" />
                <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
              </svg>
              <span className="wa-bubble-atendente-nome">{msg.usuario_nome}</span>
            </div>
          ) : null}
          {remetente ? (
            <div className="wa-bubble-remetente">
              <span className="wa-bubble-remetente-nome" style={remetenteNomeStyle}>
                {remetente}
              </span>
              {/* includeAudioAndCall: a 1ª mensagem de cada bloco do remetente em GRUPO ficava
                  sem player de áudio (caía no fallback de texto) — o CSS .wa-bubble-audio
                  .wa-bubble-remetente sempre previu nome + player juntos. */}
              <BubbleTypedContent includeAudioAndCall requireVideoUrl={false} {...typedProps} />
            </div>
          ) : (
            <BubbleTypedContent includeAudioAndCall requireVideoUrl {...typedProps} />
          )}
          {shouldShowLocalMediaNotice(msg) ? (
            <p className="wa-local-media-notice" role="note">{LOCAL_MEDIA_LOSS_NOTICE}</p>
          ) : localFailureLine ? (
            <p className="wa-local-media-notice wa-local-media-notice--erro" role="note">{localFailureLine}</p>
          ) : null}
          {retry.canShowRetry && !isAudioOrVoice ? (
            <MessageRetry
              isRetrying={retry.isRetrying}
              onRetry={retry.onRetry}
              payload={buildRetryPayload(msg, retry)}
              aceitoPeloProvedor={temIdDoProvedor(msg)}
            />
          ) : null}
        </div>
        {!selectMode && !mobileMessageChrome && canSelectMessage ? (
          <button
            type="button"
            className="wa-selectChk wa-selectChk--hover"
            onClick={handleStartSelectFromMouse}
            title="Selecionar mensagem (Ctrl+clique)"
            aria-label="Selecionar mensagem"
          />
        ) : null}
        {!isCall && !mobileMessageChrome && !selectMode ? (
          <ReactionButton
            reactionOpen={reactionOpen}
            reactionBusy={reactionBusy}
            apagadaParaTodos={msg?.apagada_para_todos}
            onToggle={() => {
              setReactionOpen((v) => !v);
              setReactionExpanded(false);
            }}
          />
        ) : null}
        <div className="wa-bubble-meta">
          <div className="wa-bubble-metaLeft">
            {showFloatingMetaTime ? (
              <>
                {!(isAudioOrVoice && audioTemPlayer) ? (
                  <>
                    <EditedLabel msg={msg} />
                    <span className="wa-bubble-time">{formatHora(msg?.criado_em)}</span>
                  </>
                ) : null}
                <MessageStatus msg={msg} isGroup={Boolean(isGroup)} />
              </>
            ) : null}
            {isPinned ? (
              <Pin className="wa-bubble-badge" aria-label="Fixada" role="img" strokeWidth={2.2} />
            ) : null}
            {isStarred ? (
              <Star className="wa-bubble-badge" aria-label="Favorita" role="img" fill="currentColor" strokeWidth={1.8} />
            ) : null}
          </div>
        </div>

        {reactionOpen && !isCall ? (
          <ReactionPicker
            reactionExpanded={reactionExpanded}
            reactionBusy={reactionBusy}
            apagadaParaTodos={msg?.apagada_para_todos}
            localReaction={reactionFromPeer ? null : localReaction}
            onReact={(emo) => onReact?.(msg, emo)}
            onRemoveReaction={() => onRemoveReaction?.(msg)}
            onExpandToggle={() => setReactionExpanded((v) => !v)}
            onPicked={() => {
              setReactionOpen(false);
              setReactionExpanded(false);
            }}
          />
        ) : null}

        <ReactionBadge localReaction={localReaction} fromPeer={reactionFromPeer} />
      </div>
      </SwipeReplyTrack>

      <MessageMenu
        menuOpen={menuOpen}
        menuUsesBottomSheet={menuUsesBottomSheet}
        menuStyle={menuStyle}
        menuElRef={menuElRef}
        mobileMessageChrome={mobileMessageChrome}
        showReactionBar={menuShowsReactionBar}
        isCall={isCall}
        apagadaParaTodos={msg?.apagada_para_todos}
        out={out}
        isPinned={isPinned}
        isStarred={isStarred}
        canDeleteForEveryone={canDeleteForEveryone}
        canEdit={canEdit}
        canForward={!isInternalNoteEditTipo(msg)}
        canDownload={canDownload}
        canCopy={canCopy}
        previewMsg={menuUsesBottomSheet ? msg : null}
        previewAuthor={previewAuthor}
        downloadBusy={downloadBusy}
        reactionExpanded={reactionExpanded}
        reactionBusy={reactionBusy}
        localReaction={reactionFromPeer ? null : localReaction}
        onClose={() => setMenuOpen(false)}
        onAction={runAction}
        onReact={(emo) => onReact?.(msg, emo)}
        onRemoveReaction={() => onRemoveReaction?.(msg)}
        onExpandToggle={() => setReactionExpanded((v) => !v)}
        onReactionPicked={() => {
          setReactionOpen(false);
          setReactionExpanded(false);
          setMenuOpen(false);
        }}
      />
    </div>
  );
});

export default Bubble;
