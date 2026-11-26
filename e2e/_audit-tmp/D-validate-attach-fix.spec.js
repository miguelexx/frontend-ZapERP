// Lente D: VALIDAÇÃO da causa F2 — com PATCH=1 ignora o scrollTo({top:0}) que o TanStack faz ao
// anexar o scroller tarde (_willUpdate). Se os saltos somem, a causa é essa. Derivado de D-open-general.
// Lente D (auditoria 25/11): sonda geral de abertura com instrumentação extra
// (offsetTop da raiz = scrollMargin real, translateY da 1.ª linha, folga no fundo).
// Cenários por env: SCEN=reopen (padrão) | switch | closed | header
import { test } from "@playwright/test";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const SCEN = process.env.SCEN || "reopen";

const mkChat = (id, nome, extra = {}) => ({
  id, contato_nome: nome, nome_contato_cache: nome, telefone: "5511999990" + String(id).padStart(3, "0"),
  status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento",
  atendente_id: 1, departamento_id: 1, unread_count: 0,
  ultima_atividade: "2026-07-24T20:00:00.000Z", ...extra,
});
const chats = [mkChat(1, "Contato Um"), mkChat(2, "Contato Dois"), mkChat(3, "Contato Tres")];
function msgs(cid, n, media) {
  return Array.from({ length: n }, (_, i) => {
    const base = { id: cid * 100000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido", criado_em: new Date(Date.UTC(2026, 6, 25, 12) + i * 60000).toISOString() };
    if (media && i % 7 === 2) return { ...base, tipo: "imagem", url: `/uploads/img-${cid}-${i}.svg` };
    return { ...base, tipo: "texto", texto: `Msg ${i} ${"conteudo longo ".repeat((i % 4) + 1)}` };
  });
}

async function setup(page, { apiDelay = 150, media = false, convPatch = {}, serverPatch = null, hasMore = false } = {}) {
  if (process.env.PATCH === "1") await page.addInitScript(() => { const o = Element.prototype.scrollTo; window.__skipped = 0; Element.prototype.scrollTo = function (...a) { if (this.classList && this.classList.contains("wa-messages") && /_willUpdate/.test(new Error().stack || "")) { window.__skipped += 1; return; } return o.apply(this, a); }; });
  await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })));
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.abort());
  const calls = {};
  await page.route(`${API}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (/^\/uploads\/img-/.test(p)) {
      const n = Number(p.match(/(\d+)\.svg/)[1]);
      await new Promise((r) => setTimeout(r, 150 + (n % 5) * 120));
      const w = n % 2 ? 640 : 360, h = n % 2 ? 360 : 560;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#9cc"/></svg>` });
    }
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: chats.map((c) => ({ ...c, ...convPatch })) });
    const m = p.match(/^\/chats\/(\d+)$/);
    if (m && req.method() === "GET") {
      const cid = Number(m[1]); calls[cid] = (calls[cid] || 0) + 1;
      await new Promise((r) => setTimeout(r, apiDelay));
      const conv = { ...chats[cid - 1], ...convPatch, mensagens_bloqueadas: false, ...(serverPatch && calls[cid] > 1 ? serverPatch : {}) };
      return route.fulfill({ json: { conversa: conv, mensagens: msgs(cid, 40, media), next_cursor: hasMore ? "2026-07-25T12:00:00.000Z" : null, next_cursor_id: hasMore ? 1 : null, tags: [] } });
    }
    return route.fulfill({ json: {} });
  });
}

async function armProbe(page, ms = 3000) {
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
        const firstRow = root && root.firstElementChild;
        const footer = document.querySelector(".wa-footer, .wa-composerStack");
        window.__probe.push({
          t: Math.round(performance.now() - s), op: Math.round(op * 100) / 100,
          st: Math.round(el.scrollTop), sh: el.scrollHeight, ch: el.clientHeight, top: Math.round(r.top), pos,
          cls: el.className.includes("opening"), glide: el.getAttribute("data-media-glide") === "1",
          rootTop: root ? root.offsetTop : null, rowTy: firstRow ? firstRow.style.transform : "",
          kind: root ? (root.className.includes("static") ? "S" : "V") : "-",
          hh: Math.round(document.querySelector(".wa-header")?.getBoundingClientRect().height || 0),
          fh: footer ? Math.round(footer.getBoundingClientRect().height) : 0,
          gap: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), lastB: last ? Math.round(last.getBoundingClientRect().bottom - r.bottom) : null,
          veil: !!document.querySelector(".wa-threadOpeningVeil, [class*='OpeningVeil']"),
        });
      }
      if (performance.now() - s < limit) tick();
    };
    mc.port1.onmessage = f; tick();
  }, ms);
}

