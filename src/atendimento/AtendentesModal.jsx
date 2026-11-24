import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  listarAtendentesDisponiveisConversa,
  adicionarAtendenteConversa,
  removerAtendenteConversa,
} from "../conversa/conversaService";

import {
  MAX_CO_ATENDENTES,
  calcularPermissoes,
  filtrarDisponiveis,
  initials,
  perfilLabel,
} from "./atendentesRegras";

const AVATAR_TONS = 8;

function tomAvatar(id) {
  const n = Math.abs(Number(id) || 0);
  return n % AVATAR_TONS;
}

function msgErro(e, fallback) {
  const status = e?.response?.status;
  const api = e?.response?.data?.error;
  if (api) return String(api);
  if (!e?.response) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  if (status === 403) return "Você não tem permissão para esta ação.";
  return fallback;
}

/* ── Ícones (SVG inline: render idêntico em todo SO, ao contrário de emoji) ── */
const IconClose = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const IconSearch = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const IconCrown = () => (
  <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" fill="currentColor" />
  </svg>
);
const IconUserMinus = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
    <circle cx="9" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M16 11h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const IconAlert = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 7.5v5.5M12 16.5v.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconInfo = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 11v5.5M12 7.5v.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
const Spinner = () => <span className="wa-atend-spinner" aria-hidden="true" />;

function Avatar({ id, nome, principal = false, size = "md" }) {
  return (
    <span className={`wa-atend-avatar wa-atend-avatar--${size} wa-atend-tom-${tomAvatar(id)}`} aria-hidden="true">
      {initials(nome)}
      {principal ? (
        <span className="wa-atend-avatarCrown">
          <IconCrown />
        </span>
      ) : null}
    </span>
  );
}

function ParticipanteRow({ p, souEu, podeRemover, removendo, ocupado, confirmando, onPedirRemover, onConfirmar, onCancelar, destacado }) {
  const isPrincipal = p.tipo === "principal";
  const nome = p.usuario?.nome || p.usuario?.email || `Usuário ${p.usuario_id}`;
  const perfil = perfilLabel(p.usuario?.perfil);
  const addPor = p.adicionado_por_usuario?.nome;
  const sub = isPrincipal
    ? perfil || "Responsável"
    : [perfil, addPor && Number(p.adicionado_por_usuario?.id) !== Number(p.usuario_id) ? `adicionado(a) por ${addPor}` : null]
        .filter(Boolean)
        .join(" · ");
  const estaRemovendo = removendo === p.usuario_id;

  return (
    <li
      className={`wa-atend-row${isPrincipal ? " wa-atend-row--principal" : ""}${destacado ? " wa-atend-row--novo" : ""}`}
    >
      <Avatar id={p.usuario_id} nome={nome} principal={isPrincipal} />
      <div className="wa-atend-rowInfo">
        <div className="wa-atend-rowNome">
          <span className="wa-atend-ellipsis">{nome}</span>
          {souEu ? <span className="wa-atend-pill wa-atend-pill--eu">Você</span> : null}
          {isPrincipal ? <span className="wa-atend-pill wa-atend-pill--principal">Responsável</span> : null}
        </div>
        {sub ? <div className="wa-atend-rowSub wa-atend-ellipsis">{sub}</div> : null}
      </div>
      {podeRemover ? (
        confirmando ? (
          <div className="wa-atend-confirm" role="group" aria-label={`Confirmar remoção de ${nome}`}>
            <button type="button" className="wa-atend-btnGhost" onClick={onCancelar} disabled={estaRemovendo}>
              Cancelar
            </button>
            <button
              type="button"
              className="wa-atend-btnDanger"
              onClick={() => onConfirmar(p)}
              disabled={estaRemovendo}
              autoFocus
            >
              {estaRemovendo ? <Spinner /> : null}
              {souEu ? "Sair" : "Remover"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="wa-atend-iconBtn wa-atend-iconBtn--danger"
            onClick={() => onPedirRemover(p.usuario_id)}
            disabled={ocupado}
            title={souEu ? "Sair do atendimento" : `Remover ${nome} do atendimento`}
            aria-label={souEu ? "Sair do atendimento" : `Remover ${nome} do atendimento`}
          >
            <IconUserMinus />
          </button>
        )
      ) : null}
    </li>
  );
}

function SkeletonRows({ n = 3 }) {
  return (
    <ul className="wa-atend-list" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="wa-atend-row wa-atend-row--skeleton">
          <span className="wa-atend-skel wa-atend-skel--avatar" />
          <div className="wa-atend-rowInfo">
            <span className="wa-atend-skel wa-atend-skel--line" style={{ width: `${55 - i * 10}%` }} />
            <span className="wa-atend-skel wa-atend-skel--line wa-atend-skel--sm" />
          </div>
        </li>
      ))}
    </ul>
  );
}

