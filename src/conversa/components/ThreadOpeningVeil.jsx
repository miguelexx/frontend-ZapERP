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
 *
 * Desde 26/11/2026 o ConversaView só ativa o véu quando a conversa abriu SEM lista (sem cache):
 * com mensagens já em mãos o esqueleto era um flash de fantasmas sobre conteúdo que existe.
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

/*
 * Lê TUDO primeiro e escreve depois, e só o que mudou (26/11/2026). Ler offsetLeft depois de
 * escrever style.top (e assim por diante) forçava um recálculo de estilo do conversa.css inteiro
 * por propriedade — ~6 recálculos na montagem de cada conversa, pesado em celular fraco.
 */
function readBox(t, withPadding) {
  const box = {
    top: t.offsetTop,
    left: t.offsetLeft,
    width: t.offsetWidth,
    height: t.offsetHeight,
  };
  if (withPadding) {
    try {
      const cs = getComputedStyle(t);
      box.padL = cs.paddingLeft;
      box.padR = cs.paddingRight;
      box.padB = cs.paddingBottom;
    } catch {
      /* ignore */
    }
  }
  return box;
}

function writeBox(veil, box, last) {
  if (last.top !== box.top) veil.style.top = `${box.top}px`;
  if (last.left !== box.left) veil.style.left = `${box.left}px`;
  if (last.width !== box.width) veil.style.width = `${box.width}px`;
  if (last.height !== box.height) veil.style.height = `${box.height}px`;
  if (box.padL != null && last.padL !== box.padL) veil.style.setProperty("--veil-pad-x-l", box.padL);
  if (box.padR != null && last.padR !== box.padR) veil.style.setProperty("--veil-pad-x-r", box.padR);
  if (box.padB != null && last.padB !== box.padB) veil.style.setProperty("--veil-pad-b", box.padB);
  Object.assign(last, box);
}

function ThreadOpeningVeil({ active, targetRef }) {
  const veilRef = useRef(null);
  const lastRef = useRef({});

  useLayoutEffect(() => {
    const target = targetRef?.current;
    const veil = veilRef.current;
    if (!target || !veil) return undefined;
    const sync = () => {
      const t = targetRef.current;
      if (!t || !veilRef.current) return;
      writeBox(veilRef.current, readBox(t, true), lastRef.current);
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
    writeBox(veil, readBox(t, false), lastRef.current);
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
