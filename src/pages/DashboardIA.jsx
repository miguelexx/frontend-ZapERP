import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../api/http";
import "./DashboardIA.css";

const SUGGESTIONS = [
  "Resumo das métricas",
  "Atendente mais lento",
  "Clientes esperando resposta",
  "Top atendentes",
];

function createMessage(role, content) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content: String(content || "").trim(),
    createdAt: new Date().toISOString(),
  };
}

export default function DashboardIA() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(() => [
    createMessage(
      "assistant",
      "Olá! Eu sou o **Assistente Inteligente do ZapERP**.\n\nPosso te ajudar com métricas, atendimentos e clientes. Pergunte, por exemplo:\n\n- \"Resumo das métricas de hoje\"\n- \"Atendente mais lento da última semana\"\n- \"Clientes esperando resposta agora\"\n- \"Top atendentes do mês\""
    ),
  ]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const bottomRef = useRef(null);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  useEffect(() => {
    if (!bottomRef.current) return;
    try {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    } catch {
      // ignore
    }
  }, [messages, loading]);

  const ask = useCallback(
    async (questionText) => {
      const text = questionText?.trim() || input.trim();
      if (!text) return;

      setErrorMsg(null);
      setInput("");

      const userMsg = createMessage("user", text);
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const resp = await api.post("/api/ai/ask", { question: text });
        const data = resp?.data ?? {};
        const answer =
          data.answer ||
          data.response ||
          data.message ||
          (typeof data === "string" ? data : "Não recebi uma resposta da IA. Tente novamente em instantes.");

        const assistantMsg = createMessage("assistant", answer);
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (e) {
        console.error("Erro ao consultar IA:", e);
        const detail =
          e?.response?.data?.error ||
          e?.response?.data?.message ||
          e?.message ||
          "Não foi possível falar com a IA agora.";
        setErrorMsg(detail);
        const assistantMsg = createMessage(
          "assistant",
          "Tive um problema ao consultar a IA no momento. Tente novamente em alguns instantes."
        );
        setMessages((prev) => [...prev, assistantMsg]);
      } finally {
        setLoading(false);
      }
    },
    [input]
  );

  const handleSubmit = useCallback(
    (e) => {
      e?.preventDefault?.();
      if (!canSend) return;
      void ask();
    },
    [ask, canSend]
  );

  const handleSuggestion = useCallback(
    (text) => {
      if (loading) return;
      void ask(text);
    },
    [ask, loading]
  );

  return (
    <div className="ia-chat-wrap">
      <header className="ia-chat-header">
        <div>
          <h1 className="ia-chat-title">Assistente Inteligente do ZapERP</h1>
          <p className="ia-chat-subtitle">
            Pergunte qualquer coisa sobre métricas, atendimentos e clientes. As respostas usam os dados do seu CRM.
          </p>
        </div>
      </header>

      {errorMsg ? (
        <div className="ia-chat-alert" role="alert">
          <div className="ia-chat-alert-text">{errorMsg}</div>
          <button
            type="button"
            className="ia-chat-alert-close"
            onClick={() => setErrorMsg(null)}
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      ) : null}

      <main className="ia-chat-main">
        <section className="ia-chat-card" aria-label="Conversa com a IA">
          <div className="ia-chat-suggestions" aria-label="Sugestões rápidas">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="ia-chat-suggestion"
                onClick={() => handleSuggestion(s)}
                disabled={loading}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="ia-chat-messages">
            {messages.map((m) => (
              <article
                key={m.id}
                className={`ia-chat-message ia-chat-message--${m.role}`}
                aria-label={m.role === "assistant" ? "Mensagem da assistente" : "Sua mensagem"}
              >
                <div className="ia-chat-message-avatar">
                  {m.role === "assistant" ? (
                    <span className="ia-chat-avatar ia-chat-avatar--assistant">IA</span>
                  ) : (
                    <span className="ia-chat-avatar ia-chat-avatar--user">Você</span>
                  )}
                </div>
                <div className="ia-chat-message-body">
                  <div className="ia-chat-message-content">
                    {m.content.split("\n").map((line, idx) => (
                      <p key={idx}>{line}</p>
                    ))}
                  </div>
                </div>
              </article>
            ))}

            {loading ? (
              <div className="ia-chat-loading">
                <span className="ia-chat-loading-dot" />
                <span className="ia-chat-loading-dot" />
                <span className="ia-chat-loading-dot" />
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>
        </section>
      </main>

      <footer className="ia-chat-footer" aria-label="Enviar pergunta para a IA">
        <form className="ia-chat-form" onSubmit={handleSubmit}>
          <input
            className="ia-chat-input"
            type="text"
            placeholder="Digite sua pergunta sobre métricas, atendimentos ou clientes..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            className="ia-chat-sendBtn"
            disabled={!canSend}
            aria-label="Enviar pergunta para a IA"
          >
            {loading ? "Enviando..." : "Enviar"}
          </button>
        </form>
      </footer>
    </div>
  );
}

