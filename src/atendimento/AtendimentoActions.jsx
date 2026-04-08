import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "../auth/authStore";
import { useConversaStore } from "../conversa/conversaStore";
import { useNotificationStore } from "../notifications/notificationStore";
import {
  canAssumir,
  canTransferir,
  canEncerrar,
  canReabrir,
} from "../auth/permissions";
import api from "../api/http";

function getApiErrorMessage(e) {
  return e?.response?.data?.error || e?.message || "Erro na operação.";
}

function getMessagesScrollMetrics() {
  if (typeof document === "undefined") return null;
  const container = document.querySelector(".wa-messages");
  if (!container) return null;
  return {
    scrollTop: Number(container.scrollTop || 0),
    scrollHeight: Number(container.scrollHeight || 0),
    clientHeight: Number(container.clientHeight || 0),
  };
}

function logActionScroll(action, phase) {
  const metrics = getMessagesScrollMetrics();
  if (!metrics) {
    console.debug(`[scroll-debug] ${action}:${phase} sem-container`);
    return;
  }
  console.debug(`[scroll-debug] ${action}:${phase}`, metrics);
}

export default function AtendimentoActions() {
  // ✅ Zustand: funciona com store inteiro OU selector
  const userFromSelector = useAuthStore((s) => s?.user);
  const stateAuth = useAuthStore((s) => s); // fallback
  const user = userFromSelector ?? stateAuth?.user ?? null;

  // ✅ Zustand conversa: idem
  const conversa = useConversaStore((s) => s?.conversa);
  const assumirConversa = useConversaStore((s) => s?.assumirConversa);
  const transferirConversa = useConversaStore((s) => s?.transferirConversa);
  const encerrarConversa = useConversaStore((s) => s?.encerrarConversa);
  const reabrirConversa = useConversaStore((s) => s?.reabrirConversa);
  const showToast = useNotificationStore((s) => s?.showToast);

  const [transferOpen, setTransferOpen] = useState(false);
  const [atendentes, setAtendentes] = useState([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  // ✅ se não tem conversa selecionada ou não tem user logado, não renderiza nada (sem erro)
  if (!conversa || !user) return null;

  // ===== NORMALIZAÇÕES =====
  const status = String(conversa?.status_atendimento || "").toLowerCase();
  const meuId = user?.id;
  const userRole = String(user?.role || user?.perfil || "").toLowerCase();
  const isPrivileged = userRole === "admin" || userRole === "supervisor";

  const atendenteIdRaw = conversa?.atendente_id ?? null;
  const atendenteId =
    atendenteIdRaw === "" || atendenteIdRaw === undefined ? null : atendenteIdRaw;

  const hasAtendente = atendenteId !== null;
  const isMinha = hasAtendente && String(atendenteId) === String(meuId);

  const isFechada = status === "fechada" || status === "encerrada";
  const isFila =
    status === "fila" || status === "aberta" || status === "pendente";
  const isEmAtendimento =
    status === "em_atendimento" || status === "em atendimento";

  // Validação de setor: conversa com setor só pode ser assumida por usuário do mesmo setor (admin ignora)
  const convDepId = conversa?.departamento_id ?? null;
  const userDepIds = Array.isArray(user?.departamento_ids)
    ? user.departamento_ids.map((id) => Number(id))
    : user?.departamento_id != null
      ? [Number(user.departamento_id)]
      : [];
  const mesmaSetorOuSemRestricao =
    isPrivileged ||
    convDepId == null ||
    (userDepIds.length > 0 && userDepIds.includes(Number(convDepId)));

  // ✅ REGRAS: conversa aberta = sem responsável (apenas setor); só mostra Assumir quando em fila e disponível
  const podeAssumir =
    typeof canAssumir === "function" &&
    canAssumir(user) &&
    !isFechada &&
    isFila &&
    !hasAtendente &&
    mesmaSetorOuSemRestricao;

  const podeTransferir =
    typeof canTransferir === "function" &&
    canTransferir(user) &&
    !isFechada &&
    (isPrivileged ? (isFila || isEmAtendimento || hasAtendente) : (hasAtendente && isMinha));

  const podeEncerrar =
    typeof canEncerrar === "function" &&
    canEncerrar(user) &&
    !isFechada &&
    (isEmAtendimento || hasAtendente) &&
    (isPrivileged ? true : isMinha);

  const podeReabrir =
    typeof canReabrir === "function" && canReabrir(user) && isFechada;

  // ========================================
  // CARREGA ATENDENTES (somente quando abre)
  // ========================================
  useEffect(() => {
    if (!transferOpen) return;

    let alive = true;

    async function load() {
      try {
        const { data } = await api.get("/usuarios");
        if (!alive) return;
        setAtendentes(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!alive) return;
        setAtendentes([]);
        console.error("Erro ao carregar /usuarios:", e);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [transferOpen]);

  // ========================================
  // AÇÕES (com proteção de concorrência)
  // ========================================
  async function handleAssumir() {
    if (busy) return;
    logActionScroll("assumir", "antes");
    setBusy(true);
    try {
      if (typeof assumirConversa === "function") {
        await assumirConversa(conversa.id);
        logActionScroll("assumir", "depois");
        if (showToast) showToast({ title: "Conversa assumida", message: "Você está atendendo esta conversa." });
      }
    } catch (e) {
      console.error("Erro ao assumir conversa:", e);
      if (showToast) showToast({ title: "Erro ao assumir", message: getApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleEncerrar() {
    if (busy) return;
    logActionScroll("encerrar", "antes");
    setBusy(true);
    try {
      if (typeof encerrarConversa === "function") {
        await encerrarConversa(conversa.id);
        logActionScroll("encerrar", "depois");
        if (showToast) showToast({ title: "Conversa encerrada", message: "Você pode reabrir quando precisar." });
      }
    } catch (e) {
      console.error("Erro ao encerrar conversa:", e);
      if (showToast) showToast({ title: "Erro ao encerrar", message: getApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleReabrir() {
    if (busy) return;
    logActionScroll("reabrir", "antes");
    setBusy(true);
    try {
      if (typeof reabrirConversa === "function") {
        await reabrirConversa(conversa.id);
        logActionScroll("reabrir", "depois");
        if (showToast) showToast({ title: "Conversa reaberta", message: "Atendimento disponível novamente." });
      }
    } catch (e) {
      console.error("Erro ao reabrir conversa:", e);
      if (showToast) showToast({ title: "Erro ao reabrir", message: getApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleTransferir(id) {
    if (busy) return;
    setBusy(true);
    try {
      if (typeof transferirConversa === "function") {
        await transferirConversa(conversa.id, id);
        setTransferOpen(false);
        setSearch("");
        const paraMim = String(id) === String(meuId);
        if (showToast) {
          showToast({
            title: "Atendimento transferido",
            message: paraMim
              ? "A conversa foi atribuída a você. Use Encerrar ou Transferir quando precisar."
              : "A conversa foi atribuída ao atendente selecionado.",
          });
        }
      }
    } catch (e) {
      console.error("Erro ao transferir conversa:", e);
      if (showToast) showToast({ title: "Erro ao transferir", message: getApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const filtrados = useMemo(() => {
    const term = String(search || "").toLowerCase();
    return (atendentes || []).filter((a) =>
      String(a?.nome || "").toLowerCase().includes(term)
    );
  }, [atendentes, search]);

  // ========================================
  // UI
  // ========================================
  return (
    <>
      {/* Sequência profissional (CRM): Assumir → Transferir → Encerrar → Reabrir */}
      {podeAssumir && (
        <button
          type="button"
          className={`wa-btn-primary ${!hasAtendente ? "wa-btn-assumir-destaque" : ""}`}
          onClick={handleAssumir}
          disabled={busy}
          title={!hasAtendente ? "Clique para assumir e enviar mensagens" : "Assumir atendimento"}
          aria-label="Assumir atendimento"
        >
          <span className="wa-atendLabel--long">Assumir</span>
          <span className="wa-atendLabel--short">Assum.</span>
        </button>
      )}

      {podeTransferir && (
        <button
          type="button"
          className="wa-btn-transferir"
          onClick={() => setTransferOpen(true)}
          disabled={busy}
          title="Transferir atendimento"
          aria-label="Transferir atendimento"
        >
          <span className="wa-atendLabel--long">Transferir</span>
          <span className="wa-atendLabel--short">Transf.</span>
        </button>
      )}

      {podeEncerrar && (
        <button
          type="button"
          className="wa-btn-danger"
          onClick={handleEncerrar}
          disabled={busy}
          title="Encerrar conversa"
          aria-label="Encerrar conversa"
        >
          <span className="wa-atendLabel--long">Encerrar</span>
          <span className="wa-atendLabel--short">Encerr.</span>
        </button>
      )}

      {podeReabrir && (
        <button
          type="button"
          className="wa-btn-secondary"
          onClick={handleReabrir}
          disabled={busy}
          title="Reabrir conversa"
          aria-label="Reabrir conversa"
        >
          <span className="wa-atendLabel--long">Reabrir</span>
          <span className="wa-atendLabel--short">Reabr.</span>
        </button>
      )}

      {/* MODAL DE TRANSFERÊNCIA */}
      {transferOpen
        ? createPortal(
            <div
              className="wa-modalOverlay"
              role="dialog"
              aria-label="Transferir atendimento"
              onMouseDown={() => {
                if (busy) return;
                setTransferOpen(false);
                setSearch("");
              }}
            >
              <div className="wa-modal wa-transferModal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="wa-modal-head">
                  <div className="wa-modal-title">Transferir atendimento</div>
                  <button
                    type="button"
                    className="wa-header-btn"
                    onClick={() => {
                      if (busy) return;
                      setTransferOpen(false);
                      setSearch("");
                    }}
                    aria-label="Fechar"
                    title="Fechar"
                    style={{ width: 34, height: 34 }}
                  >
                    ✕
                  </button>
                </div>

                <div className="wa-modal-body">
                  <input
                    className="wa-transferSearch"
                    placeholder="Buscar atendente..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                  />

                  <div className="wa-transferList" role="list">
                    {filtrados.map((a) => {
                      const souEu = String(a?.id) === String(meuId);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          className={`wa-transferItem ${souEu ? "isMe" : ""}`}
                          onClick={() => handleTransferir(a.id)}
                          disabled={busy}
                          role="listitem"
                          title={a?.nome || ""}
                        >
                          <span className="wa-transferName">{a.nome}</span>
                          {souEu ? <span className="wa-transferBadge">você</span> : null}
                        </button>
                      );
                    })}

                    {filtrados.length === 0 ? (
                      <div className="wa-transferEmpty">Nenhum atendente encontrado</div>
                    ) : null}
                  </div>

                  <div className="wa-transferFooter">
                    <button
                      type="button"
                      className="wa-btn-secondary"
                      onClick={() => {
                        if (busy) return;
                        setTransferOpen(false);
                        setSearch("");
                      }}
                      disabled={busy}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
