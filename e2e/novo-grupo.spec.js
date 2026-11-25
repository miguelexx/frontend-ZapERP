/**
 * Tela "Novo grupo" (/atendimento/novo-grupo).
 * API toda mockada: nada sai para o canal nem para o banco.
 *
 * Cobre os defeitos da auditoria de 24/11/2026:
 *  - empresa com 2+ números não escolhia o número (o backend criava um grupo só no banco);
 *  - quem o WhatsApp recusou aparecia como "adicionado";
 *  - erro ao agendar a fila depois do grupo criado virava "não foi possível criar o grupo".
 */
import { test, expect } from '@playwright/test';

const API = process.env.VITE_API_URL || 'http://localhost:5000';
const SHOTS = process.env.NOVO_GRUPO_SHOTS || '';

const CLIENTES = [
  { id: 1, nome: 'Ana Souza', telefone: '5534999911246' },
  { id: 2, nome: 'Bruno Lima', telefone: '5534988887777' },
  { id: 3, nome: 'Carla Mendes', telefone: '5511977776666' },
  { id: 4, nome: 'Sem Telefone', telefone: null },
];

const INSTANCIAS_2 = {
  instances: [
    { id: 11, nome: 'Vendas', provider: 'whapi', display_phone: '5534991110000' },
    { id: 12, nome: 'Suporte', provider: 'whapi', display_phone: '5534992220000' },
  ],
  has_multiple_whatsapp_instances: true,
  active_count: 2,
};
const INSTANCIA_1 = { instances: [INSTANCIAS_2.instances[0]], has_multiple_whatsapp_instances: false, active_count: 1 };

async function setup(page, { instancias = INSTANCIA_1, criar, fila, theme = 'light' } = {}) {
  const state = { criarBodies: [], filaBodies: [], convites: [] };
  await page.addInitScript((t) => {
    localStorage.setItem('zap_erp_auth', JSON.stringify({
      token: 'local-novo-grupo-test',
      user: { id: 1, company_id: 7, perfil: 'admin', role: 'admin', nome: 'Teste' },
    }));
    localStorage.setItem('theme', t);
  }, theme);
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path.startsWith('/socket.io')) return route.abort();
    if (path === '/clientes') {
      const palavra = new URL(req.url()).searchParams.get('palavra') || '';
      const rows = CLIENTES.filter((c) => !palavra || c.nome.toLowerCase().includes(palavra.toLowerCase()));
      return route.fulfill({
        headers: { 'x-total-count': String(rows.length), 'access-control-expose-headers': 'x-total-count' },
        json: rows,
      });
    }
    if (path === '/chats/whatsapp-instances') return route.fulfill({ json: instancias });
    if (path === '/chats/grupos' && req.method() === 'POST') {
      const body = req.postDataJSON();
      state.criarBodies.push(body);
      const r = typeof criar === 'function' ? criar(body, state) : criar;
      return route.fulfill({ status: r?.status || 200, json: r?.json || {} });
    }
    if (/^\/chats\/\d+\/participantes\/fila$/.test(path) && req.method() === 'POST') {
      state.filaBodies.push(req.postDataJSON());
      const r = fila || { json: { total: 0 } };
      return route.fulfill({ status: r.status || 200, json: r.json });
    }
    if (/^\/chats\/\d+\/participantes\/convidar$/.test(path)) {
      const body = req.postDataJSON();
      state.convites.push(body);
      return route.fulfill({ json: { ok: true, enviados: body.participantes.length, total: body.participantes.length } });
    }
    if (path === '/usuarios/me') return route.fulfill({ json: { id: 1, company_id: 7, perfil: 'admin', role: 'admin' } });
    if (path === '/usuarios/me/permissoes') return route.fulfill({ json: { permissoes: [] } });
    if (path === '/config/empresa') return route.fulfill({ json: { id: 7, nome: 'Teste' } });
    if (path === '/tags' || path === '/dashboard/departamentos' || path === '/chats') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/atendimento/novo-grupo');
  await expect(page.getByRole('heading', { name: 'Novo grupo' })).toBeVisible();
  return state;
}

async function escolher(page, nome) {
  await page.locator('label.cp-row', { hasText: nome }).click();
}

