// Regressão (16/11/2026): barras que entram no topo da thread (mensagem fixada etc.) não podem
// deslocar o que o atendente está a ler — nem no meio do histórico, nem colado ao fim.
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
async function abrirConversa(page) {
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
  return messages;
}

/** Bolha totalmente visível (longe das bordas) para servir de referência. */
async function referencia(messages, skipId = null) {
  return messages.evaluate((el, skip) => {
    const r = el.getBoundingClientRect();
    const b = [...el.querySelectorAll("[data-msg-id]")].find((x) => {
      if (skip && x.getAttribute("data-msg-id") === skip) return false;
      const br = x.getBoundingClientRect();
      return br.top > r.top + 90 && br.bottom < r.bottom - 60;
    });
    return b ? b.getAttribute("data-msg-id") : null;
  }, skipId);
}

/** Abre o menu da bolha `alvoId`, arma a medição da bolha `refId` e clica no item `rotulo`. */
async function alternarFixada(page, messages, alvoId, refId, rotulo) {
  const bolha = page.locator(`[data-msg-id="${alvoId}"]`).first();
  await bolha.hover();
  await bolha.locator(".wa-msgMenuBtn").first().click({ force: true });
  const item = page.getByRole("menuitem", { name: rotulo }).first();
  await expect(item).toBeVisible();
  await messages.evaluate((el, id) => {
    const top = () => { const n = el.querySelector(`[data-msg-id="${id}"]`); return n ? n.getBoundingClientRect().top : null; };
    window.__ref = { t0: top(), max: 0 };
    const s = performance.now();
    const f = () => { const t = top(); if (t != null && window.__ref.t0 != null) window.__ref.max = Math.max(window.__ref.max, Math.abs(t - window.__ref.t0)); if (performance.now() - s < 1200) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }, refId);
  await item.click();
  await page.waitForTimeout(1300);
  return page.evaluate(() => window.__ref);
}

test("fixar e desafixar no meio do historico nao desloca a thread", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"));
  const messages = await abrirConversa(page);
  await messages.hover();
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(50); }
  await page.waitForTimeout(1200);
  const alvo = await referencia(messages);
  const ref = await referencia(messages, alvo);
  expect(alvo).toBeTruthy();
  expect(ref).toBeTruthy();
  const fixar = await alternarFixada(page, messages, alvo, ref, /^Fixar$/);
  await expect(page.locator(".wa-pinBar")).toBeVisible();
  const desafixar = await alternarFixada(page, messages, alvo, ref, /Desafixar/);
  await expect(page.locator(".wa-pinBar")).toHaveCount(0);
  console.log("[barra-meio]", JSON.stringify({ fixar, desafixar }));
  expect(fixar.max).toBeLessThanOrEqual(2);
  expect(desafixar.max).toBeLessThanOrEqual(2);
});

test("fixar com a thread no fim mantem a ultima mensagem visivel", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"));
  const messages = await abrirConversa(page);
  const alvo = await referencia(messages);
  const fixar = await messages.evaluate(async (el) => {
    const gap = () => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight);
    return { antes: gap() };
  });
  const res = await alternarFixada(page, messages, alvo, alvo, /^Fixar$/);
  const gapDepois = await messages.evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));
  console.log("[barra-fim]", JSON.stringify({ ...fixar, gapDepois, ref: res }));
  expect(gapDepois).toBeLessThanOrEqual(2);
  expect(res.max).toBeLessThanOrEqual(2);
});
