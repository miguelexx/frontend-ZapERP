// Lente B (auditoria 25/11/2026) — reprodução empírica no CELULAR com dados realistas.
// Fotos PNG reais (1080x1920, 1600x900, 1080x1080, 1080x3000...), metade via /media/proxy,
// atrasos 600–2500ms (B_IMG_SCALE escala), uma foto 404, uma pendente para sempre, áudio
// lento/quebrado, figurinha, vídeo 404, PDF, link com prévia, resposta, reação, nota, grupo,
// 4 dias de separadores e paginação real (limit 16 no celular + cursor).
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { installMocks, armProbe, analyse, collect, captureConsole, mkChat, sleep, throttleCpu, installScrollTrace } from "./B-helpers.js";
import { buildConversation, page as pageOf, mediaHandler } from "./B-fixtures.js";

const OUT = process.env.B_OUT || ".";
const CPU = Number(process.env.B_CPU || 1);
const API_DELAY = Number(process.env.B_API || 400);

const chats = [
  mkChat(1, "Midia Pesada", { unread_count: 3 }),
  mkChat(2, "Grupo Vendas", { is_group: true, nome_grupo: "Grupo Vendas", telefone: "120363000000000001@g.us" }),
  mkChat(3, "Curta Fotos"),
  mkChat(4, "Fotos Tardias"),
];
const CONV = {
  1: buildConversation(1, 80),
  2: buildConversation(2, 40, { group: true }),
  3: buildConversation(3, 10),
  4: buildConversation(4, 30, { lateImages: true }),
};

function clone(list, n) {
  // 2.ª+ chamada: mesmas mensagens, OBJETOS NOVOS e campos extra (patch de status/whatsapp_id)
  if (n < 2) return list;
  return list.map((m) => ({ ...m, ...(m.status === "entregue" ? { status: "lido" } : {}), whatsapp_id: m.whatsapp_id || `wamid.${m.id}` }));
}

async function setup(page, testInfo) {
  const cons = captureConsole(page);
  if (process.env.B_TRACE) await installScrollTrace(page);
  const posts = [];
  const mocks = await installMocks(page, {
    chats,
    chatById: (cid, n, url) => {
      const pg = pageOf(CONV[cid], url, 16);
      return { delay: url.searchParams.get("cursor") ? 350 : API_DELAY, payload: { conversa: { ...chats[cid - 1], mensagens_bloqueadas: false }, mensagens: clone(pg.mensagens, n), next_cursor: pg.next_cursor, next_cursor_id: pg.next_cursor_id, tags: [] } };
    },
    media: mediaHandler,
    onPost: async (p, req) => {
      const m = p.match(/^\/chats\/(\d+)\/mensagens$/);
      if (!m) return null;
      const body = req.postDataJSON() || {};
      posts.push(body);
      await sleep(300);
      return { json: { mensagem: { id: 990000 + posts.length, conversa_id: Number(m[1]), texto: body.texto, client_temp_id: body.client_temp_id, direcao: "out", criado_em: new Date().toISOString(), status: "enviado" } } };
    },
  });
  await page.goto("/atendimento");
  await throttleCpu(page, CPU);
  await expect(page.locator(".chat-list-row").first()).toBeVisible();
  const tap = async (n) => page.locator(".chat-list-row").filter({ hasText: n }).first().tap();
  const back = async (ms = 600) => { await page.goBack(); await page.waitForTimeout(ms); };
  return { cons, posts, mocks, tap, back };
}

