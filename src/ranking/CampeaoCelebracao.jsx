import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { IconTrophy } from "@tabler/icons-react";
import { mensagemCampeao, formatarPeriodo } from "./rankingUtils";
import "../components/feedback/ConfirmDialog.css";
import "./ranking.css";

/**
 * Card de celebração do campeão da semana. Reaproveita o overlay do ConfirmDialog
 * (mesma camada, blur e animação) — só o conteúdo é próprio.
 */
export default function CampeaoCelebracao({ ciclo, usuarioId, podeVerRanking = false, onClose }) {
  const navigate = useNavigate();
  const titleId = `${useId()}-titulo`;
  const okRef = useRef(null);
  const msg = mensagemCampeao(ciclo);
  const souCampeao = (ciclo?.vencedores || []).some((v) => Number(v.usuario_id) === Number(usuarioId));

  useEffect(() => {
    const t = requestAnimationFrame(() => okRef.current?.focus?.());
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  if (!msg) return null;

  return createPortal(
    <div
      className="ds-confirm-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="rk-celebra" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <span className="rk-celebra-halo" aria-hidden />
        <span className="rk-celebra-trofeu" aria-hidden>
          <IconTrophy size={34} stroke={1.6} />
        </span>
        <p className="rk-celebra-eyebrow">Ranking da semana · {formatarPeriodo(ciclo.inicio, ciclo.fim, ciclo.timezone)}</p>
        <h2 id={titleId} className="rk-celebra-titulo">{msg.titulo}</h2>
        <p className="rk-celebra-destaque">{msg.destaque}</p>
        <p className="rk-celebra-total">{msg.total}</p>
        <p className="rk-celebra-texto">
          {souCampeao ? "Parabéns pelo excelente desempenho! 👏" : "Parabéns pelo excelente desempenho!"}
          <br />
          Uma nova competição já começou. Quem será o próximo campeão?
        </p>
        <div className="rk-celebra-acoes">
          {/* O ranking completo mora em IA / Bot → Ranking: só quem acessa essa tela vê o atalho. */}
          {podeVerRanking ? (
            <button
              type="button"
              className="ds-confirm-btn ds-confirm-btn--ghost"
              onClick={() => {
                onClose?.();
                navigate("/ia?tab=ranking");
              }}
            >
              Ver ranking
            </button>
          ) : null}
          <button ref={okRef} type="button" className="ds-confirm-btn ds-confirm-btn--primary" onClick={() => onClose?.()}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
