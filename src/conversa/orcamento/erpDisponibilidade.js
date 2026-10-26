/**
 * "Dá para orçar agora?" — a leitura de `GET /api/orcamentos/erp/status` e a frase de cada caso.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md`.
 * Backend: `services/wm/wmAssistenteService.verificarDisponibilidadeErp` (sonda com cache de
 * 30 s, coalescida) e `controllers/wmOrcamentosController.statusErp`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO EXISTE
 * ────────────────────────────────────────────────────────────────────────────
 * As portas da WM falham SEPARADAMENTE, e a assimetria engana. Medido em produção em
 * 25/10/2026, com o sincronizador de uma loja fora do ar:
 *
 *   produtos/consultar  (acervo dentro da WM)        -> 200 em 166 ms
 *   clientes/consultar  (realtime, fala com a loja)  -> 503 em 2478 ms
 *   orcamentos/preparar (realtime)                   -> 503
 *
 * Ou seja: a busca de produto fica PERFEITA enquanto o resto está morto. O atendente monta dez
 * itens, digita o cliente e só descobre no Calcular que nada daquilo ia funcionar — com o
 * cliente esperando do outro lado. O aviso existe para chegar antes desse trabalho perdido, e o
 * conteúdo útil dele não é "deu erro": é **o que ainda funciona e o que não**.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CADA `motivo` É UMA SITUAÇÃO DIFERENTE — E A AÇÃO É DE GENTE DIFERENTE
 * ────────────────────────────────────────────────────────────────────────────
 * Esta é a razão de haver quatro frases em vez de uma. Mandar a frase errada não é só feio:
 * manda a pessoa errada resolver.
 *
 *   · `sincronizador_offline` — o computador do ERP **da própria loja** não está alcançável. A
 *     WM respondeu (foi ela que disse 503), então o acervo de produto continua de pé. Quem
 *     resolve é a loja: máquina ligada, internet, serviço rodando. **Não** é o suporte.
 *   · `lento` — não é queda, é demora (504). A loja respondeu; o que falta é tempo. Tentar o
 *     Calcular ainda faz sentido.
 *   · `indisponivel` — **não sabemos**. Cai aqui o erro de transporte e o que não se encaixa em
 *     nenhum ramo conhecido. Então a frase não afirma causa, e não promete que a busca de
 *     produto funciona: se a própria WM estiver inalcançável, ela também não responde.
 *   · `nao_configurado` — a integração não está provisionada para esta empresa (sem vínculo
 *     ativo, ou 401/403 da WM). Nada nesta tela vai funcionar, **inclusive a busca de
 *     produto**, que usa o mesmo contato autorizado. E mandar "confira o computador da loja"
 *     aqui é mandar a pessoa consertar uma máquina que não tem defeito nenhum: quem libera é o
 *     suporte do ZapERP. Por isso este é também o único caso que NÃO oferece "verificar de
 *     novo" — resondar não muda nada até alguém configurar, e um botão que só gira é teatro.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE MÓDULO NÃO FAZ
 * ────────────────────────────────────────────────────────────────────────────
 * Não faz rede (quem chama a rota é `wmOrcamentosService`), não guarda estado e não decide
 * quando sondar. E não inventa aviso: resposta de forma inesperada devolve `null`, que a tela
 * lê como "não diga nada". Afirmar indisponibilidade por causa de uma chamada que não respondeu
 * é pior do que não avisar — seria o drawer acusando a loja de estar fora do ar por um problema
 * que pode ser do próprio navegador.
 */

/** Vocabulário fechado do backend. Qualquer outro valor é lido como `indisponivel`. */
export const MOTIVO_ERP = Object.freeze({
  SINCRONIZADOR_OFFLINE: "sincronizador_offline",
  LENTO: "lento",
  INDISPONIVEL: "indisponivel",
  NAO_CONFIGURADO: "nao_configurado",
});

const MOTIVOS_CONHECIDOS = Object.freeze(Object.values(MOTIVO_ERP));

/**
 * Códigos de erro do envelope que significam "a porta realtime do ERP não está de pé".
 *
 * Servem a UM uso: quando o Calcular falha por um destes, o veredito que está na tela ficou
 * velho e vale resondar. Não é laço de fundo — é reação a uma falha que o atendente acabou de
 * ver (ver `OrcamentoDrawer`).
 */
export const CODIGOS_ERP_FORA = Object.freeze([
  "WM_SINCRONIZADOR_OFFLINE",
  "WM_TIMEOUT",
  "WM_INDISPONIVEL",
]);

