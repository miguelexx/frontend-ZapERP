import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, Undo2, UserCheck } from "lucide-react";
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
import { listarTags } from "../api/tagService";
import {
  getStatusAtendimentoEffective,
  isAguardandoClienteManual,
  isClosedAttendanceStatus,
  isCobrancaFinanceiraStatus,
  isConversaModoSimplesAtiva,
} from "../utils/conversaUtils";
import { isAtendenteSetorFinanceiro } from "../utils/financeiroSector";
import { viewerPodePuxarConversaNovamente } from "../conversa/utils/conversaAccessHelpers";
import {
  buildChatListFiltersScopeKey,
  getChatListFiltersDataCache,
  loadChatListFiltersDataOnce,
} from "../chats/chatListFiltersData";
import AguardarPagamentoModal from "./AguardarPagamentoModal";
import AguardarClienteModal from "./AguardarClienteModal";
import AguardandoClienteCountdown from "./AguardandoClienteCountdown";
import EncerrarSplitButton from "./EncerrarSplitButton";
import TransferirAtendimentoModal from "./TransferirAtendimentoModal";
import { useMenuKeyboard } from "./useMenuKeyboard";
import { useMobileOverlayBack } from "./useMobileOverlayBack";
import "./aguardarPagamento.css";

/** Erro de timeout/rede do axios (sem resposta do servidor). */
function isSemRespostaDoServidor(e) {
  if (e?.response) return false;
  const code = String(e?.code || "");
  const msg = String(e?.message || "");
  return code === "ECONNABORTED" || code === "ETIMEDOUT" || code === "ERR_NETWORK" || /timeout|network error/i.test(msg);
}

/*
 * Antes devolvia `e.message` cru: o atendente lia "timeout of 55000ms exceeded" ou
 * "Network Error" no toast. Timeout/rede agora têm texto em português que diz o que fazer.
 */
function getApiErrorMessage(e) {
  const api = e?.response?.data?.error;
  if (api) return api;
  if (isSemRespostaDoServidor(e)) {
    const code = String(e?.code || "");
    const msg = String(e?.message || "");
    return code === "ERR_NETWORK" || /network error/i.test(msg)
      ? "Sem conexão com o servidor. Verifique a internet e tente de novo."
      : "O servidor demorou a responder. A tela foi atualizada com o estado atual — confira antes de tentar de novo.";
  }
  return e?.message || "Erro na operação.";
}

/**
 * Timeout/rede sem resposta: a mensagem diz "A tela foi atualizada com o estado atual". As
 * ações otimistas já fazem esse refresh (runAcaoOtimista); as outras (transferir, aguardar,
 * retomar, puxar) também precisam, senão o texto mente — o servidor pode ter aplicado a ação.
 */
function refreshSeSemResposta(e) {
  if (!isSemRespostaDoServidor(e)) return;
  try {
    useConversaStore.getState().refresh?.({ silent: true });
  } catch {
    /* ignore */
  }
}

/** Erro que sobe para o modal aberto (linha role="alert" dentro dele), em vez do toast. */
function erroParaOModal(message) {
  const erro = new Error(message);
  erro.userMessage = message;
  return erro;
}

function getAguardandoClienteErrorMessage(e) {
  const st = e?.response?.status;
  const body = e?.response?.data;
  const raw = body?.error || body?.message || "";
  const t = String(raw || "").toLowerCase();
  if (st === 409) {
    if (t.includes("em_atendimento") || t.includes("em atendimento"))
      return "Só é possível a partir de uma conversa em atendimento, com você como responsável.";
    if (t.includes("aguardando") || t.includes("retomar"))
      return raw || "O estado da conversa mudou. Atualize e tente de novo.";
    return raw || "Esta ação não se aplica ao estado atual da conversa.";
  }
  return getApiErrorMessage(e);
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
  if (!import.meta.env.DEV) return;
  const metrics = getMessagesScrollMetrics();
  if (!metrics) {
    console.debug(`[scroll-debug] ${action}:${phase} sem-container`);
    return;
  }
  console.debug(`[scroll-debug] ${action}:${phase}`, metrics);
}

function IconDotsHorizontal() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function IconAtendTransfer() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

function IconAtendWait() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function IconAtendClose() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconAtendReopen() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13a7 7 0 1 0-9.89-9.89L6 7" />
      <path d="M6 3v4h4" />
    </svg>
  );
}

function IconPagamentoConcluido() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z" opacity="0.35" />
      <path d="M8.5 12.2 11 14.7l4.8-5.5" />
    </svg>
  );
}

function IconAtendOrcamento() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

/*
 * Ícone em TODA ação da barra (26/11/2026): Assumir, Puxar e Retomar eram só texto ao lado de
 * vizinhos com ícone de 16px. Mesmo traço (lucide, 1.9) e mesmo tamanho dos SVG da casa.
 */
function AtendimentoActionIcon({ id }) {
  switch (id) {
    case "assumir":
      return <UserCheck size={16} strokeWidth={1.9} aria-hidden="true" />;
    case "puxar_novamente":
      return <Undo2 size={16} strokeWidth={1.9} aria-hidden="true" />;
    case "retomar_atendimento":
      return <RotateCcw size={16} strokeWidth={1.9} aria-hidden="true" />;
    case "orcamento":
      return <IconAtendOrcamento />;
    case "transferir":
      return <IconAtendTransfer />;
    case "aguardar_cliente":
    case "aguardar_pagamento":
      return <IconAtendWait />;
    case "pagamento_concluido":
      return <IconPagamentoConcluido />;
    case "encerrar":
      return <IconAtendClose />;
    case "reabrir":
      return <IconAtendReopen />;
    default:
      return null;
  }
}

