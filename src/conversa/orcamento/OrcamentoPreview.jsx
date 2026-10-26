/**
 * Prévia do orçamento — a tela de revisão antes de gravar no ERP.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (seção 6.5).
 * Contrato: `backend/docs/wm/Integracao-ZapERP-API-WM-Atualizacao-2026-10-20` §8 e §8.1.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AS QUATRO PERGUNTAS (seção 6.5)
 * ────────────────────────────────────────────────────────────────────────────
 * A ordem das seções aqui não é estética; é a ordem em que o atendente precisa responder:
 *   1. **Para quem é?** cliente e vendedor canônicos, por NOME. O código ERP existe, mas vive
 *      na área de detalhes — ninguém confere um orçamento por `codigo_cliente_erp`.
 *   2. **Quais produtos e quantidades?** uma linha por item, com quantidade, preço unitário e
 *      valor do item.
 *   3. **Qual o total?** `valor_produtos` e `valor_total`, lado a lado.
 *   4. **O que acontece ao confirmar?** uma frase que diz que o orçamento será CRIADO no
 *      sistema da empresa, e o que a política de bloqueio faz com ele depois.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTE COMPONENTE NÃO FAZ CONTA
 * ────────────────────────────────────────────────────────────────────────────
 * Não há aritmética nenhuma neste arquivo. Todo número vem formatado de
 * `montarPreviaView` (`orcamentoViewModel.js`), que também não faz conta: os valores são as
 * STRINGS decimais da WM. §8.1 proíbe derivar preço de `valor_total / quantidade`, e somar os
 * itens no cliente seria pior ainda — um total que a tela calculou, mas que o ERP não vai
 * gravar. Campo ausente aparece como "—", nunca "R$ 0,00".
 *
 * Preço com três casas (`"33.038"`) é exibido como moeda em duas (`R$ 33,04`) e o valor exato
 * aparece ao lado nos detalhes do item, para nada ficar escondido atrás do arredondamento de
 * exibição.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A PRÉVIA É DE UM CONJUNTO DE DADOS, NÃO DA TELA
 * ────────────────────────────────────────────────────────────────────────────
 * `previaDesatualizada` chega `true` quando cliente, vendedor, produto ou quantidade mudou
 * depois do cálculo (comparação de assinatura, feita no drawer). Nesse caso o botão de
 * confirmar fica desabilitado e a tela pede um novo cálculo, em vez de gravar no ERP um preço
 * que já não corresponde ao que está na tela.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O BOTÃO PRINCIPAL
 * ────────────────────────────────────────────────────────────────────────────
 * "Confirmar e criar no ERP" não muda de posição nem de largura ao entrar em envio
 * (`.wa-orc-btnPrincipal` tem `min-width`) e fica desabilitado enquanto envia — é o que impede
 * o duplo clique, que aqui significaria duas chamadas de criação.
 *
 * ⚠️ **Sessão 6**: o despacho da criação ainda não existe. Enquanto `onConfirmar` não vier, o
 * botão aparece desabilitado com uma frase honesta, em vez de sumir sem explicação. A Sessão 6
 * só precisa passar `onConfirmar` e `confirmando` daqui para baixo — o resto desta tela não
 * muda.
 */

import { useMemo } from "react";
import { montarPreviaView } from "./orcamentoViewModel";
import {
  SEM_VALOR,
  TEXTO_PRECO_NAO_CADASTRADO,
  TITULO_PRECO_NAO_CADASTRADO,
} from "./orcamentoFormat";

