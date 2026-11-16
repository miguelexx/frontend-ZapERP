import { useEffect, useState } from "react";

/**
 * "Esta tela está num celular?" — a MESMA linha de corte do CSS do drawer.
 *
 * Existe porque a diferença entre o orçamento no desktop e no celular não é só de tamanho: no
 * celular alguns blocos precisam SUMIR da tela até serem pedidos (cliente/vendedor já resolvidos,
 * desconto no total), e sumir é decisão de ÁRVORE, não de folha de estilo. `display: none` deixa
 * o nó no DOM — e um bloco que continua no DOM continua sendo tabulável, continua sendo lido por
 * leitor de tela e continua montado com o estado dele vivo.
 *
 * O valor inicial é LIDO no primeiro render (`useState` com função), e não num efeito depois da
 * montagem: começar em `false` e corrigir no efeito faria o celular pintar a versão de desktop
 * por um quadro — num drawer que abre por cima de uma conversa, esse quadro é um pulo visível.
 *
 * `600px` é o mesmo número da media query de `orcamento.css` (`@media (max-width: 600px)`), e os
 * dois têm de andar juntos: se um dia a largura mudar lá, muda aqui. Não é `pointer: coarse` de
 * propósito — o que governa este desenho é LARGURA (um tablet com toque tem espaço para os dois
 * campos lado a lado); o alvo de toque, esse sim, é regra de `pointer: coarse` e vive no CSS.
 *
 * Sem `window` (o render em memória da suíte, `renderToStaticMarkup`) devolve `false`: a árvore
 * provada pelos testes é a de desktop, que é a completa.
 */
export const CONSULTA_MOBILE = "(max-width: 600px)";

function leituraAtual() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(CONSULTA_MOBILE).matches;
  } catch {
    return false;
  }
}

export default function useOrcamentoMobile() {
  const [mobile, setMobile] = useState(leituraAtual);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    let mq;
    try {
      mq = window.matchMedia(CONSULTA_MOBILE);
    } catch {
      return undefined;
    }
    const aplicar = () => setMobile(mq.matches);
    // Girar o aparelho muda a resposta: a assinatura vale enquanto o drawer estiver aberto.
    aplicar();
    if (mq.addEventListener) mq.addEventListener("change", aplicar);
    else if (mq.addListener) mq.addListener(aplicar);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", aplicar);
      else if (mq.removeListener) mq.removeListener(aplicar);
    };
  }, []);

  return mobile;
}
