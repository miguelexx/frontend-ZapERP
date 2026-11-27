import { useEffect, useRef } from "react";

/*
 * Foco de diálogo modal (26/11/2026) — Transferir, Aguardar cliente, Aguardar pagamento.
 *
 * Os três declaravam `aria-modal="true"` mas o foco ficava no botão do cabeçalho (ou no
 * body): o 1.º Tab caía no "Encerrar" POR BAIXO do véu, e ao fechar o foco ia para o body.
 * Mesmo padrão do AtendentesModal (trap de Tab) e do EncerrarSplitButton (devolve o foco
 * num rAF, depois de o portal desmontar).
 *
 *  - Ao abrir: foca `getInitialFocus()` (ou o 1.º focável, ou o próprio diálogo). Quem chama
 *    decide; a regra da casa é NUNCA focar um campo de texto em ponteiro grosso (o teclado
 *    do celular cobria metade do modal).
 *  - Tab / Shift+Tab giram dentro do diálogo; foco que escapou volta para dentro.
 *  - Ao fechar: devolve a quem abriu, se ainda estiver na página; senão ao `returnFocusRef`.
 *
 * O ESC NÃO é tratado aqui: cada modal tem a sua cascata (busca preenchida → fecha).
 */

const FOCAVEIS =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function visivel(el) {
  if (!el || typeof el.getClientRects !== "function") return false;
  return el.getClientRects().length > 0;
}

export function focaveisDentro(root) {
  if (!root) return [];
  // `tabIndex < 0`: rádio não escolhido de um grupo com foco itinerante — fora da ordem do Tab.
  return Array.from(root.querySelectorAll(FOCAVEIS)).filter((el) => el.tabIndex >= 0 && visivel(el));
}

function focar(el) {
  if (!el || typeof el.focus !== "function") return false;
  try {
    el.focus({ preventScroll: true });
  } catch {
    try {
      el.focus();
    } catch {
      return false;
    }
  }
  return document.activeElement === el;
}

/**
 * Grupo de rádio feito de <button role="radio">: as setas mudam a escolha e levam o foco,
 * como um rádio nativo (um só ponto de Tab — o escolhido leva tabIndex 0, os outros -1).
 */
export function moverSelecaoRadio(e, opcoes, atual, setAtual) {
  const teclas = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
  if (!teclas.includes(e.key) || !Array.isArray(opcoes) || opcoes.length === 0) return;
  e.preventDefault();
  const idx = Math.max(0, opcoes.findIndex((o) => o.id === atual));
  let next = idx;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % opcoes.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + opcoes.length) % opcoes.length;
  else if (e.key === "Home") next = 0;
  else next = opcoes.length - 1;
  setAtual(opcoes[next].id);
  const radios = e.currentTarget?.querySelectorAll?.('[role="radio"]');
  radios?.[next]?.focus?.({ preventScroll: true });
}

export function isPonteiroFino() {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)")?.matches === true;
  } catch {
    return false;
  }
}

/**
 * Campo de texto do composer da conversa aberta, se puder receber foco agora (visível, ativo,
 * fora de camada `inert`). Destino de foco "para continuar digitando" no desktop.
 */
export function campoDoComposer() {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(".wa-composerStack textarea.wa-input");
  if (!el || el.disabled || !visivel(el)) return null;
  if (typeof el.closest === "function" && el.closest("[inert]")) return null;
  return el;
}

/**
 * @param {object} p
 * @param {boolean} p.open
 * @param {{ current: HTMLElement | null }} p.dialogRef — o elemento com role="dialog" (tabIndex -1)
 * @param {() => (HTMLElement | null | undefined)} [p.getInitialFocus]
 * @param {{ current: HTMLElement | null }} [p.returnFocusRef] — plano B se quem abriu sumiu
 * @param {() => (HTMLElement | null | undefined)} [p.getReturnFocus] — plano C, resolvido no
 *   fechamento (ex.: o gatilho "Mais opções" quando o item de menu que abriu já desmontou)
 */
export function useDialogFocus({ open, dialogRef, getInitialFocus, returnFocusRef, getReturnFocus }) {
  const getInitialRef = useRef(getInitialFocus);
  getInitialRef.current = getInitialFocus;
  const returnRef = useRef(returnFocusRef);
  returnRef.current = returnFocusRef;
  const getReturnRef = useRef(getReturnFocus);
  getReturnRef.current = getReturnFocus;

  useEffect(() => {
    if (!open) return undefined;
    const opener = typeof document !== "undefined" ? document.activeElement : null;

    // Um frame: o portal já está no DOM (este efeito corre depois do commit), mas um menu que
    // acabou de fechar pode ainda devolver o foco ao gatilho no mesmo tique.
    const raf = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (dialog.contains(document.activeElement) && document.activeElement !== dialog) return;
      const alvo = getInitialRef.current?.() || focaveisDentro(dialog)[0] || dialog;
      focar(alvo);
    });

    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const els = focaveisDentro(dialog);
      if (els.length === 0) {
        e.preventDefault();
        focar(dialog);
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const ativo = document.activeElement;
      if (!dialog.contains(ativo)) {
        e.preventDefault();
        focar(e.shiftKey ? last : first);
        return;
      }
      if (e.shiftKey && (ativo === first || ativo === dialog)) {
        e.preventDefault();
        focar(last);
      } else if (!e.shiftKey && ativo === last) {
        e.preventDefault();
        focar(first);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      // Depois do unmount do portal; senão o foco cai no body.
      window.requestAnimationFrame(() => {
        const ativo = document.activeElement;
        // Alguém (outro diálogo, o composer) já pegou o foco de propósito: não roubar.
        if (ativo && ativo !== document.body && ativo !== document.documentElement) return;
        if (opener && opener !== document.body && document.contains(opener) && focar(opener)) return;
        const plano = returnRef.current?.current;
        if (plano && document.contains(plano) && focar(plano)) return;
        let planoC = null;
        try {
          planoC = getReturnRef.current?.() || null;
        } catch {
          planoC = null;
        }
        if (planoC && document.contains(planoC)) focar(planoC);
      });
    };
  }, [open, dialogRef]);
}