function report(tag, r, extra = {}) {
  const line = { tag, bruscos: r.bruscos.map((j) => ({ t: j.t, d: j.d, dt: j.dt, id: j.id, op: j.op, dst: j.dst, dsh: j.dsh, grew: j.grew, kind: j.kind, glide: j.glide })), nJumps: r.jumps.length, maxStep: Math.max(0, ...r.jumps.map((j) => Math.round(j.d / Math.max(1, Math.round(j.dt / 16.7))))), reveals: r.reveals.slice(0, 3), white: r.white.length, bottomGaps: r.bottomGaps.slice(0, 4), kinds: r.kinds, hh: r.hh, fh: r.fh, ...extra };
  console.log(`[B ${tag}] ${JSON.stringify(line)}`);
  return line;
}
const realErrors = (cons) => cons.filter((c) => !/WebSocket connection to 'ws:\/\/localhost:5000/.test(c.text));

test("B realistic: 1a abertura, reabertura do cache, fotos tardias, troca rápida", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "lente B = celular");
  test.setTimeout(240_000);
  const { cons, tap, back } = await setup(page, testInfo);
  const results = [];
  const dump = {};

  // F1 — 1.ª abertura, conversa pesada (sem cache)
  await armProbe(page, 4800); await tap("Midia Pesada"); await page.waitForTimeout(4900);
  let d = await collect(page); dump.f1 = d;
  results.push(report("F1-primeira", analyse(d.probe), { ls: d.ls.filter((x) => x.v > 0.002).slice(0, 5) }));
  writeFileSync(`${OUT}/B-realistic-f1-cpu${CPU}-api${API_DELAY}.json`, JSON.stringify(d));
  await page.screenshot({ path: `${OUT}/B-F1-final.png` });

  // F7 — volta à lista: a lista mexe sozinha?
  await page.evaluate(() => {
    window.__lp = []; const s = performance.now(); const mc = new MessageChannel();
    const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    mc.port1.onmessage = () => {
      const rows = [...document.querySelectorAll(".chat-list-row")].slice(0, 6).map((r) => { const b = r.getBoundingClientRect(); return [r.textContent.slice(0, 14), Math.round(b.top), Math.round(b.height), r.className.includes("selected") || r.className.includes("active") ? 1 : 0]; });
      window.__lp.push({ t: Math.round(performance.now() - s), rows });
      if (performance.now() - s < 1800) tick();
    };
    tick();
  });
  await back(1900);
  const lp = await page.evaluate(() => window.__lp);
  const listMoves = [];
  for (let i = 1; i < lp.length; i++) {
    const a = Object.fromEntries(lp[i - 1].rows.map((r) => [r[0], r]));
    for (const r of lp[i].rows) { const p = a[r[0]]; if (p && (Math.abs(p[1] - r[1]) > 1 || p[3] !== r[3])) listMoves.push({ t: lp[i].t, row: r[0], from: p[1], to: r[1], sel: `${p[3]}->${r[3]}` }); }
  }
  console.log(`[B F7-lista-volta] moves=${JSON.stringify(listMoves.slice(0, 12))} frames=${lp.length}`);
  dump.f7 = lp;

  // F2 — reabertura pelo cache (mesmas msgs, objetos novos + campos extra)
  await tap("Curta Fotos"); await page.waitForTimeout(1500); await back();
  await armProbe(page, 3500); await tap("Midia Pesada"); await page.waitForTimeout(3600);
  d = await collect(page); dump.f2 = d;
  results.push(report("F2-reabertura-cache", analyse(d.probe), { ls: d.ls.filter((x) => x.v > 0.002).slice(0, 5) }));
  await back();

  // F4 — fotos que chegam DEPOIS da janela de deslize (3,5s): 2,4s–4,3s
  await armProbe(page, 6000); await tap("Fotos Tardias"); await page.waitForTimeout(6100);
  d = await collect(page); dump.f4 = d;
  results.push(report("F4-fotos-tardias", analyse(d.probe), { ls: d.ls.filter((x) => x.v > 0.002).slice(0, 6) }));
  await back();

  // F3 — troca rápida A->B->A->C (toque, volta antes de terminar de abrir)
  await tap("Midia Pesada"); await page.waitForTimeout(150); await back(150);
  await tap("Fotos Tardias"); await page.waitForTimeout(200); await back(150);
  await tap("Midia Pesada"); await page.waitForTimeout(120); await back(150);
  await armProbe(page, 3500); await tap("Curta Fotos"); await page.waitForTimeout(3600);
  d = await collect(page); dump.f3 = d;
  const r3 = analyse(d.probe);
  const nomeHeader = await page.locator(".wa-header").first().innerText().catch(() => "");
  results.push(report("F3-troca-rapida", r3, { header: nomeHeader.slice(0, 40), lastIds: [...new Set(d.probe.map((s) => s.lastId).filter(Boolean))].slice(-3) }));
  await back();

  // Grupo (1.ª abertura) — grupos não entram na "Minha fila": filtro Todas
  await page.getByRole("button", { name: /^Todas/ }).first().tap().catch(() => {});
  await page.waitForTimeout(800);
  await armProbe(page, 4500); await tap("Grupo Vendas"); await page.waitForTimeout(4600);
  d = await collect(page); dump.grupo = d;
  results.push(report("G-grupo-primeira", analyse(d.probe)));
  await page.screenshot({ path: `${OUT}/B-grupo-final.png` });

  writeFileSync(`${OUT}/B-realistic-cpu${CPU}-api${API_DELAY}.json`, JSON.stringify({ results, dump }, null, 0));
  console.log(`[B console] ${JSON.stringify(realErrors(cons).slice(0, 15))}`);
});

