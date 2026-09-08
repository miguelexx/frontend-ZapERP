import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { criarGrupo } from "../chats/chatService";
import { useNotificationStore } from "../notifications/notificationStore";
import "../conversa/conversa.css";

export default function NovoGrupo() {
  const [nome, setNome] = useState("");
  const [phone, setPhone] = useState("");
  const [participantes, setParticipantes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const showToast = useNotificationStore((s) => s.showToast);

  function addParticipant(e) {
    e?.preventDefault?.();
    const raw = String(phone || "").trim();
    if (!raw) return;
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Informe o número com DDI (ex.: 5534999999999).");
      return;
    }
    if (participantes.includes(digits) || participantes.includes(raw)) return;
    setParticipantes((list) => [...list, digits]);
    setPhone("");
    setError("");
  }

  async function salvar(e) {
    e.preventDefault();
    const subject = String(nome || "").trim();
    if (!subject) {
      setError("Informe o nome do grupo.");
      return;
    }
    if (!participantes.length) {
      setError("Adicione ao menos um participante, como no WhatsApp.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await criarGrupo(subject, participantes);
      showToast?.({ type: "success", title: "Grupo", message: "Grupo criado." });
      const id = created?.id;
      navigate(id ? `/atendimento?conversa=${id}` : "/atendimento");
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Não foi possível criar o grupo.";
      setError(msg);
      showToast?.({ type: "error", title: "Grupo", message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wa-novoGrupo">
      <h2>Novo grupo</h2>
      <p>Crie um grupo real no WhatsApp: nome + pelo menos um contato.</p>
      <form onSubmit={salvar}>
        <input
          className="wa-input"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do grupo"
          autoComplete="off"
        />
        <div className="wa-groupAddRow">
          <input
            className="wa-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Participante (DDI + número)"
            inputMode="tel"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addParticipant();
              }
            }}
          />
          <button type="button" className="wa-btn wa-btn-primary" onClick={addParticipant} disabled={busy}>
            Adicionar
          </button>
        </div>
        {participantes.length ? (
          <div className="wa-novoGrupo-chips">
            {participantes.map((p) => (
              <span key={p} className="wa-novoGrupo-chip">
                {p}
                <button
                  type="button"
                  aria-label={`Remover ${p}`}
                  onClick={() => setParticipantes((list) => list.filter((x) => x !== p))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {error ? <p className="wa-novoGrupo-error">{error}</p> : null}
        <button type="submit" className="wa-btn wa-btn-primary" disabled={busy}>
          {busy ? "Criando…" : "Criar grupo"}
        </button>
      </form>
    </div>
  );
}
