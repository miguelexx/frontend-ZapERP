import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FORWARD_DEST_MAX } from "../conversaConstants";
import { safeString } from "../utils/conversaViewHelpers";
import { IconClose, IconForward } from "../conversaViewIcons";
import { isGroupConversation } from "../../utils/conversaUtils";
import {
  IconArrowForwardUp,
  IconCheck,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react";

const AVATAR_PALETTES = [
  { bg: "rgba(136,99,207,0.18)", color: "#8863cf" },
  { bg: "rgba(47,158,226,0.18)", color: "#2f9ee2" },
  { bg: "rgba(0,168,132,0.18)", color: "#00a884" },
  { bg: "rgba(226,68,92,0.15)", color: "#e2445c" },
  { bg: "rgba(214,152,62,0.18)", color: "#d6983e" },
  { bg: "rgba(77,178,201,0.18)", color: "#4db2c9" },
];

function getAvatar(name) {
  const s = String(name || "").trim();
  const parts = s.split(/\s+/);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : (s.slice(0, 2) || "?").toUpperCase();
  const palette = AVATAR_PALETTES[(s.charCodeAt(0) || 0) % AVATAR_PALETTES.length];
  return { initials, ...palette };
}

function isValidAvatarUrl(url) {
  const s = url != null ? String(url).trim() : "";
  return s.length > 0 && /^https?:\/\//i.test(s) && s.toLowerCase() !== "null";
}

function Avatar({ name, foto, size = 44 }) {
  const [imgError, setImgError] = useState(false);
  const { initials, bg, color } = getAvatar(name);
  const showImg = !imgError && isValidAvatarUrl(foto);
  return (
    <span
      className="wa-forwardAvatar"
      style={{
        width: size,
        height: size,
        minWidth: size,
        background: showImg ? "transparent" : bg,
        color,
      }}
      aria-hidden="true"
    >
      {showImg ? (
        <img
          src={foto}
          alt=""
          className="wa-forwardAvatar-img"
          onError={() => setImgError(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}

/** Linha de destino estilo WhatsApp: quadradinho + avatar + nome/subtítulo. */
function DestRow({ name, sub, badge, foto, checked, disabled, onToggle }) {
  return (
    <button
      type="button"
      className={`wa-fwdRow${checked ? " isChecked" : ""}`}
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      aria-pressed={checked}
    >
      <span className={`wa-fwdCheck${checked ? " isOn" : ""}`} aria-hidden="true">
        {checked ? <IconCheck size={15} strokeWidth={3} /> : null}
      </span>
      <Avatar name={name} foto={foto} />
      <span className="wa-fwdRow-info">
        <span className="wa-fwdRow-name">{name}</span>
        {badge ? (
          <span className={`wa-forwardBadge wa-forwardBadge--${badge.kind}`}>{badge.label}</span>
        ) : sub ? (
          <span className="wa-fwdRow-sub">{sub}</span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * Modal de encaminhamento — seletor de destinos estilo WhatsApp.
 * Estado e regras de envio permanecem no hook useForwardFlow.
 */
export default function ForwardModal({
  open,
  forwardMsgs,
  forwardPreviewLabel,
  forwardQuery,
  onForwardQueryChange,
  forwardSending,
  forwardSelectedConversaIds,
  forwardSelectedClienteIds,
  forwardMax10Msg,
  forwardColaboradoresLoading,
  forwardColaboradoresFiltered,
  forwardCandidates,
  forwardGrupos,
  forwardClientesLoading,
  forwardClientes,
  onClose,
  onConfirmForwardToColaborador,
  onToggleForwardConversaSelect,
  onToggleForwardClienteSelect,
  onConfirmForwardToSelected,
}) {
  const selConversaSet = useMemo(
    () => new Set((forwardSelectedConversaIds || []).map(String)),
    [forwardSelectedConversaIds]
  );
  const selClienteSet = useMemo(
    () => new Set((forwardSelectedClienteIds || []).map(String)),
    [forwardSelectedClienteIds]
  );

  // "Conversas recentes" mostra só conversas individuais; grupos vão para a seção "Grupos".
  const conversasNaoGrupo = useMemo(
    () => (Array.isArray(forwardCandidates) ? forwardCandidates : []).filter((c) => !isGroupConversation(c)),
    [forwardCandidates]
  );
  const grupos = useMemo(
    () => (Array.isArray(forwardGrupos) ? forwardGrupos : []),
    [forwardGrupos]
  );

  // Contatos que já aparecem como conversa recente (dedup por cliente_id).
  const conversaClienteIds = useMemo(() => {
    const set = new Set();
    (forwardCandidates || []).forEach((c) => {
      if (c?.cliente_id != null) set.add(String(c.cliente_id));
    });
    return set;
  }, [forwardCandidates]);

  const contatos = useMemo(() => {
    const list = Array.isArray(forwardClientes) ? forwardClientes : [];
    return list.filter((c) => c?.id != null && !conversaClienteIds.has(String(c.id))).slice(0, 200);
  }, [forwardClientes, conversaClienteIds]);

  if (!open || !forwardMsgs?.length) return null;

  const totalSel = selConversaSet.size + selClienteSet.size;
  const hasQuery = safeString(forwardQuery).trim().length > 0;

  return createPortal(
    <div
      className="wa-modalOverlay wa-forwardOverlay"
      role="dialog"
      aria-label="Encaminhar mensagem para"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        onClose?.();
      }}
    >
      <div className="wa-modal wa-forwardModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wa-forwardSheetHandle" aria-hidden="true" />

        {/* Header */}
        <div className="wa-modal-head">
          <div className="wa-forwardHeadLeft">
            <div className="wa-modal-title">Encaminhar mensagem para</div>
            <div className="wa-forwardHeadCounter" aria-live="polite">
              {totalSel > 0
                ? `${totalSel} de ${FORWARD_DEST_MAX} selecionado(s)`
                : `Escolha até ${FORWARD_DEST_MAX} destinos`}
            </div>
          </div>
          <button type="button" className="wa-iconBtn" onClick={onClose} title="Fechar">
            <IconClose />
          </button>
        </div>

        <div className="wa-modal-body wa-forwardBody">
          {/* Preview do que será encaminhado */}
          <div className="wa-forwardPreviewChip">
            <IconArrowForwardUp size={13} strokeWidth={2.2} aria-hidden="true" />
            <span>{forwardPreviewLabel}</span>
          </div>

          {/* Busca */}
          <div className="wa-forwardSearchWrap">
            <IconSearch
              size={16}
              strokeWidth={1.8}
              className="wa-forwardSearchIcon"
              aria-hidden="true"
            />
            <input
              className="wa-input wa-forwardSearch"
              value={forwardQuery}
              onChange={(e) => onForwardQueryChange?.(e.target.value)}
              placeholder="Pesquisar nome ou telefone…"
              aria-label="Pesquisar contato"
              autoFocus
            />
          </div>

          {forwardMax10Msg ? (
            <p className="wa-forwardMaxHint" role="status" aria-live="polite">
              {forwardMax10Msg}
            </p>
          ) : null}

          {/* Grupos */}
          {grupos.length > 0 ? (
            <div className="wa-forwardSection">
              <div className="wa-forwardSectionTitle">
                <IconUsers size={12} strokeWidth={2} aria-hidden="true" /> Grupos
              </div>
              <div className="wa-forwardList">
                {grupos.map((c) => {
                  const n =
                    safeString(
                      c?.nome_grupo || c?.contato_nome || c?.nome_contato_cache || c?.nome || c?.telefone
                    ) || "Grupo";
                  const foto = c?.foto_grupo ?? null;
                  const idStr = String(c.id);
                  return (
                    <DestRow
                      key={`grp-${c.id}`}
                      name={n}
                      badge={{ kind: "group", label: "Grupo" }}
                      foto={foto}
                      checked={selConversaSet.has(idStr)}
                      disabled={forwardSending}
                      onToggle={() => onToggleForwardConversaSelect?.(c.id)}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Conversas recentes (individuais) */}
          {conversasNaoGrupo.length > 0 ? (
            <div className="wa-forwardSection">
              <div className="wa-forwardSectionTitle">Conversas recentes</div>
              <div className="wa-forwardList">
                {conversasNaoGrupo.map((c) => {
                  const n =
                    safeString(
                      c?.contato_nome ||
                        c?.nome_contato_cache ||
                        c?.cliente_nome ||
                        c?.nome ||
                        c?.cliente?.nome ||
                        c?.telefone
                    ) || "Conversa";
                  const foto =
                    c?.foto_perfil ??
                    c?.foto_perfil_contato_cache ??
                    c?.cliente?.foto_perfil ??
                    c?.clientes?.foto_perfil ??
                    null;
                  const telLinha = safeString(c?.telefone_exibivel ?? c?.telefoneExibivel ?? c?.telefone);
                  const idStr = String(c.id);
                  return (
                    <DestRow
                      key={`conv-${c.id}`}
                      name={n}
                      sub={telLinha}
                      foto={foto}
                      checked={selConversaSet.has(idStr)}
                      disabled={forwardSending}
                      onToggle={() => onToggleForwardConversaSelect?.(c.id)}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Todos os contatos */}
          <div className="wa-forwardSection">
            <div className="wa-forwardSectionTitle">
              {hasQuery ? "Contatos" : "Todos os contatos"}
            </div>
            {forwardClientesLoading && contatos.length === 0 ? (
              <div className="wa-muted wa-forwardEmpty">Carregando contatos…</div>
            ) : contatos.length === 0 ? (
              <div className="wa-muted wa-forwardEmpty">
                {hasQuery ? "Nenhum contato encontrado." : "Nenhum contato disponível."}
              </div>
            ) : (
              <div className="wa-forwardList">
                {contatos.map((c) => {
                  const n = safeString(c?.nome || c?.telefone) || "Contato";
                  const idStr = String(c.id);
                  return (
                    <DestRow
                      key={`cli-${c.id}`}
                      name={n}
                      sub={c?.telefone ? String(c.telefone) : null}
                      foto={c?.foto_perfil ?? null}
                      checked={selClienteSet.has(idStr)}
                      disabled={forwardSending}
                      onToggle={() => onToggleForwardClienteSelect?.(c)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Colaboradores — envio direto ao chat interno (só na busca) */}
          {hasQuery && (
            <div className="wa-forwardSection">
              <div className="wa-forwardSectionTitle">
                <IconUsers size={12} strokeWidth={2} aria-hidden="true" /> Colaboradores
              </div>
              {forwardColaboradoresLoading ? (
                <div className="wa-muted wa-forwardEmpty">Carregando…</div>
              ) : forwardColaboradoresFiltered.length === 0 ? (
                <div className="wa-muted wa-forwardEmpty">Nenhum colaborador encontrado.</div>
              ) : (
                <div className="wa-forwardList">
                  {forwardColaboradoresFiltered.map((colab) => {
                    const uid = colab?.id ?? colab?.user_id ?? colab?.usuario_id;
                    const nome =
                      safeString(colab?.nome ?? colab?.name ?? colab?.full_name) || "Colaborador";
                    const email = safeString(colab?.email);
                    return (
                      <button
                        key={`colab-${uid != null ? String(uid) : nome}`}
                        type="button"
                        className="wa-forwardItem"
                        onClick={() => onConfirmForwardToColaborador?.(colab)}
                        title={`Encaminhar para ${nome} (chat interno)`}
                        disabled={forwardSending || uid == null}
                      >
                        <Avatar name={nome} size={40} />
                        <div className="wa-forwardItem-info">
                          <div className="wa-forwardItem-name">{nome}</div>
                          {email ? <div className="wa-forwardItem-sub">{email}</div> : null}
                          <span className="wa-forwardBadge wa-forwardBadge--internal">
                            Chat interno
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botão flutuante de envio (estilo WhatsApp) */}
        {totalSel > 0 ? (
          <button
            type="button"
            className="wa-fwdSendFab"
            onClick={onConfirmForwardToSelected}
            disabled={forwardSending}
            aria-label={`Encaminhar para ${totalSel} destino(s)`}
            title="Encaminhar"
          >
            <IconForward />
            <span className="wa-fwdSendFab-badge">{totalSel}</span>
          </button>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
