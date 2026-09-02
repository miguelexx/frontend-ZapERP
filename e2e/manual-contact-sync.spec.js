import { test, expect } from '@playwright/test';

const API = process.env.VITE_API_URL || 'http://localhost:5000';
async function setup(page) {
  const state = { posts: 0, phase: 'idle', reads: 0 };
  await page.addInitScript(() => localStorage.setItem('zap_erp_auth', JSON.stringify({
    token: 'local-contact-test', user: { id: 1, company_id: 7, perfil: 'admin', role: 'admin', nome: 'Teste' },
  })));
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path.startsWith('/socket.io')) return route.abort();
    if (path === '/chats/sincronizar-contatos' && route.request().method() === 'POST') {
      state.posts++;
      state.phase = 'running';
      return route.fulfill({ status: 202, json: { ok: true, running: true, queued: true, job_id: 10, message: 'Sincronização iniciada.' } });
    }
    if (path === '/chats/sincronizar-contatos/status') {
      state.reads++;
      return route.fulfill({ json: state.phase === 'idle' ? { ok: true, running: false, status: 'idle' } : {
        ok: state.phase !== 'failed', running: state.phase === 'running', job_id: 10, tipo: 'sync_contatos',
        status: state.phase === 'failed' ? 'dead_letter' : state.phase,
        total_agenda: 2, verificados: state.phase === 'running' ? 1 : 2,
        total_contatos: 2, criados: 2, atualizados: 0, fotos_atualizadas: 1,
        error: state.phase === 'failed' ? 'A UltraMSG recusou a consulta de contatos.' : null,
      } });
    }
    if (path === '/clientes') return route.fulfill({
      headers: { 'x-total-count': state.phase === 'idle' ? '0' : '2', 'access-control-expose-headers': 'x-total-count' },
      json: state.phase === 'idle' ? [] : [
        { id: 1, nome: 'Contato com Foto', telefone: '5511990000001', foto_perfil: 'https://photo.test/avatar.png' },
        { id: 2, nome: 'Contato sem Foto', telefone: '5511990000002' },
      ],
    });
    if (path === '/usuarios/me') return route.fulfill({ json: { id: 1, company_id: 7, perfil: 'admin', role: 'admin' } });
    if (path === '/usuarios/me/permissoes') return route.fulfill({ json: { permissoes: [] } });
    if (path === '/config/empresa') return route.fulfill({ json: { id: 7, nome: 'Teste', zapi_auto_sync_contatos: true } });
    if (path === '/tags' || path === '/dashboard/departamentos') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.route('https://photo.test/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="green"/></svg>' }));
  await page.goto('/configuracoes?tab=clientes');
  await expect(page.getByRole('button', { name: 'Sincronizar contatos do celular', exact: true })).toBeVisible();
  return state;
}

test('só inicia por clique; mostra nomes/foto e progresso sem socket, inclusive após F5', async ({ page }) => {
  const state = await setup(page);
  expect(state.posts).toBe(0);
  await expect(page.getByText('Auto-sync ao conectar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sincronizar contatos do celular', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sincronizando…', exact: true })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Sincronizando: 1 de 2' })).toBeVisible();
  await expect(page.getByText('Contato com Foto', { exact: true })).toBeVisible();
  await expect(page.locator('img[src="https://photo.test/avatar.png"]')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sincronizando…', exact: true })).toBeDisabled();
  expect(state.posts).toBe(1);
  state.phase = 'completed';
  await expect(page.getByRole('status').filter({ hasText: 'Sincronização concluída: 2 contatos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sincronizar contatos do celular', exact: true })).toBeEnabled();
  expect(state.posts).toBe(1);
});

test('falha da fila aparece na página sem mensagem falsa de conclusão', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Sincronizar contatos do celular', exact: true }).click();
  state.phase = 'failed';
  await expect(page.getByRole('status').filter({ hasText: 'A UltraMSG recusou' })).toBeVisible();
  await expect(page.getByText('Sincronização concluída:', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sincronizar contatos do celular', exact: true })).toBeEnabled();
});
