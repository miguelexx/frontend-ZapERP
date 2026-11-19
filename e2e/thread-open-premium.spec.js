// Regressao (17/11/2026): abertura de conversa "premium" — nenhuma bolha visivel muda de lugar
// depois que a thread aparece, inclusive nos casos que o thread-open-stability nao cobre:
//  - reabrir pelo CACHE quando o servidor traz mais mensagens (antes: 36px e 149px no desktop);
//  - conversa curta no celular (lista estatica) cujo GET de abertura cruza o limiar de
//    virtualizacao (antes: troca estatica -> virtual, remontagem e salto de 166px).
// A sonda le DEPOIS da pintura (rAF -> MessageChannel); ler dentro do rAF acusava saltos que o
// ResizeObserver corrigia antes de pintar.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const audio = readFileSync(new URL("./fixtures/voz-2s.ogg", import.meta.url));

const mkChat = (id, nome) => ({
  id, contato_nome: nome, nome_contato_cache: nome, telefone: "55119999900" + id,
  status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento",
  atendente_id: 1, departamento_id: 1, unread_count: 0,
  ultima_atividade: "2026-07-24T20:00:00.000Z",
});
const chats = [mkChat(1, "Contato Um"), mkChat(2, "Contato Curto"), mkChat(3, "Contato Limiar")];

function msgs(cid, n) {
  return Array.from({ length: n }, (_, i) => {
    const base = {
      id: cid * 100000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido",
      criado_em: new Date(Date.UTC(2026, 6, 25, 12) + i * 60000).toISOString(),
    };
    if (i % 7 === 2) return { ...base, tipo: "imagem", url: `/uploads/img-${cid}-${i}.svg` };
    if (i % 7 === 4) return { ...base, tipo: "audio", url: `/uploads/aud-${cid}-${i}.ogg`, audio_duracao_sec: 2 };
    return { ...base, tipo: "texto", texto: `Msg ${i} ${"conteudo longo ".repeat((i % 4) + 1)}` };
  });
}
// 1a chamada / chamadas seguintes por conversa (simula lote maior ao reabrir)
const COUNTS = { 1: [40, 41], 2: [12, 13], 3: [20, 28] };

async function setup(page, apiDelay) {
  await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })));
  const calls = {};
  await page.route(`${API}/**`, async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
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
      const n = COUNTS[cid][calls[cid] > 1 ? 1 : 0];
      await new Promise((r) => setTimeout(r, apiDelay));
      return route.fulfill({ json: { conversa: { ...chats[cid - 1], mensagens_bloqueadas: false }, mensagens: msgs(cid, n), next_cursor: null, tags: [] } });
    }
    return route.fulfill({ json: {} });
  });
}

async function armProbe(page, ms = 3000) {
  await page.evaluate((limit) => {
    window.__probe = []; const s = performance.now();
    // Le DEPOIS da pintura (rAF -> MessageChannel): ler dentro do rAF forca layout antes do
    // ResizeObserver corrigir o scroll e acusa "salto" que nunca chegou a ser pintado.
    const mc = new MessageChannel();
    const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    const f = () => {
      const el = document.querySelector(".wa-messages");
      if (el) {
        const root = el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
        const op = root ? Number(getComputedStyle(root).opacity) : 0;
        const r = el.getBoundingClientRect();
        const bubbles = [...el.querySelectorAll("[data-msg-id]")].filter((b) => { const br = b.getBoundingClientRect(); return br.bottom > r.top && br.top < r.bottom; });
        const pos = {}; bubbles.forEach((b) => { pos[b.getAttribute("data-msg-id")] = Math.round(b.getBoundingClientRect().top - r.top); });
        const hdr = document.querySelector(".wa-header");
        window.__probe.push({
          t: Math.round(performance.now() - s), op: Math.round(op * 100) / 100,
          st: Math.round(el.scrollTop), sh: el.scrollHeight, ch: el.clientHeight, pos,
          cls: el.className.includes("opening"),
          kind: root ? (root.className.includes("static") ? "static" : "virtual") : "none",
          hh: hdr ? Math.round(hdr.getBoundingClientRect().height) : 0,
          n: bubbles.length,
        });
      }
      if (performance.now() - s < limit) tick();
    };
    mc.port1.onmessage = f;
    tick();
  }, ms);
}

