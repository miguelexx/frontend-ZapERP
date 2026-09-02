import { test, expect } from '@playwright/test';

const API = process.env.VITE_API_URL || 'http://localhost:5000';
const user = { id: 1, company_id: 7, nome: 'Auditoria', perfil: 'admin', role: 'admin', departamento_ids: [1] };
const row = (id, name) => ({ id, company_id: 7, contato_nome: name, nome_contato_cache: name,
  telefone: `55119999900${id}`, atendente_id: 1, departamento_id: 1,
  status_atendimento: 'em_atendimento', status_atendimento_real: 'em_atendimento', unread_count: 1,
  ultima_mensagem: { id: id * 10, conversa_id: id, direcao: 'in', texto: 'Mensagem inicial', criado_em: '2026-09-02T10:00:00Z' } });

async function emitServerEvent(page, event, payload) {
  await page.evaluate(async ({ event, payload }) => {
    const { getSocket } = window.auditSocketModule;
    const socket = getSocket();
    for (const listener of socket.listenersAny()) listener(event, payload);
    for (const listener of socket.listeners(event)) listener(payload);
  }, { event, payload });
}

test('snapshot global, replay de socket, reconexão e Minha fila sem cards antigos', async ({ page }) => {
  let rows = [row(11, 'Conversa Onze')];
  let unread = { 11: 1, 99: 3 };
  let snapshotRequests = 0;
  await page.addInitScript((user) => localStorage.setItem('zap_erp_auth', JSON.stringify({ token: 'audit-unread', user })), user);
  await page.route(`${API}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.startsWith('/socket.io')) return route.abort();
    if (path === '/usuarios/me') return route.fulfill({ json: user });
    if (path === '/usuarios/me/permissoes') return route.fulfill({ json: { permissoes: [] } });
    if (path === '/config/empresa') return route.fulfill({ json: { id: 7, nome: 'Auditoria' } });
    if (path === '/chats/counts') {
      if (url.searchParams.get('unread') === '1') {
        snapshotRequests++;
        return route.fulfill({ json: { unread_by_id: unread, unread_total: Object.values(unread).reduce((a, b) => a + b, 0), company_id: 7, usuario_id: 1 } });
      }
      return route.fulfill({ json: { todas: rows.length, minha_fila: rows.length, em_atendimento: rows.length } });
    }
    if (path === '/chats') return route.fulfill({ json: rows });
    if (/^\/chats\/\d+$/.test(path)) return route.fulfill({ status: 403, json: { error: 'Sem acesso' } });
    if (path === '/tags' || path === '/dashboard/departamentos') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/atendimento');
  await expect(page.locator('.chat-list-row').filter({ hasText: 'Conversa Onze' })).toBeVisible();
  // Importa a URL que o Vite entregou à aplicação, incluindo a versão HMR.
  // Uma URL sem ?t= pode criar outra instância da store durante desenvolvimento.
  await page.evaluate(async () => {
    const liveModule = (path) => performance.getEntriesByType('resource').find((e) => new URL(e.name).pathname === path)?.name;
    window.auditStoreModule = await import(liveModule('/src/chats/chatsStore.js'));
    window.auditSocketModule = await import(liveModule('/src/socket/socket.js'));
  });
  await expect.poll(() => snapshotRequests, { message: 'Snapshot global solicitado no boot' }).toBeGreaterThan(0);
  await page.getByRole('button', { name: /^Minha fila/ }).click();
  await expect(page.locator('.chat-list-row').filter({ hasText: 'Conversa Onze' })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const { useChatStore } = window.auditStoreModule;
    const s = useChatStore.getState();
    return { total: s.unreadTotal, hydrated: s.unreadHydrated };
  })).toEqual({ total: 4, hydrated: true });
  await expect(page).toHaveTitle(/^\(4\)/); // ID 99 não está na aba, mas faz parte do total autorizado.

  unread = { 11: 2, 99: 3 };
  const msg = { id: 1234, conversa_id: 11, company_id: 7, direcao: 'in', fromMe: false, texto: 'nova', criado_em: '2026-09-02T11:00:00Z' };
  await emitServerEvent(page, 'nova_mensagem', msg);
  await emitServerEvent(page, 'nova_mensagem', msg);
  await expect(page).toHaveTitle(/^\(5\)/);
  await expect.poll(() => page.evaluate(async () => {
    const { useChatStore } = window.auditStoreModule;
    const s = useChatStore.getState();
    return [s.unreadById[11], s.chats.find((r) => r.id === 11)?.unread_count];
  })).toEqual([2, 2]);
  const beforeUnknown = snapshotRequests;
  await emitServerEvent(page, 'nova_mensagem', { ...msg, id: 5678, conversa_id: 888 });
  await expect.poll(() => snapshotRequests).toBeGreaterThan(beforeUnknown);
  await expect(page).toHaveTitle(/^\(5\)/); // GET negado não aumenta o contador.

  rows = [];
  await page.evaluate(async () => {
    const { useChatStore } = window.auditStoreModule;
    useChatStore.getState().removeChat(11);
  });
  await expect(page.locator('.chat-list-row')).toHaveCount(0);
  rows = [row(33, 'Conversa Trinta Tres'), row(44, 'Conversa Quarenta Quatro')];
  await page.evaluate(async (rows) => {
    const { useChatStore } = window.auditStoreModule;
    useChatStore.getState().setChats(rows);
  }, rows);
  await expect(page.locator('.chat-list-row')).toHaveCount(2);
  await expect(page.locator('.chat-list-row').filter({ hasText: 'Conversa Onze' })).toHaveCount(0);
  await expect(page.locator('.chat-list-row').filter({ hasText: 'Conversa Trinta Tres' })).toBeVisible();

  unread = { 33: 7 };
  await emitServerEvent(page, 'connect');
  await expect(page).toHaveTitle(/^\(7\)/);
  await expect.poll(() => page.evaluate(async () => {
    const { useChatStore } = window.auditStoreModule;
    return useChatStore.getState().unreadById;
  })).toEqual({ 33: 7 });
  await page.evaluate(async () => {
    const liveModule = (path) => performance.getEntriesByType('resource').find((e) => new URL(e.name).pathname === path)?.name;
    const { useInternalChatNotifyStore } = await import(liveModule('/src/internal-chat/internalChatNotifyStore.js'));
    const { useHelpDeskNotifyStore } = await import(liveModule('/src/helpdesk/helpDeskNotifyStore.js'));
    useInternalChatNotifyStore.getState().hydrateFromConversations([{ id: 1, unreadCount: 2 }]);
    useHelpDeskNotifyStore.getState().hydrate({ unread_count: 3 });
  });
  await expect(page).toHaveTitle(/^\(12\)/); // Preserva as parcelas existentes de outros módulos.
  await emitServerEvent(page, 'connect');
  await expect(page).toHaveTitle(/^\(12\)/);
});
