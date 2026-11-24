import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../api/http";
import "./encerrarSplit.css";

/*
 * Seta discreta do botão "Encerrar": o atendente escolhe, NESTE encerramento, se o cliente
 * recebe a mensagem de finalização (Configurações → "Mensagem ao finalizar atendimento").
 *
 *  - Clique no corpo do botão = comportamento de sempre (segue o toggle da empresa).
 *  - Seta → menu com "Encerrar e enviar mensagem" / "Encerrar sem mensagem".
 *
 * Por que a seta é um <span role="button"> e não um <button>: a barra tem dezenas de regras
 * `.wa-actions button { … }` (padding, fundo, borda, hover que levanta 1px) espalhadas em 4
 * folhas, várias com !important. Um <button> aqui herdaria tudo isso e a seta viraria uma
 * segunda cápsula. Como span, ela fica fora desse alcance e o acessível vem de role/tabIndex/
 * teclado, tratados abaixo.
 *
 * A seta NÃO ocupa espaço novo na barra: ela se sobrepõe a um espaçador dentro da própria
 * cápsula do "Encerrar" (ver `.wa-encerrarSplit-spacer`), então a largura cresce ~20px e a
 * barra não reflui.
 */

/** Cache por empresa do único dado que o menu precisa: qual opção é o padrão. */
const CFG_TTL_MS = 60_000;
const cfgCache = new Map(); // companyKey -> { value: boolean|null, ts, promise }

function loadEnvioAutomatico(companyKey) {
  const key = String(companyKey ?? "");
  const hit = cfgCache.get(key);
  if (hit && hit.value != null && Date.now() - hit.ts < CFG_TTL_MS) return Promise.resolve(hit.value);
  if (hit?.promise) return hit.promise;
  const promise = api
    .get("/chats/finalizacao-config")
    .then((r) => {
      const value = !!r?.data?.envio_automatico;
      cfgCache.set(key, { value, ts: Date.now(), promise: null });
      return value;
    })
    .catch(() => {
      // Sem o dado o menu funciona igual — só não marca "Padrão". Não fica cacheado o erro.
      cfgCache.delete(key);
      return null;
    });
  cfgCache.set(key, { value: hit?.value ?? null, ts: hit?.ts ?? 0, promise });
  return promise;
}

function peekEnvioAutomatico(companyKey) {
  const hit = cfgCache.get(String(companyKey ?? ""));
  return hit && hit.value != null ? hit.value : null;
}

function IconChevron() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.75 6 7.75l3-3" />
    </svg>
  );
}

function IconMsgSend() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-11.9 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" />
      <path d="m8.5 11.8 2.3 2.3 4.7-4.7" />
    </svg>
  );
}

function IconMsgOff() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.6 4.2A8.5 8.5 0 0 1 20 16.3" />
      <path d="M18.2 18.6A8.4 8.4 0 0 1 9.1 19.1L3 21l1.9-5.7a8.4 8.4 0 0 1 .9-8.9" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {import("react").ReactElement} props.mainButton — o botão "Encerrar" já montado (classes de sempre)
 * @param {boolean} props.busy — barra travada (ação em voo)
 * @param {(enviarMensagem: boolean) => void} props.onChoose
 * @param {string|number|null} props.companyKey — chave do cache (company_id do usuário)
 * @param {string|number|null} props.conversaId — fecha o menu ao trocar de conversa
 */