test("B realistic: histórico com toque (paginação, estática->virtual) e envio logo após abrir", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "lente B = celular");
  test.setTimeout(180_000);
  const { cons, tap, back, posts, mocks } = await setup(page, testInfo);
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (x, y0, y1, steps = 10) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= steps; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] }); await sleep(12); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };

  // F6 — envio logo depois de abrir (curta, lista estática)
  await armProbe(page, 2600); await tap("Curta Fotos");
  await expect(page.locator(".wa-messages")).not.toHaveClass(/wa-messages--opening/);
  await page.locator(".wa-input").fill("Oi! Já te mando as fotos");
  await page.getByRole("button", { name: "Enviar mensagem" }).first().tap();
  await page.waitForTimeout(2300);
  let d = await collect(page);
  const r6 = report("F6-envio-logo-apos-abrir", analyse(d.probe), { posts: posts.length });
  const bubble = await page.locator(".wa-bubble").filter({ hasText: "Já te mando as fotos" }).count();
  console.log(`[B F6] bolhas do envio=${bubble}`);
  await back();

  // F5 — histórico: abre Midia Pesada (16 msgs, estática), sobe com o dedo até carregar páginas
  await tap("Midia Pesada"); await page.waitForTimeout(3000);
  const box = await page.locator(".wa-messages").boundingBox();
  const x = box.x + box.width / 2;
  const steps = [];
  await armProbe(page, 26000);
  for (let k = 0; k < 14; k++) {
    await swipe(x, box.y + 120, box.y + box.height - 60, 10);
    await page.waitForTimeout(700);
    const st = await page.evaluate(() => { const el = document.querySelector(".wa-messages"); const root = el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root"); return { st: Math.round(el.scrollTop), sh: el.scrollHeight, kind: root ? (root.className.includes("static") ? "static" : "virtual") : "none", n: el.querySelectorAll("[data-msg-id]").length, loadingMore: !!el.querySelector(".wa-historyLoading") }; });
    steps.push({ k, ...st, calls: mocks.log.length });
  }
  d = await collect(page);
  console.log(`[B F5 passos] ${JSON.stringify(steps)}`);
  console.log(`[B F5 GETs] ${JSON.stringify(mocks.log)}`);
  // Saltos SEM dedo: frames em que nenhuma swipe estava ativa são difíceis de separar aqui —
  // registra a mudança de tipo de lista e os maiores passos para análise.
  const r5 = analyse(d.probe, { fromStart: true });
  const kindsSeq = []; let lastK = null;
  for (const s of d.probe) if (s.kind && s.kind !== lastK) { kindsSeq.push({ t: s.t, kind: s.kind, st: s.st, sh: s.sh }); lastK = s.kind; }
  console.log(`[B F5 tipos] ${JSON.stringify(kindsSeq)}`);
  writeFileSync(`${OUT}/B-realistic-hist-cpu${CPU}.json`, JSON.stringify({ steps, log: mocks.log, kindsSeq, f6: r6, probe: d.probe }, null, 0));
  console.log(`[B console2] ${JSON.stringify(realErrors(cons).slice(0, 15))}`);
});
