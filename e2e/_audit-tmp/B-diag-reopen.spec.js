// Lente B — diagnóstico da falha de baseline no celular: reabertura pelo CACHE com 1 msg nova.
// Mesmo cenário do thread-open-stability (40 msgs, SVG, API 80/600ms), sonda detalhada.
import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { installMocks, armProbe, analyse, collect, captureConsole, mkChat, audioOgg, sleep } from "./B-helpers.js";

const OUT = process.env.B_OUT || ".";
const chats = [mkChat(1, "Contato Um"), mkChat(2, "Contato Dois")];
function msgs(cid, n) {
  return Array.from({ length: n }, (_, i) => {
    const base = { id: cid * 100000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido",
      criado_em: new Date(Date.UTC(2026, 6, 25, 12) + i * 60000).toISOString() };
    if (i % 7 === 2) return { ...base, tipo: "imagem", url: `/uploads/img-${cid}-${i}.svg` };
    if (i % 7 === 4) return { ...base, tipo: "audio", url: `/uploads/aud-${cid}-${i}.ogg`, audio_duracao_sec: 2 };
    if (i % 11 === 6) return { ...base, tipo: "texto", mensagem_interna: true, texto: "Movimentação interna\nAtendente assumiu este atendimento." };
    return { ...base, tipo: "texto", texto: `Msg ${i} ${"conteudo longo ".repeat((i % 4) + 1)}` };
  });
}

for (const variant of ["extra1", "same"]) {
  for (const delay of [80, 600]) {
    test(`B diag reabertura cache ${variant} api ${delay}`, async ({ page }, testInfo) => {
      const cons = captureConsole(page);
      await installMocks(page, {
        chats,
        chatById: (cid, n) => ({ delay, payload: { conversa: { ...chats[cid - 1], mensagens_bloqueadas: false }, mensagens: msgs(cid, 40 + (variant === "extra1" && n > 1 ? 1 : 0)), next_cursor: null, tags: [] } }),
        media: async (p) => {
          if (/^\/uploads\/img-/.test(p)) { const n = Number(p.match(/(\d+)\.svg/)[1]); const w = n % 2 ? 640 : 360, h = n % 2 ? 360 : 560;
            return { delay: 150 + (n % 5) * 120, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#9cc"/></svg>` }; }
          if (/^\/uploads\/aud-/.test(p)) return { delay: 200, contentType: "audio/ogg", body: audioOgg };
          return null;
        },
      });
      await page.goto("/atendimento");
      const mob = testInfo.project.name.includes("mobile");
      const tap = async (n) => { const row = page.locator(".chat-list-row").filter({ hasText: n }); if (mob) await row.tap(); else await row.click(); };
      const back = async () => { if (mob) { await page.goBack(); await page.waitForTimeout(600); } };
      await tap("Contato Dois"); await page.waitForTimeout(2500); await back();
      await armProbe(page, 2600); await tap("Contato Um"); await page.waitForTimeout(2700);
      const a1 = await collect(page);
      const r1 = analyse(a1.probe);
      await back(); await tap("Contato Dois"); await page.waitForTimeout(1800); await back();
      await armProbe(page, 2600); await tap("Contato Um"); await page.waitForTimeout(2700);
      const a2 = await collect(page);
      const r2 = analyse(a2.probe);
      const tag = `${testInfo.project.name}-${variant}-d${delay}`;
      writeFileSync(`${OUT}/B-diag-reopen-${tag}.json`, JSON.stringify({ first: a1, again: a2 }, null, 0));
      console.log(`[B ${tag}] 1a bruscos=${JSON.stringify(r1.bruscos)} reveals=${JSON.stringify(r1.reveals)} white=${r1.white.length} gaps=${JSON.stringify(r1.bottomGaps.slice(0, 3))} kinds=${r1.kinds} hh=${r1.hh} fh=${r1.fh}`);
      console.log(`[B ${tag}] 2a bruscos=${JSON.stringify(r2.bruscos)} reveals=${JSON.stringify(r2.reveals)} white=${r2.white.length} gaps=${JSON.stringify(r2.bottomGaps.slice(0, 3))} kinds=${r2.kinds} hh=${r2.hh} fh=${r2.fh}`);
      console.log(`[B ${tag}] ls2=${JSON.stringify(a2.ls.filter((x) => x.v > 0.001).slice(0, 6))}`);
      console.log(`[B ${tag}] console=${JSON.stringify(cons.slice(0, 8))}`);
    });
  }
}
