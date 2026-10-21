/**
 * Resultado do orçamento — a tela de sucesso depois da criação no ERP.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (Sessão 5B).
 * Contrato: `backend/docs/wm/Integracao-ZapERP-API-WM-Atualizacao-2026-10-20` §10 e §11.1.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O NÚMERO É `codigo_pedido_erp`
 * ────────────────────────────────────────────────────────────────────────────
 * É a única coisa que o cliente final leva do atendimento ("Orçamento: 12345") e é por ela que
 * o vendedor acha o pedido no Icthus. Sai de `resultado_sanitizado.codigo_pedido_erp` e de
 * lugar nenhum mais — o backend recusa o resultado sem esse campo
 * (`resultado_sem_codigo_pedido`) em vez de inventar um número, e aqui, sem ele, a tela diz que
 * não pode confirmar o resultado em vez de mostrar um identificador nosso parecendo número de
 * orçamento.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * "JÁ ESTAVA CRIADO" VEM DO NOSSO ESTADO, NUNCA DA RESPOSTA
 * ────────────────────────────────────────────────────────────────────────────
 * §11.1 é explícito: o `200` de `/orcamentos/criar` **não distingue** "criado agora" de
 * "resultado idempotente já concluído", os dois são sucesso da mesma ação de negócio, e inferir
 * a diferença por `meta.criado_em` é PROIBIDO. Então a prop é `jaEstavaCriado` e quem a decide
 * é o chamador, olhando o estado da operação **antes** da chamada (ela já estava `CRIADO`?).
 * Nada aqui lê `resultado.meta.criado_em`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O ENVIO AO CLIENTE É UMA AÇÃO SEPARADA E EXPLÍCITA
 * ────────────────────────────────────────────────────────────────────────────
 * Criar o orçamento e mandar mensagem são duas decisões. Esta tela nunca envia nada sozinha:
 * "Enviar ao cliente" é um botão, e o que ele entrega é o TEXTO do resumo
 * (`montarResumoOrcamento`) para o caminho normal de envio da conversa, onde o atendente ainda
 * revisa antes de sair. Não há `useEffect` que envie, não há envio no sucesso.
 *
 * ⚠️ **Sessão 6**: o despacho da criação ainda não existe, então esta tela ainda não é
 * alcançável pelo fluxo. O que falta ligar:
 *   · chamar `confirmarOrcamento(preparacaoId)` e, com o resultado, montar
 *     `{ resultado, jaEstavaCriado }` e renderizar esta tela (ver `OrcamentoDrawer`,
 *     `ETAPA.RESULTADO`);
 *   · passar `onEnviarAoCliente(texto)` apontando para o envio normal da conversa (composer
 *     com texto revisável), que NÃO é responsabilidade deste módulo.
 * Enquanto `onEnviarAoCliente` não vier, o botão aparece desabilitado com frase honesta.
 *
 * ⚠️ Nunca exibir aqui: `comando_id`, `operacao_id`, `preparacao_id`, `RESULTADO_INCERTO`,
 * `requestId` ou status HTTP.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { montarResultadoView, montarResumoOrcamento } from "./orcamentoViewModel";
import { SEM_VALOR } from "./orcamentoFormat";

export default function OrcamentoResultado({
  resultado,
  jaEstavaCriado = false,
  onEnviarAoCliente,
  onFechar,
  enviando = false,
}) {
  const view = useMemo(
    () => montarResultadoView(resultado, { jaEstavaCriado }),
    [resultado, jaEstavaCriado]
  );
  const resumo = useMemo(() => montarResumoOrcamento(resultado), [resultado]);

  const [copiado, setCopiado] = useState(false);
  const timerRef = useRef(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const copiarResumo = useCallback(async () => {
    if (!resumo) return;
    try {
      await navigator.clipboard.writeText(resumo);
      setCopiado(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Área de transferência negada (permissão, http, navegador antigo): o resumo continua
      // visível na tela para seleção manual, então não há erro a mostrar.
      setCopiado(false);
    }
  }, [resumo]);

  if (!view) {
    return (
      <div className="wa-orc-body">
        <section className="wa-orc-section" aria-label="Resultado do orçamento">
          <div className="wa-orc-alert wa-orc-alert--aviso" role="status">
            <span>
              Não deu para confirmar o número deste orçamento. Não crie outro: procure o suporte
              para conferir se ele foi gravado no sistema da empresa.
            </span>
          </div>
        </section>
        <footer className="wa-orc-foot">
          <button type="button" className="wa-btn wa-btn-primary wa-orc-btnPrincipal" onClick={onFechar}>
            Fechar
          </button>
        </footer>
      </div>
    );
  }

  const envioIndisponivel = typeof onEnviarAoCliente !== "function";

  return (
    <div className="wa-orc-body">
      <section className="wa-orc-section" aria-label="Resultado do orçamento">
        <h4 className="wa-orc-sectionTitle">{view.titulo}</h4>

        <div className="wa-orc-numeroBox">
          <span className="wa-orc-totalLabel">Número do orçamento</span>
          <strong className="wa-orc-numero">{view.numero}</strong>
          {view.documento ? <span className="wa-orc-item-codigo">{view.documento}</span> : null}
        </div>

        <div className="wa-orc-resumo">
          <div className="wa-orc-resumo-linha">
            <span>Cliente</span>
            <strong>{view.cliente.nome}</strong>
          </div>
          {view.vendedor.nome !== SEM_VALOR ? (
            <div className="wa-orc-resumo-linha">
              <span>Vendedor</span>
              <strong>{view.vendedor.nome}</strong>
            </div>
          ) : null}
          <div className="wa-orc-resumo-linha wa-orc-resumo-linha--forte">
            <span>Total</span>
            <strong>{view.valorTotal}</strong>
          </div>
        </div>

        {view.protecao ? <p className="wa-orc-hint">{view.protecao}</p> : null}
        {view.fonte ? <p className="wa-orc-origem">{view.fonte.texto}</p> : null}

        <h4 className="wa-orc-sectionTitle">Resumo para o cliente</h4>
        <pre className="wa-orc-resumoTexto">{resumo}</pre>
        {envioIndisponivel ? (
          <p className="wa-orc-hint wa-orc-hint--aviso">
            O envio direto pela conversa será liberado na próxima atualização. Você pode copiar o
            resumo e enviar pelo campo de mensagem.
          </p>
        ) : (
          <p className="wa-orc-hint">
            Você revisa o texto no campo de mensagem antes de ele sair.
          </p>
        )}
      </section>

      <footer className="wa-orc-foot">
        <div className="wa-orc-acoes">
          <button
            type="button"
            className="wa-btn wa-btn-ghost wa-orc-btnSm"
            disabled={!resumo}
            onClick={copiarResumo}
          >
            {copiado ? "Copiado!" : "Copiar resumo"}
          </button>
          <button type="button" className="wa-btn wa-btn-ghost wa-orc-btnSm" onClick={onFechar}>
            Fechar
          </button>
        </div>
        <button
          type="button"
          className="wa-btn wa-btn-primary wa-orc-btnPrincipal"
          disabled={envioIndisponivel || enviando || !resumo}
          onClick={() => onEnviarAoCliente?.(resumo)}
        >
          {enviando ? "Enviando…" : "Enviar ao cliente"}
        </button>
      </footer>
    </div>
  );
}
