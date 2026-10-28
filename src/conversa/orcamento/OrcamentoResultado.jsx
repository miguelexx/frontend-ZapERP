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
 * O que `onEnviarAoCliente(texto)` recebe é o TEXTO pronto; o que ele faz com isso é do
 * chamador — hoje, colocá-lo no composer da conversa. Sem esse callback o botão aparece
 * desabilitado com frase honesta, e "Copiar resumo" continua valendo.
 *
 * Falha no envio do WhatsApp **não** recria orçamento: esta tela não conhece a criação, e o
 * texto fica disponível para tentar de novo quantas vezes for preciso.
 *
 * ⚠️ Nunca exibir aqui: `comando_id`, `operacao_id`, `preparacao_id`, `RESULTADO_INCERTO`,
 * `requestId` ou status HTTP.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  avisoItensSemPreco,
  montarResultadoView,
  montarResumoOrcamento,
} from "./orcamentoViewModel";
import { SEM_VALOR } from "./orcamentoFormat";

export default function OrcamentoResultado({
  resultado,
  previa = null,
  jaEstavaCriado = false,
  onEnviarAoCliente,
  onFechar,
  enviando = false,
  /**
   * Orçamento avulso (balcão): não há conversa para onde enviar. Em vez do botão "Enviar ao
   * cliente" desabilitado — que aqui seria um botão morto e uma promessa ("próxima atualização")
   * que não se aplica —, o "Copiar resumo" vira a ação principal. Fora do avulso nada muda.
   */
  avulso = false,
}) {
  const view = useMemo(
    () => montarResultadoView(resultado, { jaEstavaCriado }),
    [resultado, jaEstavaCriado]
  );
  // A prévia entra só para o resumo ganhar as linhas de item: o `200` da criação traz número,
  // cliente, vendedor e total, nunca os itens (§10). Sem ela o resumo cai para a forma curta.
  const resumo = useMemo(() => montarResumoOrcamento(resultado, { previa }), [resultado, previa]);
  /*
    Os itens só existem na prévia confirmada (§10 — o `200` da criação não os traz), então é
    dela que sai o aviso. Sem prévia (depois de um F5, quando só há a operação lida do servidor)
    não há item para examinar e o aviso simplesmente não aparece: calar é melhor que afirmar
    sobre preço que esta tela não tem em mãos.
  */
  const avisoSemPreco = useMemo(
    () => avisoItensSemPreco(previa, { momento: "envio" }),
    [previa]
  );

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
      <>
        <div className="wa-orc-body">
          <section className="wa-orc-section" aria-label="Resultado do orçamento">
            <div className="wa-orc-alert wa-orc-alert--aviso" role="status">
              <span>
                Não deu para confirmar o número deste orçamento. Não crie outro: procure o suporte
                para conferir se ele foi gravado no sistema da empresa.
              </span>
            </div>
          </section>
        </div>
        <footer className="wa-orc-foot">
          <button type="button" className="wa-btn wa-btn-primary wa-orc-btnPrincipal" onClick={onFechar}>
            Fechar
          </button>
        </footer>
      </>
    );
  }

  const envioIndisponivel = typeof onEnviarAoCliente !== "function";

  return (
    <>
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
          {/*
            ÚLTIMO PORTÃO. Daqui o texto vai para o campo de mensagem e, de lá, para o cliente —
            e é só nesse ponto que um preço que não existe deixa de ser detalhe de tela e vira
            um valor que o cliente leu. O aviso fica ACIMA do texto, para ser lido antes dele, e
            fala do que acontece a seguir (tirar a linha, ou cadastrar o preço e refazer) em vez
            de repetir a frase da prévia, que falava de corrigir antes de criar.
          */}
          {avisoSemPreco ? (
            <div className="wa-orc-alert wa-orc-alert--aviso" role="alert">
              <span>{avisoSemPreco.texto}</span>
            </div>
          ) : null}
          <pre className="wa-orc-resumoTexto">{resumo}</pre>
          {avulso ? (
            <p className="wa-orc-hint">
              Copie o resumo e cole no campo de mensagem da conversa com o cliente.
            </p>
          ) : envioIndisponivel ? (
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
      </div>
      {avulso ? (
        <footer className="wa-orc-foot">
          <div className="wa-orc-acoes">
            <button type="button" className="wa-btn wa-btn-ghost wa-orc-btnSm" onClick={onFechar}>
              Fechar
            </button>
          </div>
          <button
            type="button"
            className="wa-btn wa-btn-primary wa-orc-btnPrincipal"
            disabled={!resumo}
            onClick={copiarResumo}
          >
            {copiado ? "Copiado!" : "Copiar resumo"}
          </button>
        </footer>
      ) : (
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
      )}
    </>
  );
}
