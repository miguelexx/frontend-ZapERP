// Lente A (auditoria 25/11/2026) — mocks REALISTAS para a abertura de conversa.
// Fotos raster de tamanhos reais (PNG gerado aqui), atrasos 300–5000ms, 404, pendente para
// sempre, /media/proxy, áudio sem duração, figurinha, vídeo retrato real (webm gravado no
// próprio Chromium), cartão de link, resposta a foto, reação, nota interna, triagem do bot,
// grupo com remetentes, separadores de dia. Só intercepta localhost:5000 e hosts *.test.
import zlib from "node:zlib";
import { readFileSync } from "node:fs";

export const API = process.env.VITE_API_URL || "http://localhost:5000";
export const audioOgg = readFileSync(new URL("../fixtures/voz-2s.ogg", import.meta.url));

/* ---------------- PNG ---------------- */
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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const pngCache = new Map();
export function makePng(w, h, { alpha = false, hue = 0 } = {}) {
  const key = `${w}x${h}:${alpha}:${hue}`;
  if (pngCache.has(key)) return pngCache.get(key);
  const bpp = alpha ? 4 : 3;
  const rowLen = 1 + w * bpp;
  const raw = Buffer.alloc(rowLen * h);
  for (let y = 0; y < h; y++) {
    const off = y * rowLen;
    raw[off] = 0;
    const r = (Math.round((y * 255) / h) + hue) & 255;
    const g = (120 + hue * 3) & 255;
    const b = (255 - Math.round((y * 255) / h)) & 255;
    for (let x = 0; x < w; x++) {
      const p = off + 1 + x * bpp;
      const stripe = (x >> 5) & 1 ? 24 : 0;
      raw[p] = r ^ stripe;
      raw[p + 1] = g ^ ((y >> 6) & 1 ? 16 : 0);
      raw[p + 2] = b;
      if (alpha) raw[p + 3] = x > w * 0.08 && x < w * 0.92 && y > h * 0.08 && y < h * 0.92 ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  const out = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  pngCache.set(key, out);
  return out;
}

/* ---------------- vídeo retrato real (webm) ---------------- */
let videoCache = null;
export async function makeWebm(browser) {
  if (videoCache) return videoCache;
  const page = await browser.newPage();
  await page.setContent("<canvas id=c width=360 height=640></canvas>");
  const b64 = await page.evaluate(async () => {
    const c = document.getElementById("c");
    const ctx = c.getContext("2d");
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    const parts = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    let f = 0;
    let run = true;
    const draw = () => {
      ctx.fillStyle = `hsl(${(f * 7) % 360},60%,50%)`;
      ctx.fillRect(0, 0, 360, 640);
      ctx.fillStyle = "#fff";
      ctx.fillRect(40 + (f % 200), 300, 80, 80);
      f++;
      if (run) requestAnimationFrame(draw);
    };
    draw();
    rec.start();
    await new Promise((r) => setTimeout(r, 1300));
    run = false;
    await new Promise((r) => { rec.onstop = r; rec.stop(); });
    const blob = new Blob(parts, { type: "video/webm" });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return btoa(s);
  });
  await page.close();
  videoCache = Buffer.from(b64, "base64");
  return videoCache;
}

/* ---------------- dados ---------------- */
export const USER = { id: 1, nome: "Miguel", perfil: "admin", role: "admin", departamento_ids: [1], company_id: 7 };

const now = Date.now();
const DAY = 86400000;
const iso = (dayOffset, minute) => new Date(now - dayOffset * DAY + (minute - 600) * 60000).toISOString();

export function mkChat(id, nome, extra = {}) {
  return {
    id, contato_nome: nome, nome_contato_cache: nome, telefone: "5511988800" + String(id).padStart(3, "0"),
    status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento",
    atendente_id: 2, atendente_nome: "Eva", departamento_id: null, unread_count: 0,
    ultima_atividade: new Date(now - id * 60000).toISOString(),
    ultima_mensagem: "Mensagem", ...extra,
  };
}

/** Spec de imagem: w×h, atraso e comportamento (ok|404|hang). */
const IMG_SPECS = new Map();
export function imgUrl(key, spec, style = "uploads") {
  IMG_SPECS.set(key, spec);
  if (style === "proxy") return `https://mmg.whatsapp-mock.test/m/${key}.png`;
  return `/uploads/${key}.png`;
}
export function imgSpec(key) { return IMG_SPECS.get(key); }

const AUD_SPECS = new Map();
export function audUrl(key, spec) { AUD_SPECS.set(key, spec); return `/uploads/${key}.ogg`; }
export function audSpec(key) { return AUD_SPECS.get(key); }
const VID_SPECS = new Map();
export function vidUrl(key, spec) { VID_SPECS.set(key, spec); return `/uploads/${key}.webm`; }
export function vidSpec(key) { return VID_SPECS.get(key); }

/**
 * Conversa "carregada de fotos e áudios" (cenário do print do Miguel): histórico de 3 dias e,
 * no fim (o que aparece ao abrir), álbum de fotos de celular, áudio sem duração, figurinha,
 * vídeo retrato, resposta a foto, reação, cartão de link.
 * `variant`: 'ok' (atrasos 300–2500ms) | 'slow' (3–5s) | 'broken' (404/pendente/500) | 'proxy'.
 */
export function mediaConversation(cid, { variant = "ok", extra = 0, group = false, idPatch = false } = {}) {
  const P = `c${cid}`;
  const d = (ok) => (variant === "slow" ? 3000 + (ok % 5) * 500 : ok);
  const beh = (i) => (variant === "broken" ? (i % 3 === 0 ? "404" : i % 3 === 1 ? "hang" : "ok") : "ok");
  const style = variant === "proxy" ? "proxy" : "uploads";
  const out = [];
  let n = 0;
  const id = () => cid * 1000 + n++;
  const base = (dir, day, min, extraFields = {}) => {
    const m = { id: id(), conversa_id: cid, direcao: dir, status: dir === "out" ? "lido" : "recebido", criado_em: iso(day, min), ...extraFields };
    if (group && dir === "in") {
      const who = m.id % 3;
      m.remetente_nome = ["Ana Paula", "Bruno", "Carla Souza"][who];
      m.remetente_telefone = "55119777700" + who;
    }
    if (dir === "out" && !extraFields.__bot) m.usuario_nome = "Eva";
    delete m.__bot;
    return m;
  };
  // Dia -2: texto, triagem do bot, nota interna
  out.push(base("in", 2, 0, { tipo: "texto", texto: "Oi, boa tarde" }));
  out.push(base("out", 2, 1, { __bot: true, tipo: "texto", texto: "Olá! Para agilizar, escolha o setor:\n1 - Vendas\n2 - Suporte\n3 - Financeiro" }));
  out.push(base("in", 2, 2, { tipo: "texto", texto: "2" }));
  out.push(base("out", 2, 3, { __bot: true, tipo: "texto", texto: "Perfeito! Você escolheu Suporte. Em instantes um atendente vai falar com você." }));
  out.push(base("out", 2, 4, { tipo: "texto", mensagem_interna: true, direcao: "interna", texto: "Nota interna: cliente VIP, prioridade." }));
  for (let i = 0; i < 8; i++) out.push(base(i % 2 ? "out" : "in", 2, 10 + i, { tipo: "texto", texto: `Histórico ${i} ` + "texto de conversa antiga ".repeat((i % 4) + 1) }));
  // Dia -1: mídia antiga
  out.push(base("in", 1, 0, { tipo: "imagem", url: imgUrl(`${P}-old-land`, { w: 1600, h: 900, delay: d(400), b: beh(1) }, style) }));
  out.push(base("in", 1, 1, { tipo: "audio", url: audUrl(`${P}-old-aud`, { delay: 300, b: "ok" }), audio_duracao_sec: 2 }));
  out.push(base("in", 1, 2, { tipo: "documento", url: "/uploads/orcamento.pdf", texto: "orcamento-2026.pdf", nome_arquivo: "orcamento-2026.pdf" }));
  out.push(base("out", 1, 3, { tipo: "texto", texto: "Mensagem longa: " + "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(9) }));
  out.push(base("in", 1, 4, { tipo: "imagem", url: imgUrl(`${P}-old-sq`, { w: 1080, h: 1080, delay: d(500), b: beh(2) }, style) }));
  for (let i = 0; i < 6; i++) out.push(base(i % 2 ? "out" : "in", 1, 10 + i, { tipo: "texto", texto: `Ontem ${i} ` + "mais conteudo ".repeat((i % 3) + 1) }));
  // Hoje: o que aparece ao abrir
  out.push(base("in", 0, 0, { tipo: "texto", texto: "Bom dia! Seguem as fotos do problema" }));
  out.push(base("in", 0, 1, { tipo: "imagem", url: imgUrl(`${P}-shot1`, { w: 1080, h: 1920, delay: d(900), b: beh(0) }, style) }));
  out.push(base("in", 0, 1, { tipo: "imagem", url: imgUrl(`${P}-shot2`, { w: 1080, h: 2400, delay: d(1400), b: beh(1) }, style) }));
  out.push(base("in", 0, 1, { tipo: "imagem", url: imgUrl(`${P}-land`, { w: 1600, h: 900, delay: d(600), b: beh(2) }, style) }));
  const imgSq = base("in", 0, 2, { tipo: "imagem", texto: "essa é a etiqueta", url: imgUrl(`${P}-sq`, { w: 1080, h: 1080, delay: d(2000), b: beh(3) }, style) });
  out.push(imgSq);
  const recebi = base("out", 0, 3, { tipo: "texto", texto: "Recebi as fotos, vou verificar" });
  out.push(recebi);
  out.push(base("in", 0, 3, { tipo: "reaction", texto: "Reação: 👍", reply_meta: { replyToId: recebi.id } }));
  out.push(base("in", 0, 4, { tipo: "audio", url: audUrl(`${P}-aud1`, { delay: 1500, b: variant === "broken" ? "500" : "ok" }) }));
  out.push(base("in", 0, 5, { tipo: "sticker", url: imgUrl(`${P}-stk`, { w: 512, h: 512, alpha: true, delay: d(800), b: beh(4) }, style) }));
  out.push(base("in", 0, 6, { tipo: "video", url: vidUrl(`${P}-vid`, { delay: 700, b: variant === "broken" ? "404" : "ok" }) }));
  out.push(base("out", 0, 7, { tipo: "texto", texto: "Essa aqui?", reply_meta: { replyToId: imgSq.id, name: "Cliente", snippet: "", thumb: `${API}/uploads/${P}-thumb.png`, reply_kind: "imagem" } }));
  IMG_SPECS.set(`${P}-thumb`, { w: 200, h: 200, delay: 500, b: "ok" });
  out.push(base("in", 0, 8, { tipo: "imagem", url: imgUrl(`${P}-tall`, { w: 1080, h: 3000, delay: d(2500), b: beh(5) }, style) }));
  out.push(base("in", 0, 9, { tipo: "texto", texto: "👍👍" }));
  IMG_SPECS.set(`${P}-og`, { w: 1200, h: 1200, delay: variant === "slow" ? 3500 : 1200, b: variant === "broken" ? "404" : "ok" });
  out.push(base("out", 0, 10, {
    tipo: "texto", texto: "Veja o produto novo: https://loja.exemplo.test/produto/123",
    reply_meta: { link_preview: { url: "https://loja.exemplo.test/produto/123", title: "Produto 123 — Loja Exemplo", description: "Descrição do produto com detalhes", preview: `${API}/uploads/${P}-og.png` } },
  }));
  out.push(base("in", 0, 11, { tipo: "audio", url: audUrl(`${P}-aud2`, { delay: 1100, b: "ok" }), audio_duracao_sec: 2 }));
  out.push(base("in", 0, 12, { tipo: "texto", texto: "Consegue me ajudar hoje ainda?" }));
  for (let i = 0; i < extra; i++) out.push(base(i % 2 ? "in" : "out", 0, 13 + i, { tipo: "texto", texto: `Nova ${i} depois do cache` }));
  if (idPatch) {
    // Reabertura: mesmos dados com campos extras/ids do provedor (patches reais do backend).
    for (const m of out) { m.whatsapp_id = `wamid.${m.id}`; if (m.direcao === "out") m.status = "lido"; m.atualizado_em = new Date().toISOString(); }
  }
  return out;
}

export function textConversation(cid, n = 30) {
  return Array.from({ length: n }, (_, i) => ({
    id: cid * 1000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido",
    criado_em: iso(0, i), tipo: "texto", texto: `Mensagem ${i} ` + "texto ".repeat((i % 5) + 2),
    ...(i % 2 ? { usuario_nome: "Eva" } : {}),
  }));
}

/* ---------------- rotas ---------------- */
/**
 * opts.apiDelay (ms) | opts.convs: { [cid]: (call, url) => mensagens[] } | opts.pages
 * Devolve { calls } para inspecionar.
 */
export async function setupRoutes(page, { apiDelay = 0, chats, convs, browser, postDelay = 300 } = {}) {
  const webm = browser ? await makeWebm(browser) : null;
  await page.addInitScript((u) => {
    localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: u }));
  }, USER);
  const calls = {};
  const hold = [];
  // Playwright desliga o cache HTTP com page.route. Em produção /uploads é `immutable, 365d`:
  // com A_CACHE_EMU=1 a 2.ª entrega da mesma URL sai em ~15ms (≈ cache de disco).
  const served = new Set();
  const cacheEmu = process.env.A_CACHE_EMU === "1";
  const media = async (route, p) => {
    const key = p.split("/").pop().replace(/\.(png|ogg|webm|pdf)$/, "");
    const again = cacheEmu && served.has(key);
    served.add(key);
    if (/\.png$/.test(p)) {
      const s = imgSpec(key) || { w: 400, h: 300, delay: 300, b: "ok" };
      if (s.b === "hang") { hold.push(route); return; }
      await new Promise((r) => setTimeout(r, again ? 15 : s.delay));
      if (s.b === "404") return route.fulfill({ status: 404, body: "not found" });
      return route.fulfill({ status: 200, contentType: "image/png", body: makePng(s.w, s.h, { alpha: !!s.alpha, hue: key.length * 13 }) });
    }
    if (/\.ogg$/.test(p)) {
      const s = audSpec(key) || { delay: 300, b: "ok" };
      await new Promise((r) => setTimeout(r, again ? 15 : s.delay));
      if (s.b !== "ok") return route.fulfill({ status: Number(s.b) || 500, body: "erro" });
      return route.fulfill({ status: 200, contentType: "audio/ogg", body: audioOgg });
    }
    if (/\.webm$/.test(p)) {
      const s = vidSpec(key) || { delay: 300, b: "ok" };
      await new Promise((r) => setTimeout(r, again ? 15 : s.delay));
      if (s.b !== "ok" || !webm) return route.fulfill({ status: 404, body: "nf" });
      return route.fulfill({ status: 200, contentType: "video/webm", body: webm });
    }
    if (/\.pdf$/.test(p)) return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n%%EOF" });
    return route.fulfill({ status: 404, body: "" });
  };
  // Hosts externos fictícios (*.test) — nunca rede real.
  await page.route(/^https?:\/\/[^/]*\.test\//, async (route) => {
    const p = new URL(route.request().url()).pathname;
    return media(route, p);
  });
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (p.startsWith("/uploads/")) return media(route, p);
    if (p === "/media/proxy") {
      const inner = url.searchParams.get("url") || "";
      return media(route, new URL(inner).pathname);
    }
    if (p === "/usuarios/me") return route.fulfill({ json: USER });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos" || p === "/usuarios") return route.fulfill({ json: [] });
    if (p === "/config/empresa") return route.fulfill({ json: { id: 7, nome: "Empresa Teste", timezone: "America/Sao_Paulo" } });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: chats });
    const mm = p.match(/^\/chats\/(\d+)\/mensagens$/);
    if (mm && req.method() === "POST") {
      const body = req.postDataJSON() || {};
      await new Promise((r) => setTimeout(r, postDelay));
      return route.fulfill({ json: { mensagem: { id: 990000 + Math.floor(Math.random() * 9999), conversa_id: Number(mm[1]), texto: body.texto, client_temp_id: body.client_temp_id, direcao: "out", criado_em: new Date().toISOString(), status: "enviado", usuario_nome: "Miguel" } } });
    }
    const m = p.match(/^\/chats\/(\d+)$/);
    if (m && req.method() === "GET") {
      const cid = Number(m[1]);
      calls[cid] = (calls[cid] || 0) + 1;
      const chat = chats.find((c) => c.id === cid);
      await new Promise((r) => setTimeout(r, typeof apiDelay === "function" ? apiDelay(cid, calls[cid]) : apiDelay));
      const gen = convs[cid];
      const res = gen ? gen(calls[cid], url) : { mensagens: [], next_cursor: null };
      const body = Array.isArray(res) ? { mensagens: res, next_cursor: null } : res;
      return route.fulfill({ json: { conversa: { ...chat, mensagens_bloqueadas: false }, tags: [], ...body } });
    }
    return route.fulfill({ json: {} });
  });
  return { calls, hold };
}

