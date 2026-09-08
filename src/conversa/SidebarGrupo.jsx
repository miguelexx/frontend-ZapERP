import { useEffect, useMemo, useState } from "react";
import { useNotificationStore } from "../notifications/notificationStore";
import { pickLoadedMediaSrcFromEvent } from "./utils/conversaViewHelpers";
import { IconClose } from "./conversaViewIcons";
import { useGroupWhatsapp } from "./hooks/useGroupWhatsapp";

function initials(nome = "") {
  const parts = String(nome || "").trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase() || "G";
}

function rankLabel(p) {
  if (p?.creator) return "Criador";
  if (p?.admin) return "Admin";
  return "";
}

function formatPhoneDisplay(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const rest = d.slice(2);
    const ddd = rest.slice(0, 2);
    const num = rest.slice(2);
    if (num.length === 9) return `+55 ${ddd} ${num.slice(0, 5)}-${num.slice(5)}`;
    if (num.length === 8) return `+55 ${ddd} ${num.slice(0, 4)}-${num.slice(4)}`;
  }
  return phone || "";
}

export default function SidebarGrupo({
  open,
  onClose,
  onOpenAvatar,
  conversa,
  panelRef,
  statusTone,
  statusLabel,
  createdAt,
}) {
  const showToast = useNotificationStore((s) => s.showToast);
  const conversaId = conversa?.id;
  const group = useGroupWhatsapp({ open, conversaId, showToast });
  const [addPhone, setAddPhone] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editing, setEditing] = useState(false);
  const [photoError, setPhotoError] = useState(false);

  const name = group.grupo?.name || conversa?.nome_grupo || "Grupo";
  const foto = group.grupo?.photo || conversa?.foto_grupo || null;
  const participants = Array.isArray(group.grupo?.participants) ? group.grupo.participants : [];
  const count = group.grupo?.participants_count || participants.length;
  const canManage = Boolean(group.grupo?.canManage);
  const settings = group.grupo?.settings || {};
  const inviteLink = group.invite?.inviteLink || (group.invite?.inviteCode ? `https://chat.whatsapp.com/${group.invite.inviteCode}` : "");

  useEffect(() => {
    setPhotoError(false);
  }, [foto, conversaId]);

  const sorted = useMemo(() => {
    const rankW = (p) => (p.creator ? 0 : p.admin ? 1 : 2);
    return [...participants].sort((a, b) => rankW(a) - rankW(b) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  }, [participants]);

  const handleOpenPhoto = (e) => {
    if (!onOpenAvatar || !foto || photoError) return;
    onOpenAvatar({ src: pickLoadedMediaSrcFromEvent(e) || foto, name });
  };

  if (!open) return null;

  return (
    <div ref={panelRef} className="wa-sideCliente" role="dialog" aria-label="Dados do grupo">
      <div className="wa-sideCliente-head">
        <div className="wa-sideCliente-titleBlock">
          <span className="wa-sideCliente-title">Dados do grupo</span>
        </div>
        <button type="button" className="wa-iconBtn" onClick={onClose} title="Fechar" aria-label="Fechar">
          <IconClose />
        </button>
      </div>
      <div className="wa-sideCliente-body">
        <section className="wa-sideCliente-profile" aria-label="Perfil do grupo">
          <button
            type="button"
            className={`wa-sideCliente-photoBtn${foto && !photoError ? " isZoomable" : ""}`}
            onClick={handleOpenPhoto}
            disabled={!foto || photoError}
            aria-label={`Foto de ${name}`}
          >
            <span className="wa-sideCliente-photo" aria-hidden="true">
              <span className="wa-sideCliente-avatarFallback">{initials(name)}</span>
              {foto && !photoError ? (
                <img className="wa-sideCliente-avatarImg" src={foto} alt="" decoding="async" referrerPolicy="no-referrer" onError={() => setPhotoError(true)} />
              ) : null}
            </span>
          </button>
          <h2 className="wa-sideCliente-profileName">{name}</h2>
          <p className="wa-sideCliente-profileMeta">{count ? `${count} participantes` : "Grupo"}</p>
          <span className={`wa-sideCliente-pill wa-sideCliente-pill--${statusTone}`}>{statusLabel}</span>
        </section>

        {group.loading ? <p className="wa-sideCliente-muted">Carregando dados do WhatsApp…</p> : null}

        {group.grupo?.description ? (
          <section className="wa-sideCliente-card">
            <div className="wa-sideCliente-kv">
              <span className="wa-sideCliente-kvLabel">Recado do grupo</span>
              <div className="wa-sideCliente-kvValue">{group.grupo.description}</div>
            </div>
          </section>
        ) : null}

        <section className="wa-sideCliente-card" aria-label="Informações do grupo">
          {createdAt ? (
            <div className="wa-sideCliente-kv">
              <span className="wa-sideCliente-kvLabel">Criado em</span>
              <div className="wa-sideCliente-kvValue">{createdAt}</div>
            </div>
          ) : null}
          {group.grupo?.localOnly ? (
            <div className="wa-sideCliente-kv">
              <span className="wa-sideCliente-kvLabel">WhatsApp</span>
              <div className="wa-sideCliente-kvValue">Este grupo ainda não está vinculado a um ID real do WhatsApp.</div>
            </div>
          ) : null}
        </section>

        {canManage && !group.grupo?.localOnly ? (
          <section className="wa-sideCliente-card" aria-label="Ações do grupo">
            <div className="wa-sideCliente-quickRow">
              <button type="button" className="wa-sideCliente-quickBtn" disabled={!!group.busy} onClick={() => group.loadInvite()}>
                Link do grupo
              </button>
              <button type="button" className="wa-sideCliente-quickBtn" disabled={!!group.busy} onClick={() => {
                setEditName(name);
                setEditDesc(group.grupo?.description || "");
                setEditing((v) => !v);
              }}>
                {editing ? "Cancelar" : "Editar"}
              </button>
              <button
                type="button"
                className="wa-sideCliente-quickBtn"
                disabled={!!group.busy}
                onClick={() => {
                  if (window.confirm("Sair deste grupo?")) group.leave();
                }}
              >
                Sair
              </button>
            </div>
            <div className="wa-groupPhotoRow">
              <label className="wa-sideCliente-quickBtn">
                Alterar foto
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  disabled={!!group.busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const media = String(reader.result || "");
                      if (media) group.setPhoto(media, file.type);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {foto ? (
                <button type="button" className="wa-sideCliente-quickBtn" disabled={!!group.busy} onClick={() => group.removePhoto()}>
                  Remover foto
                </button>
              ) : null}
            </div>
            {inviteLink ? (
              <div className="wa-groupInviteBox">
                <code className="wa-groupInviteLink">{inviteLink}</code>
                <div className="wa-sideCliente-quickRow">
                  <button
                    type="button"
                    className="wa-sideCliente-quickBtn"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteLink);
                        showToast({ type: "success", title: "Copiado", message: "Link do grupo copiado." });
                      } catch {
                        showToast({ type: "error", title: "Copiar", message: "Não foi possível copiar." });
                      }
                    }}
                  >
                    Copiar
                  </button>
                  <button type="button" className="wa-sideCliente-quickBtn" disabled={!!group.busy} onClick={() => group.revokeInvite()}>
                    Redefinir
                  </button>
                </div>
                <form
                  className="wa-groupAddRow"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!invitePhone.trim()) return;
                    group.sendInvite(invitePhone.trim());
                    setInvitePhone("");
                  }}
                >
                  <input className="wa-input" placeholder="Enviar convite para o número" value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} />
                  <button type="submit" className="wa-btn wa-btn-primary" disabled={!!group.busy}>Enviar</button>
                </form>
              </div>
            ) : null}
            {editing ? (
              <form
                className="wa-groupEditForm"
                onSubmit={(e) => {
                  e.preventDefault();
                  group.updateInfo({ nome: editName || name, descricao: editDesc });
                  setEditing(false);
                }}
              >
                <input className="wa-input" placeholder="Nome do grupo" value={editName} onChange={(e) => setEditName(e.target.value)} />
                <textarea className="wa-input" rows={3} placeholder="Recado do grupo" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                <button type="submit" className="wa-btn wa-btn-primary" disabled={!!group.busy}>Salvar</button>
              </form>
            ) : null}
            <div className="wa-groupSettings">
              <label className="wa-groupSetting">
                <span>Só admins enviam mensagens</span>
                <input
                  type="checkbox"
                  checked={settings.send_messages === "admins"}
                  disabled={!!group.busy}
                  onChange={(e) => group.updateSetting("send_messages", e.target.checked ? "admins" : "anyone")}
                />
              </label>
              <label className="wa-groupSetting">
                <span>Só admins editam dados</span>
                <input
                  type="checkbox"
                  checked={settings.edit_group_info === "admins"}
                  disabled={!!group.busy}
                  onChange={(e) => group.updateSetting("edit_group_info", e.target.checked ? "admins" : "anyone")}
                />
              </label>
              <label className="wa-groupSetting">
                <span>Só admins adicionam membros</span>
                <input
                  type="checkbox"
                  checked={settings.add_participants === "admins"}
                  disabled={!!group.busy}
                  onChange={(e) => group.updateSetting("add_participants", e.target.checked ? "admins" : "anyone")}
                />
              </label>
              <label className="wa-groupSetting">
                <span>Aprovar quem pede para entrar</span>
                <input
                  type="checkbox"
                  checked={settings.approve_participants === "admins"}
                  disabled={!!group.busy}
                  onChange={(e) => group.updateSetting("approve_participants", e.target.checked ? "admins" : "anyone")}
                />
              </label>
            </div>
            <form
              className="wa-groupAddRow"
              onSubmit={(e) => {
                e.preventDefault();
                if (!addPhone.trim()) return;
                group.addParticipant(addPhone.trim());
                setAddPhone("");
              }}
            >
              <input className="wa-input" placeholder="Adicionar participante (DDI+número)" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} />
              <button type="submit" className="wa-btn wa-btn-primary" disabled={!!group.busy}>Adicionar</button>
            </form>
            <button type="button" className="wa-sideCliente-quickBtn" onClick={() => group.loadApps()}>
              Pedidos para entrar
            </button>
            {Array.isArray(group.apps) && group.apps.length ? (
              <ul className="wa-groupPeopleList">
                {group.apps.map((a) => {
                  const id = a.chatId || a.application || a.id;
                  return (
                    <li key={id} className="wa-groupPerson">
                      <span className="wa-groupPersonMeta">
                        <span className="wa-groupPersonName">{id}</span>
                        <span className="wa-groupPersonSub">Quer entrar no grupo</span>
                      </span>
                      <span className="wa-groupPersonActions">
                        <button type="button" disabled={!!group.busy} onClick={() => group.approveApp(id)}>Aceitar</button>
                        <button type="button" disabled={!!group.busy} onClick={() => group.rejectApp(id)}>Recusar</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section className="wa-groupPeople" aria-label="Participantes">
          <h3 className="wa-groupPeopleTitle">{count ? `${count} participantes` : "Participantes"}</h3>
          {sorted.length === 0 && !group.loading ? (
            <p className="wa-sideCliente-muted">Nenhum participante listado ainda. Abra o grupo no celular se os nomes não aparecerem.</p>
          ) : null}
          <ul className="wa-groupPeopleList">
            {sorted.map((p) => (
              <li key={p.id || p.phone} className="wa-groupPerson">
                <span className="wa-groupPersonAvatar" aria-hidden="true">
                  {p.foto ? <img src={p.foto} alt="" referrerPolicy="no-referrer" /> : initials(p.nome)}
                </span>
                <span className="wa-groupPersonMeta">
                  <span className="wa-groupPersonName">{p.nome}</span>
                  <span className="wa-groupPersonSub">
                    {rankLabel(p) ? `${rankLabel(p)} · ` : ""}
                    {formatPhoneDisplay(p.phone) || "sem número"}
                  </span>
                </span>
                {canManage && (p.phone || p.id) ? (
                  <span className="wa-groupPersonActions">
                    {!p.admin && !p.creator ? (
                      <button type="button" disabled={!!group.busy} onClick={() => group.promote(p.phone || p.id)}>Admin</button>
                    ) : p.admin && !p.creator ? (
                      <button type="button" disabled={!!group.busy} onClick={() => group.demote(p.phone || p.id)}>Remover admin</button>
                    ) : null}
                    {!p.creator ? (
                      <button type="button" disabled={!!group.busy} onClick={() => group.removeParticipant(p.phone || p.id)}>Remover</button>
                    ) : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
