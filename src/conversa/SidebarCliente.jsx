import "./conversa.css";
import { useMemo, useState, useCallback, useEffect } from "react";
import { salvarObservacao } from "./conversaService";
import { useAuthStore } from "../auth/authStore";

export default function SidebarCliente({ open, onClose, conversa, tags, tempoSemResponder, onObservacaoSaved, isGroup }) {
  const user = useAuthStore((s) => s.user);
  const [observacao, setObservacao] = useState("");
  const [savingObs, setSavingObs] = useState(false);

  useEffect(() => {
    if (isGroup) return;
    const valor = conversa?.observacao != null ? String(conversa.observacao) : "";
    setObservacao(valor);
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

  const statusLabel = useMemo(() => {
    const s = String(conversa?.status_atendimento || "").toLowerCase();
    if (s === "em_atendimento") return "Em atendimento";
    if (s === "fechada") return "Finalizada";
    if (!s) return "Aberta";
    return s;
  }, [conversa]);

  const createdAt = useMemo(() => {
    if (!conversa?.criado_em) return "";
    try {
      return new Date(conversa.criado_em).toLocaleString();
    } catch {
      return "";
    }
  }, [conversa]);

  const handleSalvarObs = useCallback(async () => {
    if (!conversa?.id) return;
    try {
      setSavingObs(true);
      await salvarObservacao(conversa.id, observacao);
      onObservacaoSaved?.();
    } catch (err) {
      console.error("Erro ao salvar observação da conversa:", err);
    } finally {
      setSavingObs(false);
    }
  }, [conversa?.id, observacao, onObservacaoSaved]);

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
        <section className="wa-sideCliente-section">
          <h3 className="wa-sideCliente-sectionTitle">Cliente</h3>
          <div className="wa-sideCliente-row">
            <span className="wa-sideCliente-label">Nome</span>
            <span className="wa-sideCliente-value">{clienteNome}</span>
          </div>
          {telefone ? (
            <div className="wa-sideCliente-row">
              <span className="wa-sideCliente-label">Telefone</span>
              <span className="wa-sideCliente-value">{telefone}</span>
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
              <a href={`tel:${telefone.replace(/\D/g, "")}`} className="wa-btn wa-btn-quick" title="Ligar" aria-label="Ligar para o cliente">
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
              onClick={() => telefone && navigator.clipboard.writeText(telefone).catch(() => {})}
            >
              Copiar
            </button>
            <a
              href={import.meta.env?.VITE_CRM_URL || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="wa-btn wa-btn-quick"
              title="Abrir CRM"
              aria-label="Abrir CRM"
            >
              Abrir CRM
            </a>
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
              disabled={savingObs || conversa?.id == null}
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

