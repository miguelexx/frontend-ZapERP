import { formatHora, formatMmSs } from "../../utils/conversaViewHelpers";
import { IconPlay, IconPause } from "../../conversaViewIcons";
import { WA_AUDIO_SPEEDS } from "../utils/audioConstants";
import { useAudioPlayback } from "../hooks/useAudioPlayback";
import { AudioCaption } from "./MessageCaption";
import MessageRetry from "./MessageRetry";
import { buildAudioRetryPayload } from "../utils/bubbleRetry";
import { canReprocessInboundMedia, requestInboundMediaReprocess } from "../utils/inboundMediaReprocess";

function AudioWavePlayer({ src, candidates, msgKey, avatarUrl, avatarLabel, initialDuration, sentAtLabel, reprocessMedia }) {
  const {
    audioRef,
    waveMeasureRef,
    activeSrc,
    playing,
    indisponivel,
    expirado,
    reprocessando,
    dur,
    cur,
    playbackRate,
    bars,
    frac,
    playedBars,
    remaining,
    pLabel,
    pointerSpeedRef,
    keepMobileKeyboardOpen,
    handlePlayPointerUp,
    handlePlayClick,
    handleSeekPointerUp,
    handleSeekClick,
    applyPlaybackRate,
    tentarNovamente,
  } = useAudioPlayback({ src, candidates, msgKey, initialDuration, reprocessMedia });

  return (
    <div className={`wa-audioPlayer ${playing ? "isPlaying" : ""}`}>
      <button
        type="button"
        className={`wa-audioPlayBtn ${playing ? "isPlaying" : ""}`}
        onPointerDown={keepMobileKeyboardOpen}
        onPointerUp={handlePlayPointerUp}
        onClick={handlePlayClick}
        aria-label={playing ? "Pausar áudio" : "Tocar áudio"}
      >
        <span className="wa-audioPlayIcon wa-audioPlayIcon--play" aria-hidden="true">
          <IconPlay width="22" height="22" />
        </span>
        <span className="wa-audioPlayIcon wa-audioPlayIcon--pause" aria-hidden="true">
          <IconPause width="22" height="22" />
        </span>
      </button>
      <div className="wa-audioMid">
        <div className="wa-audioWaveRow">
          <div
            ref={waveMeasureRef}
            className="wa-audioWave"
            role="slider"
            aria-label="Progresso do áudio"
            onPointerDown={keepMobileKeyboardOpen}
            onPointerUp={handleSeekPointerUp}
            onClick={handleSeekClick}
            style={{ "--p": pLabel }}
          >
            {bars.map((v, i) => (
              <div
                key={i}
                className={`wa-audioBar ${i < playedBars ? "isPlayed" : ""}`}
                style={{ height: `${Math.round(8 + v * 18)}px`, "--i": i }}
              />
            ))}
            <div className="wa-audioDot" style={{ left: `${Math.round(frac * 100)}%` }} aria-hidden="true" />
          </div>
          <div className="wa-audioDurSlot">
            {playing ? (
              <span className="wa-audioRemain wa-audioRemain--slot" title={`Restante ${formatMmSs(remaining)}`}>
                -{formatMmSs(remaining)}
              </span>
            ) : null}
            <span className="wa-audioTime wa-audioTime--dur" title={formatMmSs(dur || 0)}>
              {formatMmSs(dur || 0)}
            </span>
          </div>
          <div className="wa-audioSpeedGroup" role="group" aria-label="Velocidade de reprodução">
            {WA_AUDIO_SPEEDS.map((rate) => (
              <button
                key={rate}
                type="button"
                className={`wa-audioSpeedBtn ${playbackRate === rate ? "isActive" : ""}`}
                onPointerDown={keepMobileKeyboardOpen}
                onPointerUp={(e) => {
                  if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
                  e.preventDefault();
                  e.stopPropagation();
                  pointerSpeedRef.current = true;
                  applyPlaybackRate(rate);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (pointerSpeedRef.current) {
                    pointerSpeedRef.current = false;
                    return;
                  }
                  applyPlaybackRate(rate);
                }}
                aria-pressed={playbackRate === rate}
                aria-label={rate === 1 ? "Velocidade normal" : `Velocidade ${rate} vezes`}
                title={rate === 1 ? "1×" : `${rate}×`}
              >
                {rate === 1 ? "1×" : `${rate}×`}
              </button>
            ))}
          </div>
        </div>
        <div className="wa-audioSub">
          <span className="wa-audioTime wa-audioTime--cur" title={formatMmSs(cur)}>
            {formatMmSs(cur)}
          </span>
          {expirado ? (
            <span
              className="wa-audioUnavailable wa-audioUnavailable--expired"
              data-testid="audio-expirado"
              title="Este áudio não está mais disponível no WhatsApp e não pode ser recuperado."
              aria-label="Áudio expirou no WhatsApp e não está mais disponível."
            >
              Áudio expirou no WhatsApp
            </span>
          ) : indisponivel ? (
            <button
              type="button"
              className="wa-audioUnavailable"
              data-testid="audio-indisponivel"
              disabled={reprocessando}
              aria-busy={reprocessando ? "true" : undefined}
              onPointerDown={keepMobileKeyboardOpen}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (reprocessando) return;
                void tentarNovamente();
              }}
              title={
                reprocessando
                  ? "Recarregando o áudio…"
                  : "Não foi possível carregar este áudio. Clique para tentar de novo."
              }
              aria-label={
                reprocessando
                  ? "Recarregando o áudio."
                  : "Áudio indisponível. Tentar carregar de novo."
              }
            >
              {reprocessando ? "Recarregando…" : "Áudio indisponível — tentar de novo"}
            </button>
          ) : null}
          {sentAtLabel ? (
            <span className="wa-audioSentAt" title={`Enviado às ${sentAtLabel}`}>
              {sentAtLabel}
            </span>
          ) : null}
        </div>
      </div>
      {avatarUrl ? (
        <span className="wa-audioAvatarWrap" aria-hidden="true">
          <img
            className="wa-audioAvatar"
            src={avatarUrl}
            alt={avatarLabel ? `Foto de ${avatarLabel}` : "Foto do contato"}
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        </span>
      ) : null}
      <audio ref={audioRef} src={activeSrc || undefined} preload="metadata" className="wa-audioElHidden" />
    </div>
  );
}

