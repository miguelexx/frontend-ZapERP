// Verificador B (auditoria 25/11/2026) — TEMPORÁRIO. B2: a 1.ª remedição depois da revelação
// (contentKey null) cai no ramo "mensagem nova" (glide 18px/frame) em vez do snap no mesmo frame.
// Duas figurinhas ACIMA da dobra crescem depois da revelação (t≈1.2s e t≈2.0s). Se B2 vale: a 1.ª
// desloca as bolhas visíveis e deixa folga no fundo por vários frames; a 2.ª é absorvida.
import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import zlib from "node:zlib";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const OUT = process.env.VB_OUT || ".";

function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h) { const row = 1 + w * 3; const raw = Buffer.alloc(row * h, 0x80); for (let y = 0; y < h; y++) raw[y * row] = 0; const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); }
const STICKER = png(512, 512);

const mkChat = (id, nome) => ({ id, contato_nome: nome, nome_contato_cache: nome, telefone: "55119999900" + id,
  status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento", atendente_id: 1, departamento_id: 1, unread_count: 0, ultima_atividade: "2026-07-24T20:00:00.000Z" });
const chats = [mkChat(1, "Contato Fig")];
function msgs(cid) {
  return Array.from({ length: 20 }, (_, i) => {
    const base = { id: cid * 100000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido", criado_em: new Date(Date.UTC(2026, 6, 25, 12) + i * 60000).toISOString() };
    if (i === 3) return { ...base, tipo: "sticker", url: `/uploads/st-a-1200.png` };
    if (i === 5) return { ...base, tipo: "sticker", url: `/uploads/st-b-2000.png` };
    return { ...base, tipo: "texto", texto: `Msg ${i} ${"conteudo longo para ocupar a tela ".repeat(3)}` };
  });
}

test("verifyB 1a remedicao pos-revelacao", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })));
  let t0 = 0;
  await page.route("**/*", async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.origin !== API && !u.origin.startsWith("http://127.0.0.1:5197")) return route.abort();
    if (u.origin !== API) return route.continue();
    const p = u.pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    const st = p.match(/^\/uploads\/st-[ab]-(\d+)\.png$/);
    if (st) { const wait = Math.max(0, t0 + Number(st[1]) - Date.now()); await new Promise((r) => setTimeout(r, wait)); return route.fulfill({ status: 200, contentType: "image/png", body: STICKER }); }
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: chats });
    const m = p.match(/^\/chats\/(\d+)$/);
    if (m && req.method() === "GET") { await new Promise((r) => setTimeout(r, 120)); return route.fulfill({ json: { conversa: { ...chats[0], mensagens_bloqueadas: false }, mensagens: msgs(1), next_cursor: null, tags: [] } }); }
    return route.fulfill({ json: {} });
  });
  await page.goto("/atendimento");
  const mob = testInfo.project.name.includes("mobile");
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
        const stick = [...el.querySelectorAll(".wa-bubble-sticker")].map((b) => { const br = b.getBoundingClientRect(); return `${Math.round(br.height)}@${Math.round(br.top - r.top)}`; }).join(",");
        window.__probe.push({ t: Math.round(performance.now() - s), op: root ? Number(getComputedStyle(root).opacity) : 0, cls: el.className.includes("opening"), st: Math.round(el.scrollTop),
          gap: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), glide: el.getAttribute("data-media-glide"), kind: root ? (root.className.includes("static") ? "S" : "V") : "-", stick, pos });
      }
      if (performance.now() - s < limit) tick();
    };
    tick();
  }, 3600);
  t0 = Date.now();
  const row = page.locator(".chat-list-row").filter({ hasText: "Contato Fig" });
  if (mob) await row.tap(); else await row.click();
  await page.waitForTimeout(3700);
  const probe = await page.evaluate(() => window.__probe);
  let prev = null; const lines = [];
  for (const s of probe) {
    let maxd = 0; if (prev && s.op > 0.02 && prev.op > 0.02) for (const k of Object.keys(s.pos)) if (k in prev.pos) maxd = Math.max(maxd, Math.abs(s.pos[k] - prev.pos[k]));
    if (!prev || maxd > 1 || s.gap !== prev.gap || s.stick !== prev.stick || s.cls !== prev.cls || s.glide !== prev.glide) lines.push(`${s.t}\tcls=${s.cls ? 1 : 0}\top=${Math.round(s.op * 100) / 100}\tst=${s.st}\tgap=${s.gap}\tglide=${s.glide}\t${s.kind}\tmaxd=${maxd}\tstickers=${s.stick}`);
    prev = s;
  }
  writeFileSync(`${OUT}/verifyB-firstgrowth-${testInfo.project.name}.txt`, lines.join("\n"));
  console.log(`[${testInfo.project.name}]\n${lines.join("\n")}`);
});
