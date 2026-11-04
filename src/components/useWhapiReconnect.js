import { useCallback, useEffect, useRef, useState } from "react";
import {
  listarInstanciasWhapi,
  obterQrCodeInstancia,
  obterStatusInstancia,
  parearInstanciaPorCodigo,
} from "../api/whapiInstancesService";
import {
  QR_POLL_MS,
  STATUS_POLL_MS,
  clampRetrySeconds,
  isValidQrDataUri,
  normalizePairPhone,
  pickReconnectInstance,
} from "./whapiReconnectLogic";

/**
 * QR de reconexão para o overlay de canal Whapi caído.
 *
 * Mesma mecânica do painel de Configurações (WhapiConnectPanel), só que sem
 * cadastro/manutenção: escolhe o canal caído, pede o QR, renova sozinho e para
 * tudo assim que o canal autentica.
 *
 * Só roda com `enabled` — o overlay monta apenas na queda confirmada, e as rotas
 * de instância exigem supervisor/admin (atendente nem chega a chamar).
 */
export function useWhapiReconnect({ enabled = true, onConnected } = {}) {
  const [instance, setInstance] = useState(null);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [listError, setListError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const [qrDataUri, setQrDataUri] = useState(null);
  const [qrError, setQrError] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [retryIn, setRetryIn] = useState(0);

  const [connected, setConnected] = useState(false);
  const [channelStatus, setChannelStatus] = useState(null);
  const [phoneConectado, setPhoneConectado] = useState(null);

  const [pairCode, setPairCode] = useState("");
  const [pairError, setPairError] = useState("");
  const [pairLoading, setPairLoading] = useState(false);

  const mountedRef = useRef(false);
  const instanceIdRef = useRef(null);
  const qrTimerRef = useRef(null);
  const statusTimerRef = useRef(null);
  const qrGenRef = useRef(0);
  const connectedNotifiedRef = useRef(false);
  const onConnectedRef = useRef(onConnected);

  useEffect(() => {
    onConnectedRef.current = onConnected;
  }, [onConnected]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearQrTimer = useCallback(() => {
    if (qrTimerRef.current) {
      clearTimeout(qrTimerRef.current);
      qrTimerRef.current = null;
    }
  }, []);

  const clearStatusTimer = useCallback(() => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
  }, []);

  /** Canal autenticou: para todo polling e avisa quem monta o overlay. */
  const marcarConectado = useCallback(
    (phone) => {
      qrGenRef.current += 1;
      clearQrTimer();
      clearStatusTimer();
      if (!mountedRef.current) return;
      setConnected(true);
      setQrDataUri(null);
      setQrError("");
      setRetryIn(0);
      if (phone) setPhoneConectado(phone);
      if (!connectedNotifiedRef.current) {
        connectedNotifiedRef.current = true;
        onConnectedRef.current?.();
      }
    },
    [clearQrTimer, clearStatusTimer]
  );

  const fetchQr = useCallback(
    async (instId, { silent = false } = {}) => {
      if (instId == null) return null;
      const gen = ++qrGenRef.current;
      if (!silent && mountedRef.current) setQrLoading(true);
      try {
        const res = await obterQrCodeInstancia(instId);
        if (!mountedRef.current || gen !== qrGenRef.current || instanceIdRef.current !== instId) {
          return null;
        }
        if (res?.connected) {
          marcarConectado(null);
          return res;
        }
        if (res?.status === 429) {
          const espera = clampRetrySeconds(res.retryAfterSeconds);
          setRetryIn(espera);
          setQrError(res.error || "Aguarde para gerar um novo QR Code.");
          return res;
        }
        if (isValidQrDataUri(res?.dataUri)) {
          setQrDataUri(res.dataUri);
          setQrError("");
          setRetryIn(0);
          return res;
        }
        if (res?.error) {
          setQrError(res.error);
          return res;
        }
        setQrError("QR Code indisponível no momento. Tente novamente.");
        return res;
      } catch (err) {
        if (mountedRef.current && gen === qrGenRef.current) {
          setQrError(
            err?.response?.data?.error || err?.message || "Erro ao obter o QR Code."
          );
        }
        return null;
      } finally {
        if (!silent && mountedRef.current && gen === qrGenRef.current) setQrLoading(false);
      }
    },
    [marcarConectado]
  );

  const scheduleQrPoll = useCallback(
    (instId) => {
      clearQrTimer();
      qrTimerRef.current = setTimeout(async () => {
        if (!mountedRef.current || instanceIdRef.current !== instId) return;
        const res = await fetchQr(instId, { silent: true });
        if (!mountedRef.current || instanceIdRef.current !== instId) return;
        if (res?.connected) return;
        if (res?.status === 429) return; // a contagem regressiva reagenda
        if (!isValidQrDataUri(res?.dataUri)) return;
        scheduleQrPoll(instId);
      }, QR_POLL_MS);
    },
    [clearQrTimer, fetchQr]
  );

  /** Pede um QR agora e religa a renovação automática. */
  const refreshQr = useCallback(
    async ({ silent = false } = {}) => {
      const instId = instanceIdRef.current;
      if (instId == null) return;
      clearQrTimer();
      const res = await fetchQr(instId, { silent });
      if (!mountedRef.current || instanceIdRef.current !== instId) return;
      if (res?.connected || res?.status === 429) return;
      if (isValidQrDataUri(res?.dataUri)) scheduleQrPoll(instId);
    },
    [clearQrTimer, fetchQr, scheduleQrPoll]
  );

  const scheduleStatusPoll = useCallback(
    (instId) => {
      clearStatusTimer();
      statusTimerRef.current = setTimeout(async () => {
        if (!mountedRef.current || instanceIdRef.current !== instId) return;
        const res = await obterStatusInstancia(instId).catch(() => null);
        if (!mountedRef.current || instanceIdRef.current !== instId) return;
        if (res?.connected) {
          marcarConectado(res.phone || null);
          return;
        }
        if (res?.channelStatus) setChannelStatus(res.channelStatus);
        scheduleStatusPoll(instId);
      }, STATUS_POLL_MS);
    },
    [clearStatusTimer, marcarConectado]
  );

  /** Carrega as instâncias e escolhe o canal caído. */
  const carregar = useCallback(async () => {
    setLoadingInstances(true);
    setListError("");
    try {
      const { instances } = await listarInstanciasWhapi({ refresh: true });
      if (!mountedRef.current) return null;
      const alvo = pickReconnectInstance(instances);
      setForbidden(false);
      if (!alvo) {
        setInstance(null);
        instanceIdRef.current = null;
        setListError("Nenhum canal WhatsApp ativo para reconectar.");
        return null;
      }
      setInstance(alvo);
      return alvo;
    } catch (err) {
      if (!mountedRef.current) return null;
      const status = err?.response?.status;
      if (status === 403) {
        setForbidden(true);
        setListError("");
      } else {
        setListError(
          err?.response?.data?.error || err?.message || "Não foi possível carregar o canal."
        );
      }
      return null;
    } finally {
      if (mountedRef.current) setLoadingInstances(false);
    }
  }, []);

  // Liga/desliga o fluxo inteiro com o overlay.
  useEffect(() => {
    if (!enabled) {
      qrGenRef.current += 1;
      instanceIdRef.current = null;
      clearQrTimer();
      clearStatusTimer();
      setInstance(null);
      setQrDataUri(null);
      setQrError("");
      setRetryIn(0);
      setConnected(false);
      setPairCode("");
      setPairError("");
      connectedNotifiedRef.current = false;
      return undefined;
    }
    carregar();
    return undefined;
  }, [enabled, carregar, clearQrTimer, clearStatusTimer]);

  const instanceId = instance?.id ?? null;

  // Com o canal escolhido: status em tempo real + primeiro QR.
  useEffect(() => {
    if (!enabled || instanceId == null) return undefined;
    instanceIdRef.current = instanceId;
    connectedNotifiedRef.current = false;
    setConnected(false);
    setQrDataUri(null);
    setQrError("");
    setRetryIn(0);

    let cancelado = false;
    (async () => {
      const st = await obterStatusInstancia(instanceId).catch(() => null);
      if (cancelado || !mountedRef.current || instanceIdRef.current !== instanceId) return;
      if (st?.channelStatus) setChannelStatus(st.channelStatus);
      if (st?.connected) {
        marcarConectado(st.phone || null);
        return;
      }
      scheduleStatusPoll(instanceId);
      refreshQr();
    })();

    return () => {
      cancelado = true;
      clearQrTimer();
      clearStatusTimer();
    };
  }, [
    enabled,
    instanceId,
    marcarConectado,
    scheduleStatusPoll,
    refreshQr,
    clearQrTimer,
    clearStatusTimer,
  ]);

  // Contagem regressiva do 429 — ao zerar, tenta de novo sozinho (igual ao WhatsApp Web).
  useEffect(() => {
    if (retryIn <= 0) return undefined;
    const id = setInterval(() => {
      setRetryIn((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [retryIn]);

  const tinhaThrottleRef = useRef(false);
  useEffect(() => {
    if (retryIn > 0) {
      tinhaThrottleRef.current = true;
      return;
    }
    if (!tinhaThrottleRef.current) return;
    tinhaThrottleRef.current = false;
    if (!enabled || connected || instanceIdRef.current == null) return;
    refreshQr({ silent: true });
  }, [retryIn, enabled, connected, refreshQr]);

  /** Pareamento por código (alternativa ao QR, igual ao WhatsApp Web). */
  const gerarCodigoPorTelefone = useCallback(
    async (telefoneBruto) => {
      const instId = instanceIdRef.current;
      if (instId == null) return;
      const telefone = normalizePairPhone(telefoneBruto);
      if (!telefone) {
        setPairError("Digite o número com DDI e DDD. Ex.: 5534999998888");
        return;
      }
      setPairLoading(true);
      setPairError("");
      setPairCode("");
      try {
        const res = await parearInstanciaPorCodigo(instId, telefone);
        if (!mountedRef.current || instanceIdRef.current !== instId) return;
        if (res?.code) {
          setPairCode(res.code);
          return;
        }
        setPairError(res?.error || "Não foi possível gerar o código.");
      } catch (err) {
        if (!mountedRef.current) return;
        setPairError(
          err?.response?.data?.error || err?.message || "Não foi possível gerar o código."
        );
      } finally {
        if (mountedRef.current) setPairLoading(false);
      }
    },
    []
  );

  const limparCodigo = useCallback(() => {
    setPairCode("");
    setPairError("");
  }, []);

  return {
    instance,
    loadingInstances,
    listError,
    forbidden,
    connected,
    channelStatus,
    phoneConectado,
    qrDataUri,
    qrError,
    qrLoading,
    retryIn,
    refreshQr,
    recarregarCanal: carregar,
    pairCode,
    pairError,
    pairLoading,
    gerarCodigoPorTelefone,
    limparCodigo,
  };
}
