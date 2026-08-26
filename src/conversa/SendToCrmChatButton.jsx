import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../api/http";
import { getCrmEtapas, postLeadFromConversa } from "../api/crmService";
import { useNotificationStore } from "../notifications/notificationStore";

export function IconFunnelSend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16l-6 7v7l-4 2v-9L4 5z" />
      <path d="M12 12l4 4" />
      <path d="M16 12v4h-4" />
    </svg>
  );
}

function IconCheckMini() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconSpinnerMini() {
  return (
    <svg className="wa-crmSendBtn-spinnerSvg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.22" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function getApiError(e) {
  const status = e?.response?.status;
  const data = e?.response?.data;
  const code = data?.code;
  const msg = data?.error || e?.message;
  if (status === 403 && (code === "CRM_DISABLED" || String(msg || "").includes("CRM"))) {
    return "O CRM Avançado não está configurado neste ambiente. Fale com o administrador.";
  }
  return msg || "Não foi possível enviar ao CRM.";
}

const SendToCrmChatButton = forwardRef(function SendToCrmChatButton(
  { conversaId, hideToolbarButton = false, isGroup = false, crmEnabled = true },
  ref
) {
  const showToast = useNotificationStore((s) => s.showToast);

  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingKey, setSendingKey] = useState(null); // qual etapa está sendo enviada
  const [observacoes, setObservacoes] = useState("");
  const [successFlash, setSuccessFlash] = useState(false);
  const [etapas, setEtapas] = useState([]);
  const [etapasLoading, setEtapasLoading] = useState(false);
  const successTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const openModal = useCallback(() => {
    setModalOpen(true);
  }, []);

  // Ao abrir o modal, busca as etapas do funil do CRM Avançado. Se o CRM ainda
  // não expõe as etapas, cai no envio simples (sem botões de etapa) — sem erro.
  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    setEtapasLoading(true);
    getCrmEtapas()
      .then((res) => {
        if (!cancelled) setEtapas(Array.isArray(res?.etapas) ? res.etapas : []);
      })
      .catch(() => {
        if (!cancelled) setEtapas([]);
      })
      .finally(() => {
        if (!cancelled) setEtapasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen]);

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        if (!conversaId || isGroup || crmEnabled === false) return;
        openModal();
      },
    }),
    [conversaId, isGroup, crmEnabled, openModal]
  );

  // "Abrir no CRM": hand-off SSO para o CRM Avançado (externo). Não navega para
  // rotas internas /crm/* — elas não existem mais (o CRM interno foi removido).
  // Com crmLeadId (UUID interno do CRM devolvido pelo sync), abre direto no lead
  // via ?redirect=/leads/<id>; sem ele, cai na home do CRM.
  const abrirCrmAvancado = useCallback(
    async (crmLeadId) => {
      try {
        const params =
          crmLeadId != null && String(crmLeadId).trim()
            ? { redirect: `/leads/${String(crmLeadId).trim()}` }
            : undefined;
        const { data } = await api.get("/api/crm/abrir-avancado", { params });
        if (data && data.url) {
          window.location.href = data.url;
        } else {
          showToast({ type: "error", title: "CRM indisponível", message: "Não foi possível abrir o CRM Avançado." });
        }
      } catch (err) {
        showToast({ type: "error", title: "CRM indisponível", message: getApiError(err) });
      }
    },
    [showToast]
  );

  const showSuccessToast = useCallback(
    (title, message, crmLeadId, tone = "success") => {
      showToast({
        type: tone,
        title,
        message,
        actionLabel: "Abrir no CRM",
        onAction: () => abrirCrmAvancado(crmLeadId),
      });
    },
    [abrirCrmAvancado, showToast]
  );

  async function handleSubmit(e, etapa = null) {
    e?.preventDefault?.();
    if (!conversaId || loading || crmEnabled === false) return;
    setLoading(true);
    setSendingKey(etapa ? String(etapa.id ?? etapa.nome) : "__simple__");
    try {
      const body = {};
      if (observacoes.trim()) body.observacoes = observacoes.trim();
      if (etapa) {
        if (etapa.id != null) body.etapa_id = etapa.id;
        if (etapa.nome) body.etapa_nome = etapa.nome;
      }
      const { status, data } = await postLeadFromConversa(Number(conversaId), body);
      const dup = data?.from_conversa?.duplicate === true;
      // id interno do CRM (UUID) devolvido pelo sync — usado para abrir direto no lead.
      const crmLeadId = data?.lead?.id != null ? String(data.lead.id) : null;

      setModalOpen(false);
      setObservacoes("");

      if (status === 200 || status === 201) {
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        setSuccessFlash(true);
        successTimerRef.current = setTimeout(() => {
          setSuccessFlash(false);
          successTimerRef.current = null;
        }, 1400);
        const emEtapa = etapa?.nome ? ` na etapa “${etapa.nome}”` : "";
        showSuccessToast(
          status === 201 && !dup ? "Enviado ao CRM" : "CRM atualizado",
          status === 201 && !dup
            ? `O contato virou lead no CRM Avançado${emEtapa}.`
            : `O lead foi sincronizado com os dados desta conversa${emEtapa}.`,
          crmLeadId,
          status === 201 && !dup ? "success" : "info"
        );
        return;
      }

      if (status === 409) {
        showToast({
          type: "warning",
          title: "Lead já vinculado",
          message: data?.error || "Já existe um lead para esta conversa.",
          actionLabel: "Abrir no CRM",
          onAction: () => abrirCrmAvancado(crmLeadId),
        });
        return;
      }
    } catch (err) {
      showToast({
        type: "error",
        title: "Erro ao enviar ao CRM",
        message: getApiError(err),
      });
    } finally {
      setLoading(false);
      setSendingKey(null);
    }
  }

  if (isGroup || !conversaId || crmEnabled === false) {
    return null;
  }

  const modal =
    modalOpen &&
    createPortal(
      <div
        className="wa-modalOverlay"
        role="presentation"
        onMouseDown={() => {
          if (!loading) setModalOpen(false);
        }}
      >
        <div
          className="wa-modal wa-crmSendModal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wa-crmSend-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="wa-modal-head">
            <div className="wa-modal-title" id="wa-crmSend-title">
              Enviar ao CRM
            </div>
            <button
              type="button"
              className="wa-header-btn"
              onClick={() => !loading && setModalOpen(false)}
              disabled={loading}
              aria-label="Fechar"
              title="Fechar"
              style={{ width: 34, height: 34 }}
            >
              ✕
            </button>
          </div>
          <form className="wa-modal-body" onSubmit={(e) => handleSubmit(e, null)}>
            <p className="wa-crmSend-hint">
              O contato vira lead no CRM Avançado, com os dados do cliente (nome, telefone, e-mail e empresa) já preenchidos.
              Pode acrescentar uma nota para a equipa comercial.
            </p>
            <label className="wa-crmSend-label" htmlFor="wa-crmSend-obs">
              Nota para o comercial (opcional)
            </label>
            <textarea
              id="wa-crmSend-obs"
              className="wa-crmSend-textarea"
              rows={3}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Contexto, próximos passos, objeções…"
              disabled={loading}
            />

            {etapasLoading ? (
              <p className="wa-crmSend-etapasLoading">Carregando etapas do CRM…</p>
            ) : etapas.length > 0 ? (
              <>
                <div className="wa-crmSend-etapasLabel">Enviar para qual etapa?</div>
                <div className="wa-crmSend-etapas">
                  {etapas.map((etapa) => {
                    const key = String(etapa.id ?? etapa.nome);
                    const isSending = loading && sendingKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        className="wa-crmSend-etapaBtn"
                        onClick={(e) => handleSubmit(e, etapa)}
                        disabled={loading}
                        aria-busy={isSending}
                        title={`Enviar para "${etapa.nome}"`}
                        style={etapa.cor ? { "--wa-crmEtapa-color": etapa.cor } : undefined}
                      >
                        <span className="wa-crmSend-etapaBtn-dot" aria-hidden />
                        <span className="wa-crmSend-etapaBtn-nome">{etapa.nome}</span>
                        {isSending ? <IconSpinnerMini /> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="wa-modal-row wa-modal-row--actions" style={{ marginTop: 12 }}>
                  <button type="button" className="wa-btn-secondary" onClick={() => !loading && setModalOpen(false)} disabled={loading}>
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <div className="wa-modal-row wa-modal-row--actions" style={{ marginTop: 12 }}>
                <button type="button" className="wa-btn-secondary" onClick={() => !loading && setModalOpen(false)} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="wa-btn-primary" disabled={loading} aria-busy={loading}>
                  {loading ? "A enviar…" : "Confirmar envio"}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>,
      document.body
    );

  const headerBusy = loading;
  const iconEl = headerBusy ? <IconSpinnerMini /> : successFlash ? <IconCheckMini /> : <IconFunnelSend />;

  return (
    <>
      {!hideToolbarButton ? (
        <button
          type="button"
          className={`wa-header-btn wa-crmSendBtn zap-action-btn ${successFlash ? "wa-crmSendBtn--successPulse" : ""}`}
          onClick={openModal}
          disabled={!conversaId || headerBusy}
          title="Enviar conversa ao CRM"
          aria-label="Enviar conversa ao CRM"
          aria-busy={headerBusy}
        >
          <span className="wa-crmSendBtn-icon" aria-hidden>
            {iconEl}
          </span>
          <span className="wa-crmSendBtn-label">{headerBusy ? "A enviar…" : "Enviar ao CRM"}</span>
        </button>
      ) : null}
      {modal}
    </>
  );
});

export default SendToCrmChatButton;
