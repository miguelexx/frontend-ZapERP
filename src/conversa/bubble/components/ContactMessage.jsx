import { useState } from "react";
import { resolveContactMetaFromMessage } from "../../../utils/conversaUtils";
import { formatHora } from "../../utils/conversaViewHelpers";
import MessageStatus from "./MessageStatus";

/** Exibe o telefone como o WhatsApp: +55 11 98765-4321 (fallback: dígitos crus). */
function formatContactPhone(telefone) {
  const digits = String(telefone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const rest = digits.slice(2);
    const ddd = rest.slice(0, 2);
    const num = rest.slice(2);
    const meio = num.length === 9 ? `${num.slice(0, 5)}-${num.slice(5)}` : `${num.slice(0, 4)}-${num.slice(4)}`;
    return `+55 ${ddd} ${meio}`;
  }
  return `+${digits}`;
}

export default function ContactMessage({
  msg,
  contactMeta,
  selectMode,
  isGroup,
  out,
  onConversar,
  onAdicionarGrupo,
}) {
  const [conversarBusy, setConversarBusy] = useState(false);
  const meta = contactMeta || resolveContactMetaFromMessage(msg);
  if (!meta) return null;
  const nome = meta.nome || "Contato";
  const telefone = meta.telefone || null;
  const telefoneFmt = formatContactPhone(telefone);
  const fotoPerfil = meta.foto_perfil && String(meta.foto_perfil).trim().startsWith("http")
    ? String(meta.foto_perfil).trim()
    : null;
  const iniciais = nome
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  const handleCardClick = (e) => {
    if (!selectMode) e.stopPropagation();
  };

  return (
    <div className={`wa-bubble-contactCard ${out ? "wa-bubble-contactCard--out" : ""}`} onClick={handleCardClick}>
      <div className="wa-bubble-contactHeader">
        <div className="wa-bubble-contactAvatarWrap">
          {fotoPerfil ? (
            <img
              src={fotoPerfil}
              alt=""
              className="wa-bubble-contactAvatar"
              referrerPolicy="no-referrer"
              loading="eager"
              decoding="async"
            />
          ) : (
            <span className="wa-bubble-contactInitials" aria-hidden="true">{iniciais}</span>
          )}
        </div>
        <div className="wa-bubble-contactInfo">
          <span className="wa-bubble-contactName">{nome}</span>
          {telefoneFmt ? <span className="wa-bubble-contactPhone">{telefoneFmt}</span> : null}
          <span className="wa-bubble-contactTimeMeta">
            <span className="wa-bubble-contactTime">{formatHora(msg?.criado_em)}</span>
            <MessageStatus msg={msg} isGroup={Boolean(isGroup)} />
          </span>
        </div>
      </div>
      <div className="wa-bubble-contactDivider" />
      <div className="wa-bubble-contactActions">
        <button
          type="button"
          className="wa-bubble-contactAction"
          disabled={!!selectMode || conversarBusy}
          aria-busy={conversarBusy}
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (selectMode || conversarBusy || !onConversar) return;
            setConversarBusy(true);
            try {
              await onConversar({
                nome,
                telefone,
                whatsapp_instance_id: msg?.whatsapp_instance_id ?? null,
              });
            } finally {
              setConversarBusy(false);
            }
          }}
        >
          {conversarBusy ? "Abrindo…" : "Conversar"}
        </button>
        <button
          type="button"
          className="wa-bubble-contactAction"
          disabled={!!selectMode}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!selectMode && onAdicionarGrupo) onAdicionarGrupo({ nome, telefone });
          }}
        >
          Adicionar a um grupo
        </button>
      </div>
    </div>
  );
}
