import { useCallback, useEffect, useState } from "react";
import { obterLimitesAntibanInstancia } from "../api/whapiInstancesService";

function formatUnix(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function capStatusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "capped") return "Limite atingido";
  if (s === "first_warning") return "1º aviso";
  if (s === "second_warning") return "2º aviso";
  if (s === "none") return "Sem restrição";
  return status || "—";
}

/**
 * Painel read-only dos limites anti-ban Whapi (novos chats + reachout).
 * Só faz sentido com canal conectado.
 */
export default function WhapiAntibanLimitsCard({ instanceId, enabled = true }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newChat, setNewChat] = useState(null);
  const [reachout, setReachout] = useState(null);

  const load = useCallback(async () => {
    if (!instanceId || !enabled) return;
    setLoading(true);
    setError("");
    try {
      const res = await obterLimitesAntibanInstancia(instanceId);
      if (!res.ok) {
        setError(res.error || "Não foi possível ler os limites.");
        setNewChat(null);
        setReachout(null);
        return;
      }
      setNewChat(res.newChat);
      setReachout(res.reachout);
    } finally {
      setLoading(false);
    }
  }, [instanceId, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled || !instanceId) return null;

  const restricted = reachout?.restricted === true;
  const capped = newChat?.capped === true;
  const tone = restricted || capped ? "warn" : "ok";

  return (
    <div className={`whapi-antiban whapi-antiban--${tone}`} aria-live="polite">
      <div className="whapi-antiban-head">
        <h4 className="whapi-card-title" style={{ margin: 0 }}>
          Limites anti-ban
        </h4>
        <button
          type="button"
          className="ia-btn ia-btn--outline"
          onClick={load}
          disabled={loading}
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>
      <p className="whapi-card-desc" style={{ marginBottom: 10 }}>
        Quotas do WhatsApp Business para iniciar conversas novas. Ajuda a evitar bloqueio do número.
      </p>

      {error ? (
        <div className="ia-error-banner" role="alert">
          {error}
        </div>
      ) : null}

      {!error && loading && !newChat && !reachout ? (
        <p className="whapi-card-desc">Consultando limites…</p>
      ) : null}

      {!error && (newChat || reachout) ? (
        <div className="whapi-antiban-grid">
          <div className="whapi-antiban-item">
            <div className="whapi-antiban-label">Novos chats</div>
            {newChat?.error ? (
              <div className="whapi-antiban-value">{newChat.error}</div>
            ) : (
              <>
                <div className="whapi-antiban-value">
                  {capped
                    ? "Capado neste ciclo"
                    : `${newChat?.quota_remaining ?? "—"} restantes`}
                  {newChat?.quota_limit != null ? (
                    <span className="whapi-antiban-meta">
                      {" "}
                      · usados {newChat.quota_used ?? 0}/{newChat.quota_limit}
                    </span>
                  ) : null}
                </div>
                <div className="whapi-antiban-meta">
                  Status: {capStatusLabel(newChat?.cap_status)}
                  {formatUnix(newChat?.cycle_end_at)
                    ? ` · ciclo até ${formatUnix(newChat.cycle_end_at)}`
                    : ""}
                </div>
              </>
            )}
          </div>

          <div className="whapi-antiban-item">
            <div className="whapi-antiban-label">Reachout (timelock)</div>
            {reachout?.error ? (
              <div className="whapi-antiban-value">{reachout.error}</div>
            ) : (
              <>
                <div className="whapi-antiban-value">
                  {restricted ? "Restrito temporariamente" : "Sem restrição"}
                </div>
                <div className="whapi-antiban-meta">
                  {restricted && formatUnix(reachout?.restricted_until)
                    ? `Até ${formatUnix(reachout.restricted_until)}`
                    : restricted
                      ? "Sem data de liberação"
                      : "Pode iniciar novos chats"}
                  {reachout?.restriction_type
                    ? ` · ${reachout.restriction_type}`
                    : ""}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
