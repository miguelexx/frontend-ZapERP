import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  IconWorld, IconPlus, IconX, IconUsers, IconUsersGroup, IconCrown,
  IconSettings, IconLink, IconTrash, IconCopy, IconUserPlus, IconRefresh,
  IconPlayerPause, IconPlayerPlay, IconBan,
} from "@tabler/icons-react";
import { useComunidadesStore } from "../comunidades/comunidadesStore";
import { useNotificationStore } from "../notifications/notificationStore";
import { useWhatsappInstancesStore } from "../chats/whatsappInstancesStore";
import ConfirmDialog from "../components/feedback/ConfirmDialog";
import * as api from "../comunidades/comunidadesService";
import "../comunidades/comunidades.css";

function errMsg(e, fallback = "Algo deu errado.") {
  return e?.response?.data?.error || e?.message || fallback;
}
function parseNumeros(texto) {
  return String(texto || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function communityIdOf(c) {
  return String(c?.id || c?.chat_id || c?.group_id || "").trim();
}

/* ---------------------------------------------------------------- Modal base */
function CmModal({ title, onClose, children, footer, wide, busy }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose, busy]);
  return createPortal(
    <div className="cm-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div className={`cm-modal ${wide ? "cm-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="cm-modal-head">
          <h2 className="cm-modal-title">{title}</h2>
          <button className="cm-iconbtn" onClick={() => !busy && onClose?.()} aria-label="Fechar"><IconX size={20} /></button>
        </div>
        <div className="cm-modal-body">{children}</div>
        {footer ? <div className="cm-modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

/* ---------------------------------------------------------------- Criar comunidade */
function CriarComunidadeModal({ instanceId, onClose, onCreated }) {
  const showToast = useNotificationStore((s) => s.showToast);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (!nome.trim()) { setErro("Informe o nome da comunidade."); return; }
    setBusy(true); setErro("");
    try {
      const r = await api.criarComunidade({ nome: nome.trim(), descricao: descricao.trim(), instanceId });
      showToast({ type: "success", title: "Comunidade criada", message: nome.trim() });
      onCreated?.(r?.data || null);
    } catch (e) { setErro(errMsg(e, "Não foi possível criar a comunidade.")); }
    finally { setBusy(false); }
  }

  return (
    <CmModal title="Nova comunidade" onClose={onClose} busy={busy}
      footer={<>
        <button className="cm-btn" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="cm-btn cm-btn--primary" onClick={salvar} disabled={busy}>
          {busy ? <span className="cm-spin" /> : <IconPlus size={18} />} Criar
        </button>
      </>}>
      {erro ? <div className="cm-alert" role="alert">{erro}</div> : null}
      <div className="cm-field">
        <label className="cm-label">Nome</label>
        <input className="cm-input" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Clientes VIP" maxLength={100} />
      </div>
      <div className="cm-field">
        <label className="cm-label">Descrição (opcional)</label>
        <textarea className="cm-textarea" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Sobre o que é esta comunidade…" maxLength={2000} />
      </div>
      <div className="cm-info">Ao criar, o WhatsApp gera automaticamente um grupo de <b>Avisos</b> e um grupo geral. Você poderá criar/vincular mais grupos depois.</div>
    </CmModal>
  );
}

/* ---------------------------------------------------------------- Adicionar participantes (fila) */
function AddParticipantesModal({ instanceId, comunidade, onClose, onEnfileirado }) {
  const showToast = useNotificationStore((s) => s.showToast);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(null);
  const numeros = useMemo(() => parseNumeros(texto), [texto]);

  async function enviar() {
    if (!numeros.length) { setErro("Cole ao menos um número."); return; }
    setBusy(true); setErro("");
    try {
      const r = await api.enfileirarParticipantes(communityIdOf(comunidade), {
        participantes: numeros, instanceId, comunidadeNome: comunidade?.name || comunidade?.subject,
      });
      setResultado(r);
      onEnfileirado?.();
      showToast({
        type: r?.vazio ? "info" : "success",
        title: r?.vazio ? "Nada a adicionar" : "Adição enfileirada",
        message: r?.vazio ? "Todos já estão na comunidade ou na fila." : `${r?.total || 0} na fila (ritmo conservador).`,
      });
    } catch (e) { setErro(errMsg(e, "Não foi possível enfileirar.")); }
    finally { setBusy(false); }
  }

  return (
    <CmModal title="Adicionar participantes" onClose={onClose} busy={busy}
      footer={resultado ? (
        <button className="cm-btn cm-btn--primary" onClick={onClose}>Concluir</button>
      ) : (<>
        <button className="cm-btn" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="cm-btn cm-btn--primary" onClick={enviar} disabled={busy || !numeros.length}>
          {busy ? <span className="cm-spin" /> : <IconUserPlus size={18} />} Enfileirar {numeros.length || ""}
        </button>
      </>)}>
      {erro ? <div className="cm-alert" role="alert">{erro}</div> : null}
      {resultado ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="cm-info">
            Adição enfileirada com ritmo <b>ultra-conservador</b> para proteger o número.
            {resultado?.eta?.diasEstimados ? <> Estimativa: ~<b>{resultado.eta.diasEstimados} dia(s)</b> (~{resultado.eta.porDia}/dia).</> : null}
          </div>
          <div className="cm-stats">
            <div className="cm-stat"><span className="cm-stat-num">{resultado.total || 0}</span><span className="cm-stat-label">na fila</span></div>
            <div className="cm-stat"><span className="cm-stat-num">{resultado.ignorados || 0}</span><span className="cm-stat-label">já na comunidade</span></div>
            <div className="cm-stat"><span className="cm-stat-num">{resultado.jaNaFila || 0}</span><span className="cm-stat-label">já estavam na fila</span></div>
          </div>
          <div className="cm-hint">Acompanhe o progresso no painel “Operações em andamento”.</div>
        </div>
      ) : (<>
        <div className="cm-field">
          <label className="cm-label">Números (um por linha ou separados por vírgula)</label>
          <textarea className="cm-textarea" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder={"5511999999999\n5511888888888"} />
          <span className="cm-hint">{numeros.length} número(s). Quem já está na comunidade é ignorado automaticamente.</span>
        </div>
        <div className="cm-info">
          Para reduzir o risco de bloqueio, as adições são feitas <b>aos poucos</b> (intervalo variável, teto por hora/dia por número),
          com <b>backoff</b> e <b>pausa automática</b> em sinais de limitação. Nada é disparado em massa de uma vez.
        </div>
      </>)}
    </CmModal>
  );
}

/* ---------------------------------------------------------------- Criar grupo na comunidade */
function CriarGrupoModal({ instanceId, comunidade, onClose, onCreated }) {
  const showToast = useNotificationStore((s) => s.showToast);
  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const numeros = useMemo(() => parseNumeros(texto), [texto]);

  async function salvar() {
    if (!nome.trim()) { setErro("Informe o nome do grupo."); return; }
    if (!numeros.length) { setErro("Informe ao menos um participante."); return; }
    setBusy(true); setErro("");
    try {
      await api.criarGrupoNaComunidade(communityIdOf(comunidade), { nome: nome.trim(), participantes: numeros, instanceId });
      showToast({ type: "success", title: "Grupo criado", message: nome.trim() });
      onCreated?.();
    } catch (e) { setErro(errMsg(e, "Não foi possível criar o grupo.")); }
    finally { setBusy(false); }
  }

  return (
    <CmModal title="Criar grupo na comunidade" onClose={onClose} busy={busy}
      footer={<>
        <button className="cm-btn" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="cm-btn cm-btn--primary" onClick={salvar} disabled={busy}>
          {busy ? <span className="cm-spin" /> : <IconPlus size={18} />} Criar
        </button>
      </>}>
      {erro ? <div className="cm-alert" role="alert">{erro}</div> : null}
      <div className="cm-field">
        <label className="cm-label">Nome do grupo</label>
        <input className="cm-input" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} />
      </div>
      <div className="cm-field">
        <label className="cm-label">Participantes iniciais (1+)</label>
        <textarea className="cm-textarea" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"5511999999999"} />
        <span className="cm-hint">{numeros.length} número(s). O WhatsApp exige ao menos 1 participante.</span>
      </div>
    </CmModal>
  );
}

