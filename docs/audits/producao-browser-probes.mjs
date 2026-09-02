// Auditoria do artefato minificado. HTTP e identidades são fictícios; nenhum envio real.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import fs from 'node:fs';
const BASE = process.env.AUDIT_PRODUCTION_URL || 'http://127.0.0.1:5187';
const API = 'http://localhost:5000';
const probeFilter = process.argv[2] || '';
const A = { id: 1, company_id: 7, nome: 'Auditor A', perfil: 'admin', role: 'admin', departamento_ids: [1] };
const B = { ...A, id: 2, nome: 'Auditor B' };
const chat = (id, owner = 1) => ({ id, company_id: 7, contato_nome: `Cliente ${id}`, nome_contato_cache: `Cliente ${id}`,
  telefone: `551199999${id}`, atendente_id: owner, departamento_id: 1, status_atendimento: 'em_atendimento',
  status_atendimento_real: 'em_atendimento', mensagens_bloqueadas: false, unread_count: 0 });
const browser = await chromium.launch();
const results = [];
async function setup({ participants = false, role = 'admin' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, serviceWorkers: 'block' });
  await context.routeWebSocket('**/*', (ws) => ws.close());
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const initialUser = { ...A, perfil: role, role };
  const state = { user: initialUser, sends: [], reads: [], errors: [], participantsPending: false, release: null };
  page.on('pageerror', (err) => state.errors.push(err.message));
  await page.addInitScript((user) => {
    if (!sessionStorage.getItem('audit-session-seeded')) {
      sessionStorage.setItem('audit-session-seeded', '1');
      localStorage.setItem('zap_erp_auth', JSON.stringify({ token: 'audit-A', user }));
    }
  }, initialUser);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(BASE).origin) return route.continue();
    if (url.origin !== API) return route.abort();
    const path = url.pathname;
    const json = (value, extra = {}) => route.fulfill({ json: value, ...extra });
    if (path.startsWith('/socket.io')) return route.abort();
    if (path === '/usuarios/login') { state.user = B; return json({ token: 'audit-B', usuario: B }); }
    if (path === '/usuarios/me') return json(state.user);
    if (path === '/usuarios/me/permissoes') return json({ permissoes: [] });
    if (path === '/config/empresa') return json({ id: 7, nome: 'Empresa fictícia' });
    if (path === '/clientes') return json([{ id: 33, nome: 'Cliente 33', telefone: '5511999990033' }], { headers: { 'x-total-count': '1' } });
    if (path === '/chats/abrir-conversa') return json({ conversa: chat(33) });
    if (path === '/chats') return json([chat(11, participants ? 2 : state.user.id), chat(22, participants ? 2 : state.user.id)]);
    if (path === '/chats/counts') return json(url.searchParams.has('unread') ? { unread_by_id: {}, unread_total: 0 } : { todas: 2, minha_fila: 2 });
    const members = path.match(/^\/chats\/(\d+)\/atendentes$/);
    if (members) {
      if (!participants) return json([]);
      if (members[1] === '11') return json([{ usuario_id: 1, tipo: 'participante', ativo: true }]);
      state.participantsPending = true;
      await new Promise((resolve) => { state.release = resolve; });
      state.participantsPending = false;
      return json([]);
    }
    const thread = path.match(/^\/chats\/(\d+)$/);
    if (thread) {
      const id = Number(thread[1]);
      state.reads.push(id);
      return json({ conversa: chat(id, participants ? 2 : state.user.id), mensagens: [{ id: id * 100,
        conversa_id: id, direcao: 'in', tipo: 'texto', texto: `Histórico ${id}`, criado_em: new Date().toISOString() }], tags: [] });
    }
    const send = path.match(/^\/chats\/(\d+)\/mensagens$/);
    if (send && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      state.sends.push({ conversation: Number(send[1]), text: body.texto, session: route.request().headers().authorization === 'Bearer audit-B' ? 'B' : 'A' });
      return json({ id: 9000, conversa_id: Number(send[1]), texto: body.texto, direcao: 'out', tipo: 'texto',
        client_temp_id: body.client_temp_id, status: 'sent', criado_em: new Date().toISOString() });
    }
    if (['/tags', '/dashboard/departamentos', '/usuarios', '/ia/logs', '/ia/regras', '/dashboard/respostas-salvas'].includes(path)) return json([]);
    return json({});
  });
  return { page, context, state };
}
async function probe(name, fn, options) {
  if (probeFilter && !name.includes(probeFilter)) return;
  const env = await setup(options);
  try {
    const outcome = await fn(env);
    results.push({ name, ...outcome, runtimeErrors: env.state.errors });
  } catch (error) {
    results.push({ name, status: 'erro_na_execucao', error: error.message, runtimeErrors: env.state.errors });
  } finally {
    env.state.release?.();
    await env.page.screenshot({ path: `docs/audits/producao-2026-09-02-${name}.png` }).catch(() => {});
    await env.context.close();
    console.log(JSON.stringify(results.at(-1)));
  }
}
try {
  await probe('contraprova-emoji', async ({ page }) => {
    await page.goto(`${BASE}/atendimento`);
    await page.locator('.chat-list-row').filter({ hasText: 'Cliente 11' }).click();
    await expect(page.locator('.wa-input')).toBeVisible();
    await page.getByRole('button', { name: 'Emojis', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Selecionar emoji' })).toBeVisible();
    await page.getByRole('listitem', { name: 'Emoji 😀', exact: true }).click();
    await expect(page.locator('.wa-input')).toHaveValue(/😀/);
    return { status: 'aprovado' };
  });
  await probe('contraprova-ia', async ({ page }) => {
    await page.goto(`${BASE}/ia?tab=logs`);
    await expect(page.getByRole('heading', { name: '6. Logs do bot' })).toBeVisible();
    await page.getByRole('button', { name: 'Respostas automáticas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Respostas automáticas', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'IA (sugestões)', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'IA (sugestões inteligentes)', exact: true })).toBeVisible();
    return { status: 'aprovado' };
  });
  await probe('contraprova-atendente', async ({ page }) => {
    await page.goto(`${BASE}/configuracoes?tab=tags`);
    await expect(page).toHaveURL(/tab=respostas/);
    await expect(page.getByRole('heading', { name: 'Respostas salvas', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tags', exact: true })).toHaveCount(0);
    return { status: 'aprovado' };
  }, { role: 'atendente' });
  await probe('build-abertura-envio', async ({ page, state }) => {
    await page.goto(`${BASE}/atendimento`);
    await page.locator('.chat-list-row').filter({ hasText: 'Cliente 11' }).click();
    await expect(page.getByText('Histórico 11', { exact: true })).toBeVisible();
    await page.locator('.wa-input').fill('Envio normal de auditoria');
    await page.locator('.wa-input').press('Enter');
    await expect.poll(() => state.sends.length).toBe(1);
    await expect(page.getByText('Envio normal de auditoria', { exact: true })).toBeVisible();
    const scripts = await page.evaluate(() => performance.getEntriesByType('resource').filter((entry) => /\/assets\/.*\.js/.test(entry.name)).length);
    return { status: 'aprovado', scriptsMinificadosCarregados: scripts, sends: state.sends.length };
  });
  await probe('clientes-abertura', async ({ page, state }) => {
    await page.goto(`${BASE}/configuracoes?tab=clientes`);
    await page.getByRole('button', { name: 'Conversar', exact: true }).click();
    await expect(page).toHaveURL(/\/atendimento$/);
    // Dá tempo para carga lazy e qualquer tentativa legítima de recuperar o thread.
    await page.waitForTimeout(1800);
    const historyVisible = await page.getByText('Histórico 33', { exact: true }).isVisible();
    return { status: historyVisible ? 'aprovado' : 'falha_reproduzida', historyVisible, threadGetCount: state.reads.filter((id) => id === 33).length };
  });
  await probe('participantes-troca', async ({ page, state }) => {
    await page.goto(`${BASE}/atendimento`);
    await page.getByRole('button', { name: /^Todas/ }).click();
    await page.locator('.chat-list-row').filter({ hasText: 'Cliente 11' }).click();
    await expect(page.locator('.wa-input')).toBeEnabled();
    await page.locator('.chat-list-row').filter({ hasText: 'Cliente 22' }).click();
    await expect(page.getByText('Histórico 22', { exact: true })).toBeVisible();
    await expect.poll(() => state.participantsPending).toBe(true);
    const enabledBeforeMembership = await page.locator('.wa-input').isEnabled();
    state.release();
    await expect(page.locator('.wa-input')).toBeDisabled();
    return { status: enabledBeforeMembership ? 'falha_reproduzida' : 'aprovado', enabledBeforeMembership, disabledAfterMembership: true };
  }, { participants: true });
  await probe('outbox-troca-conta', async ({ page, state }) => {
    await page.goto(`${BASE}/atendimento`);
    await page.locator('.chat-list-row').filter({ hasText: 'Cliente 11' }).click();
    await expect(page.locator('.wa-input')).toBeEnabled();
    await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
    await page.locator('.wa-input').fill('Texto offline exclusivo do usuário A');
    await page.locator('.wa-input').press('Enter');
    const queued = () => page.evaluate(() => JSON.parse(localStorage.getItem('zap:outbox:text:v1') || '[]').length);
    await expect.poll(queued).toBe(1);
    await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    const remainingAfterLogout = await queued();
    await page.locator('input[type="email"]').fill('audit-b@local.test');
    await page.locator('input[type="password"]').fill('audit-only');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.locator('.chat-list-row').first()).toBeVisible();
    await page.locator('.chat-list-row').filter({ hasText: 'Cliente 22' }).click();
    await expect.poll(() => state.sends.length).toBeGreaterThan(0);
    return { status: state.sends.some((send) => send.session === 'B' && send.text.includes('usuário A')) ? 'falha_reproduzida' : 'aprovado',
      remainingAfterLogout, capturedMockSends: state.sends };
  });
} finally {
  fs.writeFileSync(`docs/audits/producao-2026-09-02-probes${probeFilter ? `-${probeFilter}` : ''}.json`, JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
  await browser.close();
}
