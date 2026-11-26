// Verificador B (auditoria 25/11/2026) — TEMPORÁRIO. B3: no celular, 1.ª página 16 + histórico 100
// cruza MOBILE_STATIC_KEEP_MAX=60 e troca a lista estática pela virtual no meio da leitura.
// Só texto (sem mídia) para isolar a troca. Gesto de toque real via CDP. Só mocks em :5000.
import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const OUT = process.env.VB_OUT || ".";
const mkChat = (id, nome) => ({ id, contato_nome: nome, nome_contato_cache: nome, telefone: "55119999900" + id,
  status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento", atendente_id: 1, departamento_id: 1, unread_count: 0, ultima_atividade: "2026-07-24T20:00:00.000Z" });
const chats = [mkChat(1, "Contato Hist")];
const ALL = Array.from({ length: 140 }, (_, i) => ({ id: 100000 + i, conversa_id: 1, direcao: i % 2 ? "out" : "in", status: "lido",
  criado_em: new Date(Date.UTC(2026, 6, 20, 12) + i * 3600000).toISOString(), tipo: "texto", texto: `Msg ${i} ${"historico antigo ".repeat((i % 5) + 1)}` }));

for (const limitHist of [100]) test(`verifyB troca estatica->virtual no historico (lote ${limitHist})`, async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })));
  const reqs = [];
  await page.route("**/*", async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.origin !== API && !u.origin.startsWith("http://localhost:5192")) return route.abort();
    if (u.origin !== API) return route.continue();
    const p = u.pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: chats });
    if (/^\/chats\/1$/.test(p) && req.method() === "GET") {
      const limit = Number(u.searchParams.get("limit")) || 16; const cursor = u.searchParams.get("cursor");
      reqs.push({ limit, cursor });
      const end = cursor != null ? Number(cursor) : ALL.length; const start = Math.max(0, end - limit);
      await new Promise((r) => setTimeout(r, cursor != null ? 400 : 120));
      return route.fulfill({ json: { conversa: { ...chats[0], mensagens_bloqueadas: false }, mensagens: ALL.slice(start, end), next_cursor: start > 0 ? String(start) : null, next_cursor_id: start > 0 ? ALL[start].id : null, tags: [] } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/atendimento");
  await page.locator(".chat-list-row").filter({ hasText: "Contato Hist" }).tap();
  await page.waitForTimeout(1500);
  const box = await page.locator(".wa-messages").boundingBox();
  await page.evaluate((limit) => {
    window.__probe = []; const s = performance.now();
    const mc = new MessageChannel(); const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    mc.port1.onmessage = () => {
      const el = document.querySelector(".wa-messages");
      if (el) {
        const r = el.getBoundingClientRect();
        const root = el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
        const bubbles = [...el.querySelectorAll("[data-msg-id]")].filter((b) => { const br = b.getBoundingClientRect(); return br.bottom > r.top && br.top < r.bottom; });
        const pos = {}; bubbles.forEach((b) => { pos[b.getAttribute("data-msg-id")] = Math.round(b.getBoundingClientRect().top - r.top); });
        window.__probe.push({ t: Math.round(performance.now() - s), st: Math.round(el.scrollTop), sh: el.scrollHeight, kind: root ? (root.className.includes("static") ? "S" : "V") : "-",
          loading: !!el.querySelector(".wa-historyLoading"), n: bubbles.length, pos });
      }
      if (performance.now() - s < limit) tick();
    };
    tick();
  }, 6000);
  void box;
  // "gesto" sintético: wheel/touchstart marcam interação humana (userScrollLock), depois rola
  for (let k = 0; k < 6; k++) {
    await page.evaluate(() => { const el = document.querySelector(".wa-messages"); el.dispatchEvent(new WheelEvent("wheel", { deltaY: -400, bubbles: true })); el.scrollTop = Math.max(0, el.scrollTop - 220); });
    await page.waitForTimeout(34);
  }
  await page.waitForTimeout(4500);
  const probe = await page.evaluate(() => window.__probe);
  const lines = [`requests=${JSON.stringify(reqs)}`];
  let prev = null;
  for (const s of probe) {
    let maxd = 0, who = null; let common = 0;
    if (prev) for (const k of Object.keys(s.pos)) if (k in prev.pos) { common++; const d = Math.abs(s.pos[k] - prev.pos[k]); if (d > maxd) { maxd = d; who = k; } }
    const changed = !prev || s.kind !== prev.kind || s.loading !== prev.loading || s.n === 0 || maxd > 1 || Math.abs(s.st - prev.st) > 1;
    if (changed) lines.push(`${s.t}\t${s.kind}\tloading=${s.loading ? 1 : 0}\tst=${s.st}\tsh=${s.sh}\tn=${s.n}\tcommon=${common}\tmaxd=${maxd}${who ? "@" + who : ""}\tfirst=${Object.entries(s.pos).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([k, v]) => k + ":" + v).join(",")}`);
    prev = s;
  }
  writeFileSync(`${OUT}/verifyB-history-${testInfo.project.name}.txt`, lines.join("\n"));
  console.log(lines.slice(0, 120).join("\n"));
});