/* ---------------------------------------------------------------- Detalhe (tabs) */
const SETTINGS_LABEL = {
  modify_groups: "Quem pode gerenciar grupos",
  member_add_mode: "Quem pode adicionar membros",
};

function DetalheComunidadeModal({ instanceId, comunidadeId, onClose, onChanged }) {
  const showToast = useNotificationStore((s) => s.showToast);
  const [tab, setTab] = useState("participantes");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [sub, setSub] = useState(null);
  const [invite, setInvite] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [grupoOpen, setGrupoOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // {title, body, onYes, danger}
  const [actionBusy, setActionBusy] = useState(false);
  const [adminTexto, setAdminTexto] = useState("");
  const [vincularGid, setVincularGid] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.obterComunidade(comunidadeId, instanceId);
      setData(r?.data || null);
      setInvite({ link: r?.inviteLink || null, code: r?.inviteCode || null });
    } catch (e) { showToast({ type: "error", title: "Erro", message: errMsg(e) }); }
    finally { setLoading(false); }
  }, [comunidadeId, instanceId, showToast]);

  useEffect(() => { carregar(); }, [carregar]);

  const carregarSub = useCallback(async () => {
    try { const r = await api.listarSubgrupos(comunidadeId, instanceId); setSub(r); }
    catch (e) { showToast({ type: "error", title: "Erro", message: errMsg(e) }); }
  }, [comunidadeId, instanceId, showToast]);

  useEffect(() => { if (tab === "grupos" && sub == null) carregarSub(); }, [tab, sub, carregarSub]);

  const participantes = Array.isArray(data?.participants) ? data.participants : [];
  const admins = participantes.filter((p) => ["admin", "creator"].includes(String(p?.rank || "").toLowerCase()));

  async function salvarSetting(setting, policy) {
    setActionBusy(true);
    try { await api.configurarComunidade(comunidadeId, { setting, policy, instanceId }); showToast({ type: "success", title: "Configuração salva" }); }
    catch (e) { showToast({ type: "error", title: "Erro", message: errMsg(e) }); }
    finally { setActionBusy(false); }
  }
  async function admAction(fn, numeros, okMsg) {
    if (!numeros.length) return;
    setActionBusy(true);
    try { await fn(comunidadeId, numeros, instanceId); showToast({ type: "success", title: okMsg }); setAdminTexto(""); await carregar(); }
    catch (e) { showToast({ type: "error", title: "Erro", message: errMsg(e) }); }
    finally { setActionBusy(false); }
  }
  async function copiarLink() {
    if (!invite?.link) return;
    try { await navigator.clipboard.writeText(invite.link); showToast({ type: "success", title: "Link copiado" }); }
    catch { showToast({ type: "info", title: invite.link }); }
  }
  async function doConfirm() {
    const c = confirm; setConfirm(null);
    if (!c?.onYes) return;
    setActionBusy(true);
    try { await c.onYes(); } finally { setActionBusy(false); }
  }

  const nome = data?.name || data?.subject || "Comunidade";

  return (
    <>
      <CmModal title={nome} wide onClose={onClose} busy={actionBusy}
        footer={<button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={carregar}><IconRefresh size={16} /> Atualizar</button>}>
        {loading ? <div className="cm-skel" /> : (<>
          <div className="cm-tabs">
            {["participantes", "grupos", "admins", "config", "convite"].map((t) => (
              <button key={t} className={`cm-tab ${tab === t ? "is-active" : ""}`} onClick={() => setTab(t)}>
                {t === "participantes" ? "Participantes" : t === "grupos" ? "Grupos" : t === "admins" ? "Responsáveis" : t === "config" ? "Configurações" : "Convite"}
              </button>
            ))}
          </div>

          {tab === "participantes" && (
            <>
              <div className="cm-stats">
                <div className="cm-stat"><span className="cm-stat-num">{data?.participants_count ?? participantes.length}</span><span className="cm-stat-label">participantes</span></div>
                <div className="cm-stat"><span className="cm-stat-num">{admins.length}</span><span className="cm-stat-label">responsáveis</span></div>
              </div>
              <button className="cm-btn cm-btn--primary" onClick={() => setAddOpen(true)}><IconUserPlus size={18} /> Adicionar participantes</button>
              <div className="cm-hint">Adições entram numa fila protegida (ritmo conservador). Acompanhe em “Operações”.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {participantes.slice(0, 50).map((p) => (
                  <div className="cm-row" key={p.id}>
                    <div className="cm-row-main">
                      <div className="cm-avatar" style={{ width: 34, height: 34, flexBasis: 34, borderRadius: 10 }}><IconUsers size={16} /></div>
                      <div style={{ minWidth: 0 }}>
                        <div className="cm-row-name">{String(p.id || "").replace(/@.*/, "")}</div>
                        {["admin", "creator"].includes(String(p.rank).toLowerCase()) ? <div className="cm-row-sub">{p.rank === "creator" ? "Criador" : "Admin"}</div> : null}
                      </div>
                    </div>
                  </div>
                ))}
                {participantes.length > 50 ? <div className="cm-hint">Mostrando 50 de {participantes.length}.</div> : null}
              </div>
            </>
          )}

          {tab === "grupos" && (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="cm-btn cm-btn--primary cm-btn--sm" onClick={() => setGrupoOpen(true)}><IconPlus size={16} /> Criar grupo</button>
              </div>
              <div className="cm-field">
                <label className="cm-label">Vincular grupo existente (ID do grupo)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="cm-input" value={vincularGid} onChange={(e) => setVincularGid(e.target.value)} placeholder="1203630...@g.us" />
                  <button className="cm-btn cm-btn--sm" disabled={!vincularGid.trim() || actionBusy}
                    onClick={async () => { setActionBusy(true); try { await api.vincularGrupo(comunidadeId, vincularGid.trim(), instanceId); setVincularGid(""); showToast({ type: "success", title: "Grupo vinculado" }); await carregarSub(); } catch (e) { showToast({ type: "error", title: "Erro", message: errMsg(e) }); } finally { setActionBusy(false); } }}>
                    <IconLink size={16} /> Vincular
                  </button>
                </div>
              </div>
              {sub == null ? <div className="cm-skel" style={{ height: 80 }} /> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sub?.announceGroup ? (
                    <div className="cm-row">
                      <div className="cm-row-main"><div className="cm-avatar" style={{ width: 34, height: 34, flexBasis: 34, borderRadius: 10 }}><IconUsersGroup size={16} /></div>
                        <div><div className="cm-row-name">{sub.announceGroup.title || "Avisos"}</div><div className="cm-row-sub">Grupo de avisos</div></div></div>
                      <span className="cm-badge cm-badge--ok">principal</span>
                    </div>
                  ) : null}
                  {(sub?.subGroups || []).map((g) => (
                    <div className="cm-row" key={g.id}>
                      <div className="cm-row-main"><div className="cm-avatar" style={{ width: 34, height: 34, flexBasis: 34, borderRadius: 10 }}><IconUsersGroup size={16} /></div>
                        <div className="cm-row-name">{g.title || g.id}</div></div>
                      <button className="cm-btn cm-btn--ghost cm-btn--sm cm-btn--danger"
                        onClick={() => setConfirm({ title: "Desvincular grupo?", body: `O grupo "${g.title || g.id}" sairá da comunidade.`, danger: true, onYes: async () => { try { await api.desvincularGrupo(comunidadeId, g.id, instanceId); showToast({ type: "success", title: "Grupo desvinculado" }); await carregarSub(); } catch (e) { showToast({ type: "error", title: "Erro", message: errMsg(e) }); } } })}>
                        Desvincular
                      </button>
                    </div>
                  ))}
                  {!(sub?.subGroups || []).length && !sub?.announceGroup ? <div className="cm-hint">Nenhum grupo vinculado ainda.</div> : null}
                </div>
              )}
            </>
          )}

          {tab === "admins" && (
            <>
              <div className="cm-field">
                <label className="cm-label">Promover / rebaixar responsáveis (números)</label>
                <textarea className="cm-textarea" value={adminTexto} onChange={(e) => setAdminTexto(e.target.value)} placeholder={"5511999999999"} style={{ minHeight: 80 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="cm-btn cm-btn--sm" disabled={actionBusy} onClick={() => admAction(api.promoverAdmin, parseNumeros(adminTexto), "Promovido a responsável")}><IconCrown size={16} /> Promover</button>
                  <button className="cm-btn cm-btn--sm" disabled={actionBusy} onClick={() => admAction(api.rebaixarAdmin, parseNumeros(adminTexto), "Rebaixado")}>Rebaixar</button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {admins.map((p) => (
                  <div className="cm-row" key={p.id}>
                    <div className="cm-row-main"><div className="cm-avatar" style={{ width: 34, height: 34, flexBasis: 34, borderRadius: 10 }}><IconCrown size={16} /></div>
                      <div><div className="cm-row-name">{String(p.id || "").replace(/@.*/, "")}</div><div className="cm-row-sub">{p.rank === "creator" ? "Criador" : "Admin"}</div></div></div>
                  </div>
                ))}
                {!admins.length ? <div className="cm-hint">Nenhum responsável além do criador.</div> : null}
              </div>
            </>
          )}

          {tab === "config" && (
            <>
              {["modify_groups", "member_add_mode"].map((setting) => (
                <div className="cm-field" key={setting}>
                  <label className="cm-label">{SETTINGS_LABEL[setting]}</label>
                  <select className="cm-select" style={{ maxWidth: "none" }} disabled={actionBusy}
                    onChange={(e) => salvarSetting(setting, e.target.value)} defaultValue="">
                    <option value="" disabled>Selecione…</option>
                    <option value="anyone">Qualquer participante</option>
                    <option value="admins">Somente admins</option>
                  </select>
                </div>
              ))}
              <div style={{ borderTop: "1px solid var(--ds-border,#e2e8f0)", paddingTop: 14 }}>
                <button className="cm-btn cm-btn--danger" disabled={actionBusy}
                  onClick={() => setConfirm({ title: "Desativar comunidade?", body: "A comunidade será desativada no WhatsApp. Esta ação não pode ser desfeita por aqui.", danger: true, onYes: async () => { try { await api.desativarComunidade(comunidadeId, instanceId); showToast({ type: "success", title: "Comunidade desativada" }); onChanged?.(); onClose?.(); } catch (e) { showToast({ type: "error", title: "Erro", message: errMsg(e) }); } } })}>
                  <IconBan size={18} /> Desativar comunidade
                </button>
              </div>
            </>
          )}

          {tab === "convite" && (
            <>
              <div className="cm-info">O link pode ser compartilhado por outros canais (site, e-mail, bio). <b>Não</b> dispare para centenas de pessoas pelo WhatsApp — isso é tratado como spam.</div>
              {invite?.link ? (
                <>
                  <div className="cm-invite"><IconLink size={16} /> {invite.link}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="cm-btn cm-btn--sm" onClick={copiarLink}><IconCopy size={16} /> Copiar</button>
                    <button className="cm-btn cm-btn--sm cm-btn--danger" disabled={actionBusy}
                      onClick={() => setConfirm({ title: "Revogar convite?", body: "O link atual deixará de funcionar e um novo será gerado.", danger: true, onYes: async () => { try { await api.revogarConvite(comunidadeId, instanceId); showToast({ type: "success", title: "Convite revogado" }); await carregar(); } catch (e) { showToast({ type: "error", title: "Erro", message: errMsg(e) }); } } })}>
                      <IconTrash size={16} /> Revogar
                    </button>
                  </div>
                </>
              ) : <div className="cm-hint">Link de convite indisponível.</div>}
            </>
          )}
        </>)}
      </CmModal>

      {addOpen ? <AddParticipantesModal instanceId={instanceId} comunidade={data || { id: comunidadeId }} onClose={() => setAddOpen(false)} onEnfileirado={() => { setAddOpen(false); onChanged?.(); }} /> : null}
      {grupoOpen ? <CriarGrupoModal instanceId={instanceId} comunidade={data || { id: comunidadeId }} onClose={() => setGrupoOpen(false)} onCreated={() => { setGrupoOpen(false); setSub(null); }} /> : null}
      <ConfirmDialog open={!!confirm} title={confirm?.title} danger={confirm?.danger} confirmLabel="Confirmar" onCancel={() => setConfirm(null)} onConfirm={doConfirm}>
        {confirm?.body}
      </ConfirmDialog>
    </>
  );
}

