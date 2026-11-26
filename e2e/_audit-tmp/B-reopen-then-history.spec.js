// Lente B — reabre pelo cache (lista virtual montada no mesmo commit do scroller: margem fica 0)
// e então carrega MAIS histórico: o lote antigo entra no lugar certo?
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { installMocks, armProbe, collect, mkChat, sleep } from "./B-helpers.js";
import { buildConversation, page as pageOf, mediaHandler } from "./B-fixtures.js";
const OUT = process.env.B_OUT || ".";
const chats = [mkChat(1, "Midia Pesada"), mkChat(3, "Curta Fotos")];
const BASE = { 1: buildConversation(1, 230), 3: buildConversation(3, 10) };
test("B reabrir (margem 0) e carregar mais histórico", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  test.setTimeout(150_000);
  const mocks = await installMocks(page, { chats, media: mediaHandler,
    chatById: (cid, n, url) => { const pg = pageOf(BASE[cid], url, 16); return { delay: url.searchParams.get("cursor") ? 350 : 400, payload: { conversa: { ...chats.find((c) => c.id === cid), mensagens_bloqueadas: false }, mensagens: pg.mensagens, next_cursor: pg.next_cursor, next_cursor_id: pg.next_cursor_id, tags: [] } }; } });
  await page.goto("/atendimento");
  await expect(page.locator(".chat-list-row").first()).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (x, y0, y1, steps = 10) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= steps; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] }); await sleep(12); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const row = (n) => page.locator(".chat-list-row").filter({ hasText: n }).first();
  await row("Midia Pesada").tap(); await page.waitForTimeout(3000);
  let box = await page.locator(".wa-messages").boundingBox();
  for (let k = 0; k < 9; k++) { await swipe(box.x + box.width / 2, box.y + 120, box.y + box.height - 60); await page.waitForTimeout(500); if (mocks.log.filter((l) => l.cursor).length >= 1) break; }
  await page.waitForTimeout(1500);
  await page.goBack(); await page.waitForTimeout(700);
  await row("Curta Fotos").tap(); await page.waitForTimeout(1200); await page.goBack(); await page.waitForTimeout(700);
  await row("Midia Pesada").tap(); await page.waitForTimeout(3000);
  const kind = await page.evaluate(() => (document.querySelector(".wa-messages-virtual-root") ? "virtual" : "static"));
  box = await page.locator(".wa-messages").boundingBox();
  // sobe até o 2.º lote de histórico; mede a bolha-âncora em cada frame
  await armProbe(page, 30000);
  const before = mocks.log.filter((l) => l.cursor).length;
  for (let k = 0; k < 40; k++) { await swipe(box.x + box.width / 2, box.y + 120, box.y + box.height - 60); await page.waitForTimeout(450); if (mocks.log.filter((l) => l.cursor).length > before) break; }
  await page.waitForTimeout(1800);
  const d = await collect(page);
  const P = d.probe.filter((s) => "op" in s);
  const odd = [];
  for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i]; const ds = []; for (const k of Object.keys(b.pos)) if (k in a.pos) ds.push(b.pos[k] - a.pos[k]); if (!ds.length) continue; const scrollD = -(b.st - a.st); const off = Math.max(...ds.map((x) => Math.abs(x - scrollD))); const spread = Math.max(...ds) - Math.min(...ds); if (off > 2 || spread > 2) odd.push({ t: b.t, off, spread, dst: b.st - a.st, dsh: b.sh - a.sh, ds: ds.slice(0, 5), n: b.n }); }
  const blank = P.filter((s) => s.op > 0.5 && s.n === 0 && s.na > 0).map((s) => s.t);
  console.log(`[B reabrir-historico] kind=${kind} GETs=${JSON.stringify(mocks.log.filter((l) => l.cid === 1))}`);
  console.log(`[B reabrir-historico] movimentos-sem-scroll=${JSON.stringify(odd.slice(0, 12))} framesVazios=${JSON.stringify(blank.slice(0, 8))}`);
  writeFileSync(`${OUT}/B-reopen-then-history.json`, JSON.stringify({ log: mocks.log, odd, probe: d.probe }));
});
