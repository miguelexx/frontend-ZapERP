/**
 * PLACEHOLDER DELIBERADO — a tela de resultado aguarda o schema de sucesso da criação.
 *
 * Ver `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md`, seção 10, **pendência 2**
 * ("Schema de sucesso de `/orcamentos/criar`", ABERTA):
 *
 *   O `200` traz só `description: Orçamento criado ou resultado idempotente já concluído`,
 *   **sem schema**. Não há como saber o número do orçamento, nem distinguir "criei agora" de
 *   "já estava criado".
 *
 * POR QUE NÃO INVENTAR O NÚMERO DO ORÇAMENTO
 *
 * O número é a única coisa que o cliente final leva do atendimento ("Orçamento: 12345") e é o
 * que o vendedor usa para achar o pedido no Icthus. Chutar o nome do campo e exibir `undefined`
 * — ou, pior, um id interno nosso parecendo número de orçamento — faria o atendente passar ao
 * cliente um número que não existe no ERP. Até a WM publicar o schema, a tela mostra estado,
 * não número.
 *
 * ESTADO DO BACKEND HOJE: `confirmar` NÃO DESPACHA
 *
 * A rota faz a transição atômica `PREPARADO → ENVIANDO`, persiste o `comando_id` e para —
 * responde `despachado: false`. Nada foi gravado no Icthus. Este componente existe para dizer
 * isso sem mentir e sem vocabulário técnico.
 *
 * ⚠️ Nunca exibir ao usuário: `comando_id`, `RESULTADO_INCERTO`, `operacao_id`, `requestId`,
 * status HTTP. O `estado` entra aqui só como chave de tradução para frase humana.
 *
 * A Sessão 6 substitui este componente pelo resultado real (número do orçamento, resumo por
 * template fixo com os dados oficiais da WM e o botão separado "Enviar ao cliente", que usa o
 * envio normal da conversa com o texto revisável antes de sair).
 */

/**
 * Frases por estado da operação. A chave é técnica; o texto, não.
 * `INCERTO` é o caso mais delicado: a instrução ao atendente é NÃO criar outro — criar de novo
 * é o único jeito de duplicar orçamento no ERP.
 */
const TEXTO_POR_ESTADO = {
  PREPARADO: {
    titulo: "Orçamento calculado",
    detalhe: "O cálculo está registrado neste atendimento.",
  },
  ENVIANDO: {
    titulo: "Orçamento confirmado neste atendimento",
    detalhe:
      "A gravação no sistema da empresa ainda não está liberada nesta versão. Nada foi criado no ERP.",
  },
  CRIADO: {
    titulo: "Orçamento criado no sistema da empresa",
    detalhe: "Os dados oficiais aparecerão aqui quando o fornecedor do ERP publicar o formato.",
  },
  INCERTO: {
    titulo: "Não deu para confirmar o resultado",
    detalhe:
      "O sistema da empresa não respondeu a tempo. Não crie outro orçamento: procure o suporte para conferir se este foi gravado.",
  },
  FALHA_SEGURA: {
    titulo: "O orçamento não foi criado",
    detalhe: "Nada foi gravado. Você pode calcular de novo quando quiser.",
  },
  EXPIRADO: {
    titulo: "O tempo para confirmar acabou",
    detalhe: "Calcule de novo para ver os valores atuais.",
  },
};

const PADRAO = {
  titulo: "Orçamento registrado",
  detalhe: "Acompanhe com o suporte se precisar do resultado no ERP.",
};

export default function OrcamentoResultado({ operacao, onNovoOrcamento, onFechar }) {
  const texto = TEXTO_POR_ESTADO[String(operacao?.estado || "")] || PADRAO;

  return (
    <div className="wa-orc-body">
      <section className="wa-orc-section" aria-label="Resultado do orçamento">
        <h4 className="wa-orc-sectionTitle">{texto.titulo}</h4>
        <p className="wa-orc-hint">{texto.detalhe}</p>

        <div className="wa-orc-alert wa-orc-alert--aviso" role="status">
          <span>
            O número do orçamento e o resumo para enviar ao cliente ainda não podem ser exibidos:
            o fornecedor do ERP não publicou o formato da resposta de criação.
          </span>
        </div>
      </section>

      <footer className="wa-orc-foot">
        <button type="button" className="wa-btn wa-btn-ghost" onClick={onNovoOrcamento}>
          Novo orçamento
        </button>
        <button type="button" className="wa-btn wa-btn-primary wa-orc-btnPrincipal" onClick={onFechar}>
          Fechar
        </button>
      </footer>
    </div>
  );
}
