import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  History,
  Package,
  Search as SearchIcon,
  Tag,
  Tags,
  User,
  UserRound,
  Users,
} from "lucide-react";
import AtendimentoActions from "../../atendimento/AtendimentoActions";
import { useMenuKeyboard } from "../../atendimento/useMenuKeyboard";
import { useMobileOverlayBack } from "../../atendimento/useMobileOverlayBack";
import SendToCrmChatButton, { IconFunnelSend } from "../SendToCrmChatButton";
import { IconMore, IconSearch } from "../conversaViewIcons";
import { getAvatarColor } from "../../utils/avatarColor";
import ConversationWhatsappLabels from "./ConversationWhatsappLabels";
import "./conversaHeaderPremium.css";

/** Ícones do menu "Mais opções": um traço só (lucide 1.9), um tamanho só (18px). */
const MENU_ICON = { size: 18, strokeWidth: 1.9, "aria-hidden": true };

function HeaderOverflowSheetBtn({ icon, label, onClick, disabled = false, kbd = null }) {
  return (
    <button
      type="button"
      role="menuitem"
      className="wa-atendToolbar-sheetBtn"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="wa-atendToolbar-sheetIcon" aria-hidden="true">
        {icon}
      </span>
      <span className="wa-atendToolbar-sheetLabel">{label}</span>
      {kbd ? (
        <kbd className="wa-atendToolbar-sheetKbd" aria-hidden="true">
          {kbd}
        </kbd>
      ) : null}
    </button>
  );
}

/*
 * Selo de estado do cabeçalho (26/11/2026): "uma cápsula e cinco tintas" (doc 14), as MESMAS
 * da lista (`--zs-st-*`, definidas nos dois temas). Antes eram hex cravados aplicados inline:
 * "Em atendimento" com 1.73:1 no claro, "Aguardando cliente" 2.68:1 no escuro, e âmbar/azul
 * TROCADOS em relação à lista. O texto vem do `statusBadge` (conversaViewHelpers); aqui só se
 * escolhe a tinta. Texto desconhecido cai no neutro, nunca numa cor errada.
 */
function statusTone(badge) {
  if (!badge) return null;
  if (badge.variant === "aberta") return "aberta";
  const t = String(badge.text || "").toLowerCase();
  if (t.startsWith("em atendimento")) return "live";
  if (t.startsWith("aguardando atendente")) return "staff";
  if (t.startsWith("aguardando cliente") || t.startsWith("mensagem disparada")) return "wait";
  if (t.startsWith("finalizada")) return "done";
  return "neutral";
}

/*
 * Chip do setor cortado pela faixa do selo (desktop apertado, 1040–1180px com a lista aberta):
 * a faixa corta o que não cabe (R4-01), e o chip ficava INVISÍVEL mas ainda no Tab — o foco ia
 * parar num botão que ninguém vê. Cortado (nem que seja um pedaço do ícone) → `data-clipped`,
 * e o CSS o esconde (visibility: some do Tab e do leitor de tela, sem mudar o layout, então a
 * medida seguinte continua válida). O setor segue alcançável pelo "Mais opções".
 * Atributo direto no DOM (não é prop): o React não o apaga ao re-renderizar.
 */
function marcarChipCortado(strip) {
  const chip = strip?.querySelector?.(".wa-header-setorChip");
  if (!chip) return;
  const c = chip.getBoundingClientRect();
  const s = strip.getBoundingClientRect();
  const visivel = Math.min(c.right, s.right) - Math.max(c.left, s.left);
  const cortado = c.width > 0 && visivel < c.width - 1;
  if (cortado === chip.hasAttribute("data-clipped")) return;
  if (cortado) chip.setAttribute("data-clipped", "");
  else chip.removeAttribute("data-clipped");
}

/** Iniciais sem nenhuma letra ("(1" de um telefone) não são iniciais: vira o boneco neutro. */
function temLetra(s) {
  try {
    return /\p{L}/u.test(String(s || ""));
  } catch {
    return /[a-zA-ZÀ-ÿ]/.test(String(s || ""));
  }
}

/**
 * Cabeçalho da conversa (avatar, meta, ações). Lógica e estados permanecem no ConversaView.
 */
