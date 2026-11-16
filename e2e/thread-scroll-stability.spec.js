// Regressão (16/11/2026): após carregar histórico antigo a thread não pode mexer sozinha
// (laço de reconcile do TanStack v3.14) e o botão "recentes" desliza até ao fim.
import { test, expect } from "@playwright/test";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const chat = { id: 1, contato_nome: "Contato Auditoria", nome_contato_cache: "Contato Auditoria", telefone: "5511999990001",
  status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento", atendente_id: 1, departamento_id: 1, unread_count: 0,
  ultima_atividade: "2026-07-24T20:00:00.000Z" };
function mk(from, n) {
  return Array.from({ length: n }, (_, i) => {
    const index = from + i;
    const base = { id: 60_000 + index, conversa_id: 1, direcao: index % 2 ? "out" : "in", status: "lido",
      criado_em: new Date(Date.UTC(2026, 6, 25, 12) + index * 1000).toISOString() };
    if (index % 4 === 1) return { ...base, tipo: "imagem", url: `/uploads/img-${index}.svg` };
    return { ...base, tipo: "texto", texto: `Msg ${index} ${"conteudo ".repeat((index % 3) + 1)}` };
  });
}
test("historico antigo e botao recentes sem puxoes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"));
  await page.route(/https:\/\/fonts\./, (r) => r.abort());
  await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })));
  await page.route(`${API}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (/^\/uploads\/img-\d+\.svg$/.test(p)) {
      const n = Number(p.match(/(\d+)/)[1]); await new Promise((r) => setTimeout(r, 300 + (n % 5) * 150));
      const w = n % 2 ? 640 : 360, h = n % 2 ? 360 : 560;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#9cc"/></svg>` });
    }
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: [chat] });
    if (p === "/chats/1" && req.method() === "GET") {
      const older = url.searchParams.get("cursor");
      await new Promise((r) => setTimeout(r, older ? 250 : 0));
      return route.fulfill({ json: { conversa: { ...chat, mensagens_bloqueadas: false },
        mensagens: older ? mk(0, 60) : mk(60, 60), next_cursor: older ? null : "c1", next_cursor_id: older ? null : 60060, tags: [] } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/atendimento");
  await page.locator(".chat-list-row").filter({ hasText: "Contato Auditoria" }).click();
  const messages = page.locator(".wa-messages");
  await expect(messages).not.toHaveClass(/wa-messages--opening/);
  await page.waitForTimeout(2500);
  // sobe com a roda até ao topo -> carrega historico
  await messages.hover();
  for (let i = 0; i < 60; i++) { const st = await messages.evaluate((el) => el.scrollTop); if (st < 400) break; await page.mouse.wheel(0, -500); await page.waitForTimeout(40); }
  await page.waitForTimeout(400);
  // arma a amostragem ANTES do gatilho do historico e para a roda: tudo o que mexer depois e "sozinho"
  const driftP = messages.evaluate(async (el) => {
    const r = el.getBoundingClientRect();
    const b = [...el.querySelectorAll("[data-msg-id]")].find((x) => { const br = x.getBoundingClientRect(); return br.top > r.top + 120 && br.bottom < r.bottom - 40; });
    if (!b) return { err: "no bubble" };
    const id = b.getAttribute("data-msg-id"); let t0 = null; let max = 0; let moves = 0; const start = performance.now(); let armedAt = null;
    await new Promise((res) => { const f = () => { const nb = el.querySelector(`[data-msg-id="${id}"]`);
      if (nb) { const t = nb.getBoundingClientRect().top; if (t0 == null && window.__wheelDone) { t0 = t; armedAt = performance.now(); }
        if (t0 != null) { const d = Math.abs(t - t0); if (d > max) max = d; if (d > 1) moves++; } }
      if (performance.now() - start < 4500) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    return { id, max, moves, scrollTop: el.scrollTop, count: el.querySelectorAll("[data-msg-id]").length };
  });
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(250);
  await messages.evaluate(() => { window.__wheelDone = true; });
  const drift = await driftP;
  console.log("[drift-historico]", JSON.stringify(drift));
  // botao recentes: deve deslizar (varios frames intermedios) e terminar no fim
  const btn = page.getByRole("button", { name: /recentes|fim da conversa|últimas/i }).first();
  await expect(btn).toBeVisible();
  await messages.evaluate((el) => { window.__st = []; const s = performance.now(); const f = () => { window.__st.push(Math.round(el.scrollTop)); if (performance.now() - s < 1500) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await btn.click();
  await page.waitForTimeout(1600);
  const res = await messages.evaluate((el) => { const st = window.__st; const distinct = new Set(st).size; return { distinct, gap: el.scrollHeight - el.scrollTop - el.clientHeight, first: st[0], last: st[st.length - 1] }; });
  console.log("[recentes]", JSON.stringify(res));
  expect(res.gap).toBeLessThanOrEqual(2);
  expect(res.distinct).toBeGreaterThan(5);
  expect(drift.max).toBeLessThanOrEqual(2);
});
