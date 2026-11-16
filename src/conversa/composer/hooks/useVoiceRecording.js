import { useCallback, useEffect, useRef, useState } from "react";
import {
  acquireMicStream,
  getActiveMicStream,
  invalidateMicStream,
  isMicSupported,
  queryMicPermissionState,
  releaseMicStream,
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
  pickRecordedDurationMs,
  pickRecordingMimeType,
} from "../utils/recordedAudio";
import { audioTraceInicio, audioTraceMarca } from "../utils/audioSendTrace";

const TOAST_AUDIO_CURTO = {
  type: "warning",
  title: "Áudio muito curto",
  message: "Grave por pelo menos 1 segundo antes de enviar.",
};
const TOAST_AUDIO_LONGO = {
  type: "warning",
  title: "Áudio muito longo",
  message: "Envie áudios de até 10 minutos.",
};
const TOAST_INTERROMPIDA_SEM_AUDIO = {
  type: "error",
  title: "Gravação interrompida",
  message:
    "O microfone parou de gravar antes do envio (pode ter sido desconectado ou usado por outro app). Grave o áudio novamente.",
};

/**
 * Para as faixas do stream DESTA gravação sem encostar no microfone de uma gravação mais nova.
 *
 * Antes o `onstop` chamava `releaseMicStream()` e zerava `recordingStreamRef` às cegas. Quem
 * enviava um áudio e tocava no microfone logo em seguida (comum no celular) tinha a SEGUNDA
 * gravação morta quando o `onstop` da primeira chegava: mesmo stream ativo do serviço, mesmo ref.
 */
function releaseOwnStream(stream, streamRef) {
  if (!stream) return;
  try {
    for (const track of stream.getTracks?.() || []) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  if (streamRef && streamRef.current === stream) streamRef.current = null;
  if (getActiveMicStream() === stream) releaseMicStream();
}

/** Vibração curta de confirmação (Android). iOS/desktop não têm a API: no-op silencioso. */
function haptic(pattern) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

/** Mantém a tela acesa enquanto grava: no celular a tela apagar suspende o navegador e mata a gravação. */
function useScreenWakeLock(active) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.wakeLock?.request) return undefined;
    let lock = null;
    let disposed = false;
    const request = async () => {
      try {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        const next = await navigator.wakeLock.request("screen");
        if (disposed) {
          next?.release?.().catch?.(() => {});
          return;
        }
        lock = next;
      } catch {
        /* sem permissão / economia de bateria: segue sem wake lock */
      }
    };
    void request();
    // O sistema solta o wake lock quando a aba sai de foco; readquire ao voltar.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && (!lock || lock.released)) void request();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        lock?.release?.().catch?.(() => {});
      } catch {
        /* ignore */
      }
      lock = null;
    };
  }, [active]);
}

