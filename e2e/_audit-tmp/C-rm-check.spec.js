// AUDITORIA (lente C): confirma se test.use({reducedMotion}) chega ao matchMedia.
import { test } from "@playwright/test";
test.use({ contextOptions: { reducedMotion: "reduce" } });
test("rm check", async ({ page }) => {
  await page.goto("about:blank");
  console.log("[C rm-check] reduce =", await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches));
});
