import { useCallback, useEffect, useRef, useState } from "react";
import {
  registrarInstanciaWhapi,
  listarInstanciasWhapi,
  obterQrCodeInstancia,
  obterStatusInstancia,
  parearInstanciaPorCodigo,
  configurarWebhooksInstancia,
  desconectarInstanciaWhapi,
} from "../api/whapiInstancesService";
import { whatsappInstanceLabel } from "../chats/whatsappInstancesService";
import "./whapiConnect.css";

const QR_POLL_MS = 20000;
const STATUS_POLL_MS = 5000;
const STATUS_POLL_CONNECTED_MS = 20000;

function instanceTitle(inst) {
  if (!inst) return "";
  return whatsappInstanceLabel(inst) || inst.nome || inst.instance_id || `Canal #${inst.id}`;
}

function statusBadge(connected, loading) {
  if (loading && connected == null) return { label: "Verificando…", tone: "wait" };
  if (connected) return { label: "Conectado", tone: "ok" };
  return { label: "Aguardando QR", tone: "wait" };
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

/**
 * Painel de conexão para instâncias Whapi (2º provider, ao lado do UltraMSG).
 *
 * Fluxo:
 *  1. Cadastrar canal (Channel ID + Token) → POST /instances
 *  2. QR (GET :id/qrcode) ou código (POST :id/phone-code)
 *  3. Health (GET :id/status) até AUTH
 *  4. Webhook (POST :id/configure-webhooks) e, se precisar, logout (POST :id/logout)
 */
export default function WhapiConnectPanel({ showToast }) {
  const [instances, setInstances] = useState([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [channelId, setChannelId] = useState("");
  const [token, setToken] = useState("");
  const [nome, setNome] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [formError, setFormError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [liveStatus, setLiveStatus] = useState(null);
  const [statusError, setStatusError] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);

  const [qrDataUri, setQrDataUri] = useState(null);
  const [qrError, setQrError] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrRetryIn, setQrRetryIn] = useState(null);

  const [phone, setPhone] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [pairError, setPairError] = useState("");
  const [pairLoading, setPairLoading] = useState(false);

  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const mountedRef = useRef(false);
  const selectedIdRef = useRef(null);
  const qrTimerRef = useRef(null);
  const statusTimerRef = useRef(null);
  const qrGenRef = useRef(0);
  const statusGenRef = useRef(0);
  const webhookAutoRef = useRef(new Set());
  const wasConnectedRef = useRef(false);

  const selectedInstance = instances.find((inst) => String(inst.id) === String(selectedId)) || null;
  const connected = liveStatus?.connected === true;

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

  const loadInstances = useCallback(async () => {
    setInstancesLoading(true);
    try {
      const list = await listarInstanciasWhapi();
      if (!mountedRef.current) return list;
      setInstances(list);
      setListError("");
      return list;
    } catch (err) {
      const status = err?.response?.status;
      const msg =
        status === 403
          ? "Apenas supervisor ou administrador pode gerenciar canais Whapi."
          : err?.response?.data?.error || err?.message || "Não foi possível listar as instâncias.";
      if (mountedRef.current) {
        setInstances([]);
        setListError(msg);
      }
      return [];
    } finally {
      if (mountedRef.current) setInstancesLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadInstances();
    return () => {
      mountedRef.current = false;
      clearQrTimer();
      clearStatusTimer();
    };
  }, [loadInstances, clearQrTimer, clearStatusTimer]);

  const resetConnectState = useCallback(() => {
    qrGenRef.current += 1;
    statusGenRef.current += 1;
    clearQrTimer();
    setQrDataUri(null);
    setQrError("");
    setQrRetryIn(null);
    setPhone("");
    setPairCode("");
    setPairError("");
    setLiveStatus(null);
    setStatusError("");
    setWebhookMsg("");
    setShowLogoutConfirm(false);
    wasConnectedRef.current = false;
  }, [clearQrTimer]);

  const selecionarInstancia = useCallback(
    (inst) => {
      resetConnectState();
      const id = inst?.id ?? null;
      selectedIdRef.current = id;
      setSelectedId(id);
    },
    [resetConnectState]
  );

  const fetchStatus = useCallback(async (instId, { silent = false } = {}) => {
    if (instId == null) return null;
    const gen = ++statusGenRef.current;
    if (!silent) setStatusLoading(true);
    try {
      const res = await obterStatusInstancia(instId);
      if (!mountedRef.current || gen !== statusGenRef.current || selectedIdRef.current !== instId) return null;
      if (res.status === 429) {
        setStatusError(res.error || "Muitas consultas de status. Aguarde um instante.");
        return res;
      }
      if (res.error && res.status >= 400 && res.status !== 502) {
        setStatusError(res.error);
      } else {
        setStatusError("");
      }
      setLiveStatus((prev) => {
        const next = {
          connected: res.connected,
          phone: res.phone,
          channelStatus: res.channelStatus,
        };
        if (
          prev
          && prev.connected === next.connected
          && prev.phone === next.phone
          && prev.channelStatus === next.channelStatus
        ) {
          return prev;
        }
        return next;
      });
      return res;
    } catch (err) {
      if (mountedRef.current && gen === statusGenRef.current) {
        setStatusError(err?.response?.data?.error || err?.message || "Erro ao consultar status.");
      }
      return null;
    } finally {
      if (!silent && mountedRef.current && gen === statusGenRef.current) setStatusLoading(false);
    }
  }, []);

  const fetchQr = useCallback(async (instId, { silent = false } = {}) => {
    if (instId == null) return null;
    const gen = ++qrGenRef.current;
    if (!silent) setQrLoading(true);
    try {
      const res = await obterQrCodeInstancia(instId);
      if (!mountedRef.current || gen !== qrGenRef.current || selectedIdRef.current !== instId) return null;
      if (res.connected) {
        clearQrTimer();
        setQrDataUri(null);
        setQrError("");
        setLiveStatus((prev) => ({ ...(prev || {}), connected: true }));
        return res;
      }
      if (res.status === 429) {
        const wait = Math.max(5, Number(res.retryAfterSeconds) || 60);
        setQrRetryIn(wait);
        setQrError(res.error || "Aguarde antes de gerar outro QR Code.");
        return res;
      }
      if (res.error) {
        setQrError(res.error);
        return res;
      }
      if (res.dataUri) {
        setQrDataUri(res.dataUri);
        setQrError("");
      }
      return res;
    } catch (err) {
      if (mountedRef.current && gen === qrGenRef.current) {
        setQrError(err?.response?.data?.error || err?.message || "Erro ao obter QR Code.");
      }
      return null;
    } finally {
      if (!silent && mountedRef.current && gen === qrGenRef.current) setQrLoading(false);
    }
  }, [clearQrTimer]);

  const scheduleQrPoll = useCallback((instId) => {
    clearQrTimer();
    qrTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || selectedIdRef.current !== instId) return;
      fetchQr(instId, { silent: true }).then((res) => {
        if (!mountedRef.current || selectedIdRef.current !== instId) return;
        if (res?.connected) return;
        if (res?.status === 429) return;
        if (!res?.dataUri) return;
        scheduleQrPoll(instId);
      });
    }, QR_POLL_MS);
  }, [clearQrTimer, fetchQr]);

  const scheduleStatusPoll = useCallback((instId, delay) => {
    clearStatusTimer();
    statusTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || selectedIdRef.current !== instId) return;
      fetchStatus(instId, { silent: true }).then((res) => {
        if (!mountedRef.current || selectedIdRef.current !== instId) return;
        const next = res?.connected ? STATUS_POLL_CONNECTED_MS : STATUS_POLL_MS;
        scheduleStatusPoll(instId, next);
      });
    }, delay);
  }, [clearStatusTimer, fetchStatus]);

  useEffect(() => {
    if (selectedId == null) {
      clearStatusTimer();
      return undefined;
    }
    fetchStatus(selectedId);
    scheduleStatusPoll(selectedId, STATUS_POLL_MS);
    return () => clearStatusTimer();
  }, [selectedId, fetchStatus, scheduleStatusPoll, clearStatusTimer]);

  const tryAutoWebhook = useCallback(async (instId) => {
    if (instId == null || webhookAutoRef.current.has(String(instId))) return;
    webhookAutoRef.current.add(String(instId));
    const res = await configurarWebhooksInstancia(instId);
    if (!mountedRef.current || selectedIdRef.current !== instId) return;
    if (res.ok) {
      setWebhookMsg(res.webhookUrl ? `Webhook apontado para ${res.webhookUrl}` : "Webhook configurado.");
      showToast?.({
        type: "success",
        title: "Webhook configurado",
        message: "O canal já envia mensagens para o ZapERP.",
      });
    } else {
      webhookAutoRef.current.delete(String(instId));
      setWebhookMsg(res.error || "Não foi possível configurar o webhook automaticamente.");
    }
  }, [showToast]);

  useEffect(() => {
    if (!connected || selectedId == null) return;
    clearQrTimer();
    setQrDataUri(null);
    setQrError("");
    if (!wasConnectedRef.current) {
      wasConnectedRef.current = true;
      showToast?.({
        type: "success",
        title: "Whapi conectada",
        message: "O canal autenticou. Você já pode atender por esta instância.",
      });
      loadInstances();
      tryAutoWebhook(selectedId);
    }
  }, [connected, selectedId, clearQrTimer, showToast, loadInstances, tryAutoWebhook]);

  useEffect(() => {
    if (qrRetryIn == null || qrRetryIn <= 0) return undefined;
    const id = setInterval(() => {
      setQrRetryIn((prev) => {
        if (prev == null || prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [qrRetryIn]);

  async function handleRegistrar(e) {
    e.preventDefault();
    const idCanal = channelId.trim();
    const tk = token.trim();
    if (!idCanal || !tk) {
      setFormError("Informe o Channel ID e o Token do canal Whapi.");
      return;
    }
    setRegistrando(true);
    setFormError("");
    try {
      const data = await registrarInstanciaWhapi({
        instanceId: idCanal,
        instanceToken: tk,
        nome: nome.trim() || idCanal,
      });
      const nova = data?.instance || data?.instancia || data || null;
      const novaId = nova?.id ?? nova?.whatsapp_instance_id ?? data?.id ?? null;
      showToast?.({
        type: "success",
        title: "Canal Whapi cadastrado",
        message: "Agora gere o QR Code no celular para conectar.",
      });
      setChannelId("");
      setToken("");
      setNome("");
      const list = await loadInstances();
      const found = list.find((inst) => String(inst.id) === String(novaId)) || (novaId != null ? { id: novaId, nome: nova?.nome || idCanal, provider: "whapi", instance_id: idCanal } : null);
      if (found) selecionarInstancia(found);
    } catch (err) {
      setFormError(err?.response?.data?.error || err?.message || "Não foi possível cadastrar o canal Whapi.");
    } finally {
      if (mountedRef.current) setRegistrando(false);
    }
  }

  async function handleGerarQr() {
    if (!selectedId) return;
    if (qrRetryIn > 0) return;
    setQrRetryIn(null);
    setQrError("");
    const st = await fetchStatus(selectedId);
    if (!mountedRef.current || selectedIdRef.current !== selectedId) return;
    if (st?.connected) return;
    const res = await fetchQr(selectedId);
    if (!mountedRef.current || selectedIdRef.current !== selectedId) return;
    if (res?.connected) return;
    if (res?.dataUri && res?.status !== 429) scheduleQrPoll(selectedId);
  }

  async function handleParear() {
    if (!selectedId) return;
    const tel = digitsOnly(phone);
    if (tel.length < 10) {
      setPairError("Informe o telefone com DDI e DDD, só números (ex.: 5534999998888).");
      return;
    }
    setPairLoading(true);
    setPairError("");
    setPairCode("");
    try {
      const res = await parearInstanciaPorCodigo(selectedId, tel);
      if (!mountedRef.current) return;
      if (res.code) setPairCode(res.code);
      else setPairError(res.error || "Resposta inesperada ao gerar o código.");
    } finally {
      if (mountedRef.current) setPairLoading(false);
    }
  }

  async function handleWebhook() {
    if (!selectedId) return;
    setWebhookBusy(true);
    try {
      const res = await configurarWebhooksInstancia(selectedId);
      if (!mountedRef.current) return;
      if (res.ok) {
        webhookAutoRef.current.add(String(selectedId));
        setWebhookMsg(res.webhookUrl ? `Webhook apontado para ${res.webhookUrl}` : "Webhook configurado.");
        showToast?.({ type: "success", title: "Webhook configurado", message: "Mensagens deste canal entram no ZapERP." });
      } else {
        setWebhookMsg(res.error || "Falha ao configurar o webhook.");
        showToast?.({ type: "error", title: "Webhook", message: res.error || "Falha ao configurar." });
      }
    } finally {
      if (mountedRef.current) setWebhookBusy(false);
    }
  }

  async function handleLogout() {
    if (!selectedId) return;
    setLogoutBusy(true);
    try {
      const res = await desconectarInstanciaWhapi(selectedId);
      if (!mountedRef.current) return;
      setShowLogoutConfirm(false);
      if (res.ok) {
        webhookAutoRef.current.delete(String(selectedId));
        wasConnectedRef.current = false;
        setLiveStatus({ connected: false, phone: liveStatus?.phone || null, channelStatus: "LOGOUT" });
        setQrDataUri(null);
        showToast?.({
          type: "success",
          title: "Canal desconectado",
          message: "Gere um novo QR Code para conectar de novo.",
        });
        await loadInstances();
      } else {
        showToast?.({ type: "error", title: "Falha ao desconectar", message: res.error || "Tente novamente." });
      }
    } finally {
      if (mountedRef.current) setLogoutBusy(false);
    }
  }

  const badge = statusBadge(connected, statusLoading);
  const canRetryQr = qrRetryIn == null || qrRetryIn <= 0;

  return (
    <div className="whapi-panel">
      <section className="whapi-card" aria-labelledby="whapi-cadastro-title">
        <h3 id="whapi-cadastro-title" className="whapi-card-title">1. Cadastrar canal Whapi</h3>
        <p className="whapi-card-desc">
          Crie o canal no painel da Whapi Cloud, copie o Channel ID e o token, e cole aqui.
          O token não é exibido depois de salvo.
        </p>
        <form className="whapi-form" onSubmit={handleRegistrar}>
          <div className="ia-field">
            <label htmlFor="whapi-channel-id">Channel ID</label>
            <input
              id="whapi-channel-id"
              className="ia-input"
              type="text"
              autoComplete="off"
              placeholder="ex.: NEBULA-AER3B"
              value={channelId}
              onChange={(e) => { setChannelId(e.target.value); setFormError(""); }}
              disabled={registrando}
            />
          </div>
          <div className="ia-field">
            <label htmlFor="whapi-token">Token do canal</label>
            <input
              id="whapi-token"
              className="ia-input"
              type="password"
              autoComplete="off"
              placeholder="Bearer do canal Whapi"
              value={token}
              onChange={(e) => { setToken(e.target.value); setFormError(""); }}
              disabled={registrando}
            />
          </div>
          <div className="ia-field">
            <label htmlFor="whapi-nome">Rótulo (opcional)</label>
            <input
              id="whapi-nome"
              className="ia-input"
              type="text"
              placeholder="Como aparecerá na lista"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={registrando}
            />
          </div>
          {formError ? <div className="ia-error-banner" role="alert">{formError}</div> : null}
          <div>
            <button type="submit" className="ia-btn ia-btn--primary" disabled={registrando}>
              {registrando ? "Cadastrando…" : "Cadastrar canal"}
            </button>
          </div>
        </form>
      </section>

      <section className="whapi-card" aria-labelledby="whapi-lista-title">
        <div className="whapi-actions" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h3 id="whapi-lista-title" className="whapi-card-title" style={{ margin: 0 }}>2. Escolher instância</h3>
          <button type="button" className="ia-btn ia-btn--outline" onClick={loadInstances} disabled={instancesLoading}>
            {instancesLoading ? "Atualizando…" : "Atualizar lista"}
          </button>
        </div>
        {listError ? <div className="ia-error-banner" role="alert">{listError}</div> : null}
        {instances.length === 0 && !listError ? (
          <p className="whapi-card-desc" style={{ marginBottom: 0 }}>
            {instancesLoading ? "Carregando instâncias…" : "Nenhum canal Whapi cadastrado ainda. Use o formulário acima."}
          </p>
        ) : (
          <div className="whapi-instance-list">
            {instances.map((inst) => {
              const isSel = selectedId != null && String(selectedId) === String(inst.id);
              const liveForThis = isSel ? liveStatus : null;
              const isOn = liveForThis?.connected === true || String(inst.status || "").toLowerCase() === "connected";
              return (
                <button
                  key={String(inst.id)}
                  type="button"
                  className={`whapi-instance${isSel ? " is-selected" : ""}`}
                  onClick={() => selecionarInstancia(inst)}
                >
                  <span>
                    <span className="whapi-instance-name">{instanceTitle(inst)}</span>
                    <span className="whapi-instance-meta">
                      {inst.instance_id || "sem Channel ID"}
                      {inst.display_phone || inst.telefone_conectado ? ` · ${inst.display_phone || inst.telefone_conectado}` : ""}
                      {inst.is_default ? " · padrão" : ""}
                      {inst.ativo === false ? " · inativa" : ""}
                    </span>
                  </span>
                  <span className={`whapi-badge ${isOn ? "whapi-badge--ok" : "whapi-badge--wait"}`}>
                    {isOn ? "Conectado" : "Desconectado"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selectedInstance ? (
        <section className="whapi-card" aria-labelledby="whapi-conectar-title">
          <div className="whapi-status-line">
            <h3 id="whapi-conectar-title" className="whapi-card-title" style={{ margin: 0 }}>
              3. Conectar “{instanceTitle(selectedInstance)}”
            </h3>
            <span className={`whapi-badge ${badge.tone === "ok" ? "whapi-badge--ok" : "whapi-badge--wait"}`}>
              {badge.label}
              {liveStatus?.channelStatus ? ` · ${liveStatus.channelStatus}` : ""}
            </span>
          </div>
          {liveStatus?.phone ? (
            <p className="whapi-card-desc">Número autenticado: {liveStatus.phone}</p>
          ) : (
            <p className="whapi-card-desc">
              Abra o WhatsApp no celular, vá em Dispositivos conectados e leia o QR — ou use o código de pareamento.
            </p>
          )}
          {statusError ? <div className="ia-error-banner" role="alert">{statusError}</div> : null}

          <div className="whapi-connect">
            <div>
              <div className="whapi-qr-box">
                {connected ? (
                  <div className="whapi-connected">
                    <div aria-hidden="true">✅</div>
                    <h3>Canal conectado</h3>
                    <p className="whapi-card-desc" style={{ margin: 0 }}>Pronto para enviar e receber no ZapERP.</p>
                  </div>
                ) : qrError && !qrDataUri ? (
                  <div className="whapi-qr-placeholder">{qrError}</div>
                ) : qrLoading && !qrDataUri ? (
                  <div className="whapi-qr-placeholder">Gerando QR Code…</div>
                ) : qrDataUri ? (
                  <img src={qrDataUri} alt="QR Code para conectar via Whapi" className="whapi-qr-image" />
                ) : (
                  <div className="whapi-qr-placeholder">Clique em “Gerar QR Code” para iniciar.</div>
                )}
              </div>
              {!connected ? (
                <div className="whapi-actions">
                  <button
                    type="button"
                    className="ia-btn ia-btn--primary"
                    onClick={handleGerarQr}
                    disabled={qrLoading || !canRetryQr}
                  >
                    {qrLoading ? "Gerando…" : qrDataUri ? "Atualizar QR" : "Gerar QR Code"}
                  </button>
                  {qrRetryIn > 0 ? (
                    <span className="whapi-card-desc" style={{ margin: 0 }}>
                      Novo QR em {qrRetryIn}s
                    </span>
                  ) : null}
                </div>
              ) : null}
              {qrError && qrDataUri ? (
                <p className="whapi-card-desc" style={{ marginTop: 8 }}>{qrError}</p>
              ) : null}
            </div>

            <div>
              {connected ? (
                <>
                  <h4 className="whapi-card-title">Manutenção</h4>
                  <p className="whapi-card-desc">
                    O webhook precisa apontar para o ZapERP para as mensagens chegarem no atendimento.
                    Desconectar encerra a sessão no celular, sem apagar o cadastro do canal.
                  </p>
                  {webhookMsg ? <p className="whapi-card-desc">{webhookMsg}</p> : null}
                  <div className="whapi-actions">
                    <button type="button" className="ia-btn ia-btn--primary" onClick={handleWebhook} disabled={webhookBusy}>
                      {webhookBusy ? "Configurando…" : "Configurar webhook"}
                    </button>
                    <button type="button" className="ia-btn ia-btn--outline" onClick={() => setShowLogoutConfirm(true)} disabled={logoutBusy}>
                      Desconectar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h4 className="whapi-card-title">Como conectar</h4>
                  <ol className="whapi-steps">
                    <li>Abra o WhatsApp no celular.</li>
                    <li>Toque em <strong>Dispositivos conectados</strong>.</li>
                    <li>Escolha <strong>Conectar um dispositivo</strong>.</li>
                    <li>Aponte a câmera para este QR Code.</li>
                  </ol>
                  <h4 className="whapi-card-title">Ou conectar por código</h4>
                  <p className="whapi-card-desc">
                    WhatsApp → Dispositivos conectados → Conectar com número de telefone.
                  </p>
                  <div className="whapi-form" style={{ maxWidth: 320 }}>
                    <input
                      className="ia-input"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="ex.: 5534999998888"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); setPairError(""); }}
                      disabled={pairLoading}
                    />
                    <div>
                      <button type="button" className="ia-btn ia-btn--outline" onClick={handleParear} disabled={pairLoading}>
                        {pairLoading ? "Gerando…" : "Gerar código"}
                      </button>
                    </div>
                    {pairError ? <div className="ia-error-banner" role="alert">{pairError}</div> : null}
                    {pairCode ? (
                      <div className="whapi-code">
                        <div className="whapi-card-desc" style={{ marginBottom: 4 }}>Digite no WhatsApp:</div>
                        <div className="whapi-code-value">{pairCode}</div>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {showLogoutConfirm ? (
        <div
          className="whapi-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Desconectar canal Whapi"
          onMouseDown={() => { if (!logoutBusy) setShowLogoutConfirm(false); }}
        >
          <div className="whapi-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="whapi-modal-head">
              <div className="whapi-modal-title">Desconectar canal</div>
              <button
                type="button"
                className="ia-btn ia-btn--outline"
                onClick={() => !logoutBusy && setShowLogoutConfirm(false)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="whapi-modal-body">
              <p style={{ marginBottom: 12 }}>
                Encerrar a sessão WhatsApp de “{instanceTitle(selectedInstance)}”?
              </p>
              <p className="ia-muted" style={{ marginBottom: 0 }}>
                O cadastro do canal permanece. Será preciso um novo QR Code para reconectar.
              </p>
            </div>
            <div className="whapi-modal-body" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="ia-btn ia-btn--outline" onClick={() => !logoutBusy && setShowLogoutConfirm(false)} disabled={logoutBusy}>
                Cancelar
              </button>
              <button type="button" className="ia-btn ia-btn--primary" onClick={handleLogout} disabled={logoutBusy}>
                {logoutBusy ? "Desconectando…" : "Desconectar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
