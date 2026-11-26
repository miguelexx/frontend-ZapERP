// Lente D (auditoria 25/11): linha de etiquetas WhatsApp (.wa-whatsappLabels) entra no
// cabeçalho DEPOIS da revelação (1 + N/4 idas ao provedor) e encolhe o scroller por cima.
// Sonda pós-pintura (rAF -> MessageChannel), mesma das thread-open-*.spec.js.
import { test, expect } from "@playwright/test";
const API = process.env.VITE_API_URL || "http://localhost:5000";

const mkChat = (id, nome, extra = {}) => ({
  id, contato_nome: nome, nome_contato_cache: nome, telefone: "5511999990" + String(id).padStart(3, "0"),
  status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento",
  atendente_id: 1, departamento_id: 1, unread_count: 0,
  whatsapp_instance_id: 7, whatsapp_instance_provider: "whapi",
  ultima_atividade: "2026-07-24T20:00:00.000Z", ...extra,
});
const chats = [mkChat(1, "Contato Um"), mkChat(2, "Contato Dois")];
function msgs(cid, n) {
  return Array.from({ length: n }, (_, i) => ({
    id: cid * 100000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido", tipo: "texto",
    texto: `Msg ${i} ${"conteudo longo ".repeat((i % 4) + 1)}`,
    criado_em: new Date(Date.UTC(2026, 6, 25, 12) + i * 60000).toISOString(),
  }));
}
const labels = [
  { id: "17", name: "COTAÇÃO NOVO", color: "lightskyblue" },
  { id: "18", name: "RENOVAÇÃO", color: "gold" },
  { id: "19", name: "VIP", color: "plum" },
  { id: "20", name: "Pós-venda", color: "orange" },
  { id: "21", name: "Atrasado", color: "red" },
];

