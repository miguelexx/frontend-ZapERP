import { useCallback } from "react";
import api from "../../api/http";
import { resolveUploadTimeoutMs } from "../../api/httpTimeouts";
import {
  classifyOutboundAxiosError,
  shouldShowOutboundToast,
  OUTBOUND_ERROR_KIND,
} from "../outboundSendError";
import { useConversaStore } from "../conversaStore";
import { scheduleAfterInitialPaint } from "../../chats/scheduleAfterInitialPaint";
import { MAX_DOCUMENTOS_LOTE_ENVIO, STICKER_RECENTS_LIMIT } from "../conversaConstants";
import {
  isAudioFile,
  isVideoFile,
  isArquivoBloqueadoWhatsApp,
  mensagemArquivoBloqueadoWhatsApp,
  getAudioFilename,
  readRecentStickers,
  writeRecentStickers,
  toDataUrl,
  convertImageToWebp,
} from "../utils/conversaViewHelpers";
import {
  buildOptimisticOutgoingMessage,
  extractArquivoApiFailures,
  extractArquivoApiReconciliations,
  normalizeArquivoApiToMessage,
} from "../conversaOptimisticMessage";

/**
 * Envio de mídia (arquivo único, lote fototeca/documentos, sticker).
 * Extraído verbatim de ConversaView — não altera FIFO, otimista nem timeouts.
 */
