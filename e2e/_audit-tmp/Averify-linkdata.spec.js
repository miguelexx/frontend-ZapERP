// Verificador da lente A — o cartão de link salta também no FORMATO DE PRODUÇÃO?
// O Whapi entrega `link_preview.preview` como data URI (data:image/jpeg;base64,…, ver
// backend/tests/whapiInboundProduto.test.js). O mock da lente A usava URL http com 900–1200ms.
// Aqui: mesma conversa (22 textos + cartão + "ok"), cartão com data URI de vários tamanhos,
// e um controle http com atraso (o caso da lente A).
import { test, expect } from "@playwright/test";
import { setupRoutes, mkChat, textConversation, imgUrl, makePng, API, armProbe, readProbe, analyse, short } from "./A-mock.mjs";

const now = Date.now();
const iso = (min) => new Date(now - 3600000 + min * 60000).toISOString();
const dataUri = (w, h) => `data:image/png;base64,${makePng(w, h, { hue: w % 97 }).toString("base64")}`;
const lp = (preview, extra = "") => [{
  tipo: "texto", direcao: "out", texto: `Olha https://www.instagram.com/p/abc${extra}`,
  reply_meta: { link_preview: { url: `https://www.instagram.com/p/abc${extra}`, title: "Imoveis", description: "VENDA casa 3 quartos", preview } },
}];
const KINDS = {
  dataSquare400: () => lp(dataUri(400, 400), "1"),
  dataSmall140: () => lp(dataUri(140, 140), "2"),
  dataOg600: () => lp(dataUri(600, 314), "3"),
  dataPortrait300x500: () => lp(dataUri(300, 500), "4"),
  httpSquare900ms: (P) => { imgUrl(`${P}-og`, { w: 1200, h: 1200, delay: 900, b: "ok" }); return lp(`${API}/uploads/${P}-og.png`, "5"); },
};
const names = Object.keys(KINDS);
const chats = [mkChat(90, "Texto Aquece"), ...names.map((k, i) => mkChat(300 + i, `Tipo ${k}`))];
const convs = { 90: () => textConversation(90) };
names.forEach((k, i) => {
  const cid = 300 + i;
  convs[cid] = () => {
    const msgs = textConversation(cid, 22).map((m, j) => ({ ...m, criado_em: iso(j) }));
    KINDS[k](`v${cid}`).forEach((x, j) => msgs.push({ id: cid * 1000 + 100 + j, conversa_id: cid, status: "lido", criado_em: iso(30 + j), ...x }));
    msgs.push({ id: cid * 1000 + 200, conversa_id: cid, direcao: "in", status: "recebido", criado_em: iso(40), tipo: "texto", texto: "ok" });
    return msgs;
  };
});

test.use({ viewport: { width: 1807, height: 925 } });

test("cartão de link: data URI (produção) x http lento", async ({ page, browser }) => {
  test.setTimeout(300_000);
  await setupRoutes(page, { apiDelay: Number(process.env.A_API || 400), chats, convs, browser });
  await page.goto("/atendimento");
  await page.locator("button, [role=tab]").filter({ hasText: /^Todas/ }).first().click();
  const open = (n) => page.locator(".chat-list-row").filter({ hasText: n }).first().click();
  await open("Texto Aquece");
  await page.waitForTimeout(1500);
  for (const k of names) {
    for (const pass of ["1a", "2a"]) {
      if (pass === "2a") { await open("Texto Aquece"); await page.waitForTimeout(900); }
      await armProbe(page, 3500);
      await open(`Tipo ${k}`);
      await page.waitForTimeout(3600);
      const { samples } = await readProbe(page);
      const a = analyse(samples);
      const s = short(a);
      const lpState = await page.evaluate(() => {
        const el = document.querySelector(".wa-linkPrev");
        return el ? { compact: el.className.includes("compact"), h: Math.round(el.getBoundingClientRect().height), ar: el.style.getPropertyValue("--wa-media-ar") } : null;
      });
      const maxStep = a.frames.reduce((m, f) => Math.max(m, f.step), 0);
      console.log(`LPV ${k} ${pass}`, JSON.stringify({ revealT: s.revealT, jumps: s.jumps.map((j) => ({ t: j.t, d: j.d, step: j.step, grew: j.grew })), maxStep, totalMovePx: s.totalMovePx, motion: s.motion, white: s.whiteFrames, maxGap: s.maxGap, lpState }));
    }
  }
  expect(true).toBe(true);
});