function analyse(samples) {
  const jumps = []; let prev = null;
  const reveals = []; const kinds = new Set(); const heads = new Set();
  let wasVisible = false;
  // Só conta a partir do momento em que a NOVA conversa entra em abertura (máscara/opacidade 0):
  // antes disso o que está na tela é a conversa ANTERIOR — uma foto dela a terminar o deslize
  // (janela de deslize da moldura, 19/11/2026) não é salto da abertura que se está a medir.
  let started = false;
  for (const s of samples) {
    if (!started && (s.cls || s.op <= 0.02)) started = true;
    if (!started) continue;
    kinds.add(s.kind); if (s.hh) heads.add(s.hh);
    const visible = s.op > 0.02;
    if (visible !== wasVisible) { reveals.push({ t: s.t, op: s.op }); wasVisible = visible; }
    if (!visible) { prev = null; continue; }
    if (prev) {
      let maxd = 0, who = null;
      for (const k of Object.keys(s.pos)) if (k in prev.pos) { const d = Math.abs(s.pos[k] - prev.pos[k]); if (d > maxd) { maxd = d; who = k; } }
      if (maxd > 1) jumps.push({ t: s.t, d: maxd, dt: s.t - prev.t, id: who, op: s.op, st: s.st, sh: s.sh, ch: s.ch, kind: s.kind, ctx: process.env.DIAG_CTX ? samples.filter((x) => Math.abs(x.t - s.t) < 120).map((x) => `${x.t}:${x.op}:${x.st}/${x.sh}/${x.ch}:${x.cls ? 'O' : '-'}:${x.kind}`) : undefined });
    }
    prev = s;
  }
  return { jumps, reveals, kinds: [...kinds], heads: [...heads] };
}

// Contrato desde 19/11/2026 (abertura quase instantânea, ~0,3s na reabertura): a conversa aparece
// sem esperar foto nem a lista do servidor. Foto que decodifica depois DESLIZA (janela de deslize)
// e mensagem nova do servidor ENTRA deslizando — movimento suave é permitido; SALTO não. Salto =
// uma bolha visível mudar mais de 24px de um frame para o outro (os deslizes medem 3–21px por
// frame; os saltos antigos eram 36–166px num frame só).
// O passo é normalizado pelos frames que de fato passaram (frame perdido no navegador headless
// pinta 2–3 frames de deslize de uma vez — isso não é salto do app; um salto real de 80–340px
// continua reprovando mesmo atravessando frames perdidos).
const MAX_PASSO_SUAVE = 24;
const passoPorFrame = (j) => j.d / Math.max(1, Math.round((j.dt || 16.7) / 16.7));
const bruscos = (jumps) => jumps.filter((j) => passoPorFrame(j) > MAX_PASSO_SUAVE);
for (const delay of [120, 600]) {
  test(`abertura premium sem salto (api ${delay}ms)`, async ({ page }, testInfo) => {
    await setup(page, delay);
    await page.goto("/atendimento");
    const mob = testInfo.project.name.includes("mobile");
    const tap = async (n) => { const row = page.locator(".chat-list-row").filter({ hasText: n }); if (mob) await row.tap(); else await row.click(); };
    const back = async () => { if (mob) { await page.goBack(); await page.waitForTimeout(600); } };

    const nomes = ["Contato Um", "Contato Curto", "Contato Limiar"];
    for (const nome of nomes) {
      const outro = nomes.find((n) => n !== nome);
      // 1a abertura
      await armProbe(page); await tap(nome); await page.waitForTimeout(3100);
      const a = analyse(await page.evaluate(() => window.__probe));
      console.log(`[${testInfo.project.name} d${delay}] ${nome} 1a:`, JSON.stringify(a));
      expect(bruscos(a.jumps), `${nome} 1a abertura: nenhuma bolha visivel pode SALTAR`).toEqual([]);
      // sai da conversa (desktop: troca de conversa; mobile: volta a lista)
      await back(); await tap(outro); await page.waitForTimeout(1500); await back();
      // reabertura (cache + lote maior)
      await armProbe(page); await tap(nome); await page.waitForTimeout(3100);
      const b = analyse(await page.evaluate(() => window.__probe));
      console.log(`[${testInfo.project.name} d${delay}] ${nome} 2a:`, JSON.stringify(b));
      expect(bruscos(b.jumps), `${nome} reabertura (cache + lote maior): nenhuma bolha pode SALTAR`).toEqual([]);
      const tipos = b.kinds.filter((k) => k !== "none");
      expect(tipos.length, `${nome} reabertura: a lista nao pode trocar de tipo (remonta)`).toBeLessThanOrEqual(1);
      await back();
    }
  });
}
