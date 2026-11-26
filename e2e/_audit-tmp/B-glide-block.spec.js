// Lente B — foto/figurinha que muda de altura enquanto um deslize (glideThreadToBottom) corre:
// o snapIfStickBottom sai cedo (smoothScrollCancelRef) e a âncora do fim não absorve a troca.
// Também filma o envio logo após abrir (F6) com rastreio de quem escreve o scrollTop.
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { installMocks, armProbe, analyse, collect, captureConsole, mkChat, sleep, installScrollTrace } from "./B-helpers.js";
import { buildConversation, page as pageOf, mediaHandler } from "./B-fixtures.js";

const OUT = process.env.B_OUT || ".";
const chats = [mkChat(3, "Curta Fotos"), mkChat(2, "Grupo Vendas", { is_group: true, nome_grupo: "Grupo Vendas", telefone: "120363000000000001@g.us" })];
const CONV = { 3: buildConversation(3, 10), 2: buildConversation(2, 40, { group: true }) };

test("B glide bloqueia âncora: grupo + envio logo após abrir", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  test.setTimeout(120_000);
  const cons = captureConsole(page);
  await installScrollTrace(page);
  const posts = [];
  await installMocks(page, {
    chats,
    chatById: (cid, n, url) => { const pg = pageOf(CONV[cid], url, 16); return { delay: 400, payload: { conversa: { ...chats.find((c) => c.id === cid), mensagens_bloqueadas: false }, mensagens: pg.mensagens, next_cursor: pg.next_cursor, next_cursor_id: pg.next_cursor_id, tags: [] } }; },
    media: mediaHandler,
    onPost: async (p, req) => { const m = p.match(/^\/chats\/(\d+)\/mensagens$/); if (!m) return null; const body = req.postDataJSON() || {}; posts.push(body); await sleep(300);
      return { json: { mensagem: { id: 990001, conversa_id: Number(m[1]), texto: body.texto, client_temp_id: body.client_temp_id, direcao: "out", criado_em: new Date().toISOString(), status: "enviado" } } }; },
  });
  await page.goto("/atendimento");
  await expect(page.locator(".chat-list-row").first()).toBeVisible();

  // F6: abre, assim que revela envia
  await page.evaluate(() => { window.__sw = []; });
  await armProbe(page, 2800);
  await page.locator(".chat-list-row").filter({ hasText: "Curta Fotos" }).first().tap();
  await expect(page.locator(".wa-messages")).not.toHaveClass(/wa-messages--opening/);
  await page.locator(".wa-input").fill("Oi! Já te mando as fotos");
  await page.getByRole("button", { name: "Enviar mensagem" }).first().tap();
  await page.waitForTimeout(2600);
  let d = await collect(page); d.sw = await page.evaluate(() => window.__sw);
  const r6 = analyse(d.probe);
  console.log(`[B F6] bruscos=${JSON.stringify(r6.bruscos.map((j) => ({ t: j.t, d: j.d, dst: j.dst, dsh: j.dsh, grew: j.grew })))} reveals=${JSON.stringify(r6.reveals)} gaps=${JSON.stringify(r6.bottomGaps.slice(0, 3))} fh=${r6.fh}`);
  writeFileSync(`${OUT}/B-glide-f6.json`, JSON.stringify(d));
  await page.goBack(); await page.waitForTimeout(700);

  // Grupo
  await page.getByRole("button", { name: /^Todas/ }).first().tap().catch(() => {});
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__sw = []; });
  await armProbe(page, 4200);
  await page.locator(".chat-list-row").filter({ hasText: "Grupo Vendas" }).first().tap();
  await page.waitForTimeout(4300);
  d = await collect(page); d.sw = await page.evaluate(() => window.__sw);
  const rg = analyse(d.probe);
  console.log(`[B grupo] bruscos=${JSON.stringify(rg.bruscos.map((j) => ({ t: j.t, d: j.d, dst: j.dst, dsh: j.dsh, grew: j.grew })))} gaps=${JSON.stringify(rg.bottomGaps.slice(0, 3))}`);
  writeFileSync(`${OUT}/B-glide-grupo.json`, JSON.stringify(d));
  console.log(`[B console] ${JSON.stringify(cons.filter((c) => !/WebSocket|Failed to load resource/.test(c.text)).slice(0, 10))}`);
});
