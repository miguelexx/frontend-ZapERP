/**
 * Certificação do batching de status_mensagem (socket): fora de ordem, duplicados e regressão.
 * Cobre "status pendente→enviado→entregue→lido" e "webhooks repetidos/fora de ordem".
 *
 * Executar: node scripts/test-status-mensagem-batch.mjs
 */
import {
  pickHigherStatus,
  normalizeStatusMensagemFromPayload,
  enqueueStatusMensagemEvent,
  flushStatusMensagemBatch,
  resetStatusMensagemBatch,
  resolveCardStatusFromMsg,
} from "../src/socket/statusMensagemBatch.js";

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed += 1;
}

/** Enfileira eventos (apply no-op) e drena de forma síncrona via flush manual. */
function drain(payloads) {
  resetStatusMensagemBatch();
  for (const p of payloads) {
    enqueueStatusMensagemEvent(p, () => {}, () => false);
  }
  let out = [];
  flushStatusMensagemBatch((evts) => {
    out = evts;
  });
  return out;
}

// 1) pickHigherStatus nunca regride. Erro vence estados ainda pendentes, mas uma
// confirmação real do provedor (sent/delivered/read) recupera a falha transitória.
assert(pickHigherStatus("read", "sent") === "read", "read não pode regredir para sent");
assert(pickHigherStatus("sent", "read") === "read", "read deve avançar sobre sent");
assert(pickHigherStatus("delivered", "sent") === "delivered", "delivered > sent");
assert(pickHigherStatus("read", "delivered") === "read", "read > delivered");
assert(pickHigherStatus("played", "read") === "played", "played > read");
assert(pickHigherStatus("pending", "erro") === "erro", "erro deve vencer pending");
assert(pickHigherStatus("read", "erro") === "read", "erro atrasado não pode regredir read");
assert(pickHigherStatus("erro", "read") === "read", "read confirmado deve recuperar erro");
assert(pickHigherStatus(null, "sent") === "sent", "null → usa o outro");
assert(pickHigherStatus("sent", null) === "sent", "outro null → mantém");

// 2) normalizeStatusMensagemFromPayload: aliases PT→EN + payload aninhado (data).
{
  const n = normalizeStatusMensagemFromPayload({ conversa_id: 5, mensagem_id: 9, status: "entregue", whatsapp_id: "wa" });
  assert(n.status === "delivered", `entregue→delivered, obteve ${n?.status}`);
  const r = normalizeStatusMensagemFromPayload({ data: { conversa_id: 5, mensagem_id: 9, status: "lida" } });
  assert(r.status === "read" && String(r.conversa_id) === "5", "aninhado em data + lida→read");
  const s = normalizeStatusMensagemFromPayload({ conversa_id: 5, mensagem_id: 9, status: "enviada" });
  assert(s.status === "sent", "enviada→sent");
  // mensagem_id igual a conversa_id é descartado (evita tratar id da conversa como id da msg).
  const amb = normalizeStatusMensagemFromPayload({ conversa_id: 5, mensagem_id: 5, status: "read", whatsapp_id: "wa" });
  assert(amb.mensagem_id == null, "mensagem_id == conversa_id deve ser anulado");
}

// 3) Fora de ordem no mesmo lote: delivered chega antes de sent → resultado final = delivered.
{
  const out = drain([
    { conversa_id: 5, mensagem_id: 9, status: "delivered", whatsapp_id: "wa-9" },
    { conversa_id: 5, mensagem_id: 9, status: "sent", whatsapp_id: "wa-9" },
  ]);
  assert(out.length === 1, `mesmo id deve colapsar em 1 item, obteve ${out.length}`);
  assert(out[0].status === "delivered", `status não pode regredir para sent, obteve ${out[0].status}`);
}

// 4) read depois de delivered avança normalmente.
{
  const out = drain([
    { conversa_id: 5, mensagem_id: 9, status: "delivered", whatsapp_id: "wa-9" },
    { conversa_id: 5, mensagem_id: 9, status: "read", whatsapp_id: "wa-9" },
  ]);
  assert(out.length === 1 && out[0].status === "read", "read deve prevalecer sobre delivered");
}

// 5) Webhook duplicado (mesmo evento 3x) colapsa em um único item.
{
  const ev = { conversa_id: 5, mensagem_id: 9, status: "delivered", whatsapp_id: "wa-9" };
  const out = drain([ev, { ...ev }, { ...ev }]);
  assert(out.length === 1, `evento duplicado deve colapsar, obteve ${out.length}`);
}

// 6) Mensagens diferentes na mesma conversa permanecem separadas.
{
  const out = drain([
    { conversa_id: 5, mensagem_id: 9, status: "sent", whatsapp_id: "wa-9" },
    { conversa_id: 5, mensagem_id: 10, status: "read", whatsapp_id: "wa-10" },
  ]);
  assert(out.length === 2, `dois ids distintos devem ficar separados, obteve ${out.length}`);
}

