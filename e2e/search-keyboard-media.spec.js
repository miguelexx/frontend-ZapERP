import { test, expect } from '@playwright/test';

const API = process.env.VITE_API_URL || 'http://localhost:5000';
const user = { id: 1, company_id: 7, nome: 'Auditoria', perfil: 'admin', role: 'admin', departamento_ids: [1] };
const mine = { id: 11, company_id: 7, contato_nome: 'Fila local', nome_contato_cache: 'Fila local',
  telefone: '5511999990011', atendente_id: 1, status_atendimento: 'em_atendimento', unread_count: 0 };
const found = (id) => ({ ...mine, id, contato_nome: `Encontrado ${id}`, nome_contato_cache: `Encontrado ${id}`,
  atendente_id: 2, status_atendimento: 'fechada', status_atendimento_real: 'fechada' });

async function install(page, { count = 12, abortMedia = false } = {}) {
  const requests = [];
  const messages = Array.from({ length: count }, (_, i) => ({ id: 1000 + i, conversa_id: 11, direcao: 'in',
    tipo: 'texto', texto: `Mensagem ${i}: ` + 'Conteúdo de teste para verificar a posição da leitura. '.repeat(3),
    criado_em: new Date(Date.now() - (count - i) * 60_000).toISOString(), status: 'read' }));
  await page.addInitScript((user) => localStorage.setItem('zap_erp_auth', JSON.stringify({ token: 'audit-flows', user })), user);
  await page.route(`${API}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.startsWith('/socket.io')) return route.abort();
    if (path === '/usuarios/me') return route.fulfill({ json: user });
    if (path === '/usuarios/me/permissoes') return route.fulfill({ json: { permissoes: [] } });
    if (path === '/config/empresa') return route.fulfill({ json: { id: 7, nome: 'Auditoria' } });
    if (path === '/chats/counts') return route.fulfill({ json: url.searchParams.has('unread')
      ? { unread_by_id: {}, unread_total: 0 } : { todas: 1, minha_fila: 1, em_atendimento: 1 } });
    if (path === '/chats') {
      requests.push(url);
      if (url.searchParams.get('palavra')) {
        const next = url.searchParams.has('cursor');
        return route.fulfill({ json: { conversas: [found(next ? 33 : 22)], total_count: 2,
          has_more: !next, next_cursor: next ? null : '2026-09-01T00:00:00Z', next_cursor_id: next ? null : 22 } });
      }
      return route.fulfill({ json: [mine] });
    }
    if (path === '/chats/11') return route.fulfill({ json: { conversa: mine, mensagens: messages, tags: [], next_cursor: null } });
    if (path === '/chats/11/arquivo' && abortMedia) return route.abort('internetdisconnected');
    if (path === '/tags' || path === '/dashboard/departamentos' || path.endsWith('/atendentes')) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  return requests;
}

async function liveModules(page) {
  await page.evaluate(async () => {
    const live = (path) => performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === path)?.name;
    window.auditConversa = (await import(live('/src/conversa/conversaStore.js'))).useConversaStore;
    window.auditChats = (await import(live('/src/chats/chatsStore.js'))).useChatStore;
  });
}

test('busca da Minha fila inclui finalizadas de outro atendente e preserva paginação', async ({ page }) => {
  const requests = await install(page);
  await page.goto('/atendimento');
  await page.getByRole('button', { name: /^Minha fila/ }).click();
  await expect(page.locator('.chat-list-row').filter({ hasText: 'Fila local' })).toBeVisible();
  await liveModules(page);
  await page.getByPlaceholder('Buscar por nome ou telefone').fill('Encontrado');
  await expect(page.locator('.chat-list-row').filter({ hasText: 'Encontrado 22' })).toBeVisible();
  await expect(page.locator('.chat-list-row').filter({ hasText: 'Fila local' })).toHaveCount(0);
  const more = page.getByRole('button', { name: 'Carregar mais conversas', exact: true });
  if (await more.isVisible()) await more.click();
  await expect(page.locator('.chat-list-row').filter({ hasText: 'Encontrado 33' })).toBeVisible();
  expect(requests.filter((url) => url.searchParams.get('palavra'))
    .every((url) => !url.searchParams.has('minha_fila'))).toBe(true);
  const before = requests.length;
  await page.evaluate(() => window.auditChats.getState().requestChatListResync({ force: true }));
  await expect.poll(() => requests.length).toBeGreaterThan(before);
  await expect(page.locator('.chat-list-row').filter({ hasText: 'Encontrado 22' })).toBeVisible();
  await expect(page.locator('.chat-list-row').filter({ hasText: 'Encontrado 33' })).toBeVisible();
  await page.getByPlaceholder('Buscar por nome ou telefone').fill('');
  await expect(page.locator('.chat-list-row').filter({ hasText: 'Fila local' })).toBeVisible();
  await expect(page.locator('.chat-list-row').filter({ hasText: 'Encontrado' })).toHaveCount(0);
  expect(requests.at(-1).searchParams.get('minha_fila')).toBe('1');
});

test('falha de mídia mostra aviso de F5 sem prometer envio automático e limpa após confirmação', async ({ page, isMobile }) => {
  await install(page, { count: 1, abortMedia: true });
  await page.goto('/atendimento');
  const card = page.locator('.chat-list-row').filter({ hasText: 'Fila local' });
  if (isMobile) await card.tap();
  else await card.click();
  await expect(page.locator('.wa-input')).toBeVisible();
  await liveModules(page);
  await page.locator('input[accept^=".pdf,.doc,.docx,image"]').setInputFiles({
    name: 'offline.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
  });
  const dialog = page.getByRole('dialog', { name: 'Revisar arquivo antes de enviar' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmar envio', exact: true }).click();
  const notice = page.locator('.wa-local-media-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Recarregar (F5)');
  await expect(notice).not.toContainText('automaticamente');
  // Retira o toast para provar que o aviso continua na bolha.
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find((e) => new URL(e.name).pathname === '/src/notifications/notificationStore.js').name;
    (await import(url)).useNotificationStore.getState().clearToast();
  });
  await expect(notice).toBeVisible();
  await page.evaluate(() => {
    const s = window.auditConversa.getState();
    const pending = s.mensagens.find((m) => m.tempId && m.tipo === 'arquivo');
    s.reconciliarMensagem(pending.tempId, { id: 9000, conversa_id: 11, client_temp_id: pending.tempId,
      tipo: 'arquivo', nome_arquivo: 'offline.pdf', direcao: 'out', status: 'sent', status_mensagem: 'sent',
      url: '/uploads/offline.pdf', criado_em: pending.criado_em });
  });
  await expect(notice).toHaveCount(0);
});

for (const count of [12, 60]) {
  test(`teclado: fechar preserva acompanhamento e leitura do histórico (${count} mensagens)`, async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('mobile'), 'Cenário mobile com visualViewport controlado; não substitui celular físico.');
    await install(page, { count });
    await page.addInitScript(() => {
      const viewport = new EventTarget();
      Object.assign(viewport, { height: window.innerHeight, width: window.innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1, pageTop: 0, pageLeft: 0 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
      window.auditKeyboard = (open) => { viewport.height = window.innerHeight - (open ? 300 : 0); viewport.dispatchEvent(new Event('resize')); };
    });
    await page.goto('/atendimento');
    await page.locator('.chat-list-row').filter({ hasText: 'Fila local' }).tap();
    await expect(page.locator('.wa-input')).toBeVisible();
    await liveModules(page);
    const distance = () => page.locator('.wa-messages').evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
    await expect.poll(distance).toBeLessThan(30);
    await page.locator('.wa-input').focus();
    await page.evaluate(() => window.auditKeyboard(true));
    await expect(page.locator('.wa-shell')).toHaveClass(/wa-keyboard-visible/);
    await expect.poll(distance).toBeLessThan(30);
    await page.locator('.wa-input').blur();
    await page.evaluate(() => window.auditKeyboard(false));
    await expect(page.locator('.wa-shell')).not.toHaveClass(/wa-keyboard-visible/);
    await page.evaluate(() => window.auditConversa.getState().anexarMensagem({ id: 5001, conversa_id: 11,
      direcao: 'in', tipo: 'texto', texto: 'Chegou depois de fechar o teclado. '.repeat(16), criado_em: new Date().toISOString() }));
    await expect.poll(distance).toBeLessThan(30);
    // Um gesto deliberado para ler histórico deve continuar prevalecendo sobre o teclado.
    await page.locator('.wa-messages').evaluate((el) => {
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true }));
      el.scrollTop = Math.max(150, el.scrollTop - 700);
      el.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(distance).toBeGreaterThan(200);
    await page.locator('.wa-input').focus();
    await page.evaluate(() => window.auditKeyboard(true));
    await expect(page.locator('.wa-shell')).toHaveClass(/wa-keyboard-visible/);
    await page.locator('.wa-input').blur();
    await page.evaluate(() => window.auditKeyboard(false));
    await expect(page.locator('.wa-shell')).not.toHaveClass(/wa-keyboard-visible/);
    await page.evaluate(() => window.auditConversa.getState().anexarMensagem({ id: 5002, conversa_id: 11,
      direcao: 'in', tipo: 'texto', texto: 'Mensagem enquanto leio o histórico.', criado_em: new Date().toISOString() }));
    await expect.poll(distance).toBeGreaterThan(200);
  });
}