/** No menu ⋯ (mobile): ícone opcional por ação secundária */
function renderOverflowSheetIcon(id) {
  switch (id) {
    case "orcamento":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h4" />
        </svg>
      );
    case "aguardar_cliente":
      return <IconAtendWait />;
    case "retomar_atendimento":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-3.57-7.19" />
          <path d="M21 3v7h-7" />
        </svg>
      );
    case "pagamento_concluido":
      return <IconPagamentoConcluido />;
    case "reabrir":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13a7 7 0 1 0-9.89-9.89L6 7" />
          <path d="M6 3v4h4" />
        </svg>
      );
    default:
      // Toda ação no menu ⋯ leva ícone (antes "Aguardar pagamento" e "Puxar" vinham sem).
      return <AtendimentoActionIcon id={id} />;
  }
}

/** Mobile: estas ficam na barra; o resto vai para o menu ⋯. Reabrir entra na barra quando a conversa está finalizada. */
const MOBILE_TOOLBAR_PINNED_BASE = ["assumir", "transferir", "encerrar"];

/**
 * @param {object} props
 * @param {boolean} [props.compactToolbar] — mobile: ações de atendimento em fileira; menu "…" só para extras (overflowTop)
 * @param {(close: () => void) => import("react").ReactNode} [props.overflowTop] — itens extras no topo do menu (tags, histórico…)
 * @param {import("react").ReactNode} [props.prepend] — ex.: ícone de histórico à esquerda (só mobile / ConversaView)
 * @param {boolean} [props.splitCompactHeader] — mobile 2 linhas: ⋯ na linha 1, botões inline na linha 2 (grid do header)
 * @param {boolean} [props.showOrcamento] — Orçamento WM: gate de módulo+permissão+conversa já resolvido pelo cabeçalho (doc 36)
 * @param {() => void} [props.onOrcamento] — abre o drawer de orçamento da conversa atual
 * @param {(t: object) => void} [props.showToast] — toast DA CONVERSA (useConversationToast). Com
 *   ele, a confirmação de sucesso vira a pílula curta acima do composer (`variant: "snack"`) em
 *   vez do cartão que cobria o nome e o selo que acabaram de mudar. Sem ele, cai no toast global.
 */
