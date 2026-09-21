import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "silent",
  root: fileURLToPath(new URL("../", import.meta.url)),
  server: { middlewareMode: true },
});

try {
  const { viewerPodePuxarConversaNovamente } = await vite.ssrLoadModule(
    "/src/conversa/utils/conversaAccessHelpers.js"
  );
  const { conversaPertenceAMinhaFila } = await vite.ssrLoadModule(
    "/src/chats/chatListQueryHelpers.js"
  );

  const atendente = { id: 10, perfil: "atendente" };
  const supervisor = { id: 11, perfil: "supervisor" };
  const admin = { id: 12, perfil: "admin" };

  // Transferidor: o backend só devolve a conversa bloqueada a quem transferiu.
  assert.equal(
    viewerPodePuxarConversaNovamente(
      { id: 1, atendente_id: 99, status_atendimento: "em_atendimento", mensagens_bloqueadas: true },
      atendente
    ),
    true,
    "transferidor (bloqueado) pode puxar"
  );

  // Supervisor vê a conversa (não bloqueado) e pode puxar mesmo assim.
  assert.equal(
    viewerPodePuxarConversaNovamente(
      { id: 1, atendente_id: 99, status_atendimento: "em_atendimento" },
      supervisor
    ),
    true,
    "supervisor pode puxar mesmo sem bloqueio"
  );

  // Admin também pode.
  assert.equal(
    viewerPodePuxarConversaNovamente(
      { id: 1, atendente_id: 99, status_atendimento: "em_atendimento" },
      admin
    ),
    true,
    "admin pode puxar"
  );

  // Atendente comum, sem bloqueio e não é dele → não pode (nem chegaria aqui: backend dá 403).
  assert.equal(
    viewerPodePuxarConversaNovamente(
      { id: 1, atendente_id: 99, status_atendimento: "em_atendimento" },
      atendente
    ),
    false,
    "atendente comum sem bloqueio não pode"
  );

  // A conversa já é minha → não faz sentido puxar.
  assert.equal(
    viewerPodePuxarConversaNovamente(
      { id: 1, atendente_id: 11, status_atendimento: "em_atendimento", mensagens_bloqueadas: true },
      supervisor
    ),
    false,
    "conversa própria não puxa"
  );

  // Sem atendente principal → nada a puxar.
  assert.equal(
    viewerPodePuxarConversaNovamente(
      { id: 1, atendente_id: null, status_atendimento: "aberta" },
      supervisor
    ),
    false,
    "sem atendente não puxa"
  );

  // Encerrada → não se aplica (reabrir é outro fluxo).
  assert.equal(
    viewerPodePuxarConversaNovamente(
      { id: 1, atendente_id: 99, status_atendimento: "fechada", mensagens_bloqueadas: true },
      supervisor
    ),
    false,
    "conversa encerrada não puxa"
  );

  // Grupo → não se aplica.
  assert.equal(
    viewerPodePuxarConversaNovamente(
      { id: 1, atendente_id: 99, is_group: true, status_atendimento: "em_atendimento", mensagens_bloqueadas: true },
      supervisor
    ),
    false,
    "grupo não puxa"
  );

  // Nulos → false, sem lançar.
  assert.equal(viewerPodePuxarConversaNovamente(null, supervisor), false);
  assert.equal(viewerPodePuxarConversaNovamente({ id: 1, atendente_id: 99 }, null), false);

  // Após puxar: co-atendente ativo (participante_ativo) entra na Minha fila mesmo
  // sem ser o responsável principal (atendente_id continua sendo o outro).
  assert.equal(
    conversaPertenceAMinhaFila(
      { id: 1, atendente_id: 99, status_atendimento: "em_atendimento", participante_ativo: true },
      10
    ),
    true,
    "co-atendente ativo pertence à Minha fila"
  );
  // Sem participante_ativo e não sendo o principal → fora da Minha fila (comportamento original).
  assert.equal(
    conversaPertenceAMinhaFila(
      { id: 1, atendente_id: 99, status_atendimento: "em_atendimento" },
      10
    ),
    false,
    "não-participante de outro atendente fica fora da Minha fila"
  );
  // Encerrada não entra na Minha fila nem como participante.
  assert.equal(
    conversaPertenceAMinhaFila(
      { id: 1, atendente_id: 99, status_atendimento: "fechada", participante_ativo: true },
      10
    ),
    false,
    "encerrada não entra na Minha fila"
  );

  console.log("OK — puxar conversa novamente: 13/13 casos (permissão + Minha fila).");
} finally {
  await vite.close();
}
