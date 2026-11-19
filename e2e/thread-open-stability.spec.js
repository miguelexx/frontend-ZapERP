// Regressao (16/11/2026): ao abrir uma conversa (1a vez e pelo cache), com fotos/audio/registro
// interno, nenhuma bolha visivel pode mudar de lugar depois que a thread aparece. Filma frame a frame.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const audio = readFileSync(new URL("./fixtures/voz-2s.ogg", import.meta.url));
const mkChat = (id, nome) => ({ id, contato_nome: nome, nome_contato_cache: nome, telefone: "55119999900" + id,
  status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento", atendente_id: 1, departamento_id: 1, unread_count: 0,
  ultima_atividade: "2026-07-24T20:00:00.000Z" });
const chats = [mkChat(1, "Contato Um"), mkChat(2, "Contato Dois")];
function msgs(cid, n, extra = 0) {
  return Array.from({ length: n + extra }, (_, i) => {
    const base = { id: cid * 100000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido",
      criado_em: new Date(Date.UTC(2026, 6, 25, 12) + i * 60000).toISOString() };
    if (i % 7 === 2) return { ...base, tipo: "imagem", url: `/uploads/img-${cid}-${i}.svg` };
    if (i % 7 === 4) return { ...base, tipo: "audio", url: `/uploads/aud-${cid}-${i}.ogg`, audio_duracao_sec: 2 };
    if (i % 11 === 6) return { ...base, tipo: "texto", mensagem_interna: true, texto: "Movimentação interna\nAtendente assumiu este atendimento." };
    return { ...base, tipo: "texto", texto: `Msg ${i} ${"conteudo longo ".repeat((i % 4) + 1)}` };
  });
}
async function setup(page, apiDelay) {
  await page.route(/https:\/\/fonts\./, (r) => r.abort());
  await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })));
  const calls = {};
  await page.route(`${API}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (/^\/uploads\/img-/.test(p)) { const n = Number(p.match(/(\d+)\.svg/)[1]); await new Promise((r) => setTimeout(r, 150 + (n % 5) * 120));
      const w = n % 2 ? 640 : 360, h = n % 2 ? 360 : 560;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#9cc"/></svg>` }); }
    if (/^\/uploads\/aud-/.test(p)) { await new Promise((r) => setTimeout(r, 200)); return route.fulfill({ status: 200, contentType: "audio/ogg", body: audio }); }
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: chats });
    const m = p.match(/^\/chats\/(\d+)$/);
    if (m && req.method() === "GET") { const cid = Number(m[1]); calls[cid] = (calls[cid] || 0) + 1;
      await new Promise((r) => setTimeout(r, apiDelay));
      return route.fulfill({ json: { conversa: { ...chats[cid - 1], mensagens_bloqueadas: false }, mensagens: msgs(cid, 40, calls[cid] > 1 ? 1 : 0), next_cursor: null, tags: [] } }); }
    return route.fulfill({ json: {} });
  });
}
async function armProbe(page) {
  await page.evaluate(() => {
    window.__probe = []; const s = performance.now();
    const f = () => { const el = document.querySelector(".wa-messages");
      if (el) { const first = el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
        const op = first ? Number(getComputedStyle(first).opacity) : 0; const r = el.getBoundingClientRect();
        const bubbles = [...el.querySelectorAll("[data-msg-id]")].filter((b) => { const br = b.getBoundingClientRect(); return br.bottom > r.top && br.top < r.bottom; });
        const pos = {}; bubbles.forEach((b) => { pos[b.getAttribute("data-msg-id")] = Math.round(b.getBoundingClientRect().top - r.top); });
        window.__probe.push({ t: Math.round(performance.now() - s), op: Math.round(op * 100) / 100, st: Math.round(el.scrollTop), sh: el.scrollHeight, ch: el.clientHeight, pos, cls: el.className.includes("opening") });
      }
      if (performance.now() - s < 2500) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
}
function analyse(samples) {
  const jumps = []; let prev = null;
  // Só conta a partir do momento em que a NOVA conversa entra em abertura (máscara/opacidade 0):
  // antes disso o que está na tela é a conversa ANTERIOR — uma foto dela a terminar o deslize
  // (janela de deslize da moldura, 19/11/2026) não é salto da abertura que se está a medir.
  let started = false;
  for (const s of samples) { if (!started && (s.cls || s.op <= 0.02)) started = true; if (!started) continue;
    if (s.op <= 0.02) { prev = null; continue; }
    if (prev) { let maxd = 0; for (const k of Object.keys(s.pos)) if (k in prev.pos) maxd = Math.max(maxd, Math.abs(s.pos[k] - prev.pos[k]));
      if (maxd > 1) jumps.push({ t: s.t, d: maxd, op: s.op, st: s.st, sh: s.sh, ch: s.ch }); }
    prev = s; }
  return jumps;
}
for (const delay of [80, 600]) {
  test(`abertura fica fixa (api ${delay}ms)`, async ({ page }, testInfo) => {
    await setup(page, delay);
    await page.goto("/atendimento");
    const tap = async (n) => { const row = page.locator(".chat-list-row").filter({ hasText: n }); if (testInfo.project.name.includes("mobile")) await row.tap(); else await row.click(); };
    const back = async () => { if (testInfo.project.name.includes("mobile")) { await page.goBack(); await page.waitForTimeout(600); } };
    await tap("Contato Dois"); await page.waitForTimeout(2500); await back();
    await armProbe(page); await tap("Contato Um"); await page.waitForTimeout(2600);
    const first = analyse(await page.evaluate(() => window.__probe));
    console.log(`[${testInfo.project.name} d${delay}] 1a abertura saltos:`, JSON.stringify(first));
    expect(first, "1a abertura: nenhuma bolha visivel pode mudar de lugar").toEqual([]);
    await back(); await tap("Contato Dois"); await page.waitForTimeout(1800); await back();
    await armProbe(page); await tap("Contato Um"); await page.waitForTimeout(2600);
    const again = analyse(await page.evaluate(() => window.__probe));
    console.log(`[${testInfo.project.name} d${delay}] reabertura (cache) saltos:`, JSON.stringify(again));
    // Unico movimento admitido: a API traz 1 mensagem nova e a thread sobe a altura dela.
    expect(again.length).toBeLessThanOrEqual(1);
    expect(again.every((j) => j.d <= 60)).toBe(true);
  });
}