/* ---------------- console ---------------- */
export function captureConsole(page) {
  const logs = [];
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warning") logs.push(`[${t}] ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e?.message || e).slice(0, 300)}`));
  return logs;
}

/* ---------------- sonda pós-pintura ---------------- */
export async function armProbe(page, ms = 4000) {
  await page.evaluate((limit) => {
    window.__probe = [];
    window.__ls = [];
    const s = performance.now();
    window.__probeStart = s;
    try {
      if (!window.__lsObs) {
        window.__lsObs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            (window.__lsAll = window.__lsAll || []).push({
              t: e.startTime, v: Math.round(e.value * 10000) / 10000, input: e.hadRecentInput,
              src: (e.sources || []).slice(0, 4).map((x) => {
                const n = x.node;
                let d = "?";
                if (n && n.nodeType === 1) d = `${n.tagName.toLowerCase()}.${String(n.className || "").split(" ").slice(0, 3).join(".")}${n.getAttribute("data-msg-id") ? `#${n.getAttribute("data-msg-id")}` : ""}`;
                else if (n) d = n.nodeName;
                return { d, pr: [Math.round(x.previousRect.y), Math.round(x.previousRect.height)], cr: [Math.round(x.currentRect.y), Math.round(x.currentRect.height)] };
              }),
            });
          }
        });
        window.__lsObs.observe({ type: "layout-shift", buffered: true });
      }
    } catch { /* ignore */ }
    const mc = new MessageChannel();
    const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    const f = () => {
      const el = document.querySelector(".wa-messages");
      const veil = document.querySelector(".wa-openVeil");
      const vop = veil ? Number(getComputedStyle(veil).opacity) : 0;
      const hdr = document.querySelector(".wa-header");
      const ftr = document.querySelector(".wa-footer");
      const rec = { t: Math.round(performance.now() - s), vop: Math.round(vop * 100) / 100,
        hh: hdr ? Math.round(hdr.getBoundingClientRect().height) : 0,
        fh: ftr ? Math.round(ftr.getBoundingClientRect().height) : 0 };
      if (el) {
        const root = el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
        const op = root ? Number(getComputedStyle(root).opacity) : 0;
        const r = el.getBoundingClientRect();
        const pos = {}; const hgt = {};
        let lastBottom = -1e9; let lastId = null;
        for (const b of el.querySelectorAll("[data-msg-id]")) {
          const br = b.getBoundingClientRect();
          if (br.bottom > r.top && br.top < r.bottom) {
            const k = b.getAttribute("data-msg-id");
            pos[k] = Math.round(br.top - r.top); hgt[k] = Math.round(br.height);
          }
          if (br.bottom > lastBottom) { lastBottom = br.bottom; lastId = b.getAttribute("data-msg-id"); }
        }
        Object.assign(rec, {
          op: Math.round(op * 100) / 100, st: Math.round(el.scrollTop), sh: el.scrollHeight, ch: el.clientHeight,
          top: Math.round(r.top), pos, hgt, cls: el.className.includes("opening"),
          glide: el.getAttribute("data-media-glide") === "1",
          kind: root ? (root.className.includes("static") ? "static" : "virtual") : "none",
          lastGap: lastId ? Math.round(r.bottom - lastBottom) : null, lastId,
          loadingImgs: el.querySelectorAll(".wa-bubble-img.is-loading").length,
          conv: document.querySelector(".wa-header .wa-header-name, .wa-header h2, .wa-header [class*='name']")?.textContent?.slice(0, 40) || "",
        });
      }
      window.__probe.push(rec);
      if (performance.now() - s < limit) tick();
    };
    mc.port1.onmessage = f;
    tick();
  }, ms);
}

