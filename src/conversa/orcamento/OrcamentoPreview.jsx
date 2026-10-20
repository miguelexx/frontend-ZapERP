/**
 * PLACEHOLDER DELIBERADO — a prévia do orçamento aguarda o schema da WM.
 *
 * Ver `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md`, seção 10, **pendência 1**
 * ("Schema de `pronto_para_confirmacao`", ABERTA):
 *
 *   `PrepararOrcamentoResposta.dados` modela apenas `status`, `indice_item`, `paginacao` e
 *   `candidatos`. A prévia **não está no contrato**: não há itens canônicos, preço unitário,
 *   subtotal nem total especificados. Não se sabe de qual campo sai cada `preco_confirmado`.
 *
 * POR QUE ESTA TELA NÃO ADIVINHA OS CAMPOS
 *
 * O backend não aceita prévia fora do formato esperado: `extrairPayloadCriacaoDaPrevia`
 * (`backend/services/wm/wmOrcamentoService.js`) FALHA ALTO de propósito quando preço não vem
 * como string decimal (`previa_preco_invalido` → `WM_RESPOSTA_INVALIDA`), em vez de converter
 * ou arredondar. Desenhar a tela em cima de nomes de campo inventados produziria uma prévia
 * bonita que ou nunca aparece (porque o backend recusou antes) ou — pior — mostra número de um
 * campo que não é o preço que será gravado no ERP.
 *
 * Então mostramos a verdade: a preparação foi registrada no servidor e a revisão de valores
 * ainda não pode ser exibida. O que ESTÁ garantido pelo backend hoje
 * (`previa_sanitizada.cliente`, `.vendedor`, e a marca `previa_schema_provisorio: true`) é
 * exibido; valores monetários, não.
 *
 * O QUE A SESSÃO QUE FECHAR ISSO TEM DE FAZER
 *
 * 1. preencher `CAMINHOS_PROVISORIOS` em `extrairPayloadCriacaoDaPrevia` com os caminhos reais;
 * 2. trocar `backend/tests/fixtures/wmPreviaProvisoria.js` pelas fixtures sanitizadas da WM;
 * 3. só então substituir este componente pela revisão real — itens, quantidade, preço
 *    unitário, subtotal, total e **indicação de origem** do dado (`tempo_real` × `cache_cloud`;
 *    cache nunca rotulado como "atual") — e ligar o botão "Confirmar e criar no ERP", que é
 *    Sessão 6 e depende também da pendência 2.
 */

import { textoOuSemValor } from "./orcamentoFormat";

export default function OrcamentoPreview({ preparacao, onVoltar }) {
  const previa = preparacao?.previa || null;

  return (
    <div className="wa-orc-body">
      <section className="wa-orc-section" aria-label="Orçamento calculado">
        <h4 className="wa-orc-sectionTitle">Orçamento calculado</h4>

        <div className="wa-orc-alert wa-orc-alert--aviso" role="status">
          <span>
            A revisão de valores ainda não está disponível: o fornecedor do ERP não publicou o
            formato da prévia. Para não mostrar número errado, nada de preço aparece aqui.
          </span>
        </div>

        {previa ? (
          <div className="wa-orc-resumo">
            <div className="wa-orc-resumo-linha">
              <span>Cliente</span>
              <strong>{textoOuSemValor(previa?.cliente?.nome)}</strong>
            </div>
            <div className="wa-orc-resumo-linha">
              <span>Vendedor</span>
              <strong>{textoOuSemValor(previa?.vendedor?.nome)}</strong>
            </div>
            <div className="wa-orc-resumo-linha">
              <span>Itens</span>
              <strong>{Array.isArray(previa?.itens) ? previa.itens.length : "—"}</strong>
            </div>
          </div>
        ) : null}

        <p className="wa-orc-hint">
          O cálculo ficou registrado neste atendimento. A gravação no ERP será liberada quando a
          revisão de valores puder ser exibida.
        </p>
      </section>

      <footer className="wa-orc-foot">
        <button type="button" className="wa-btn wa-btn-ghost" onClick={onVoltar}>
          Voltar e editar
        </button>
      </footer>
    </div>
  );
}
