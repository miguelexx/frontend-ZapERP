// Lente A — qual TIPO de mídia, no fim da conversa (o que aparece ao abrir), faz a thread saltar.
// Uma conversa por tipo: 22 textos + a mídia + 1 texto curto. 1.ª abertura (sem cache) e reabertura.
import { test, expect } from "@playwright/test";
import { setupRoutes, mkChat, textConversation, imgUrl, audUrl, vidUrl, API, armProbe, readProbe, analyse, short, captureConsole } from "./A-mock.mjs";

const now = Date.now();
const iso = (min) => new Date(now - 3600000 + min * 60000).toISOString();
const KINDS = {
  video: (P) => [{ tipo: "video", url: vidUrl(`${P}-v`, { delay: 700, b: "ok" }) }],
  sticker: (P) => [{ tipo: "sticker", url: imgUrl(`${P}-s`, { w: 512, h: 512, alpha: true, delay: 700, b: "ok" }) }],
  linkSquare: (P) => { imgUrl(`${P}-og`, { w: 1200, h: 1200, delay: 900, b: "ok" }); return [{ tipo: "texto", direcao: "out", texto: "Olha https://loja.exemplo.test/p/1", reply_meta: { link_preview: { url: "https://loja.exemplo.test/p/1", title: "Produto 1", description: "Detalhes", preview: `${API}/uploads/${P}-og.png` } } }]; },
  linkCompact: (P) => { imgUrl(`${P}-og`, { w: 120, h: 120, delay: 900, b: "ok" }); return [{ tipo: "texto", direcao: "out", texto: "Site https://site.exemplo.test", reply_meta: { link_preview: { url: "https://site.exemplo.test", title: "Site", description: "Ícone pequeno", preview: `${API}/uploads/${P}-og.png` } } }]; },
  link404: (P) => { imgUrl(`${P}-og`, { w: 1200, h: 630, delay: 900, b: "404" }); return [{ tipo: "texto", direcao: "out", texto: "Link https://x.exemplo.test", reply_meta: { link_preview: { url: "https://x.exemplo.test", title: "X", description: "imagem quebrada", preview: `${API}/uploads/${P}-og.png` } } }]; },
  img404: (P) => [{ tipo: "imagem", url: imgUrl(`${P}-i`, { w: 1080, h: 1920, delay: 600, b: "404" }) }],
  imgHang: (P) => [{ tipo: "imagem", url: imgUrl(`${P}-i`, { w: 1080, h: 1920, delay: 0, b: "hang" }) }],
  imgSlow45: (P) => [{ tipo: "imagem", url: imgUrl(`${P}-i`, { w: 1600, h: 900, delay: 4500, b: "ok" }) }],
  imgPortrait: (P) => [{ tipo: "imagem", url: imgUrl(`${P}-i`, { w: 1080, h: 1920, delay: 900, b: "ok" }) }],
  album4: (P) => [
    { tipo: "imagem", url: imgUrl(`${P}-a`, { w: 1600, h: 900, delay: 800, b: "ok" }) },
    { tipo: "imagem", url: imgUrl(`${P}-b`, { w: 1600, h: 900, delay: 830, b: "ok" }) },
    { tipo: "imagem", url: imgUrl(`${P}-c`, { w: 1600, h: 900, delay: 860, b: "ok" }) },
    { tipo: "imagem", url: imgUrl(`${P}-d`, { w: 1600, h: 900, delay: 890, b: "ok" }) },
  ],
  audio500: (P) => [{ tipo: "audio", url: audUrl(`${P}-a`, { delay: 600, b: "500" }) }],
  audioNoDur: (P) => [{ tipo: "audio", url: audUrl(`${P}-a`, { delay: 900, b: "ok" }) }],
  replyThumb: (P) => { imgUrl(`${P}-t`, { w: 300, h: 300, delay: 800, b: "ok" }); return [{ tipo: "texto", direcao: "out", texto: "Essa foto?", reply_meta: { replyToId: 1, name: "Cliente", snippet: "", thumb: `${API}/uploads/${P}-t.png`, reply_kind: "imagem" } }]; },
  document: () => [{ tipo: "documento", url: "/uploads/orc.pdf", texto: "orcamento.pdf", nome_arquivo: "orcamento.pdf" }],
};
const names = Object.keys(KINDS);
const chats = [mkChat(90, "Texto Aquece"), ...names.map((k, i) => mkChat(100 + i, `Tipo ${k}`))];
const convs = { 90: () => textConversation(90) };
names.forEach((k, i) => {
  const cid = 100 + i;
  convs[cid] = (call) => {
    const msgs = textConversation(cid, 22).map((m, j) => ({ ...m, criado_em: iso(j) }));
    KINDS[k](`k${cid}`).forEach((x, j) => msgs.push({ id: cid * 1000 + 100 + j, conversa_id: cid, direcao: "in", status: "recebido", criado_em: iso(30 + j), ...x }));
    msgs.push({ id: cid * 1000 + 200, conversa_id: cid, direcao: "in", status: "recebido", criado_em: iso(40), tipo: "texto", texto: "ok" });
    if (call > 1) msgs.push({ id: cid * 1000 + 201, conversa_id: cid, direcao: "in", status: "recebido", criado_em: iso(41), tipo: "texto", texto: "nova ao reabrir" });
    return msgs;
  };
});

