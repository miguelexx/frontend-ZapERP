/**
 * Política PURA do handler de `atualizar_conversa` (socket.js).
 *
 * `atualizar_conversa` é um sinal sem payload ("a conversa X mudou, vá buscar") e o handler
 * respondia SEMPRE com `GET /chats/:id` — o detalhe completo: histórico, marcação de leitura,
 * movimentações internas, citações e um sync do contato com o provedor em segundo plano.
 *
 * O backend emite esse sinal para TODA mensagem recebida, para todo usuário que pode ver a
 * conversa — e logo em seguida emite `conversa_atualizada` com o card inteiro (preview, status,
 * setor, atendente, nome, foto). Ou seja: por mensagem recebida, cada aba aberta fazia um
 * detalhe completo cuja informação já tinha chegado pelo socket. Com 10 atendentes e 1 msg/s é
 * o endpoint mais pesado da API rodando 10×/s — e, pior, cada um desses GETs marcava a conversa
 * como lida para quem nem estava olhando (zerava o badge no servidor).
 *
 * O backend passou a marcar esse sinal com `motivo: 'nova_mensagem'` (doc 40 §3.1 do backend).
 * Aqui decidimos o que fazer com o LOTE de sinais acumulados na janela de debounce:
 *
 *  - lote só de `nova_mensagem` e a conversa JÁ está na lista  → `ignorar`
 *    (o `conversa_atualizada` já atualizou o card; `nova_mensagem` já atualizou preview/thread)
 *  - lote só de `nova_mensagem` e a conversa NÃO está na lista → `adicionar_se_autorizado`
 *    (precisa do GET para a conversa aparecer — sem inventar row a partir do socket)
 *  - qualquer sinal SEM o motivo (assumir, transferir, encerrar, merge, sync…) → `refetch`
 *    (comportamento de sempre: esses emissores não garantem um `conversa_atualizada` completo)
 *
 * Backend antigo (sem o flag) continua a receber `refetch` em tudo — nada muda para ele.
 */

export const MOTIVO_NOVA_MENSAGEM = "nova_mensagem";

/** Lote vazio para a janela de debounce de uma conversa. */
export function novoLoteAtualizarConversa() {
  return { refetchExplicito: false, forcaResync: false, eventos: 0 };
}

/**
 * Acumula um sinal no lote da conversa. Devolve o MESMO objeto (mutado) para o handler
 * guardar por chave sem realocar.
 * @param {{refetchExplicito:boolean, forcaResync:boolean, eventos:number}} lote
 * @param {any} payload
 */
export function acumularAtualizarConversa(lote, payload) {
  const l = lote || novoLoteAtualizarConversa();
  l.eventos += 1;
  if (String(payload?.motivo ?? "") !== MOTIVO_NOVA_MENSAGEM) l.refetchExplicito = true;
  const lr = payload?.lista_realtime;
  if (lr && (lr.minha_fila === true || lr.campanhas === true)) l.forcaResync = true;
  return l;
}

/**
 * @param {{lote: ReturnType<typeof novoLoteAtualizarConversa>, rowNaLista: boolean}} args
 * @returns {"ignorar"|"adicionar_se_autorizado"|"refetch"}
 */
export function decidirAtualizarConversa({ lote, rowNaLista }) {
  if (!lote || lote.refetchExplicito || lote.forcaResync) return "refetch";
  return rowNaLista ? "ignorar" : "adicionar_se_autorizado";
}

/**
 * Após 403/404 no refetch: só vale pedir `GET /chats` (lista inteira + contadores) se a
 * conversa ESTAVA na lista — aí há algo a reconciliar (ela acabou de sair do escopo do
 * usuário). Quem nunca a teve não tem nada para corrigir; antes todo usuário da empresa
 * recarregava a lista a cada assumir/transferir de uma conversa que não era dele.
 * @param {{rowExistia: boolean}} args
 */
export function deveResyncListaAposAcessoNegado({ rowExistia }) {
  return rowExistia === true;
}

/**
 * Buscador do card para o refetch EXPLÍCITO (assumir/transferir/encerrar…).
 *
 * `atualizar_conversa` é um sinal de INVALIDAÇÃO: um sinal que chega depois de o GET ter saído
 * precisa de um GET novo, porque a resposta em voo pode ser anterior à mudança (assumir em t0,
 * GET sai em t0+180 ms, transferir em t0+300 ms: partilhar o GET gravaria atendente/setor
 * antigos no card de todo mundo — e não haveria segundo GET). Então:
 *  - sem GET em voo → dispara um;
 *  - com GET em voo → espera-o e dispara UM a mais, partilhado por todos os sinais que chegarem
 *    nessa janela (N sinais durante o voo = exatamente 2 GETs, não N+1).
 * @param {(id: string|number) => Promise<any>} buscar
 */
export function criarBuscadorDeCardComRefazer(buscar) {
  const emVoo = new Map();
  const seguinte = new Map();
  function buscarCard(id) {
    const key = String(id);
    const atual = emVoo.get(key);
    if (!atual) {
      // O GET sai SÍNCRONO no sinal (não numa microtask): é o que mantém a semântica de
      // "em voo" exata para o sinal seguinte.
      let inicial;
      try {
        inicial = Promise.resolve(buscar(id));
      } catch (err) {
        inicial = Promise.reject(err);
      }
      const p = inicial.finally(() => {
        if (emVoo.get(key) === p) emVoo.delete(key);
      });
      emVoo.set(key, p);
      return p;
    }
    const agendado = seguinte.get(key);
    if (agendado) return agendado;
    const p = atual
      .catch(() => {})
      .then(() => {
        seguinte.delete(key);
        return buscarCard(id);
      });
    seguinte.set(key, p);
    return p;
  }
  buscarCard.emVoo = () => emVoo.size;
  return buscarCard;
}
