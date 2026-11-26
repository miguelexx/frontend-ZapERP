// Lente A — o que empurra a lista de conversas 49px para baixo logo depois do 1.º clique?
import { test, expect } from "@playwright/test";
import { setupRoutes, mkChat, textConversation } from "./A-mock.mjs";

test.use({ viewport: { width: 1807, height: 925 } });
const chats = [mkChat(15, "Cliente Texto"), mkChat(18, "Cliente Dezoito")];
const convs = { 15: () => textConversation(15), 18: () => textConversation(18) };

test("lista: elemento que entra acima dos cards", async ({ page, browser }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    window.__ev = []; const s = performance.now();
    const snap = () => {
      const first = document.querySelector(".chat-list-row");
      const top = first ? Math.round(first.getBoundingClientRect().top) : null;
      const prev = window.__ev.length ? window.__ev[window.__ev.length - 1] : null;
      if (!prev || prev.top !== top) {
        // irmãos/ancestrais acima da lista: classe + altura
        let above = [];
        const list = first?.closest("[class*='chat-list'], aside, section");
        const col = first ? first.closest("aside, .chat-list, [class*='sidebar'], [class*='ChatList'], [class*='chatList']") : null;
        const root = col || document.body;
        for (const el of root.querySelectorAll("[role=alert], [class*='banner'], [class*='Banner'], [class*='aviso'], [class*='warn'], [class*='offline'], [class*='desconect']")) {
          const r = el.getBoundingClientRect();
          if (r.height > 0) above.push(`${String(el.className).slice(0, 60)}@${Math.round(r.top)}h${Math.round(r.height)}`);
        }
        window.__ev.push({ t: Math.round(performance.now() - s), top, above: above.slice(0, 6) });
      }
      requestAnimationFrame(snap);
    };
    requestAnimationFrame(snap);
  });
  await setupRoutes(page, { apiDelay: 300, chats, convs, browser });
  const reqs = [];
  page.on("request", (r) => { const u = r.url(); if (u.startsWith("http://localhost:5000")) reqs.push(`${Math.round(Date.now() % 100000)} ${r.method()} ${new URL(u).pathname}`); });
  await page.goto("/atendimento");
  await page.locator("button, [role=tab]").filter({ hasText: /^Todas/ }).first().click();
  await expect(page.locator(".chat-list-row").first()).toBeVisible();
  await page.waitForTimeout(2500);
  const tClick = await page.evaluate(() => Math.round(performance.now()));
  await page.locator(".chat-list-row").filter({ hasText: "Cliente Texto" }).click();
  await page.waitForTimeout(3000);
  const ev = await page.evaluate(() => window.__ev);
  console.log("EV", JSON.stringify(ev, null, 0));
  console.log("REQS", JSON.stringify(reqs.slice(0, 40)));
});