// 7) Mesma msg em conversas diferentes NÃO se mistura (chave inclui conversa_id).
{
  const out = drain([
    { conversa_id: 5, mensagem_id: 9, status: "read", whatsapp_id: "wa-9" },
    { conversa_id: 6, mensagem_id: 9, status: "sent", whatsapp_id: "wa-9b" },
  ]);
  assert(out.length === 2, "mesma mensagem_id em conversas distintas não pode colapsar");
}

// 8) Fronteira: evento sem conversa_id é descartado antes de enfileirar.
{
  const out = drain([{ mensagem_id: 9, status: "read", whatsapp_id: "wa-9" }]);
  assert(out.length === 0, "status sem conversa_id não deve entrar na fila");
}

// 9) Dedup por whatsapp_id quando não há mensagem_id (chave wa:conv:wamid).
{
  const out = drain([
    { conversa_id: 5, status: "sent", whatsapp_id: "wamid-X" },
    { conversa_id: 5, status: "read", whatsapp_id: "wamid-X" },
  ]);
  assert(out.length === 1 && out[0].status === "read", "dedup por whatsapp_id + status mais alto");
}

// 10) F6 (doc 33) — o CARD da lista nao pode rebaixar o tique.
//     O socket aplica resolveCardStatusFromMsg sobre a ultima_mensagem do card; antes gravava o
//     status do evento direto e um evento fora de ordem fazia o azul voltar a cinza.
{
  assert(
    resolveCardStatusFromMsg({ status_mensagem: "read", status: "read" }, "delivered") === "read",
    "evento atrasado delivered nao pode rebaixar card em read"
  );
  assert(
    resolveCardStatusFromMsg({ status_mensagem: "sent", status: "sent" }, "read") === "read",
    "evento que avanca precisa atualizar o card"
  );
  assert(
    resolveCardStatusFromMsg({ status_mensagem: "played" }, "read") === "played",
    "played e terminal no card"
  );
  // status_mensagem tem precedencia na LEITURA (campo de progresso), igual ao conversaStore.
  assert(
    resolveCardStatusFromMsg({ status_mensagem: "read", status: "pending" }, "delivered") === "read",
    "status_mensagem manda na leitura do que ja esta no card"
  );
  // Erro: vence pendente, perde para confirmacao real (mesma regra do statusRank do modulo).
  assert(
    resolveCardStatusFromMsg({ status_mensagem: "pending" }, "erro") === "erro",
    "erro vence pending no card"
  );
  assert(
    resolveCardStatusFromMsg({ status_mensagem: "erro" }, "delivered") === "delivered",
    "confirmacao real cura erro no card"
  );
  // Card ainda sem status (primeiro evento) aplica o recebido.
  assert(resolveCardStatusFromMsg({}, "sent") === "sent", "card sem status aplica o recebido");
  assert(resolveCardStatusFromMsg(null, "sent") === "sent", "msg nula nao quebra");
  assert(resolveCardStatusFromMsg({ status_mensagem: "read" }, null) === "read", "evento sem status mantem o card");
}

// 11) F9 (doc 33) — horario de entrega/leitura atravessa o normalizador e o merge da fila.
//     O backend manda entregue_em/lida_em SO no ACK que acabou de gravar; se o normalizador
//     descartasse, o modal "Dados da mensagem" so veria o horario depois de um refetch.
{
  const n = normalizeStatusMensagemFromPayload({
    conversa_id: 5, mensagem_id: 9, status: "delivered", entregue_em: "2026-10-16T10:00:00",
  });
  assert(n.entregue_em === "2026-10-16T10:00:00", "normalizador precisa carregar entregue_em");
  assert(!("lida_em" in n), "campo ausente nao deve virar null no evento");

  const dentroDeData = normalizeStatusMensagemFromPayload({
    data: { conversa_id: 5, mensagem_id: 9, status: "read", lida_em: "2026-10-16T10:05:00" },
  });
  assert(dentroDeData.lida_em === "2026-10-16T10:05:00", "payload aninhado em data tambem carrega");

  // Na mesma janela de 75ms: o PRIMEIRO horario vence (o backend grava uma vez so).
  const out = drain([
    { conversa_id: 5, mensagem_id: 9, status: "delivered", entregue_em: "2026-10-16T10:00:00" },
    { conversa_id: 5, mensagem_id: 9, status: "read", lida_em: "2026-10-16T10:05:00" },
  ]);
  assert(out.length === 1, "mesma mensagem colapsa num evento");
  assert(out[0].status === "read", "status final e o mais avancado");
  assert(out[0].entregue_em === "2026-10-16T10:00:00", "merge preserva entregue_em do 1o evento");
  assert(out[0].lida_em === "2026-10-16T10:05:00", "merge preserva lida_em do 2o evento");

  const semHorario = drain([{ conversa_id: 5, mensagem_id: 9, status: "sent" }]);
  assert(!("entregue_em" in semHorario[0]), "ACK sem horario nao inventa campo");
}

console.log(`OK - regressao de batching de status_mensagem passou (${passed} asserts).`);
