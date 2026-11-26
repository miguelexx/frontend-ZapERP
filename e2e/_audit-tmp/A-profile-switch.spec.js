// Lente A — perfil de CPU (CDP) do clique que REABRE uma conversa de mídia pelo cache.
// Use com o build NÃO minificado (vite build --minify false) para nomes legíveis.
import { test } from "@playwright/test";
import { setupRoutes, mkChat, mediaConversation, textConversation } from "./A-mock.mjs";

test.use({ viewport: { width: 1807, height: 925 } });
const chats = [mkChat(11, "Cliente Fotos"), mkChat(15, "Cliente Texto")];
const convs = { 11: (c) => mediaConversation(11, { variant: "ok", extra: c > 1 ? 1 : 0 }), 15: () => textConversation(15) };

test("perfil da reabertura pelo cache", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await setupRoutes(page, { apiDelay: 400, chats, convs, browser });
  await page.goto("/atendimento");
  await page.locator("button, [role=tab]").filter({ hasText: /^Todas/ }).first().click();
  const open = (n) => page.locator(".chat-list-row").filter({ hasText: n }).first().click();
  await open("Cliente Fotos"); await page.waitForTimeout(3500);
  await open("Cliente Texto"); await page.waitForTimeout(1500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");
  await open("Cliente Fotos");
  await page.waitForTimeout(700);
  const { profile } = await cdp.send("Profiler.stop");
  // self time por função (ms) e tempo total por função "de app" (inclusive)
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const dt = profile.timeDeltas; const self = new Map(); const incl = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i]; const ms = (dt[i] || 0) / 1000;
    const n = byId.get(id); const k = `${n.callFrame.functionName || "(anon)"} ${String(n.callFrame.url).split("/").pop()}:${n.callFrame.lineNumber}`;
    self.set(k, (self.get(k) || 0) + ms);
    const seen = new Set(); let cur = id;
    while (cur != null) { const nn = byId.get(cur); const kk = `${nn.callFrame.functionName || "(anon)"} ${String(nn.callFrame.url).split("/").pop()}`; if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) || 0) + ms); } cur = parent.get(cur); }
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(1)}ms ${k}`);
  console.log("SELF\n" + top(self, 25).join("\n"));
  console.log("INCL\n" + top(incl, 45).join("\n"));
});
