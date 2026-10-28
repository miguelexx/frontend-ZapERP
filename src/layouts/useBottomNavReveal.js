import { useCallback, useEffect, useRef, useState } from "react";

/** Deslocamento vertical, em px, que confirma a intenção de abrir/fechar. */
const DRAG_THRESHOLD_PX = 26;
/** Abaixo disto o gesto conta como toque, não como arrasto. */
const TAP_SLOP_PX = 8;

/**
 * Barra inferior escondida que só aparece ao arrastar para cima (modo simples).
 *
 * Fica num hook porque o gesto tem estado (origem do toque, se já passou do
 * limiar) que não pode viver no render do MainLayout sem re-renderizar a árvore
 * inteira a cada `pointermove`.
 *
 * @param {boolean} ativo  Liga o comportamento (modo simples + largura mobile).
 */
export default function useBottomNavReveal(ativo) {
  const [aberta, setAberta] = useState(false);
  const arrastoRef = useRef(null);

  // Ao desligar (sair do modo simples, rodar o ecrã para desktop) a barra volta
  // ao normal — senão ficaria presa no último estado do gesto.
  useEffect(() => {
    if (!ativo) setAberta(false);
  }, [ativo]);

  const fechar = useCallback(() => setAberta(false), []);

  const onPointerDown = useCallback((event) => {
    const el = event.currentTarget;
    try {
      el.setPointerCapture?.(event.pointerId);
    } catch (_) {}
    arrastoRef.current = { y0: event.clientY, resolvido: false };
  }, []);

  const onPointerMove = useCallback((event) => {
    const st = arrastoRef.current;
    if (!st || st.resolvido) return;
    const dy = st.y0 - event.clientY;
    if (dy >= DRAG_THRESHOLD_PX) {
      st.resolvido = true;
      setAberta(true);
    } else if (dy <= -DRAG_THRESHOLD_PX) {
      st.resolvido = true;
      setAberta(false);
    }
  }, []);

  const onPointerUp = useCallback((event) => {
    const st = arrastoRef.current;
    arrastoRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch (_) {}
    if (!st || st.resolvido) return;
    // Arrasto curto demais: trata como toque na pega e alterna.
    if (Math.abs(st.y0 - event.clientY) <= TAP_SLOP_PX) setAberta((v) => !v);
  }, []);

  const onPointerCancel = useCallback(() => {
    arrastoRef.current = null;
  }, []);

  return {
    aberta: ativo && aberta,
    fechar,
    /** Props da pega: arrastar para cima abre, para baixo fecha, toque alterna. */
    pegaProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
