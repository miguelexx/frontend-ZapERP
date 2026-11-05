import { formatHora, formatMmSs } from "../../utils/conversaViewHelpers";
import { IconPlay, IconPause } from "../../conversaViewIcons";
import { WA_AUDIO_SPEEDS } from "../utils/audioConstants";
import { useAudioPlayback } from "../hooks/useAudioPlayback";
import { AudioCaption } from "./MessageCaption";
import MessageRetry from "./MessageRetry";
import { buildAudioRetryPayload } from "../utils/bubbleRetry";
import { temIdDoProvedor } from "../utils/bubbleStatus";
import { canReprocessInboundMedia, requestInboundMediaReprocess } from "../utils/inboundMediaReprocess";

const rotuloVelocidade = (rate) => (rate === 1 ? "1×" : `${rate}×`);

/** Próxima do ciclo 1× → 1.5× → 2× → 1×. */
function proximaVelocidadeDe(atual) {
  const i = WA_AUDIO_SPEEDS.indexOf(atual);
  return WA_AUDIO_SPEEDS[(i < 0 ? 0 : i + 1) % WA_AUDIO_SPEEDS.length];
}

function AudioWavePlayer({ src, candidates, msgKey, avatarUrl, avatarLabel, initialDuration, sentAtLabel, reprocessMedia, offlineAudioDisponivel = false, estaOffline = false }) {
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

  // Offline sem cópia local: bloquear só o INÍCIO FRIO do play. Tocando (pausar) e RETOMAR
  // de um buffer já carregado (caiu a rede no meio da reprodução) continuam livres — o
  // elemento ainda tem dados. Sem isto o clique gastava os vigias (10s+) para então
  // declarar "indisponível" — aqui o estado é honesto e imediato.
  const elAtual = audioRef.current;
  const temBufferLocal = !!elAtual && ((Number(elAtual.currentTime) || 0) > 0 || Number(elAtual.readyState) >= 2);
  const playBloqueadoOffline = estaOffline && !offlineAudioDisponivel && !playing && !temBufferLocal;
  const proximaVelocidade = proximaVelocidadeDe(playbackRate);

  return (
    <div className={`wa-audioPlayer ${playing ? "isPlaying" : ""}`}>
      <button
        type="button"
        className={`wa-audioPlayBtn ${playing ? "isPlaying" : ""} ${playBloqueadoOffline ? "isOfflineBlocked" : ""}`}
        onPointerDown={keepMobileKeyboardOpen}
        onPointerUp={playBloqueadoOffline ? keepMobileKeyboardOpen : handlePlayPointerUp}
        onClick={playBloqueadoOffline ? (e) => e.stopPropagation() : handlePlayClick}
        aria-disabled={playBloqueadoOffline || undefined}
        title={playBloqueadoOffline ? "Sem conexão — este áudio ainda não foi baixado para uso offline." : undefined}
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
          {/*
            * UM botão que alterna, não três sempre abertos.
            *
            * Os três ocupavam cerca de um terço da largura do player e mostravam
            * permanentemente duas opções que ninguém escolheu — num sítio onde o que
            * interessa é a onda e a duração. Agora mostra a velocidade atual e um toque
            * passa à seguinte, como no WhatsApp.
            *
            * O `onPointerUp` + `pointerSpeedRef` ficam como estavam: existem para o toque
            * não disparar duas vezes (pointer e depois click) e para o `keepMobileKeyboardOpen`
            * não deixar o teclado fechar no telemóvel.
            */}
          <div className="wa-audioSpeedGroup" role="group" aria-label="Velocidade de reprodução">
            <button
              type="button"
              className={`wa-audioSpeedBtn ${playbackRate !== 1 ? "isActive" : ""}`}
              onPointerDown={keepMobileKeyboardOpen}
              onPointerUp={(e) => {
                if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
                e.preventDefault();
                e.stopPropagation();
                pointerSpeedRef.current = true;
                applyPlaybackRate(proximaVelocidade);
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (pointerSpeedRef.current) {
                  pointerSpeedRef.current = false;
                  return;
                }
                applyPlaybackRate(proximaVelocidade);
              }}
              aria-label={`Velocidade ${rotuloVelocidade(playbackRate)}. Tocar para ${rotuloVelocidade(proximaVelocidade)}`}
              title={`Velocidade ${rotuloVelocidade(playbackRate)} — tocar para ${rotuloVelocidade(proximaVelocidade)}`}
            >
              {rotuloVelocidade(playbackRate)}
            </button>
          </div>
        </div>
        <div className="wa-audioSub">
          <span className="wa-audioTime wa-audioTime--cur" title={formatMmSs(cur)}>
            {formatMmSs(cur)}
          </span>
          {estaOffline && !expirado && !indisponivel ? (
            offlineAudioDisponivel ? (
              <span
                className="wa-audioOfflineHint wa-audioOfflineHint--ok"
                title="Este áudio está salvo no dispositivo e toca sem internet."
              >
                Disponível offline
              </span>
            ) : (
              <span
                className="wa-audioOfflineHint"
                title="Sem conexão — este áudio ainda não foi baixado para uso offline."
              >
                Sem conexão — áudio não baixado
              </span>
            )
          ) : null}
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
  offlineAudioDisponivel = false,
  estaOffline = false,
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
          offlineAudioDisponivel={offlineAudioDisponivel}
          estaOffline={estaOffline}
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
          aceitoPeloProvedor={temIdDoProvedor(msg)}
        />
      ) : null}
    </div>
  );
}
