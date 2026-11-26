// Lente D: repete a reabertura pelo cache (celular/desktop) N vezes, com o GET de abertura
// chegando perto da revelação. Conta: revelado fora do fundo, saltos > 24px/frame.
import { test } from "@playwright/test";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const N = Number(process.env.N || 6);
const mkChat = (id, nome) => ({ id, contato_nome: nome, nome_contato_cache: nome, telefone: "5511999990" + String(id).padStart(3, "0"), status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento", atendente_id: 1, departamento_id: 1, unread_count: 0, ultima_atividade: "2026-07-24T20:00:00.000Z" });
const chats = [mkChat(1, "Contato Um"), mkChat(2, "Contato Dois")];
const msgs = (cid, n) => Array.from({ length: n }, (_, i) => ({ id: cid * 100000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido", tipo: "texto", texto: `Msg ${i} ${"conteudo longo ".repeat((i % 4) + 1)}`, criado_em: new Date(Date.UTC(2026, 6, 25, 12) + i * 60000).toISOString() }));
test("loop reabertura", async ({ page }, testInfo) => {
  let apid = 100;
  await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })));
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.abort());
  await page.route(`${API}/**`, async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: chats });
    const m = p.match(/^\/chats\/(\d+)$/);
    if (m && req.method() === "GET") {
      await new Promise((r) => setTimeout(r, apid));
      return route.fulfill({ json: { conversa: { ...chats[Number(m[1]) - 1], mensagens_bloqueadas: false }, mensagens: msgs(Number(m[1]), 40), next_cursor: null, tags: [] } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/atendimento");
  const mob = testInfo.project.name.includes("mobile");
  const tap = async (n) => { const row = page.locator(".chat-list-row").filter({ hasText: n }); if (mob) await row.tap(); else await row.click(); };
  const back = async () => { if (mob) { await page.goBack(); await page.waitForTimeout(500); } };
  await tap("Contato Um"); await page.waitForTimeout(1200); await back();
  const results = [];
  for (let k = 0; k < N; k++) {
    apid = 40 + k * 30;
    await tap("Contato Dois"); await page.waitForTimeout(1200); await back();
    await page.evaluate(() => {
      window.__d = []; const s = performance.now();
      const mc = new MessageChannel(); const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
      mc.port1.onmessage = () => {
        const el = document.querySelector(".wa-messages");
        if (el) {
          const root = el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
          const r = el.getBoundingClientRect();
          const pos = {}; [...el.querySelectorAll("[data-msg-id]")].forEach((b) => { const br = b.getBoundingClientRect(); if (br.bottom > r.top && br.top < r.bottom) pos[b.getAttribute("data-msg-id")] = Math.round(br.top); });
          window.__d.push({ t: Math.round(performance.now() - s), op: root ? Number(getComputedStyle(root).opacity) : 0, mask: el.className.includes("opening"), st: Math.round(el.scrollTop), gap: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), glide: el.getAttribute("data-media-glide") === "1", older: !!el.querySelector(".wa-loadOlderHistory"), veil: !!document.querySelector(".wa-openVeil.is-active"), pos });
        }
        if (performance.now() - s < 1500) tick();
      };
      tick();
    });
    await tap("Contato Um"); await page.waitForTimeout(1600);
    const d = await page.evaluate(() => window.__d);
    let prev = null; const jumps = []; let worstGapVisible = 0; let firstVis = null;
    for (const s of d) {
      if (s.op > 0.02 && firstVis == null) firstVis = s;
      if (s.op > 0.02) worstGapVisible = Math.max(worstGapVisible, s.gap);
      if (s.op <= 0.02) { prev = null; continue; }
      if (prev) { let mx = 0; for (const k2 of Object.keys(s.pos)) if (k2 in prev.pos) mx = Math.max(mx, Math.abs(s.pos[k2] - prev.pos[k2])); const pf = mx / Math.max(1, Math.round((s.t - prev.t) / 16.7)); if (pf > 24) jumps.push(`${s.t}:${mx}px/${s.t - prev.t}ms`); }
      prev = s;
    }
    const line = `apid=${apid} firstVisible t=${firstVis?.t} op=${firstVis?.op?.toFixed(2)} gap=${firstVis?.gap} mask=${firstVis?.mask} glide=${firstVis?.glide} | maxGapWhileVisible=${worstGapVisible} | jumps=${JSON.stringify(jumps)}`;
    results.push(line);
    if (jumps.length || worstGapVisible > 40) console.log(d.slice(0, 30).map((s) => `${s.t}:op${s.op.toFixed(2)}:${s.mask ? "M" : "-"}${s.glide ? "G" : ""}${s.older ? "o" : ""}${s.veil ? "V" : ""}:st${s.st}:gap${s.gap}`).join("  "));
    await back();
  }
  console.log(`[${testInfo.project.name}]\n` + results.join("\n"));
});