/** A falha do Calcular foi do tipo que torna o veredito da sonda obsoleto? */
export function erroSugereErpFora(codigo) {
  return CODIGOS_ERP_FORA.includes(String(codigo || ""));
}

/**
 * Lê a resposta de `GET /api/orcamentos/erp/status`.
 *
 * A rota responde **sempre 200**, inclusive quando a resposta é "não dá" — indisponibilidade é
 * o conteúdo, não um erro. Então o que esta função trata é só a forma do corpo.
 *
 * @param {object|null|undefined} data corpo da resposta
 * @returns {{ alcancavel: boolean, motivo: string|null }|null} `null` = cale-se
 */
export function lerStatusErp(data) {
  if (!data || typeof data !== "object") return null;
  if (data.ok !== true) return null;
  if (data.erp_alcancavel === true) return { alcancavel: true, motivo: null };
  if (data.erp_alcancavel !== false) return null;

  const motivo = typeof data.motivo === "string" ? data.motivo.trim() : "";
  // Motivo novo no backend não pode virar aviso em branco. "Não sabemos" é o fallback honesto.
  return {
    alcancavel: false,
    motivo: MOTIVOS_CONHECIDOS.includes(motivo) ? motivo : MOTIVO_ERP.INDISPONIVEL,
  };
}

/**
 * A frase de cada situação. Uma entrada por `motivo`, e as diferenças entre elas são de
 * conteúdo, não de redação: cada uma diz o que funciona, o que não, e de quem é a ação.
 *
 * `oferecerVerificar` existe porque um botão que não pode mudar nada é pior que nenhum botão.
 */
const AVISOS = Object.freeze({
  [MOTIVO_ERP.SINCRONIZADOR_OFFLINE]: Object.freeze({
    titulo: "O sistema da sua loja não está respondendo",
    explicacao:
      "Calcular e procurar cliente dependem dele. A busca de produto continua funcionando — " +
      "dá para montar os itens agora e calcular quando ele voltar.",
    recuperacao: "Confira se o computador do ERP da loja está ligado e com internet.",
    oferecerVerificar: true,
  }),
  [MOTIVO_ERP.LENTO]: Object.freeze({
    titulo: "O sistema da sua loja está lento",
    explicacao:
      "Ele respondeu, mas demorou. O Calcular pode falhar por tempo esgotado; a busca de " +
      "produto está normal.",
    recuperacao: "Vale tentar calcular. Se falhar, espere um pouco e verifique de novo.",
    oferecerVerificar: true,
  }),
  [MOTIVO_ERP.INDISPONIVEL]: Object.freeze({
    titulo: "Não foi possível falar com o sistema da sua loja",
    explicacao:
      "Não sabemos o motivo. O Calcular provavelmente não vai funcionar agora; se a busca de " +
      "produto responder, dá para adiantar os itens.",
    recuperacao: "Verifique de novo em instantes. Se continuar assim, avise o suporte.",
    oferecerVerificar: true,
  }),
  [MOTIVO_ERP.NAO_CONFIGURADO]: Object.freeze({
    titulo: "O orçamento não está liberado para esta empresa",
    explicacao:
      "A integração com o ERP não está configurada aqui, então nada desta tela pode ser " +
      "calculado.",
    // Nenhuma menção a máquina, computador ou internet da loja: não há defeito lá para achar.
    recuperacao: "Quem libera é o suporte do ZapERP. Não há nada para arrumar na sua loja.",
    oferecerVerificar: false,
  }),
});

/**
 * O aviso a desenhar, ou `null` quando não há o que avisar.
 *
 * `null` cobre os três silêncios, e eles são diferentes de propósito: ERP alcançável (nada a
 * dizer), sonda ainda em voo ou que falhou (`status` nulo — nada que se SAIBA dizer), e forma
 * inesperada (`lerStatusErp` já devolveu `null`).
 *
 * @param {{alcancavel: boolean, motivo: string|null}|null|undefined} status saída de
 *   `lerStatusErp`
 * @returns {{ titulo: string, explicacao: string, recuperacao: string,
 *             oferecerVerificar: boolean, motivo: string }|null}
 */
export function avisoErpIndisponivel(status) {
  if (!status || typeof status !== "object") return null;
  if (status.alcancavel !== false) return null;
  const motivo = MOTIVOS_CONHECIDOS.includes(status.motivo)
    ? status.motivo
    : MOTIVO_ERP.INDISPONIVEL;
  return { ...AVISOS[motivo], motivo };
}

export default {
  MOTIVO_ERP,
  CODIGOS_ERP_FORA,
  erroSugereErpFora,
  lerStatusErp,
  avisoErpIndisponivel,
};
