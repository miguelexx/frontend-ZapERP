// Verificação visual isolada: todas as APIs são simuladas; nenhum envio real.
// Inicie Vite com VITE_API_URL=http://localhost:5000 na porta 5181.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.STUDIO_BASE_URL || 'http://127.0.0.1:5181';
const out = new URL('../docs/audits/studio-preview/', import.meta.url);
await mkdir(out, { recursive: true });
const user = { id: 1, nome: 'Miguel', perfil: 'admin', role: 'admin', departamento_ids: [1], modulo_campanhas_ativo: true };
const names = ['Marina Costa', 'Rafael Almeida', 'Beatriz Santos', 'Lucas Ferreira', 'Ana Oliveira', 'Pedro Martins'];
const previews = ['Perfeito, muito obrigada pela atenção!', 'Podemos agendar uma demonstração?', 'Já enviei os documentos por aqui.', 'Gostaria de conhecer os planos.', 'Combinado! Aguardo seu retorno.', 'Obrigado, resolveu minha dúvida.'];
const chats = names.map((name, i) => ({ id: i + 1, contato_nome: name, nome_contato_cache: name, telefone: `551199999000${i + 1}`, status_atendimento: 'em_atendimento', status_atendimento_real: 'em_atendimento', atendente_id: 1, departamento_id: 1, departamento_nome: 'Suporte', unread_count: i === 1 ? 2 : 0, ultima_atividade: new Date(Date.now() - i * 120000).toISOString(), ultima_mensagem: { id: 10 + i, conversa_id: i + 1, texto: previews[i], direcao: 'in', criado_em: new Date().toISOString() } }));
const texts = [
  ['in', 'Bom dia! Tudo bem? 😊'],
  ['in', 'Quero organizar o atendimento da minha equipe. Vocês podem me ajudar?'],
  ['out', 'Bom dia, Marina! Tudo ótimo por aqui. Claro, vai ser um prazer ajudar.'],
  ['out', 'Com o ZapERP, sua equipe pode acompanhar as conversas, organizar os contatos e cuidar de cada cliente em um só lugar.'],
  ['in', 'É exatamente o que estamos procurando!'],
  ['in', 'Conseguimos separar os atendimentos por setor?'],
  ['out', 'Sim! Cada conversa pode ser encaminhada para o setor responsável. Assim, a pessoa certa dá continuidade ao atendimento.'],
  ['in', 'Perfeito, muito obrigada pela atenção!'],
];
const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 768, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      await page.addInitScript(({ user, theme }) => {
        localStorage.setItem('zap_erp_auth', JSON.stringify({ token: 'studio-local-fixture', user }));
        localStorage.setItem('theme', theme);
      }, { user, theme });
      await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin && !url.pathname.startsWith('/socket.io')) return route.continue();
        const path = url.pathname;
        if (path.startsWith('/socket.io')) return route.abort();
        let json = {};
        if (path === '/usuarios/me') json = user;
        if (path === '/usuarios/me/permissoes') json = { permissoes: [] };
        if (path === '/config/empresa') json = { id: 1, nome: 'ZapERP', modulo_campanhas_ativo: true };
        if (path === '/chats/whatsapp-instances') json = { instances: [], active_count: 0 };
        if (path === '/tags') json = [];
        if (path === '/dashboard/departamentos') json = [{ id: 1, nome: 'Suporte' }];
        if (path === '/chats/counts') json = { todas: 6, minha_fila: 6, em_atendimento: 6, hoje: 6 };
        if (path === '/chats') json = chats;
        const detail = path.match(/^\/chats\/(\d+)$/);
        if (detail) json = { conversa: { ...chats[Number(detail[1]) - 1], cliente_nome: names[Number(detail[1]) - 1], mensagens_bloqueadas: false }, mensagens: texts.map(([direcao, texto], i) => ({ id: 100 + i, conversa_id: Number(detail[1]), texto, direcao, criado_em: new Date(Date.now() - (8 - i) * 60000).toISOString(), status: 'lido' })), next_cursor: null, tags: [] };
        return route.fulfill({ json });
      });
      await page.goto(`${origin}/atendimento`);
      const row = page.locator('.chat-list-row').filter({ hasText: names[0] });
      await row.waitFor({ state: 'visible', timeout: 30000 });
      if (width > 640) {
        await page.getByRole('heading', { name: /Grandes relações/ }).waitFor();
        await page.screenshot({ path: new URL(`${theme}-${width}-inicio.png`, out).pathname.replace(/^\/(\w:)/, '$1') });
        await page.getByRole('button', { name: 'Buscar conversa', exact: true }).click();
        assert(await page.locator('.chat-list-search-input').evaluate(el => el === document.activeElement), 'Busca deve receber foco');
      } else {
        await page.screenshot({ path: new URL(`${theme}-${width}-lista.png`, out).pathname.replace(/^\/(\w:)/, '$1') });
      }
      await row.click();
      const input = page.locator('.wa-input');
      await input.waitFor({ state: 'visible' });
      await page.locator('.wa-bubble').first().waitFor();
      await page.waitForFunction(() => {
        const messages = document.querySelector('.wa-messages');
        return messages && !messages.classList.contains('wa-messages--opening');
      });
      await page.screenshot({ path: new URL(`${theme}-${width}-conversa.png`, out).pathname.replace(/^\/(\w:)/, '$1') });
      const metrics = await page.evaluate(() => {
        const footer = document.querySelector('.wa-footer').getBoundingClientRect();
        const input = document.querySelector('.wa-input').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth, footerBottom: footer.bottom, height: innerHeight, inputWidth: input.width, inputRight: input.right, viewport: innerWidth };
      });
      assert(!metrics.overflow, 'Sem overflow horizontal');
      assert(metrics.footerBottom <= metrics.height + 1, 'Composer dentro da viewport');
      assert(metrics.inputWidth > 60 && metrics.inputRight <= metrics.viewport + 1, 'Campo de texto utilizável');
      await input.fill('Mensagem de verificação');
      assert((await input.inputValue()).includes('verificação'));
      await page.getByRole('button', { name: 'Anexos e mais' }).click();
      await page.getByRole('menuitem', { name: 'Respostas salvas' }).waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      assert.deepEqual(errors, [], 'Sem erros de runtime');
      report.push({ theme, width, ...metrics, errors });
      console.log(`OK ${theme} ${width}px: render, foco, composer, menu, overflow`);
      await context.close();
    }
  }
  await writeFile(new URL('verification.json', out), JSON.stringify(report, null, 2));
} finally { await browser.close(); }