test('cria com os escolhidos e mostra quem precisa de convite', async ({ page }) => {
  const state = await setup(page, {
    criar: () => ({
      json: {
        id: 321, nome_grupo: 'Clientes VIP', tipo: 'grupo',
        participantes_resultado: { enviados: 2, adicionados: 1, nao_adicionados: ['5534988887777'], sem_whatsapp: [] },
      },
    }),
  });

  const criar = page.getByRole('button', { name: 'Criar grupo' });
  await expect(criar).toBeDisabled(); // sem nome nem participantes

  await page.getByLabel('Nome do grupo').fill('Clientes VIP');
  await escolher(page, 'Ana Souza');
  await escolher(page, 'Bruno Lima');
  // contato sem telefone não é selecionável
  await expect(page.locator('label.cp-row', { hasText: 'Sem Telefone' })).toHaveClass(/is-disabled/);
  await expect(page.locator('.cp-chip', { hasText: 'Ana Souza' })).toBeVisible();
  await expect(page.locator('.ng-badge')).toHaveText('2');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/novo-grupo-form.png`, fullPage: true });

  await criar.click();
  await expect(page.getByRole('heading', { name: 'Grupo criado' })).toBeVisible();
  expect(state.criarBodies[0]).toEqual({ nome: 'Clientes VIP', participantes: ['5534999911246', '5534988887777'] });
  await expect(page.locator('.ng-stat--ok b')).toHaveText('1');
  await expect(page.locator('.ng-people')).toContainText('Bruno Lima'); // nome, não só o número
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/novo-grupo-resultado.png`, fullPage: true });

  await page.getByRole('button', { name: 'Enviar convite do grupo' }).click();
  await expect(page.getByText('1 convite enviado')).toBeVisible();
  expect(state.convites[0]).toEqual({ participantes: ['5534988887777'] });
});

test('com 2 números exige escolher e manda o número escolhido', async ({ page }) => {
  const state = await setup(page, {
    instancias: INSTANCIAS_2,
    criar: () => ({ json: { id: 400, nome_grupo: 'Equipe', participantes_resultado: { enviados: 1, adicionados: 1, nao_adicionados: [], sem_whatsapp: [] } } }),
    theme: 'dark',
  });
  await page.getByLabel('Nome do grupo').fill('Equipe');
  await escolher(page, 'Carla Mendes');
  const criar = page.getByRole('button', { name: 'Criar grupo' });
  await expect(criar).toBeDisabled(); // falta o número
  await page.getByRole('radio', { name: /Suporte/ }).click();
  await expect(page.getByRole('radio', { name: /Suporte/ })).toHaveAttribute('aria-checked', 'true');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/novo-grupo-dark-2numeros.png`, fullPage: true });
  await criar.click();
  await expect(page.getByRole('heading', { name: 'Grupo criado' })).toBeVisible();
  expect(state.criarBodies[0].whatsapp_instance_id).toBe(12);
});

test('erro do servidor aparece na tela e libera o botão', async ({ page }) => {
  await setup(page, {
    criar: () => ({ status: 409, json: { codigo: 'WHATSAPP_DESCONECTADO', error: 'WhatsApp desconectado. Reconecte o número para criar o grupo.' } }),
  });
  await page.getByLabel('Nome do grupo').fill('Time');
  await escolher(page, 'Ana Souza');
  await page.getByRole('button', { name: 'Criar grupo' }).click();
  await expect(page.getByRole('alert')).toContainText('WhatsApp desconectado');
  await expect(page.getByRole('button', { name: 'Criar grupo' })).toBeEnabled();
});

test('grupo grande: falha da fila não vira "não foi possível criar"', async ({ page }) => {
  // 21+ participantes vêm da colagem em massa
  const numeros = Array.from({ length: 22 }, (_, i) => `55349${String(90000000 + i)}`);
  const state = await setup(page, {
    criar: () => ({ json: { id: 500, nome_grupo: 'Lista grande', participantes_resultado: { enviados: 1, adicionados: 1, nao_adicionados: [], sem_whatsapp: [] } } }),
    fila: { status: 500, json: { error: 'Erro ao enfileirar' } },
  });
  await page.getByLabel('Nome do grupo').fill('Lista grande');
  await page.getByText('Colar números em massa').click();
  await page.locator('.cp-textarea').fill(numeros.join('\n'));
  await expect(page.locator('.ng-note')).toContainText('aos poucos');
  await page.getByRole('button', { name: 'Criar grupo' }).click();
  await expect(page.getByRole('heading', { name: 'Grupo criado' })).toBeVisible();
  expect(state.criarBodies[0].participantes).toHaveLength(1);
  expect(state.filaBodies[0].participantes).toHaveLength(21);
  await expect(page.getByText('21 participantes ficaram de fora')).toBeVisible();
});

test('celular: rodapé e cartão cabem na tela', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await setup(page, {});
  await page.getByLabel('Nome do grupo').fill('Família');
  await escolher(page, 'Ana Souza');
  const sem = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(sem).toBe(true); // sem rolagem horizontal
  await expect(page.getByRole('button', { name: 'Criar grupo' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/novo-grupo-mobile.png`, fullPage: false });
});