function ItemPrevia({ item }) {
  return (
    <li className="wa-orc-previaItem">
      <div className="wa-orc-item-info">
        <span className="wa-orc-item-titulo">{item.descricao}</span>
        {/* A unidade já vem colada na quantidade (`formatQuantidadeExibicao`): "2 UN". */}
        <span className="wa-orc-item-meta">
          {item.quantidade} ×{" "}
          {item.precoNaoCadastrado ? (
            /*
              Produto sem preço no cadastro do ERP. A vaga do preço diz o estado em vez do
              valor: "R$ 0,01" aqui é lido como preço e aprovado sem pestanejar — e esta é a
              tela da APROVAÇÃO. O número exato continua nos detalhes, abaixo.
            */
            <span className="wa-orc-semPreco" title={TITULO_PRECO_NAO_CADASTRADO}>
              {TEXTO_PRECO_NAO_CADASTRADO}
            </span>
          ) : (
            item.precoUnitario
          )}
        </span>
      </div>
      {/*
        O total DA LINHA continua à vista mesmo quando o preço não é preço: ele é o número que a
        WM calculou e que o ERP vai gravar, e escondê-lo tiraria da tela a consequência do
        cadastro faltando (um "R$ 0,02" num item de areia é justamente o que faz a atendente
        parar). O que muda é o peso: sem o preto forte, ele deixa de parecer um valor conferido
        e passa a pertencer, visualmente, à linha que está marcada logo acima.
      */}
      <strong
        className={
          item.precoNaoCadastrado
            ? "wa-orc-previaItem-valor wa-orc-previaItem-valor--semPreco"
            : "wa-orc-previaItem-valor"
        }
      >
        {item.valorTotal}
      </strong>
      {/*
        DESCONTO DO ERP, quando existe. Hoje não existe: medido ao vivo na MARGRE em 26/10/2026,
        `valor_desconto_unit` vem `"0.00"` em toda linha e `valor_total_bruto` é igual ao
        `valor_total` — e nesse caso esta linha simplesmente não é desenhada, nem como
        "Desconto R$ 0,00".

        Quando o ERP aplicar um (tabela promocional, política por cliente), o atendente precisa
        ver de onde veio o preço: sem isto, um desconto real apareceria só como um total menor
        que o do cadastro, e ele não teria como explicar o número ao cliente que perguntasse. O
        valor cheio vem riscado porque é o que o desconto substituiu — e os dois são números da
        WM, nada é subtraído aqui (`descontoDoItemPrevia`).
      */}
      {item.desconto ? (
        <span className="wa-orc-item-desconto">
          {item.desconto.valorBruto ? (
            <s className="wa-orc-item-descontoDe">{item.desconto.valorBruto}</s>
          ) : null}
          Desconto do sistema: {item.desconto.descontoUnit} por {item.unidade || "unidade"}
        </span>
      ) : null}
      <div className="wa-orc-previaItem-detalhes">
        <span className="wa-orc-item-codigo">Cód. ERP {item.codigo}</span>
        {item.precoExato ? (
          <span className="wa-orc-item-codigo">Preço exato do sistema: {item.precoExato}</span>
        ) : null}
        {item.estoque !== SEM_VALOR ? (
          <span className="wa-orc-item-codigo">Estoque previsto: {item.estoque}</span>
        ) : null}
      </div>
    </li>
  );
}

