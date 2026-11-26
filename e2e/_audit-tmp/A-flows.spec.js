// Lente A — fluxos do atendimento no desktop (1807x925): troca rápida A->B->A->C, envio logo após
// abrir, cliques na lista (a LISTA pula/pisca?), histórico antigo com mídia (next_cursor).
import { test, expect } from "@playwright/test";
import { setupRoutes, mkChat, mediaConversation, textConversation, imgUrl, armProbe, readProbe, analyse, short, captureConsole } from "./A-mock.mjs";

test.use({ viewport: { width: 1807, height: 925 } });
const now = Date.now();
const chats = [mkChat(11, "Cliente Fotos"), mkChat(14, "Grupo Loja", { is_group: true, telefone: "120363000000000014@g.us" }), mkChat(15, "Cliente Texto"), mkChat(17, "Cliente Historico"), mkChat(18, "Cliente Dezoito"), mkChat(19, "Cliente Dezenove")];
function historico(cid, url) {
  const all = Array.from({ length: 120 }, (_, i) => {
    const b = { id: cid * 1000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido", criado_em: new Date(now - (120 - i) * 600000).toISOString() };
    if (i % 6 === 1) return { ...b, tipo: "imagem", url: imgUrl(`h${cid}-${i}`, { w: i % 12 === 1 ? 1080 : 1600, h: i % 12 === 1 ? 1920 : 900, delay: 300 + (i % 5) * 200, b: "ok" }) };
    return { ...b, tipo: "texto", texto: `Hist ${i} ` + "conteudo ".repeat((i % 4) + 1), ...(i % 2 ? { usuario_nome: "Eva" } : {}) };
  });
  const cursor = url.searchParams.get("cursor");
  if (!cursor) return { mensagens: all.slice(60), next_cursor: all[60].criado_em, next_cursor_id: all[60].id };
  return { mensagens: all.slice(0, 60), next_cursor: null };
}
const convs = {
  11: (call) => mediaConversation(11, { variant: "ok", extra: call > 1 ? 1 : 0 }),
  14: () => mediaConversation(14, { variant: "ok", group: true }),
  15: () => textConversation(15),
  17: (call, url) => historico(17, url),
  18: () => textConversation(18, 40),
  19: () => textConversation(19, 12),
};

async function boot(page, browser, apiDelay = 400) {
  const logs = captureConsole(page);
  const r = await setupRoutes(page, { apiDelay, chats, convs, browser });
  await page.goto("/atendimento");
  await page.locator("button, [role=tab]").filter({ hasText: /^Todas/ }).first().click();
  await expect(page.locator(".chat-list-row").first()).toBeVisible();
  return { logs, ...r };
}
const open = (page, n) => page.locator(".chat-list-row").filter({ hasText: n }).first().click();

test("troca rápida A->B->A->C: nada da conversa errada aparece depois do último clique", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const { logs } = await boot(page, browser, (cid) => (cid === 11 ? 900 : cid === 14 ? 300 : 500));
  await open(page, "Cliente Texto"); await page.waitForTimeout(1500);
  await armProbe(page, 4500);
  await open(page, "Cliente Fotos"); await page.waitForTimeout(120);
  await open(page, "Grupo Loja"); await page.waitForTimeout(120);
  await open(page, "Cliente Fotos"); await page.waitForTimeout(120);
  await open(page, "Cliente Dezoito");
  const tClick = await page.evaluate(() => Math.round(performance.now() - window.__probeStart));
  await page.waitForTimeout(4500);
  const { samples } = await readProbe(page);
  const after = samples.filter((s) => s.t >= tClick && s.op > 0.02 && s.pos);
  const wrong = after.filter((s) => Object.keys(s.pos).some((k) => !k.startsWith("18")));
  const a = analyse(samples.filter((s) => s.t >= tClick));
  const hdr = await page.locator(".wa-header").innerText();
  console.log("SWITCH", JSON.stringify({ tClick, wrongFrames: wrong.length, firstWrong: wrong[0] && { t: wrong[0].t, ids: Object.keys(wrong[0].pos).slice(0, 5), op: wrong[0].op }, analysis: short(a), header: hdr.slice(0, 80) }));
  console.log("CONSOLE", JSON.stringify([...new Set(logs)]));
  expect.soft(wrong.length, "bolha de outra conversa visível depois do último clique").toBe(0);
  expect(hdr).toContain("Cliente Dezoito");
});

test("enviar texto logo depois de abrir (janela de deslize ativa)", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const { logs } = await boot(page, browser, 400);
  await open(page, "Cliente Texto"); await page.waitForTimeout(1500);
  await armProbe(page, 5000);
  await open(page, "Cliente Fotos");
  await expect(page.locator(".wa-messages")).not.toHaveClass(/wa-messages--opening/);
  await page.waitForTimeout(250);
  const tSend = await page.evaluate(() => Math.round(performance.now() - window.__probeStart));
  const box = page.locator(".wa-footer textarea, .wa-footer [contenteditable=true]").first();
  await box.click();
  await box.type("teste rápido");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(4600);
  const { samples } = await readProbe(page);
  const a = analyse(samples);
  const last = samples[samples.length - 1];
  console.log("SEND", JSON.stringify({ tSend, analysis: short(a), lastGap: last.lastGap, lastId: last.lastId, ftr: a.ftrChanges }));
  if (process.env.A_FRAMES) console.log("FRAMES", JSON.stringify(a.frames.slice(0, 60)));
  const lastText = await page.locator(".wa-messages [data-msg-id]").last().innerText();
  console.log("LAST BUBBLE", lastText.slice(0, 60));
  console.log("CONSOLE", JSON.stringify([...new Set(logs)]));
  expect.soft(lastText).toContain("teste rápido");
});

