// AUDITORIA (lente C) — cartão de link com miniatura PEQUENA vinda por http: colapsa de "hero" para
// compacto depois da revelação, e de novo a cada remontagem da linha virtual (compacto não vai ao
// cache). Também fotografa o estado "carregando" de uma foto (caixa branca + hora).
import { test } from "@playwright/test";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const svg = (w, h, fill = "#9cc") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${fill}"/></svg>`;
const iso = (i) => new Date(Date.UTC(2026, 10, 20, 12) + i * 60000).toISOString();
const chat = { id: 21, contato_nome: "C LinkRemonta", nome_contato_cache: "C LinkRemonta", telefone: "5511977770021", status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento", atendente_id: 1, departamento_id: 1, unread_count: 0, ultima_atividade: iso(500) };
const chat2 = { ...chat, id: 22, contato_nome: "C FotoPendente", nome_contato_cache: "C FotoPendente", telefone: "5511977770022" };
function msgs() {
  const l = [];
  for (let i = 0; i < 60; i += 1) l.push({ id: 21000 + i, conversa_id: 21, direcao: i % 2 ? "out" : "in", status: "lido", criado_em: iso(i), tipo: "texto", texto: `Msg ${i} ${"conteudo ".repeat((i % 4) + 2)}` });
  l.push({ id: 21060, conversa_id: 21, direcao: "in", status: "lido", criado_em: iso(60), tipo: "texto", texto: "olha https://exemplo.com/p", reply_meta: { link_preview: { url: "https://exemplo.com/p", title: "Site com favicon pequeno", description: "Descricao", preview: process.env.C_LP_DATA ? "data:image/svg+xml;base64," + Buffer.from(svg(64, 64, "#c69")).toString("base64") : `${API}/uploads/c-lpsmall-64x64.svg` } } });
  l.push({ id: 21061, conversa_id: 21, direcao: "out", status: "lido", criado_em: iso(61), tipo: "texto", texto: "Ultima" });
  return l;
}
function msgs2() {
  return [
    { id: 22000, conversa_id: 22, direcao: "in", status: "lido", criado_em: iso(1), tipo: "texto", texto: "oi" },
    { id: 22001, conversa_id: 22, direcao: "out", status: "lido", criado_em: iso(2), tipo: "imagem", url: "/uploads/c-pendente.svg", usuario_nome: "Eva", enviado_por_usuario: true },
  ];
}
test("link pequeno: colapso apos revelar e na remontagem", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })));
  await page.route(`${API}/**`, async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (p === "/uploads/c-lpsmall-64x64.svg") { await new Promise((r) => setTimeout(r, 900)); return route.fulfill({ status: 200, contentType: "image/svg+xml", headers: { "cache-control": "max-age=3600" }, body: svg(64, 64, "#c69") }); }
    if (p === "/uploads/c-pendente.svg") { await new Promise((r) => setTimeout(r, 60000)); return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg(300, 300) }); }
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: [chat, chat2] });
    if (p === "/chats/21" && req.method() === "GET") return route.fulfill({ json: { conversa: { ...chat, mensagens_bloqueadas: false }, mensagens: msgs(), next_cursor: null, tags: [] } });
    if (p === "/chats/22" && req.method() === "GET") return route.fulfill({ json: { conversa: { ...chat2, mensagens_bloqueadas: false }, mensagens: msgs2(), next_cursor: null, tags: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/atendimento");
  await page.waitForSelector(".chat-list-row");
  const mob = testInfo.project.name.includes("mobile");
  const probe = async (ms) => page.evaluate((limit) => new Promise((resolve) => {
    const out = []; const s = performance.now(); const mc = new MessageChannel();
    const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    mc.port1.onmessage = () => {
      const el = document.querySelector(".wa-messages"); if (!el) { if (performance.now() - s < limit) tick(); else resolve(out); return; } const r = el.getBoundingClientRect();
      const row = el.querySelector('[data-msg-id="21060"]'); const last = el.querySelector('[data-msg-id="21059"]');
      const card = row && row.querySelector(".wa-linkPrev");
      out.push({ t: Math.round(performance.now() - s), h: row ? Math.round(row.getBoundingClientRect().height) : null, compact: card ? card.className.includes("compact") : null, top59: last ? Math.round(last.getBoundingClientRect().top - r.top) : null, gap: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight) });
      if (performance.now() - s < limit) tick(); else resolve(out);
    };
    tick();
  }), ms);
  const row = page.locator('.chat-list-row[data-chat-id="21"]');
  if (mob) await row.tap(); else await row.click();
  const a = await probe(2600);
  const changes = (arr) => arr.filter((x, i) => i && (x.h !== arr[i - 1].h || Math.abs((x.top59 ?? 0) - (arr[i - 1].top59 ?? 0)) > 1)).map((x) => `${x.t}ms h=${x.h} compact=${x.compact} top59=${x.top59} gap=${x.gap}`);
  console.log(`[C ${testInfo.project.name}] 1a abertura (miniatura 64px por http, 900ms):`, JSON.stringify(changes(a)));
  // Sobe para desmontar a linha e volta ao fim (remontagem da linha virtual)
  await page.evaluate(() => { const el = document.querySelector(".wa-messages"); el.scrollTop = 0; });
  await page.waitForTimeout(700);
  const mountedTop = await page.evaluate(() => !!document.querySelector('[data-msg-id="21060"]'));
  await page.evaluate(() => { const el = document.querySelector(".wa-messages"); el.scrollTop = el.scrollHeight; });
  const b = await probe(1200);
  console.log(`[C ${testInfo.project.name}] remontagem (linha estava montada no topo? ${mountedTop}):`, JSON.stringify(changes(b).slice(0, 12)), "primeiro:", JSON.stringify(b[0]));
  // Foto cuja requisição fica pendurada (proxy lento): como fica a bolha?
  const row2 = page.locator('.chat-list-row[data-chat-id="22"]');
  if (mob) { await page.goBack(); await page.waitForTimeout(400); await row2.tap(); } else await row2.click();
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const r = document.querySelector('[data-msg-id="22001"]'); const img = r?.querySelector("img");
    const f = r?.querySelector(".wa-bubble-imgLink");
    return { imgCls: img?.className, frameBg: f ? getComputedStyle(f).backgroundColor : null, imgBg: img ? getComputedStyle(img).backgroundImage.slice(0, 60) : null, text: r?.innerText };
  });
  console.log(`[C ${testInfo.project.name}] foto pendente 2.5s:`, JSON.stringify(info));
  await page.locator('[data-msg-id="22001"]').screenshot({ path: `C:/Users/Miguel/AppData/Local/Temp/claude/8f209c886303b62a/eb5e3ac8-e0b8-4ef7-995a-ef4c0230d6e3/scratchpad/C-foto-pendente-${testInfo.project.name}.png` });
});