export default function EncerrarSplitButton({ mainButton, busy, onChoose, companyKey, conversaId }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [envioAutomatico, setEnvioAutomatico] = useState(() => peekEnvioAutomatico(companyKey));
  const wrapRef = useRef(null);
  const caretRef = useRef(null);
  const menuRef = useRef(null);

  const prefetch = useCallback(() => {
    loadEnvioAutomatico(companyKey).then((v) => {
      if (v != null) setEnvioAutomatico(v);
    });
  }, [companyKey]);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) {
      // Depois do unmount do portal, senão o foco cai no body.
      window.requestAnimationFrame(() => caretRef.current?.focus?.({ preventScroll: true }));
    }
  }, []);

  const toggle = useCallback(() => {
    if (busy) return;
    if (!open) prefetch();
    setOpen(!open);
  }, [busy, open, prefetch]);

  // Trocou de conversa ou a barra travou → o menu não pode sobrar aberto apontando para outra.
  useEffect(() => {
    setOpen(false);
  }, [conversaId]);
  useEffect(() => {
    if (busy) setOpen(false);
  }, [busy]);

  // Posição fixa ancorada na cápsula (alinha pela direita). Mesmo padrão do menu ⋯ da barra:
  // compara antes de setState para o scroll da thread não re-renderizar a barra a cada frame.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    let frame = 0;
    const update = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const next = {
        top: Math.round(r.bottom + 6),
        right: Math.max(8, Math.round(window.innerWidth - r.right)),
      };
      setPos((prev) => (prev && prev.top === next.top && prev.right === next.right ? prev : next));
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    update();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [open]);

  // Foco no 1.º item UMA vez por abertura (teclado e leitor de tela chegam direto às opções).
  // Só uma vez: `pos` muda com scroll/resize e refocar roubaria o item que o usuário escolheu.
  const focoInicialFeitoRef = useRef(false);
  useEffect(() => {
    if (!open) {
      focoInicialFeitoRef.current = false;
      return;
    }
    if (!pos || focoInicialFeitoRef.current) return;
    focoInicialFeitoRef.current = true;
    const first = menuRef.current?.querySelector('[role="menuitem"]');
    first?.focus?.({ preventScroll: true });
  }, [open, pos]);

  // Fecha ao clicar/tocar fora.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      const t = e.target;
      if (caretRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open, close]);

  function onCaretKeyDown(e) {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (!open) toggle();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  }

  function onMenuKeyDown(e) {
    const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || []);
    const idx = items.indexOf(document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      items[(idx + delta + items.length) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      (e.key === "Home" ? items[0] : items[items.length - 1])?.focus();
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  function choose(enviar) {
    setOpen(false);
    onChoose?.(enviar);
  }

  const opcoes = [
    {
      key: "com",
      enviar: true,
      icon: <IconMsgSend />,
      title: "Encerrar e enviar mensagem",
      desc: "O cliente recebe a mensagem de finalização e pode avaliar de 0 a 10.",
    },
    {
      key: "sem",
      enviar: false,
      icon: <IconMsgOff />,
      title: "Encerrar sem mensagem",
      desc: "Apenas encerra. O cliente não recebe nenhum aviso.",
    },
  ];

  return (
    <span ref={wrapRef} className={`wa-encerrarSplit${open ? " is-open" : ""}`}>
      {mainButton}
      <span
        ref={caretRef}
        role="button"
        tabIndex={busy ? -1 : 0}
        className="wa-encerrarSplit-caret"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={busy ? "true" : undefined}
        aria-label="Opções de encerramento"
        title="Encerrar com ou sem mensagem"
        onMouseEnter={prefetch}
        onFocus={prefetch}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }}
        onKeyDown={onCaretKeyDown}
      >
        <IconChevron />
      </span>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="wa-encerrarMenu"
              role="menu"
              aria-label="Como encerrar a conversa"
              style={{ top: pos.top, right: pos.right }}
              onKeyDown={onMenuKeyDown}
            >
              <div className="wa-encerrarMenu-head" aria-hidden="true">
                Como encerrar?
              </div>
              {opcoes.map((o) => {
                const isPadrao = envioAutomatico != null && envioAutomatico === o.enviar;
                return (
                  <button
                    key={o.key}
                    type="button"
                    role="menuitem"
                    className={`wa-encerrarMenu-item wa-encerrarMenu-item--${o.key}`}
                    onClick={() => choose(o.enviar)}
                  >
                    <span className="wa-encerrarMenu-icon" aria-hidden="true">
                      {o.icon}
                    </span>
                    <span className="wa-encerrarMenu-text">
                      <span className="wa-encerrarMenu-title">
                        {o.title}
                        {isPadrao ? (
                          <span className="wa-encerrarMenu-badge" title="É o que acontece ao clicar direto em Encerrar">
                            Padrão
                          </span>
                        ) : null}
                      </span>
                      <span className="wa-encerrarMenu-desc">{o.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </span>
  );
}
