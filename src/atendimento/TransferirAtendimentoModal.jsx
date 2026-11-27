import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, ArrowRightLeft, Search, X } from "lucide-react";
import api from "../api/http";
import { initials, normalizarBusca, perfilLabel } from "./atendentesRegras";
import { getAvatarColor } from "../utils/avatarColor";
import { isPonteiroFino, useDialogFocus } from "./useDialogFocus";
import { useMobileOverlayBack } from "./useMobileOverlayBack";
import "./aguardarPagamento.css";
import "./transferirModal.css";

/*
 * Transferir atendimento (refeito em 26/11/2026). Era a superfície menos acabada da barra:
 *
 *  - "Nenhum atendente encontrado" DURANTE o carregamento e também num 500 (estado vazio
 *    falso). Agora: esqueleto → lista | erro com "Tentar de novo".
 *  - Lista em cache por empresa: reabrir é instantâneo e a rede só atualiza por trás.
 *  - O responsável atual aparece marcado e desabilitado (transferir para ele não muda nada).
 *    "Você" continua clicável: para admin/supervisor puxar para si é legítimo.
 *  - Teclado: ↓ entra na lista, ↑/↓/Home/End circulam, Enter com UM resultado transfere,
 *    Esc limpa a busca e depois fecha — em CAPTURA e com preventDefault, senão o ESC global
 *    (useGlobalHotkeys) fechava a conversa inteira junto com o modal.
 *  - Foco preso no diálogo e devolvido ao botão "Transferir" ao fechar.
 *  - Busca só ganha foco com ponteiro fino (no celular o teclado cobria a lista).
 *  - Spinner na linha clicada em vez de esmaecer a lista inteira.
 *
 * Contrato com o AtendimentoActions: `onTransfer(id)` faz o POST e fecha; o GET da conversa
 * segue em 2.º plano (doc 14, "Ações do cabeçalho"). Se o POST falhar com o modal aberto, a
 * promessa REJEITA com `userMessage` e o erro aparece aqui dentro (R7-04: o toast global
 * ficava por baixo do véu desfocado e o atendente não via nada).
 *
 * 27/11/2026: no desktop o diálogo fica preso ao topo (A1-06 — antes recentrava a cada tecla
 * que mudava o número de resultados e o campo de busca pulava 116px); no celular o "voltar"
 * fecha só a folha (R4-05/A2-04); a dica do rodapé diz o que o Esc faz AGORA.
 */

/** Usuário desativado não pode receber transferência (o backend também rejeita). */
export function isUsuarioAtivoParaTransferencia(u) {
  if (!u || typeof u !== "object") return false;
  const v = u.ativo;
  if (v === false || v === 0 || v === "0") return false;
  if (typeof v === "string" && v.trim().toLowerCase() === "false") return false;
  return true;
}

const CACHE_TTL_MS = 5 * 60_000;
/** companyKey → { list, ts } — só a lista de nomes/perfis, nada sensível. */
const usuariosCache = new Map();

function lerCache(companyKey) {
  const hit = usuariosCache.get(String(companyKey ?? ""));
  return hit && Array.isArray(hit.list) ? hit : null;
}

