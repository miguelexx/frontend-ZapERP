import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useNotificationStore } from "../notifications/notificationStore";
import { getZapiStatus, getZapiQrCode, restartZapi, getZapiMe } from "../api/zapiIntegration";
import "./IA.css";

const MAX_AUTO_ATTEMPTS = 3;

function getStatusBadge(status) {
  if (!status) return { label: "Verificando…", tone: "muted", icon: "⏳" };
  if (status.connected) return { label: "Conectado", tone: "success", icon: "✅" };
  if (!status.smartphoneConnected) return { label: "Celular sem internet", tone: "warning", icon: "📶" };
  return { label: "Desconectado", tone: "danger", icon: "⚠️" };
}

export default function ConnectWhatsApp() {
  const navigate = useNavigate();
  const showToast = useNotificationStore((s) => s.showToast);

  const [status, setStatus] = useState(null);
  const [qrSrc, setQrSrc] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);
  const [loadingRestart, setLoadingRestart] = useState(false);
  const [error, setError] = useState(null);
  const [noInstance, setNoInstance] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [meInfo, setMeInfo] = useState(null);

  const attemptsRef = useRef(0);
  const pollingRef = useRef(null);
  const mountedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const handleCommonError = useCallback(
    (err) => {
      const statusCode = err?.response?.status;
      const msg = err?.response?.data?.error || "";

      if (statusCode === 400 && msg?.toLowerCase().includes("empresa sem instância configurada")) {
        setNoInstance(true);
        setError("Empresa sem instância configurada.");
        setQrSrc(null);
        stopPolling();
        return;
      }

      if (statusCode === 502 || err?.message === "Network Error" || err?.code === "ECONNABORTED") {
        showToast?.({
          type: "error",
          title: "Falha ao comunicar com WhatsApp",
          message: "Tente novamente em instantes.",
        });
      }
    },
    [showToast, stopPolling]
  );

  const fetchStatus = useCallback(
    async (options = {}) => {
      const { silent = false } = options;
      if (!silent) {
        setLoadingStatus(true);
      }
      try {
        const data = await getZapiStatus();
        if (!mountedRef.current) return null;
        setStatus(data);
        setNoInstance(false);
        setError(null);

        if (data?.connected) {
          setQrSrc(null);
          stopPolling();
          try {
            const me = await getZapiMe().catch(() => null);
            if (mountedRef.current) setMeInfo(me);
          } catch {
            // diagnóstico opcional; ignora falha
          }
        }
        return data;
      } catch (err) {
        if (!mountedRef.current) return null;
        handleCommonError(err);
        if (!error) {
          setError(err?.response?.data?.error || "Erro ao consultar status do WhatsApp.");
        }
        return null;
      } finally {
        if (!silent && mountedRef.current) {
          setLoadingStatus(false);
        }
      }
    },
    [handleCommonError, stopPolling, error]
  );

  const fetchQr = useCallback(
    async (options = {}) => {
      const { silent = false } = options;
      if (status?.connected || noInstance) return false;
      if (!silent) setLoadingQr(true);
      try {
        const data = await getZapiQrCode();
        if (!mountedRef.current) return false;

        if (data?.alreadyConnected) {
          await fetchStatus({ silent: true });
          return false;
        }

        if (data?.imageBase64) {
          setQrSrc(`data:image/png;base64,${data.imageBase64}`);
          setAttempts((prev) => {
            const next = prev + 1;
            attemptsRef.current = next;
            return next;
          });
          return true;
        }
        return false;
      } catch (err) {
        if (!mountedRef.current) return false;
        handleCommonError(err);
        if (!error) {
          setError(err?.response?.data?.error || "Erro ao gerar QR Code.");
        }
        return false;
      } finally {
        if (!silent && mountedRef.current) setLoadingQr(false);
      }
    },
    [status?.connected, noInstance, fetchStatus, handleCommonError, error]
  );

  const startPolling = useCallback(() => {
    if (pollingRef.current || noInstance) return;
    if (attemptsRef.current >= MAX_AUTO_ATTEMPTS) return;
    const baseInterval = 15000;
    pollingRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      const currentAttempts = attemptsRef.current;
      const st = await fetchStatus({ silent: true });
      if (!mountedRef.current) return;
      if (st?.connected) {
        stopPolling();
        return;
      }
      if (currentAttempts >= MAX_AUTO_ATTEMPTS) {
        stopPolling();
        return;
      }
      const ok = await fetchQr({ silent: true });
      if (!ok && currentAttempts >= MAX_AUTO_ATTEMPTS) {
        stopPolling();
      }
    }, baseInterval);
    setIsPolling(true);
  }, [fetchStatus, fetchQr, noInstance, stopPolling]);

  const resetFlow = useCallback(() => {
    attemptsRef.current = 0;
    setAttempts(0);
    setQrSrc(null);
    setError(null);
    setNoInstance(false);
  }, []);

  const bootstrap = useCallback(async () => {
    if (!mountedRef.current) return;
    resetFlow();
    const st = await fetchStatus();
    if (!mountedRef.current) return;
    if (st && !st.connected && !noInstance) {
      attemptsRef.current = 0;
      setAttempts(0);
      const ok = await fetchQr();
      if (!mountedRef.current) return;
      if (ok) {
        startPolling();
      }
    }
  }, [fetchStatus, fetchQr, resetFlow, startPolling, noInstance]);

  useEffect(() => {
    mountedRef.current = true;
    bootstrap();
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [bootstrap, stopPolling]);

  const handleGenerateNewQr = async () => {
    stopPolling();
    resetFlow();
    const st = await fetchStatus();
    if (!st || st.connected || noInstance) return;
    const ok = await fetchQr();
    if (ok) {
      startPolling();
    }
  };

  const handleRestart = async () => {
    setLoadingRestart(true);
    try {
      await restartZapi();
      showToast?.({
        type: "success",
        title: "Instância reiniciada",
        message: "Reiniciamos a instância do WhatsApp. Aguarde alguns segundos.",
      });
    } catch (err) {
      showToast?.({
        type: "error",
        title: "Falha ao reiniciar",
        message: err?.response?.data?.error || "Não foi possível reiniciar a instância agora.",
      });
    } finally {
      setLoadingRestart(false);
      setShowRestartModal(false);
      setTimeout(() => {
        if (!mountedRef.current) return;
        bootstrap();
      }, 2500);
    }
  };

  const badge = getStatusBadge(status);
  const reachedMaxAttempts = attemptsRef.current >= MAX_AUTO_ATTEMPTS;

  return (
    <div className="ia-wrap">
      <header className="ia-header">
        <h1 className="ia-title">Conectar WhatsApp</h1>
        <p className="ia-subtitle">
          Conecte a instância Z-API da sua empresa via QR Code, como no WhatsApp Web.
        </p>
      </header>

      <div className="ia-content">
        <div className="zapi-card">
          <div className="zapi-card-head">
            <div>
              <h2 className="zapi-card-title">Conectar WhatsApp</h2>
              <p className="zapi-card-sub">
                Leia o QR Code com o aplicativo WhatsApp no seu celular para conectar esta instância.
              </p>
            </div>
            <div className={`zapi-statusBadge zapi-statusBadge--${badge.tone}`}>
              <span className="zapi-statusBadge-icon">{badge.icon}</span>
              <span>{badge.label}</span>
            </div>
          </div>

          {noInstance ? (
            <div className="zapi-empty">
              <h3>Instância não configurada</h3>
              <p>
                Esta empresa ainda não possui uma instância Z-API configurada no backend.
              </p>
              <p className="ia-muted">
                Peça ao responsável técnico para cadastrar a instância Z-API antes de tentar conectar.
              </p>
              <button
                type="button"
                className="ia-btn ia-btn--primary"
                onClick={() => {
                  showToast?.({
                    type: "info",
                    title: "Solicitação enviada",
                    message: "Fale com o suporte para cadastrar sua instância Z-API.",
                  });
                }}
              >
                Solicitar configuração
              </button>
            </div>
          ) : (
            <>
              <div className="zapi-main">
                <div className="zapi-qrColumn">
                  {status?.connected ? (
                    <div className="zapi-connectedState">
                      <div className="zapi-connectedEmoji">✅</div>
                      <h3>WhatsApp conectado</h3>
                      <p className="ia-muted">
                        Sua instância Z-API está conectada ao WhatsApp deste celular.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="zapi-qrBox">
                        {loadingQr || loadingStatus ? (
                          <div className="zapi-qrPlaceholder">Gerando QR Code…</div>
                        ) : qrSrc ? (
                          <img
                            src={qrSrc}
                            alt="QR Code para conectar o WhatsApp"
                            className="zapi-qrImage"
                          />
                        ) : (
                          <div className="zapi-qrPlaceholder">
                            Clique em &ldquo;Gerar novo QR Code&rdquo; para iniciar.
                          </div>
                        )}
                      </div>
                      <p className="ia-muted zapi-qrHint">
                        O QR Code expira rapidamente. Se não funcionar, gere um novo QR Code.
                      </p>
                      {reachedMaxAttempts && (
                        <p className="zapi-paused">
                          Pausamos as tentativas automáticas para evitar chamadas excessivas. Clique em{" "}
                          <strong>Gerar novo QR Code</strong> para tentar novamente.
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="zapi-instructions">
                  <h3>Como conectar</h3>
                  <ol>
                    <li>Abra o WhatsApp no seu celular.</li>
                    <li>Toque em <strong>Dispositivos conectados</strong>.</li>
                    <li>Escolha <strong>Conectar dispositivo</strong>.</li>
                    <li>Aponte a câmera para este QR Code.</li>
                  </ol>
                  <p className="ia-muted">
                    Assim que o WhatsApp conectar, o status será atualizado automaticamente para{" "}
                    <strong>Conectado</strong>.
                  </p>

                  {meInfo && status?.connected && (
                    <div className="zapi-me">
                      <div className="zapi-me-avatar">
                        {meInfo.profilePicUrl ? (
                          <img src={meInfo.profilePicUrl} alt={meInfo.pushName || "WhatsApp"} />
                        ) : (
                          <span>WA</span>
                        )}
                      </div>
                      <div className="zapi-me-info">
                        <div className="zapi-me-name">{meInfo.pushName || "WhatsApp conectado"}</div>
                        {meInfo.wid && (
                          <div className="zapi-me-phone ia-muted">{meInfo.wid}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="ia-error-banner" role="alert" style={{ marginTop: 16 }}>
                  {error}
                  <button type="button" onClick={() => setError(null)} aria-label="Fechar">
                    ×
                  </button>
                </div>
              )}

              <div className="ia-btn-row zapi-actions">
                <button
                  type="button"
                  className="ia-btn ia-btn--outline"
                  onClick={() => navigate("/configuracoes?tab=geral")}
                >
                  Voltar para Configurações
                </button>
                {!status?.connected && (
                  <button
                    type="button"
                    className="ia-btn ia-btn--primary"
                    onClick={handleGenerateNewQr}
                    disabled={loadingStatus || loadingQr || noInstance}
                  >
                    {loadingQr || loadingStatus ? "Atualizando QR Code…" : "Gerar novo QR Code"}
                  </button>
                )}
                <button
                  type="button"
                  className="ia-btn ia-btn--outline"
                  onClick={() => setShowRestartModal(true)}
                  disabled={loadingRestart}
                >
                  Reiniciar instância
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showRestartModal && (
        <div
          className="wa-modalOverlay"
          role="dialog"
          aria-label="Reiniciar instância do WhatsApp"
          onMouseDown={() => {
            if (loadingRestart) return;
            setShowRestartModal(false);
          }}
        >
          <div className="wa-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="wa-modal-head">
              <div className="wa-modal-title">Reiniciar instância</div>
              <button
                type="button"
                className="wa-header-btn"
                onClick={() => !loadingRestart && setShowRestartModal(false)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="wa-modal-body">
              <p style={{ marginBottom: 12 }}>
                Tem certeza que deseja reiniciar a instância Z-API desta empresa?
              </p>
              <p className="ia-muted" style={{ marginBottom: 0 }}>
                As conexões ativas podem cair por alguns instantes. Um novo QR Code poderá ser
                necessário.
              </p>
            </div>
            <div className="wa-modal-body" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="ia-btn ia-btn--outline"
                onClick={() => !loadingRestart && setShowRestartModal(false)}
                disabled={loadingRestart}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="ia-btn ia-btn--primary"
                onClick={handleRestart}
                disabled={loadingRestart}
              >
                {loadingRestart ? "Reiniciando…" : "Confirmar reinício"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

