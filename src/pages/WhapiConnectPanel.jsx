import { useCallback, useEffect, useRef, useState } from "react";
import {
  registrarInstanciaWhapi,
  obterQrCodeInstancia,
  parearInstanciaPorCodigo,
} from "../api/whapiInstancesService";
import {
  fetchWhatsappInstancesAtendimento,
  whatsappInstanceLabel,
} from "../chats/whatsappInstancesService";

/**
 * Painel de conexão para instâncias Whapi (2º provider, ao lado do UltraMSG).
 *
 * Fluxo:
 *  1. Cadastrar canal Whapi (Channel ID + Token + rótulo) → POST /instances
 *  2. Conectar a instância selecionada por QR Code (GET :id/qrcode)
 *     OU por código de pareamento (POST :id/phone-code).
 *
 * Mantém-se totalmente separado do fluxo UltraMSG (ConnectWhatsApp legado),
 * para não introduzir regressão na tela madura de conexão.
 */
export default function WhapiConnectPanel({ showToast }) {
  // ── Lista de instâncias existentes (para selecionar/reconectar) ──────────────
  const [instances, setInstances] = useState([]);
  const [instancesLoading, setInstancesLoading] = useState(false);

  // ── Cadastro de novo canal ───────────────────────────────────────────────────
  const [channelId, setChannelId] = useState("");
  const [token, setToken] = useState("");
  const [nome, setNome] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [formError, setFormError] = useState("");

  // ── Instância selecionada + estado de conexão ───────────────────────────────
  const [selectedInstance, setSelectedInstance] = useState(null); // { id, nome, ... }
  const [qrDataUri, setQrDataUri] = useState(null);
  const [qrConnected, setQrConnected] = useState(false);
  const [qrError, setQrError] = useState("");
  const [qrLoading, setQrLoading] = useState(false);

  // ── Pareamento por código ────────────────────────────────────────────────────
  const [phone, setPhone] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [pairError, setPairError] = useState("");
  const [pairLoading, setPairLoading] = useState(false);

  const qrPollRef = useRef(null);
  const mountedRef = useRef(false);

  const clearQrPoll = useCallback(() => {
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current);
      qrPollRef.current = null;
    }
  }, []);

  const loadInstances = useCallback(async () => {
    setInstancesLoading(true);
    try {
      const { instances: list } = await fetchWhatsappInstancesAtendimento({ silent: true });
      if (!mountedRef.current) return;
      setInstances(Array.isArray(list) ? list : []);
    } catch {
      if (mountedRef.current) setInstances([]);
    } finally {
      if (mountedRef.current) setInstancesLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadInstances();
    return () => {
      mountedRef.current = false;
      clearQrPoll();
    };
  }, [loadInstances, clearQrPoll]);

  const resetConnectState = useCallback(() => {
    clearQrPoll();
    setQrDataUri(null);
    setQrConnected(false);
    setQrError("");
    setPhone("");
    setPairCode("");
    setPairError("");
  }, [clearQrPoll]);

  const selecionarInstancia = useCallback(
    (inst) => {
      resetConnectState();
      setSelectedInstance(inst || null);
    },
    [resetConnectState]
  );

  // ── Cadastro ─────────────────────────────────────────────────────────────────
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
        message: "Agora conecte a instância por QR Code ou por código.",
      });
      setChannelId("");
      setToken("");
      setNome("");
      await loadInstances();
      if (novaId != null) {
        selecionarInstancia({
          id: novaId,
          nome: nova?.nome ?? nome.trim() ?? idCanal,
          provider: "whapi",
        });
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.erro ||
        err?.message ||
        "Não foi possível cadastrar o canal Whapi.";
      setFormError(msg);
    } finally {
      if (mountedRef.current) setRegistrando(false);
    }
  }

  // ── QR Code ──────────────────────────────────────────────────────────────────
  const fetchQr = useCallback(
    async (instId, { silent = false } = {}) => {
      if (instId == null) return;
      if (!silent) setQrLoading(true);
      try {
        const res = await obterQrCodeInstancia(instId);
        if (!mountedRef.current) return;
        if (res.connected) {
          clearQrPoll();
          setQrConnected(true);
          setQrDataUri(null);
          setQrError("");
          return;
        }
        if (res.error) {
          setQrError(res.error);
          return;
        }
        if (res.dataUri) {
          setQrDataUri(res.dataUri);
          setQrError("");
        }
      } catch (err) {
        if (mountedRef.current) {
          setQrError(err?.response?.data?.error || err?.message || "Erro ao obter QR Code.");
        }
      } finally {
        if (!silent && mountedRef.current) setQrLoading(false);
      }
    },
    [clearQrPoll]
  );

  async function handleGerarQr() {
    if (!selectedInstance?.id) return;
    clearQrPoll();
    setQrConnected(false);
    setQrError("");
    await fetchQr(selectedInstance.id);
    if (!mountedRef.current) return;
    // Auto-refresh leve enquanto o QR está visível e não conectou.
    qrPollRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      fetchQr(selectedInstance.id, { silent: true });
    }, 20000);
  }

  // ── Pareamento por código ────────────────────────────────────────────────────
  async function handleParear() {
    if (!selectedInstance?.id) return;
    const tel = phone.trim();
    if (!tel) {
      setPairError("Informe o telefone com DDI e DDD.");
      return;
    }
    setPairLoading(true);
    setPairError("");
    setPairCode("");
    try {
      const res = await parearInstanciaPorCodigo(selectedInstance.id, tel);
      if (!mountedRef.current) return;
      if (res.code) {
        setPairCode(res.code);
      } else if (res.error) {
        setPairError(res.error);
      } else {
        setPairError("Resposta inesperada ao gerar o código.");
      }
    } catch (err) {
      if (mountedRef.current) {
        setPairError(err?.response?.data?.error || err?.message || "Erro ao gerar o código.");
      }
    } finally {
      if (mountedRef.current) setPairLoading(false);
    }
  }

  return (
    <div className="zapi-card">
      <div className="zapi-card-head">
        <div>
          <h2 className="zapi-card-title">Conectar via Whapi</h2>
          <p className="zapi-card-sub">
            Cadastre um canal Whapi e conecte-o por QR Code ou por código de pareamento.
            Este fluxo é independente da conexão UltraMSG.
          </p>
        </div>
      </div>

      {/* ── Cadastro de canal ─────────────────────────────────────────── */}
      <form className="zapi-sync-section" style={{ marginTop: 8 }} onSubmit={handleRegistrar}>
        <h4 style={{ margin: "0 0 12px 0", fontSize: 15 }}>1. Cadastrar canal Whapi</h4>
        <div style={{ display: "grid", gap: 10, maxWidth: 460 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>Channel ID</span>
            <input
              className="ncm-input"
              type="text"
              placeholder="ex.: NEBULA-AER3B"
              value={channelId}
              onChange={(e) => { setChannelId(e.target.value); setFormError(""); }}
              disabled={registrando}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>Token do canal</span>
            <input
              className="ncm-input"
              type="password"
              autoComplete="off"
              placeholder="Bearer do canal Whapi"
              value={token}
              onChange={(e) => { setToken(e.target.value); setFormError(""); }}
              disabled={registrando}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>Rótulo <span style={{ color: "var(--ds-text-tertiary,#94a3b8)" }}>(opcional)</span></span>
            <input
              className="ncm-input"
              type="text"
              placeholder="Como aparecerá na lista"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={registrando}
            />
          </label>
          {formError && (
            <div className="ia-error-banner" role="alert">{formError}</div>
          )}
          <div>
            <button type="submit" className="ia-btn ia-btn--primary" disabled={registrando}>
              {registrando ? "Cadastrando…" : "Cadastrar canal"}
            </button>
          </div>
        </div>
      </form>

      {/* ── Instâncias existentes ─────────────────────────────────────── */}
      <div className="zapi-sync-section" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h4 style={{ margin: 0, fontSize: 15 }}>2. Selecionar instância para conectar</h4>
          <button type="button" className="ia-btn ia-btn--outline" style={{ padding: "4px 10px", fontSize: 12 }} onClick={loadInstances} disabled={instancesLoading}>
            {instancesLoading ? "Atualizando…" : "Atualizar lista"}
          </button>
        </div>
        {instances.length === 0 ? (
          <p className="ia-muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
            {instancesLoading ? "Carregando instâncias…" : "Nenhuma instância ativa encontrada. Cadastre um canal acima."}
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {instances.map((inst) => {
              const isSel = selectedInstance?.id != null && String(selectedInstance.id) === String(inst.id);
              return (
                <button
                  key={String(inst.id)}
                  type="button"
                  className={`ia-btn ${isSel ? "ia-btn--primary" : "ia-btn--outline"}`}
                  onClick={() => selecionarInstancia(inst)}
                  title={inst.provider ? `Provider: ${inst.provider}` : undefined}
                >
                  {whatsappInstanceLabel(inst) || `WhatsApp #${inst.id}`}
                  {inst.provider ? ` · ${inst.provider}` : ""}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Conectar instância selecionada ────────────────────────────── */}
      {selectedInstance?.id != null && (
        <div className="zapi-main" style={{ marginTop: 16 }}>
          {/* QR */}
          <div className="zapi-qrColumn">
            <h4 style={{ margin: "0 0 8px", fontSize: 15 }}>
              Conectar “{selectedInstance.nome || `#${selectedInstance.id}`}”
            </h4>
            <div className="zapi-qrBox">
              {qrConnected ? (
                <div className="zapi-connectedState">
                  <div className="zapi-connectedEmoji">✅</div>
                  <h3>Canal já conectado</h3>
                </div>
              ) : qrError ? (
                <div className="zapi-qrPlaceholder">{qrError}</div>
              ) : qrLoading && !qrDataUri ? (
                <div className="zapi-qrPlaceholder">Gerando QR Code…</div>
              ) : qrDataUri ? (
                <img src={qrDataUri} alt="QR Code para conectar via Whapi" className="zapi-qrImage" />
              ) : (
                <div className="zapi-qrPlaceholder">Clique em “Gerar QR Code” para iniciar.</div>
              )}
            </div>
            <div className="ia-btn-row" style={{ marginTop: 10 }}>
              <button type="button" className="ia-btn ia-btn--primary" onClick={handleGerarQr} disabled={qrLoading}>
                {qrLoading ? "Gerando…" : qrDataUri ? "Atualizar QR" : "Gerar QR Code"}
              </button>
            </div>
          </div>

          {/* Pareamento por código */}
          <div className="zapi-instructions">
            <h3>Ou conectar por código</h3>
            <p className="ia-muted" style={{ fontSize: 13 }}>
              Informe o telefone com DDI/DDD para receber um código de pareamento
              (WhatsApp → Dispositivos conectados → Conectar com número de telefone).
            </p>
            <div style={{ display: "grid", gap: 8, maxWidth: 320 }}>
              <input
                className="ncm-input"
                type="tel"
                inputMode="tel"
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
              {pairError && <div className="ia-error-banner" role="alert">{pairError}</div>}
              {pairCode && (
                <div style={{ padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
                  <div className="ia-muted" style={{ fontSize: 12 }}>Digite no WhatsApp:</div>
                  <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2, fontFamily: "monospace" }}>{pairCode}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
