import { useCallback, useEffect, useRef, useState } from "react";

/** Deslocamento, em px, que confirma a intenção de abrir/fechar. */
const DRAG_THRESHOLD_PX = 26;
/** Abaixo disto o gesto conta como toque, não como arrasto. */
const TAP_SLOP_PX = 8;

/**
 * Menu escondido que só aparece com um arrasto na pega.
 *
 * Serve os dois: a barra inferior do telemóvel (arrastar para CIMA, eixo "y") e o rail
 * lateral do desktop (arrastar para o LADO, eixo "x"). O gesto é o mesmo, muda só a
 * coordenada — ter duas cópias era garantir que um dia divergiam no limiar ou no toque.
 *
 * Fica num hook porque o gesto tem estado (origem do toque, se já passou do limiar) que
 * não pode viver no render do MainLayout sem re-renderizar a árvore inteira a cada
 * `pointermove`.
 *
 * @param {boolean} ativo  Liga o comportamento (ex.: modo simples + largura certa).
 * @param {{ eixo?: "x" | "y" }} opts  "y": arrastar para cima abre. "x": para a direita abre.
 */
export default function useNavReveal(ativo, { eixo = "y" } = {}) {
  const [aberta, setAberta] = useState(false);
  const arrastoRef = useRef(null);

  // Ao desligar (sair do modo simples, rodar o ecrã) o menu volta ao normal — senão
  // ficaria preso no último estado do gesto.
  useEffect(() => {
    if (!ativo) setAberta(false);
  }, [ativo]);

  const fechar = useCallback(() => setAberta(false), []);

  /** Quanto o dedo andou no sentido que ABRE. */
  const avanco = useCallback(
    (st, event) => (eixo === "x" ? event.clientX - st.p0 : st.p0 - event.clientY),
    [eixo]
  );

  const onPointerDown = useCallback(
    (event) => {
      const el = event.currentTarget;
      try {
        el.setPointerCapture?.(event.pointerId);
      } catch (_) {}
      arrastoRef.current = { p0: eixo === "x" ? event.clientX : event.clientY, resolvido: false };
    },
    [eixo]
  );

  const onPointerMove = useCallback(
    (event) => {
      const st = arrastoRef.current;
      if (!st || st.resolvido) return;
      const d = avanco(st, event);
      if (d >= DRAG_THRESHOLD_PX) {
        st.resolvido = true;
        setAberta(true);
      } else if (d <= -DRAG_THRESHOLD_PX) {
        st.resolvido = true;
        setAberta(false);
      }
    },
    [avanco]
  );

  const onPointerUp = useCallback(
    (event) => {
      const st = arrastoRef.current;
      arrastoRef.current = null;
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch (_) {}
      if (!st || st.resolvido) return;
      // Arrasto curto demais: trata como toque na pega e alterna.
      if (Math.abs(avanco(st, event)) <= TAP_SLOP_PX) setAberta((v) => !v);
    },
    [avanco]
  );

  const onPointerCancel = useCallback(() => {
    arrastoRef.current = null;
  }, []);

  return {
    aberta: ativo && aberta,
    fechar,
    /** Props da pega: arrastar no sentido de abrir abre, no contrário fecha, toque alterna. */
    pegaProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
