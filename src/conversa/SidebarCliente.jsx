import "./conversa.css";
import { useMemo, useState, useCallback, useEffect } from "react";
import { salvarObservacao } from "./conversaService";
import { useAuthStore } from "../auth/authStore";
import { useNotificationStore } from "../notifications/notificationStore";

function initials(nome = "") {
  const parts = String(nome || "").trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase() || "Z";
}

function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}

async function copyText(text) {
  const t = String(text || "");
  if (!t) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch (_) {}

  // fallback (ambientes / permissões)
  try {
    const el = document.createElement("textarea");
    el.value = t;
    el.setAttribute("readonly", "true");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    el.style.top = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return !!ok;
  } catch (_) {
    return false;
  }
}

export default function SidebarCliente({ open, onClose, conversa, tags, tempoSemResponder, onObservacaoSaved, isGroup }) {
  const user = useAuthStore((s) => s.user);
  const showToast = useNotificationStore((s) => s.showToast);
  const [observacao, setObservacao] = useState("");
  const [obsBase, setObsBase] = useState("");
  const [savingObs, setSavingObs] = useState(false);
  const [avatarImgError, setAvatarImgError] = useState(false);

  useEffect(() => {
    if (isGroup) return;
    const valor = conversa?.observacao != null ? String(conversa.observacao) : "";
    setObservacao(valor);
    setObsBase(valor);
  }, [open, conversa?.id, conversa?.observacao, isGroup]);

  const responsavelNome = useMemo(() => {
    // hoje só temos o id do atendente; mostramos “Você” quando for o próprio usuário logado
    if (conversa?.atendente_id == null || conversa?.atendente_id === "") return "Nenhum responsável";
    const nome = conversa?.atendente_nome;
    if (nome) return user && Number(user.id) === Number(conversa.atendente_id) ? "Você" : nome;
    if (user && Number(user.id) === Number(conversa.atendente_id)) return "Você";
    return "Responsável (ID #" + conversa.atendente_id + ")";
  }, [conversa?.atendente_id, conversa?.atendente_nome, user]);

  const clienteNome = useMemo(() => {
    return conversa?.cliente_nome || conversa?.cliente?.nome || conversa?.nome || "Contato";
  }, [conversa]);

  const telefone = useMemo(() => {
    return conversa?.cliente_telefone || conversa?.cliente?.telefone || conversa?.telefone || "";
  }, [conversa]);

  const telDigits = useMemo(() => digitsOnly(telefone), [telefone]);

  const fotoPerfil = useMemo(() => {
    const url = conversa?.foto_perfil || conversa?.clientes?.foto_perfil || conversa?.cliente?.foto_perfil || null;
    const s = url ? String(url).trim() : "";
    return s && s.startsWith("http") ? s : null;
  }, [conversa]);

  const statusLabel = useMemo(() => {
    const s = String(conversa?.status_atendimento || "").toLowerCase();
    if (s === "em_atendimento") return "Em atendimento";
    if (s === "fechada") return "Finalizada";
    if (!s) return "Aberta";
    return s;
  }, [conversa]);

  const statusTone = useMemo(() => {
    const s = String(conversa?.status_atendimento || "").toLowerCase();
    if (s === "fechada") return "closed";
    if (s === "em_atendimento") return "active";
    return "open";
  }, [conversa?.status_atendimento]);

  const createdAt = useMemo(() => {
    if (!conversa?.criado_em) return "";
    try {
      return new Date(conversa.criado_em).toLocaleString();
    } catch {
      return "";
    }
  }, [conversa]);

  const crmHref = useMemo(() => {
    const base = import.meta.env?.VITE_CRM_URL ? String(import.meta.env.VITE_CRM_URL).trim() : "";
    if (!base || base === "#") return "";
    try {
      // suporta base com ou sem query
      const u = new URL(base, window.location.origin);
      if (telDigits) u.searchParams.set("telefone", telDigits);
      if (conversa?.cliente_id != null) u.searchParams.set("cliente_id", String(conversa.cliente_id));
      if (conversa?.id != null) u.searchParams.set("conversa_id", String(conversa.id));
      return u.toString();
    } catch {
      // fallback: concat simples
      const q = [];
      if (telDigits) q.push(`telefone=${encodeURIComponent(telDigits)}`);
      if (conversa?.cliente_id != null) q.push(`cliente_id=${encodeURIComponent(String(conversa.cliente_id))}`);
      if (conversa?.id != null) q.push(`conversa_id=${encodeURIComponent(String(conversa.id))}`);
      if (q.length === 0) return base;
      return base.includes("?") ? `${base}&${q.join("&")}` : `${base}?${q.join("&")}`;
    }
  }, [conversa?.cliente_id, conversa?.id, telDigits]);

  const handleSalvarObs = useCallback(async () => {
    if (!conversa?.id) return;
    try {
      setSavingObs(true);
      await salvarObservacao(conversa.id, observacao);
      setObsBase(observacao);
      showToast?.({ type: "success", title: "Salvo", message: "Observação atualizada com sucesso." });
      onObservacaoSaved?.();
    } catch (err) {
      console.error("Erro ao salvar observação da conversa:", err);
      showToast?.({ type: "error", title: "Falha ao salvar", message: "Não foi possível salvar a observação." });
    } finally {
      setSavingObs(false);
    }
  }, [conversa?.id, observacao, onObservacaoSaved, showToast]);

  if (!open) return null;

  if (isGroup) {
    return (
      <div className="wa-sideCliente" role="complementary" aria-label="Detalhes do grupo">
        <div className="wa-sideCliente-head">
          <div className="wa-sideCliente-titleBlock">
            <span className="wa-sideCliente-title">Conversa de grupo</span>
            <span className="wa-sideCliente-sub">Informações da conversa</span>
          </div>
          <button type="button" className="wa-iconBtn" onClick={onClose} title="Fechar">
            <span>×</span>
          </button>
        </div>
        <div className="wa-sideCliente-body">
          <section className="wa-sideCliente-section">
            <h3 className="wa-sideCliente-sectionTitle">Grupo</h3>
            <div className="wa-sideCliente-row">
              <span className="wa-sideCliente-label">Nome</span>
              <span className="wa-sideCliente-value">{conversa?.nome_grupo || "Grupo"}</span>
            </div>
          </section>
          <section className="wa-sideCliente-section">
            <h3 className="wa-sideCliente-sectionTitle">Atendimento</h3>
            <div className="wa-sideCliente-row">
              <span className="wa-sideCliente-label">Status</span>
              <span className="wa-sideCliente-value">{statusLabel}</span>
            </div>
            <div className="wa-sideCliente-row">
              <span className="wa-sideCliente-label">Responsável</span>
              <span className="wa-sideCliente-value">{responsavelNome}</span>
            </div>
            {createdAt ? (
              <div className="wa-sideCliente-row">
                <span className="wa-sideCliente-label">Criado em</span>
                <span className="wa-sideCliente-value">{createdAt}</span>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="wa-sideCliente" role="complementary" aria-label="Detalhes do cliente">
      <div className="wa-sideCliente-head">
        <div className="wa-sideCliente-titleBlock">
          <span className="wa-sideCliente-title">Detalhes do cliente</span>
          <span className="wa-sideCliente-sub">Informações da conversa atual</span>
        </div>
        <button
          type="button"
          className="wa-iconBtn"
          onClick={onClose}
          title="Fechar"
        >
          <span>×</span>
        </button>
      </div>

      <div className="wa-sideCliente-body">
        <section className="wa-sideCliente-hero" aria-label="Resumo do cliente">
          <div className="wa-sideCliente-avatar">
            <span className="wa-sideCliente-avatarFallback" aria-hidden="true">{initials(clienteNome)}</span>
            {fotoPerfil && !avatarImgError ? (
              <img
                className="wa-sideCliente-avatarImg"
                src={fotoPerfil}
                alt=""
                onError={() => setAvatarImgError(true)}
              />
            ) : null}
          </div>
          <div className="wa-sideCliente-heroMain">
            <div className="wa-sideCliente-heroTop">
              <div className="wa-sideCliente-heroName" title={clienteNome}>{clienteNome}</div>
              <span className={`wa-sideCliente-pill wa-sideCliente-pill--${statusTone}`}>{statusLabel}</span>
            </div>
            <div className="wa-sideCliente-heroSub">
              {telefone ? <span className="wa-sideCliente-mono">{telefone}</span> : <span className="wa-sideCliente-muted">Sem telefone</span>}
              {tempoSemResponder != null ? (
                <>
                  <span className="wa-sideCliente-dotSep" aria-hidden="true">•</span>
                  <span className="wa-sideCliente-sla">
                    <span className="wa-sideCliente-muted">Sem responder há</span>{" "}
                    <span className="wa-sideCliente-slaValue">{tempoSemResponder}</span>
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <section className="wa-sideCliente-section">
          <h3 className="wa-sideCliente-sectionTitle">Cliente</h3>
          <div className="wa-sideCliente-row">
            <span className="wa-sideCliente-label">Nome</span>
            <span className="wa-sideCliente-value">{clienteNome}</span>
          </div>
          {telefone ? (
            <div className="wa-sideCliente-row">
              <span className="wa-sideCliente-label">Telefone</span>
              <span className="wa-sideCliente-value wa-sideCliente-mono">{telefone}</span>
            </div>
          ) : null}
          {tempoSemResponder != null && (
            <div className="wa-sideCliente-row">
              <span className="wa-sideCliente-label">Sem responder há</span>
              <span className="wa-sideCliente-value wa-sideCliente-valueHighlight">{tempoSemResponder}</span>
            </div>
          )}
        </section>

        <section className="wa-sideCliente-section">
          <h3 className="wa-sideCliente-sectionTitle">Ações rápidas</h3>
          <div className="wa-sideCliente-quickActions">
            {telefone ? (
              <a href={`tel:${telDigits}`} className="wa-btn wa-btn-quick" title="Ligar" aria-label="Ligar para o cliente">
                Ligar
              </a>
            ) : (
              <span className="wa-btn wa-btn-quick isDisabled" aria-disabled="true">Ligar</span>
            )}
            <button
              type="button"
              className="wa-btn wa-btn-quick"
              title="Copiar telefone"
              disabled={!telefone}
              onClick={async () => {
                if (!telefone) return;
                const ok = await copyText(telefone);
                showToast?.({
                  type: ok ? "success" : "error",
                  title: ok ? "Copiado" : "Falha",
                  message: ok ? "Telefone copiado." : "Não foi possível copiar.",
                });
              }}
            >
              Copiar
            </button>
            {crmHref ? (
              <a
                href={crmHref}
                target="_blank"
                rel="noopener noreferrer"
                className="wa-btn wa-btn-quick"
                title="Abrir CRM"
                aria-label="Abrir CRM"
              >
                Abrir CRM
              </a>
            ) : (
              <span
                className="wa-btn wa-btn-quick isDisabled"
                aria-disabled="true"
                title="Configure VITE_CRM_URL para habilitar"
              >
                Abrir CRM
              </span>
            )}
          </div>
        </section>

        <section className="wa-sideCliente-section">
          <h3 className="wa-sideCliente-sectionTitle">Atendimento</h3>
          <div className="wa-sideCliente-row">
            <span className="wa-sideCliente-label">Status</span>
            <span className="wa-sideCliente-value">
              <span className={`wa-sideCliente-pill wa-sideCliente-pill--${statusTone}`}>{statusLabel}</span>
            </span>
          </div>
          <div className="wa-sideCliente-row">
            <span className="wa-sideCliente-label">Responsável</span>
            <span className="wa-sideCliente-value">{responsavelNome}</span>
          </div>
          {createdAt ? (
            <div className="wa-sideCliente-row">
              <span className="wa-sideCliente-label">Criado em</span>
              <span className="wa-sideCliente-value">{createdAt}</span>
            </div>
          ) : null}
        </section>

        {Array.isArray(tags) && tags.length > 0 && (
          <section className="wa-sideCliente-section">
            <h3 className="wa-sideCliente-sectionTitle">Tags</h3>
            <div className="wa-sideCliente-tags">
              {tags.map((t) => (
                <span key={t.id} className="wa-tagChip isSelected">
                  <span className="wa-tagChip-label">{t.nome}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="wa-sideCliente-section">
          <h3 className="wa-sideCliente-sectionTitle">Observações</h3>
          <p className="wa-sideCliente-hint">
            Registre um resumo breve do atendimento, pontos importantes ou próximos passos.
          </p>
          <textarea
            className="wa-sideCliente-textarea"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: Cliente VIP, prefere contato à tarde, combinou retorno amanhã..."
          />
          <div className="wa-sideCliente-actions">
            <button
              type="button"
              className="wa-btn wa-btn-primary"
              onClick={handleSalvarObs}
              disabled={savingObs || conversa?.id == null || String(observacao || "") === String(obsBase || "")}
              aria-busy={savingObs}
            >
              {savingObs ? "Salvando..." : "Salvar observação"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