function SkeletonRows() {
  return (
    <ul className="zap-tr-list" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="zap-tr-row zap-tr-row--skeleton">
          <span className="zap-tr-skel zap-tr-skel--avatar" />
          <span className="zap-tr-rowText">
            <span className="zap-tr-skel zap-tr-skel--line" style={{ width: `${62 - i * 9}%` }} />
            <span className="zap-tr-skel zap-tr-skel--sub" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * @param {object} p
 * @param {boolean} p.open
 * @param {boolean} p.busy — barra travada (outra ação em voo)
 * @param {string|number|null} p.meuId
 * @param {string|number|null} p.atendenteAtualId — responsável atual (linha desabilitada)
 * @param {string|number|null} p.companyKey — chave do cache (company_id)
 * @param {() => void} p.onClose
 * @param {(id: string|number) => Promise<void>} p.onTransfer
 * @param {{ current: HTMLElement | null }} [p.returnFocusRef]
 */
export default function TransferirAtendimentoModal({
  open,
  busy,
  meuId,
  atendenteAtualId,
  companyKey,
  onClose,
  onTransfer,
  returnFocusRef,
}) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const [search, setSearch] = useState("");
  const [usuarios, setUsuarios] = useState(() => lerCache(companyKey)?.list || []);
  /** "loading" | "ready" | "error" */
  const [status, setStatus] = useState(() => (lerCache(companyKey) ? "ready" : "loading"));
  const [pendingId, setPendingId] = useState(null);
  /** Falha do último POST (ex.: 409 "já foi assumida"), mostrada acima da lista. */
  const [erro, setErro] = useState(null);
  const ocupado = busy || pendingId != null;

  const carregar = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!silencioso) setStatus("loading");
      try {
        const { data } = await api.get("/usuarios", { params: { ativo: true } });
        const list = (Array.isArray(data) ? data : []).filter(isUsuarioAtivoParaTransferencia);
        usuariosCache.set(String(companyKey ?? ""), { list, ts: Date.now() });
        setUsuarios(list);
        setStatus("ready");
      } catch (e) {
        console.error("Erro ao carregar /usuarios:", e);
        // Com lista em cache, um soluço da rede não apaga o que já está na tela.
        if (!lerCache(companyKey)) setStatus("error");
      }
    },
    [companyKey]
  );

  // Ao abrir: pinta o cache na hora e atualiza por trás; sem cache, esqueleto.
  useEffect(() => {
    if (!open) return undefined;
    setSearch("");
    setPendingId(null);
    setErro(null);
    const hit = lerCache(companyKey);
    if (hit) {
      setUsuarios(hit.list);
      setStatus("ready");
      if (Date.now() - hit.ts > 15_000) carregar({ silencioso: true });
    } else {
      setUsuarios([]);
      carregar();
    }
    return undefined;
  }, [open, companyKey, carregar]);

  // Expira entradas antigas (troca de empresa na mesma aba, por exemplo).
  useEffect(() => {
    if (!open) return;
    for (const [k, v] of usuariosCache) {
      if (Date.now() - v.ts > CACHE_TTL_MS && k !== String(companyKey ?? "")) usuariosCache.delete(k);
    }
  }, [open, companyKey]);

  const filtrados = useMemo(() => {
    const term = normalizarBusca(search);
    return (usuarios || []).filter((u) => {
      if (!isUsuarioAtivoParaTransferencia(u)) return false;
      if (!term) return true;
      return normalizarBusca(u?.nome).includes(term) || normalizarBusca(u?.email).includes(term);
    });
  }, [usuarios, search]);

  const isAtual = useCallback(
    (u) => atendenteAtualId != null && String(u?.id) === String(atendenteAtualId),
    [atendenteAtualId]
  );
  const habilitados = useMemo(() => filtrados.filter((u) => !isAtual(u)), [filtrados, isAtual]);

  const fechar = useCallback(() => {
    if (ocupado) return;
    onClose?.();
  }, [ocupado, onClose]);

  const escolher = useCallback(
    async (u) => {
      if (!u || ocupado || isAtual(u)) return;
      setErro(null);
      setPendingId(u.id);
      try {
        await onTransfer?.(u.id);
      } catch (e) {
        setErro(e?.userMessage || e?.message || "Não foi possível transferir. Tente de novo.");
      } finally {
        setPendingId(null);
      }
    },
    [ocupado, isAtual, onTransfer]
  );

  // Celular: o "voltar" fecha só a folha, não a conversa — MESMO com o POST em voo. O voltar já
  // consumiu a entrada do histórico: uma folha que ficasse aberta sem ela fazia o voltar
  // seguinte tirar a conversa inteira da tela. O resultado chega igual: pílula de sucesso, ou
  // toast de erro (com o modal fechado, o AtendimentoActions manda o erro para o toast).
  const fecharPeloVoltar = useCallback(() => onClose?.(), [onClose]);
  useMobileOverlayBack(open, fecharPeloVoltar, "transfer");

  // ESC em cascata, em CAPTURA (antes do atalho global da window): busca → fecha.
  const escRef = useRef({});
  escRef.current = { search, ocupado, fechar };
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      const st = escRef.current;
      if (st.ocupado) return;
      if (st.search) {
        setSearch("");
        return;
      }
      st.fechar();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  // Trava o scroll da página por baixo, como os modais irmãos (zap-pg).
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useDialogFocus({
    open,
    dialogRef,
    returnFocusRef,
    // Campo de busca só com ponteiro fino; no toque o foco fica no diálogo (sem teclado).
    getInitialFocus: () => (isPonteiroFino() ? searchRef.current : dialogRef.current),
  });

  const rowButtons = () =>
    Array.from(listRef.current?.querySelectorAll("button.zap-tr-row:not([disabled])") || []);

  const onSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      const first = rowButtons()[0];
      if (first) {
        e.preventDefault();
        first.focus();
      }
    } else if (e.key === "Enter") {
      // Só com UM resultado possível: Enter não pode transferir para "o primeiro" por engano.
      if (habilitados.length === 1) {
        e.preventDefault();
        escolher(habilitados[0]);
      }
    }
  };

  const onListKeyDown = (e) => {
    const btns = rowButtons();
    if (!btns.length) return;
    const idx = btns.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      btns[Math.min(btns.length - 1, idx + 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (idx <= 0) searchRef.current?.focus();
      else btns[idx - 1]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      btns[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      btns[btns.length - 1]?.focus();
    }
  };

  if (!open || typeof document === "undefined") return null;

  let conteudo;
  if (status === "loading" && usuarios.length === 0) {
    conteudo = <SkeletonRows />;
  } else if (status === "error" && usuarios.length === 0) {
    conteudo = (
      <div className="zap-tr-state" role="alert">
        <p className="zap-tr-stateTitle">Não foi possível carregar os atendentes</p>
        <p className="zap-tr-stateHint">Verifique a conexão e tente de novo.</p>
        <button type="button" className="zap-pg-btn zap-pg-btn--ghost zap-tr-retry" onClick={() => carregar()}>
          Tentar de novo
        </button>
      </div>
    );
  } else if (filtrados.length === 0) {
    conteudo = (
      <div className="zap-tr-state" role="status">
        <p className="zap-tr-stateTitle">
          {search ? `Nenhum atendente encontrado para “${search}”` : "Nenhum atendente ativo disponível"}
        </p>
        {search ? <p className="zap-tr-stateHint">Confira a grafia ou busque pelo e-mail.</p> : null}
      </div>
    );
  } else {
    conteudo = (
      <ul className="zap-tr-list" ref={listRef} onKeyDown={onListKeyDown} aria-label="Atendentes disponíveis">
        {filtrados.map((u) => {
          const souEu = meuId != null && String(u?.id) === String(meuId);
          const atual = isAtual(u);
          const nome = u?.nome || u?.email || `Usuário ${u?.id}`;
          const perfil = perfilLabel(u?.perfil || u?.role);
          const pendente = pendingId != null && String(pendingId) === String(u.id);
          const sub = atual ? "Já é o responsável por esta conversa" : perfil;
          return (
            <li key={u.id}>
              <button
                type="button"
                className={`zap-tr-row${atual ? " is-current" : ""}${pendente ? " is-pending" : ""}`}
                onClick={() => escolher(u)}
                disabled={atual || (ocupado && !pendente)}
                aria-busy={pendente ? "true" : undefined}
                aria-disabled={pendente ? "true" : undefined}
                title={atual ? `${nome} já é o responsável` : `Transferir para ${nome}`}
              >
                <span
                  className="zap-tr-avatar"
                  style={{ "--zap-tr-avatar": getAvatarColor(nome) }}
                  aria-hidden="true"
                >
                  {initials(nome)}
                </span>
                <span className="zap-tr-rowText">
                  <span className="zap-tr-name">
                    <span className="zap-tr-ellipsis">{nome}</span>
                    {souEu ? <span className="zap-tr-pill zap-tr-pill--me">Você</span> : null}
                    {atual ? <span className="zap-tr-pill zap-tr-pill--current">Responsável atual</span> : null}
                  </span>
                  {sub ? <span className="zap-tr-sub zap-tr-ellipsis">{sub}</span> : null}
                </span>
                {pendente ? <span className="zap-tr-spinner" aria-hidden="true" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return createPortal(
    <div
      className="zap-pg-overlay zap-tr-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        ref={dialogRef}
        className="zap-pg-modal zap-tr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        aria-busy={ocupado ? "true" : undefined}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="zap-tr-grabber" aria-hidden="true" />
        <header className="zap-pg-header">
          <div className="zap-pg-header__brand">
            <span className="zap-pg-header__icon zap-tr-headerIcon" aria-hidden="true">
              <ArrowRightLeft size={20} strokeWidth={1.9} />
            </span>
            <div>
              <h2 id={titleId} className="zap-pg-title">
                Transferir atendimento
              </h2>
              <p id={descId} className="zap-pg-subtitle">
                Quem você escolher passa a ser o responsável pela conversa.
              </p>
            </div>
          </div>
          <button type="button" className="zap-pg-close" onClick={fechar} disabled={ocupado} aria-label="Fechar">
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        <div className="zap-tr-searchWrap">
          <Search className="zap-tr-searchIcon" size={16} strokeWidth={2} aria-hidden="true" />
          <input
            ref={searchRef}
            className="zap-tr-search"
            type="search"
            placeholder="Buscar atendente…"
            aria-label="Buscar atendente por nome ou e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKeyDown}
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>

        {erro ? (
          <div className="zap-tr-error" role="alert">
            <AlertCircle className="zap-tr-errorIcon" size={16} strokeWidth={2} aria-hidden="true" />
            <span className="zap-tr-errorText">
              <strong>Não foi possível transferir.</strong> {erro}
            </span>
            <button
              type="button"
              className="zap-tr-errorClose"
              onClick={() => setErro(null)}
              aria-label="Dispensar aviso"
              title="Dispensar"
            >
              <X size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div className="zap-pg-body zap-tr-body">{conteudo}</div>

        <footer className="zap-pg-footer zap-tr-footer">
          <span className="zap-tr-hint" aria-hidden="true">
            <kbd>↑</kbd>
            <kbd>↓</kbd> navegar · <kbd>Enter</kbd> transferir · <kbd>Esc</kbd> {search ? "limpar busca" : "fechar"}
          </span>
          <button type="button" className="zap-pg-btn zap-pg-btn--ghost" onClick={fechar} disabled={ocupado}>
            Cancelar
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
