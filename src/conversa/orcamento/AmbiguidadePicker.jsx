/**
 * Resolução de ambiguidade da preparação.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (Sessão 4A; pendência 11,
 * respondida).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UMA AMBIGUIDADE POR VEZ
 * ────────────────────────────────────────────────────────────────────────────
 * `dados.status` é um valor único e `candidatos` é uma lista única: a WM reporta UMA
 * ambiguidade por vez. O fluxo é resolve uma → reprepara → pode vir a próxima. Esta tela não
 * tenta resolver duas de uma vez nem adivinhar a seguinte.
 *
 * Os três status estão TOTALMENTE especificados no contrato — é o oposto da prévia:
 *   · `multiplos_clientes`   → `codigo_cliente_erp`, `nome`, `cpf`, `cnpj`, `inscricao_estadual`
 *   · `multiplos_vendedores` → `codigo_vendedor_erp`, `nome`
 *   · `produto_ambiguo`      → `codigo_produto_erp`, `descricao`, `unidade`, `preco_unitario`,
 *                              `estoque_previsto` (+ `indice_item`, zero-based)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DUAS REGRAS QUE PARECEM DETALHE E NÃO SÃO
 * ────────────────────────────────────────────────────────────────────────────
 * 1. **Nada é escolhido automaticamente, nem quando a lista tem um só.** O contrato é
 *    explícito: "a última página com um único registro não resolve automaticamente se
 *    total > 1". Auto-selecionar faria o atendente gravar no ERP um cliente que ele não viu.
 * 2. **O preço daqui é só para DECIDIR, nunca para gravar.** `produto_ambiguo` traz preço e
 *    estoque em tempo real, e é legítimo mostrá-los (é o que distingue dois produtos
 *    parecidos). Mas o preço que vai para a criação é o do snapshot server-side, calculado na
 *    prévia — aqui ele aparece rotulado como consulta do momento, e a tela não o guarda.
 *
 * CPF/CNPJ/IE aparecem porque é o que distingue dois homônimos — e é exatamente para isso que
 * a WM os enriqueceu. Eles param na tela: não vão para o rascunho, nem para o storage.
 */

import { ChevronRight } from "lucide-react";
import {
  classeEstoque,
  formatMoedaOrcamento,
  textoEstoque,
  textoOuSemValor,
} from "./orcamentoFormat";
import { valorPresente } from "./precoItemCache";

const TITULOS = {
  multiplos_clientes: {
    titulo: "Qual é o cliente?",
    ajuda: "Encontramos mais de um cliente com esse nome. Confira o documento para escolher.",
  },
  multiplos_vendedores: {
    titulo: "Qual é o vendedor?",
    ajuda: "Encontramos mais de um vendedor com esse nome.",
  },
  produto_ambiguo: {
    titulo: "Qual é o produto?",
    ajuda: "Encontramos mais de um produto para este item do orçamento.",
  },
};

/** Documento do cliente: o primeiro que existir. Nunca os dois juntos, nunca "—" triplicado. */
function documentoCliente(c) {
  if (c?.cnpj) return `CNPJ ${c.cnpj}`;
  if (c?.cpf) return `CPF ${c.cpf}`;
  if (c?.inscricao_estadual) return `IE ${c.inscricao_estadual}`;
  return "Sem documento informado";
}

/**
 * Casca comum dos três candidatos.
 *
 * Escolher aqui é um toque no card, e o card diz isso: a ação é nomeada no `aria-label` e a
 * seta à direita mostra que a escolha segue o fluxo (ela dispara uma preparação nova). Mesma
 * casca nos três para que "o que acontece se eu tocar" seja a mesma pergunta respondida da
 * mesma forma em cliente, vendedor e produto.
 */
function CartaoCandidato({ rotulo, onEscolher, ocupado, children }) {
  return (
    <button
      type="button"
      className="wa-orc-candidato"
      disabled={ocupado}
      aria-label={rotulo}
      onClick={onEscolher}
    >
      <span className="wa-orc-candidato-corpo">{children}</span>
      <span className="wa-orc-candidato-acao" aria-hidden="true">
        <ChevronRight size={18} strokeWidth={2.25} />
      </span>
    </button>
  );
}

function CandidatoCliente({ candidato, onEscolher, ocupado }) {
  const nome = textoOuSemValor(candidato.nome);
  return (
    <CartaoCandidato
      rotulo={`Usar o cliente ${nome}`}
      ocupado={ocupado}
      onEscolher={() => onEscolher(candidato)}
    >
      <span className="wa-orc-candidato-titulo">{nome}</span>
      <span className="wa-orc-candidato-meta">
        {`${documentoCliente(candidato)} · Cód. ${candidato.codigo_cliente_erp}`}
      </span>
    </CartaoCandidato>
  );
}

function CandidatoVendedor({ candidato, onEscolher, ocupado }) {
  const nome = textoOuSemValor(candidato.nome);
  return (
    <CartaoCandidato
      rotulo={`Usar o vendedor ${nome}`}
      ocupado={ocupado}
      onEscolher={() => onEscolher(candidato)}
    >
      <span className="wa-orc-candidato-titulo">{nome}</span>
      <span className="wa-orc-candidato-meta">{`Cód. ${candidato.codigo_vendedor_erp}`}</span>
    </CartaoCandidato>
  );
}