export function useVoiceRecording({
  conversaId,
  podeEnviar,
  onSendAudioFile,
  onAudioPlaceholder,
  onAudioPlaceholderDiscard,
  onRecordingStateChange,
  onConversationChange,
  showToast,
}) {
  // Refs: o composer é memoizado sem comparar callbacks; lê sempre a versão mais recente.
  const onAudioPlaceholderRef = useRef(onAudioPlaceholder);
  const onAudioPlaceholderDiscardRef = useRef(onAudioPlaceholderDiscard);
  onAudioPlaceholderRef.current = onAudioPlaceholder;
  onAudioPlaceholderDiscardRef.current = onAudioPlaceholderDiscard;
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  /** Microfone abrindo: o botão dá retorno visual (o pedido de permissão pode demorar). */
  const [isStarting, setIsStarting] = useState(false);
  /**
   * Gravação interrompida (ligação, outro app pegou o microfone, fone desconectou, navegador
   * parou o recorder). Antes o áudio inteiro era DESCARTADO — o atendente falava 1 minuto e
   * perdia tudo. Agora o trecho capturado fica aqui para ele decidir: enviar ou descartar.
   */
  const [draft, setDraft] = useState(null);
  const draftRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recordingConversaIdRef = useRef(conversaId);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  /**
   * Abertura do microfone em andamento. Sem esta trava, um segundo toque no microfone durante
   * o getUserMedia (lento no celular, ainda mais com o pedido de permissão) disparava outra
   * gravação: a primeira, ao ver a geração trocada, parava as faixas do stream COMPARTILHADO e a
   * segunda gravava de um microfone morto — "o navegador não entregou o áudio".
   */
  const startingRef = useRef(false);

  useScreenWakeLock(isRecording);

  const updateDraft = useCallback((next) => {
    draftRef.current = next;
    if (mountedRef.current) setDraft(next);
  }, []);

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
    updateDraft(null);
    cleanupSession({ markCanceled: true });
  }, [cleanupSession, updateDraft]);

  const sendFile = useCallback(
    async (file, { generation, durationMs, placeholderTempId = null } = {}) => {
      try {
        await onSendAudioFile?.(file, placeholderTempId ? { placeholderTempId } : undefined);
      } catch (sendError) {
        console.error("Erro ao enviar áudio gravado:", sendError);
        if (placeholderTempId) {
          try {
            onAudioPlaceholderDiscardRef.current?.(placeholderTempId);
          } catch {
            /* ignore */
          }
        }
        // NÃO chama cleanupSession aqui: o recorder deste áudio já parou, e o que estiver em
        // mediaRecorderRef agora é uma gravação NOVA — limpar a sessão matava essa outra.
        // Se nada estiver gravando, o áudio volta como rascunho para tentar de novo.
        const livre =
          mountedRef.current &&
          !mediaRecorderRef.current &&
          !draftRef.current &&
          (generation == null || generation === generationRef.current);
        if (livre) {
          updateDraft({
            file,
            seconds: Math.max(1, Math.round((Number(durationMs) || 0) / 1000)),
            reason: "send_error",
          });
        }
        showToast?.({
          type: "error",
          title: "Áudio",
          message: livre
            ? "Não foi possível enviar o áudio. Toque em enviar para tentar de novo."
            : "Não foi possível enviar o áudio. Tente gravar novamente.",
        });
      }
    },
    [onSendAudioFile, showToast, updateDraft]
  );

  const startRecording = useCallback(async () => {
    if (!conversaId || isRecording || startingRef.current) return;
    if (!podeEnviar) {
      showToast?.({
        type: "warning",
        title: "Conversa não assumida",
        message: "Clique em Assumir para enviar mensagens.",
      });
      return;
    }

    startingRef.current = true;
    setIsStarting(true);
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    updateDraft(null);
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
      if (!isMicSupported() || typeof MediaRecorder === "undefined") {
        showToast?.({
          type: "error",
          title: "Microfone",
          message: "Seu navegador não suporta gravação de áudio. Atualize o navegador ou use o Chrome/Safari.",
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
        releaseOwnStream(stream, null);
        return;
      }
      recordingStreamRef.current = stream;
      if (await shouldShowMicPersistenceHint()) {
        if (!mountedRef.current || generation !== generationRef.current) {
          releaseOwnStream(stream, recordingStreamRef);
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
      let recorder;
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch (ctorError) {
        // Alguns navegadores anunciam o tipo em isTypeSupported e recusam no construtor.
        if (!mimeType) throw ctorError;
        recorder = new MediaRecorder(stream);
      }
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
        if (!recorder.__zapStopAt) recorder.__zapStopAt = Date.now();
        // Mantém a barra na tela (estado "preparando") enquanto o onstop monta o arquivo:
        // sem isso ela sumia e reaparecia ~1 s depois, um pisca confuso.
        if (
          mediaRecorderRef.current === recorder &&
          generation === generationRef.current &&
          !draftRef.current
        ) {
          updateDraft({
            file: null,
            seconds: Math.max(0, Math.floor((recorder.__zapStopAt - startedAt) / 1000)),
            reason,
            preparing: true,
          });
        }
        // Para PRESERVANDO o que foi gravado: o onstop monta o arquivo e o deixa como rascunho.
        if (mediaRecorderRef.current === recorder) {
          cleanupSession({ requestDataBeforeStop: true, preserveOnStop: true, releaseMic: false });
        } else {
          cleanupAudioRecording({
            mediaRecorder: recorder,
            requestDataBeforeStop: true,
            preserveOnStop: true,
            releaseMic: false,
          });
        }
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
        // Recorder parado pelo próprio navegador (sem clique em enviar) também é interrupção.
        if (!wasCanceled && !recorder.__zapInterrupted && recorder.__zapStopAt === 0) {
          recorder.__zapInterrupted = "browser_stopped";
          recorder.__zapStopAt = Date.now();
        }
        const interrupted = Boolean(recorder.__zapInterrupted);
        // Placeholder "preparando" desta gravação: some em qualquer saída sem rascunho real.
        const dropPreparingDraft = () => {
          if (draftRef.current?.preparing) updateDraft(null);
        };
        // Bolha criada no toque em "enviar": em qualquer saída sem envio ela precisa sumir.
        const takePlaceholder = () => {
          const id = recorder.__zapPlaceholderTempId || null;
          recorder.__zapPlaceholderTempId = null;
          if (recorder.__zapPlaceholderTimer) {
            clearTimeout(recorder.__zapPlaceholderTimer);
            recorder.__zapPlaceholderTimer = null;
          }
          return id;
        };
        const discardPlaceholder = () => {
          const id = takePlaceholder();
          if (!id) return;
          try {
            onAudioPlaceholderDiscardRef.current?.(id);
          } catch {
            /* ignore */
          }
        };
        const recordedChunks = chunks.slice();
        const localStartedAt = recorder.__zapStartedAt || startedAt;
        const stoppedAt = recorder.__zapStopAt || Date.now();
        const elapsedMs = Math.max(0, stoppedAt - localStartedAt);
        releaseOwnStream(recorder.__zapStream || null, recordingStreamRef);
        if (interrupted && mediaRecorderRef.current === recorder) {
          // Interrupção vinda do próprio navegador: a UI de gravação ainda estava aberta.
          cleanupSession({ markCanceled: false, releaseMic: false });
        }
        if (wasCanceled) {
          discardPlaceholder();
          return;
        }
        if (recordedChunks.length === 0) {
          discardPlaceholder();
          if (interrupted) dropPreparingDraft();
          showToast?.(
            interrupted
              ? TOAST_INTERROMPIDA_SEM_AUDIO
              : {
                  type: "error",
                  title: "Áudio",
                  message: "O navegador não entregou o áudio gravado. Grave novamente.",
                }
          );
          return;
        }
        const finalType = recorder.mimeType || mimeType || "audio/webm";
        const extension = audioExtensionFromMime(finalType);
        const blob = new Blob(recordedChunks, { type: finalType });
        if (elapsedMs < RECORDED_AUDIO_MIN_MS || blob.size < RECORDED_AUDIO_MIN_BYTES) {
          discardPlaceholder();
          if (interrupted) dropPreparingDraft();
          showToast?.(interrupted ? TOAST_INTERROMPIDA_SEM_AUDIO : TOAST_AUDIO_CURTO);
          return;
        }
        // Passar do teto por poucos segundos (aba em segundo plano atrasa o auto-envio) não
        // pode jogar fora 10 minutos de fala: o corte real é a duração decodificada abaixo.
        if (elapsedMs > RECORDED_AUDIO_MAX_MS + 15000) {
          discardPlaceholder();
          if (interrupted) dropPreparingDraft();
          showToast?.(TOAST_AUDIO_LONGO);
          return;
        }
        let file;
        let durationMs;
        try {
          audioTraceMarca("blob pronto", { bytes: blob.size, tipo: finalType });
          const metadata = await inspectRecordedAudioBlob(blob);
          audioTraceMarca("duração inspecionada");
          if (metadata.error === "decode_error") {
            console.warn("[audio] <audio> não decodificou a gravação; usando duração medida e enviando mesmo assim.");
          }
          const rawDurationMs = Number.isFinite(metadata.durationSec)
            ? Math.round(metadata.durationSec * 1000)
            : null;
          durationMs = pickRecordedDurationMs({ rawDurationMs, elapsedMs });
          if (Number.isFinite(durationMs) && durationMs < RECORDED_AUDIO_MIN_MS) {
            discardPlaceholder();
            if (interrupted) dropPreparingDraft();
            showToast?.(interrupted ? TOAST_INTERROMPIDA_SEM_AUDIO : TOAST_AUDIO_CURTO);
            return;
          }
          if (Number.isFinite(durationMs) && durationMs > RECORDED_AUDIO_MAX_MS + 5000) {
            discardPlaceholder();
            if (interrupted) dropPreparingDraft();
            showToast?.(TOAST_AUDIO_LONGO);
            return;
          }
          const now = Date.now();
          file = attachRecordedAudioMetadata(
            new File([blob], `audio-${now}.${extension}`, { type: finalType, lastModified: now }),
            { durationMs, elapsedMs, mimeType: finalType, bytes: blob.size }
          );
          audioTraceMarca("ficheiro montado");
        } catch (buildError) {
          console.error("Erro ao preparar o áudio gravado:", buildError);
          discardPlaceholder();
          if (interrupted) dropPreparingDraft();
          showToast?.({
            type: "error",
            title: "Áudio",
            message: "Não foi possível preparar o áudio. Tente gravar novamente.",
          });
          return;
        }

        if (interrupted) {
          discardPlaceholder();
          // Outra gravação já começou, a conversa mudou ou o componente saiu: descarta.
          if (
            !mountedRef.current ||
            generation !== generationRef.current ||
            mediaRecorderRef.current ||
            (draftRef.current && !draftRef.current.preparing)
          ) {
            dropPreparingDraft();
            return;
          }
          updateDraft({
            file,
            seconds: Math.max(1, Math.round((Number(durationMs) || elapsedMs) / 1000)),
            reason: recorder.__zapInterrupted,
          });
          haptic([18, 60, 18]);
          showToast?.({
            type: "warning",
            title: "Gravação interrompida",
            message: "O trecho gravado foi guardado. Toque em enviar para mandar ou no X para descartar.",
          });
          return;
        }

        // A bolha já está na tela desde o toque: o envio a completa no lugar. Se a rede de
        // segurança já a removeu (navegador demorou demais), o envio cria uma nova normalmente.
        const placeholderTempId = takePlaceholder();
        await sendFile(file, { generation, durationMs, placeholderTempId });
      };

      recorder.start(400);
      mediaRecorderRef.current = recorder;
      if (mountedRef.current && generation === generationRef.current) {
        setIsRecording(true);
        haptic(12);
      }
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
            : name === "NotReadableError" || name === "AbortError"
              ? "O microfone está em uso por outro app (ligação, gravador ou outra aba). Feche-o e tente de novo."
              : "Não foi possível acessar o microfone. Verifique as permissões.";
      showToast?.({ type: "error", title: "Microfone", message });
    } finally {
      startingRef.current = false;
      if (mountedRef.current) setIsStarting(false);
    }
  }, [cleanupSession, conversaId, isRecording, podeEnviar, sendFile, showToast, updateDraft]);

  const stopRecording = useCallback(() => {
    const pendingDraft = draftRef.current;
    if (pendingDraft && !mediaRecorderRef.current) {
      // Ainda montando o arquivo do trecho interrompido: ignora o toque (dura ~1 s).
      if (!pendingDraft.file) return;
      updateDraft(null);
      void sendFile(pendingDraft.file, {
        generation: generationRef.current,
        durationMs: pendingDraft.seconds * 1000,
      });
      return;
    }
    // Marco zero: é aqui que o utilizador largou o botão de enviar.
    audioTraceInicio();
    audioTraceMarca("clique em enviar");
    if (!mediaRecorderRef.current && !isRecording) {
      cleanupSession({ releaseMic: true });
      return;
    }
    const rec = mediaRecorderRef.current;
    // A bolha do áudio aparece JÁ, no toque (como no WhatsApp). O navegador ainda leva até ~2 s
    // no celular para finalizar o arquivo; antes a tela ficava parada esse tempo todo.
    if (rec && !rec.__zapPlaceholderTempId && rec.state && rec.state !== "inactive") {
      const elapsedMs = Date.now() - (Number(rec.__zapStartedAt) || Date.now());
      if (elapsedMs >= RECORDED_AUDIO_MIN_MS) {
        let placeholderTempId = null;
        try {
          placeholderTempId = onAudioPlaceholderRef.current?.({ elapsedMs }) || null;
        } catch (placeholderError) {
          console.warn("[audio] não foi possível desenhar a bolha antecipada:", placeholderError);
        }
        if (placeholderTempId) {
          rec.__zapPlaceholderTempId = placeholderTempId;
          // Rede de segurança: se o navegador nunca entregar o arquivo (onstop não dispara),
          // a bolha não pode ficar girando para sempre.
          rec.__zapPlaceholderTimer = setTimeout(() => {
            rec.__zapPlaceholderTimer = null;
            const id = rec.__zapPlaceholderTempId;
            if (!id) return;
            rec.__zapPlaceholderTempId = null;
            try {
              onAudioPlaceholderDiscardRef.current?.(id);
            } catch {
              /* ignore */
            }
            showToastRef.current?.({
              type: "error",
              title: "Áudio",
              message: "O navegador não entregou o áudio gravado. Grave novamente.",
            });
          }, 20000);
        }
      }
    }
    cleanupSession({ requestDataBeforeStop: true, preserveOnStop: true, releaseMic: true });
  }, [cleanupSession, isRecording, sendFile, updateDraft]);

  useEffect(() => {
    if (String(recordingConversaIdRef.current ?? "") !== String(conversaId ?? "")) {
      if (
        mediaRecorderRef.current ||
        recordingStreamRef.current ||
        isRecording ||
        draftRef.current ||
        startingRef.current
      ) {
        cancelRecording();
      }
      onConversationChange?.();
    }
    recordingConversaIdRef.current = conversaId;
  }, [cancelRecording, conversaId, isRecording, onConversationChange]);

  // Refs: o intervalo abaixo não pode ser recriado a cada render (showToast/stopRecording
  // mudam de identidade), senão o contador reiniciaria o tique.
  const stopRecordingRef = useRef(stopRecording);
  const showToastRef = useRef(showToast);
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
    showToastRef.current = showToast;
  }, [stopRecording, showToast]);

  useEffect(() => {
    if (!isRecording) return undefined;
    let limiteAtingido = false;
    const tick = () => {
      // O contador vem do relógio real: o setInterval atrasa (ou congela) com a tela
      // bloqueada / aba em segundo plano no celular, e o tempo exibido ficava menor que o real.
      const startedAt = Number(mediaRecorderRef.current?.__zapStartedAt) || 0;
      if (!startedAt) return;
      const elapsed = Date.now() - startedAt;
      const seconds = Math.max(0, Math.floor(elapsed / 1000));
      setRecordingSeconds((prev) => (prev === seconds ? prev : seconds));
      // O limite de 10 min só era conferido ao enviar: quem passava dele perdia a gravação
      // inteira. Agora a gravação é finalizada e enviada pouco antes do teto.
      if (!limiteAtingido && elapsed >= RECORDED_AUDIO_MAX_MS - 3000) {
        limiteAtingido = true;
        showToastRef.current?.({
          type: "info",
          title: "Limite de 10 minutos",
          message: "A gravação chegou ao limite e foi enviada.",
        });
        stopRecordingRef.current?.();
      }
    };
    recordingTimerRef.current = setInterval(tick, 250);
    // Ao voltar para a aba, atualiza na hora (e dispara o teto se ele passou em segundo plano).
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
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
    isStarting,
    recordingSeconds,
    draft,
    hasDraft: Boolean(draft),
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