function ConversaHeader({
  headerRef,
  onBack,
  isGroup,
  headerCompact,
  headerAtendCompact = false,
  headerCrmAtivoLayout,
  nome,
  avatar,
  avatarUrl,
  showAvatarImg,
  onAvatarError,
  badge,
  showPagamentoConcluidoBadge = false,
  encerramentoAusenciaHint,
  /** Modo simples = pele WhatsApp: sem setor e sem transferir no cabeçalho. */
  modoSimples = false,
  setorAtual,
  podeTransferirSetor,
  onOpenTransferirSetor,
  podeVerAtendentes,
  totalAtendentes,
  onOpenAtendentes,
  isSomeoneTyping,
  contactPresenceLabel = null,
  contactPresenceAnimate = false,
  podeGerenciarTags,
  tagsOpen,
  onToggleTagPanel,
  conversaId,
  showTimeline,
  onToggleTimeline,
  mostrarEnviarCrm,
  sendCrmRef,
  canConsultarProdutos,
  showProdutosPanel,
  onOpenProdutosPanel,
  /** Orçamento WM: gate de módulo+permissão já resolvido pelo coordenador (doc 36, D2/D7). */
  canCriarOrcamentoWm = false,
  onOpenOrcamentoDrawer,
  onOpenClienteSide,
  onOpenMessageSearch,
  whatsappInstanceLabel,
  clienteSideOpen = false,
  whatsappLabelsContext = null,
  /** Toast da conversa (useConversationToast): sucesso das ações vira a pílula curta. Opcional. */
  showToast,
}) {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const closeLabels = useCallback(() => setLabelsOpen(false), []);
  const openLabels = useCallback(() => setLabelsOpen(true), []);
  useEffect(() => { setLabelsOpen(false); setMoreMenuOpen(false); }, [conversaId]);
  const moreMenuWrapRef = useRef(null);
  const moreTriggerRef = useRef(null);
  const moreMenuRef = useRef(null);

  const closeMoreMenu = useCallback(() => setMoreMenuOpen(false), []);
  const { onMenuKeyDown: onMoreMenuKeyDown } = useMenuKeyboard({
    open: moreMenuOpen,
    menuRef: moreMenuRef,
    triggerRef: moreTriggerRef,
    onClose: closeMoreMenu,
  });
  // Celular (grupo: o ⋯ do cabeçalho é este): o "voltar" fecha o menu, não a conversa.
  useMobileOverlayBack(moreMenuOpen, closeMoreMenu, "headerMore");

  useEffect(() => {
    if (!moreMenuOpen) return undefined;
    const onDocDown = (e) => {
      if (moreMenuWrapRef.current?.contains(e.target)) return;
      setMoreMenuOpen(false);
    };
    // Rede de segurança para ESC com o foco fora do menu; dentro dele, `onMoreMenuKeyDown`
    // trata primeiro e devolve o foco ao gatilho.
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreMenuOpen]);

  const dadosContatoLabel = isGroup ? "Dados do grupo" : "Dados do contato";

  const renderTagsHistoryProductsItems = useCallback(
    (close) => (
      <>
        <HeaderOverflowSheetBtn
          icon={<History {...MENU_ICON} />}
          label="Histórico de movimentações"
          kbd="Ctrl H"
          onClick={() => {
            onToggleTimeline();
            close();
          }}
        />
        {!isGroup && conversaId && podeVerAtendentes ? (
          <HeaderOverflowSheetBtn
            icon={<Users {...MENU_ICON} />}
            label={totalAtendentes > 0 ? `Atendentes · ${totalAtendentes}` : "Atendentes"}
            onClick={() => {
              onOpenAtendentes();
              close();
            }}
          />
        ) : null}
        {!isGroup && podeGerenciarTags ? (
          <HeaderOverflowSheetBtn
            icon={<Tag {...MENU_ICON} />}
            label="Etiquetas do WhatsApp"
            disabled={!conversaId}
            onClick={() => { openLabels(); close(); }}
          />
        ) : null}
        {!isGroup && podeGerenciarTags ? (
          <HeaderOverflowSheetBtn
            icon={<Tags {...MENU_ICON} />}
            label="Tags do cliente"
            disabled={!conversaId}
            onClick={() => {
              onToggleTagPanel();
              close();
            }}
          />
        ) : null}
        {!isGroup && conversaId && canConsultarProdutos ? (
          <HeaderOverflowSheetBtn
            icon={<Package {...MENU_ICON} />}
            label="Consultar produtos"
            onClick={() => {
              onOpenProdutosPanel();
              close();
            }}
          />
        ) : null}
        {/*
          Orçamento WM (doc 36, D8): deixou de ser um item discreto neste menu e virou botão de
          verdade na barra de ações (`AtendimentoActions`, classe `wa-btn-orcamento`), para não
          haver DOIS gatilhos para a mesma coisa. O gate (`!isGroup && conversaId &&
          canCriarOrcamentoWm`) e o handler (`onOpenOrcamentoDrawer`) viajam agora até lá.
        */}
      </>
    ),
    [
      canConsultarProdutos,
      conversaId,
      isGroup,
      onOpenAtendentes,
      onOpenProdutosPanel,
      onToggleTagPanel,
      onToggleTimeline,
      podeVerAtendentes,
      totalAtendentes,
      podeGerenciarTags,
      openLabels,
    ]
  );

  /*
   * Setor (26/11/2026). Desktop largo (sem a barra compacta): o setor sai da 2.ª linha do
   * cabeçalho (114px → ~76px; a thread ganha ~38px) e vira um chip clicável na linha do selo
   * ("Em atendimento · Comercial ▾"), como o WhatsApp Web/Front. A altura é a MESMA em todo
   * estado (com ou sem selo, com ou sem setor), decidida na 1.ª pintura — trocar de conversa
   * não faz o cabeçalho pular.
   * Tablet (740–1024, barra compacta) continua com a linha dedicada: o layout dele é outro.
   */
  const setorInline = !headerCompact && !headerAtendCompact && !isGroup && !modoSimples;
  const showSetorBelow = !headerCompact && !isGroup && !modoSimples && !setorInline;

  // Chip cortado → escondido (ver marcarChipCortado). Mede depois de cada render (o selo pode
  // ter mudado de texto e empurrado o chip sem nada mudar de tamanho) e a cada resize da faixa.
  const metaStripRef = useRef(null);
  useLayoutEffect(() => {
    if (setorInline) marcarChipCortado(metaStripRef.current);
  });
  useLayoutEffect(() => {
    const strip = metaStripRef.current;
    if (!setorInline || !strip || typeof ResizeObserver === "undefined") return undefined;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        marcarChipCortado(metaStripRef.current);
      });
    });
    ro.observe(strip);
    return () => {
      ro.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [setorInline]);

  const renderSetorControls = ({ omitSetorPrefix = false } = {}) => {
    if (isGroup || modoSimples) return null;
    if (setorAtual) {
      return (
        <>
          <span className="wa-header-metaItem" title={setorAtual}>
            {omitSetorPrefix ? setorAtual : `Setor: ${setorAtual}`}
          </span>
          {podeTransferirSetor ? (
            <button
              type="button"
              className="wa-header-setorBtn"
              onClick={onOpenTransferirSetor}
              title="Transferir para outro setor"
            >
              <span className="wa-setorBtn-label wa-setorBtn-label--full">Transferir setor</span>
              <span className="wa-setorBtn-label wa-setorBtn-label--short">Trocar</span>
            </button>
          ) : null}
        </>
      );
    }
    return (
      <>
        <span className="wa-header-metaItem wa-muted">Sem setor</span>
        {podeTransferirSetor ? (
          <button
            type="button"
            className="wa-header-setorBtn"
            onClick={onOpenTransferirSetor}
            title="Definir setor"
          >
            <span className="wa-setorBtn-label wa-setorBtn-label--full">Definir setor</span>
            <span className="wa-setorBtn-label wa-setorBtn-label--short">Setor</span>
          </button>
        ) : null}
      </>
    );
  };

  /** Chip do setor na linha do selo (só desktop largo). Botão próprio, FORA do botão de perfil. */
  const renderSetorChip = () => {
    const semSetor = !setorAtual;
    const texto = semSetor ? "Sem setor" : setorAtual;
    if (!podeTransferirSetor) {
      return (
        <span className={`wa-header-setorChip is-static${semSetor ? " is-empty" : ""}`} title={semSetor ? "Conversa sem setor" : `Setor: ${texto}`}>
          <Building2 size={13} strokeWidth={2} aria-hidden="true" />
          <span className="wa-srOnly">Setor: </span>
          <span className="wa-header-setorChip-text">{texto}</span>
        </span>
      );
    }
    return (
      <button
        type="button"
        className={`wa-header-setorChip${semSetor ? " is-empty" : ""}`}
        onClick={onOpenTransferirSetor}
        title={semSetor ? "Definir setor" : "Transferir para outro setor"}
        aria-haspopup="dialog"
      >
        <Building2 size={13} strokeWidth={2} aria-hidden="true" />
        <span className="wa-srOnly">Setor: </span>
        <span className="wa-header-setorChip-text">{texto}</span>
        <span className="wa-srOnly">{semSetor ? " — definir setor" : " — trocar setor"}</span>
        <ChevronDown className="wa-header-setorChip-caret" size={13} strokeWidth={2.2} aria-hidden="true" />
      </button>
    );
  };

  const renderCompactOverflowTop = useCallback(
    (close) => (
      <>
        {conversaId ? (
          <HeaderOverflowSheetBtn
            icon={<SearchIcon {...MENU_ICON} />}
            label="Pesquisar mensagens"
            kbd="Ctrl ⇧ F"
            onClick={() => {
              onOpenMessageSearch();
              close();
            }}
          />
        ) : null}
        {renderTagsHistoryProductsItems(close)}
        {!isGroup && conversaId && mostrarEnviarCrm ? (
          <HeaderOverflowSheetBtn
            icon={<IconFunnelSend />}
            label="Enviar ao CRM"
            onClick={() => {
              try {
                sendCrmRef.current?.open?.();
              } catch (_) {}
              close();
            }}
          />
        ) : null}
        <HeaderOverflowSheetBtn
          icon={<UserRound {...MENU_ICON} />}
          label={dadosContatoLabel}
          disabled={!conversaId}
          onClick={() => {
            onOpenClienteSide();
            close();
          }}
        />
      </>
    ),
    [
      conversaId,
      dadosContatoLabel,
      isGroup,
      mostrarEnviarCrm,
      onOpenClienteSide,
      onOpenMessageSearch,
      renderTagsHistoryProductsItems,
      sendCrmRef,
    ]
  );

  /*
   * Avatar sem foto (26/11/2026): a MESMA cor OKLCH do card da lista (utils/avatarColor.js,
   * mesma semente), em vez do cinza neutro. Grupo: ícone de pessoas no lugar do emoji 👥.
   * Iniciais sem letra (contato só com número) viram o boneco neutro, como o WhatsApp.
   */
  const avatarTint = showAvatarImg ? null : getAvatarColor(nome || conversaId || "");
  const avatarFallback = isGroup ? (
    <Users className="wa-avatar-icon" size={20} strokeWidth={2} aria-hidden="true" />
  ) : temLetra(avatar) ? (
    avatar
  ) : (
    <User className="wa-avatar-icon" size={20} strokeWidth={2} aria-hidden="true" />
  );

  const tone = statusTone(badge);
  const metaStrip = (
    <div className="wa-header-metaStrip" ref={metaStripRef} aria-label="Status da conversa">
      {badge || showPagamentoConcluidoBadge ? (
        <span className="wa-header-statusStack">
          {badge ? (
            <span
              className={`wa-status-pill wa-status-pill--meta${tone ? ` wa-status-pill--${tone}` : ""}`}
              title={encerramentoAusenciaHint || badge.text}
            >
              {/* Span próprio: em desktop apertado o texto vira reticências (flex não as faz). */}
              <span className="wa-status-pill-text">{badge.text}</span>
            </span>
          ) : null}
          {showPagamentoConcluidoBadge ? (
            <span
              className="wa-status-pill wa-status-pill--pagamento-concluido-sub"
              title="Pagamento confirmado neste atendimento"
            >
              Pagamento concluído
            </span>
          ) : null}
        </span>
      ) : null}
      {setorInline ? (
        <>
          {badge || showPagamentoConcluidoBadge ? <span className="wa-header-metaSep" aria-hidden="true" /> : null}
          {renderSetorChip()}
        </>
      ) : null}
      {isGroup ? (
        <>
          {badge ? <span className="wa-header-metaSep" aria-hidden="true" /> : null}
          <span className="wa-header-metaItem wa-muted">Grupo</span>
        </>
      ) : null}
      {!isGroup && whatsappInstanceLabel ? (
        <>
          {badge || showPagamentoConcluidoBadge || setorInline ? <span className="wa-header-metaSep" aria-hidden="true" /> : null}
          <span className="wa-header-metaItem wa-header-whatsappInstance" title={`Número WhatsApp: ${whatsappInstanceLabel}`}>
            {whatsappInstanceLabel}
          </span>
        </>
      ) : null}
    </div>
  );

  const identityContent = (
    <>
      <div className="wa-avatarWrap">
        <div className="wa-avatarButton">
          <div
            className={`wa-avatar${avatarTint ? " wa-avatar--tint" : ""}`}
            style={avatarTint ? { "--wa-avatar-tint": avatarTint } : undefined}
            aria-hidden="true"
          >
            {showAvatarImg ? (
              <img
                src={avatarUrl}
                alt=""
                className="wa-avatar-img"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={onAvatarError}
              />
            ) : (
              avatarFallback
            )}
          </div>
        </div>
      </div>
      <div className="wa-header-info">
        <div className="wa-header-titleBlock">
          <div className="wa-header-titleRow">
            <span className="wa-header-name" title={nome}>
              {nome}
            </span>
          </div>
          <div className="wa-header-metaBlock">{metaStrip}</div>
        </div>
        {isSomeoneTyping ? (
          <div className="wa-header-typingRow">
            <span className="wa-typing-dots">
              digitando
              <span className="wa-typing-dots-inner">
                <span className="wa-typing-dot">.</span>
                <span className="wa-typing-dot">.</span>
                <span className="wa-typing-dot">.</span>
              </span>
            </span>
          </div>
        ) : contactPresenceLabel ? (
          <div className="wa-header-typingRow wa-header-presenceRow">
            <span
              className={`wa-presence-label${contactPresenceAnimate ? " wa-typing-dots" : ""}`}
              title={contactPresenceLabel}
            >
              {contactPresenceLabel}
              {contactPresenceAnimate ? (
                <span className="wa-typing-dots-inner">
                  <span className="wa-typing-dot">.</span>
                  <span className="wa-typing-dot">.</span>
                  <span className="wa-typing-dot">.</span>
                </span>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <div
      ref={headerRef}
      className={`wa-header ${isGroup ? "wa-header--group" : ""} ${showSetorBelow ? "wa-header--setorBelow" : ""} ${setorInline ? "wa-header--setorInline" : ""} ${headerAtendCompact && !isGroup ? "wa-header--atendMobile" : ""} ${headerAtendCompact && !isGroup && headerCrmAtivoLayout ? "wa-header--crmAtivo" : ""}`}
    >
      <button
        type="button"
        className="wa-header-back"
        onClick={onBack}
        aria-label="Voltar para lista de conversas"
        title="Voltar"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      </button>
      {setorInline ? (
        /*
         * Com o chip do setor dentro da faixa do selo, o bloco de identidade não pode ser um
         * <button> (botão dentro de botão é inválido e o leitor de tela achata o conteúdo).
         * Padrão "link esticado": um botão transparente cobre o bloco inteiro (abre os dados
         * do contato) e o chip fica por cima dele (z-index), com clique e foco próprios.
         */
        <div className="wa-header-left wa-header-left--split">
          <button
            type="button"
            className="wa-header-leftHit"
            onClick={onOpenClienteSide}
            disabled={!conversaId}
            title={dadosContatoLabel}
            aria-label={`${dadosContatoLabel}: ${nome}`}
            aria-expanded={clienteSideOpen}
            aria-haspopup="dialog"
          />
          {identityContent}
        </div>
      ) : (
        <button
          type="button"
          className="wa-header-left"
          onClick={onOpenClienteSide}
          disabled={!conversaId}
          title={dadosContatoLabel}
          aria-label={dadosContatoLabel}
          aria-expanded={clienteSideOpen}
          aria-haspopup="dialog"
        >
          {identityContent}
        </button>
      )}

      {/* Modo simples: sem setor e, muitas vezes, sem ações — a linha some por CSS
          (`:not(:has(button))`), para não sumir junto com o botão de orçamento. */}
      {headerCompact && !isGroup ? (
        <div className="wa-header-mobileRow2" aria-label="Setor e ações de atendimento">
          {/* O próprio chip do setor é o botão ("Comercial ▾"): o "Trocar" de 9px separado saiu
              e a fileira ganhou espaço para "Transferir"/"Encerrar" por extenso (E08). */}
          <div className="wa-header-mobileRow2-sector">{modoSimples ? null : renderSetorChip()}</div>
          <div className="wa-header-mobileRow2-actions">
            <div className="wa-actions">
              <AtendimentoActions
                compactToolbar={headerAtendCompact}
                splitCompactHeader
                overflowTop={headerAtendCompact ? renderCompactOverflowTop : undefined}
                showOrcamento={!isGroup && !!conversaId && canCriarOrcamentoWm}
                onOrcamento={onOpenOrcamentoDrawer}
                showToast={showToast}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="wa-header-right">
        <div className="wa-header-innerRow">
          <div className="wa-header-iconsLine">
            {conversaId && (!headerAtendCompact || isGroup) ? (
              <button
                type="button"
                className="wa-header-btn wa-header-searchBtn"
                onClick={onOpenMessageSearch}
                title="Pesquisar mensagens (Ctrl+Shift+F)"
                aria-label="Pesquisar mensagens nesta conversa"
              >
                <IconSearch />
              </button>
            ) : null}

            {!isGroup && conversaId && mostrarEnviarCrm ? (
              <SendToCrmChatButton
                ref={sendCrmRef}
                conversaId={conversaId}
                hideToolbarButton={headerAtendCompact}
                isGroup={isGroup}
                crmEnabled={mostrarEnviarCrm}
              />
            ) : null}
          </div>

          {!isGroup && !headerCompact ? (
            <div className="wa-header-actionsRow">
              <div className="wa-actions">
                <AtendimentoActions
                  compactToolbar={headerAtendCompact}
                  overflowTop={headerAtendCompact ? renderCompactOverflowTop : undefined}
                  showOrcamento={!isGroup && !!conversaId && canCriarOrcamentoWm}
                  onOrcamento={onOpenOrcamentoDrawer}
                  showToast={showToast}
                />
              </div>
            </div>
          ) : null}

          {headerAtendCompact && !isGroup ? null : (
            <div className="wa-header-moreWrap" ref={moreMenuWrapRef}>
              <button
                ref={moreTriggerRef}
                title="Mais opções"
                className={`wa-header-btn wa-header-moreBtn ${moreMenuOpen || tagsOpen || showTimeline || showProdutosPanel ? "isActive" : ""}`}
                type="button"
                aria-expanded={moreMenuOpen}
                aria-haspopup="menu"
                aria-label="Mais opções"
                onClick={() => setMoreMenuOpen((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" && !moreMenuOpen) {
                    e.preventDefault();
                    setMoreMenuOpen(true);
                  }
                }}
              >
                <IconMore />
              </button>
              {moreMenuOpen ? (
                <>
                  <div
                    className="wa-atendToolbar-backdrop"
                    aria-hidden="true"
                    onClick={closeMoreMenu}
                  />
                  <div
                    ref={moreMenuRef}
                    className="wa-atendToolbar-dropdown wa-header-moreDropdown"
                    role="menu"
                    aria-label="Mais opções"
                    onKeyDown={onMoreMenuKeyDown}
                  >
                    <div className="wa-atendToolbar-menuExtras" role="none">
                      {renderTagsHistoryProductsItems(closeMoreMenu)}
                      {/* Setor também aqui (desktop com o chip na linha do selo): no desktop
                          apertado o chip é cortado/escondido e este passa a ser o caminho. Sempre
                          presente — menu que muda com a largura da janela confunde. */}
                      {setorInline && podeTransferirSetor && conversaId ? (
                        <HeaderOverflowSheetBtn
                          icon={<Building2 {...MENU_ICON} />}
                          label={setorAtual ? "Transferir setor" : "Definir setor"}
                          onClick={() => {
                            onOpenTransferirSetor?.();
                            closeMoreMenu();
                          }}
                        />
                      ) : null}
                      <HeaderOverflowSheetBtn
                        icon={<UserRound {...MENU_ICON} />}
                        label={dadosContatoLabel}
                        disabled={!conversaId}
                        onClick={() => {
                          onOpenClienteSide();
                          closeMoreMenu();
                        }}
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {showSetorBelow ? (
        <div className="wa-header-setorRow" aria-label="Setor da conversa">
          <span className="wa-header-setorLabel">Setor</span>
          {renderSetorControls({ omitSetorPrefix: true })}
        </div>
      ) : null}
      {!isGroup && podeGerenciarTags && conversaId ? (
        <ConversationWhatsappLabels
          key={`${conversaId}:${whatsappLabelsContext?.instanceId || ""}:${whatsappLabelsContext?.chat || ""}`}
          conversaId={conversaId}
          instanceId={whatsappLabelsContext?.instanceId}
          chat={whatsappLabelsContext?.chat}
          open={labelsOpen}
          onClose={closeLabels}
          onOpen={openLabels}
        />
      ) : null}
    </div>
  );
}

export default memo(ConversaHeader);
