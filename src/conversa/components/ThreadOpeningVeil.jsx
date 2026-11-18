import { memo, useLayoutEffect, useRef } from "react";

/*
 * Véu da abertura de conversa (17/11/2026).
 *
 * Enquanto a máscara de abertura esconde a thread (snap ao fim, fotos visíveis decodificando,
 * lista do servidor chegando), a área das mensagens ficava VAZIA — e na 1.ª abertura o
 * esqueleto do "carregando" sumia, ficava branco, e só então as bolhas apareciam: a "piscada".
 * Este véu cobre o intervalo inteiro com bolhas-fantasma ancoradas no FUNDO (onde as
 * mensagens de verdade vão aparecer) e sai em fade cruzado com a thread.
 *
 * Fica FORA do `.wa-messages` de propósito: dentro do scroller ele entraria no fluxo (gap do
 * flex, offsetTop da lista, scrollHeight) — exatamente as grandezas que o virtualizer e o
 * snap de abertura medem. Aqui é um irmão absoluto que copia a caixa do scroller.
 */
const ROWS = [
  { dir: "in", w: "46%", h: 38 },
  { dir: "in", w: "62%", h: 56 },
  { dir: "out", w: "40%", h: 38 },
  { dir: "out", w: "28%", h: 38 },
  { dir: "in", w: "54%", h: 38 },
  { dir: "out", w: "58%", h: 74 },
  { dir: "in", w: "36%", h: 38 },
  { dir: "out", w: "44%", h: 38 },
];

function ThreadOpeningVeil({ active, targetRef }) {
  const veilRef = useRef(null);

  useLayoutEffect(() => {
    const target = targetRef?.current;
    const veil = veilRef.current;
    if (!target || !veil) return undefined;
    const sync = () => {
      const t = targetRef.current;
      if (!t) return;
      veil.style.top = `${t.offsetTop}px`;
      veil.style.left = `${t.offsetLeft}px`;
      veil.style.width = `${t.offsetWidth}px`;
      veil.style.height = `${t.offsetHeight}px`;
      try {
        const cs = getComputedStyle(t);
        veil.style.setProperty("--veil-pad-x-l", cs.paddingLeft);
        veil.style.setProperty("--veil-pad-x-r", cs.paddingRight);
        veil.style.setProperty("--veil-pad-b", cs.paddingBottom);
      } catch {
        /* ignore */
      }
    };
    sync();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(sync);
    ro.observe(target);
    return () => ro.disconnect();
  }, [targetRef]);

  /* Ao ativar, re-sincroniza: o cabeçalho pode ter mudado de altura sem o scroller mudar
     de tamanho (offsetTop muda, tamanho não → o RO não avisa). */
  useLayoutEffect(() => {
    if (!active) return;
    const t = targetRef?.current;
    const veil = veilRef.current;
    if (!t || !veil) return;
    veil.style.top = `${t.offsetTop}px`;
    veil.style.left = `${t.offsetLeft}px`;
    veil.style.width = `${t.offsetWidth}px`;
    veil.style.height = `${t.offsetHeight}px`;
  }, [active, targetRef]);

  return (
    <div
      ref={veilRef}
      className={`wa-openVeil${active ? " is-active" : ""}`}
      aria-hidden="true"
    >
      <div className="wa-openVeil-rows">
        {ROWS.map((r, i) => (
          <div key={i} className={`wa-openVeil-row wa-openVeil-row--${r.dir}`}>
            <span className="wa-openVeil-bubble" style={{ width: r.w, height: r.h, "--i": i }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(ThreadOpeningVeil);