test("lista: cliques em cards não fazem a lista pular/reordenar/piscar", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const { logs } = await boot(page, browser, 400);
  await page.evaluate(() => {
    window.__list = []; const s = performance.now(); window.__listStart = s;
    window.__lt = []; window.__clicks = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ t: Math.round(e.startTime - s), d: Math.round(e.duration) }); }).observe({ type: "longtask", buffered: false }); } catch { /* */ }
    document.addEventListener("pointerdown", () => window.__clicks.push(Math.round(performance.now() - s)), true);
    const mc = new MessageChannel();
    const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    mc.port1.onmessage = () => {
      const rows = [...document.querySelectorAll(".chat-list-row")];
      const rec = { t: Math.round(performance.now() - s), rows: rows.map((r) => {
        const b = r.getBoundingClientRect();
        const name = (r.querySelector("[class*='name'], [class*='title']")?.textContent || r.textContent).trim().slice(0, 18);
        const sel = r.getAttribute("aria-selected") === "true" || /\b(is-active|active|selected|isSelected|is-selected)\b/.test(r.className);
        return `${name}|${Math.round(b.top)}|${Math.round(b.height)}|${sel ? 1 : 0}|${getComputedStyle(r).backgroundColor}`;
      }) };
      window.__list.push(rec);
      if (performance.now() - s < 9000) tick();
    };
    tick();
  });
  for (const n of ["Cliente Fotos", "Grupo Loja", "Cliente Texto", "Cliente Fotos"]) { await open(page, n); await page.waitForTimeout(1800); }
  const list = await page.evaluate(() => window.__list);
  const lt = await page.evaluate(() => ({ lt: window.__lt, clicks: window.__clicks }));
  // primeira pintura com o card clicado selecionado, por clique
  const clicked = ["Cliente Fotos", "Grupo Loja", "Cliente Texto", "Cliente Fotos"];
  const selLatency = lt.clicks.map((c, i) => {
    const alvo = clicked[i] || "";
    const f = list.find((x) => x.t >= c && x.rows.some((r) => { const [n, , , sel] = r.split("|"); return sel === "1" && n.includes(alvo.slice(0, 10)); }));
    return f ? f.t - c : null;
  });
  console.log("LONGTASKS", JSON.stringify({ ...lt, selLatencyMs: selLatency }));
  // posição/altura de cada card por frame; seleção por frame
  const moves = []; const selFlash = []; let prev = null;
  for (const f of list) {
    const map = Object.fromEntries(f.rows.map((r) => { const [n, top, h, sel, bg] = r.split("|"); return [n, { top: +top, h: +h, sel: +sel, bg }]; }));
    if (prev) {
      for (const n of Object.keys(map)) if (prev[n]) {
        if (Math.abs(map[n].top - prev[n].top) > 1 || Math.abs(map[n].h - prev[n].h) > 1) moves.push({ t: f.t, n, top: `${prev[n].top}->${map[n].top}`, h: `${prev[n].h}->${map[n].h}` });
      }
      const selNow = Object.keys(map).filter((n) => map[n].sel).join(",");
      const selPrev = Object.keys(prev).filter((n) => prev[n].sel).join(",");
      if (selNow !== selPrev) selFlash.push({ t: f.t, from: selPrev, to: selNow });
    }
    prev = map;
  }
  const order = [...new Set(list.map((f) => f.rows.map((r) => r.split("|")[0]).join(" / ")))];
  console.log("LIST", JSON.stringify({ frames: list.length, moves: moves.slice(0, 20), nMoves: moves.length, selChanges: selFlash, orders: order }));
  console.log("CONSOLE", JSON.stringify([...new Set(logs)]));
  expect.soft(moves, "cards da lista não podem mudar de posição/altura ao clicar").toEqual([]);
});

test("histórico antigo com fotos (next_cursor): âncora visível não deriva", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const { logs, calls } = await boot(page, browser, 400);
  await open(page, "Cliente Historico");
  await expect(page.locator(".wa-messages")).not.toHaveClass(/wa-messages--opening/);
  await page.waitForTimeout(2500);
  const msgs = page.locator(".wa-messages");
  // sobe com a roda até o topo (dispara o loadMore)
  await msgs.hover();
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, -600); await page.waitForTimeout(40); }
  await page.waitForTimeout(150);
  await armProbe(page, 3500);
  await page.waitForTimeout(3600);
  const { samples } = await readProbe(page);
  const a = analyse(samples, { startOnMask: false });
  console.log("HIST", JSON.stringify({ calls, analysis: short(a), frames: a.frames.slice(0, 15) }));
  console.log("CONSOLE", JSON.stringify([...new Set(logs)]));
  expect.soft(a.jumps, "histórico: nenhuma bolha visível pode saltar sem input").toEqual([]);
});
