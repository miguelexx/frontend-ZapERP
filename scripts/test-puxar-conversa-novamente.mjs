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

  assert.equal(viewerPodePuxarConversaNovamente(
    { id: 1, atendente_id: 99, status_atendimento: "em_atendimento", participante_ativo: true },
    supervisor
  ), false, "participante ativo não precisa puxar novamente");

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

  // Exercita a ação real do store: um 409 não pode desbloquear a conversa.
  globalThis.localStorage = {
    getItem: (key) => key === "zap_erp_auth" ? JSON.stringify({ user: atendente }) : null,
    setItem() {}, removeItem() {},
  };
  const { useConversaStore } = await vite.ssrLoadModule("/src/conversa/conversaStore.js");
  const { useChatStore } = await vite.ssrLoadModule("/src/chats/chatsStore.js");
  const { default: api } = await vite.ssrLoadModule("/src/api/http.js");
  const originalPost = api.post;
  const originalRefresh = useConversaStore.getState().refresh;
  let refreshes = 0;
  useConversaStore.setState({ refresh: async () => { refreshes++; } });
  try {
    for (const message of ["Limite de 4 atendentes", "Reabra a conversa"]) {
      const conversa = { id: 1, atendente_id: 99, status_atendimento: "em_atendimento", mensagens_bloqueadas: true };
      useConversaStore.setState({ conversa });
      useChatStore.setState({ chats: [conversa] });
      api.post = async () => { throw Object.assign(new Error(message), { response: { status: 409, data: { error: message } } }); };
      await assert.rejects(useConversaStore.getState().puxarConversaNovamente(1), (err) => err.response.status === 409);
      assert.equal(useConversaStore.getState().conversa.mensagens_bloqueadas, true);
      assert.notEqual(useConversaStore.getState().conversa.participante_ativo, true);
      assert.notEqual(useChatStore.getState().chats[0].participante_ativo, true);
      assert.equal(refreshes, 0);
    }
    api.post = async () => ({ data: { ok: true, already_participant: true } });
    await useConversaStore.getState().puxarConversaNovamente(1);
    assert.equal(useConversaStore.getState().conversa.participante_ativo, true);
    assert.equal(useConversaStore.getState().conversa.atendente_id, 99);
    assert.equal(refreshes, 1);
  } finally {
    api.post = originalPost;
    useConversaStore.setState({ refresh: originalRefresh });
  }
  console.log("OK — puxar conversa: permissões, Minha fila, rejeição de conflitos e confirmação idempotente.");
} finally {
  await vite.close();
}
