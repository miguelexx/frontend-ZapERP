/**
 * Botão "Sincronizar todos os grupos" (Configurações → Clientes).
 * API toda mockada: nada sai para o canal nem para o banco.
 */
import { test, expect } from '@playwright/test';

const API = process.env.VITE_API_URL || 'http://localhost:5000';
const BOTAO = 'Sincronizar todos os grupos';

async function setup(page, respostaSync) {
  const state = { posts: 0 };
  await page.addInitScript(() => localStorage.setItem('zap_erp_auth', JSON.stringify({
    token: 'local-grupos-test',
    user: { id: 1, company_id: 7, perfil: 'admin', role: 'admin', nome: 'Teste' },
  })));
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path.startsWith('/socket.io')) return route.abort();
    if (path === '/integrations/whatsapp/groups/sync' && route.request().method() === 'POST') {
      state.posts++;
      const r = typeof respostaSync === 'function' ? respostaSync(state) : respostaSync;
      return route.fulfill({ status: r.status || 200, json: r.json });
    }
    if (path === '/clientes') return route.fulfill({
      headers: { 'x-total-count': '0', 'access-control-expose-headers': 'x-total-count' },
      json: [],
    });
    if (path === '/usuarios/me') return route.fulfill({ json: { id: 1, company_id: 7, perfil: 'admin', role: 'admin' } });
    if (path === '/usuarios/me/permissoes') return route.fulfill({ json: { permissoes: [] } });
    if (path === '/config/empresa') return route.fulfill({ json: { id: 7, nome: 'Teste' } });
    if (path === '/tags' || path === '/dashboard/departamentos') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/configuracoes?tab=clientes');
  return state;
}

test('o botão existe e só sincroniza quando clicado', async ({ page }) => {
  const state = await setup(page, {
    json: { ok: true, totalFetched: 30, inserted: 28, updated: 2, skipped: 0, numeros: 2, errors: [] },
  });

  const botao = page.getByRole('button', { name: BOTAO, exact: true });
  await expect(botao).toBeVisible();
  await expect(botao).toBeEnabled();
  expect(state.posts).toBe(0); // nada dispara sozinho ao abrir a tela

  await botao.click();
  await expect(page.getByRole('status').filter({ hasText: '30 grupo(s) encontrado(s) em 2 número(s)' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '28 novo(s), 2 atualizado(s)' })).toBeVisible();
  await expect(botao).toBeEnabled();
  expect(state.posts).toBe(1);
});

test('falha em um número aparece como aviso, sem virar sucesso mudo', async ({ page }) => {
  await setup(page, {
    json: {
      ok: true, totalFetched: 8, inserted: 8, updated: 0, skipped: 0, numeros: 1,
      errors: ['inst 26: canal fora do ar'],
    },
  });

  await page.getByRole('button', { name: BOTAO, exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '8 grupo(s) encontrado(s) em 1 número(s)' })).toBeVisible();
  await expect(page.getByText('inst 26: canal fora do ar', { exact: false })).toBeVisible();
});

test('erro do servidor mostra o motivo e libera o botão de novo', async ({ page }) => {
  await setup(page, {
    status: 429,
    json: { error: 'Muitas sincronizações de grupos. Aguarde 1 minuto.' },
  });

  const botao = page.getByRole('button', { name: BOTAO, exact: true });
  await botao.click();
  await expect(page.getByRole('status').filter({ hasText: 'Aguarde 1 minuto' })).toBeVisible();
  await expect(page.getByText('grupo(s) encontrado(s)', { exact: false })).toHaveCount(0);
  await expect(botao).toBeEnabled();
});