export function useConversationOutboundMedia({
  conversaId,
  conversa,
  user,
  podeEnviar,
  showToast,
  debugMessageBoundary,
  clearPending,
  garantirConversaAbertaParaEnvio,
  focusMessageInput,
  reconciliarMensagem,
  marcarMensagemTempErro,
  marcarMensagemEnvioIncerto,
  applyOutboundSendFailure,
  removerMensagemTemp,
  appendOutgoingOptimisticMessage,
  applyOutgoingStatusOptimistic,
  scheduleArquivoSendConsistencyCheck,
  setSendingTracked,
  refresh,
  handleDropFile,
  composerRef,
  arquivoEnvioInFlightRef,
  audioRetryFilesRef,
  enviarAudioQueueRef,
  shouldStickToBottomRef,
  pendingFile,
  pendingPreview,
  pendingCaption,
  pendingSendOptions,
  pendingConversaIdRef,
  confirmSendLockRef,
}) {
  const handleEnviarArquivo = useCallback(
    async (file, opts = {}) => {
      if (!file || !conversaId) return;
      if (isArquivoBloqueadoWhatsApp(file)) {
        showToast({
          type: "error",
          title: "Arquivo não permitido",
          message: mensagemArquivoBloqueadoWhatsApp(file),
        });
        clearPending();
        return;
      }
      if (!podeEnviar) {
        showToast({
          type: "warning",
          title: "Conversa não assumida",
          message: "Clique em Assumir para enviar mensagens.",
        });
        clearPending();
        return;
      }
      const conversaAberta = await garantirConversaAbertaParaEnvio();
      if (!conversaAberta) {
        clearPending();
        return;
      }
  
      const flightKey = `${conversaId}:${file?.name || "arquivo"}:${file?.size ?? 0}:${file?.lastModified ?? 0}`;
      if (arquivoEnvioInFlightRef.current.has(flightKey)) return;
      arquivoEnvioInFlightRef.current.add(flightKey);
  
      const legenda = String(opts.caption ?? "").trim();
      const isVideoSend = isVideoFile(file);
      // Retry por item: reusa o tempId (⇒ mesmo client_temp_id) para o back-end deduplicar e
      // não gerar áudio duplicado. Remove a bolha de erro antiga antes de reanexar a nova (pending).
      const optimisticMsg = buildOptimisticOutgoingMessage({
        conversaId,
        file,
        caption: legenda,
        forceStickerType: opts.forceStickerType,
        forceVoiceType: opts.tipo === "voice" || opts.tipo === "ptt",
        tipo: opts.tipo,
        tempId: opts.reuseTempId || undefined,
      });
      const tempId = optimisticMsg.tempId;
      if (opts.reuseTempId) removerMensagemTemp(opts.reuseTempId);
      // Retém o File de áudio para permitir reenvio por item em caso de falha (base do retry).
      // Só áudio: notas de voz são pequenas; outros anexos não entram para não segurar memória.
      const isAudioSend = opts.tipo === "voice" || opts.tipo === "audio" || isAudioFile(file);
      if (isAudioSend) {
        const prev = audioRetryFilesRef.current.get(tempId);
        audioRetryFilesRef.current.set(tempId, {
          file,
          tipo: opts.tipo || "voice",
          attempts: prev?.attempts || 0,
        });
      }
      debugMessageBoundary("send_media", {
        conversa_id: conversaId,
        atendimento_id: conversa?.atendimento_id ?? conversa?.atendimento?.id,
        cliente_id: conversa?.cliente_id ?? conversa?.cliente?.id,
        phone: conversa?.phone ?? conversa?.telefone ?? conversa?.cliente_telefone,
        message_id: tempId,
      });
      const revertOutgoingStatus = applyOutgoingStatusOptimistic();
      const revertModoSimples = appendOutgoingOptimisticMessage(optimisticMsg);
      clearPending();
  
      const formData = new FormData();
      const nomeArquivo = isAudioFile(file) ? getAudioFilename(file) : (file?.name || "arquivo");
      formData.append("file", file, nomeArquivo);
      if (opts.forceStickerType) {
        formData.append("tipo", "sticker");
      } else if (opts.tipo === "voice" || opts.tipo === "audio") {
        formData.append("tipo", opts.tipo);
      } else if (isVideoSend) {
        // Contrato explícito: impede MIME genérico de celular/browser de cair como documento.
        formData.append("tipo", "video");
      }
      if (opts.tipo === "voice" || opts.tipo === "audio" || isAudioFile(file)) {
        const audioDurationMs = Number(file?.__zaperpAudioDurationMs || 0);
        const audioElapsedMs = Number(file?.__zaperpAudioElapsedMs || 0);
        const audioBytes = Number(file?.__zaperpAudioBytes || file?.size || 0);
        const audioMime = String(file?.__zaperpAudioMimeType || file?.type || "").trim();
        if (Number.isFinite(audioDurationMs) && audioDurationMs > 0) {
          formData.append("audio_duration_ms", String(Math.round(audioDurationMs)));
        }
        if (Number.isFinite(audioElapsedMs) && audioElapsedMs > 0) {
          formData.append("audio_elapsed_ms", String(Math.round(audioElapsedMs)));
        }
        if (Number.isFinite(audioBytes) && audioBytes > 0) {
          formData.append("audio_blob_bytes", String(Math.round(audioBytes)));
        }
        if (audioMime) {
          formData.append("audio_recorded_mime", audioMime);
        }
      }
      if (legenda) {
        formData.append("caption", legenda);
      }
      formData.append("client_temp_id", tempId);
      formData.append("conversa_id", String(conversaId));
      if (conversa?.atendimento_id != null) formData.append("atendimento_id", String(conversa.atendimento_id));
      if (conversa?.cliente_id != null) formData.append("cliente_id", String(conversa.cliente_id));
      if (conversa?.telefone != null) formData.append("phone", String(conversa.telefone));
  
      // Áudios consecutivos precisam aparecer imediatamente, mas devem chegar ao back-end em FIFO.
      // A bolha otimista já foi anexada acima; somente o POST aguarda o upload anterior.
      let releaseAudioUpload = null;
      if (opts.enqueueAudio) {
        const previousAudioUpload = enviarAudioQueueRef.current.catch(() => {});
        enviarAudioQueueRef.current = new Promise((resolve) => {
          releaseAudioUpload = resolve;
        });
        await previousAudioUpload;
      }
  
      // Vídeos grandes continuam em background sem bloquear o composer inteiro.
      // A bolha otimista + lock por arquivo já impedem duplo envio do mesmo vídeo.
      if (!isVideoSend) setSendingTracked(true);
      try {
        const { data } = await api.post(`/chats/${conversaId}/arquivo`, formData, {
          timeout: resolveUploadTimeoutMs(file),
          skipGlobalNetworkToast: true,
          skipGlobal500Toast: true,
        });
  
        const reconciliations = extractArquivoApiReconciliations(data, conversaId, [tempId]);
        if (reconciliations.length) {
          reconciliations.forEach(({ tempId: tid, realMsg }) => reconciliarMensagem(tid, realMsg));
        } else {
          const realMsg = normalizeArquivoApiToMessage(data, conversaId);
          if (realMsg?.id != null || realMsg?.whatsapp_id) {
            reconciliarMensagem(tempId, realMsg);
          }
        }
        if (
          !opts.waitSocketOnly &&
          reconciliations.length === 0 &&
          (!data?.id || Number(data?.conversa_id) !== Number(conversaId))
        ) {
          const targetId = conversaId;
          scheduleAfterInitialPaint(() => {
            const st = useConversaStore.getState();
            if (String(st.selectedId) !== String(targetId)) return;
            void st.refresh({ silent: true });
          }, 400);
        }
        const knownIds = [
          data?.id,
          ...(Array.isArray(data?.ids) ? data.ids : []),
          ...(Array.isArray(data?.results) ? data.results.map((r) => r?.id) : []),
        ];
        scheduleArquivoSendConsistencyCheck(conversaId, [tempId], {
          knownIds,
          // O status chega por socket. Refazer toda a conversa após 2,6 s durante um
          // upload de vídeo era a principal fonte de pulo/travada visual.
          skipPendingStatusRefresh: isVideoSend,
        });
        // Enviado (persistido no back-end): não precisa mais reter o File para retry.
        if (isAudioSend) audioRetryFilesRef.current.delete(tempId);
      } catch (err) {
        revertModoSimples?.();
        revertOutgoingStatus?.();
        const persistedFailure = Array.isArray(err?.response?.data?.results)
          ? err.response.data.results.find(
              (row) =>
                row?.persisted === true &&
                row?.id != null &&
                String(row?.client_temp_id ?? "") === String(tempId)
            )
          : null;
        applyOutboundSendFailure(tempId, err, {
          toastTitle: "Falha ao enviar",
          mensagemId: persistedFailure?.id ?? null,
        });
        // Mantém o File retido apenas durante esta sessão; o botão de retry usa o mensagem_id
        // persistido e o arquivo salvo no servidor.
        if (isAudioSend) {
          const entry = audioRetryFilesRef.current.get(tempId);
          if (entry) entry.attempts = (entry.attempts || 0) + 1;
        }
      } finally {
        releaseAudioUpload?.();
        arquivoEnvioInFlightRef.current.delete(flightKey);
        if (!isVideoSend) setSendingTracked(false);
        focusMessageInput();
      }
    },
    [
      conversaId,
      conversa,
      debugMessageBoundary,
      showToast,
      clearPending,
      podeEnviar,
      garantirConversaAbertaParaEnvio,
      focusMessageInput,
      reconciliarMensagem,
      marcarMensagemTempErro,
      applyOutboundSendFailure,
      removerMensagemTemp,
      appendOutgoingOptimisticMessage,
      applyOutgoingStatusOptimistic,
      scheduleArquivoSendConsistencyCheck,
      setSendingTracked,
    ]
  );
  
  const handleFileInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) {
        e.target.value = "";
        return;
      }
      handleDropFile(file);
      e.target.value = "";
    },
    [handleDropFile]
  );
  
  const handleCameraInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) {
        e.target.value = "";
        return;
      }
      handleDropFile(file);
      e.target.value = "";
    },
    [handleDropFile]
  );
  
  const handleFototecaInputChange = useCallback(
    async (e) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = "";
      if (!files.length || !conversaId) return;
      if (!podeEnviar) {
        showToast({
          type: "warning",
          title: "Conversa não assumida",
          message: "Clique em Assumir para enviar mensagens.",
        });
        return;
      }
      const conversaAberta = await garantirConversaAbertaParaEnvio();
      if (!conversaAberta) return;
      const tempIds = [];
      shouldStickToBottomRef.current = true;
      const revertOutgoingStatus = applyOutgoingStatusOptimistic();
      let revertModoSimples = null;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const optimisticMsg = buildOptimisticOutgoingMessage({ conversaId, file: f });
        tempIds.push(optimisticMsg.tempId);
        debugMessageBoundary("send_media", {
          conversa_id: conversaId,
          atendimento_id: conversa?.atendimento_id ?? conversa?.atendimento?.id,
          cliente_id: conversa?.cliente_id ?? conversa?.cliente?.id,
          phone: conversa?.phone ?? conversa?.telefone ?? conversa?.cliente_telefone,
          message_id: optimisticMsg.tempId,
        });
        const modoRevert = appendOutgoingOptimisticMessage(optimisticMsg, { bumpList: i === files.length - 1 });
        if (modoRevert) revertModoSimples = modoRevert;
      }
  
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("file", files[i]);
      }
      formData.append("client_temp_ids", JSON.stringify(tempIds));
      formData.append("conversa_id", String(conversaId));
      if (conversa?.atendimento_id != null) formData.append("atendimento_id", String(conversa.atendimento_id));
      if (conversa?.cliente_id != null) formData.append("cliente_id", String(conversa.cliente_id));
      if (conversa?.telefone != null) formData.append("phone", String(conversa.telefone));
      setSendingTracked(true);
      try {
        const batchBytes = files.reduce((sum, f) => sum + (Number(f?.size) || 0), 0);
        const { data } = await api.post(`/chats/${conversaId}/arquivo`, formData, {
          timeout: resolveUploadTimeoutMs(batchBytes),
          skipGlobalNetworkToast: true,
          skipGlobal500Toast: true,
        });
        const reconciliations = extractArquivoApiReconciliations(data, conversaId, tempIds);
        reconciliations.forEach(({ tempId, realMsg }) => reconciliarMensagem(tempId, realMsg));
  
        const failures = extractArquivoApiFailures(data, tempIds);
        failures.forEach(({ tempId, error }) =>
          marcarMensagemTempErro(tempId, { erro_mensagem: error })
        );
  
        const reconciledTempIds = new Set(reconciliations.map((r) => String(r.tempId)));
        const failedTempIds = new Set(failures.map((f) => String(f.tempId)));
        const pendingTempIds = tempIds.filter(
          (tid) => !reconciledTempIds.has(String(tid)) && !failedTempIds.has(String(tid))
        );
  
        if (pendingTempIds.length > 0) {
          const targetId = conversaId;
          scheduleAfterInitialPaint(() => {
            const st = useConversaStore.getState();
            if (String(st.selectedId) !== String(targetId)) return;
            void st.refresh({ silent: true });
          }, 400);
        }
        const knownIds = [
          data?.id,
          ...(Array.isArray(data?.ids) ? data.ids : []),
          ...(Array.isArray(data?.results) ? data.results.map((r) => r?.id) : []),
        ];
        const tempIdsToCheck = tempIds.filter((tid) => !failedTempIds.has(String(tid)));
        if (tempIdsToCheck.length > 0) {
          scheduleArquivoSendConsistencyCheck(conversaId, tempIdsToCheck, { knownIds });
        }
  
        if (failures.length > 0) {
          const okCount = reconciliations.length;
          showToast({
            type: okCount > 0 ? "warning" : "error",
            title: okCount > 0 ? "Envio parcial" : "Falha ao enviar",
            message:
              okCount > 0
                ? `${okCount} foto(s) enviada(s). ${failures.length} falhou(aram).`
                : failures[0]?.error || "Não foi possível enviar as fotos. Tente novamente.",
          });
        }
      } catch (err) {
        revertModoSimples?.();
        revertOutgoingStatus?.();
        const is403 = err?.response?.status === 403;
        const apiMsg = err?.response?.data?.error;
        const partialFailures = extractArquivoApiFailures(err?.response?.data, tempIds);
        if (partialFailures.length) {
          const reconciliations = extractArquivoApiReconciliations(err?.response?.data, conversaId, tempIds);
          reconciliations.forEach(({ tempId, realMsg }) => reconciliarMensagem(tempId, realMsg));
          partialFailures.forEach(({ tempId, error }) =>
            marcarMensagemTempErro(tempId, { erro_mensagem: error })
          );
          showToast({
            type: reconciliations.length > 0 ? "warning" : "error",
            title: reconciliations.length > 0 ? "Envio parcial" : is403 ? "Acesso restrito" : "Falha ao enviar",
            message:
              reconciliations.length > 0
                ? `${reconciliations.length} foto(s) enviada(s). ${partialFailures.length} falhou(aram).`
                : apiMsg || (is403 ? "Assuma a conversa antes de enviar mensagens." : "Não foi possível enviar as fotos. Tente novamente."),
          });
        } else {
          const classified = classifyOutboundAxiosError(err);
          tempIds.forEach((tid) => {
            if (classified.uncertain) {
              marcarMensagemEnvioIncerto(tid, { erro_mensagem: classified.message });
            } else {
              marcarMensagemTempErro(tid, { erro_mensagem: classified.message });
            }
          });
          if (classified.uncertain) void refresh({ silent: true });
          if (shouldShowOutboundToast(`batch-fotos-${conversaId}-${classified.kind}`)) {
            showToast({
              type: classified.uncertain ? "warning" : "error",
              title: classified.uncertain
                ? classified.kind === OUTBOUND_ERROR_KIND.TIMEOUT
                  ? "Demora no envio"
                  : "Sem conexão"
                : is403
                  ? "Acesso restrito"
                  : "Falha ao enviar",
              message: classified.message,
            });
          }
        }
      } finally {
        setSendingTracked(false);
        focusMessageInput();
      }
    },
    [
      conversaId,
      conversa,
      debugMessageBoundary,
      podeEnviar,
      showToast,
      garantirConversaAbertaParaEnvio,
      focusMessageInput,
      marcarMensagemTempErro,
      marcarMensagemEnvioIncerto,
      refresh,
      reconciliarMensagem,
      appendOutgoingOptimisticMessage,
      applyOutgoingStatusOptimistic,
      scheduleArquivoSendConsistencyCheck,
      setSendingTracked,
    ]
  );
  
  const handleDocumentInputChange = useCallback(
    async (e) => {
      let files = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = "";
      if (!files.length || !conversaId) return;
  
      const blocked = files.filter((f) => isArquivoBloqueadoWhatsApp(f));
      if (blocked.length) {
        showToast({
          type: "error",
          title: "Arquivo não permitido",
          message: mensagemArquivoBloqueadoWhatsApp(blocked[0]),
        });
        files = files.filter((f) => !isArquivoBloqueadoWhatsApp(f));
        if (!files.length) return;
      }
  
      if (files.length > MAX_DOCUMENTOS_LOTE_ENVIO) {
        showToast({
          type: "warning",
          title: "Limite de documentos",
          message: `Selecione no máximo ${MAX_DOCUMENTOS_LOTE_ENVIO} documentos por vez. Apenas os primeiros ${MAX_DOCUMENTOS_LOTE_ENVIO} serão enviados.`,
        });
        files = files.slice(0, MAX_DOCUMENTOS_LOTE_ENVIO);
      }
  
      if (files.length === 1) {
        handleDropFile(files[0]);
        return;
      }
  
      if (!podeEnviar) {
        showToast({
          type: "warning",
          title: "Conversa não assumida",
          message: "Clique em Assumir para enviar mensagens.",
        });
        return;
      }
  
      const conversaAberta = await garantirConversaAbertaParaEnvio();
      if (!conversaAberta) return;
      const tempIds = [];
      shouldStickToBottomRef.current = true;
      const revertOutgoingStatus = applyOutgoingStatusOptimistic();
      let revertModoSimples = null;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const optimisticMsg = buildOptimisticOutgoingMessage({ conversaId, file: f });
        tempIds.push(optimisticMsg.tempId);
        debugMessageBoundary("send_media", {
          conversa_id: conversaId,
          atendimento_id: conversa?.atendimento_id ?? conversa?.atendimento?.id,
          cliente_id: conversa?.cliente_id ?? conversa?.cliente?.id,
          phone: conversa?.phone ?? conversa?.telefone ?? conversa?.cliente_telefone,
          message_id: optimisticMsg.tempId,
        });
        const modoRevert = appendOutgoingOptimisticMessage(optimisticMsg, { bumpList: i === files.length - 1 });
        if (modoRevert) revertModoSimples = modoRevert;
      }
  
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("file", files[i]);
      }
      formData.append("client_temp_ids", JSON.stringify(tempIds));
      formData.append("conversa_id", String(conversaId));
      if (conversa?.atendimento_id != null) formData.append("atendimento_id", String(conversa.atendimento_id));
      if (conversa?.cliente_id != null) formData.append("cliente_id", String(conversa.cliente_id));
      if (conversa?.telefone != null) formData.append("phone", String(conversa.telefone));
      setSendingTracked(true);
      try {
        const batchBytes = files.reduce((sum, f) => sum + (Number(f?.size) || 0), 0);
        const { data } = await api.post(`/chats/${conversaId}/arquivo`, formData, {
          timeout: resolveUploadTimeoutMs(batchBytes),
          skipGlobalNetworkToast: true,
          skipGlobal500Toast: true,
        });
        const reconciliations = extractArquivoApiReconciliations(data, conversaId, tempIds);
        reconciliations.forEach(({ tempId, realMsg }) => reconciliarMensagem(tempId, realMsg));
  
        const failures = extractArquivoApiFailures(data, tempIds);
        failures.forEach(({ tempId, error }) =>
          marcarMensagemTempErro(tempId, { erro_mensagem: error })
        );
  
        const reconciledTempIds = new Set(reconciliations.map((r) => String(r.tempId)));
        const failedTempIds = new Set(failures.map((f) => String(f.tempId)));
        const pendingTempIds = tempIds.filter(
          (tid) => !reconciledTempIds.has(String(tid)) && !failedTempIds.has(String(tid))
        );
  
        if (pendingTempIds.length > 0) {
          const targetId = conversaId;
          scheduleAfterInitialPaint(() => {
            const st = useConversaStore.getState();
            if (String(st.selectedId) !== String(targetId)) return;
            void st.refresh({ silent: true });
          }, 400);
        }
        const knownIds = [
          data?.id,
          ...(Array.isArray(data?.ids) ? data.ids : []),
          ...(Array.isArray(data?.results) ? data.results.map((r) => r?.id) : []),
        ];
        const tempIdsToCheck = tempIds.filter((tid) => !failedTempIds.has(String(tid)));
        if (tempIdsToCheck.length > 0) {
          scheduleArquivoSendConsistencyCheck(conversaId, tempIdsToCheck, { knownIds });
        }
  
        if (failures.length > 0) {
          const okCount = reconciliations.length;
          showToast({
            type: okCount > 0 ? "warning" : "error",
            title: okCount > 0 ? "Envio parcial" : "Falha ao enviar",
            message:
              okCount > 0
                ? `${okCount} documento(s) enviado(s). ${failures.length} falhou(aram).`
                : failures[0]?.error || "Não foi possível enviar os documentos. Tente novamente.",
          });
        }
      } catch (err) {
        revertModoSimples?.();
        revertOutgoingStatus?.();
        const is403 = err?.response?.status === 403;
        const apiMsg = err?.response?.data?.error;
        const partialFailures = extractArquivoApiFailures(err?.response?.data, tempIds);
        if (partialFailures.length) {
          const reconciliations = extractArquivoApiReconciliations(err?.response?.data, conversaId, tempIds);
          reconciliations.forEach(({ tempId, realMsg }) => reconciliarMensagem(tempId, realMsg));
          partialFailures.forEach(({ tempId, error }) =>
            marcarMensagemTempErro(tempId, { erro_mensagem: error })
          );
          showToast({
            type: reconciliations.length > 0 ? "warning" : "error",
            title: reconciliations.length > 0 ? "Envio parcial" : is403 ? "Acesso restrito" : "Falha ao enviar",
            message:
              reconciliations.length > 0
                ? `${reconciliations.length} documento(s) enviado(s). ${partialFailures.length} falhou(aram).`
                : apiMsg || (is403 ? "Assuma a conversa antes de enviar mensagens." : "Não foi possível enviar os documentos. Tente novamente."),
          });
        } else {
          const classified = classifyOutboundAxiosError(err);
          tempIds.forEach((tid) => {
            if (classified.uncertain) {
              marcarMensagemEnvioIncerto(tid, { erro_mensagem: classified.message });
            } else {
              marcarMensagemTempErro(tid, { erro_mensagem: classified.message });
            }
          });
          if (classified.uncertain) void refresh({ silent: true });
          if (shouldShowOutboundToast(`batch-docs-${conversaId}-${classified.kind}`)) {
            showToast({
              type: classified.uncertain ? "warning" : "error",
              title: classified.uncertain
                ? classified.kind === OUTBOUND_ERROR_KIND.TIMEOUT
                  ? "Demora no envio"
                  : "Sem conexão"
                : is403
                  ? "Acesso restrito"
                  : "Falha ao enviar",
              message: classified.message,
            });
          }
        }
      } finally {
        setSendingTracked(false);
        focusMessageInput();
      }
    },
    [
      conversaId,
      conversa,
      debugMessageBoundary,
      podeEnviar,
      showToast,
      handleDropFile,
      garantirConversaAbertaParaEnvio,
      focusMessageInput,
      marcarMensagemTempErro,
      marcarMensagemEnvioIncerto,
      refresh,
      reconciliarMensagem,
      appendOutgoingOptimisticMessage,
      applyOutgoingStatusOptimistic,
      scheduleArquivoSendConsistencyCheck,
      setSendingTracked,
    ]
  );
  
  const handleConfirmSendFile = useCallback(async () => {
    if (!pendingFile || confirmSendLockRef.current) return;
    if (pendingConversaIdRef.current && String(pendingConversaIdRef.current) !== String(conversaId)) {
      clearPending();
      return;
    }
    confirmSendLockRef.current = true;
    try {
      const captionToSend = pendingCaption;
      await handleEnviarArquivo(pendingFile, { ...pendingSendOptions, caption: captionToSend });
    } finally {
      confirmSendLockRef.current = false;
    }
  }, [pendingFile, pendingCaption, pendingSendOptions, conversaId, clearPending, handleEnviarArquivo]);
  
  const handleConfirmSendImageMobile = useCallback(
    async ({ sendAsOriginal, croppedAreaPixels, rotation, fileName, mimeType }) => {
      if (!pendingFile || !pendingPreview || confirmSendLockRef.current) return;
      if (pendingConversaIdRef.current && String(pendingConversaIdRef.current) !== String(conversaId)) {
        clearPending();
        return;
      }
      confirmSendLockRef.current = true;
      try {
        const captionToSend = pendingCaption;
        let fileToSend = pendingFile;
        if (!sendAsOriginal && croppedAreaPixels) {
          const { exportCroppedImageFile } = await import("../utils/imageCropExport.js");
          fileToSend = await exportCroppedImageFile({
            imageSrc: pendingPreview,
            pixelCrop: croppedAreaPixels,
            rotation: rotation || 0,
            fileName: fileName || pendingFile.name,
            mimeType: mimeType || pendingFile.type,
          });
        }
        await handleEnviarArquivo(fileToSend, { ...pendingSendOptions, caption: captionToSend });
      } finally {
        confirmSendLockRef.current = false;
      }
    },
    [pendingFile, pendingPreview, pendingCaption, pendingSendOptions, conversaId, clearPending, handleEnviarArquivo]
  );
  
  const persistRecentSticker = useCallback(
    async (file) => {
      try {
        const dataUrl = await toDataUrl(file);
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const item = {
          id,
          name: file.name || "figurinha",
          mimeType: file.type || "image/webp",
          dataUrl,
          ts: Date.now(),
        };
        const current = readRecentStickers(user);
        const next = [item, ...current.filter((x) => x?.dataUrl !== dataUrl)].slice(0, STICKER_RECENTS_LIMIT);
        writeRecentStickers(user, next);
      } catch {
        /* ignore */
      }
    },
    [user]
  );
  
  const sendStickerFile = useCallback(
    async (inputFile) => {
      if (!inputFile || !conversaId) return;
      try {
        let fileToSend = inputFile;
        const type = String(inputFile.type || "").toLowerCase();
        const shouldConvert = type.startsWith("image/") && type !== "image/webp" && !type.includes("gif");
        if (shouldConvert) {
          try {
            fileToSend = await convertImageToWebp(inputFile);
          } catch {
            fileToSend = inputFile;
          }
        }
        await handleEnviarArquivo(fileToSend, { forceStickerType: true, waitSocketOnly: true });
        await persistRecentSticker(fileToSend);
        composerRef.current?.closePanels?.();
      } catch {
        /* toast já tratado no envio */
      }
    },
    [conversaId, handleEnviarArquivo, persistRecentSticker]
  );
  
  const handleStickerInputChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      await sendStickerFile(file);
    },
    [sendStickerFile]
  );
  
  return {
    handleEnviarArquivo,
    handleFileInputChange,
    handleCameraInputChange,
    handleFototecaInputChange,
    handleDocumentInputChange,
    handleConfirmSendFile,
    handleConfirmSendImageMobile,
    persistRecentSticker,
    sendStickerFile,
    handleStickerInputChange,
  };
}
