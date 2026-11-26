// Lente B — cenário real do celular: abre a conversa, sobe e carrega o histórico (100 por página
// -> lista vira VIRTUAL), volta à lista, chega 1 mensagem nova do cliente, reabre (cache).
// Mede: salto na reabertura (margem do virtualizer tardia), topo da conversa aparecendo,
// e o próprio carregamento do histórico (troca estática->virtual).
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { installMocks, armProbe, analyse, collect, captureConsole, mkChat, sleep, throttleCpu } from "./B-helpers.js";
import { buildConversation, page as pageOf, mediaHandler } from "./B-fixtures.js";

const OUT = process.env.B_OUT || ".";
const CPU = Number(process.env.B_CPU || 1);
const chats = [mkChat(1, "Midia Pesada"), mkChat(3, "Curta Fotos")];
const BASE = { 1: buildConversation(1, 80), 3: buildConversation(3, 10) };
let novas = 0;
function convOf(cid) {
  const l = BASE[cid].slice();
  if (cid === 1) for (let i = 0; i < novas; i++) l.push({ id: 19000 + i, conversa_id: 1, direcao: "in", status: "lido", criado_em: new Date(Date.UTC(2026, 10, 25, 9, 40 + i)).toISOString(), tipo: "texto", texto: `Oi, alguma novidade? (${i + 1})` });
  return l;
}

test("B reabrir depois de carregar histórico (celular)", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  test.setTimeout(150_000);
  const cons = captureConsole(page);
  const mocks = await installMocks(page, {
    chats, media: mediaHandler,
    chatById: (cid, n, url) => { const pg = pageOf(convOf(cid), url, 16); return { delay: url.searchParams.get("cursor") ? 350 : 400, payload: { conversa: { ...chats.find((c) => c.id === cid), mensagens_bloqueadas: false }, mensagens: pg.mensagens, next_cursor: pg.next_cursor, next_cursor_id: pg.next_cursor_id, tags: [] } }; },
  });
  await page.goto("/atendimento");
  await throttleCpu(page, CPU);
  await expect(page.locator(".chat-list-row").first()).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (x, y0, y1, steps = 10) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= steps; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] }); await sleep(12); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await page.locator(".chat-list-row").filter({ hasText: "Midia Pesada" }).first().tap();
  await page.waitForTimeout(3200);
  const box = await page.locator(".wa-messages").boundingBox();
  for (let k = 0; k < 9; k++) { await swipe(box.x + box.width / 2, box.y + 120, box.y + box.height - 60); await page.waitForTimeout(500); if (mocks.log.some((l) => l.cursor)) break; }
  await page.waitForTimeout(1500);
  const kindAfterHist = await page.evaluate(() => (document.querySelector(".wa-messages-virtual-root") ? "virtual" : "static"));
  await page.goBack(); await page.waitForTimeout(700);

  const out = { kindAfterHist, runs: [] };
  for (const extra of [0, 1]) {
    novas += extra;
    // outra conversa no meio (como o atendente faz)
    await page.locator(".chat-list-row").filter({ hasText: "Curta Fotos" }).first().tap(); await page.waitForTimeout(1200); await page.goBack(); await page.waitForTimeout(700);
    await armProbe(page, 3000);
    await page.locator(".chat-list-row").filter({ hasText: "Midia Pesada" }).first().tap();
    await page.waitForTimeout(3100);
    const d = await collect(page);
    const r = analyse(d.probe);
    // frames revelados com a conversa no TOPO (scrollTop pequeno) = início do histórico à vista
    const topFrames = d.probe.filter((s) => "op" in s && s.op > 0.02 && s.st < 600 && s.sh > 2000).map((s) => ({ t: s.t, op: s.op, st: s.st }));
    const emptyFrames = d.probe.filter((s) => "op" in s && s.op > 0.3 && s.na > 0 && s.n === 0).map((s) => s.t);
    const ovfSeq = []; let lo = null; for (const s of d.probe) if ("ovf" in s && s.ovf !== lo) { ovfSeq.push([s.t, s.ovf, s.op]); lo = s.ovf; }
    const line = { novas: extra, bruscos: r.bruscos.map((j) => ({ t: j.t, d: j.d, dt: j.dt, op: j.op, dst: j.dst, dsh: j.dsh, grew: j.grew })), reveals: r.reveals, bottomGaps: r.bottomGaps.slice(0, 3), kinds: r.kinds, topFrames: topFrames.slice(0, 5), emptyFrames: emptyFrames.slice(0, 5), ovfSeq: ovfSeq.slice(0, 8) };
    console.log(`[B reabrir-pos-historico cpu${CPU}] ${JSON.stringify(line)}`);
    out.runs.push({ line, probe: d.probe });
    await page.goBack(); await page.waitForTimeout(700);
  }
  writeFileSync(`${OUT}/B-reopen-after-history-cpu${CPU}.json`, JSON.stringify(out));
  console.log(`[B kindAfterHist] ${kindAfterHist} GETs=${JSON.stringify(mocks.log)}`);
  console.log(`[B console] ${JSON.stringify(cons.filter((c) => !/WebSocket|Failed to load resource/.test(c.text)).slice(0, 10))}`);
});
