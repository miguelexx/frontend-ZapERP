/**
 * Formulário do orçamento: cliente, vendedor, itens e o botão de calcular.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (Sessão 5 — layout do drawer
 * e UX; D11 — cliente e vendedor resolvem dentro de `preparar`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE CLIENTE E VENDEDOR SÃO CAMPOS DE TEXTO, E NÃO PICKERS COM BUSCA
 * ────────────────────────────────────────────────────────────────────────────
 * Por D11. `/clientes/consultar` da WM **não** filtra Inativo/Bloqueado, mas `preparar`
 * **filtra**: um cliente escolhido num picker próprio poderia ser recusado depois com
 * `CLIENTE_INVALIDO` — um beco sem saída que o atendente não tem como prever. Então o nome
 * digitado vai dentro da própria preparação, que resolve e, se houver mais de um,
 * devolve a ambiguidade com os candidatos já elegíveis. Menos chamadas e nenhum beco.
 *
 * O nome da conversa entra como SUGESTÃO EDITÁVEL no campo de cliente (vem do rascunho), e
 * nunca como seleção canônica: só a WM transforma nome em `codigo_cliente_erp`. Título que é só
 * telefone não sugere nada (`sugestaoDeBuscaCliente`) — a busca da WM é por nome e um número
 * ali só produziria "nenhum cliente encontrado".
 *
 * O vendedor nasce pré-preenchido com o último que a WM confirmou para este usuário (ou com o
 * `user.nome` como texto de busca, quando não há memória). Lembrança **não é** confirmação: a
 * linha do código abaixo diz "usado da última vez" em vez de exibi-la como canônica, porque a
 * WM ainda vai revalidar e vendedor tem efeito de comissão (doc 36 §6.2).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TOTAL
 * ────────────────────────────────────────────────────────────────────────────
 * O carrinho mostra sempre a quantidade de itens, mas **não calcula total**: preço é da WM.
 * Até calcular, o rodapé diz isso com franqueza em vez de exibir "R$ 0,00" — um zero ali seria
 * lido como "orçamento de graça" (é a mesma razão do formatador próprio devolver "—").
 */

import { useCallback } from "react";
import ProdutoPicker from "./ProdutoPicker";
import {
  estoqueSemSaldo,
  formatMoedaOrcamento,
  formatQuantidadeOrcamento,
  normalizarQuantidadeParaEnvio,
  passoQuantidade,
  textoOuSemValor,
} from "./orcamentoFormat";
import { ESTADO_PRECO, procedenciaDosValores, valorPresente } from "./precoItemCache";
import { rotuloFonte } from "./orcamentoViewModel";

const MAX_ITENS = 50;

/**
 * Uma linha do carrinho.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A UNIDADE ANDA COM A QUANTIDADE
 * ────────────────────────────────────────────────────────────────────────────
 * O ERP usa UN, PC, M2, CX. Um "1" sozinho num item vendido em M2 não é "uma peça" — é um
 * metro quadrado, e a diferença é o orçamento inteiro. Por isso a unidade fica colada no
 * número, dentro do próprio controle, e entra também no nome acessível do campo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O PREÇO DESTA LINHA
 * ────────────────────────────────────────────────────────────────────────────
 * Vem de `precoItemCache`: consultado por código no instante em que a atendente escolheu o
 * item, ou copiado do próprio candidato quando ele já trazia preço. Enquanto a consulta corre,
 * a linha diz isso; se ela falhar, a linha fica sem preço e **nada é bloqueado** — o "Calcular"
 * resolve preço no servidor para o orçamento inteiro. Nenhum valor é somado, derivado ou
 * herdado de outra linha.
 */
