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
import { normalizarQuantidadeParaEnvio, passoQuantidade, textoOuSemValor } from "./orcamentoFormat";

const MAX_ITENS = 50;

function ItemCarrinho({ item, indice, onQuantidade, onRemover, disabled }) {
  const q = normalizarQuantidadeParaEnvio(item.quantidade);
  return (
    <li className="wa-orc-item">
      <div className="wa-orc-item-info">
        <span className="wa-orc-item-titulo">
          {textoOuSemValor(item.descricao || item.busca)}
        </span>
        <span className="wa-orc-item-meta">
          {[item.marca, item.unidade].filter(Boolean).join(" · ") || " "}
        </span>
        {item.codigo_produto_erp ? (
          <span className="wa-orc-item-codigo">Cód. ERP {item.codigo_produto_erp}</span>
        ) : null}
      </div>
      <div className="wa-orc-qtd">
        <button
          type="button"
          className="wa-orc-qtdBtn"
          aria-label={`Diminuir quantidade de ${item.descricao || "item"}`}
          disabled={disabled}
          onClick={() => onQuantidade(indice, passoQuantidade(item.quantidade, -1))}
        >
          −
        </button>
        <input
          className="wa-input wa-orc-qtdInput"
          type="text"
          inputMode="decimal"
          aria-label={`Quantidade de ${item.descricao || "item"}`}
          value={item.quantidade}
          maxLength={20}
          disabled={disabled}
          onChange={(e) => onQuantidade(indice, e.target.value)}
        />
        <button
          type="button"
          className="wa-orc-qtdBtn"
          aria-label={`Aumentar quantidade de ${item.descricao || "item"}`}
          disabled={disabled}
          onClick={() => onQuantidade(indice, passoQuantidade(item.quantidade, 1))}
        >
          +
        </button>
      </div>
      <button
        type="button"
        className="wa-btn wa-btn-ghost wa-orc-btnSm"
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
  produtoFocusRef = null,
}) {
  const disabled = calculando;
  const itens = Array.isArray(rascunho?.itens) ? rascunho.itens : [];

  const adicionarProduto = useCallback(
    (produto) => {
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
    [onPatch]
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
    <div className="wa-orc-body">
      {erro ? (
        <div className="wa-orc-alert wa-orc-alert--erro" role="alert">
          <span>{erro}</span>
        </div>
      ) : null}
      {avisoCampo ? <p className="wa-orc-hint wa-orc-hint--aviso">{avisoCampo}</p> : null}

      <section className="wa-orc-section" aria-label="Cliente e vendedor">
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

        <label className="wa-orc-label" htmlFor="wa-orc-vendedor">
          Vendedor
        </label>
        {rascunho?.vendedorCodigoErp ? (
          <div className="wa-orc-escolhido">
            <div>
              <strong>{textoOuSemValor(rascunho.vendedorNome)}</strong>
              {/*
                Vendedor vindo da MEMÓRIA não ganha a mesma cara de um confirmado pela WM: ele
                ainda vai ser revalidado em `preparar` e pode ser recusado (inativo, trocado de
                carteira). Dizer "usado da última vez" é o que há de verdadeiro aqui — e
                vendedor mexe com comissão, então a diferença importa (doc 36 §6.2).
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
                onPatch({ vendedorCodigoErp: "", vendedorNome: "", vendedorDeMemoria: false })
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
      </section>

      <ProdutoPicker
        onAdicionar={adicionarProduto}
        disabled={disabled || itens.length >= MAX_ITENS}
        autoFocusRef={produtoFocusRef}
      />

      <section className="wa-orc-section" aria-label="Itens do orçamento">
        <h4 className="wa-orc-sectionTitle">
          Itens {itens.length > 0 ? `(${itens.length})` : ""}
        </h4>
        {itens.length === 0 ? (
          <p className="wa-orc-hint">Nenhum item ainda. Pesquise um produto acima e toque nele.</p>
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
              />
            ))}
          </ul>
        )}
        {itens.length >= MAX_ITENS ? (
          <p className="wa-orc-hint">Este orçamento já tem o máximo de {MAX_ITENS} itens.</p>
        ) : null}
      </section>

      {/* Carrinho e total sempre visíveis: rodapé fixo do drawer. */}
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
    </div>
  );
}
