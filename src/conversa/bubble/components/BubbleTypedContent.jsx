import ImageMessage from "./ImageMessage";
import StickerMessage from "./StickerMessage";
import VideoMessage from "./VideoMessage";
import AudioMessage from "./AudioMessage";
import DocumentMessage from "./DocumentMessage";
import LocationMessage from "./LocationMessage";
import ContactMessage from "./ContactMessage";
import TextMessage, { FallbackMessage, CallMessage } from "./TextMessage";

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
  return <FallbackMessage label={fallbackContentLabel} />;
}
