// Lente B (auditoria 25/11/2026) — helpers de mock realista + sonda pós-pintura.
// Arquivo TEMPORÁRIO de auditoria (não é spec). Só mocks em localhost:5000; tudo o que sair
// para outro host é abortado.
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

export const API = process.env.VITE_API_URL || "http://localhost:5000";
export const audioOgg = readFileSync(new URL("../fixtures/voz-2s.ogg", import.meta.url));

/* ---------- PNG raster real (largura/altura intrínsecas, decode de verdade) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const pngCache = new Map();
/** PNG RGB w×h com faixas/ruído leve (decode não trivial, compressão razoável). */
export function makePng(w, h, seed = 1) {
  const key = `${w}x${h}:${seed}`;
  if (pngCache.has(key)) return pngCache.get(key);
  const row = 1 + w * 3;
  const raw = Buffer.alloc(row * h);
  let s = seed * 9301 + 49297;
  for (let y = 0; y < h; y++) {
    raw[y * row] = 0;
    const band = Math.floor(y / 40) % 2;
    for (let x = 0; x < w; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = (s >> 16) & 15;
      const o = y * row + 1 + x * 3;
      raw[o] = (band ? 120 : 200) + n;
      raw[o + 1] = ((x / w) * 180) | 0;
      raw[o + 2] = ((y / h) * 200) | 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  pngCache.set(key, png);
  return png;
}
/* Pequeno PDF válido. */
export const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function mkChat(id, nome, extra = {}) {
  return {
    id, contato_nome: nome, nome_contato_cache: nome, telefone: "5511999990" + String(100 + id),
    status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento",
    atendente_id: 1, departamento_id: 1, unread_count: 0,
    ultima_atividade: new Date(Date.UTC(2026, 10, 25, 12) - id * 60000).toISOString(),
    ...extra,
  };
}

/**
 * Instala sessão + rotas. `handlers.media(pathname, url)` devolve {status, contentType, body, delay}
 * ou null; `handlers.chatById(cid, callNo, url)` devolve {payload, delay}.
 */
export async function installMocks(page, { chats, chatById, media, onPost, extra } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "Atendente B", perfil: "admin", role: "admin", departamento_ids: [1] } }));
  });
  // Qualquer host que não seja o preview local ou a API mock: aborta (nunca sai para a rede).
  await page.route((url) => {
    const u = new URL(url);
    return !(u.hostname === "localhost" || u.hostname === "127.0.0.1");
  }, (r) => r.abort());
  const calls = {};
  const log = [];
  await page.route(`${API}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    const m0 = media ? await media(p, url, req) : null;
    if (m0) {
      if (m0.delay) await sleep(m0.delay);
      if (m0.never) return; // pendente para sempre
      if (m0.abort) return route.abort();
      return route.fulfill({ status: m0.status || 200, contentType: m0.contentType, body: m0.body, headers: m0.headers });
    }
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, nome: "Atendente B", perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/config/empresa") return route.fulfill({ json: { id: 1, nome: "Empresa B" } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats/counts") return route.fulfill({ json: { todas: chats.length, minha_fila: chats.length, em_atendimento: chats.length } });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: chats });
    const m = p.match(/^\/chats\/(\d+)$/);
    if (m && req.method() === "GET") {
      const cid = Number(m[1]); calls[cid] = (calls[cid] || 0) + 1;
      const r = chatById(cid, calls[cid], url);
      log.push({ cid, n: calls[cid], cursor: url.searchParams.get("cursor"), limit: url.searchParams.get("limit") });
      if (r.delay) await sleep(r.delay);
      return route.fulfill({ json: r.payload });
    }
    if (onPost && req.method() === "POST") {
      const r = await onPost(p, req);
      if (r) return route.fulfill(r);
    }
    if (extra) { const r = await extra(p, url, req); if (r) return route.fulfill(r); }
    return route.fulfill({ json: {} });
  });
  return { calls, log };
}

/** Captura console/pageerror. */
export function captureConsole(page) {
  const out = [];
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") out.push({ t, text: msg.text().slice(0, 400) });
  });
  page.on("pageerror", (err) => out.push({ t: "pageerror", text: String(err?.stack || err).slice(0, 600) }));
  return out;
}

/**
 * Sonda pós-pintura (rAF -> MessageChannel), frame a frame. Grava posição e altura de cada
 * bolha visível, scroll, máscara, véu, cabeçalho/rodapé, raiz da lista e layout-shifts.
 */
export async function armProbe(page, ms = 3000) {
  await page.evaluate((limit) => {
    window.__probe = []; window.__ls = [];
    const s = performance.now(); window.__probeStart = s;
    try {
      if (!window.__lsObs) {
        window.__lsObs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            (window.__ls || (window.__ls = [])).push({
              t: Math.round(e.startTime - (window.__probeStart || 0)), v: Math.round(e.value * 10000) / 10000,
              src: (e.sources || []).slice(0, 4).map((x) => {
                const n = x.node; let d = "?";
                if (n && n.nodeType === 1) d = `${n.tagName.toLowerCase()}.${String(n.className || "").split(" ").slice(0, 3).join(".")}${n.getAttribute && n.getAttribute("data-msg-id") ? "#" + n.getAttribute("data-msg-id") : ""}`;
                else if (n) d = n.nodeName;
                return { d, pr: [Math.round(x.previousRect.y), Math.round(x.previousRect.height)], cr: [Math.round(x.currentRect.y), Math.round(x.currentRect.height)] };
              }),
            });
          }
        });
        window.__lsObs.observe({ type: "layout-shift", buffered: false });
      }
    } catch { /* sem suporte */ }
    const mc = new MessageChannel();
    const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    const f = () => {
      const el = document.querySelector(".wa-messages");
      const veil = document.querySelector(".wa-openVeil");
      const hdr = document.querySelector(".wa-header");
      const foot = document.querySelector(".wa-footer");
      const rec = { t: Math.round(performance.now() - s) };
      rec.vop = veil ? Math.round(Number(getComputedStyle(veil).opacity) * 100) / 100 : -1;
      rec.hh = hdr ? Math.round(hdr.getBoundingClientRect().height) : 0;
      rec.fh = foot ? Math.round(foot.getBoundingClientRect().height) : 0;
      rec.list = !!document.querySelector(".chat-list-row") && (() => { const r = document.querySelector(".chat-list-row").getBoundingClientRect(); return r.width > 0 && r.right > 0 && r.left < innerWidth; })();
      if (el) {
        const root = el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
        const op = root ? Number(getComputedStyle(root).opacity) : 0;
        const r = el.getBoundingClientRect();
        rec.sy = Math.round(r.top); rec.sH = Math.round(r.height);
        const all = [...el.querySelectorAll("[data-msg-id]")];
        const bubbles = all.filter((b) => { const br = b.getBoundingClientRect(); return br.height > 0 && br.bottom > r.top && br.top < r.bottom; });
        const pos = {}; const hts = {};
        bubbles.forEach((b) => { const br = b.getBoundingClientRect(); const id = b.getAttribute("data-msg-id"); pos[id] = Math.round(br.top - r.top); hts[id] = Math.round(br.height); });
        // alturas de TODAS as bolhas (para achar quem cresceu fora da tela)
        const hAll = {}; all.forEach((b) => { hAll[b.getAttribute("data-msg-id")] = Math.round(b.getBoundingClientRect().height); });
        rec.hAll = hAll;
        let lastBottomGap = null;
        if (all.length) { const lb = all[all.length - 1].getBoundingClientRect(); lastBottomGap = Math.round(r.bottom - lb.bottom); }
        Object.assign(rec, {
          op: Math.round(op * 100) / 100, st: Math.round(el.scrollTop), sh: el.scrollHeight, ch: el.clientHeight,
          gap: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), lbg: lastBottomGap,
          pos, hts, cls: el.className.includes("opening"), glide: el.getAttribute("data-media-glide") === "1",
          kind: root ? (root.className.includes("static") ? "static" : "virtual") : "none",
          lt: root ? root.offsetTop : -1, n: bubbles.length, na: all.length,
          lastId: all.length ? all[all.length - 1].getAttribute("data-msg-id") : null,
          // linhas virtuais transbordam a raiz em scrollMargin px (translateY(start) já inclui a margem)
          ovf: (() => { if (!root || !root.className.includes("virtual")) return null; const rows = root.children; if (!rows.length) return null; let mx = -1e9; for (const rw of rows) { const b = rw.getBoundingClientRect().bottom; if (b > mx) mx = b; } return Math.round(mx - root.getBoundingClientRect().bottom); })(),
        });
      }
      window.__probe.push(rec);
      if (performance.now() - s < limit) tick();
    };
    mc.port1.onmessage = f;
    tick();
  }, ms);
}

export const MAX_PASSO = 24;
export const passoPorFrame = (j) => j.d / Math.max(1, Math.round((j.dt || 16.7) / 16.7));

/** Analisa amostras: saltos de bolhas visíveis (após máscara), frames brancos, fundo descolado. */
export function analyse(samples, { fromStart = false } = {}) {
  const jumps = []; let prev = null; let started = fromStart; let wasVisible = false;
  const reveals = []; const white = []; const bottomGaps = []; const kinds = new Set();
  const hh = new Set(); const fh = new Set(); const hDelta = [];
  let revealT = null;
  for (const s of samples) {
    if (!("op" in s)) continue;
    if (!started && (s.cls || s.op <= 0.02)) started = true;
    if (!started) continue;
    kinds.add(s.kind); hh.add(s.hh); fh.add(s.fh);
    const visible = s.op > 0.02;
    if (visible !== wasVisible) { reveals.push({ t: s.t, op: s.op }); wasVisible = visible; if (visible && revealT == null) revealT = s.t; }
    // "branco": nem véu nem conteúdo visíveis com uma conversa aberta
    if (s.op <= 0.05 && s.vop <= 0.05 && s.na > 0) white.push(s.t);
    if (!visible) { prev = null; continue; }
    if (revealT != null && s.t - revealT > 150 && s.lbg != null && s.lbg < -24 && s.op > 0.9) bottomGaps.push({ t: s.t, lbg: s.lbg, gap: s.gap });
    if (prev) {
      let maxd = 0, who = null;
      for (const k of Object.keys(s.pos)) if (k in prev.pos) { const d = Math.abs(s.pos[k] - prev.pos[k]); if (d > maxd) { maxd = d; who = k; } }
      // bolhas que mudaram de ALTURA neste frame (causa provável)
      const grew = [];
      const hs = s.hAll || s.hts, hp = prev.hAll || prev.hts;
      for (const k of Object.keys(hs)) if (k in hp && Math.abs(hs[k] - hp[k]) > 1) grew.push(`${k}:${hp[k]}->${hs[k]}`);
      for (const k of Object.keys(hs)) if (!(k in hp)) grew.push(`+${k}:${hs[k]}`);
      if (maxd > 1) jumps.push({ t: s.t, d: maxd, dt: s.t - prev.t, id: who, op: s.op, st: s.st, dst: s.st - prev.st, sh: s.sh, dsh: s.sh - prev.sh, lt: s.lt, dlt: s.lt - prev.lt, kind: s.kind, glide: s.glide, grew: grew.slice(0, 4), n: s.n, na: s.na });
    }
    prev = s;
  }
  return { jumps, bruscos: jumps.filter((j) => passoPorFrame(j) > MAX_PASSO), reveals, white, bottomGaps, kinds: [...kinds], hh: [...hh], fh: [...fh] };
}

export async function collect(page) {
  return page.evaluate(() => ({ probe: window.__probe || [], ls: window.__ls || [] }));
}

/* ---------- Rastreio de escritas de scrollTop / classe da máscara (diagnóstico) ---------- */
export async function installScrollTrace(page) {
  await page.addInitScript(() => {
    window.__sw = [];
    const rel = () => Math.round(performance.now() - (window.__probeStart || 0));
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
    const stack = () => String(new Error().stack || "").split("\n").slice(2, 9).map((l) => l.trim()).join(" | ");
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      get: desc.get,
      set(v) {
        const isM = this.classList && this.classList.contains("wa-messages");
        const b = isM ? desc.get.call(this) : 0;
        desc.set.call(this, v);
        if (isM && window.__sw.length < 4000) {
          window.__sw.push({ t: rel(), k: "st", v: Math.round(v), b: Math.round(b), a: Math.round(desc.get.call(this)), sh: this.scrollHeight, ch: this.clientHeight, cls: this.className.includes("opening"), g: this.getAttribute("data-media-glide") === "1", s: stack() });
        }
      },
    });
    const origScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (...args) {
      const isM = this.classList && this.classList.contains("wa-messages");
      const b = isM ? desc.get.call(this) : 0;
      const r = origScrollTo.apply(this, args);
      if (isM) window.__sw.push({ t: rel(), k: "scrollTo", v: JSON.stringify(args).slice(0, 60), b: Math.round(b), a: Math.round(desc.get.call(this)), s: stack() });
      return r;
    };
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        const el = m.target;
        if (!el.classList || !el.classList.contains("wa-messages")) continue;
        window.__sw.push({ t: rel(), k: "attr", n: m.attributeName, cls: el.className.includes("opening"), g: el.getAttribute("data-media-glide") === "1", st: Math.round(desc.get.call(el)), sh: el.scrollHeight, ch: el.clientHeight });
      }
    });
    const start = () => mo.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["class", "data-media-glide"] });
    if (document.documentElement) start(); else document.addEventListener("DOMContentLoaded", start);
  });
}

export async function throttleCpu(page, rate) {
  if (!rate || rate <= 1) return;
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate });
}