export default function AudioMessage({
  msg,
  mediaUrl,
  audioPlaybackCandidates,
  peerAvatarUrl,
  peerName,
  out,
  texto,
  showAudioText,
  canShowRetry,
  isRetrying,
  onRetry,
  retry,
}) {
  // Só mídia recebida e persistida pode pedir recópia ao backend; nos demais casos o callback é
  // ausente e o botão "tentar de novo" mantém o comportamento local de sempre.
  const reprocessMedia = canReprocessInboundMedia(msg, out)
    ? () => requestInboundMediaReprocess(msg)
    : undefined;
  return (
    <div className="wa-bubble-audioStack">
      <div className="wa-bubble-audioWrap">
        <AudioWavePlayer
          candidates={audioPlaybackCandidates}
          msgKey={msg?.whatsapp_id || msg?.id || msg?.tempId || audioPlaybackCandidates[0] || mediaUrl}
          avatarUrl={!out ? peerAvatarUrl : null}
          avatarLabel={!out ? peerName : null}
          sentAtLabel={formatHora(msg?.criado_em)}
          reprocessMedia={reprocessMedia}
          initialDuration={
            msg?.audio_duracao_sec ?? msg?.duration ?? msg?.media_duration ?? 0
          }
        />
      </div>
      <AudioCaption texto={texto} show={showAudioText} />
      {canShowRetry ? (
        <MessageRetry
          variant="audio"
          isRetrying={isRetrying}
          onRetry={onRetry}
          payload={buildAudioRetryPayload(msg, retry)}
        />
      ) : null}
    </div>
  );
}
