import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconUsersGroup, IconCircleCheck } from "@tabler/icons-react";
import { criarGrupo } from "../chats/chatService";
import { enfileirarParticipantesGrupo } from "../conversa/groupWhatsappService";
import { useNotificationStore } from "../notifications/notificationStore";
import ContatosPicker from "../components/ContatosPicker";
import "../conversa/conversa.css";

// Até este total, o grupo é criado com todos de uma vez (comportamento normal do WhatsApp).
// Acima disso, cria com 1 "semente" e o restante entra na FILA protegida (ritmo conservador).
const IMMEDIATE_MAX = 20;

export default function NovoGrupo() {
  const [nome, setNome] = useState("");
  const [phones, setPhones] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const navigate = useNavigate();
  const showToast = useNotificationStore((s) => s.showToast);

  const onPhonesChange = useCallback((list) => setPhones(list), []);

  async function salvar(e) {
    e.preventDefault();
    const subject = String(nome || "").trim();
    if (!subject) { setError("Informe o nome do grupo."); return; }
    if (!phones.length) { setError("Selecione ao menos um contato (ou cole números)."); return; }
    setBusy(true); setError("");
    try {
      const grande = phones.length > IMMEDIATE_MAX;
      const inicial = grande ? phones.slice(0, 1) : phones;
      const resto = grande ? phones.slice(1) : [];

      const created = await criarGrupo(subject, inicial);
      const id = created?.id;
      if (!id) throw new Error("Grupo criado, mas sem identificador para continuar.");

      let fila = null;
      if (resto.length) {
        fila = await enfileirarParticipantesGrupo(id, resto);
      }
      showToast?.({ type: "success", title: "Grupo", message: "Grupo criado." });
      setResultado({
        conversaId: id,
        imediatos: inicial.length,
        fila,
      });
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Não foi possível criar o grupo.";
      setError(msg);
      showToast?.({ type: "error", title: "Grupo", message: msg });
    } finally {
      setBusy(false);
    }
  }

  if (resultado) {
    const f = resultado.fila;
    return (
      <div className="wa-novoGrupo">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <IconCircleCheck size={26} color="var(--ds-success, #16a34a)" />
          <h2 style={{ margin: 0 }}>Grupo criado!</h2>
        </div>
        <p>{resultado.imediatos} participante(s) adicionado(s) agora.</p>
        {f && f.total > 0 ? (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "var(--ds-info-soft, rgba(2,132,199,0.1))", color: "var(--ds-text-secondary, #334155)", fontSize: 13 }}>
            <b style={{ color: "var(--ds-info, #0284c7)" }}>{f.total} participante(s) na fila protegida.</b>
            <p style={{ margin: "6px 0 0" }}>
              Para não arriscar o bloqueio do número, eles são adicionados <b>aos poucos</b> (ritmo ultra-conservador,
              com pausa automática em qualquer sinal de limite).
              {f.eta?.diasEstimados ? <> Estimativa: ~<b>{f.eta.diasEstimados} dia(s)</b> (~{f.eta.porDia}/dia).</> : null}
            </p>
            {f.ignorados ? <p style={{ margin: "6px 0 0", opacity: 0.8 }}>{f.ignorados} já estavam no grupo (ignorados).</p> : null}
            <p style={{ margin: "6px 0 0", opacity: 0.8 }}>Acompanhe o progresso no painel do grupo (ícone de participantes).</p>
          </div>
        ) : f && f.vazio ? (
          <p style={{ color: "var(--ds-text-tertiary, #64748b)" }}>Nenhum participante adicional para enfileirar.</p>
        ) : null}
        <div className="wa-groupAddRow" style={{ marginTop: 14 }}>
          <button type="button" className="wa-btn wa-btn-primary" onClick={() => navigate(`/atendimento?conversa=${resultado.conversaId}`)}>
            Abrir grupo
          </button>
          <button type="button" className="wa-btn" onClick={() => { setResultado(null); setNome(""); setPhones([]); }}>
            Criar outro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wa-novoGrupo">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <IconUsersGroup size={22} />
        <h2 style={{ margin: 0 }}>Novo grupo</h2>
      </div>
      <p>Crie um grupo no WhatsApp e puxe vários contatos da sua base. Para muitos participantes, a adição é feita com segurança, aos poucos.</p>
      <form onSubmit={salvar}>
        <input
          className="wa-input"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do grupo"
          autoComplete="off"
          maxLength={100}
        />
        <div style={{ marginTop: 12 }}>
          <ContatosPicker onPhonesChange={onPhonesChange} />
        </div>
        {phones.length > IMMEDIATE_MAX ? (
          <p style={{ marginTop: 10, color: "var(--ds-text-tertiary, #64748b)", fontSize: 13 }}>
            {phones.length} selecionados — os participantes serão adicionados <b>gradualmente</b> (fila protegida) para
            proteger o número contra bloqueio.
          </p>
        ) : null}
        {error ? <p className="wa-novoGrupo-error">{error}</p> : null}
        <button type="submit" className="wa-btn wa-btn-primary" disabled={busy} style={{ marginTop: 12 }}>
          {busy ? "Criando…" : `Criar grupo${phones.length ? ` (${phones.length})` : ""}`}
        </button>
      </form>
    </div>
  );
}
