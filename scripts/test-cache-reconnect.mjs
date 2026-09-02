import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import * as cache from '../src/chats/chatListSidebarCache.js';
import { createReconnectRecovery } from '../src/socket/reconnectRecovery.js';

const vite = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent',
  root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true } });
const saved = { now: Date.now, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
  sessionStorage: globalThis.sessionStorage };
const storage = new Map();
const jobs = new Map();
let now = 1_000_000;
let sequence = 0;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
async function tick(ms) {
  const end = now + ms;
  for (;;) {
    const next = [...jobs].sort((a, b) => a[1].at - b[1].at).find(([, job]) => job.at <= end);
    if (!next) break;
    const [id, job] = next;
    now = job.at;
    jobs.delete(id);
    job.fn();
    await flush();
  }
  now = end;
  await flush();
}
try {
  const { useChatStore } = await vite.ssrLoadModule('/src/chats/chatsStore.js');
  Date.now = () => now;
  globalThis.setTimeout = (fn, delay = 0) => { const id = ++sequence; jobs.set(id, { fn, at: now + delay }); return id; };
  globalThis.clearTimeout = (id) => jobs.delete(id);
  globalThis.sessionStorage = {
    get length() { return storage.size; }, key: (i) => [...storage.keys()][i],
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key),
  };
  const row = { id: 11, status_atendimento: 'em_atendimento' };
  cache.persistChatListRowsForFilterToSession('7:1', 'minha', [row]);
  await tick(44_000);
  assert.equal(cache.hydrateChatListRowsForFilterFromSession('7:1', 'minha')[0].id, 11);
  await tick(1001);
  assert.equal(cache.hydrateChatListRowsForFilterFromSession('7:1', 'minha'), null, 'memória também expira em 45s');

  storage.set('zap_erp_chat_rows_by_filter_v1:7:1:antiga', JSON.stringify({ t: now - 44_000, rows: [row] }));
  assert.equal(cache.hydrateChatListRowsForFilterFromSession('7:1', 'antiga')[0].id, 11);
  await tick(1001);
  assert.equal(cache.hydrateChatListRowsForFilterFromSession('7:1', 'antiga'), null, 'hidratar sessão não renova idade');

  cache.persistChatListRowsForFilterToSession('7:1', 'minha', [row]);
  cache.persistChatListRowsForFilterToSession('7:1', 'finalizadas', []);
  cache.persistChatListRowsForFilterToSession('8:2', 'minha', [row]);
  const revision = cache.getChatListRowsCacheRevision('7:1');
  const otherRevision = cache.getChatListRowsCacheRevision('8:2');
  cache.clearChatListRowsFilterSessionCache('7:1');
  cache.persistChatListRowsForFilterToSession('7:1', 'minha', [row], { revision });
  assert.equal(cache.hydrateChatListRowsForFilterFromSession('7:1', 'minha'), null, 'GET anterior não restaura cache invalidado');
  assert.equal(cache.hydrateChatListRowsForFilterFromSession('7:1', 'finalizadas'), null);
  assert.equal(cache.getChatListRowsCacheRevision('8:2'), otherRevision);
  assert.equal(cache.hydrateChatListRowsForFilterFromSession('8:2', 'minha')[0].id, 11, 'escopo vizinho preservado');
  cache.persistChatListRowsForFilterToSession('7:1', 'minha', [], { revision: cache.getChatListRowsCacheRevision('7:1') });
  assert.deepEqual(cache.hydrateChatListRowsForFilterFromSession('7:1', 'minha'), [], 'vazio válido continua distinto de cache ausente');
  cache.clearChatListSidebarSessionCache();
  assert.equal(storage.size, 0);
  assert.equal(cache.hydrateChatListRowsForFilterFromSession('8:2', 'minha'), null, 'logout limpa também memória');

  let calls = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  const release = [];
  const recovery = createReconnectRecovery({ recover: async () => {
    calls++;
    maxConcurrent = Math.max(maxConcurrent, ++concurrent);
    await new Promise((resolve) => release.push(resolve));
    concurrent--;
  } });
  for (let i = 0; i < 20; i++) recovery.request();
  await tick(599);
  assert.equal(calls, 0);
  await tick(1);
  assert.equal(calls, 1, '20 conexões agrupadas em uma recuperação');
  for (let i = 0; i < 20; i++) recovery.request();
  await tick(4000);
  assert.equal(calls, 1, 'não concorre com recuperação lenta');
  release.shift()();
  await flush();
  await tick(600);
  assert.equal(calls, 2, 'reconexão durante GET é recuperada depois');
  recovery.request();
  release.shift()();
  await flush();
  await tick(2499);
  assert.equal(calls, 2, 'respeita intervalo mínimo mesmo com HTTP rápido');
  await tick(1);
  assert.equal(calls, 3);
  assert.equal(maxConcurrent, 1);
  release.shift()();
  await flush();
  recovery.request();
  recovery.suspend();
  await tick(5000);
  assert.equal(calls, 3, 'não inicia HTTP enquanto desconectado');
  recovery.request();
  await tick(600);
  assert.equal(calls, 4, 'retoma após voltar a conexão');
  recovery.request();
  recovery.stop();
  release.shift()();
  await tick(5000);
  assert.equal(calls, 4, 'logout cancela pendências e follow-up');
  let failureCalls = 0;
  const afterError = createReconnectRecovery({ recover: () => { failureCalls++; throw Error('rede'); } });
  afterError.request();
  await tick(600);
  afterError.request();
  await tick(2500);
  assert.equal(failureCalls, 2, 'falha não trava futuras recuperações');
  afterError.stop();

  useChatStore.getState().limpar();
  useChatStore.getState().requestChatListResync();
  await tick(180);
  assert.equal(useChatStore.getState().chatListResyncNonce, 1);
  await tick(1000);
  assert.equal(useChatStore.getState().chatListResyncNonce, 1, 'max-wait cancelado não gera segundo GET');
  for (let i = 0; i < 7; i++) { useChatStore.getState().requestChatListResync(); await tick(100); }
  assert.equal(useChatStore.getState().chatListResyncNonce, 2, 'rajada contínua tem prazo máximo');
  await tick(1000);
  assert.equal(useChatStore.getState().chatListResyncNonce, 2);
  console.log('OK — TTL, invalidação por escopo, GET atrasado, reconexão serializada e debounce único.');
} finally {
  Date.now = saved.now;
  globalThis.setTimeout = saved.setTimeout;
  globalThis.clearTimeout = saved.clearTimeout;
  if (saved.sessionStorage === undefined) delete globalThis.sessionStorage;
  else globalThis.sessionStorage = saved.sessionStorage;
  await vite.close();
}
