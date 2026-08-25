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

// 1) pickHigherStatus nunca regride e erro sempre vence.
assert(pickHigherStatus("read", "sent") === "read", "read não pode regredir para sent");
assert(pickHigherStatus("sent", "read") === "read", "read deve avançar sobre sent");
assert(pickHigherStatus("delivered", "sent") === "delivered", "delivered > sent");
assert(pickHigherStatus("read", "delivered") === "read", "read > delivered");
assert(pickHigherStatus("played", "read") === "played", "played > read");
assert(pickHigherStatus("read", "erro") === "erro", "erro sempre vence (falha visível)");
assert(pickHigherStatus("erro", "read") === "erro", "erro vence independente da ordem");
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

console.log(`OK - regressao de batching de status_mensagem passou (${passed} asserts).`);
