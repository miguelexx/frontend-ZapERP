// AUDITORIA (lente C) — estabilidade de ALTURA por tipo de bolha depois da revelação.
// Temporário: não faz parte da suíte. Mede, depois da pintura (rAF -> MessageChannel), a altura
// de cada linha visível e o deslocamento por frame das bolhas visíveis, numa 1.ª abertura em que
// a mídia chega DEPOIS da máscara cair (latência realista: 900ms / 4000ms).
import { test, expect } from "@playwright/test";

const API = process.env.VITE_API_URL || "http://localhost:5000";

const svg = (w, h, fill = "#9cc") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${fill}"/></svg>`;
const smallThumb = "data:image/svg+xml;base64," + Buffer.from(svg(64, 64, "#c69")).toString("base64");

const iso = (i) => new Date(Date.UTC(2026, 10, 20, 12) + i * 60000).toISOString();

function conv(cid, tail) {
  const base = (i, extra) => ({
    id: cid * 1000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido",
    criado_em: iso(i), ...extra,
  });
  const list = [];
  for (let i = 0; i < 10; i += 1) list.push(base(i, { tipo: "texto", texto: `Msg ${i} ${"conteudo ".repeat((i % 4) + 2)}` }));
  tail.forEach((t, k) => list.push({ ...base(10 + k, t), direcao: t.direcao || "in" }));
  list.push(base(10 + tail.length, { tipo: "texto", texto: "Ultima mensagem da conversa" }));
  return list;
}

const SCEN = {
  11: { nome: "C Figurinha", tail: [{ tipo: "sticker", url: "/uploads/c-stk-512x512-d900-1.svg" }] },
  12: { nome: "C Video", tail: [{ tipo: "video", url: "/uploads/c-vid-d900.webm" }] },
  13: { nome: "C LinkPeq", tail: [{ tipo: "texto", texto: "olha https://exemplo.com/a", reply_meta: { link_preview: { url: "https://exemplo.com/a", title: "Exemplo de pagina com titulo", description: "Descricao curta do link", preview: smallThumb } } }] },
  14: { nome: "C LinkAlto", tail: [{ tipo: "texto", texto: "olha https://exemplo.com/b", reply_meta: { link_preview: { url: "https://exemplo.com/b", title: "Video vertical", description: "Reels", preview: `${API}/uploads/c-lp-600x650-d900.svg` } } }] },
  15: { nome: "C Fotos", tail: [1, 2, 3].map((n) => ({ tipo: "imagem", url: `/uploads/c-img-360x640-d900-${n}.svg` })) },
  16: { nome: "C FotosLentas", tail: [1, 2].map((n) => ({ tipo: "imagem", url: `/uploads/c-img-640x360-d4200-${n}.svg` })) },
  17: { nome: "C Erro", tail: [{ tipo: "imagem", url: "/uploads/c-404.svg" }] },
  18: { nome: "C Print", tail: [{ tipo: "imagem", url: "/uploads/c-img-540x1170-d900-9.svg" }] },
};

const mkChat = (id, nome) => ({
  id, contato_nome: nome, nome_contato_cache: nome, telefone: "55119888800" + id,
  status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento",
  atendente_id: 1, departamento_id: 1, unread_count: 0,
  ultima_atividade: new Date(Date.UTC(2026, 10, 20, 20) - id * 60000).toISOString(),
});
const chats = Object.entries(SCEN).map(([id, s]) => mkChat(Number(id), s.nome));

async function makeWebm(page) {
  return page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 180; c.height = 320;
    const ctx = c.getContext("2d");
    const stream = c.captureStream(15);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    let i = 0;
    const iv = setInterval(() => { ctx.fillStyle = i++ % 2 ? "#c96" : "#69c"; ctx.fillRect(0, 0, 180, 320); }, 50);
    rec.start(100);
    await new Promise((r) => setTimeout(r, 800));
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.stop(); clearInterval(iv);
    await stopped;
    const buf = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
    let s = ""; for (let k = 0; k < buf.length; k += 1) s += String.fromCharCode(buf[k]);
    return btoa(s);
  });
}

async function setup(page, webmB64) {
  await page.addInitScript(() => {
    localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } }));
  });
  const webm = webmB64 ? Buffer.from(webmB64, "base64") : null;
  await page.route(`${API}/**`, async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (p === "/uploads/c-404.svg") { await new Promise((r) => setTimeout(r, 300)); return route.fulfill({ status: 404, body: "nf" }); }
    let m = p.match(/^\/uploads\/c-(?:img|stk|lp)-(\d+)x(\d+)-d(\d+)/);
    if (m) {
      await new Promise((r) => setTimeout(r, Number(m[3])));
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg(Number(m[1]), Number(m[2])) });
    }
    m = p.match(/^\/uploads\/c-vid-d(\d+)\.webm$/);
    if (m && webm) {
      await new Promise((r) => setTimeout(r, Number(m[1])));
      return route.fulfill({ status: 200, contentType: "video/webm", body: webm });
    }
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: chats });
    m = p.match(/^\/chats\/(\d+)$/);
    if (m && req.method() === "GET") {
      const cid = Number(m[1]);
      await new Promise((r) => setTimeout(r, 150));
      const chat = chats.find((c) => c.id === cid);
      return route.fulfill({ json: { conversa: { ...chat, mensagens_bloqueadas: false }, mensagens: conv(cid, SCEN[cid].tail), next_cursor: null, tags: [] } });
    }
    return route.fulfill({ json: {} });
  });
}