function CandidatoProduto({ candidato, onEscolher, ocupado }) {
  const descricao = textoOuSemValor(candidato.descricao);
  const temPreco = valorPresente(candidato.preco_unitario);
  // Mesma leitura do card de busca: o texto diz o número e a cor só reforça a faixa.
  const estoqueTexto = textoEstoque(candidato.estoque_previsto);
  return (
    <CartaoCandidato
      rotulo={`Usar o produto ${descricao}`}
      ocupado={ocupado}
      onEscolher={() => onEscolher(candidato)}
    >
      <span className="wa-orc-candidato-titulo">{descricao}</span>
      <span className="wa-orc-candidato-meta">
        {[candidato.unidade, `Cód. ${candidato.codigo_produto_erp}`].filter(Boolean).join(" · ")}
      </span>
      {/* Campo ausente não vira "—" solto numa linha de três: ele simplesmente não aparece. */}
      {temPreco || estoqueTexto ? (
        <span className="wa-orc-candidato-valores">
          {temPreco ? (
            <strong className="wa-orc-candidato-preco">
              {formatMoedaOrcamento(candidato.preco_unitario)}
            </strong>
          ) : null}
          {estoqueTexto ? (
            <span className={classeEstoque(candidato.estoque_previsto)}>{estoqueTexto}</span>
          ) : null}
        </span>
      ) : null}
    </CartaoCandidato>
  );
}

/**
 * @param {object} props
 * @param {{status: string, candidatos: object[], paginacao: object|null, indice_item?: number}} props.ambiguidade
 * @param {(escolha: {status: string, candidato: object, indice_item?: number}) => void} props.onEscolher
 * @param {(pagina: number) => void} props.onTrocarPagina recebe a página ABSOLUTA pedida
 * @param {() => void} props.onCancelar volta ao formulário sem escolher
 * @param {boolean} props.ocupado uma preparação já está em voo
 */
export default function AmbiguidadePicker({
  ambiguidade,
  onEscolher,
  onTrocarPagina,
  onCancelar,
  ocupado = false,
  itemDescricao = "",
}) {
  const status = ambiguidade?.status;
  const texto = TITULOS[status];
  const candidatos = Array.isArray(ambiguidade?.candidatos) ? ambiguidade.candidatos : [];
  const paginacao = ambiguidade?.paginacao || null;

  // Status fora dos três do contrato: o backend já recusa a resposta antes de chegar aqui.
  // Se chegar, não se inventa tela — avisa e devolve ao formulário.
  if (!texto) {
    return (
      <>
        <div className="wa-orc-body">
          <section className="wa-orc-section" aria-label="Escolha necessária">
            <div className="wa-orc-alert wa-orc-alert--erro" role="alert">
              <span>Não foi possível continuar com esta escolha. Monte o orçamento de novo.</span>
            </div>
          </section>
        </div>
        <footer className="wa-orc-foot wa-orc-foot--unico">
          <button type="button" className="wa-btn wa-btn-ghost" onClick={onCancelar}>
            Voltar e editar
          </button>
        </footer>
      </>
    );
  }

  const escolher = (candidato) =>
    onEscolher?.({ status, candidato, indice_item: ambiguidade?.indice_item });

  return (
    <>
      {/*
        O corpo rola e o rodapé fica fora dele: uma ambiguidade pode trazer 30 candidatos, e
        sem região rolável própria a lista passaria da altura do drawer sem jeito de alcançar
        nem os últimos candidatos nem o "Voltar e editar".
      */}
      <div className="wa-orc-body">
        <section className="wa-orc-section" aria-label={texto.titulo}>
          <h4 className="wa-orc-sectionTitle">{texto.titulo}</h4>
          <p className="wa-orc-hint">
            {texto.ajuda}
            {status === "produto_ambiguo" && itemDescricao ? ` Item: ${itemDescricao}.` : ""}
          </p>
          {status === "produto_ambiguo" ? (
            <p className="wa-orc-origem">
              Preço e estoque consultados no ERP agora, para você comparar. O valor do orçamento
              é o que aparecer depois de calcular.
            </p>
          ) : null}

          <div className="wa-orc-resultados">
            {candidatos.length === 0 ? (
              <p className="wa-orc-hint">Nenhuma opção foi devolvida para esta escolha.</p>
            ) : null}
            {candidatos.map((c) => {
              if (status === "multiplos_clientes") {
                return (
                  <CandidatoCliente
                    key={c.codigo_cliente_erp}
                    candidato={c}
                    onEscolher={escolher}
                    ocupado={ocupado}
                  />
                );
              }
              if (status === "multiplos_vendedores") {
                return (
                  <CandidatoVendedor
                    key={c.codigo_vendedor_erp}
                    candidato={c}
                    onEscolher={escolher}
                    ocupado={ocupado}
                  />
                );
              }
              return (
                <CandidatoProduto
                  key={c.codigo_produto_erp}
                  candidato={c}
                  onEscolher={escolher}
                  ocupado={ocupado}
                />
              );
            })}
          </div>

          {/* Sem número de página e sem clamp: só o que `tem_mais`/`tem_anterior` autorizam. */}
          {paginacao && (paginacao.tem_anterior || paginacao.tem_mais) ? (
            <div className="wa-orc-paginacao">
              <button
                type="button"
                className="wa-btn wa-btn-ghost wa-orc-btnSm"
                disabled={!paginacao.tem_anterior || ocupado}
                onClick={() => onTrocarPagina?.(Math.max(1, (paginacao.pagina || 1) - 1))}
              >
                Voltar
              </button>
              <button
                type="button"
                className="wa-btn wa-btn-ghost wa-orc-btnSm"
                disabled={!paginacao.tem_mais || ocupado}
                onClick={() => onTrocarPagina?.((paginacao.pagina || 1) + 1)}
              >
                Mostrar mais resultados
              </button>
            </div>
          ) : null}
        </section>
      </div>

      <footer className="wa-orc-foot wa-orc-foot--unico">
        <button
          type="button"
          className="wa-btn wa-btn-ghost"
          onClick={onCancelar}
          disabled={ocupado}
        >
          Voltar e editar
        </button>
      </footer>
    </>
  );
}

