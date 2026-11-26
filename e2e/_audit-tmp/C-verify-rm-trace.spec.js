// VERIFICADOR (lente C): traço frame a frame de "C Fotos" com reduced motion (desktop) para ver
// se há "salto e volta" e qual é o vão no fundo. Temporário.
import { test } from "@playwright/test";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const svg = (w, h, fill = "#9cc") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${fill}"/></svg>`;
const iso = (i) => new Date(Date.UTC(2026, 10, 20, 12) + i * 60000).toISOString();
const chat = { id: 15, contato_nome: "C Fotos", nome_contato_cache: "C Fotos", telefone: "5511988880015", status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento", atendente_id: 1, departamento_id: 1, unread_count: 0, ultima_atividade: iso(500) };
function msgs() {
  const l = [];
  for (let i = 0; i < 10; i += 1) l.push({ id: 15000 + i, conversa_id: 15, direcao: i % 2 ? "out" : "in", status: "lido", criado_em: iso(i), tipo: "texto", texto: `Msg ${i} ${"conteudo ".repeat((i % 4) + 2)}` });
  [1, 2, 3].forEach((n, k) => l.push({ id: 15010 + k, conversa_id: 15, direcao: "in", status: "lido", criado_em: iso(10 + k), tipo: "imagem", url: `/uploads/c-img-360x640-d900-${n}.svg` }));
  l.push({ id: 15013, conversa_id: 15, direcao: "out", status: "lido", criado_em: iso(13), tipo: "texto", texto: "Ultima mensagem da conversa" });
  return l;
}
for (const rm of ["reduce", "no-preference"]) {
  test(`trace C Fotos rm=${rm}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: rm });
    await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })));
    await page.route(`${API}/**`, async (route) => {
      const req = route.request(); const p = new URL(req.url()).pathname;
      if (p.startsWith("/socket.io")) return route.abort();
      const m = p.match(/^\/uploads\/c-img-(\d+)x(\d+)-d(\d+)/);
      if (m) { await new Promise((r) => setTimeout(r, Number(m[3]))); return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg(Number(m[1]), Number(m[2])) }); }
      if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
      if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
      if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
      if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
      if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: [chat] });
      if (p === "/chats/15" && req.method() === "GET") { await new Promise((r) => setTimeout(r, 150)); return route.fulfill({ json: { conversa: { ...chat, mensagens_bloqueadas: false }, mensagens: msgs(), next_cursor: null, tags: [] } }); }
      return route.fulfill({ json: {} });
    });
    await page.goto("/atendimento");
    await page.waitForSelector(".chat-list-row");
    const info = await page.evaluate(() => {
      const b = document.createElement("button"); b.className = "wa-bubble-imgLink"; document.body.appendChild(b);
      const td = getComputedStyle(b).transitionDuration; b.remove();
      return { rm: matchMedia("(prefers-reduced-motion: reduce)").matches, buttonTD: td };
    });
    await page.evaluate(() => {
      window.__tr = []; const s = performance.now(); const mc = new MessageChannel();
      const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
      const ev = []; window.__ev = ev;
      document.addEventListener("transitionrun", (e) => ev.push({ t: Math.round(performance.now() - s), k: "run", p: e.propertyName }), true);
      document.addEventListener("transitionend", (e) => ev.push({ t: Math.round(performance.now() - s), k: "end", p: e.propertyName }), true);
      mc.port1.onmessage = () => {
        const el = document.querySelector(".wa-messages");
        if (el) {
          const r = el.getBoundingClientRect(); const root = el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
          const g = (id) => { const x = el.querySelector(`[data-msg-id="${id}"]`); return x ? Math.round(x.getBoundingClientRect().top - r.top) : null; };
          const h = (id) => { const x = el.querySelector(`[data-msg-id="${id}"]`); return x ? Math.round(x.getBoundingClientRect().height) : null; };
          window.__tr.push({ t: Math.round(performance.now() - s), op: root ? Math.round(Number(getComputedStyle(root).opacity) * 100) / 100 : 0, st: Math.round(el.scrollTop), sh: el.scrollHeight, gap: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), p9: g(15009), p11: g(15011), p13: g(15013), h10: h(15010), h11: h(15011), h12: h(15012), glide: el.getAttribute("data-media-glide") });
        }
        if (performance.now() - s < 2600) tick();
      };
      tick();
    });
    { const rr = page.locator(".chat-list-row[data-chat-id=\"15\"]"); if (testInfo.project.name.includes("mobile")) await rr.tap(); else await rr.click(); }
    await page.waitForTimeout(2800);
    const tr = await page.evaluate(() => window.__tr);
    const ev = await page.evaluate(() => window.__ev.filter((e) => e.p === "--wa-media-ar-anim"));
    let prev = null; const out = [];
    for (const s of tr) { if (prev && (s.st !== prev.st || s.sh !== prev.sh || s.p11 !== prev.p11 || s.h11 !== prev.h11 || s.op !== prev.op)) out.push(s); prev = s; }
    console.log(`[Cv ${testInfo.project.name} rm=${rm}] info`, JSON.stringify(info), "ev", JSON.stringify(ev.slice(0, 8)));
    for (const s of out.slice(0, 40)) console.log(`[Cv ${testInfo.project.name} rm=${rm}]`, JSON.stringify(s));
  });
}
