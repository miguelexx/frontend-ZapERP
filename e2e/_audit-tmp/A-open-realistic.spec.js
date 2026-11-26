// Lente A — reprodução empírica no desktop (1807x925 ≈ viewport do print do Miguel e 1280x720).
// Abre conversas "carregadas de fotos e áudios" com mídia raster real e atrasos de produção e filma
// frame a frame DEPOIS da pintura (rAF -> MessageChannel), como as sondas oficiais.
// Rodar: PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:5181 VITE_API_URL=http://localhost:5000 \
//   npx playwright test e2e/_audit-tmp/A-open-realistic.spec.js --project=chromium-desktop --workers=1
import { test, expect } from "@playwright/test";
import { setupRoutes, mkChat, mediaConversation, textConversation, armProbe, readProbe, analyse, short, captureConsole } from "./A-mock.mjs";

const VIEWPORTS = [
  { width: 1807, height: 925 },
  { width: 1280, height: 720 },
];
const chats = [
  mkChat(11, "Cliente Fotos"),
  mkChat(12, "Cliente Lento"),
  mkChat(13, "Cliente Quebrado"),
  mkChat(14, "Grupo Loja", { is_group: true, telefone: "120363000000000014@g.us" }),
  mkChat(15, "Cliente Texto"),
  mkChat(16, "Cliente Proxy"),
];
const convs = {
  11: (call) => mediaConversation(11, { variant: "ok", extra: call > 1 ? 3 : 0, idPatch: call > 1 }),
  12: (call) => mediaConversation(12, { variant: "slow", extra: call > 1 ? 1 : 0 }),
  13: (call) => mediaConversation(13, { variant: "broken" }),
  14: (call) => mediaConversation(14, { variant: "ok", group: true }),
  15: () => textConversation(15),
  16: (call) => mediaConversation(16, { variant: "proxy" }),
};

async function gotoTodas(page) {
  // As conversas são da Eva (atendente 2): "Minha fila" (padrão) do admin 1 vem vazia.
  const tab = page.locator("button, [role=tab]").filter({ hasText: /^Todas/ }).first();
  await tab.waitFor({ timeout: 15000 });
  await tab.click();
  await expect(page.locator(".chat-list-row").first()).toBeVisible();
}
const open = async (page, nome) => page.locator(".chat-list-row").filter({ hasText: nome }).first().click();

for (const vp of VIEWPORTS) {
  for (const apiDelay of [0, 400, 1300]) {
    test.describe(`${vp.width}x${vp.height} api${apiDelay}`, () => {
      test.use({ viewport: vp });
      test(`abertura realista`, async ({ page, browser }, testInfo) => {
        test.setTimeout(180_000);
        const logs = captureConsole(page);
        // API 1300 só para o 1.º GET de cada conversa (reabrir também usa a mesma latência)
        await setupRoutes(page, { apiDelay, chats, convs, browser });
        await page.goto("/atendimento");
        await gotoTodas(page);
        // aquece o chunk lazy do ConversaView com uma conversa só de texto
        await open(page, "Cliente Texto");
        await page.waitForTimeout(1500);
        const results = {};
        for (const nome of ["Cliente Fotos", "Cliente Lento", "Cliente Quebrado", "Grupo Loja", "Cliente Proxy"]) {
          await armProbe(page, 6500);
          await open(page, nome);
          await page.waitForTimeout(6600);
          const { samples, ls } = await readProbe(page);
          const a = analyse(samples);
          results[`${nome} 1a`] = { ...short(a), ls: ls.filter((e) => e.v > 0.001).slice(0, 8) };
          console.log(`[${vp.width} api${apiDelay}] ${nome} 1a`, JSON.stringify(results[`${nome} 1a`]));
          if (process.env.A_FRAMES) console.log("FRAMES", JSON.stringify(a.frames.slice(0, 80)));
          await page.screenshot({ path: testInfo.outputPath(`${nome.replace(/\s/g, "_")}-1a.png`) });
        }
        // reabertura pelo cache (servidor traz +3 e ids do provedor) depois de outra conversa
        await open(page, "Cliente Texto");
        await page.waitForTimeout(1200);
        await armProbe(page, 5000);
        await open(page, "Cliente Fotos");
        await page.waitForTimeout(5100);
        {
          const { samples, ls } = await readProbe(page);
          const a = analyse(samples);
          results["Cliente Fotos 2a"] = { ...short(a), ls: ls.filter((e) => e.v > 0.001).slice(0, 8) };
          console.log(`[${vp.width} api${apiDelay}] Cliente Fotos 2a`, JSON.stringify(results["Cliente Fotos 2a"]));
          if (process.env.A_FRAMES) console.log("FRAMES", JSON.stringify(a.frames.slice(0, 80)));
        }
        console.log(`[${vp.width} api${apiDelay}] CONSOLE`, JSON.stringify([...new Set(logs)].slice(0, 40)));
        const bruscos = Object.entries(results).flatMap(([k, v]) => v.jumps.map((j) => ({ k, ...j })));
        expect.soft(bruscos, "nenhum salto (>24px/frame) de bolha visível").toEqual([]);
      });
    });
  }
}