function fmt(x) { return `${x.t}:op${x.op}:st${x.st}/sh${x.sh}/ch${x.ch}:${x.cls ? "O" : "-"}${x.glide ? "G" : ""}:rt${x.rootTop}:${x.rowTy}:${x.kind}:hh${x.hh}:fh${x.fh}:g${x.gap}:lb${x.lastB}`; }
function analyse(samples) {
  const jumps = []; let prev = null; let started = false; const reveals = [];
  let wasVis = false;
  for (const s of samples) {
    if (!started && (s.cls || s.op <= 0.02)) started = true;
    if (!started) continue;
    const vis = s.op > 0.02; if (vis !== wasVis) { reveals.push(s.t); wasVis = vis; }
    if (!vis) { prev = null; continue; }
    if (prev) {
      let maxd = 0, who = null;
      for (const k of Object.keys(s.pos)) if (k in prev.pos) { const d = Math.abs(s.pos[k] - prev.pos[k]); if (d > maxd) { maxd = d; who = k; } }
      if (maxd > 1) jumps.push({ t: s.t, d: maxd, dt: s.t - prev.t, id: who, ctx: samples.filter((x) => Math.abs(x.t - s.t) < 70).map(fmt) });
    }
    prev = s;
  }
  const end = samples[samples.length - 1];
  return { reveals, jumps: jumps.filter((j) => j.d / Math.max(1, Math.round(j.dt / 16.7)) > 6), end: end && fmt(end) };
}

test(`D validar fix attach (PATCH=${process.env.PATCH || 0}): ${SCEN}`, async ({ page }, testInfo) => {
  const errs = []; page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/socket.io|WebSocket/.test(m.text())) errs.push(m.type() + ": " + m.text().slice(0, 220)); }); page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
  testInfo.attach && (globalThis.__errs = errs);
  const mob = testInfo.project.name.includes("mobile");
  const opts = {
    reopen: { media: process.env.MEDIA === "1", hasMore: process.env.HASMORE === "1" },
    closed: { serverPatch: { status_atendimento: "fechada", status_atendimento_real: "fechada" } },
    header: { serverPatch: { departamento_id: null } },
  }[SCEN] || {};
  await setup(page, { ...opts, apiDelay: Number(process.env.APID || 150) });
  await page.goto("/atendimento");
  const tap = async (n) => { const row = page.locator(".chat-list-row").filter({ hasText: n }); if (mob) await row.tap(); else await row.click(); };
  const back = async () => { if (mob) { await page.goBack(); await page.waitForTimeout(600); } else if (process.env.ESC === "1") { await page.keyboard.press("Escape"); await page.waitForTimeout(600); } };
  if (SCEN === "switch") {
    // A -> B -> A rápido (desktop): mede a conversa final
    await tap("Contato Um"); await page.waitForTimeout(1500);
    await tap("Contato Dois"); await page.waitForTimeout(1500);
    await armProbe(page, 3000);
    await tap("Contato Um"); await page.waitForTimeout(90); await tap("Contato Tres"); await page.waitForTimeout(90); await tap("Contato Um");
    await page.waitForTimeout(3100);
    const a = analyse(await page.evaluate(() => window.__probe));
    console.log(`[${testInfo.project.name}] switch:`, JSON.stringify(a, null, 1));
    return;
  }
  await armProbe(page, 3000); await tap("Contato Um"); await page.waitForTimeout(3100);
  console.log(`[${testInfo.project.name}] ${SCEN} 1a:`, JSON.stringify(analyse(await page.evaluate(() => window.__probe)), null, 1));
  await back(); await tap("Contato Dois"); await page.waitForTimeout(1500); await back();
  await armProbe(page, 3000); await tap("Contato Um"); await page.waitForTimeout(3100);
  console.log(`[${testInfo.project.name}] ${SCEN} 2a:`, JSON.stringify(analyse(await page.evaluate(() => window.__probe)), null, 1));
  console.log("CONSOLE:", JSON.stringify(errs.slice(0, 15)));
});
