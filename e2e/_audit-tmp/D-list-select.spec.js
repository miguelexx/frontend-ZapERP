// Lente D: clicar num card da lista — os cards mudam de lugar/altura? (badge de não lidas,
// patch de status pós-pintura, updateChatContato). Sonda pós-pintura nas linhas da lista.
import { test } from "@playwright/test";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const mk = (id, extra = {}) => ({ id, contato_nome: `Cliente ${id}`, nome_contato_cache: `Cliente ${id}`, telefone: "5511999990" + String(id).padStart(3, "0"), status_atendimento: "aberta", status_atendimento_real: "aberta", atendente_id: null, departamento_id: 1, unread_count: id % 3 === 0 ? 4 : 0, ultima_atividade: new Date(Date.UTC(2026, 10, 25, 12) - id * 60000).toISOString(), ultima_mensagem_preview: "Olá, tudo bem? Preciso de ajuda com meu pedido " + id, ...extra });
const chats = Array.from({ length: 30 }, (_, i) => mk(i + 1));
test("seleção de card não move a lista", async ({ page }, testInfo) => {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
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
      const id = Number(m[1]);
      await new Promise((r) => setTimeout(r, 250));
      return route.fulfill({ json: { conversa: { ...chats[id - 1], unread_count: 0, mensagens_bloqueadas: false }, mensagens: Array.from({ length: 12 }, (_, i) => ({ id: id * 1000 + i, conversa_id: id, direcao: i % 2 ? "out" : "in", tipo: "texto", texto: "Mensagem " + i, status: "lido", criado_em: new Date(Date.UTC(2026, 10, 25, 11) + i * 60000).toISOString() })), next_cursor: null, tags: [] } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/atendimento");
  await page.locator(".chat-list-row").first().waitFor();
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.__l = []; const s = performance.now(); const mc = new MessageChannel(); const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
    mc.port1.onmessage = () => {
      const rows = [...document.querySelectorAll(".chat-list-row")].slice(0, 14);
      window.__l.push({ t: Math.round(performance.now() - s), r: rows.map((r) => `${(r.textContent.match(/Cliente \d+/) || [""])[0]}@${Math.round(r.getBoundingClientRect().top)}h${Math.round(r.getBoundingClientRect().height)}`) });
      if (performance.now() - s < 2500) tick();
    };
    tick();
  });
  const row = page.locator(".chat-list-row").nth(3);
  console.log("rows:", await page.locator(".chat-list-row").count(), (await row.textContent()).slice(0, 60));
  if (testInfo.project.name.includes("mobile")) await row.tap(); else await row.click();
  await page.waitForTimeout(2600);
  const l = await page.evaluate(() => window.__l);
  const changes = [];
  for (let i = 1; i < l.length; i++) if (l[i].r.join() !== l[i - 1].r.join()) {
    const a = l[i - 1].r, b = l[i].r; const diff = b.filter((x, k) => x !== a[k]).slice(0, 4);
    changes.push(`${l[i].t}ms: ${diff.join(" ")}`);
  }
  console.log(`[${testInfo.project.name}] mudanças na lista:`, JSON.stringify(changes.slice(0, 12)));
  console.log(`[${testInfo.project.name}] console:`, JSON.stringify(errors.slice(0, 12)));
});