export async function readProbe(page) {
  return page.evaluate(() => ({
    samples: window.__probe,
    ls: (window.__lsAll || []).filter((e) => e.t >= window.__probeStart).map((e) => ({ ...e, t: Math.round(e.t - window.__probeStart) })),
  }));
}

export const MAX_PASSO = 24;
export const passo = (d, dt) => d / Math.max(1, Math.round((dt || 16.7) / 16.7));

/** Analisa só a partir da máscara da NOVA conversa (como as sondas oficiais). */
export function analyse(samples, { startOnMask = true } = {}) {
  const frames = [];
  let prev = null;
  let started = !startOnMask;
  let revealT = null;
  const white = [];
  const gaps = [];
  const hdrChanges = [];
  const ftrChanges = [];
  let total = 0;
  let firstMove = null; let lastMove = null;
  let prevAny = null;
  for (const s of samples) {
    if (prevAny && s.hh !== prevAny.hh) hdrChanges.push({ t: s.t, from: prevAny.hh, to: s.hh });
    if (prevAny && s.fh !== prevAny.fh) ftrChanges.push({ t: s.t, from: prevAny.fh, to: s.fh });
    prevAny = s;
    if (s.op === undefined) continue;
    if (!started && (s.cls || s.op <= 0.02)) started = true;
    if (!started) continue;
    const visible = s.op > 0.02;
    if (!visible && s.vop < 0.05 && revealT == null) white.push({ t: s.t, op: s.op, vop: s.vop });
    if (visible && s.op > 0.05 && s.vop < 0.05 && Object.keys(s.pos).length === 0) white.push({ t: s.t, op: s.op, vop: s.vop, empty: true });
    if (visible && revealT == null) revealT = s.t;
    if (!visible) { prev = null; continue; }
    if (revealT != null && s.op >= 0.99 && s.lastGap != null && s.lastGap > 24 && !s.cls) gaps.push({ t: s.t, gap: s.lastGap, sh: s.sh, st: s.st, ch: s.ch });
    if (prev) {
      let maxd = 0; let who = null; let dsum = 0; let cnt = 0;
      for (const k of Object.keys(s.pos)) if (k in prev.pos) { const dd = s.pos[k] - prev.pos[k]; cnt++; dsum += dd; if (Math.abs(dd) > Math.abs(maxd)) { maxd = dd; who = k; } }
      const grew = [];
      for (const k of Object.keys(s.hgt)) if (k in prev.hgt && Math.abs(s.hgt[k] - prev.hgt[k]) > 1) grew.push(`${k}:${prev.hgt[k]}->${s.hgt[k]}`);
      if (Math.abs(maxd) > 1 || grew.length) {
        const dt = s.t - prev.t;
        frames.push({ t: s.t, dt, d: maxd, who, step: Math.round(passo(Math.abs(maxd), dt) * 10) / 10, grew, st: s.st, sh: s.sh, ch: s.ch, dst: s.st - prev.st, dsh: s.sh - prev.sh, op: s.op, glide: s.glide, cls: s.cls });
        if (Math.abs(maxd) > 1) { total += Math.abs(maxd); firstMove ??= s.t; lastMove = s.t; }
      }
    }
    prev = s;
  }
  const jumps = frames.filter((f) => f.step > MAX_PASSO);
  return { revealT, jumps, total, motion: firstMove == null ? null : { from: firstMove, to: lastMove, ms: lastMove - firstMove, afterReveal: firstMove - revealT }, frames, white, gaps, hdrChanges, ftrChanges };
}

export function short(a) {
  return {
    revealT: a.revealT, jumps: a.jumps, totalMovePx: a.total, motion: a.motion, whiteFrames: a.white.length, white: a.white.slice(0, 5),
    gapFrames: a.gaps.length, maxGap: a.gaps.reduce((m, g) => Math.max(m, g.gap), 0), gaps: a.gaps.slice(0, 4), hdr: a.hdrChanges, ftr: a.ftrChanges,
  };
}
