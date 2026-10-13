/**
 * Compartilha requisições idênticas que estão em voo.
 *
 * Padrão de guard que falha sozinho: `if (jáTenho) return` avaliado ANTES de um `await`.
 * Dois eventos separados por milissegundos passam os dois pelo guard (o estado só muda
 * depois que a primeira resposta chega) e disparam a mesma busca duas vezes. Medido em
 * produção em 13/10/2026: o mesmo `GET /chats/:id` saindo com 5 ms de diferença.
 *
 * Só serve para operações IDEMPOTENTES (leitura). Nunca use para envio/escrita, onde
 * "juntar duas chamadas em uma" muda o significado da ação.
 */
export function createInFlightDeduper() {
  const emVoo = new Map();

  /**
   * @param {string|number} chave identidade do recurso (ex.: id da conversa)
   * @param {() => Promise<any>} executar roda só quando não há chamada em voo
   */
  function dedupe(chave, executar) {
    const k = String(chave);
    const atual = emVoo.get(k);
    if (atual) return atual;

    let promessa;
    try {
      promessa = Promise.resolve(executar());
    } catch (err) {
      // `executar` lançou de forma síncrona: não há nada em voo para compartilhar.
      return Promise.reject(err);
    }

    emVoo.set(k, promessa);
    // `finally` sem encadear o valor: quem chamou recebe o resultado (ou o erro) original.
    promessa.then(
      () => emVoo.delete(k),
      () => emVoo.delete(k)
    );
    return promessa;
  }

  dedupe.emVoo = () => emVoo.size;
  return dedupe;
}
