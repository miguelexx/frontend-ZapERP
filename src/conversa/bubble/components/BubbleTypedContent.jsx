import ImageMessage from "./ImageMessage";
import StickerMessage from "./StickerMessage";
import VideoMessage from "./VideoMessage";
import AudioMessage from "./AudioMessage";
import DocumentMessage from "./DocumentMessage";
import LocationMessage from "./LocationMessage";
import ContactMessage from "./ContactMessage";
import PollMessage from "./PollMessage";
import ProductMessage from "./ProductMessage";
import PixMessage from "./PixMessage";
import WhapiTriageMessage from "./WhapiTriageMessage";
import TextMessage, { FallbackMessage, CallMessage } from "./TextMessage";
import MissingAudioRecover from "./MissingAudioRecover";
import { canReprocessInboundMedia } from "../utils/inboundMediaReprocess";

export default function BubbleTypedContent({
  includeAudioAndCall,
  requireVideoUrl,
  classified,
  msg,
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
  offlineAudioDisponivel = false,
  estaOffline = false,
}) {
  const {
    out,
    isImg,
    isSticker,
    isVideo,
    isAudioOrVoice,
    isFile,
    isLocation,
    isContact,
    isPoll,
    pollMeta,
    isInteractive,
    triageMeta,
    isPixCard,
    pixMeta,
    isProduct,
    productMeta,
    isCatalog,
    catalogMeta,
    isCall,
    hasText,
    texto,
    showCaption,
    showAudioText,
    inlineMeta,
    fallbackContentLabel,
    videoPlaybackUrl,
    contactBubbleMeta,
  } = classified;

  if (isImg) {
    return (
      <ImageMessage
        msg={msg}
        mediaUrl={mediaUrl}
        texto={texto}
        showCaption={showCaption}
        out={out}
        onPointerDown={handleMediaPointerDown}
        onPointerUp={handleMediaPointerUp}
        onClick={handleMediaClick}
      />
    );
  }
  if (isSticker) {
    return (
      <StickerMessage
        msg={msg}
        mediaUrl={mediaUrl}
        texto={texto}
        showCaption={showCaption}
        onPointerDown={handleMediaPointerDown}
        onPointerUp={handleMediaPointerUp}
        onClick={handleMediaClick}
      />
    );
  }
  if (isVideo && (!requireVideoUrl || mediaUrl)) {
    const src = videoPlaybackUrl || mediaUrl;
    return (
      <VideoMessage
        msg={msg}
        src={src}
        texto={texto}
        showCaption={showCaption}
        onPointerDown={handleMediaPointerDown}
        onPointerUp={handleMediaPointerUp}
        onClick={handleMediaClick}
      />
    );
  }
  if (includeAudioAndCall && isAudioOrVoice && mediaUrl) {
    return (
      <AudioMessage
        msg={msg}
        mediaUrl={mediaUrl}
        audioPlaybackCandidates={audioPlaybackCandidates}
        peerAvatarUrl={peerAvatarUrl}
        peerName={peerName}
        out={out}
        texto={texto}
        showAudioText={showAudioText}
        canShowRetry={retry.canShowRetry}
        isRetrying={retry.isRetrying}
        onRetry={retry.onRetry}
        retry={retry}
        offlineAudioDisponivel={offlineAudioDisponivel}
        estaOffline={estaOffline}
      />
    );
  }
  if (isFile) {
    return (
      <DocumentMessage
        msg={msg}
        mediaUrl={mediaUrl}
        selectMode={selectMode}
        onOpenMedia={onOpenMedia}
        isGroup={isGroup}
        out={out}
      />
    );
  }
  if (isLocation) {
    return (
      <LocationMessage msg={msg} selectMode={selectMode} isGroup={isGroup} out={out} />
    );
  }
  if (isPixCard) {
    return <PixMessage pixMeta={pixMeta} texto={texto} out={out} />;
  }
  if (isPoll) {
    return <PollMessage msg={msg} pollMeta={pollMeta} texto={texto} />;
  }
  if (isProduct || isCatalog) {
    return <ProductMessage product={productMeta} catalog={catalogMeta} texto={texto} />;
  }
  if (isInteractive) {
    return <WhapiTriageMessage meta={triageMeta} texto={texto} />;
  }
  if (isContact) {
    return (
      <ContactMessage
        msg={msg}
        contactMeta={contactBubbleMeta}
        selectMode={selectMode}
        isGroup={isGroup}
        out={out}
        onConversar={onConversarContact}
        onAdicionarGrupo={onAdicionarGrupoContact}
      />
    );
  }
  if (includeAudioAndCall && isCall) {
    return <CallMessage texto={texto} />;
  }
  if (hasText) {
    return <TextMessage texto={texto} inlineMeta={inlineMeta} msg={msg} isGroup={isGroup} />;
  }
  // Áudio recebido sem URL: o player não monta, então o "tentar de novo" dele não existe.
  // Esta bolha oferece a busca da mídia no provedor em vez de ficar um chip morto.
  if (includeAudioAndCall && isAudioOrVoice && !mediaUrl && canReprocessInboundMedia(msg, out)) {
    return (
      <MissingAudioRecover
        label={fallbackContentLabel}
        msg={msg}
        isGroup={isGroup}
        inlineMeta={inlineMeta}
      />
    );
  }
  return (
    <FallbackMessage
      label={fallbackContentLabel}
      inlineMeta={inlineMeta}
      msg={msg}
      isGroup={isGroup}
    />
  );
}