export default function AtendimentoActions({
  compactToolbar = false,
  overflowTop,
  prepend,
  splitCompactHeader = false,
  showOrcamento = false,
  onOrcamento,
  showToast: showConversationToast,
}) {
  const user = useAuthStore((s) => s?.user) ?? null;

  const conversa = useConversaStore((s) => s?.conversa);
  const assumirConversa = useConversaStore((s) => s?.assumirConversa);
  const transferirConversa = useConversaStore((s) => s?.transferirConversa);
  const encerrarConversa = useConversaStore((s) => s?.encerrarConversa);
  const reabrirConversa = useConversaStore((s) => s?.reabrirConversa);
  const marcarAguardandoClienteConversa = useConversaStore((s) => s?.marcarAguardandoClienteConversa);
  const marcarAguardandoPagamentoConversa = useConversaStore((s) => s?.marcarAguardandoPagamentoConversa);
  const retomarAtendimentoConversa = useConversaStore((s) => s?.retomarAtendimentoConversa);
  const puxarConversaNovamente = useConversaStore((s) => s?.puxarConversaNovamente);
  const showGlobalToast = useNotificationStore((s) => s?.showToast);

  /*
   * Toasts das ações (26/11/2026). Antes nenhum passava `type`: o 409 "Erro ao assumir" saía
   * com o ícone azul de INFO, e o sucesso era um cartão no topo, por cima do cabeçalho que
   * acabara de mudar. Agora:
   *  - erro → `type: "error"` (vermelho), no toast global — sobrevive se a conversa fechar;
   *  - sucesso → `type: "success"`; com o toast da conversa disponível, pílula curta acima do
   *    composer (`variant: "snack"`), que não cobre o cabeçalho.
   */
  const showToast = useCallback(
    (payload) => {
      if (!payload) return;
      if (payload.type === "success" && typeof showConversationToast === "function") {
        // A pílula é UMA linha (max 420px, reticências): leva só o texto curto (`snack`).
        showConversationToast({ type: "success", variant: "snack", title: payload.snack || payload.title });
        return;
      }
      const { snack: _snack, ...card } = payload;
      showGlobalToast?.(card);
    },
    [showConversationToast, showGlobalToast]
  );

  const [departamentosLista, setDepartamentosLista] = useState(() => {
    const cached = getChatListFiltersDataCache();
    return Array.isArray(cached?.departamentos) ? cached.departamentos : [];
  });
  const [pagamentoModalOpen, setPagamentoModalOpen] = useState(false);
  const [clienteModalOpen, setClienteModalOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);
  const overflowTriggerRef = useRef(null);
  const overflowMenuRef = useRef(null);
  const actionsBarRef = useRef(null);
  const [overflowMenuPos, setOverflowMenuPos] = useState(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const { onMenuKeyDown } = useMenuKeyboard({
    open: menuOpen && Boolean(overflowMenuPos),
    menuRef: overflowMenuRef,
    triggerRef: overflowTriggerRef,
    onClose: closeMenu,
  });
  // Celular: o "voltar" fecha o menu ⋯, não a conversa (R4-05/A2-04).
  useMobileOverlayBack(menuOpen, closeMenu, "atendMore");

  /*
   * Plano B do foco ao fechar um modal (useDialogFocus): quem abriu pode ter sumido — o item do
   * menu ⋯ desmonta, e "Aguardar cliente" vira "Retomar" depois de confirmar. Aí o foco vai a
   * um alvo NEUTRO: o gatilho ⋯ (celular) ou o ⋯ do cabeçalho (desktop). R4-07: antes caía no
   * 1.º botão vivo da barra — que, depois de "Iniciar espera", é justamente "Retomar
   * atendimento": um Enter repetido desfazia a espera na hora. A barra só entra em último
   * caso, e nunca numa ação principal (preenchida), que muda o estado da conversa.
   */
  const modalReturnFocusRef = useMemo(
    () => ({
      get current() {
        const trigger = overflowTriggerRef.current;
        if (trigger && document.contains(trigger)) return trigger;
        const bar = actionsBarRef.current;
        const more = bar?.closest?.(".wa-header")?.querySelector?.(".wa-header-moreBtn");
        if (more && document.contains(more) && !more.disabled) return more;
        return bar?.querySelector?.("button:not([disabled]):not(.wa-btn-primary)") || null;
      },
    }),
    []
  );

  /** Lidos nos catch: com o modal aberto, o erro vai PARA DENTRO dele (R7-04) — o toast
      global (z 9999) nasce por baixo do véu desfocado dos modais (z 12000). */
  const transferOpenRef = useRef(false);
  const clienteModalOpenRef = useRef(false);
  const pagamentoModalOpenRef = useRef(false);

  /* Guarda síncrona de reentrância das ações otimistas (ver runAcaoOtimista). Fica ANTES do
     `return null` abaixo: hook depois de um retorno condicional quebra a ordem dos hooks. */
  const acoesOtimistasEmVooRef = useRef(null);
  if (acoesOtimistasEmVooRef.current === null) acoesOtimistasEmVooRef.current = new Set();

  const openTransfer = useCallback(() => {
    setTransferOpen(true);
    setMenuOpen(false);
  }, []);
  const closeTransfer = useCallback(() => setTransferOpen(false), []);
  transferOpenRef.current = transferOpen;
  clienteModalOpenRef.current = clienteModalOpen;
  pagamentoModalOpenRef.current = pagamentoModalOpen;

  useLayoutEffect(() => {
    if (!menuOpen || !overflowTriggerRef.current) {
      setOverflowMenuPos(null);
      return undefined;
    }
    /*
     * `scroll` em captura recebe também o scroll da thread de mensagens. Sem comparar o
     * resultado, cada frame de rolagem fazia setState e re-renderizava a barra de ações
     * inteira (com o portal do menu) — o scroll ficava a "arrastar" com o menu aberto.
     */
    let frame = 0;
    const updatePos = () => {
      const r = overflowTriggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const next = {
        top: Math.round(r.bottom + 6),
        right: Math.max(8, Math.round(window.innerWidth - r.right)),
      };
      setOverflowMenuPos((prev) =>
        prev && prev.top === next.top && prev.right === next.right ? prev : next
      );
    };
    const scheduleUpdatePos = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updatePos();
      });
    };
    updatePos();
    window.addEventListener("resize", scheduleUpdatePos);
    window.addEventListener("scroll", scheduleUpdatePos, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdatePos);
      window.removeEventListener("scroll", scheduleUpdatePos, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    // Rede de segurança: ESC com o foco FORA do menu (ex.: ainda no gatilho). Com o foco
    // dentro, o `onMenuKeyDown` trata primeiro e devolve o foco ao gatilho.
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      }
    };
    const onPointer = (e) => {
      const t = e.target;
      if (overflowTriggerRef.current?.contains(t)) return;
      if (overflowMenuRef.current?.contains(t)) return;
      closeMenu();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [menuOpen, closeMenu]);

  useEffect(() => {
    let alive = true;
    const cached = getChatListFiltersDataCache();
    if (Array.isArray(cached?.departamentos) && cached.departamentos.length > 0) {
      setDepartamentosLista(cached.departamentos);
      return () => {
        alive = false;
      };
    }
    const scope = buildChatListFiltersScopeKey(user);
    const loadDept = scope
      ? loadChatListFiltersDataOnce({ listarTags, api, scopeKey: scope }).then(() => getChatListFiltersDataCache()?.departamentos)
      : api.get("/dashboard/departamentos").then((r) => r.data);
    Promise.resolve(loadDept)
      .then((data) => {
        if (!alive) return;
        if (Array.isArray(data) && data.length > 0) setDepartamentosLista(data);
      })
      .catch(() => {
        if (!alive) return;
        api
          .get("/dashboard/departamentos")
          .then((r) => {
            if (alive && Array.isArray(r.data)) setDepartamentosLista(r.data);
          })
          .catch(() => {});
      });
    return () => {
      alive = false;
    };
  }, [user?.id, user?.company_id]);

  // Trocou de conversa: nenhum modal pode sobrar aberto apontando para a anterior.
  const conversaIdAtual = conversa?.id ?? null;
  useEffect(() => {
    setTransferOpen(false);
    setClienteModalOpen(false);
    setPagamentoModalOpen(false);
  }, [conversaIdAtual]);

  if (!conversa || !user) return null;

  const status = getStatusAtendimentoEffective(conversa);
  const meuId = user?.id;
  const userRole = String(user?.role || user?.perfil || "").toLowerCase();
  const isPrivileged = userRole === "admin" || userRole === "supervisor";

  const atendenteIdRaw = conversa?.atendente_id ?? null;
  const atendenteId =
    atendenteIdRaw === "" || atendenteIdRaw === undefined ? null : atendenteIdRaw;

  const hasAtendente = atendenteId !== null;
  const isMinha = hasAtendente && String(atendenteId) === String(meuId);

  // Inclui finalizada/finalizado: conversa encerrada em qualquer grafia não pode exibir
  // Assumir/Encerrar/Transferir — só "Reabrir" ou nova mensagem do cliente a reativam.
  const isFechada = isClosedAttendanceStatus(status);
  const isFila =
    status === "fila" ||
    status === "aberta" ||
    status === "pendente" ||
    status === "mensagem_disparada";
  const isAguardandoClienteManualStatus = isAguardandoClienteManual(conversa);
  const isCobrancaFinanceira = isCobrancaFinanceiraStatus(conversa);
  const atendenteFinanceiro = isAtendenteSetorFinanceiro(user, departamentosLista);
  const isEmAtendimento =
    status === "em_atendimento" || status === "em atendimento";
  const isEmAtendimentoOuAguardandoManual =
    isEmAtendimento || isAguardandoClienteManualStatus || isCobrancaFinanceira;

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

  const modoSimplesAtivo = isConversaModoSimplesAtiva(conversa, user);

  // Assumível = qualquer conversa ativa (não fechada) SEM atendente atribuído — não só a
  // fila. Espelha `conversaElegivelAutoAssumir` (auto-assumir ao enviar) e o backend
  // `executarAssumirConversa`, que aceitam assumir sem dono em qualquer estado ativo
  // (em_atendimento / aguardando_cliente / cobrança). Sem isto, uma conversa sem dono em
  // "aguardando cliente" ficava num beco sem saída: sem Assumir (não é fila), e sem
  // Encerrar/Transferir (não é sua). Ao assumir ela vira em_atendimento sua e os botões aparecem.
  const podeAssumir =
    !modoSimplesAtivo &&
    typeof canAssumir === "function" &&
    canAssumir(user) &&
    !isFechada &&
    !hasAtendente &&
    !conversa?.mensagens_bloqueadas &&
    (isFila || isEmAtendimentoOuAguardandoManual) &&
    mesmaSetorOuSemRestricao;

  // Modo simples não tem fila nem dono: transferir não faz sentido e só polui o topo.
  const podeTransferir =
    !modoSimplesAtivo &&
    typeof canTransferir === "function" &&
    canTransferir(user) &&
    !isFechada &&
    (isPrivileged
      ? isFila || isEmAtendimentoOuAguardandoManual || hasAtendente
      : hasAtendente && isMinha);

  const podeEncerrar =
    !modoSimplesAtivo &&
    typeof canEncerrar === "function" &&
    canEncerrar(user) &&
    !isFechada &&
    (isEmAtendimentoOuAguardandoManual || hasAtendente) &&
    (isPrivileged ? true : isMinha);

  const podeMarcarAguardandoCliente =
    !atendenteFinanceiro &&
    typeof canEncerrar === "function" &&
    canEncerrar(user) &&
    typeof marcarAguardandoClienteConversa === "function" &&
    !isFechada &&
    isEmAtendimento &&
    !isAguardandoClienteManualStatus &&
    hasAtendente &&
    (isPrivileged ? true : isMinha);

  const podeMarcarAguardandoPagamento =
    atendenteFinanceiro &&
    typeof canEncerrar === "function" &&
    canEncerrar(user) &&
    typeof marcarAguardandoPagamentoConversa === "function" &&
    !isFechada &&
    isEmAtendimento &&
    !isCobrancaFinanceira &&
    hasAtendente &&
    (isPrivileged ? true : isMinha);

  const podeRetomarAtendimento =
    typeof canEncerrar === "function" &&
    canEncerrar(user) &&
    typeof retomarAtendimentoConversa === "function" &&
    !isFechada &&
    isAguardandoClienteManualStatus &&
    !isCobrancaFinanceira &&
    hasAtendente &&
    (isPrivileged ? true : isMinha);

  const podeConfirmarPagamento =
    typeof canEncerrar === "function" &&
    canEncerrar(user) &&
    typeof retomarAtendimentoConversa === "function" &&
    !isFechada &&
    isCobrancaFinanceira &&
    hasAtendente &&
    (isPrivileged ? true : isMinha);

  const podeReabrir =
    typeof canReabrir === "function" && canReabrir(user) && isFechada;

  /*
   * Assumir / Encerrar / Reabrir são OTIMISTAS na store (`patchConversa` + `updateChat` antes
   * do await, `revert` no erro): a barra troca de botões em ~115 ms, sem esperar a rede.
   *
   * O `busy` TEM de continuar a travar a barra até a resposta chegar, e a razão não é a
   * duplicação do POST — é CLIQUE ATRAVESSADO. Como o botão que substitui o clicado nasce
   * no MESMO sítio (Encerrar → Reabrir), um duplo clique com a barra viva faz o 2.º clique
   * cair no Reabrir e desfazer silenciosamente o encerramento. Medido em 04/11/2026 ao
   * tentar exatamente este "polimento": com a barra destravada, `clickCount: 2` encerrava e
   * reabria a conversa num gesto só. A versão travada não tem esse buraco.
   *
   * O que muda aqui: o guard de reentrância passa a ser um REF, síncrono, em cima do `busy`.
   * O `if (busy) return` sozinho dependia do batching do React 18 para fechar a janela entre
   * o clique e o re-render — fechava na prática, não por contrato. O ref fecha por contrato.
   *
   * O que faltava ao estado travado era LEGIBILIDADE: a barra ficava a 45% sem nada a dizer
   * que estava a processar. Resolvido com `aria-busy` + `cursor: progress` na barra (ver
   * `conversa.polish.css`), não removendo a trava.
   */
  async function runAcaoOtimista(id, fn, tituloErro) {
    if (busy || acoesOtimistasEmVooRef.current.has(id)) return;
    acoesOtimistasEmVooRef.current.add(id);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      console.error(`${tituloErro}:`, e);
      showToast({ type: "error", title: tituloErro, message: getApiErrorMessage(e) });
      /* Sem resposta não quer dizer que falhou: o servidor pode ter encerrado/assumido e só a
         resposta se perdeu. O store reverteu o otimista às cegas; um refresh silencioso traz
         o estado real em vez de deixar a tela a mentir. */
      if (isSemRespostaDoServidor(e)) {
        try {
          useConversaStore.getState().refresh?.({ silent: true });
        } catch {
          /* ignore */
        }
      }
    } finally {
      acoesOtimistasEmVooRef.current.delete(id);
      setBusy(false);
    }
  }

  // "Puxar conversa novamente": voltar a atender junto (co-atendente) uma conversa
  // que você transferiu, ou — para supervisor/admin — uma assumida por outro.
  const podePuxarNovamente =
    typeof puxarConversaNovamente === "function" &&
    !modoSimplesAtivo &&
    viewerPodePuxarConversaNovamente(conversa, user);

  async function handlePuxarNovamente() {
    if (busy) return;
    setBusy(true);
    try {
      if (typeof puxarConversaNovamente === "function") {
        await puxarConversaNovamente(conversa.id);
        showToast({
          type: "success",
          title: "Você voltou a atender",
          message: "Agora você atende esta conversa junto com o atendente atual.",
          snack: "Você voltou a atender esta conversa",
        });
      }
    } catch (e) {
      console.error("Erro ao puxar conversa novamente:", e);
      refreshSeSemResposta(e);
      showToast({ type: "error", title: "Não foi possível puxar a conversa", message: getApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleAssumir() {
    await runAcaoOtimista("assumir", async () => {
      if (typeof assumirConversa !== "function") return;
      logActionScroll("assumir", "antes");
      await assumirConversa(conversa.id);
      logActionScroll("assumir", "depois");
      // Sem toast de sucesso: o badge "Em atendimento" já confirma.
      // No mobile o aviso cobre header e thread.
    }, "Erro ao assumir");
  }

  /**
   * @param {boolean} [enviarMensagem] — escolha da seta do botão: true = com mensagem de
   * finalização, false = sem. Qualquer outra coisa (inclusive o evento do clique direto no
   * botão) = padrão da empresa, exatamente como sempre foi.
   */
  async function handleEncerrar(enviarMensagem) {
    const escolha = typeof enviarMensagem === "boolean" ? enviarMensagem : undefined;
    await runAcaoOtimista("encerrar", async () => {
      if (typeof encerrarConversa !== "function") return;
      logActionScroll("encerrar", "antes");
      await encerrarConversa(
        conversa.id,
        escolha === undefined ? undefined : { enviarMensagemFinalizacao: escolha }
      );
      logActionScroll("encerrar", "depois");
      // Sem toast de sucesso: o painel de encerrado já confirma. Toast cobria o header no mobile.
    }, "Erro ao encerrar");
  }

  async function handleReabrir() {
    await runAcaoOtimista("reabrir", async () => {
      if (typeof reabrirConversa !== "function") return;
      logActionScroll("reabrir", "antes");
      await reabrirConversa(conversa.id);
      logActionScroll("reabrir", "depois");
      showToast({
        type: "success",
        title: "Conversa reaberta",
        message: "Atendimento disponível novamente.",
        snack: "Conversa reaberta",
      });
    }, "Erro ao reabrir");
  }

  async function handleConfirmarAguardarPagamento({ prazo, data }) {
    if (busy) return;
    setBusy(true);
    try {
      if (typeof marcarAguardandoPagamentoConversa === "function") {
        await marcarAguardandoPagamentoConversa(conversa.id, { prazo, data });
        setPagamentoModalOpen(false);
        showToast({
          type: "success",
          title: "Pagamento pendente",
          message: "A cobrança está aguardando pagamento dentro do prazo definido.",
          snack: "Aguardando pagamento · prazo definido",
        });
      }
    } catch (e) {
      console.error("Erro ao marcar aguardando pagamento:", e);
      refreshSeSemResposta(e);
      const message = getAguardandoClienteErrorMessage(e);
      // Modal aberto: o erro aparece dentro dele (o toast ficaria por baixo do véu). Fechado
      // (voltar do celular durante o envio): cai no toast de sempre.
      if (pagamentoModalOpenRef.current) throw erroParaOModal(message);
      showToast({ type: "error", title: "Não foi possível atualizar", message });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmarAguardarCliente({ prazo, data }) {
    if (busy) return;
    setBusy(true);
    try {
      if (typeof marcarAguardandoClienteConversa === "function") {
        await marcarAguardandoClienteConversa(conversa.id, { prazo, data });
        setClienteModalOpen(false);
        showToast({
          type: "success",
          title: "Aguardando cliente",
          message: "Alarme iniciado. Avisamos e sinalizamos a conversa quando o prazo vencer.",
          snack: "Aguardando cliente · alarme iniciado",
        });
      }
    } catch (e) {
      console.error("Erro ao marcar aguardando cliente:", e);
      refreshSeSemResposta(e);
      const message = getAguardandoClienteErrorMessage(e);
      if (clienteModalOpenRef.current) throw erroParaOModal(message);
      showToast({ type: "error", title: "Não foi possível atualizar", message });
    } finally {
      setBusy(false);
    }
  }

  async function handleRetomarAtendimento() {
    if (busy) return;
    setBusy(true);
    try {
      if (typeof retomarAtendimentoConversa === "function") {
        await retomarAtendimentoConversa(conversa.id);
        showToast({
          type: "success",
          title: "Atendimento retomado",
          message: "A conversa voltou para em atendimento.",
          snack: "Atendimento retomado",
        });
      }
    } catch (e) {
      console.error("Erro ao retomar atendimento:", e);
      refreshSeSemResposta(e);
      showToast({
        type: "error",
        title: "Não foi possível retomar",
        message: getAguardandoClienteErrorMessage(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmarPagamento() {
    if (busy) return;
    setBusy(true);
    try {
      if (typeof retomarAtendimentoConversa === "function") {
        await retomarAtendimentoConversa(conversa.id);
        showToast({
          type: "success",
          title: "Pagamento confirmado",
          message: "O pagamento foi registrado e o atendimento foi retomado.",
          snack: "Pagamento confirmado · atendimento retomado",
        });
      }
    } catch (e) {
      console.error("Erro ao confirmar pagamento:", e);
      refreshSeSemResposta(e);
      showToast({
        type: "error",
        title: "Não foi possível confirmar",
        message: getAguardandoClienteErrorMessage(e),
      });
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
        const paraMim = String(id) === String(meuId);
        showToast({
          type: "success",
          title: "Atendimento transferido",
          message: paraMim
            ? modoSimplesAtivo
              ? "A conversa foi atribuída a você."
              : "A conversa foi atribuída a você. Use Encerrar ou Transferir quando precisar."
            : "A conversa foi atribuída ao atendente selecionado.",
          snack: paraMim ? "Conversa atribuída a você" : "Atendimento transferido",
        });
      }
    } catch (e) {
      console.error("Erro ao transferir conversa:", e);
      refreshSeSemResposta(e);
      const message = getApiErrorMessage(e);
      /*
       * R7-04: o modal continua aberto no erro, e o toast global (z 9999) nascia POR BAIXO do
       * véu desfocado dele (z 12000) — o atendente não via nada e clicava de novo. Com o modal
       * aberto, o erro sobe para ele (linha role="alert" acima da lista). Fechado (voltar do
       * celular, troca de conversa), cai no toast de sempre.
       */
      if (transferOpenRef.current) throw erroParaOModal(message);
      showToast({ type: "error", title: "Erro ao transferir", message });
    } finally {
      setBusy(false);
    }
  }

  const actions = [];
  if (podeAssumir) {
    actions.push({
      id: "assumir",
      className: `wa-btn-primary ${!hasAtendente ? "wa-btn-assumir-destaque" : ""}`,
      labelLong: "Assumir",
      labelShort: "Assum.",
      onClick: handleAssumir,
      title: !hasAtendente ? "Clique para assumir e enviar mensagens" : "Assumir atendimento",
      ariaLabel: "Assumir atendimento",
    });
  }
  if (podePuxarNovamente) {
    actions.push({
      id: "puxar_novamente",
      className: "wa-btn-primary wa-btn-assumir-destaque",
      labelLong: "Puxar conversa",
      labelMid: "Puxar",
      labelShort: "Puxar",
      onClick: handlePuxarNovamente,
      title: "Voltar a atender esta conversa junto com o atendente atual",
      ariaLabel: "Puxar conversa novamente",
    });
  }
  if (podeConfirmarPagamento) {
    actions.push({
      id: "pagamento_concluido",
      className: "wa-btn-pagamento-concluido",
      labelLong: "Pagamento concluído",
      labelShort: "Pago",
      onClick: handleConfirmarPagamento,
      title: "Confirmar pagamento recebido e retomar atendimento",
      ariaLabel: "Pagamento concluído",
    });
  }
  if (podeRetomarAtendimento) {
    actions.push({
      id: "retomar_atendimento",
      className: "wa-btn-primary",
      labelLong: "Retomar atendimento",
      labelMid: "Retomar",
      labelShort: "Retomar",
      onClick: handleRetomarAtendimento,
      title: "Voltar para em atendimento",
      ariaLabel: "Retomar atendimento",
    });
  }
  // Orçamento WM: botão de verdade na barra (antes era um item discreto no ⋯ do cabeçalho). O
  // gate (módulo + permissão + conversa individual) já vem resolvido em `showOrcamento`, então
  // aparece em qualquer estado do atendimento — igual ao gatilho antigo. Em mobile compact não é
  // "pinned", logo cai no menu ⋯ automaticamente.
  if (showOrcamento && typeof onOrcamento === "function") {
    actions.push({
      id: "orcamento",
      className: "wa-btn-orcamento",
      labelLong: "Orçamento",
      labelShort: "Orçam.",
      onClick: onOrcamento,
      title: "Criar um orçamento para este cliente",
      ariaLabel: "Criar orçamento",
    });
  }
  if (podeTransferir) {
    actions.push({
      id: "transferir",
      className: "wa-btn-transferir",
      labelLong: "Transferir",
      labelShort: "Transf.",
      onClick: openTransfer,
      title: "Transferir atendimento",
      ariaLabel: "Transferir atendimento",
    });
  }
  if (podeMarcarAguardandoPagamento) {
    actions.push({
      id: "aguardar_pagamento",
      className: "wa-btn-aguardar-pagamento",
      labelLong: "Aguardar pagamento",
      labelMid: "Aguardar",
      labelShort: "Pagam.",
      onClick: () => setPagamentoModalOpen(true),
      title: "Marcar cobrança enviada e definir prazo de pagamento",
      ariaLabel: "Aguardar pagamento",
    });
  }
  if (podeMarcarAguardandoCliente) {
    actions.push({
      id: "aguardar_cliente",
      className: "wa-btn-aguardar-cliente",
      labelLong: "Aguardar cliente",
      labelMid: "Aguardar",
      labelShort: "Aguard.",
      onClick: () => setClienteModalOpen(true),
      title: "Definir alarme de espera pela resposta do cliente",
      ariaLabel: "Marcar como aguardando cliente",
    });
  }
  if (podeEncerrar) {
    actions.push({
      id: "encerrar",
      className: "wa-btn-danger",
      labelLong: "Encerrar",
      labelShort: "Encerr.",
      onClick: handleEncerrar,
      title: "Encerrar conversa",
      ariaLabel: "Encerrar conversa",
    });
  }
  if (podeReabrir) {
    actions.push({
      id: "reabrir",
      className: "wa-btn-primary wa-btn-assumir-destaque",
      labelLong: "Reabrir atendimento",
      labelMid: "Reabrir",
      labelShort: "Reabrir",
      onClick: handleReabrir,
      title: "Reabrir conversa",
      ariaLabel: "Reabrir conversa",
    });
  }

  const mobileToolbarPinned = new Set(MOBILE_TOOLBAR_PINNED_BASE);
  if (podeReabrir) mobileToolbarPinned.add("reabrir");

  const overflowExtra = typeof overflowTop === "function" ? overflowTop(closeMenu) : null;
  const compactOverflowActions = compactToolbar
    ? actions.filter((a) => !mobileToolbarPinned.has(a.id))
    : [];
  const compactInlineActions = compactToolbar
    ? actions.filter((a) => mobileToolbarPinned.has(a.id))
    : actions;
  /** Mobile: barra com Assumir / Transferir / Encerrar (+ Reabrir se finalizada); demais no ⋯ + extras. */
  const showCompactOverflowMenu =
    compactToolbar && (Boolean(overflowExtra) || compactOverflowActions.length > 0);

  const transferModal = (
    <TransferirAtendimentoModal
      open={transferOpen}
      busy={busy}
      meuId={meuId}
      atendenteAtualId={atendenteId}
      companyKey={user?.company_id ?? null}
      onClose={closeTransfer}
      onTransfer={handleTransferir}
      returnFocusRef={modalReturnFocusRef}
    />
  );

  function renderToolbarButton(a) {
    const icon = <AtendimentoActionIcon id={a.id} />;
    const reabrirHero = compactToolbar && a.id === "reabrir";
    const assumirHero = compactToolbar && a.id === "assumir";
    // Encerrar ganha uma seta discreta (com/sem mensagem de finalização). O botão em si é o
    // mesmo de sempre — mesmas classes, mesmo clique — só com um espaçador no fim onde a seta
    // se apoia. Grupos nunca chegam aqui (podeEncerrar já exclui).
    const isEncerrarSplit = a.id === "encerrar";
    const button = (
      <button
        key={a.id}
        type="button"
        className={`${a.className}${reabrirHero ? " wa-atendBtn--assumir-hero wa-atendBtn--reabrir-hero" : ""}${assumirHero ? " wa-atendBtn--assumir-hero" : ""}${isEncerrarSplit ? " wa-encerrarSplit-main" : ""} zap-action-btn`.trim()}
        onClick={a.onClick}
        disabled={busy}
        title={a.title}
        aria-label={a.ariaLabel}
      >
        {icon ? (
          <span className="wa-atendBtn-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className={`wa-atendLabel--long${a.labelMid ? " wa-atendLabel--hasMid" : ""}`}>{a.labelLong}</span>
        {/* Rótulo médio, sem abreviação: só no desktop apertado (conversaHeaderPremium.css). */}
        {a.labelMid ? <span className="wa-atendLabel--mid">{a.labelMid}</span> : null}
        <span className="wa-atendLabel--short">{a.labelShort}</span>
        {isEncerrarSplit ? <span className="wa-encerrarSplit-spacer" aria-hidden="true" /> : null}
      </button>
    );
    if (!isEncerrarSplit) return button;
    return (
      <EncerrarSplitButton
        key={a.id}
        mainButton={button}
        busy={busy}
        onChoose={(enviar) => handleEncerrar(enviar)}
        companyKey={user?.company_id ?? null}
        conversaId={conversa?.id ?? null}
      />
    );
  }

  if (!compactToolbar && actions.length === 0) {
    return transferModal;
  }

  if (compactToolbar && actions.length === 0 && typeof overflowTop !== "function") {
    return transferModal;
  }

  const pagamentoModal = (
    <>
      <AguardarPagamentoModal
        open={pagamentoModalOpen}
        busy={busy}
        onClose={() => setPagamentoModalOpen(false)}
        onConfirm={handleConfirmarAguardarPagamento}
        returnFocusRef={modalReturnFocusRef}
      />
      <AguardarClienteModal
        open={clienteModalOpen}
        busy={busy}
        onClose={() => setClienteModalOpen(false)}
        onConfirm={handleConfirmarAguardarCliente}
        returnFocusRef={modalReturnFocusRef}
      />
    </>
  );

  if (!compactToolbar) {
    return (
      <>
        {/* `aria-busy`: a barra fica travada (e a 45%) enquanto a ação viaja à rede. Sem isto
            o estado lia-se como "morto" em vez de "a processar" — o CSS pendura aqui o
            `cursor: progress`, e o leitor de ecrã anuncia a região como ocupada. */}
        <div className="wa-actions" ref={actionsBarRef} aria-busy={busy ? "true" : undefined}>
          <AguardandoClienteCountdown conversa={conversa} />
          {actions.map((a) => renderToolbarButton(a))}
        </div>
        {transferModal}
        {pagamentoModal}
      </>
    );
  }

  const overflowMenuButton = showCompactOverflowMenu ? (
    <div
      className={`wa-atendToolbar-overflowWrap${splitCompactHeader ? " wa-atendToolbar-overflowWrap--headerRow1" : ""}`}
      ref={splitCompactHeader ? menuWrapRef : undefined}
    >
      <button
        ref={overflowTriggerRef}
        type="button"
        className="wa-header-btn wa-header-btn--micro wa-atendToolbar-overflowTrigger"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label="Mais opções"
        title="Mais opções"
        onClick={() => setMenuOpen((v) => !v)}
        onKeyDown={(e) => {
          // ↓ no gatilho abre o menu (o foco entra no 1.º item via useMenuKeyboard).
          if (e.key === "ArrowDown" && !menuOpen) {
            e.preventDefault();
            setMenuOpen(true);
          }
        }}
      >
        <IconDotsHorizontal />
      </button>

      {menuOpen && overflowMenuPos && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="wa-atendToolbar-backdrop wa-atendToolbar-backdrop--portal"
                aria-hidden="true"
                onClick={closeMenu}
              />
              <div
                ref={overflowMenuRef}
                className="wa-atendToolbar-dropdown wa-atendToolbar-dropdown--portal"
                role="menu"
                aria-label="Mais opções"
                onKeyDown={onMenuKeyDown}
                style={{
                  top: overflowMenuPos.top,
                  right: overflowMenuPos.right,
                }}
              >
                <div className="wa-atendToolbar-menuExtras" role="none">
                  {overflowExtra}
                  {compactOverflowActions.length > 0 && overflowExtra ? (
                    <div className="wa-atendToolbar-menuSep" role="separator" />
                  ) : null}
                  {compactOverflowActions.map((a) => {
                    const sheetIcon = renderOverflowSheetIcon(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="menuitem"
                        className="wa-atendToolbar-sheetBtn"
                        onClick={() => {
                          a.onClick?.();
                          closeMenu();
                        }}
                        disabled={busy}
                        title={a.title}
                        aria-label={a.ariaLabel}
                      >
                        {sheetIcon ? (
                          <span className="wa-atendToolbar-sheetIcon" aria-hidden="true">
                            {sheetIcon}
                          </span>
                        ) : null}
                        <span className="wa-atendToolbar-sheetLabel">{a.labelLong}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  ) : null;

  const primaryRow = (
    // `aria-busy` só: é a mesma informação que a barra do desktop dá, e não muda um pixel
    // no telemóvel (a pele de lá não lê este atributo).
    <div
      aria-busy={busy ? "true" : undefined}
      className={`wa-atendToolbar-primaryRow${splitCompactHeader ? " wa-atendToolbar-primaryRow--headerRow2" : ""}`}
    >
      <AguardandoClienteCountdown conversa={conversa} />
      {compactInlineActions.map((a) => renderToolbarButton(a))}
    </div>
  );

  if (splitCompactHeader) {
    return (
      <>
        <div className="wa-atendToolbar wa-atendToolbar--compact wa-atendToolbar--splitHeader">
          {prepend ? <div className="wa-atendToolbar-prepend">{prepend}</div> : null}
          {overflowMenuButton}
          {primaryRow}
        </div>
        {transferModal}
        {pagamentoModal}
      </>
    );
  }

  return (
    <>
      <div className="wa-atendToolbar wa-atendToolbar--compact" ref={menuWrapRef}>
        {prepend ? <div className="wa-atendToolbar-prepend">{prepend}</div> : null}
        {primaryRow}
        {overflowMenuButton}
      </div>
      {transferModal}
      {pagamentoModal}
    </>
  );
}
