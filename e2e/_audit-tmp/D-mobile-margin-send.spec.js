// Lente D: no celular o ConversaViewBody remonta a cada abertura e, no 1.º layout effect da
// lista virtual, `scrollRef.current` ainda é null (o ref do .wa-messages pai anexa depois dos
// efeitos dos filhos). O efeito de margem só re-roda quando `count` muda. Aqui: abre, espera,
// ENVIA uma mensagem (count+1) e mede o que acontece com a última bolha 48ms depois.
import { test } from "@playwright/test";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const mkChat = (id, nome) => ({ id, contato_nome: nome, nome_contato_cache: nome, telefone: "5511999990" + String(id).padStart(3, "0"), status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento", atendente_id: 1, departamento_id: 1, unread_count: 0, ultima_atividade: "2026-07-24T20:00:00.000Z" });
const chats = [mkChat(1, "Contato Um"), mkChat(2, "Contato Dois")];
const msgs = (cid, n) => Array.from({ length: n }, (_, i) => ({ id: cid * 100000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido", tipo: "texto", texto: `Msg ${i} ${"conteudo longo ".repeat((i % 4) + 1)}`, criado_em: new Date(Date.UTC(2026, 6, 25, 12) + i * 60000).toISOString() }));
test("margem da lista no celular após remontagem + envio", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })));
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.abort());
  await page.route(`${API}/**`, async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: chats });
    const send = p.match(/^\/chats\/(\d+)\/mensagens$/);
    if (send && req.method() === "POST") {
      const body = req.postDataJSON() || {};
      await new Promise((r) => setTimeout(r, 300));
      return route.fulfill({ json: { id: 999001, conversa_id: Number(send[1]), direcao: "out", tipo: "texto", texto: body.texto, status: "sent", client_temp_id: body.client_temp_id, criado_em: new Date().toISOString() } });
    }
    const m = p.match(/^\/chats\/(\d+)$/);
    if (m && req.method() === "GET") {
      await new Promise((r) => setTimeout(r, 200));
      return route.fulfill({ json: { conversa: { ...chats[Number(m[1]) - 1], mensagens_bloqueadas: false }, mensagens: msgs(Number(m[1]), 40), next_cursor: null, tags: [] } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/atendimento");
  const mob = testInfo.project.name.includes("mobile");
  const row = page.locator(".chat-list-row").filter({ hasText: "Contato Um" });
  if (mob) await row.tap(); else await row.click();
  await page.waitForTimeout(1800);
  if (process.env.REOPEN === '1') {
    const tap = async (n) => { const r = page.locator('.chat-list-row').filter({ hasText: n }); if (mob) await r.tap(); else await r.click(); };
    if (mob) { await page.goBack(); await page.waitForTimeout(500); }
    await tap('Contato Dois'); await page.waitForTimeout(1200);
    if (mob) { await page.goBack(); await page.waitForTimeout(500); }
    await tap('Contato Um'); await page.waitForTimeout(1800);
  }
  const geo = () => page.evaluate(() => {
    const el = document.querySelector(".wa-messages"); const root = el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
    const rows = [...root.children]; const lastRow = rows[rows.length - 1];
    const ty = (r) => Number((r.style.transform.match(/translateY\(([-\d.]+)px\)/) || [])[1] || 0);
    const all = [...el.querySelectorAll("[data-msg-id]")]; const last = all[all.length - 1];
    return { rootTop: root.offsetTop, rootH: root.offsetHeight, lastRowEnd: lastRow ? Math.round(ty(lastRow) + lastRow.offsetHeight) : null, st: Math.round(el.scrollTop), sh: el.scrollHeight, ch: el.clientHeight, gap: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), lastId: last?.getAttribute("data-msg-id"), lastBottomVsScroller: last ? Math.round(last.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom) : null };
  });
  console.log(`[${testInfo.project.name}] antes do envio`, JSON.stringify(await geo()));
  await page.evaluate(() => {
    window.__p = []; const s = performance.now(); const mc = new MessageChannel(); const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    mc.port1.onmessage = () => { const el = document.querySelector(".wa-messages"); const r = el.getBoundingClientRect(); const pos = {}; el.querySelectorAll("[data-msg-id]").forEach((b) => { const br = b.getBoundingClientRect(); if (br.bottom > r.top && br.top < r.bottom) pos[b.getAttribute("data-msg-id")] = Math.round(br.top); }); window.__p.push({ t: Math.round(performance.now() - s), st: Math.round(el.scrollTop), sh: el.scrollHeight, gap: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), pos }); if (performance.now() - s < 1500) tick(); };
    tick();
  });
  const input = page.locator("textarea.wa-input").first();
  await input.fill("Mensagem de teste da auditoria");
  await page.getByRole("button", { name: "Enviar mensagem" }).first().click();
  await page.waitForTimeout(1600);
  const p = await page.evaluate(() => window.__p);
  const jumps = []; for (let i = 1; i < p.length; i++) { let mx = 0, who = null; for (const k of Object.keys(p[i].pos)) if (k in p[i - 1].pos) { const d = Math.abs(p[i].pos[k] - p[i - 1].pos[k]); if (d > mx) { mx = d; who = k; } } if (mx > 2) jumps.push(`${p[i].t}ms ${who} ${mx}px st${p[i - 1].st}->${p[i].st} sh${p[i - 1].sh}->${p[i].sh} gap${p[i].gap}`); }
  console.log(`[${testInfo.project.name}] movimentos após envio:`, JSON.stringify(jumps));
  console.log(`[${testInfo.project.name}] depois do envio`, JSON.stringify(await geo()));
});