const FOCAVEIS = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export default function AtendentesModal({
  conversaId,
  participantes = [],
  participantesCarregados = true,
  participantesErro = false,
  encerrada = false,
  meuUsuarioId = null,
  meuPerfil = "",
  podeAdicionar = true,
  onClose,
  onParticipanteChange,
}) {
  const [disponiveis, setDisponiveis] = useState([]);
  const [dispStatus, setDispStatus] = useState("idle"); // idle | loading | ok | erro
  const [busca, setBusca] = useState("");
  const [adicionando, setAdicionando] = useState(null);
  const [removendo, setRemovendo] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [destaqueId, setDestaqueId] = useState(null);

  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const mountedRef = useRef(true);
  const titleId = useId();
  const descId = useId();

  const perm = useMemo(
    () => calcularPermissoes({ participantes, meuUsuarioId, meuPerfil, encerrada, podeAdicionar }),
    [participantes, meuUsuarioId, meuPerfil, encerrada, podeAdicionar]
  );
  const { me, principal, coAtendentes, limiteAtingido, podeIncluirOutros, podeParticipar } = perm;
  const ocupado = adicionando != null || removendo != null;
  const mostrarAdicionar = podeIncluirOutros || podeParticipar;

  const participantesIds = useMemo(
    () => new Set(participantes.map((p) => Number(p.usuario_id))),
    [participantes]
  );
  // Chave estável da composição da equipe: refaz a lista de disponíveis quando
  // alguém entra/sai — inclusive por outra pessoa, via realtime.
  const equipeKey = useMemo(
    () => participantes.map((p) => `${p.tipo}:${p.usuario_id}`).sort().join("|"),
    [participantes]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const carregarDisponiveis = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!conversaId) return;
      if (!silencioso) setDispStatus("loading");
      try {
        const rows = await listarAtendentesDisponiveisConversa(conversaId);
        if (!mountedRef.current) return;
        setDisponiveis(Array.isArray(rows) ? rows : []);
        setDispStatus("ok");
      } catch (_) {
        if (!mountedRef.current) return;
        // Recarga silenciosa que falha mantém a lista anterior (já filtrada pelos participantes).
        if (!silencioso) setDispStatus("erro");
      }
    },
    [conversaId]
  );

  // Carga inicial (só quando há algo a adicionar).
  useEffect(() => {
    if (mostrarAdicionar) carregarDisponiveis();
  }, [mostrarAdicionar, carregarDisponiveis]);

  // Equipe mudou (realtime ou ação local): recarrega em silêncio, sem piscar o skeleton.
  const equipeKeyInicial = useRef(equipeKey);
  useEffect(() => {
    if (equipeKeyInicial.current === equipeKey) return;
    equipeKeyInicial.current = equipeKey;
    if (mostrarAdicionar) carregarDisponiveis({ silencioso: true });
  }, [equipeKey, mostrarAdicionar, carregarDisponiveis]);

  // Confirmação de remoção expira sozinha (evita "Remover" armado esquecido).
  useEffect(() => {
    if (confirmandoId == null || removendo != null) return undefined;
    const t = setTimeout(() => setConfirmandoId(null), 5000);
    return () => clearTimeout(t);
  }, [confirmandoId, removendo]);

  // A pessoa confirmada saiu da lista por outra via (realtime) → desarma.
  useEffect(() => {
    if (confirmandoId != null && !participantesIds.has(Number(confirmandoId))) setConfirmandoId(null);
  }, [confirmandoId, participantesIds]);

  useEffect(() => {
    if (!sucesso) return undefined;
    const t = setTimeout(() => setSucesso(""), 2800);
    return () => clearTimeout(t);
  }, [sucesso]);

  useEffect(() => {
    if (destaqueId == null) return undefined;
    const t = setTimeout(() => setDestaqueId(null), 1600);
    return () => clearTimeout(t);
  }, [destaqueId]);

  // Foco: entra no campo de busca só com mouse (no celular abrir o teclado de
  // cara cobre metade do modal); devolve o foco a quem abriu ao fechar.
  useEffect(() => {
    const anterior = document.activeElement;
    const finePointer = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)")?.matches;
    const t = setTimeout(() => {
      if (finePointer && searchRef.current) searchRef.current.focus({ preventScroll: true });
      else dialogRef.current?.focus({ preventScroll: true });
    }, 30);
    return () => {
      clearTimeout(t);
      if (anterior && typeof anterior.focus === "function" && document.contains(anterior)) {
        try {
          anterior.focus({ preventScroll: true });
        } catch (_) {
          /* noop */
        }
      }
    };
  }, []);

  const disponiveisFiltrados = useMemo(
    () => filtrarDisponiveis(disponiveis, { participantesIds, busca, podeIncluirOutros, me }),
    [disponiveis, participantesIds, busca, podeIncluirOutros, me]
  );

  const handleAdicionar = async (u) => {
    const uid = Number(u.id ?? u.usuario_id);
    if (!uid || ocupado || limiteAtingido) return;
    setErro("");
    setSucesso("");
    setConfirmandoId(null);
    setAdicionando(uid);
    try {
      await adicionarAtendenteConversa(conversaId, uid);
      // Tira da lista na hora (sem esperar a recarga) e espera a equipe atualizar
      // para o nome "pular" de uma lista para a outra sem buraco no meio.
      setDisponiveis((prev) => prev.filter((x) => Number(x.id ?? x.usuario_id) !== uid));
      await Promise.resolve(onParticipanteChange?.());
      if (!mountedRef.current) return;
      const nome = u.nome || u.email || "Atendente";
      setSucesso(uid === me ? "Você entrou no atendimento." : `${nome} agora participa do atendimento.`);
      setDestaqueId(uid);
      setBusca("");
    } catch (e) {
      if (!mountedRef.current) return;
      setErro(msgErro(e, "Não foi possível adicionar o atendente."));
      // Estado pode ter mudado no servidor (limite, encerramento, outro já incluiu).
      onParticipanteChange?.();
      carregarDisponiveis({ silencioso: true });
    } finally {
      if (mountedRef.current) setAdicionando(null);
    }
  };

  const handleConfirmarRemocao = async (p) => {
    const uid = Number(p.usuario_id);
    if (!uid || ocupado) return;
    setErro("");
    setSucesso("");
    setRemovendo(uid);
    try {
      await removerAtendenteConversa(conversaId, uid);
      if (uid === me) {
        // Saiu do próprio atendimento: pode até perder o acesso à conversa —
        // fecha em vez de deixar o modal tentando recarregar uma equipe que não vê mais.
        onParticipanteChange?.();
        onCloseRef.current?.();
        return;
      }
      await Promise.resolve(onParticipanteChange?.());
      if (!mountedRef.current) return;
      const nome = p.usuario?.nome || "Atendente";
      setSucesso(`${nome} não participa mais do atendimento.`);
      setConfirmandoId(null);
    } catch (e) {
      if (!mountedRef.current) return;
      // 404/409: já não estava lá — sincroniza em vez de deixar a linha "presa".
      const st = e?.response?.status;
      if (st === 404) {
        setConfirmandoId(null);
        onParticipanteChange?.();
      } else {
        setErro(msgErro(e, "Não foi possível remover o atendente."));
        if (st === 409) onParticipanteChange?.();
      }
    } finally {
      if (mountedRef.current) setRemovendo(null);
    }
  };

  // ESC em cascata (1 coisa por toque), com o foco onde estiver:
  // confirmação armada → busca preenchida → fecha o modal.
  const escRef = useRef({});
  escRef.current = { confirmandoId, removendo, busca };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // preventDefault: o atalho global (useGlobalHotkeys, na window) ignora ESC já
      // tratado. Sem isso o mesmo ESC fechava o modal E saía da conversa por baixo.
      e.preventDefault();
      e.stopPropagation();
      const st = escRef.current;
      if (st.confirmandoId != null) {
        if (st.removendo == null) setConfirmandoId(null);
        return;
      }
      if (st.busca) {
        setBusca("");
        return;
      }
      onCloseRef.current?.();
    };
    // capture: roda antes do listener global da window e de qualquer outro.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const onKeyDownDialog = (e) => {
    if (e.key === "Tab" && dialogRef.current) {
      const els = Array.from(dialogRef.current.querySelectorAll(FOCAVEIS)).filter((el) => el.offsetParent !== null);
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const onSearchKeyDown = (e) => {
    // Enter com um único resultado: adiciona direto.
    if (e.key === "Enter" && disponiveisFiltrados.length === 1 && !ocupado && !limiteAtingido) {
      e.preventDefault();
      handleAdicionar(disponiveisFiltrados[0]);
    }
  };

  const vagas = Math.max(0, MAX_CO_ATENDENTES - coAtendentes.length);
  const carregandoEquipe = !participantesCarregados;

  let avisoAdicionar = null;
  if (encerrada) {
    avisoAdicionar = "Atendimento encerrado. Reabra a conversa para alterar a equipe.";
  } else if (podeAdicionar && participantesCarregados && !principal) {
    avisoAdicionar = "Assuma a conversa para poder incluir co-atendentes.";
  }

  const modal = (
    <div
      className="wa-atendentesModal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current?.();
      }}
    >
      <div
        ref={dialogRef}
        className="wa-atendentesModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={onKeyDownDialog}
      >
        <header className="wa-atendentesModal-header">
          <div className="wa-atend-headText">
            <h2 id={titleId} className="wa-atendentesModal-title">
              Atendentes
            </h2>
            <p id={descId} className="wa-atend-headSub">
              {carregandoEquipe
                ? "Carregando equipe…"
                : `${principal ? 1 : 0} responsável · ${coAtendentes.length} de ${MAX_CO_ATENDENTES} co-atendentes`}
            </p>
          </div>
          <button
            type="button"
            className="wa-atend-iconBtn wa-atendentesModal-close"
            onClick={() => onCloseRef.current?.()}
            aria-label="Fechar"
          >
            <IconClose />
          </button>
        </header>

        <div className="wa-atendentesModal-body">
          {participantesErro ? (
            <div className="wa-atend-banner wa-atend-banner--warn" role="status">
              <IconAlert />
              <span>Não foi possível atualizar a equipe agora. Os dados podem estar desatualizados.</span>
              <button type="button" className="wa-atend-bannerAction" onClick={() => onParticipanteChange?.()}>
                Tentar de novo
              </button>
            </div>
          ) : null}

          {/* Responsável */}
          <section className="wa-atendentesSection" aria-label="Responsável">
            <div className="wa-atendentesSection-label">Responsável</div>
            {carregandoEquipe ? (
              <SkeletonRows n={1} />
            ) : principal ? (
              <ul className="wa-atend-list">
                <ParticipanteRow p={principal} souEu={perm.souPrincipal} podeRemover={false} />
              </ul>
            ) : (
              <div className="wa-atend-empty">
                <span className="wa-atend-emptyDot" aria-hidden="true" />
                Ninguém assumiu esta conversa ainda
              </div>
            )}
          </section>

          {/* Co-atendentes */}
          <section className="wa-atendentesSection" aria-label="Co-atendentes">
            <div className="wa-atendentesSection-label">
              Co-atendentes
              {!carregandoEquipe ? (
                <span className="wa-atend-count" aria-label={`${coAtendentes.length} de ${MAX_CO_ATENDENTES}`}>
                  {coAtendentes.length}/{MAX_CO_ATENDENTES}
                </span>
              ) : null}
            </div>
            {carregandoEquipe ? (
              <SkeletonRows n={1} />
            ) : coAtendentes.length === 0 ? (
              <div className="wa-atend-empty">
                <span className="wa-atend-emptyDot" aria-hidden="true" />
                Nenhum co-atendente
              </div>
            ) : (
              <ul className="wa-atend-list">
                {coAtendentes.map((p) => (
                  <ParticipanteRow
                    key={p.id ?? p.usuario_id}
                    p={p}
                    souEu={me != null && Number(p.usuario_id) === me}
                    podeRemover={perm.podeRemover(p)}
                    removendo={removendo}
                    ocupado={ocupado}
                    confirmando={confirmandoId != null && Number(confirmandoId) === Number(p.usuario_id)}
                    onPedirRemover={(uid) => {
                      setErro("");
                      setConfirmandoId(uid);
                    }}
                    onConfirmar={handleConfirmarRemocao}
                    onCancelar={() => setConfirmandoId(null)}
                    destacado={destaqueId != null && Number(destaqueId) === Number(p.usuario_id)}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Feedback (anunciado por leitor de tela) */}
          <div className="wa-atend-feedback" aria-live="polite">
            {erro ? (
              <div className="wa-atend-banner wa-atend-banner--erro" role="alert">
                <IconAlert />
                <span>{erro}</span>
                <button type="button" className="wa-atend-iconBtn wa-atend-bannerClose" onClick={() => setErro("")} aria-label="Fechar aviso">
                  <IconClose />
                </button>
              </div>
            ) : sucesso ? (
              <div className="wa-atend-banner wa-atend-banner--ok">
                <IconCheck />
                <span>{sucesso}</span>
              </div>
            ) : null}
          </div>

          {avisoAdicionar ? (
            <div className="wa-atend-banner wa-atend-banner--info">
              <IconInfo />
              <span>{avisoAdicionar}</span>
            </div>
          ) : null}

          {/* Adicionar */}
          {mostrarAdicionar && !carregandoEquipe ? (
            <section className="wa-atendentes-addSection" aria-label="Adicionar co-atendente">
              <div className="wa-atendentesSection-label">
                {podeIncluirOutros ? "Adicionar co-atendente" : "Participar do atendimento"}
                {podeIncluirOutros && !limiteAtingido ? (
                  <span className="wa-atend-labelHint">
                    {vagas} {vagas === 1 ? "vaga" : "vagas"}
                  </span>
                ) : null}
              </div>

              {limiteAtingido ? (
                <div className="wa-atend-banner wa-atend-banner--info">
                  <IconInfo />
                  <span>
                    Limite de {MAX_CO_ATENDENTES} co-atendentes atingido. Remova alguém para incluir outra pessoa.
                  </span>
                </div>
              ) : (
                <>
                  {podeIncluirOutros ? (
                    <div className="wa-atendentes-searchWrap">
                      <span className="wa-atend-searchIcon">
                        <IconSearch />
                      </span>
                      <input
                        ref={searchRef}
                        type="text"
                        inputMode="search"
                        enterKeyHint="search"
                        className="wa-atendentes-searchInput"
                        placeholder="Buscar pelo nome ou e-mail…"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        onKeyDown={onSearchKeyDown}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="Buscar atendente"
                      />
                      {busca ? (
                        <button
                          type="button"
                          className="wa-atend-iconBtn wa-atend-searchClear"
                          onClick={() => {
                            setBusca("");
                            searchRef.current?.focus();
                          }}
                          aria-label="Limpar busca"
                        >
                          <IconClose />
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="wa-atend-helper">
                      Você pode entrar neste atendimento como co-atendente e responder junto com o responsável.
                    </p>
                  )}

                  {dispStatus === "loading" || dispStatus === "idle" ? (
                    <SkeletonRows n={podeIncluirOutros ? 3 : 1} />
                  ) : dispStatus === "erro" ? (
                    <div className="wa-atend-banner wa-atend-banner--erro">
                      <IconAlert />
                      <span>Não foi possível carregar os atendentes.</span>
                      <button type="button" className="wa-atend-bannerAction" onClick={() => carregarDisponiveis()}>
                        Tentar de novo
                      </button>
                    </div>
                  ) : disponiveisFiltrados.length === 0 ? (
                    <div className="wa-atend-empty wa-atend-empty--center">
                      {busca
                        ? `Nenhum atendente encontrado para “${busca.trim()}”`
                        : podeIncluirOutros
                          ? "Toda a equipe já participa deste atendimento"
                          : "Você não está disponível para entrar neste atendimento"}
                    </div>
                  ) : (
                    <ul className="wa-atend-list wa-atend-list--disponiveis">
                      {disponiveisFiltrados.map((u) => {
                        const uid = Number(u.id ?? u.usuario_id);
                        const nome = u.nome || u.email || `Usuário ${uid}`;
                        const esteAdicionando = adicionando === uid;
                        const souEu = uid === me;
                        return (
                          <li key={uid} className="wa-atend-row wa-atend-row--disponivel">
                            <Avatar id={uid} nome={nome} size="sm" />
                            <div className="wa-atend-rowInfo">
                              <div className="wa-atend-rowNome">
                                <span className="wa-atend-ellipsis">{nome}</span>
                                {souEu ? <span className="wa-atend-pill wa-atend-pill--eu">Você</span> : null}
                              </div>
                              {u.perfil ? <div className="wa-atend-rowSub">{perfilLabel(u.perfil)}</div> : null}
                            </div>
                            <button
                              type="button"
                              className="wa-atendentes-adicionarBtn"
                              onClick={() => handleAdicionar(u)}
                              disabled={ocupado}
                              aria-label={souEu ? "Participar do atendimento" : `Adicionar ${nome}`}
                            >
                              {esteAdicionando ? <Spinner /> : null}
                              {esteAdicionando ? (souEu ? "Entrando…" : "Adicionando…") : souEu ? "Participar" : "Adicionar"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
