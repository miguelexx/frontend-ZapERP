import { test, expect } from '@playwright/test';

const API = process.env.VITE_API_URL || 'http://localhost:5000';
const user = { id: 1, company_id: 7, nome: 'Auditoria', perfil: 'admin', role: 'admin', departamento_ids: [1] };
const row = (id) => ({ id, company_id: 7, contato_nome: `Conversa ${id}`, nome_contato_cache: `Conversa ${id}`,
  telefone: `551199999${id}`, atendente_id: 1, status_atendimento: 'em_atendimento', unread_count: 0 });

async function install(page, rows = [row(11)]) {
  const counters = { list: 0, thread: 0, unread: 0, threadActive: 0, maxThreadActive: 0 };
  const state = { holdThread: false, releaseThread: null };
  await page.addInitScript((user) => localStorage.setItem('zap_erp_auth', JSON.stringify({ token: 'audit-reconnect', user })), user);
  await page.route(`${API}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.startsWith('/socket.io')) return route.abort();
    if (path === '/usuarios/me') return route.fulfill({ json: user });
    if (path === '/usuarios/me/permissoes') return route.fulfill({ json: { permissoes: [] } });
    if (path === '/config/empresa') return route.fulfill({ json: { id: 7, nome: 'Auditoria' } });
    if (path === '/chats/counts') {
      if (url.searchParams.has('unread')) {
        counters.unread++;
        return route.fulfill({ json: { unread_by_id: {}, unread_total: 0 } });
      }
      return route.fulfill({ json: { todas: 2, minha_fila: 2, em_atendimento: 2 } });
    }
    if (path === '/chats') {
      counters.list++;
      return route.fulfill({ json: { conversas: rows, total_count: 2, has_more: false } });
    }
    if (path === '/chats/11') {
      counters.thread++;
      counters.maxThreadActive = Math.max(counters.maxThreadActive, ++counters.threadActive);
      if (state.holdThread) await new Promise((resolve) => { state.releaseThread = resolve; });
      counters.threadActive--;
      return route.fulfill({ json: { conversa: row(11), mensagens: [{ id: 100, conversa_id: 11,
        direcao: 'in', tipo: 'texto', texto: 'Mensagem de recuperação', criado_em: new Date().toISOString() }], tags: [] } });
    }
    if (path === '/tags' || path === '/dashboard/departamentos' || path.endsWith('/atendentes')) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/atendimento');
  await expect(page.locator('.chat-list-row').first()).toBeVisible();
  await page.evaluate(async () => {
    const live = (path) => performance.getEntriesByType('resource').find((e) => new URL(e.name).pathname === path)?.name;
    window.auditChats = (await import(live('/src/chats/chatsStore.js'))).useChatStore;
    window.auditSocket = await import(live('/src/socket/socket.js'));
    window.auditCache = await import(live('/src/chats/chatListSidebarCache.js'));
    window.auditEmit = (event, payload) => {
      const socket = window.auditSocket.getSocket();
      for (const listener of socket.listenersAny()) listener(event, payload);
      for (const listener of socket.listeners(event)) listener(payload);
    };
    window.auditBurst = () => {
      for (let i = 0; i < 20; i++) { window.auditEmit('disconnect'); window.auditEmit('connect'); }
    };
  });
  return { counters, state };
}

test('hint conserva 6 de 2 e caches são invalidados por resync e eventos no escopo correto', async ({ page }) => {
  await install(page, Array.from({ length: 6 }, (_, i) => row(i + 11)));
  await expect(page.locator('.chat-list-row')).toHaveCount(6);
  await expect(page.locator('.chat-list-search-hint')).toHaveText('6 de 2');
  const seed = () => page.evaluate(() => {
    for (const scope of ['7:1', '8:2']) for (const filter of ['audit-one', 'audit-two']) {
      window.auditCache.persistChatListRowsForFilterToSession(scope, filter, [{ id: 777 }]);
    }
  });
  const cached = (scope = '7:1') => page.evaluate((scope) => ['audit-one', 'audit-two']
    .map((key) => {
      const rows = window.auditCache.hydrateChatListRowsForFilterFromSession(scope, key);
      return rows === null ? null : rows.map(({ id }) => ({ id }));
    }), scope);
  await seed();
  await page.evaluate(() => window.auditChats.getState().requestChatListResync({ force: true }));
  await expect.poll(cached).toEqual([null, null]);
  expect(await cached('8:2')).toEqual([[{ id: 777 }], [{ id: 777 }]]);
  await seed();
  await page.evaluate(() => window.auditEmit('conversa_atualizada', { company_id: 8, id: 777, status_atendimento: 'fechada' }));
  expect(await cached()).toEqual([[{ id: 777 }], [{ id: 777 }]]);
  await page.evaluate(() => window.auditEmit('conversa_atualizada', { company_id: 7, id: 777, status_atendimento: 'fechada' }));
  await expect.poll(cached).toEqual([null, null]);
  expect(await cached('8:2')).toEqual([[{ id: 777 }], [{ id: 777 }]]);
});

test('rajadas de reconexão agrupam GETs e recuperam evento durante HTTP lento sem concorrência', async ({ page, isMobile }) => {
  const { counters, state } = await install(page);
  const card = page.locator('.chat-list-row').filter({ hasText: 'Conversa 11' });
  if (isMobile) await card.tap(); else await card.click();
  await expect(page.locator('.wa-input')).toBeVisible();
  await expect.poll(() => counters.unread).toBeGreaterThan(0);
  const before = { ...counters };
  state.holdThread = true;
  try {
    await page.evaluate(() => window.auditBurst());
    await expect.poll(() => counters.thread).toBe(before.thread + 1);
    await expect.poll(() => counters.list).toBe(before.list + 1);
    await expect.poll(() => counters.unread).toBeGreaterThan(before.unread);
    await page.evaluate(() => window.auditBurst());
    expect(counters.thread).toBe(before.thread + 1);
    state.holdThread = false;
    state.releaseThread();
    await expect.poll(() => counters.thread).toBe(before.thread + 2);
    await expect.poll(() => counters.list).toBe(before.list + 2);
    expect(counters.maxThreadActive).toBe(1);
    await expect(page.getByText('Mensagem de recuperação', { exact: true })).toBeVisible();
    const after = { ...counters };
    await page.evaluate(() => { window.auditBurst(); window.auditSocket.disconnectSocket(); });
    // A janela de agrupamento vence sem executar a pendência da sessão encerrada.
    await page.waitForTimeout(2800);
    expect(counters.thread).toBe(after.thread);
    expect(counters.list).toBe(after.list);
  } finally {
    state.holdThread = false;
    state.releaseThread?.();
  }
});