export default function OrcamentoPreview({
  preparacao,
  onVoltar,
  onConfirmar,
  confirmando = false,
  previaDesatualizada = false,
  erro = "",
}) {
  const view = useMemo(() => montarPreviaView(preparacao?.previa), [preparacao]);

  // Sem prévia utilizável não se inventa tela: o backend recusa prévia fora do formato antes de
  // chegar aqui (`previa_preco_invalido` → `WM_RESPOSTA_INVALIDA`), então isto é rede de
  // segurança, não caminho esperado.
  if (!view) {
    return (
      <>
        <div className="wa-orc-body">
          <section className="wa-orc-section" aria-label="Orçamento calculado">
            <div className="wa-orc-alert wa-orc-alert--aviso" role="status">
              <span>
                Não foi possível montar a revisão deste orçamento. Volte e calcule de novo.
              </span>
            </div>
          </section>
        </div>
        <footer className="wa-orc-foot">
          <button type="button" className="wa-btn wa-btn-ghost" onClick={onVoltar}>
            Voltar e editar
          </button>
        </footer>
      </>
    );
  }

  const despachoIndisponivel = typeof onConfirmar !== "function";
  // `erro` aqui só chega de uma confirmação que FALHOU EM SEGURANÇA — e falha segura é estado
  // terminal da preparação no servidor. Confirmar de novo levaria um 409 e nada mais, então o
  // botão trava e a saída honesta é voltar e calcular outra vez. (O incerto nem passa por
  // aqui: ele troca a tela inteira, no drawer.)
  const podeConfirmar = !despachoIndisponivel && !confirmando && !previaDesatualizada && !erro;

  return (
    <>
      <div className="wa-orc-body">
        {/*
          Erro de uma confirmação que NÃO gravou nada (falha segura). Fica aqui, acima da
          revisão, porque o atendente precisa continuar vendo o que ia criar. O incerto nunca
          chega a este ponto: ele troca a tela inteira, no drawer.
        */}
        {erro ? (
          <div className="wa-orc-alert wa-orc-alert--erro" role="alert">
            <span>
              {erro} Nada foi criado no sistema da empresa — volte e calcule de novo para tentar.
            </span>
          </div>
        ) : null}

        {previaDesatualizada ? (
          <div className="wa-orc-alert wa-orc-alert--aviso" role="alert">
            <span>
              Os dados do orçamento mudaram depois deste cálculo. Calcule de novo para ver os
              valores certos antes de criar.
            </span>
          </div>
        ) : null}

        {/*
          Itens sem preço cadastrado no ERP, ditos no CONJUNTO. A marcação por linha vive dentro
          de uma lista que se rola; esta frase é o que não deixa o orçamento ser aprovado sem
          alguém ter visto. Vem depois de "prévia desatualizada" de propósito: aquele aviso
          invalida a tela inteira, e este fala do conteúdo dela.
        */}
        {view.avisoSemPreco ? (
          <div className="wa-orc-alert wa-orc-alert--aviso" role="alert">
            <span>{view.avisoSemPreco.texto}</span>
          </div>
        ) : null}

        {/* 1. Para quem é */}
        <section className="wa-orc-section" aria-label="Cliente e vendedor do orçamento">
          <h4 className="wa-orc-sectionTitle">Orçamento para</h4>
          <div className="wa-orc-resumo">
            <div className="wa-orc-resumo-linha">
              <span>Cliente</span>
              <strong>{view.cliente.nome}</strong>
            </div>
            <div className="wa-orc-resumo-linha">
              <span>Vendedor</span>
              <strong>{view.vendedor.nome}</strong>
            </div>
          </div>
        </section>

        {/* 2. Quais produtos e quantidades */}
        <section className="wa-orc-section" aria-label="Itens do orçamento">
          <h4 className="wa-orc-sectionTitle">Itens ({view.quantidadeItens})</h4>
          <ul className="wa-orc-itens">
            {view.itens.map((item) => (
              <ItemPrevia key={item.chave} item={item} />
            ))}
          </ul>
        </section>

        {/* 3. Qual o total — números da WM, nenhum somado aqui */}
        <section className="wa-orc-section" aria-label="Valores do orçamento">
          <div className="wa-orc-totais">
            <div className="wa-orc-resumo-linha">
              <span>Produtos</span>
              <strong>{view.valorProdutos}</strong>
            </div>
            <div className="wa-orc-resumo-linha wa-orc-resumo-linha--forte">
              <span>Total</span>
              <strong>{view.valorTotal}</strong>
            </div>
          </div>
          {/* Procedência: omitida quando a WM não informa. Cópia nunca é chamada de "atual". */}
          {view.fonte ? <p className="wa-orc-origem">{view.fonte.texto}</p> : null}
        </section>

        {/* 4. O que acontece ao confirmar */}
        <section className="wa-orc-section" aria-label="O que acontece ao confirmar">
          <h4 className="wa-orc-sectionTitle">Ao confirmar</h4>
          {/*
            O valor só entra na frase quando existe. Com `valor_total` ausente, "no valor de —"
            seria uma frase quebrada falando de dinheiro — e é exatamente nessa hora que o
            atendente precisa perceber que o total não veio.
          */}
          <p className="wa-orc-hint">
            O orçamento é criado no sistema da empresa para {view.cliente.nome}
            {view.valorTotal === SEM_VALOR ? "" : `, no valor de ${view.valorTotal}`}. Nada é
            enviado ao cliente neste passo.
          </p>
          {view.bloqueio ? <p className="wa-orc-hint">{view.bloqueio}</p> : null}
          {despachoIndisponivel ? (
            <p className="wa-orc-hint wa-orc-hint--aviso">
              A criação no sistema da empresa será liberada na próxima atualização. Até lá este
              cálculo serve para conferência e para passar os valores ao cliente.
            </p>
          ) : null}

          <details className="wa-orc-detalhes">
            <summary>Códigos do sistema da empresa</summary>
            <div className="wa-orc-detalhes-corpo">
              <span className="wa-orc-item-codigo">Cliente — cód. ERP {view.cliente.codigo}</span>
              <span className="wa-orc-item-codigo">Vendedor — cód. ERP {view.vendedor.codigo}</span>
            </div>
          </details>
        </section>
      </div>
      <footer className="wa-orc-foot">
        <button
          type="button"
          className="wa-btn wa-btn-ghost"
          disabled={confirmando}
          onClick={onVoltar}
        >
          Voltar e editar
        </button>
        <button
          type="button"
          className="wa-btn wa-btn-primary wa-orc-btnPrincipal wa-orc-btnConfirmar"
          disabled={!podeConfirmar}
          onClick={onConfirmar}
        >
          {confirmando ? "Criando…" : "Confirmar e criar no ERP"}
        </button>
      </footer>
    </>
  );
}
