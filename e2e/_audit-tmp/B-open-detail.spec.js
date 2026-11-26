// Lente B — o que existe na thread e no rodapé nos ~300ms antes da máscara (1.ª abertura, celular).
import { test, expect } from "@playwright/test";
import { installMocks, mkChat, sleep } from "./B-helpers.js";
import { buildConversation, page as pageOf, mediaHandler } from "./B-fixtures.js";
const chats = [mkChat(3, "Curta Fotos"), mkChat(1, "Midia Pesada")];
const CONV = { 3: buildConversation(3, 10), 1: buildConversation(1, 80) };
test("B detalhe da abertura: raiz, rodapé, cabeçalho por frame", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  await installMocks(page, { chats, media: mediaHandler,
    chatById: (cid, n, url) => { const pg = pageOf(CONV[cid], url, 16); return { delay: 400, payload: { conversa: { ...chats.find((c) => c.id === cid), mensagens_bloqueadas: false }, mensagens: pg.mensagens, next_cursor: pg.next_cursor, next_cursor_id: pg.next_cursor_id, tags: [] } }; } });
  await page.goto("/atendimento");
  await expect(page.locator(".chat-list-row").first()).toBeVisible();
  for (const nome of ["Curta Fotos", "Midia Pesada"]) {
    await page.evaluate(() => {
      window.__fr = []; const s = performance.now(); const mc = new MessageChannel();
      const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
      mc.port1.onmessage = () => {
        const el = document.querySelector(".wa-messages");
        const root = el && el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
        const foot = document.querySelector(".wa-footer");
        const hdr = document.querySelector(".wa-header");
        window.__fr.push({ t: Math.round(performance.now() - s),
          kids: el ? [...el.children].map((c) => `${(c.className || c.tagName).toString().split(" ")[0]}:${Math.round(c.getBoundingClientRect().height)}:${Number(getComputedStyle(c).opacity).toFixed(2)}`).join(",") : null,
          rootRows: root ? root.children.length : null, rootText: root ? root.innerText.slice(0, 60).replace(/\n/g, " | ") : null,
          foot: foot ? `${Math.round(foot.getBoundingClientRect().height)}:${[...foot.querySelectorAll("*")].filter((x) => x.children.length === 0 && x.innerText && x.getBoundingClientRect().height > 0).map((x) => x.innerText.trim()).filter(Boolean).slice(0, 4).join("/")}:${(foot.querySelector("textarea")?.placeholder || "").slice(0, 30)}:ta=${Math.round(foot.querySelector("textarea")?.getBoundingClientRect().height || 0)}` : null,
          hdr: hdr ? `${Math.round(hdr.getBoundingClientRect().height)}:${hdr.innerText.replace(/\n/g, "/").slice(0, 70)}` : null });
        if (performance.now() - s < 1300) tick();
      };
      tick();
    });
    await page.locator(".chat-list-row").filter({ hasText: nome }).first().tap();
    await page.waitForTimeout(1400);
    const fr = await page.evaluate(() => window.__fr);
    let prev = "";
    for (const f of fr) { const k = JSON.stringify({ ...f, t: 0 }); if (k !== prev) console.log(`[B ${nome}]`, JSON.stringify(f)); prev = k; }
    await page.goBack(); await page.waitForTimeout(700);
  }
});
