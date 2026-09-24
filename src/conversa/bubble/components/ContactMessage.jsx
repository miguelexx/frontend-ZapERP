import { useMemo, useState } from "react";
import { resolveContactMetaFromMessage, resolveContactListFromMessage } from "../../../utils/conversaUtils";
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

function iniciaisDe(nome) {
  return (
    String(nome || "")
      .trim()
      .split(/\s+/)
      .map((s) => s[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

/** Avatar (foto ou iniciais) reutilizado no cartão único e na lista de vários contatos. */
function ContactAvatar({ nome, foto }) {
  const fotoOk = foto && String(foto).trim().startsWith("http") ? String(foto).trim() : null;
  return (
    <div className="wa-bubble-contactAvatarWrap">
      {fotoOk ? (
        <img
          src={fotoOk}
          alt=""
          className="wa-bubble-contactAvatar"
          referrerPolicy="no-referrer"
          loading="eager"
          decoding="async"
        />
      ) : (
        <span className="wa-bubble-contactInitials" aria-hidden="true">{iniciaisDe(nome)}</span>
      )}
    </div>
  );
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
  const [conversarBusyKey, setConversarBusyKey] = useState(null);
  const [expandido, setExpandido] = useState(false);

  const lista = useMemo(() => resolveContactListFromMessage(msg) || [], [msg]);
  const multiplos = lista.length > 1;

  // Contato único: mantém exatamente o cartão original.
  const meta = contactMeta || (lista.length === 1 ? lista[0] : resolveContactMetaFromMessage(msg));

  const handleCardClick = (e) => {
    if (!selectMode) e.stopPropagation();
  };

  const conversarCom = async (contato, key) => {
    if (selectMode || conversarBusyKey || !onConversar) return;
    setConversarBusyKey(key);
    try {
      await onConversar({
        nome: contato.nome,
        telefone: contato.telefone,
        whatsapp_instance_id: msg?.whatsapp_instance_id ?? null,
      });
    } finally {
      setConversarBusyKey(null);
    }
  };

  // ---- Vários contatos compartilhados de uma vez (estilo WhatsApp) ----
  if (multiplos) {
    const primeiro = lista[0];
    const outros = lista.length - 1;
    const titulo = `${primeiro?.nome || "Contato"} e ${outros} outro${outros > 1 ? "s" : ""} contato${outros > 1 ? "s" : ""}`;
    const preview = lista.slice(0, 3);

    return (
      <div
        className={`wa-bubble-contactCard wa-bubble-contactCard--multi ${out ? "wa-bubble-contactCard--out" : ""}`}
        onClick={handleCardClick}
      >
        <button
          type="button"
          className="wa-bubble-contactMultiHeader"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!selectMode) setExpandido((v) => !v);
          }}
          aria-expanded={expandido}
        >
          <div className="wa-bubble-contactStack" aria-hidden="true">
            {preview.map((c, i) => (
              <div className="wa-bubble-contactStackItem" style={{ zIndex: preview.length - i }} key={i}>
                <ContactAvatar nome={c.nome} foto={c.foto_perfil} />
              </div>
            ))}
          </div>
          <div className="wa-bubble-contactInfo">
            <span className="wa-bubble-contactName">{titulo}</span>
            <span className="wa-bubble-contactTimeMeta">
              <span className="wa-bubble-contactTime">{formatHora(msg?.criado_em)}</span>
              <MessageStatus msg={msg} isGroup={Boolean(isGroup)} />
            </span>
          </div>
          <span className={`wa-bubble-contactChevron ${expandido ? "isOpen" : ""}`} aria-hidden="true">⌄</span>
        </button>

        {expandido ? (
          <div className="wa-bubble-contactList" role="list">
            {lista.map((c, i) => {
              const telFmt = formatContactPhone(c.telefone);
              const key = `c-${i}-${c.telefone || c.nome}`;
              const busy = conversarBusyKey === key;
              return (
                <div className="wa-bubble-contactListRow" role="listitem" key={key}>
                  <ContactAvatar nome={c.nome} foto={c.foto_perfil} />
                  <div className="wa-bubble-contactListInfo">
                    <span className="wa-bubble-contactName">{c.nome || "Contato"}</span>
                    {telFmt ? <span className="wa-bubble-contactPhone">{telFmt}</span> : null}
                  </div>
                  <button
                    type="button"
                    className="wa-bubble-contactMiniAction"
                    disabled={!!selectMode || busy || !c.telefone}
                    aria-busy={busy}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      conversarCom(c, key);
                    }}
                  >
                    {busy ? "Abrindo…" : "Conversar"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="wa-bubble-contactActions">
            <button
              type="button"
              className="wa-bubble-contactAction"
              disabled={!!selectMode}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!selectMode) setExpandido(true);
              }}
            >
              Ver todos
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---- Contato único (comportamento original) ----
  if (!meta) return null;
  const nome = meta.nome || "Contato";
  const telefone = meta.telefone || null;
  const telefoneFmt = formatContactPhone(telefone);

  return (
    <div className={`wa-bubble-contactCard ${out ? "wa-bubble-contactCard--out" : ""}`} onClick={handleCardClick}>
      <div className="wa-bubble-contactHeader">
        <ContactAvatar nome={nome} foto={meta.foto_perfil} />
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
          disabled={!!selectMode || conversarBusyKey === "single"}
          aria-busy={conversarBusyKey === "single"}
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await conversarCom({ nome, telefone }, "single");
          }}
        >
          {conversarBusyKey === "single" ? "Abrindo…" : "Conversar"}
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
