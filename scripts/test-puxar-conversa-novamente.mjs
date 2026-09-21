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

  console.log("OK — viewerPodePuxarConversaNovamente: 10/10 casos.");
} finally {
  await vite.close();
}
