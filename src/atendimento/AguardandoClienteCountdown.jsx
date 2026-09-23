import { useEffect, useState } from "react";
import { formatarPrazoRestante } from "./aguardarClientePrazo";

/**
 * Chip de contagem regressiva do alarme "Aguardar cliente".
 * Renderiza só quando a conversa está aguardando_cliente com prazo definido.
 * Atualiza a cada 30s (leve) e destaca em vermelho quando o prazo vence.
 */
export default function AguardandoClienteCountdown({ conversa }) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const status = String(
    conversa?.status_atendimento_real || conversa?.status_atendimento || ""
  )
    .trim()
    .toLowerCase();
  const prazoAte = conversa?.aguardando_cliente_prazo_ate || null;
  const ativo = status === "aguardando_cliente" && !!prazoAte;

  useEffect(() => {
    if (!ativo) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, [ativo, prazoAte]);

  if (!ativo) return null;

  const info = formatarPrazoRestante(prazoAte, nowMs);
  if (!info) return null;

  return (
    <span
      className={`zap-ac-countdown${info.overdue ? " zap-ac-countdown--overdue" : ""}`}
      title={
        info.overdue
          ? "O prazo de espera pelo cliente venceu"
          : "Tempo restante do alarme de espera pelo cliente"
      }
      aria-label={`Aguardando cliente, ${info.label}`}
    >
      <span className="zap-ac-countdown__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 1.5M9 2h6" strokeLinecap="round" />
        </svg>
      </span>
      <span className="zap-ac-countdown__text">{info.label}</span>
    </span>
  );
}