async function armProbe(page, ms) {
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
        const rows = [...el.querySelectorAll("[data-msg-id]")].filter((b) => { const br = b.getBoundingClientRect(); return br.bottom > r.top && br.top < r.bottom; });
        const pos = {}; const hs = {};
        rows.forEach((b) => {
          const br = b.getBoundingClientRect(); const id = b.getAttribute("data-msg-id");
          pos[id] = Math.round(br.top - r.top); hs[id] = Math.round(br.height);
        });
        window.__probe.push({ t: Math.round(performance.now() - s), op: Math.round(op * 100) / 100, cls: el.className.includes("opening"), pos, hs, gap: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight) });
      }
      if (performance.now() - s < limit) tick();
    };
    mc.port1.onmessage = f;
    tick();
  }, ms);
}

function analyse(samples) {
  const jumps = []; const hchanges = {}; let prev = null; let started = false; let revealT = null;
  for (const s of samples) {
    if (!started && (s.cls || s.op <= 0.02)) started = true;
    if (!started) continue;
    const visible = s.op > 0.02;
    if (!visible) { prev = null; continue; }
    if (revealT == null) revealT = s.t;
    if (prev) {
      let maxd = 0, who = null;
      for (const k of Object.keys(s.pos)) if (k in prev.pos) { const d = Math.abs(s.pos[k] - prev.pos[k]); if (d > maxd) { maxd = d; who = k; } }
      const dt = s.t - prev.t; const step = maxd / Math.max(1, Math.round(dt / 16.7));
      if (maxd > 1) jumps.push({ t: s.t, d: maxd, dt, step: Math.round(step), id: who, gap: s.gap });
      for (const k of Object.keys(s.hs)) if (k in prev.hs && Math.abs(s.hs[k] - prev.hs[k]) > 1) {
        (hchanges[k] ||= []).push({ t: s.t, from: prev.hs[k], to: s.hs[k], dt });
      }
    }
    prev = s;
  }
  const bruscos = jumps.filter((j) => j.step > 24);
  const maxStep = jumps.reduce((a, j) => Math.max(a, j.step), 0);
  const totalMove = jumps.reduce((a, j) => a + j.d, 0);
  return { revealT, bruscos, maxStep, totalMove, hchanges, nJumpFrames: jumps.length };
}

async function openAndMeasure(page, testInfo, nome, ms = 5200) {
  const mob = testInfo.project.name.includes("mobile");
  const cid = Object.entries(SCEN).find(([, v]) => v.nome === nome)[0];
  const row = page.locator(`.chat-list-row[data-chat-id="${cid}"]`);
  await armProbe(page, ms);
  if (mob) await row.tap(); else await row.click();
  await page.waitForTimeout(ms + 200);
  const a = analyse(await page.evaluate(() => window.__probe));
  const final = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll(".wa-messages [data-msg-id]").forEach((r) => {
      const b = r.querySelector(".wa-bubble-imgLink, .wa-bubble-videoLink, .wa-linkPrev, .wa-bubble-img");
      if (b) { const br = b.getBoundingClientRect(); out[r.getAttribute("data-msg-id")] = { cls: b.className, w: Math.round(br.width), h: Math.round(br.height) }; }
    });
    return out;
  });
  console.log(`[C ${testInfo.project.name}${testInfo.title.includes("reduced") ? " RM" : ""}] ${nome}:`, JSON.stringify({ ...a, final }));
  if (mob) { await page.goBack(); await page.waitForTimeout(500); }
  return a;
}

test.describe("lente C — altura por tipo de bolha", () => {
  test("abertura com midia tardia (motion normal)", async ({ page }, testInfo) => {
    await page.goto("about:blank");
    const webm = await makeWebm(page).catch(() => null);
    await setup(page, webm);
    await page.goto("/atendimento");
    await page.waitForSelector(".chat-list-row");
    const res = {};
    for (const s of Object.values(SCEN)) res[s.nome] = await openAndMeasure(page, testInfo, s.nome, s.nome === "C FotosLentas" ? 6500 : 5200);
    expect(Object.keys(res).length).toBeGreaterThan(0);
  });

  test("abertura com fotos tardias (reduced motion = Windows sem efeitos de animacao)", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setup(page, null);
    await page.goto("/atendimento");
    await page.waitForSelector(".chat-list-row");
    for (const nome of ["C Fotos", "C Print"]) await openAndMeasure(page, testInfo, nome);
  });
});