/* ---------------------------------------------------------------- Operações (progresso) */
const OP_STATUS = {
  em_execucao: { label: "Em andamento", cls: "" },
  pausada: { label: "Pausada", cls: "cm-badge--warn" },
  concluida: { label: "Concluída", cls: "cm-badge--ok" },
  concluida_com_erros: { label: "Concluída com erros", cls: "cm-badge--warn" },
  cancelada: { label: "Cancelada", cls: "cm-badge--err" },
};
function OperacoesPanel({ operacoes, onRefresh }) {
  const showToast = useNotificationStore((s) => s.showToast);
  if (!operacoes.length) return null;
  async function act(fn, id, msg) {
    try { await fn(id); showToast({ type: "success", title: msg }); onRefresh?.(); }
    catch (e) { showToast({ type: "error", title: "Erro", message: errMsg(e) }); }
  }
  return (
    <div className="cm-ops">
      <div className="cm-ops-head">
        <h2 className="cm-ops-title">Operações</h2>
        <button className="cm-iconbtn" onClick={onRefresh} aria-label="Atualizar"><IconRefresh size={18} /></button>
      </div>
      {operacoes.slice(0, 20).map((op) => {
        const total = Number(op.total) || 0;
        const done = (Number(op.concluidos) || 0) + (Number(op.falhados) || 0);
        const pct = total ? Math.round((done / total) * 100) : 0;
        const st = OP_STATUS[op.status] || { label: op.status, cls: "" };
        const opLabel = op.operacao === "remove" ? "Remoção" : op.operacao === "promote" ? "Promoção" : op.operacao === "demote" ? "Rebaixamento" : "Adição";
        return (
          <div className="cm-op" key={op.id}>
            <div className="cm-op-row">
              <div className="cm-op-name">{opLabel} · {op.comunidade_nome || op.comunidade_id}</div>
              <span className={`cm-badge ${st.cls}`}>{st.label}</span>
            </div>
            <div className="cm-progress"><div className={`cm-progress-bar ${op.falhados > 0 ? "cm-progress-bar--err" : ""}`} style={{ width: `${pct}%` }} /></div>
            <div className="cm-op-row">
              <span className="cm-op-meta">{done}/{total} · {op.concluidos || 0} ok · {op.falhados || 0} falha{op.ignorados ? ` · ${op.ignorados} ignorado(s)` : ""}</span>
              <div className="cm-op-actions">
                {op.status === "em_execucao" ? <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => act(api.pausarOperacao, op.id, "Pausada")}><IconPlayerPause size={15} /> Pausar</button> : null}
                {op.status === "pausada" ? <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => act(api.retomarOperacao, op.id, "Retomada")}><IconPlayerPlay size={15} /> Retomar</button> : null}
                {["em_execucao", "pausada"].includes(op.status) ? <button className="cm-btn cm-btn--ghost cm-btn--sm cm-btn--danger" onClick={() => act(api.cancelarOperacao, op.id, "Cancelada")}>Cancelar</button> : null}
              </div>
            </div>
            {op.pausa_motivo ? <div className="cm-hint">Pausada automaticamente: {op.pausa_motivo}. Retome quando o número estiver seguro.</div> : null}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Página */
export default function Comunidades() {
  const showToast = useNotificationStore((s) => s.showToast);
  const comunidades = useComunidadesStore((s) => s.comunidades);
  const setComunidades = useComunidadesStore((s) => s.setComunidades);
  const operacoes = useComunidadesStore((s) => s.operacoes);
  const setOperacoes = useComunidadesStore((s) => s.setOperacoes);
  const loading = useComunidadesStore((s) => s.loading);
  const setLoading = useComunidadesStore((s) => s.setLoading);

  const instancesStore = useWhatsappInstancesStore();
  const whapiInstances = useMemo(
    () => (instancesStore.instances || []).filter((i) => String(i.provider || "").toLowerCase() === "whapi"),
    [instancesStore.instances]
  );
  const [instanceId, setInstanceId] = useState(null);
  const [criarOpen, setCriarOpen] = useState(false);
  const [detalheId, setDetalheId] = useState(null);
  const opsTimer = useRef(null);

  useEffect(() => { instancesStore.load?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (instanceId == null && whapiInstances.length) setInstanceId(whapiInstances[0].id);
  }, [whapiInstances, instanceId]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listarComunidades(instanceId);
      setComunidades(r?.comunidades || []);
    } catch (e) { showToast({ type: "error", title: "Erro ao listar", message: errMsg(e) }); }
    finally { setLoading(false); }
  }, [instanceId, setComunidades, setLoading, showToast]);

  const carregarOps = useCallback(async () => {
    try { const r = await api.listarOperacoes({ limit: 30 }); setOperacoes(r?.operacoes || []); } catch { /* silencioso */ }
  }, [setOperacoes]);

  useEffect(() => {
    if (!instancesStore.loaded) return;
    if (whapiInstances.length && instanceId != null) carregar();
    else if (instancesStore.loaded && !whapiInstances.length) setLoading(false);
  }, [instanceId, instancesStore.loaded, whapiInstances.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    carregarOps();
    opsTimer.current = setInterval(carregarOps, 20000); // reforço; realtime via socket já atualiza
    return () => clearInterval(opsTimer.current);
  }, [carregarOps]);

  const semWhapi = instancesStore.loaded && !whapiInstances.length;

  return (
    <div className="cm-page">
      <div className="cm-head">
        <div className="cm-head-titles">
          <h1 className="cm-title"><IconWorld size={22} style={{ verticalAlign: "-4px", marginRight: 6 }} />Comunidades</h1>
          <p className="cm-subtitle">Crie e gerencie comunidades do WhatsApp com adição protegida de participantes.</p>
        </div>
        <div className="cm-head-actions">
          {whapiInstances.length > 1 ? (
            <select className="cm-select" value={instanceId ?? ""} onChange={(e) => setInstanceId(Number(e.target.value))}>
              {whapiInstances.map((i) => <option key={i.id} value={i.id}>{i.nome || i.display_phone || `Instância ${i.id}`}</option>)}
            </select>
          ) : null}
          <button className="cm-iconbtn" onClick={carregar} aria-label="Atualizar"><IconRefresh size={18} /></button>
          <button className="cm-btn cm-btn--primary" disabled={semWhapi || instanceId == null} onClick={() => setCriarOpen(true)}>
            <IconPlus size={18} /> Criar comunidade
          </button>
        </div>
      </div>

      <OperacoesPanel operacoes={operacoes} onRefresh={carregarOps} />

      {semWhapi ? (
        <div className="cm-empty">
          <IconWorld size={40} opacity={0.5} />
          <div>Comunidades exigem uma instância <b>Whapi</b> conectada.</div>
          <div className="cm-hint">Conecte um número Whapi para começar.</div>
        </div>
      ) : loading ? (
        <div className="cm-grid">{[0, 1, 2, 3].map((i) => <div className="cm-skel" key={i} />)}</div>
      ) : !comunidades.length ? (
        <div className="cm-empty">
          <IconWorld size={40} opacity={0.5} />
          <div>Nenhuma comunidade ainda.</div>
          <button className="cm-btn cm-btn--primary" onClick={() => setCriarOpen(true)}><IconPlus size={18} /> Criar a primeira</button>
        </div>
      ) : (
        <div className="cm-grid">
          {comunidades.map((c) => {
            const cid = communityIdOf(c);
            return (
              <div className="cm-card" key={cid} onClick={() => setDetalheId(cid)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") setDetalheId(cid); }}>
                <div className="cm-card-top">
                  <div className="cm-avatar"><IconWorld size={24} /></div>
                  <div style={{ minWidth: 0 }}>
                    <h3 className="cm-card-name">{c.name || c.subject || "Comunidade"}</h3>
                    {c.description ? <p className="cm-card-desc">{c.description}</p> : null}
                  </div>
                </div>
                <div className="cm-stats">
                  <div className="cm-stat"><span className="cm-stat-num">{c.participants_count ?? "—"}</span><span className="cm-stat-label">participantes</span></div>
                </div>
                <div className="cm-card-foot">
                  <span className="cm-badge cm-badge--ok">ativa</span>
                  <span className="cm-btn cm-btn--ghost cm-btn--sm">Gerenciar →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {criarOpen ? <CriarComunidadeModal instanceId={instanceId} onClose={() => setCriarOpen(false)} onCreated={() => { setCriarOpen(false); carregar(); }} /> : null}
      {detalheId ? <DetalheComunidadeModal instanceId={instanceId} comunidadeId={detalheId} onClose={() => setDetalheId(null)} onChanged={() => { carregar(); carregarOps(); }} /> : null}
    </div>
  );
}
