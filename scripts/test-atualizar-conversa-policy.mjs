/**
 * Política do handler de `atualizar_conversa` (src/socket/atualizarConversaPolicy.js).
 *
 * O que este teste trava:
 *   1. sinal com `motivo: 'nova_mensagem'` para conversa JÁ na lista → `ignorar` (sem GET);
 *   2. o mesmo sinal para conversa FORA da lista → `adicionar_se_autorizado` (GET autorizado);
 *   3. qualquer sinal SEM o motivo (backend antigo, assumir, transferir…) → `refetch`;
 *   4. lote misto (nova_mensagem + sinal explícito na mesma janela) → `refetch` — o sinal
 *      explícito nunca pode ser engolido por uma mensagem que chegou logo depois;
 *   5. `lista_realtime` que força resync continua a forçar;
 *   6. 403/404 só pede GET /chats se a conversa ESTAVA na lista;
 *   7. o socket.js realmente usa a política e o modo leve (`lista: true`) nos refetches de card.
 *
 * Mutações que este teste pega (validado ao escrever): trocar `ignorar` por `refetch` no
 * caso 1; não marcar `refetchExplicito` para payload sem motivo; devolver true no 403 sem row.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MOTIVO_NOVA_MENSAGEM,
  novoLoteAtualizarConversa,
  acumularAtualizarConversa,
  decidirAtualizarConversa,
  deveResyncListaAposAcessoNegado,
  criarBuscadorDeCardComRefazer,
} from "../src/socket/atualizarConversaPolicy.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");

const lote = (...payloads) => payloads.reduce((l, p) => acumularAtualizarConversa(l, p), novoLoteAtualizarConversa());

// 1. nova_mensagem + conversa na lista → ignorar
assert.equal(
  decidirAtualizarConversa({ lote: lote({ id: 10, motivo: MOTIVO_NOVA_MENSAGEM }), rowNaLista: true }),
  "ignorar",
  "mensagem recebida numa conversa já listada não pode refazer GET /chats/:id"
);

// 2. nova_mensagem + conversa fora da lista → GET autorizado
assert.equal(
  decidirAtualizarConversa({ lote: lote({ id: 10, motivo: MOTIVO_NOVA_MENSAGEM }), rowNaLista: false }),
  "adicionar_se_autorizado"
);

// 3. sem motivo (backend antigo / assumir / transferir) → refetch, com ou sem row
assert.equal(decidirAtualizarConversa({ lote: lote({ id: 10 }), rowNaLista: true }), "refetch");
assert.equal(decidirAtualizarConversa({ lote: lote({ id: 10 }), rowNaLista: false }), "refetch");
assert.equal(decidirAtualizarConversa({ lote: lote({ id: 10, motivo: "outro" }), rowNaLista: true }), "refetch");

// 4. lote misto: um sinal explícito na mesma janela nunca é engolido
assert.equal(
  decidirAtualizarConversa({
    lote: lote({ id: 10 }, { id: 10, motivo: MOTIVO_NOVA_MENSAGEM }),
    rowNaLista: true,
  }),
  "refetch",
  "assumir seguido de mensagem na mesma janela tem de refazer o GET"
);
assert.equal(
  decidirAtualizarConversa({
    lote: lote({ id: 10, motivo: MOTIVO_NOVA_MENSAGEM }, { id: 10 }),
    rowNaLista: true,
  }),
  "refetch"
);

// 5. lista_realtime força resync mesmo com motivo
const forcado = lote({ id: 10, motivo: MOTIVO_NOVA_MENSAGEM, lista_realtime: { minha_fila: true } });
assert.equal(forcado.forcaResync, true);
assert.equal(decidirAtualizarConversa({ lote: forcado, rowNaLista: true }), "refetch");

// lote vazio / ausente nunca "ignora" (defensivo)
assert.equal(decidirAtualizarConversa({ lote: null, rowNaLista: true }), "refetch");
assert.equal(lote({ id: 1 }, { id: 1 }).eventos, 2);

// 6. 403/404: só reconcilia a lista se a conversa estava nela
assert.equal(deveResyncListaAposAcessoNegado({ rowExistia: true }), true);
assert.equal(deveResyncListaAposAcessoNegado({ rowExistia: false }), false);
assert.equal(deveResyncListaAposAcessoNegado({ rowExistia: undefined }), false);

// 8. refetch explícito com GET em voo: espera e refaz UM GET (a resposta em voo pode ser
//    anterior ao sinal — assumir em t0, transferir em t0+300 ms). N sinais no voo = 2 GETs.
{
  const pendentes = [];
  let chamadas = 0;
  const buscar = () =>
    new Promise((resolve, reject) => {
      chamadas += 1;
      pendentes.push({ resolve, reject, n: chamadas });
    });
  const buscarCard = criarBuscadorDeCardComRefazer(buscar);

  const g1 = buscarCard(10);
  assert.equal(chamadas, 1, "primeiro sinal dispara um GET");
  const g2 = buscarCard(10);
  const g3 = buscarCard(10);
  const g4 = buscarCard("10");
  assert.equal(chamadas, 1, "sinais durante o voo NÃO disparam GET novo imediatamente");
  assert.equal(g2, g3, "sinais na mesma janela partilham o GET seguinte");
  assert.equal(g3, g4, "chave por String(id)");
  assert.notEqual(g1, g2, "o GET seguinte NÃO é o que já estava em voo");

  pendentes[0].resolve({ id: 10, v: "antigo" });
  assert.deepEqual(await g1, { id: 10, v: "antigo" }, "quem esperava o 1º recebe o 1º");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(chamadas, 2, "depois do 1º resolver sai exatamente UM GET a mais");
  pendentes[1].resolve({ id: 10, v: "novo" });
  assert.deepEqual(await g2, { id: 10, v: "novo" }, "o sinal tardio recebe a resposta NOVA");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(buscarCard.emVoo(), 0, "nada fica preso em voo");

  // conversa diferente não partilha nada
  const outra = buscarCard(11);
  assert.equal(chamadas, 3);
  pendentes[2].resolve({ id: 11 });
  await outra;

  // falha do GET em voo não impede o GET seguinte
  const f1 = buscarCard(12);
  const f2 = buscarCard(12);
  assert.equal(chamadas, 4);
  pendentes[3].reject(new Error("rede"));
  await f1.catch(() => {});
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(chamadas, 5, "após falha do 1º, o GET seguinte ainda sai");
  pendentes[4].resolve({ id: 12, v: "ok" });
  assert.deepEqual(await f2, { id: 12, v: "ok" });
}

// 7. socket.js usa a política e o modo leve
{
  const txt = ler("src/socket/socket.js");
  assert.match(txt, /from "\.\/atualizarConversaPolicy\.js"/, "socket.js tem de importar a política (com .js)");
  assert.match(txt, /decidirAtualizarConversa\(\{/, "handler de atualizar_conversa tem de passar pela política");
  assert.match(txt, /deveResyncListaAposAcessoNegado\(\{ rowExistia/, "403/404 tem de consultar a política de resync");
  assert.match(txt, /criarBuscadorDeCardComRefazer\(/, "refetch explícito tem de passar pelo buscador com refazer (GET em voo pode ser anterior ao sinal)");
  assert.doesNotMatch(txt, /dedupeRefetchCard/, "o refetch explícito NÃO pode partilhar cegamente um GET em voo");
  const usosLeves = (txt.match(/fetchChatById\([^)]*\{ lista: true \}\)/g) || []).length;
  assert.equal(usosLeves, 2, "addChatIfAuthorized e o refetch de atualizar_conversa têm de usar { lista: true }");
  const usosPesados = (txt.match(/fetchChatById\((conversaId|id)\)/g) || []).length;
  assert.equal(usosPesados, 0, "nenhum refetch de card pode voltar ao detalhe completo");
}
{
  const svc = ler("src/chats/chatService.js");
  assert.match(svc, /params: \{ lista: 1 \}/, "fetchChatById(id, { lista: true }) tem de mandar ?lista=1");
}

console.log("OK — test-atualizar-conversa-policy: política de atualizar_conversa + modo leve");