test('trava por número: só mostra e usa os números liberados para a pessoa', async ({ page }) => {
  const state = await setup(page, {
    instancias: {
      instances: [
        { id: 11, nome: 'Vendas', provider: 'whapi', display_phone: '5534991110000', usuario_pode_usar: false },
        { id: 12, nome: 'Suporte', provider: 'whapi', display_phone: '5534992220000', usuario_pode_usar: true },
      ],
      has_multiple_whatsapp_instances: true,
      active_count: 2,
    },
    criar: () => ({ json: { id: 600, nome_grupo: 'Suporte VIP', participantes_resultado: { enviados: 1, adicionados: 1, nao_adicionados: [], sem_whatsapp: [] } } }),
  });
  // um só liberado → já vem escolhido e o seletor nem aparece
  await expect(page.getByRole('radio', { name: /Vendas/ })).toHaveCount(0);
  await page.getByLabel('Nome do grupo').fill('Suporte VIP');
  await escolher(page, 'Ana Souza');
  await page.getByRole('button', { name: 'Criar grupo' }).click();
  await expect(page.getByRole('heading', { name: 'Grupo criado' })).toBeVisible();
  expect(state.criarBodies[0].whatsapp_instance_id).toBe(12);
});

test('número único que não cria grupo (UltraMSG): avisa antes e não deixa enviar', async ({ page }) => {
  const state = await setup(page, {
    instancias: { instances: [{ id: 5, nome: 'Principal', provider: 'ultramsg' }], has_multiple_whatsapp_instances: false, active_count: 1 },
  });
  await expect(page.locator('.ng-note--warn')).toContainText('não permite criar grupos');
  await page.getByLabel('Nome do grupo').fill('Time');
  await escolher(page, 'Ana Souza');
  await expect(page.getByRole('button', { name: 'Criar grupo' })).toBeDisabled();
  expect(state.criarBodies).toHaveLength(0);
});

test('servidor pede o número (lista local velha): mostra a lista dele e reenvia com o id', async ({ page }) => {
  const state = await setup(page, {
    instancias: INSTANCIA_1,
    criar: (body) => (body.whatsapp_instance_id
      ? { json: { id: 700, nome_grupo: 'Time', participantes_resultado: { enviados: 1, adicionados: 1, nao_adicionados: [], sem_whatsapp: [] } } }
      : { status: 400, json: { codigo: 'SELECIONE_WHATSAPP_INSTANCE', error: 'Escolha por qual número WhatsApp o grupo será criado.', instances: INSTANCIAS_2.instances } }),
  });
  // o reload da lista local devolve 2 números agora
  await page.route('**/chats/whatsapp-instances', (route) => route.fulfill({ json: INSTANCIAS_2 }));
  await page.getByLabel('Nome do grupo').fill('Time');
  await escolher(page, 'Ana Souza');
  await page.getByRole('button', { name: 'Criar grupo' }).click();
  await expect(page.getByRole('alert')).toContainText('Escolha por qual número');
  await page.getByRole('radio', { name: /Vendas/ }).click();
  await page.getByRole('button', { name: 'Criar grupo' }).click();
  await expect(page.getByRole('heading', { name: 'Grupo criado' })).toBeVisible();
  expect(state.criarBodies.at(-1).whatsapp_instance_id).toBe(11);
});