async function setup(page, { labelDelay = 350, apiDelay = 150 } = {}) {
  // PATCH=1: simula a correção proposta (RO no scroller que mantém as bolhas no mesmo pixel
  // quando a borda de CIMA do scroller se move — cabeçalho cresce/encolhe).
  if (process.env.PATCH === '1') await page.addInitScript(() => {
    const seen = new WeakSet();
    const attach = (el) => { if (seen.has(el)) return; seen.add(el); let top = el.getBoundingClientRect().top;
      new ResizeObserver(() => { const t = el.getBoundingClientRect().top; const d = t - top; top = t; if (Math.abs(d) >= 1) el.scrollTop += d; }).observe(el); };
    new MutationObserver(() => { const el = document.querySelector('.wa-messages'); if (el) attach(el); }).observe(document, { subtree: true, childList: true });
  });
  await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })));
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.abort());
  await page.route(`${API}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: chats });
    if (p === "/api/labels") { await new Promise((r) => setTimeout(r, labelDelay)); return route.fulfill({ json: { labels } }); }
    const lm = p.match(/^\/api\/labels\/(\d+)\/chats$/);
    if (lm) {
      await new Promise((r) => setTimeout(r, labelDelay));
      // conversa 1 tem a etiqueta 17 e 19
      const tem = lm[1] === "17" || lm[1] === "19";
      return route.fulfill({ json: { chats: tem ? [{ id: "5511999990001@s.whatsapp.net" }] : [], messages: [] } });
    }
    const m = p.match(/^\/chats\/(\d+)$/);
    if (m && req.method() === "GET") {
      const cid = Number(m[1]);
      await new Promise((r) => setTimeout(r, apiDelay));
      return route.fulfill({ json: { conversa: { ...chats[cid - 1], mensagens_bloqueadas: false }, mensagens: msgs(cid, 40), next_cursor: null, tags: [] } });
    }
    return route.fulfill({ json: {} });
  });
}

async function armProbe(page, ms = 4000) {
  await page.evaluate((limit) => {
    window.__probe = []; const s = performance.now();
    const mc = new MessageChannel();
    const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    const f = () => {
      const el = document.querySelector(".wa-messages");
      if (el) {
        const root = el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
        const op = root ? Number(getComputedStyle(root).opacity) : 0;
        const r = el.getBoundingClientRect();
        const bubbles = [...el.querySelectorAll("[data-msg-id]")].filter((b) => { const br = b.getBoundingClientRect(); return br.bottom > r.top && br.top < r.bottom; });
        const pos = {}; bubbles.forEach((b) => { pos[b.getAttribute("data-msg-id")] = Math.round(b.getBoundingClientRect().top); });
        const all = [...el.querySelectorAll("[data-msg-id]")];
        const last = all[all.length - 1];
        const lastBottomVsScroller = last ? Math.round(last.getBoundingClientRect().bottom - r.bottom) : null;
        const hdr = document.querySelector(".wa-header");
        window.__probe.push({
          t: Math.round(performance.now() - s), op: Math.round(op * 100) / 100,
          st: Math.round(el.scrollTop), sh: el.scrollHeight, ch: el.clientHeight, top: Math.round(r.top), pos,
          cls: el.className.includes("opening"),
          hh: hdr ? Math.round(hdr.getBoundingClientRect().height) : 0,
          labels: !!document.querySelector(".wa-whatsappLabels"),
          gap: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), lastB: lastBottomVsScroller,
        });
      }
      if (performance.now() - s < limit) tick();
    };
    mc.port1.onmessage = f; tick();
  }, ms);
}

function analyse(samples) {
  const jumps = []; let prev = null; let started = false;
  for (const s of samples) {
    if (!started && (s.cls || s.op <= 0.02)) started = true;
    if (!started) continue;
    if (s.op <= 0.02) { prev = null; continue; }
    if (prev) {
      let maxd = 0, who = null;
      for (const k of Object.keys(s.pos)) if (k in prev.pos) { const d = Math.abs(s.pos[k] - prev.pos[k]); if (d > maxd) { maxd = d; who = k; } }
      if (maxd > 1) jumps.push({ t: s.t, d: maxd, dt: s.t - prev.t, id: who, hh: `${prev.hh}->${s.hh}`, top: `${prev.top}->${s.top}`, st: `${prev.st}->${s.st}`, ch: `${prev.ch}->${s.ch}`, labels: s.labels });
    }
    prev = s;
  }
  const end = samples[samples.length - 1];
  return { jumps, end: end && { hh: end.hh, gap: end.gap, lastB: end.lastB, ch: end.ch, labels: end.labels } };
}

test("etiquetas WhatsApp chegam depois da revelação: cabeçalho cresce e a thread salta", async ({ page }, testInfo) => {
  await setup(page);
  await page.goto("/atendimento");
  const mob = testInfo.project.name.includes("mobile");
  const tap = async (n) => { const row = page.locator(".chat-list-row").filter({ hasText: n }); if (mob) await row.tap(); else await row.click(); };
  await armProbe(page, 4500); await tap("Contato Um"); await page.waitForTimeout(4600);
  const samples = await page.evaluate(() => window.__probe);
  const a = analyse(samples);
  const reveal = samples.find((s) => !s.cls && s.op > 0.02 && samples.some((x) => x.cls));
  const labelsAt = samples.find((s) => s.labels);
  console.log(`[${testInfo.project.name}] reveal t=${reveal?.t} labels t=${labelsAt?.t}`);
  console.log(`[${testInfo.project.name}] 1a abertura:`, JSON.stringify(a));
  // reabrir (cache): desktop troca para 2 e volta
  if (mob) { await page.goBack(); await page.waitForTimeout(600); }
  await tap("Contato Dois"); await page.waitForTimeout(1500);
  if (mob) { await page.goBack(); await page.waitForTimeout(600); }
  await armProbe(page, 4500); await tap("Contato Um"); await page.waitForTimeout(4600);
  const b = analyse(await page.evaluate(() => window.__probe));
  console.log(`[${testInfo.project.name}] reabertura:`, JSON.stringify(b));
  expect(true).toBe(true);
});
