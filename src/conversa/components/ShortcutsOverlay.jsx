import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./shortcuts-overlay.css";

/**
 * Lista de atalhos da página de atendimento (tecla `?`).
 *
 * Porque existe: os atalhos não estavam escritos em lugar nenhum da interface, e atalho que
 * ninguém descobre não é usado.
 *
 * O Escape é tratado AQUI, num listener de captura no `window`: a fase de captura corre antes
 * do listener de bolha do `useGlobalHotkeys`, por isso fecha só este painel e não a conversa
 * atrás dele — sem precisar de entrar na cadeia de `conversationEscapeOrder.js` (que tem
 * ordem testada e é melhor não mexer).
 */

function ehMac() {
  if (typeof navigator === "undefined") return false;
  const alvo = `${navigator.userAgentData?.platform || ""} ${navigator.platform || ""} ${navigator.userAgent || ""}`;
  return /mac|iphone|ipad|ipod/i.test(alvo);
}

function listaAtalhos(mac) {
  const mod = mac ? "⌘" : "Ctrl";
  return [
    { teclas: ["Esc"], desc: "Fecha o painel aberto; sem painel, fecha a conversa" },
    { teclas: [mod, "K"], desc: "Ir para o campo de mensagem" },
    { teclas: [mod, "H"], desc: "Abrir/fechar o histórico do atendimento" },
    { teclas: [mod, "Shift", "F"], desc: "Buscar mensagem nesta conversa" },
    { teclas: ["?"], desc: "Mostrar esta lista" },
  ];
}

export default function ShortcutsOverlay({ open, onClose }) {
  const fecharRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (String(e.key || "").toLowerCase() !== "escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    /* Leva o foco para dentro do painel (o Tab a seguir anda nele, não na thread atrás). */
    try {
      fecharRef.current?.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }, [open]);

  if (!open) return null;

  const atalhos = listaAtalhos(ehMac());

  /* Portal no body: dentro da área do chat (`isolation: isolate`) o z-index 1200 valia só lá
     dentro — a lista e o rail pintavam POR CIMA do cartão e o fundo não os escurecia. */
  const node = (
    <div
      className="wa-shortcuts__backdrop"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="wa-shortcuts"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-shortcuts-title"
      >
        <div className="wa-shortcuts__head">
          <h2 className="wa-shortcuts__title" id="wa-shortcuts-title">
            Atalhos do teclado
          </h2>
          <button
            type="button"
            className="wa-shortcuts__close"
            onClick={() => onClose?.()}
            aria-label="Fechar"
            ref={fecharRef}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <ul className="wa-shortcuts__list">
          {atalhos.map((item) => (
            <li className="wa-shortcuts__item" key={item.teclas.join("+")}>
              <span className="wa-shortcuts__keys">
                {item.teclas.map((tecla, i) => (
                  <span key={tecla}>
                    {i > 0 ? <span className="wa-shortcuts__plus">+</span> : null}
                    <kbd className="wa-shortcuts__kbd">{tecla}</kbd>
                  </span>
                ))}
              </span>
              <span className="wa-shortcuts__desc">{item.desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}
