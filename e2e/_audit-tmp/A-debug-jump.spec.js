// Lente A — diagnóstico do salto de ~227px ~1,2s após a revelação (Cliente Fotos, 1807x925).
// Filma TODAS as linhas da raiz virtual (data-index, altura, translateY) frame a frame após a
// pintura, para dizer qual linha mudou de altura e quem mexeu no scrollTop.
import { test, expect } from "@playwright/test";
import { setupRoutes, mkChat, mediaConversation, textConversation } from "./A-mock.mjs";

const chats = [mkChat(11, "Cliente Fotos"), mkChat(15, "Cliente Texto")];
const VARIANT = process.env.A_VARIANT || "ok";
const convs = {
  11: (call) => mediaConversation(11, { variant: VARIANT }),
  15: () => textConversation(15),
};
test.use({ viewport: { width: Number(process.env.A_W || 1807), height: Number(process.env.A_H || 925) } });

test("diagnóstico do salto tardio", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await setupRoutes(page, { apiDelay: Number(process.env.A_API || 400), chats, convs, browser });
  await page.goto("/atendimento");
  const tab = page.locator("button, [role=tab]").filter({ hasText: /^Todas/ }).first();
  await tab.click();
  await page.locator(".chat-list-row").filter({ hasText: "Cliente Texto" }).click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.__rows = [];
    const s = performance.now();
    // instrumenta escritas de scrollTop no scroller (quem mexe)
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
    window.__writes = [];
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) {
        if (this.classList && this.classList.contains("wa-messages")) {
          const before = desc.get.call(this);
          desc.set.call(this, v);
          const after = desc.get.call(this);
          if (Math.abs(after - before) > 20) {
            window.__writes.push({ t: Math.round(performance.now() - s), v: Math.round(v), before: Math.round(before), after: Math.round(after), sh: this.scrollHeight, stack: new Error().stack.split("\n").slice(2, 9).map((l) => l.trim().replace(/https?:\/\/[^/]+\/assets\//, "")).join(" | ") });
          }
          return;
        }
        desc.set.call(this, v);
      },
    });
    const mc = new MessageChannel();
    const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    const f = () => {
      const el = document.querySelector(".wa-messages");
      if (el) {
        const root = el.querySelector(".wa-messages-virtual-root");
        const rows = root ? [...root.children].map((c) => {
          const idx = c.getAttribute("data-index");
          const id = c.querySelector("[data-msg-id]")?.getAttribute("data-msg-id") || c.className.slice(0, 20);
          return `${idx}:${id}:${Math.round(c.getBoundingClientRect().height)}`;
        }) : [];
        const lp = el.querySelector(".wa-linkPrev");
        window.__rows.push({
          t: Math.round(performance.now() - s), st: Math.round(el.scrollTop), sh: el.scrollHeight, ch: el.clientHeight,
          op: root ? Number(getComputedStyle(root).opacity) : 0, glide: el.getAttribute("data-media-glide"),
          rootH: root ? Math.round(root.getBoundingClientRect().height) : 0,
          lp: lp ? `${Math.round(lp.getBoundingClientRect().height)}:${lp.style.getPropertyValue("--wa-media-ar")}:${lp.className}` : null,
          loaded: el.querySelectorAll("img.is-loaded").length, loading: el.querySelectorAll("img.is-loading").length,
          rows,
        });
      }
      if (performance.now() - s < 5000) tick();
    };
    mc.port1.onmessage = f;
    tick();
  });
  await page.locator(".chat-list-row").filter({ hasText: "Cliente Fotos" }).click();
  await page.waitForTimeout(5200);
  const data = await page.evaluate(() => ({ rows: window.__rows, writes: window.__writes }));
  // acha o frame com maior variação de scrollTop após a revelação
  let worst = null;
  for (let i = 1; i < data.rows.length; i++) {
    const a = data.rows[i - 1]; const b = data.rows[i];
    if (b.op < 0.99 || a.op < 0.99) continue;
    const d = Math.abs((b.st - a.st) - (b.sh - a.sh));
    if (!worst || d > worst.d) worst = { i, d, t: b.t };
  }
  console.log("WORST", JSON.stringify(worst));
  if (worst) {
    for (let k = Math.max(0, worst.i - 4); k <= Math.min(data.rows.length - 1, worst.i + 3); k++) {
      const r = data.rows[k];
      console.log("ROW", JSON.stringify({ t: r.t, st: r.st, sh: r.sh, ch: r.ch, op: r.op, glide: r.glide, rootH: r.rootH, lp: r.lp, loaded: r.loaded, loading: r.loading }));
      console.log("   ", r.rows.join(" "));
    }
  }
  for (const w of data.writes) console.log("WRITE", JSON.stringify(w));
  for (const r of data.rows.filter((x) => x.op > 0.5)) console.log("F", r.t, r.st, r.sh, r.lp, r.rows.filter((x) => !/:36$/.test(x)).join(" "));
  expect(true).toBe(true);
});
