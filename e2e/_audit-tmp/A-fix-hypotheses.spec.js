// Lente A — prova das correções propostas SEM mexer em src/: injeta CSS de teste (addStyleTag) e
// mede de novo o mesmo cenário do A-media-kinds. Compara "atual" x "com correção" por tipo.
import { test, expect } from "@playwright/test";
import { setupRoutes, mkChat, textConversation, imgUrl, vidUrl, API, armProbe, readProbe, analyse } from "./A-mock.mjs";

const now = Date.now();
const iso = (min) => new Date(now - 3600000 + min * 60000).toISOString();
const KINDS = {
  sticker: (P) => [{ tipo: "sticker", url: imgUrl(`${P}-s`, { w: 512, h: 512, alpha: true, delay: 700, b: "ok" }) }],
  linkSquare: (P) => { imgUrl(`${P}-og`, { w: 1200, h: 1200, delay: 900, b: "ok" }); return [{ tipo: "texto", direcao: "out", texto: "Olha https://loja.exemplo.test/p/1", reply_meta: { link_preview: { url: "https://loja.exemplo.test/p/1", title: "Produto 1", description: "Detalhes", preview: `${API}/uploads/${P}-og.png` } } }]; },
  video: (P) => [{ tipo: "video", url: vidUrl(`${P}-v`, { delay: 700, b: "ok" }) }],
  imgSlow45: (P) => [{ tipo: "imagem", url: imgUrl(`${P}-i`, { w: 1600, h: 900, delay: 4500, b: "ok" }) }],
};
// CSS de teste = o que se propõe pôr no conversa.css
const FIX = {
  // Figurinha: caixa fixa (WhatsApp padroniza 512x512) — não muda ao decodificar.
  sticker: `.wa-bubble.sticker-message .wa-bubble-img{width:160px!important;height:160px!important;min-width:0!important;min-height:0!important;object-fit:contain}`,
  // Cartão de link: proporção animável (mesmo mecanismo da foto) — sem janela, só para provar.
  linkSquare: `@property --wa-lp-ar-anim{syntax:"<number>";inherits:false;initial-value:1.91}
    .wa-linkPrev-img{--wa-lp-ar-anim:var(--wa-media-ar,1.91);aspect-ratio:var(--wa-lp-ar-anim)!important;transition:--wa-lp-ar-anim 560ms cubic-bezier(.4,0,.2,1)}`,
  // Vídeo: proporção animável própria (não registrar --wa-media-ar, ver doc 14).
  video: `@property --wa-vid-ar-anim{syntax:"<number>";inherits:false;initial-value:1.7778}
    .wa-bubble-videoLink{--wa-vid-ar-anim:var(--wa-media-ar,1.7778);aspect-ratio:var(--wa-vid-ar-anim)!important;
      width:min(clamp(248px,34vw,380px),calc(var(--wa-media-max-h) * var(--wa-vid-ar-anim)))!important;transition:--wa-vid-ar-anim 560ms cubic-bezier(.4,0,.2,1)}`,
  // Foto que chega depois dos 3,5s: a transição continua valendo para a foto VISÍVEL.
  imgSlow45: `.wa-messages .wa-bubble.image-message .wa-bubble-imgLink:not([data-ar-instant]){transition:--wa-media-ar-anim 560ms cubic-bezier(.4,0,.2,1)}`,
};
const names = Object.keys(KINDS);
const chats = [mkChat(90, "Texto Aquece"), ...names.map((k, i) => mkChat(200 + i, `Tipo ${k}`))];
const convs = { 90: () => textConversation(90) };
names.forEach((k, i) => {
  const cid = 200 + i;
  convs[cid] = () => {
    const msgs = textConversation(cid, 22).map((m, j) => ({ ...m, criado_em: iso(j) }));
    KINDS[k](`f${cid}`).forEach((x, j) => msgs.push({ id: cid * 1000 + 100 + j, conversa_id: cid, direcao: "in", status: "recebido", criado_em: iso(30 + j), ...x }));
    msgs.push({ id: cid * 1000 + 200, conversa_id: cid, direcao: "in", status: "recebido", criado_em: iso(40), tipo: "texto", texto: "ok" });
    return msgs;
  };
});
test.use({ viewport: { width: 1807, height: 925 } });

for (const mode of ["atual", "comCorrecao"]) {
  test(`hipóteses de correção — ${mode}`, async ({ page, browser }) => {
    test.setTimeout(200_000);
    await setupRoutes(page, { apiDelay: 400, chats, convs, browser });
    await page.goto("/atendimento");
    if (mode === "comCorrecao") await page.addStyleTag({ content: Object.values(FIX).join("\n") });
    await page.locator("button, [role=tab]").filter({ hasText: /^Todas/ }).first().click();
    const open = (n) => page.locator(".chat-list-row").filter({ hasText: n }).first().click();
    await open("Texto Aquece"); await page.waitForTimeout(1500);
    for (const k of names) {
      const wait = k === "imgSlow45" ? 6500 : 4000;
      await armProbe(page, wait);
      await open(`Tipo ${k}`);
      await page.waitForTimeout(wait + 100);
      const { samples } = await readProbe(page);
      const a = analyse(samples);
      const maxStep = a.frames.reduce((m, f) => Math.max(m, f.step), 0);
      console.log(`FIX ${mode} ${k}`, JSON.stringify({ jumps: a.jumps.map((j) => ({ t: j.t, d: j.d, step: j.step })), maxStepPxPerFrame: maxStep, totalMovePx: a.total, motionMs: a.motion?.ms ?? 0, maxGap: a.gaps.reduce((m, g) => Math.max(m, g.gap), 0) }));
    }
    expect(true).toBe(true);
  });
}