function ItemCarrinho({ item, indice, onQuantidade, onRemover, disabled, preco }) {
  const q = normalizarQuantidadeParaEnvio(item.quantidade);
  const descricao = textoOuSemValor(item.descricao || item.busca);
  const valores = preco?.estado === ESTADO_PRECO.OK ? preco.valores : null;
  // A unidade do rascunho é a que sobrevive ao F5; a da consulta só preenche o que faltava.
  const unidade = item.unidade || valores?.unidade || "";
  const temPreco = valorPresente(valores?.preco_unitario);
  const temEstoque = valorPresente(valores?.estoque_previsto);
  const secundaria = [item.marca, item.codigo_produto_erp ? `Cód. ${item.codigo_produto_erp}` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="wa-orc-item">
      <div className="wa-orc-item-info">
        <span className="wa-orc-item-titulo">{descricao}</span>
        {secundaria ? <span className="wa-orc-item-meta">{secundaria}</span> : null}
        {/*
          Altura reservada no CSS: a linha nasce junto com a consulta (`CARREGANDO`), então
          passar para o valor não empurra as linhas de baixo. Item sem consulta nenhuma — o que
          voltou do rascunho depois de um F5 — não reserva espaço que nunca será preenchido.
        */}
        {preco ? (
          <span className="wa-orc-item-valores">
            {preco?.estado === ESTADO_PRECO.CARREGANDO ? (
              <span className="wa-orc-item-carregando">Consultando preço…</span>
            ) : temPreco || temEstoque ? (
              <>
                {temPreco ? (
                  <strong className="wa-orc-item-preco">
                    {formatMoedaOrcamento(valores.preco_unitario)}
                  </strong>
                ) : null}
                {temEstoque ? (
                  <span
                    className={
                      estoqueSemSaldo(valores.estoque_previsto)
                        ? "wa-orc-candidato-estoque wa-orc-candidato-estoque--zerado"
                        : "wa-orc-candidato-estoque"
                    }
                  >
                    Estoque {formatQuantidadeOrcamento(valores.estoque_previsto)}
                  </span>
                ) : null}
                {valores?.ativo === false ? (
                  <span className="wa-orc-candidato-inativo">Inativo</span>
                ) : null}
              </>
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="wa-orc-qtd">
        <button
          type="button"
          className="wa-orc-qtdBtn"
          aria-label={`Diminuir quantidade de ${descricao}`}
          disabled={disabled}
          onClick={() => onQuantidade(indice, passoQuantidade(item.quantidade, -1))}
        >
          −
        </button>
        <input
          className="wa-input wa-orc-qtdInput"
          type="text"
          inputMode="decimal"
          aria-label={
            unidade ? `Quantidade de ${descricao} em ${unidade}` : `Quantidade de ${descricao}`
          }
          value={item.quantidade}
          maxLength={20}
          disabled={disabled}
          onChange={(e) => onQuantidade(indice, e.target.value)}
        />
        {/* Unidade colada no número, dentro do controle: é o que impede ler "1" como "1 peça". */}
        {unidade ? <span className="wa-orc-qtdUnidade">{unidade}</span> : null}
        <button
          type="button"
          className="wa-orc-qtdBtn"
          aria-label={`Aumentar quantidade de ${descricao}`}
          disabled={disabled}
          onClick={() => onQuantidade(indice, passoQuantidade(item.quantidade, 1))}
        >
          +
        </button>
      </div>
      <button
        type="button"
        className="wa-btn wa-btn-ghost wa-orc-btnSm wa-orc-item-remover"
        aria-label={`Remover ${descricao} do orçamento`}
        disabled={disabled}
        onClick={() => onRemover(indice)}
      >
        Remover
      </button>
      {!q.ok ? <p className="wa-orc-item-erro">{q.motivo}</p> : null}
    </li>
  );
}

export default function OrcamentoForm({
  rascunho,
  onPatch,
  onCalcular,
  calculando = false,
  erro = "",
  avisoCampo = "",
  dicaCliente = "",
  produtoFocusRef = null,
  precos = null,
  onProdutoEscolhido = null,
}) {
  const disabled = calculando;
  const itens = Array.isArray(rascunho?.itens) ? rascunho.itens : [];
  // Uma frase só de procedência para o carrinho inteiro, e ela vale pela linha mais fraca:
  // basta um valor de cópia para o conjunto não poder ser chamado de "consultado agora".
  const procedencia = rotuloFonte(procedenciaDosValores(precos));

  const adicionarProduto = useCallback(
    (produto, meta) => {
      // Quem busca o preço é o drawer: o cache dele sobrevive às idas e voltas de etapa (uma
      // ambiguidade desmonta este formulário, e perder o preço junto seria consultar de novo).
      onProdutoEscolhido?.(produto, meta);
      onPatch((atual) => {
        const lista = Array.isArray(atual.itens) ? atual.itens : [];
        if (lista.length >= MAX_ITENS) return {};
        const existente = lista.findIndex(
          (i) => i.codigo_produto_erp && i.codigo_produto_erp === produto.codigo_produto_erp
        );
        if (existente >= 0) {
          // Mesmo produto duas vezes vira quantidade, não linha duplicada.
          const copia = lista.slice();
          copia[existente] = {
            ...copia[existente],
            quantidade: passoQuantidade(copia[existente].quantidade, 1),
          };
          return { itens: copia };
        }
        return {
          itens: [
            ...lista,
            {
              codigo_produto_erp: produto.codigo_produto_erp,
              busca: "",
              descricao: produto.descricao || "",
              unidade: produto.unidade || "",
              marca: produto.marca || "",
              quantidade: "1",
            },
          ],
        };
      });
    },
    [onPatch, onProdutoEscolhido]
  );

  const alterarQuantidade = useCallback(
    (indice, valor) => {
      onPatch((atual) => {
        const lista = Array.isArray(atual.itens) ? atual.itens.slice() : [];
        if (!lista[indice]) return {};
        // Guarda o texto cru enquanto digita (deixar o usuário apagar e escrever de novo);
        // a normalização com `trim()` acontece no envio.
        lista[indice] = { ...lista[indice], quantidade: String(valor ?? "") };
        return { itens: lista };
      });
    },
    [onPatch]
  );

  const removerItem = useCallback(
    (indice) => {
      onPatch((atual) => {
        const lista = Array.isArray(atual.itens) ? atual.itens.slice() : [];
        lista.splice(indice, 1);
        return { itens: lista };
      });
    },
    [onPatch]
  );

  const quantidadesOk = itens.every((i) => normalizarQuantidadeParaEnvio(i.quantidade).ok);
  const clienteOk = Boolean(rascunho?.clienteCodigoErp || rascunho?.clienteBusca?.trim());
  const vendedorOk = Boolean(rascunho?.vendedorCodigoErp || rascunho?.vendedorBusca?.trim());
  const podeCalcular = clienteOk && vendedorOk && itens.length > 0 && quantidadesOk && !disabled;

  return (
    <>
      <div className="wa-orc-body">
        {erro ? (
          <div className="wa-orc-alert wa-orc-alert--erro" role="alert">
            <span>{erro}</span>
          </div>
        ) : null}
        {avisoCampo ? <p className="wa-orc-hint wa-orc-hint--aviso">{avisoCampo}</p> : null}
        {dicaCliente ? <p className="wa-orc-hint wa-orc-hint--aviso">{dicaCliente}</p> : null}

        <section className="wa-orc-section" aria-label="Cliente e vendedor">
          <h4 className="wa-orc-sectionTitle">Cliente e vendedor</h4>
          <div className="wa-orc-campo">
            <label className="wa-orc-label" htmlFor="wa-orc-cliente">
              Cliente
            </label>
            {rascunho?.clienteCodigoErp ? (
              <div className="wa-orc-escolhido">
                <div>
                  <strong>{textoOuSemValor(rascunho.clienteNome)}</strong>
                  <span className="wa-orc-item-codigo">Cód. ERP {rascunho.clienteCodigoErp}</span>
                </div>
                <button
                  type="button"
                  className="wa-btn wa-btn-ghost wa-orc-btnSm"
                  disabled={disabled}
                  onClick={() => onPatch({ clienteCodigoErp: "", clienteNome: "" })}
                >
                  Trocar
                </button>
              </div>
            ) : (
              <input
                id="wa-orc-cliente"
                className="wa-input wa-orc-input"
                type="text"
                autoComplete="off"
                placeholder="Nome do cliente no ERP"
                value={rascunho?.clienteBusca || ""}
                maxLength={100}
                disabled={disabled}
                onChange={(e) => onPatch({ clienteBusca: e.target.value })}
              />
            )}
            {/*
              Produto casa por TRECHO; cliente casa por PREFIXO — regras diferentes no mesmo
              formulário, e a de cliente é a que surpreende. Medido no ERP real: "DINIZ"
              (sobrenome) não acha nada. Dizer isso aqui evita o atendente concluir que o
              cliente não existe.
            */}
            {!rascunho?.clienteCodigoErp ? (
              <p className="wa-orc-hint">Pelo começo do nome, ou pelo CPF/CNPJ.</p>
            ) : null}
          </div>

          <div className="wa-orc-campo">
            <label className="wa-orc-label" htmlFor="wa-orc-vendedor">
              Vendedor
            </label>
            {rascunho?.vendedorCodigoErp ? (
              <div className="wa-orc-escolhido">
                <div>
                  <strong>{textoOuSemValor(rascunho.vendedorNome)}</strong>
                  {/*
                    Vendedor vindo da MEMÓRIA não ganha a mesma cara de um confirmado pela WM:
                    ele ainda vai ser revalidado em `preparar` e pode ser recusado (inativo,
                    trocado de carteira). Dizer "usado da última vez" é o que há de verdadeiro
                    aqui — e vendedor mexe com comissão, então a diferença importa (§6.2).
                  */}
                  <span className="wa-orc-item-codigo">
                    {rascunho?.vendedorDeMemoria
                      ? `Usado da última vez · cód. ERP ${rascunho.vendedorCodigoErp}`
                      : `Cód. ERP ${rascunho.vendedorCodigoErp}`}
                  </span>
                </div>
                <button
                  type="button"
                  className="wa-btn wa-btn-ghost wa-orc-btnSm"
                  disabled={disabled}
                  onClick={() =>
                    onPatch({
                      vendedorCodigoErp: "",
                      vendedorNome: "",
                      vendedorDeMemoria: false,
                    })
                  }
                >
                  Trocar
                </button>
              </div>
            ) : (
              <input
                id="wa-orc-vendedor"
                className="wa-input wa-orc-input"
                type="text"
                autoComplete="off"
                placeholder="Nome do vendedor no ERP"
                value={rascunho?.vendedorBusca || ""}
                maxLength={100}
                disabled={disabled}
                onChange={(e) => onPatch({ vendedorBusca: e.target.value })}
              />
            )}
          </div>
        </section>

        <ProdutoPicker
          onAdicionar={adicionarProduto}
          disabled={disabled || itens.length >= MAX_ITENS}
          autoFocusRef={produtoFocusRef}
        />

        <section className="wa-orc-section wa-orc-section--divisa" aria-label="Itens do orçamento">
          <h4 className="wa-orc-sectionTitle">
            Itens {itens.length > 0 ? `(${itens.length})` : ""}
          </h4>
          {itens.length === 0 ? (
            <p className="wa-orc-hint">
              Nenhum item ainda. Pesquise um produto acima e toque nele.
            </p>
          ) : (
            <ul className="wa-orc-itens">
              {itens.map((item, i) => (
                <ItemCarrinho
                  key={`${item.codigo_produto_erp || item.busca}-${i}`}
                  item={item}
                  indice={i}
                  onQuantidade={alterarQuantidade}
                  onRemover={removerItem}
                  disabled={disabled}
                  preco={item.codigo_produto_erp ? precos?.[item.codigo_produto_erp] : null}
                />
              ))}
            </ul>
          )}
          {procedencia ? <p className="wa-orc-origem">{procedencia.texto}</p> : null}
          {itens.length >= MAX_ITENS ? (
            <p className="wa-orc-hint">Este orçamento já tem o máximo de {MAX_ITENS} itens.</p>
          ) : null}
        </section>
      </div>

      {/*
        Rodapé IRMÃO do corpo rolável, não filho: com dez itens no carrinho de um celular, um
        rodapé dentro do scroll some para baixo e o "Calcular" fica fora de alcance.
      */}
      <footer className="wa-orc-foot">
        <div className="wa-orc-totalBox">
          <span className="wa-orc-totalLabel">Total</span>
          <strong className="wa-orc-totalValor">
            {itens.length === 0 ? "—" : "calculado pelo ERP"}
          </strong>
        </div>
        <button
          type="button"
          className="wa-btn wa-btn-primary wa-orc-btnPrincipal"
          disabled={!podeCalcular}
          onClick={onCalcular}
        >
          {calculando ? "Calculando…" : "Calcular"}
        </button>
      </footer>
    </>
  );
}
