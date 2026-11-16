import { useEffect, useRef } from "react";

/**
 * O drawer do orçamento acima do TECLADO virtual.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O PROBLEMA, QUE É ESPECÍFICO DESTA TELA
 * ────────────────────────────────────────────────────────────────────────────
 * Montar um orçamento no celular é um laço de BUSCA: tocar o campo, digitar, ler os resultados,
 * tocar um. O teclado sobe em TODOS esses passos — e os resultados nascem logo abaixo do campo,
 * exatamente onde o teclado está.
 *
 * No Android o navegador encolhe a viewport de layout quando o teclado abre, então um painel
 * `position: fixed; inset: 0` encolhe junto e tudo se resolve sozinho. No iOS (Safari e PWA) a
 * viewport de layout NÃO encolhe: ela continua com a altura toda, o teclado se sobrepõe a ela, e
 * o painel fixo continua desenhando 844px num aparelho que só mostra ~500px. O resultado é o que
 * se via na prática: a lista de produtos e o "Calcular" ficavam ATRÁS do teclado, e a atendente
 * tinha de fechar o teclado para ver o que a busca devolveu.
 *
 * `visualViewport` é a única API que enxerga isso: `height` é o que o olho vê, `offsetTop` é o
 * quanto o navegador empurrou a página para cima para manter o campo focado à vista.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ELE FAZ — E O QUE ELE DELIBERADAMENTE NÃO FAZ
 * ────────────────────────────────────────────────────────────────────────────
 * Escreve DUAS custom properties no próprio elemento (`--orc-vvh`, `--orc-vvtop`) e para por aí.
 * Quem decide se elas valem alguma coisa é o CSS, e só dentro da media query do celular — no
 * desktop as duas são ignoradas mesmo que estejam escritas.
 *
 * NÃO mexe no scroll de nada, não chama `scrollIntoView`, não escuta `focusin`. O sistema de
 * scroll/teclado da CONVERSA (`useAutoScroll` + `useMobileKeyboardViewport`) é zona de perigo
 * registrada no CLAUDE.md e tem as variáveis dele (`--wa-visual-height`, `--wa-keyboard-inset`)
 * escritas no `documentElement`; este aqui escreve só no nó do drawer, com nomes de outro
 * prefixo, e some inteiro quando o drawer fecha. Os dois nunca disputam o mesmo alvo.
 *
 * Os eventos de `visualViewport` vêm em rajada durante a animação do teclado (dezenas por
 * segundo): a aplicação é coalescida em um quadro, como o resto do projeto já faz.
 *
 * Sem `visualViewport` (navegador antigo) nada é escrito e o CSS cai no `100dvh` de sempre.
 */
export default function useDrawerViewport(ativo) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ativo) return undefined;
    const el = ref.current;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!el || !vv) return undefined;

    let raf = 0;
    const aplicar = () => {
      raf = 0;
      /*
        Arredondar para baixo, nunca para cima: meio pixel a mais de altura devolve a barra de
        rolagem que a janela inteira acabou de perder, e com ela o tranco no fim do scroll.
      */
      el.style.setProperty("--orc-vvh", `${Math.floor(vv.height)}px`);
      el.style.setProperty("--orc-vvtop", `${Math.round(vv.offsetTop)}px`);
    };
    const agendar = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(aplicar);
    };

    aplicar();
    vv.addEventListener("resize", agendar);
    vv.addEventListener("scroll", agendar);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      vv.removeEventListener("resize", agendar);
      vv.removeEventListener("scroll", agendar);
      el.style.removeProperty("--orc-vvh");
      el.style.removeProperty("--orc-vvtop");
    };
  }, [ativo]);

  return ref;
}
