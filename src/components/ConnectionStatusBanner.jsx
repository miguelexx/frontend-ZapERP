import { useEffect, useRef, useState } from "react";
import { useConnectionStore, statusConexao } from "../socket/connectionStore";
import "./connection-status.css";

/**
 * Aviso de tempo real em baixo.
 *
 * Problema que resolve: com o socket caído, a lista e a thread simplesmente congelam. Sem
 * aviso, o atendente lê a tela como "o cliente não respondeu" e fica à espera. Agora vê
 * que o problema é a ligação e pode recarregar ou trocar de rede.
 *
 * Decisões:
 *  - **Nada em condições normais.** Só aparece quando está em baixo, e desaparece sozinho
 *    com uma confirmação curta ao voltar. Chrome permanente para um estado que é raro só
 *    ensina o utilizador a ignorar.
 *  - **Atraso de {@link ATRASO_AVISO_MS} antes de aparecer.** O Socket.IO religa em ~500 ms
 *    (`reconnectionDelay`), e `pagehide`/`visibilitychange` desligam de propósito ao trocar
 *    de aba. Sem o atraso, isto piscava a cada troca de aba.
 *  - **`pointer-events: none`** (ver CSS): nunca pode tapar um clique de nada que já existe.
 */

const ATRASO_AVISO_MS = 1200;
const DURACAO_OK_MS = 2600;

const COPY = {
  religando: {
    titulo: "Reconectando…",
    detalhe: "As mensagens novas podem demorar a aparecer.",
  },
  offline: {
    titulo: "Sem conexão",
    detalhe: "Você está offline. Nada novo entra até a rede voltar.",
  },
  ok: {
    titulo: "Conexão restabelecida",
    detalhe: "",
  },
};

function IconeAviso({ estado }) {
  if (estado === "ok") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M4 12.5l5 5L20 6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (estado === "offline") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l18 18" />
          <path d="M8.5 15.5a5 5 0 017 0" />
          <path d="M5 12a10 10 0 014-2.7" />
          <path d="M15 9.3A10 10 0 0119 12" />
          <path d="M12 19h.01" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="zs-conn__spin">
      <path
        d="M12 4a8 8 0 018 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.2" opacity="0.25" />
    </svg>
  );
}

export default function ConnectionStatusBanner() {
  /* Seletores primitivos: devolver o objeto do store re-renderizaria a cada `set()`. */
  const conectado = useConnectionStore((s) => s.conectado);
  const jaConectou = useConnectionStore((s) => s.jaConectou);
  const online = useConnectionStore((s) => s.online);
  const status = statusConexao({ conectado, jaConectou, online });

  const [estado, setEstado] = useState(null);
  const estadoRef = useRef(null);
  estadoRef.current = estado;
  const timerRef = useRef(0);

  useEffect(() => {
    const limpar = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = 0;
      }
    };
    limpar();

    if (status === "boot") {
      setEstado(null);
      return undefined;
    }

    if (status === "ligado") {
      /* Só confirma a recuperação a quem viu o aviso de queda. */
      if (estadoRef.current === "religando" || estadoRef.current === "offline") {
        setEstado("ok");
        timerRef.current = window.setTimeout(() => setEstado(null), DURACAO_OK_MS);
      } else {
        setEstado(null);
      }
      return limpar;
    }

    /* Em baixo: troca imediata entre religando↔offline se o aviso já está na tela. */
    if (estadoRef.current === "religando" || estadoRef.current === "offline") {
      setEstado(status);
      return limpar;
    }
    timerRef.current = window.setTimeout(() => setEstado(status), ATRASO_AVISO_MS);
    return limpar;
  }, [status]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  if (!estado) return null;
  const copy = COPY[estado];
  if (!copy) return null;

  return (
    <div className="zs-connWrap" role="status" aria-live="polite">
      <div className={`zs-conn zs-conn--${estado}`}>
        <span className="zs-conn__icon">
          <IconeAviso estado={estado} />
        </span>
        <span className="zs-conn__text">
          <strong className="zs-conn__title">{copy.titulo}</strong>
          {copy.detalhe ? <span className="zs-conn__detail">{copy.detalhe}</span> : null}
        </span>
      </div>
    </div>
  );
}
