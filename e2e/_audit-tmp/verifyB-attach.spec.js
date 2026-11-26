// Verificador B (auditoria 25/11/2026) — TEMPORÁRIO. Confirma/refuta B1/B4: na reabertura pelo
// cache, (a) o virtualizer chama scrollTo({top:0}) DEPOIS do snap de abertura (anexo tardio) e
// (b) a scrollMargin fica 0 (ovf=0) até o count mudar. Só mocks em localhost:5000.
import { test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const audio = readFileSync(new URL("../fixtures/voz-2s.ogg", import.meta.url));
const OUT = process.env.VB_OUT || ".";

const mkChat = (id, nome) => ({
  id, contato_nome: nome, nome_contato_cache: nome, telefone: "55119999900" + id,
  status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento",
  atendente_id: 1, departamento_id: 1, unread_count: 0, ultima_atividade: "2026-07-24T20:00:00.000Z",
});
const chats = [mkChat(1, "Contato Um"), mkChat(2, "Contato Dois")];
function msgs(cid, n) {
  return Array.from({ length: n }, (_, i) => {
    const base = { id: cid * 100000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido",
      criado_em: new Date(Date.UTC(2026, 6, 25, 12) + i * 60000).toISOString() };
    if (i % 7 === 2) return { ...base, tipo: "imagem", url: `/uploads/img-${cid}-${i}.svg` };
    if (i % 7 === 4) return { ...base, tipo: "audio", url: `/uploads/aud-${cid}-${i}.ogg`, audio_duracao_sec: 2 };
    return { ...base, tipo: "texto", texto: `Msg ${i} ${"conteudo longo ".repeat((i % 4) + 1)}` };
  });
}

async function setup(page, { extra, apiDelay }) {
  await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })));
  const calls = {};
  await page.route("**/*", async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.origin !== API && !u.origin.startsWith("http://localhost:5192")) return route.abort();
    if (u.origin !== API) return route.continue();
    const p = u.pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (/^\/uploads\/img-/.test(p)) {
      const n = Number(p.match(/(\d+)\.svg/)[1]);
      await new Promise((r) => setTimeout(r, 150 + (n % 5) * 120));
      const w = n % 2 ? 640 : 360, h = n % 2 ? 360 : 560;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#9cc"/></svg>` });
    }
    if (/^\/uploads\/aud-/.test(p)) { await new Promise((r) => setTimeout(r, 200)); return route.fulfill({ status: 200, contentType: "audio/ogg", body: audio }); }
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: chats });
    const m = p.match(/^\/chats\/(\d+)$/);
    if (m && req.method() === "GET") {
      const cid = Number(m[1]); calls[cid] = (calls[cid] || 0) + 1;
      const n = 40 + (extra && calls[cid] > 1 ? 1 : 0);
      await new Promise((r) => setTimeout(r, apiDelay));
      return route.fulfill({ json: { conversa: { ...chats[cid - 1], mensagens_bloqueadas: false }, mensagens: msgs(cid, n), next_cursor: null, tags: [] } });
    }
    return route.fulfill({ json: {} });
  });
  await page.addInitScript(() => {
    window.__sc = [];
    const orig = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (...a) {
      if (this.classList?.contains("wa-messages") && window.__t0 != null) {
        const o = a[0] && typeof a[0] === "object" ? a[0] : { top: a[1] };
        window.__sc.push({ t: Math.round(performance.now() - window.__t0), top: o.top, behaviorKey: "behavior" in o, behavior: String(o.behavior), stBefore: Math.round(this.scrollTop) });
      }
      return orig.apply(this, a);
    };
  });
}

async function armProbe(page, ms) {
  await page.evaluate((limit) => {
    window.__probe = []; window.__sc = []; const s = performance.now(); window.__t0 = s;
    const mc = new MessageChannel();
    const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    mc.port1.onmessage = () => {
      const el = document.querySelector(".wa-messages");
      if (el) {
        const root = el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
        const r = el.getBoundingClientRect();
        let ovf = null, rootTop = null;
        if (root) {
          const rr = root.getBoundingClientRect(); rootTop = root.offsetTop;
          let maxB = -Infinity; for (const row of root.children) { const b = row.getBoundingClientRect().bottom; if (b > maxB) maxB = b; }
          ovf = Math.round(maxB - rr.bottom);
        }
        const bubbles = [...el.querySelectorAll("[data-msg-id]")].filter((b) => { const br = b.getBoundingClientRect(); return br.bottom > r.top && br.top < r.bottom; });
        const pos = {}; bubbles.forEach((b) => { pos[b.getAttribute("data-msg-id")] = Math.round(b.getBoundingClientRect().top - r.top); });
        window.__probe.push({ t: Math.round(performance.now() - s), op: root ? Math.round(Number(getComputedStyle(root).opacity) * 100) / 100 : 0,
          cls: el.className.includes("opening"), st: Math.round(el.scrollTop), sh: el.scrollHeight, ch: el.clientHeight,
          gap: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), glide: el.getAttribute("data-media-glide"),
          kind: root ? (root.className.includes("static") ? "S" : "V") : "-", rootTop, ovf, n: bubbles.length, pos });
      }
      if (performance.now() - s < limit) tick();
    };
    tick();
  }, ms);
}

function summarize(probe) {
  let prev = null; const out = [];
  for (const s of probe) {
    let maxd = 0, who = null;
    if (prev && s.op > 0.02 && prev.op > 0.02) for (const k of Object.keys(s.pos)) if (k in prev.pos) { const d = Math.abs(s.pos[k] - prev.pos[k]); if (d > maxd) { maxd = d; who = k; } }
    out.push(`${s.t}\tcls=${s.cls ? 1 : 0}\top=${s.op}\tst=${s.st}\tgap=${s.gap}\tglide=${s.glide}\t${s.kind}\trootTop=${s.rootTop}\tovf=${s.ovf}\tn=${s.n}\tmaxd=${maxd}${who ? "@" + who : ""}`);
    prev = s;
  }
  return out;
}

for (const extra of [true, false]) {
  test(`verifyB reabertura cache extra=${extra}`, async ({ page }, testInfo) => {
    await setup(page, { extra, apiDelay: 120 });
    await page.goto("/atendimento");
    const mob = testInfo.project.name.includes("mobile");
    const tap = async (n) => { const row = page.locator(".chat-list-row").filter({ hasText: n }); if (mob) await row.tap(); else await row.click(); };
    const leave = async () => {
      if (mob) { await page.goBack(); await page.waitForTimeout(600); }
      else { await page.locator(".wa-header-back").first().click({ force: true }).catch(() => {}); await page.waitForTimeout(400);
        if (await page.locator(".wa-messages").count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(400); } }
    };
    await tap("Contato Dois"); await page.waitForTimeout(1800); await leave();
    await tap("Contato Um"); await page.waitForTimeout(2500); await leave();
    const stillMounted = await page.locator(".wa-messages").count();
    await armProbe(page, 2400); await tap("Contato Um"); await page.waitForTimeout(2600);
    const probe = await page.evaluate(() => window.__probe);
    const sc = await page.evaluate(() => window.__sc);
    const tag = `${testInfo.project.name}-extra${extra ? 1 : 0}`;
    writeFileSync(`${OUT}/verifyB-attach-${tag}.txt`, [`wa-messages still mounted after leave: ${stillMounted}`, "SCROLLTO:", ...sc.map((x) => JSON.stringify(x)), "FRAMES:", ...summarize(probe)].join("\n"));
    console.log(`[${tag}] mountedAfterLeave=${stillMounted} scrollTo=${JSON.stringify(sc.slice(0, 6))}`);
  });
}
