/**
 * Regressão: requisições idênticas em voo têm de virar UMA.
 *
 * Medido em produção (13/10/2026): dois `GET /chats/:id` iguais saindo com 5 ms de
 * diferença, porque o guard "já está no store" roda ANTES do await e dois eventos de socket
 * da mesma conversa passavam os dois. Acontecia em toda conversa fora das 80 carregadas.
 *
 * Roda: node scripts/test-dedupe-in-flight.mjs
 */
import assert from "node:assert/strict";
import { createInFlightDeduper } from "../src/runtime/dedupeInFlight.js";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) O caso real: N chamadas concorrentes da mesma chave => 1 execução, todas com o resultado.
{
  const dedupe = createInFlightDeduper();
  let execucoes = 0;
  const buscar = async () => {
    execucoes++;
    await espera(20);
    return "detalhe-da-conversa";
  };
  const resultados = await Promise.all([
    dedupe(6910, buscar),
    dedupe(6910, buscar),
    dedupe("6910", buscar),
    dedupe(6910, buscar),
  ]);
  assert.equal(execucoes, 1, "4 chamadas concorrentes deveriam executar uma vez só");
  assert.deepEqual(resultados, Array(4).fill("detalhe-da-conversa"));
}

// 2) Chaves diferentes não se misturam.
{
  const dedupe = createInFlightDeduper();
  const vistos = [];
  const buscar = (id) => async () => {
    vistos.push(id);
    await espera(10);
    return id;
  };
  const r = await Promise.all([dedupe(1, buscar(1)), dedupe(2, buscar(2)), dedupe(1, buscar(1))]);
  assert.deepEqual(vistos.sort(), [1, 2]);
  assert.deepEqual(r, [1, 2, 1]);
}

// 3) Terminada a primeira, uma nova chamada executa de novo (não vira cache).
{
  const dedupe = createInFlightDeduper();
  let execucoes = 0;
  const buscar = async () => { execucoes++; return execucoes; };
  assert.equal(await dedupe(7, buscar), 1);
  assert.equal(await dedupe(7, buscar), 2, "não pode cachear: é dedupe de chamada em voo");
  assert.equal(dedupe.emVoo(), 0, "mapa deve ficar limpo");
}

// 4) Falha é compartilhada por todos e NÃO deixa entrada presa (senão a conversa nunca mais
//    seria buscada depois de um erro de rede).
{
  const dedupe = createInFlightDeduper();
  let execucoes = 0;
  const falhar = async () => { execucoes++; await espera(5); throw new Error("rede caiu"); };
  const r = await Promise.allSettled([dedupe(9, falhar), dedupe(9, falhar)]);
  assert.equal(execucoes, 1);
  assert.deepEqual(r.map((x) => x.status), ["rejected", "rejected"]);
  assert.equal(r[0].reason.message, "rede caiu");
  assert.equal(dedupe.emVoo(), 0, "erro não pode deixar a chave presa em voo");
  let depois = 0;
  await dedupe(9, async () => { depois++; return "ok"; });
  assert.equal(depois, 1, "após falhar, a mesma chave tem de poder tentar de novo");
}

// 5) Erro SÍNCRONO no executor não envenena o mapa.
{
  const dedupe = createInFlightDeduper();
  await assert.rejects(() => dedupe(3, () => { throw new Error("boom"); }), /boom/);
  assert.equal(dedupe.emVoo(), 0);
  assert.equal(await dedupe(3, async () => "recuperado"), "recuperado");
}

// 6) Executor que devolve valor não-promessa também funciona.
{
  const dedupe = createInFlightDeduper();
  assert.equal(await dedupe(4, () => "direto"), "direto");
}

console.log("OK — dedupe de requisições em voo (6 cenários).");