test.use({ viewport: { width: Number(process.env.A_W || 1807), height: Number(process.env.A_H || 925) } });

test("salto por tipo de mídia no fim da conversa", async ({ page, browser }, testInfo) => {
  test.setTimeout(400_000);
  const logs = captureConsole(page);
  await setupRoutes(page, { apiDelay: Number(process.env.A_API || 400), chats, convs, browser });
  await page.goto("/atendimento");
  await page.locator("button, [role=tab]").filter({ hasText: /^Todas/ }).first().click();
  const open = (n) => page.locator(".chat-list-row").filter({ hasText: n }).first().click();
  await open("Texto Aquece");
  await page.waitForTimeout(1500);
  const table = {};
  const only = process.env.A_ONLY ? process.env.A_ONLY.split(",") : names;
  for (const k of only) {
    for (const pass of ["1a", "2a"]) {
      if (pass === "2a") { await open("Texto Aquece"); await page.waitForTimeout(900); }
      const wait = k === "imgSlow45" && pass === "1a" ? 6500 : 4200;
      await armProbe(page, wait);
      await open(`Tipo ${k}`);
      await page.waitForTimeout(wait + 100);
      if (process.env.A_DBG) console.log("DBG", k, pass, JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".wa-bubble-videoLink, .wa-bubble.image-message .wa-bubble-imgLink, .wa-linkPrev-img")].map((e) => ({ c: e.className, style: e.getAttribute("style"), glide: e.getAttribute("data-ar-glide"), inst: e.getAttribute("data-ar-instant"), td: getComputedStyle(e).transitionDuration, tp: getComputedStyle(e).transitionProperty })))));
      const { samples, ls } = await readProbe(page);
      const a = analyse(samples);
      const s = short(a);
      table[`${k} ${pass}`] = { jumps: s.jumps.map((j) => ({ t: j.t, d: j.d, step: j.step, grew: j.grew, dst: j.dst, dsh: j.dsh, glide: j.glide })), totalMovePx: s.totalMovePx, motion: s.motion, white: s.whiteFrames, maxGap: s.maxGap, revealT: s.revealT, ls: ls.filter((e) => e.v > 0.001).map((e) => ({ t: e.t, v: e.v, src: e.src.map((x) => `${x.d} ${x.pr}->${x.cr}`) })).slice(0, 3) };
      if (process.env.A_FRAMES) console.log("FRAMES", k, pass, JSON.stringify(a.frames.slice(0, 50)));
      console.log(`KIND ${k} ${pass}`, JSON.stringify(table[`${k} ${pass}`]));
      if (pass === "1a") await page.locator(".wa-messages").screenshot({ path: testInfo.outputPath(`kind-${k}.png`) });
    }
  }
  console.log("CONSOLE", JSON.stringify([...new Set(logs)]));
  expect(Object.keys(table).length).toBeGreaterThan(0);
});
