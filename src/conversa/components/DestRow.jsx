import { useState } from "react";
import { IconCheck, IconUser } from "@tabler/icons-react";
import { getAvatarImageSrc } from "../../utils/avatarProxyUrl";

/**
 * Linha de destino estilo WhatsApp (quadradinho + avatar + nome/subtítulo).
 * Saiu do ForwardModal em 18/11/2026 para o ShareContactModal usar a MESMA pele —
 * CSS em conversa.css (.wa-fwdRow/.wa-fwdCheck) e forwardModal.css (.wa-forwardAvatar).
 * Só apresentação: nenhum estado de envio mora aqui.
 */

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

export function Avatar({ name, foto, size = 44, placeholder = false }) {
  const [imgError, setImgError] = useState(false);
  const { initials, bg, color } = getAvatar(name);
  const showImg = !imgError && isValidAvatarUrl(foto);
  // Contato sem nome (só o número): boneco genérico, como o WhatsApp — iniciais de
  // um telefone ("+5", "55") não dizem nada.
  const conteudo = showImg ? null : placeholder ? <IconUser size={Math.round(size * 0.5)} strokeWidth={1.7} /> : initials;
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
          /* Foto de host de terceiros vai pelo /media/proxy — ver utils/avatarProxyUrl.js. */
          src={getAvatarImageSrc(foto) || foto}
          alt=""
          className="wa-forwardAvatar-img"
          onError={() => setImgError(true)}
        />
      ) : (
        conteudo
      )}
    </span>
  );
}

export function DestRow({ name, sub, badge, foto, checked, disabled, onToggle, placeholder }) {
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
      <Avatar name={name} foto={foto} placeholder={placeholder} />
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

export default DestRow;
