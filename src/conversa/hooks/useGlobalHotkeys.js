import { useEffect } from "react";

/**
 * Teclas da página de atendimento.
 *
 * `Esc` fica sempre ativo (fecha overlay / sai da conversa, mesmo durante o loading). Os
 * atalhos com Ctrl/Cmd também funcionam com o cursor no composer — é esse o ponto deles.
 * Os atalhos de UMA tecla (hoje só `?`) são ignorados enquanto se escreve, senão escrever
 * "?" numa mensagem abriria a ajuda.
 */

/** O alvo do evento é um campo de escrita? */
function alvoEditavel(target) {
  if (!target || typeof target !== "object") return false;
  const tag = String(target.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable === true) return true;
  return false;
}

export function useGlobalHotkeys({
  onToggleTimeline,
  onFocusInput,
  onEscape,
  onOpenSearch,
  onShowShortcuts,
  disabled,
}) {
  useEffect(() => {
    function onKeyDown(e) {
      const k = String(e.key || "").toLowerCase();

      /* ESC sempre ativo: fecha overlay ou sai da conversa (mesmo durante loading). */
      if (k === "escape") {
        if (e.defaultPrevented) return;
        e.preventDefault();
        onEscape?.();
        return;
      }

      if (disabled) return;

      const comModificador = e.ctrlKey || e.metaKey;

      if (comModificador && k === "k") {
        e.preventDefault();
        onFocusInput?.();
        return;
      }

      if (comModificador && k === "h") {
        e.preventDefault();
        onToggleTimeline?.();
        return;
      }

      /* Ctrl+Shift+F: busca dentro da conversa. Shift para não roubar o Ctrl+F do browser. */
      if (comModificador && e.shiftKey && k === "f") {
        if (!onOpenSearch) return;
        e.preventDefault();
        onOpenSearch();
        return;
      }

      /* "?" lista os atalhos. Atalho de uma tecla: nunca enquanto se escreve. */
      if (!comModificador && !e.altKey && e.key === "?") {
        if (!onShowShortcuts) return;
        if (alvoEditavel(e.target)) return;
        e.preventDefault();
        onShowShortcuts();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onToggleTimeline, onFocusInput, onEscape, onOpenSearch, onShowShortcuts, disabled]);
}
