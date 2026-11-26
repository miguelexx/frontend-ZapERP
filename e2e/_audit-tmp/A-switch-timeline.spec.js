// Lente A — linha do tempo visual de uma TROCA de conversa (desktop 1807x925): o que o atendente vê
// em cada frame entre o clique e a conversa nova pronta (conversa antiga congelada? branco? véu?).
import { test, expect } from "@playwright/test";
import { setupRoutes, mkChat, mediaConversation, textConversation } from "./A-mock.mjs";

test.use({ viewport: { width: 1807, height: 925 } });
const chats = [mkChat(11, "Cliente Fotos"), mkChat(15, "Cliente Texto")];
const convs = { 11: (c) => mediaConversation(11, { variant: "ok", extra: c > 1 ? 1 : 0 }), 15: () => textConversation(15) };

async function timeline(page, nome) {
  await page.evaluate(() => {
    window.__tl = []; const s = performance.now(); window.__tl0 = s; window.__lt2 = [];
    try { window.__ltObs?.disconnect(); window.__ltObs = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt2.push(Math.round(e.startTime - s) + "+" + Math.round(e.duration)); }); window.__ltObs.observe({ type: "longtask" }); } catch {}
    const mc = new MessageChannel();
    const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    mc.port1.onmessage = () => {
      const el = document.querySelector(".wa-messages");
      const root = el?.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
      const veil = document.querySelector(".wa-openVeil");
      const ids = el ? [...el.querySelectorAll("[data-msg-id]")].map((b) => b.getAttribute("data-msg-id").slice(0, 2)) : [];
      const sel = [...document.querySelectorAll(".chat-list-row")].find((r) => r.getAttribute("aria-selected") === "true" || /\b(is-active|active|selected|isSelected|is-selected)\b/.test(r.className));
      window.__tl.push([
        Math.round(performance.now() - s),
        (document.querySelector(".wa-header")?.innerText || "").split("\n").find((x) => /Cliente/.test(x)) || "-",
        root ? Math.round(Number(getComputedStyle(root).opacity) * 100) / 100 : "none",
        veil ? Math.round(Number(getComputedStyle(veil).opacity) * 100) / 100 : "none",
        [...new Set(ids)].join("") || "-",
        sel ? (sel.innerText.split("\n")[0] || "").slice(0, 14) : "-",
      ].join(" | "));
      if (performance.now() - s < 1200) tick();
    };
    tick();
  });
  await page.locator(".chat-list-row").filter({ hasText: nome }).first().click();
  await page.waitForTimeout(1300);
  const tl = await page.evaluate(() => window.__tl);
  const lt = await page.evaluate(() => window.__lt2);
  tl.push("LONGTASKS " + lt.join(" "));
  // compacta linhas iguais consecutivas
  const out = []; let last = null;
  for (const l of tl) { const k = l.split(" | ").slice(1).join(" | "); if (k !== last) out.push(l); last = k; }
  return out;
}

test("linha do tempo da troca de conversa", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await setupRoutes(page, { apiDelay: Number(process.env.A_API || 400), chats, convs, browser });
  await page.goto("/atendimento");
  // A_VEIL_FIX=1: hipótese — véu sem o atraso de 90ms (fade de 80ms), nada de quadro vazio
  if (process.env.A_VEIL_FIX === "1") await page.addStyleTag({ content: ".wa-openVeil.is-active{transition:opacity 80ms ease-out 0ms, visibility 0s linear 0s!important}" });
  await page.locator("button, [role=tab]").filter({ hasText: /^Todas/ }).first().click();
  await page.locator(".chat-list-row").filter({ hasText: "Cliente Texto" }).first().click();
  await page.waitForTimeout(1500);
  console.log("FIRST OPEN (t | header | thread op | veil op | ids | card selecionado)\n" + (await timeline(page, "Cliente Fotos")).join("\n"));
  await page.waitForTimeout(3000);
  await page.locator(".chat-list-row").filter({ hasText: "Cliente Texto" }).first().click();
  await page.waitForTimeout(1500);
  console.log("REOPEN CACHE\n" + (await timeline(page, "Cliente Fotos")).join("\n"));
  expect(true).toBe(true);
});
