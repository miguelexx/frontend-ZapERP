// Lente D: diagnóstico frame a frame da reabertura pelo cache no celular quando o GET chega
// DURANTE a máscara (APID=150). Mostra altura total do virtualizer, faixa de índices e scroll.
import { test } from "@playwright/test";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const APID = Number(process.env.APID || 150);
const mkChat = (id, nome) => ({ id, contato_nome: nome, nome_contato_cache: nome, telefone: "5511999990" + String(id).padStart(3, "0"), status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento", atendente_id: 1, departamento_id: 1, unread_count: 0, ultima_atividade: "2026-07-24T20:00:00.000Z" });
const chats = [mkChat(1, "Contato Um"), mkChat(2, "Contato Dois")];
const msgs = (cid, n) => Array.from({ length: n }, (_, i) => ({ id: cid * 100000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido", tipo: "texto", texto: `Msg ${i} ${"conteudo longo ".repeat((i % 4) + 1)}`, criado_em: new Date(Date.UTC(2026, 6, 25, 12) + i * 60000).toISOString() }));
test("diag reabertura mobile", async ({ page }, testInfo) => {
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
    const m = p.match(/^\/chats\/(\d+)$/);
    if (m && req.method() === "GET") {
      await new Promise((r) => setTimeout(r, APID));
      await page.evaluate(() => { window.__getAt = performance.now(); }).catch(() => {});
      return route.fulfill({ json: { conversa: { ...chats[Number(m[1]) - 1], mensagens_bloqueadas: false }, mensagens: msgs(Number(m[1]), 40), next_cursor: null, tags: [] } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/atendimento");
  const mob = testInfo.project.name.includes("mobile");
  const tap = async (n) => { const row = page.locator(".chat-list-row").filter({ hasText: n }); if (mob) await row.tap(); else await row.click(); };
  await tap("Contato Um"); await page.waitForTimeout(1500);
  if (mob) { await page.goBack(); await page.waitForTimeout(600); }
  await tap("Contato Dois"); await page.waitForTimeout(1500);
  if (mob) { await page.goBack(); await page.waitForTimeout(600); }
  await page.evaluate(() => {
    window.__d = []; const s = performance.now(); window.__s = s;
    const mc = new MessageChannel(); const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    mc.port1.onmessage = () => {
      const el = document.querySelector(".wa-messages");
      if (el) {
        const root = el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
        const rows = root ? [...root.children] : [];
        const idx = rows.map((r) => Number(r.getAttribute("data-index")));
        const hs = rows.map((r) => Math.round(r.getBoundingClientRect().height));
        const b = el.querySelector('[data-msg-id="100034"]');
        window.__d.push(`${Math.round(performance.now() - s)}|op${root ? getComputedStyle(root).opacity : "-"}|${el.className.includes("opening") ? "MASK" : "vis"}|st${Math.round(el.scrollTop)} sh${el.scrollHeight} ch${el.clientHeight}|rootH ${root?.style.height} rt${root?.offsetTop}|idx ${idx[0]}..${idx[idx.length - 1]} n${idx.length}|sumH ${hs.reduce((a, c) => a + c, 0)}|ty0 ${rows[0]?.style.transform}|b34 ${b ? Math.round(b.getBoundingClientRect().top) : "-"}|get ${window.__getAt ? Math.round(window.__getAt - s) : "-"}`);
      }
      if (performance.now() - s < 700) tick();
    };
    tick();
  });
  await tap("Contato Um"); await page.waitForTimeout(900);
  console.log((await page.evaluate(() => window.__d)).join("\n"));
});
