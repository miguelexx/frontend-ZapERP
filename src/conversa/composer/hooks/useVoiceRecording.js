import { useCallback, useEffect, useRef, useState } from "react";
import {
  acquireMicStream,
  invalidateMicStream,
  isMicSupported,
  queryMicPermissionState,
  shouldShowMicPersistenceHint,
} from "../../../media/micStreamService";
import { cleanupAudioRecording } from "../../../media/audioRecordingLifecycle";
import {
  RECORDED_AUDIO_MAX_MS,
  RECORDED_AUDIO_MIN_BYTES,
  RECORDED_AUDIO_MIN_MS,
  attachRecordedAudioMetadata,
  audioExtensionFromMime,
  inspectRecordedAudioBlob,
  pickRecordingMimeType,
} from "../utils/recordedAudio";

export function useVoiceRecording({
  conversaId,
  podeEnviar,
  onSendAudioFile,
  onRecordingStateChange,
  onConversationChange,
  showToast,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recordingConversaIdRef = useRef(conversaId);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  const finishRecordingUi = useCallback(() => {
    if (!mountedRef.current) return;
    setIsRecording(false);
    setRecordingSeconds(0);
  }, []);

  const cleanupSession = useCallback((options = {}) => {
    const {
      markCanceled = false,
      requestDataBeforeStop = false,
      preserveOnStop = false,
      releaseMic = true,
    } = options;
    return cleanupAudioRecording({
      mediaRecorderRef,
      streamRef: recordingStreamRef,
      timerRef: recordingTimerRef,
      markCanceled,
      requestDataBeforeStop,
      preserveOnStop,
      releaseMic,
      setNotRecording: finishRecordingUi,
    });
  }, [finishRecordingUi]);

  const cancelRecording = useCallback(() => {
    generationRef.current += 1;
    cleanupSession({ markCanceled: true });
  }, [cleanupSession]);

  const startRecording = useCallback(async () => {
    if (!conversaId || isRecording) return;
    if (!podeEnviar) {
      showToast?.({
        type: "warning",
        title: "Conversa não assumida",
        message: "Clique em Assumir para enviar mensagens.",
      });
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setRecordingSeconds(0);
    cleanupSession({ markCanceled: true });
    try {
      if (!window.isSecureContext) {
        showToast?.({
          type: "error",
          title: "Microfone",
          message: "Para gravar áudio, acesse via HTTPS (ou localhost). Em HTTP o navegador bloqueia o microfone.",
        });
        return;
      }
      if (!isMicSupported()) {
        showToast?.({
          type: "error",
          title: "Microfone",
          message: "Seu navegador não suporta gravação de áudio (getUserMedia indisponível).",
        });
        return;
      }
      const permissionState = await queryMicPermissionState();
      if (!mountedRef.current || generation !== generationRef.current) return;
      if (permissionState === "denied") {
        showToast?.({
          type: "error",
          title: "Microfone bloqueado",
          message: "O microfone está bloqueado para este site. Clique no cadeado do navegador e permita o microfone.",
        });
        return;
      }

      const stream = await acquireMicStream();
      if (!mountedRef.current || generation !== generationRef.current) {
        cleanupAudioRecording({ stream, releaseMic: true });
        return;
      }
      recordingStreamRef.current = stream;
      if (await shouldShowMicPersistenceHint()) {
        if (!mountedRef.current || generation !== generationRef.current) {
          cleanupAudioRecording({ stream, streamRef: recordingStreamRef, releaseMic: true });
          return;
        }
        showToast?.({
          type: "info",
          title: "Permissão do microfone",
          message:
            "O navegador liberou o microfone, mas não confirmou permissão permanente. Para não pedir de novo ao sair e entrar, abra o cadeado/permissões do site e marque Microfone como Permitir.",
        });
      }

      const mimeType = pickRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      const startedAt = Date.now();
      recorder.__zapStartedAt = startedAt;
      recorder.__zapStopAt = 0;
      recorder.__zapCanceled = false;
      recorder.__zapInterrupted = null;
      recorder.__zapStream = stream;

      const micTrack = stream.getAudioTracks?.()[0] || null;
      let muteTimer = null;
      const detachMicWatch = () => {
        if (muteTimer) {
          clearTimeout(muteTimer);
          muteTimer = null;
        }
        if (!micTrack) return;
        micTrack.removeEventListener("ended", onTrackEnded);
        micTrack.removeEventListener("mute", onTrackMuted);
        micTrack.removeEventListener("unmute", onTrackUnmuted);
      };
      const interruptRecording = (reason) => {
        if (recorder.__zapCanceled || recorder.__zapInterrupted) return;
        recorder.__zapInterrupted = reason;
        recorder.__zapStopAt = Date.now();
        cleanupSession({ markCanceled: true });
      };
      function onTrackEnded() {
        interruptRecording("track_ended");
      }
      function onTrackMuted() {
        if (muteTimer) clearTimeout(muteTimer);
        muteTimer = setTimeout(() => {
          muteTimer = null;
          if (micTrack?.muted) interruptRecording("track_muted");
        }, 2000);
      }
      function onTrackUnmuted() {
        if (muteTimer) {
          clearTimeout(muteTimer);
          muteTimer = null;
        }
      }
      if (micTrack) {
        micTrack.addEventListener("ended", onTrackEnded);
        micTrack.addEventListener("mute", onTrackMuted);
        micTrack.addEventListener("unmute", onTrackUnmuted);
      }
      recorder.onerror = () => interruptRecording("recorder_error");
      recorder.__zapDetachMicWatch = detachMicWatch;
      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        detachMicWatch();
        const wasCanceled = recorder.__zapCanceled === true;
        const recordedChunks = chunks.slice();
        const localStartedAt = recorder.__zapStartedAt || startedAt;
        const stoppedAt = recorder.__zapStopAt || Date.now();
        const elapsedMs = Math.max(0, stoppedAt - localStartedAt);
        cleanupAudioRecording({
          stream: recorder.__zapStream || recordingStreamRef.current || null,
          streamRef: recordingStreamRef,
          releaseMic: true,
        });
        if (wasCanceled) return;
        if (recorder.__zapInterrupted || recorder.__zapStopAt === 0) {
          showToast?.({
            type: "error",
            title: "Gravação interrompida",
            message:
              "O microfone parou de gravar antes do envio (pode ter sido desconectado ou usado por outro app). Grave o áudio novamente.",
          });
          return;
        }
        if (recordedChunks.length === 0) return;
        const finalType = recorder.mimeType || mimeType || "audio/webm";
        const extension = audioExtensionFromMime(finalType);
        const blob = new Blob(recordedChunks, { type: finalType });
        if (elapsedMs < RECORDED_AUDIO_MIN_MS || blob.size < RECORDED_AUDIO_MIN_BYTES) {
          showToast?.({
            type: "warning",
            title: "Áudio muito curto",
            message: "Grave por pelo menos 1 segundo antes de enviar.",
          });
          return;
        }
        if (elapsedMs > RECORDED_AUDIO_MAX_MS) {
          showToast?.({
            type: "warning",
            title: "Audio muito longo",
            message: "Envie audios de ate 10 minutos.",
          });
          return;
        }
        try {
          const metadata = await inspectRecordedAudioBlob(blob);
          if (metadata.error === "decode_error") {
            console.warn("[audio] <audio> não decodificou a gravação; usando duração medida e enviando mesmo assim.");
          }
          const rawDurationMs = Number.isFinite(metadata.durationSec)
            ? Math.round(metadata.durationSec * 1000)
            : null;
          const durationMs =
            rawDurationMs !== null && rawDurationMs <= elapsedMs * 2 + 5000
              ? rawDurationMs
              : elapsedMs;
          if (Number.isFinite(durationMs) && durationMs < RECORDED_AUDIO_MIN_MS) {
            showToast?.({
              type: "warning",
              title: "Audio muito curto",
              message: "Grave por pelo menos 1 segundo antes de enviar.",
            });
            return;
          }
          if (Number.isFinite(durationMs) && durationMs > RECORDED_AUDIO_MAX_MS + 5000) {
            showToast?.({
              type: "warning",
              title: "Audio muito longo",
              message: "Envie audios de ate 10 minutos.",
            });
            return;
          }
          const now = Date.now();
          const file = attachRecordedAudioMetadata(
            new File([blob], `audio-${now}.${extension}`, { type: finalType, lastModified: now }),
            { durationMs, elapsedMs, mimeType: finalType, bytes: blob.size }
          );
          await onSendAudioFile?.(file);
        } catch (sendError) {
          console.error("Erro ao enviar áudio gravado:", sendError);
          cleanupSession({ markCanceled: false, releaseMic: true });
          showToast?.({
            type: "error",
            title: "Áudio",
            message: "Não foi possível enviar o áudio. Tente gravar novamente.",
          });
        }
      };

      recorder.start(400);
      mediaRecorderRef.current = recorder;
      if (mountedRef.current && generation === generationRef.current) setIsRecording(true);
    } catch (error) {
      console.error("Erro ao iniciar gravação:", error);
      const name = String(error?.name || "");
      cleanupSession({ markCanceled: true });
      if (name === "NotAllowedError" || name === "NotFoundError") invalidateMicStream();
      if (!mountedRef.current || generation !== generationRef.current) return;
      const message =
        name === "NotAllowedError"
          ? "Permissão negada. Clique no cadeado do navegador e permita o microfone."
          : name === "NotFoundError"
            ? "Nenhum microfone foi encontrado no dispositivo."
            : "Não foi possível acessar o microfone. Verifique as permissões.";
      showToast?.({ type: "error", title: "Microfone", message });
    }
  }, [cleanupSession, conversaId, isRecording, onSendAudioFile, podeEnviar, showToast]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current && !isRecording) {
      cleanupSession({ releaseMic: true });
      return;
    }
    cleanupSession({ requestDataBeforeStop: true, preserveOnStop: true, releaseMic: true });
  }, [cleanupSession, isRecording]);

  useEffect(() => {
    if (String(recordingConversaIdRef.current ?? "") !== String(conversaId ?? "")) {
      if (mediaRecorderRef.current || recordingStreamRef.current || isRecording) cancelRecording();
      onConversationChange?.();
    }
    recordingConversaIdRef.current = conversaId;
  }, [cancelRecording, conversaId, isRecording, onConversationChange]);

  useEffect(() => {
    if (!isRecording) return undefined;
    recordingTimerRef.current = setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording]);

  useEffect(() => {
    onRecordingStateChange?.(isRecording);
  }, [isRecording, onRecordingStateChange]);

  useEffect(() => {
    mountedRef.current = true;
    const onPageLeave = () => cancelRecording();
    window.addEventListener("pagehide", onPageLeave);
    window.addEventListener("beforeunload", onPageLeave);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", onPageLeave);
      window.removeEventListener("beforeunload", onPageLeave);
      cancelRecording();
    };
  }, [cancelRecording]);

  return {
    isRecording,
    recordingSeconds,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
