import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
const vite = await createServer({
  appType: "custom", configFile: false, logLevel: "silent",
  root: fileURLToPath(new URL("../", import.meta.url)),
  server: { middlewareMode: true },
});
let scenarios = 0;
try {
  const { useConversaStore: store } = await vite.ssrLoadModule("/src/conversa/conversaStore.js");
  const { useAuthStore } = await vite.ssrLoadModule("/src/auth/authStore.js");
  const { default: api } = await vite.ssrLoadModule("/src/api/http.js");
  useAuthStore.setState({ user: { id: 1, role: "admin", company_id: 1 } });
  const requests = [];
  // Ignora o abort de propósito: a guarda deve proteger até contra resposta já em trânsito.
  api.get = (url, config) => new Promise((resolve, reject) => {
    requests.push({ url, signal: config?.signal, resolve, reject });
  });
  const payload = (id, status = "em_atendimento") => ({ data: {
    conversa: { id, atendente_id: 1, status_atendimento: status, status_atendimento_real: status },
    mensagens: [], tags: [{ id: status }], next_cursor: status, next_cursor_id: 77,
  } });
  const take = (id) => {
    const req = requests.shift();
    assert.equal(req?.url, `/chats/${id}`);
    assert.ok(req.signal instanceof AbortSignal, "GET deve receber signal");
    return req;
  };
  const seed = () => {
    assert.equal(requests.length, 0);
    store.getState().limpar();
    store.setState({ selectedId: 1, conversa: payload(1).data.conversa, mensagens: [] });
  };
  const open = async (id, status) => {
    const pending = store.getState().carregarConversa(id);
    take(id).resolve(payload(id, status));
    await pending;
  };

  seed();
  let old = store.getState().refresh({ silent: true });
  let stale = take(1);
  await open(2);
  assert.equal(stale.signal.aborted, true);
  await open(1);
  stale.resolve(payload(1, "aberta"));
  await old;
  assert.equal(store.getState().conversa.status_atendimento, "em_atendimento");
  assert.deepEqual(store.getState().tags, [{ id: "em_atendimento" }]);
  assert.equal(store.getState().cursor, "em_atendimento");
  scenarios++;

  seed();
  old = store.getState().refresh();
  stale = take(1);
  let latest = store.getState().refresh({ silent: true });
  let current = take(1);
  assert.equal(stale.signal.aborted, true);
  current.resolve(payload(1));
  await latest;
  stale.resolve(payload(1, "aberta"));
  await old;
  assert.equal(store.getState().conversa.status_atendimento, "em_atendimento");
  assert.equal(store.getState().loading, false);
  scenarios++;

  seed();
  old = store.getState().refresh();
  stale = take(1);
  latest = store.getState().refresh();
  current = take(1);
  stale.reject(new Error("falha antiga da mesma conversa"));
  await old;
  assert.equal(store.getState().loading, true, "erro antigo não encerra loading do refresh novo");
  current.resolve(payload(1));
  await latest;
  scenarios++;

  seed();
  old = store.getState().refresh();
  stale = take(1);
  latest = store.getState().carregarConversa(2);
  current = take(2);
  stale.reject(new Error("falha antiga de A"));
  await old;
  assert.equal(store.getState().selectedId, 2);
  assert.equal(store.getState().loading, true, "erro de A não encerra loading de B");
  current.resolve(payload(2));
  await latest;
  scenarios++;

  seed();
  old = store.getState().refresh();
  stale = take(1);
  store.getState().setSelectedId(null);
  assert.equal(stale.signal.aborted, true);
  await open(1);
  stale.resolve(payload(1, "aberta"));
  await old;
  assert.equal(store.getState().conversa.status_atendimento, "em_atendimento");
  scenarios++;

  seed();
  old = store.getState().refresh();
  stale = take(1);
  store.getState().limpar();
  assert.equal(stale.signal.aborted, true);
  stale.resolve(payload(1));
  await old;
  assert.equal(store.getState().selectedId, null);
  assert.equal(store.getState().conversa, null);
  assert.equal(store.getState().loading, false);
  scenarios++;

  seed();
  old = store.getState().refresh();
  stale = take(1);
  store.getState().setSelectedId(2);
  store.getState().setSelectedId(1);
  assert.equal(stale.signal.aborted, true);
  stale.resolve(payload(1, "aberta"));
  await old;
  assert.equal(store.getState().conversa.status_atendimento, "em_atendimento");
  scenarios++;

  store.getState().limpar();
  const loading = store.getState().carregarConversa(1);
  current = take(1);
  const superseded = store.getState().refresh();
  const queued = store.getState().refresh({ silent: true });
  assert.equal(requests.length, 0, "refresh aguarda a abertura em voo");
  current.resolve(payload(1, "aberta"));
  await loading;
  await superseded;
  current = take(1);
  assert.equal(requests.length, 0, "só o refresh mais recente segue após a abertura");
  current.resolve(payload(1));
  await queued;
  assert.equal(store.getState().conversa.status_atendimento, "em_atendimento");
  scenarios++;

  store.getState().limpar();
  const abandonedLoad = store.getState().carregarConversa(1);
  stale = take(1);
  const abandonedRefresh = store.getState().refresh();
  store.getState().setSelectedId(null);
  await abandonedRefresh;
  assert.equal(requests.length, 0, "fechar cancela também o refresh que aguardava a abertura");
  stale.resolve(payload(1));
  await abandonedLoad;
  assert.equal(store.getState().conversa, null);
  scenarios++;

  seed();
  const temp = { conversa_id: 1, tempId: "temp-race", client_temp_id: "temp-race",
    tipo: "texto", direcao: "out", texto: "ainda enviando", status: "pending",
    status_mensagem: "pending", criado_em: new Date().toISOString() };
  store.setState({ mensagens: [temp] });
  latest = store.getState().refresh();
  take(1).resolve(payload(1));
  await latest;
  assert.ok(store.getState().mensagens.some(m => m.tempId === "temp-race"));
  scenarios++;

  seed();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    latest = store.getState().refresh();
    take(1).reject(new Error("falha do refresh atual"));
    await latest;
    assert.equal(store.getState().loading, false);
    assert.equal(errors.length, 1);
  } finally { console.error = originalError; }
  scenarios++;

  store.getState().limpar();
  console.log(`OK — refresh de conversa: ${scenarios} cenários de concorrência.`);
} finally {
  await vite.close();
}
