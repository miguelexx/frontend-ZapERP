/**
 * O relógio que faz a idade do saldo continuar certa com o drawer aberto.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md`.
 * Regras da idade: `idadeDoSaldo` / `idadeLegivel` em `orcamentoFormat.js`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE UM RELÓGIO, E NÃO O INSTANTE DA CONSULTA
 * ────────────────────────────────────────────────────────────────────────────
 * O saldo é buscado UMA vez, no toque. A idade dele, não: ela anda. A atendente abre o drawer,
 * consulta o produto, conversa com o cliente no WhatsApp, volta vinte minutos depois e fecha o
 * orçamento — e "Saldo atualizado há 40 min" ainda estaria escrito ali, agora falso, exatamente
 * no tipo de frase que foi criada para não mentir sobre a hora do dado.
 *
 * Então a idade é recalculada a cada minuto a partir de um instante que avança. Um minuto é a
 * menor unidade que a frase exibe ("há 12 min"), e nenhuma unidade acima dela muda mais rápido
 * do que isso — recalcular mais vezes não mudaria um pixel.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * E POR QUE ELE SE DESLIGA
 * ────────────────────────────────────────────────────────────────────────────
 * `ativo` existe porque a esmagadora maioria dos cards não tem carimbo nenhum na tela: card de
 * lista não traz estoque (o preço é sob demanda, um toque por produto), e nesses momentos um
 * timer ligado seria um render por minuto na busca de produto — caminho quente, com trinta cards
 * e digitação em curso. Quem usa o relógio diz se há idade na tela; sem idade, nada tiquetaqueia.
 *
 * Duas correções de precisão que um `setInterval` sozinho não dá:
 *
 *   · AO LIGAR, relê o relógio. O componente pode estar montado há meia hora sem carimbo algum
 *     (`ativo` falso), e o instante guardado no primeiro render já estaria velho quando o
 *     primeiro saldo chega. A releitura só troca o estado se houver defasagem de pelo menos um
 *     passo — devolver o mesmo valor de um `setState` não repinta nada, e é isso que mantém o
 *     primeiro render de graça.
 *
 *   · AO VOLTAR PARA A ABA, relê também. O navegador estrangula timer de aba escondida (e o
 *     celular suspende a página inteira ao trocar de app), então o tique pode chegar minutos
 *     atrasado. Quem volta para a aba olha a tela imediatamente — é o pior instante possível
 *     para ela estar exibindo a idade de quando saiu.
 */

import { useEffect, useState } from "react";

/** Passo do relógio: a menor unidade que a frase da idade exibe é o minuto. */
export const PASSO_RELOGIO_MS = 60 * 1000;

/**
 * Instante de referência (ms) que avança de minuto em minuto enquanto `ativo`.
 *
 * @param {boolean} [ativo] há idade sendo exibida agora? Falso ⇒ nenhum timer, nenhum render.
 * @returns {number} o `Date.now()` a passar para `idadeDoSaldo`
 */
export default function useRelogioDeIdade(ativo = true) {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (!ativo) return undefined;

    // Só troca o estado se o guardado já ficou para trás: igual ⇒ React não repinta.
    const sincronizar = () =>
      setAgora((anterior) => {
        const atual = Date.now();
        return atual - anterior >= PASSO_RELOGIO_MS ? atual : anterior;
      });

    sincronizar();
    const id = setInterval(() => setAgora(Date.now()), PASSO_RELOGIO_MS);

    // `document` pode não existir (teste em Node, render no servidor): o relógio continua
    // funcionando pelo intervalo, só sem a correção de volta à aba.
    const doc = typeof document !== "undefined" ? document : null;
    const aoVoltar = () => {
      if (!doc.hidden) sincronizar();
    };
    doc?.addEventListener?.("visibilitychange", aoVoltar);

    return () => {
      clearInterval(id);
      doc?.removeEventListener?.("visibilitychange", aoVoltar);
    };
  }, [ativo]);

  return agora;
}
