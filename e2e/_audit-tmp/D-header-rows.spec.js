// Lente D: quanto cada linha opcional do cabeçalho muda a altura do .wa-header (e portanto o
// clientHeight do scroller): "digitando…"/presença (socket, a qualquer hora) e etiquetas.
// Injeta o mesmo markup do ConversaHeader e mede; não depende de socket.
import { test } from "@playwright/test";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const chat = { id: 1, contato_nome: "Contato Um", telefone: "5511999990001", status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento", atendente_id: 1, departamento_id: 1, unread_count: 0, ultima_atividade: "2026-07-24T20:00:00.000Z" };
test("altura das linhas opcionais do cabeçalho", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })));
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.abort());
  await page.route(`${API}/**`, async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: [chat] });
    if (p === "/chats/1") return route.fulfill({ json: { conversa: chat, mensagens: Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, conversa_id: 1, direcao: i % 2 ? "out" : "in", tipo: "texto", texto: "Msg " + i, status: "lido", criado_em: new Date(Date.UTC(2026, 6, 25, 12) + i * 60000).toISOString() })), next_cursor: null, tags: [] } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto("/atendimento");
  const row = page.locator(".chat-list-row").filter({ hasText: "Contato Um" });
  if (testInfo.project.name.includes("mobile")) await row.tap(); else await row.click();
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const hdr = document.querySelector(".wa-header"); const msgs = document.querySelector(".wa-messages");
    const h0 = hdr.getBoundingClientRect().height; const c0 = msgs.clientHeight;
    const info = hdr.querySelector(".wa-header-info");
    const t = document.createElement("div"); t.className = "wa-header-typingRow"; t.innerHTML = '<span class="wa-typing-dots">digitando<span class="wa-typing-dots-inner"><span class="wa-typing-dot">.</span></span></span>';
    info.appendChild(t);
    const h1 = hdr.getBoundingClientRect().height; const c1 = msgs.clientHeight;
    t.remove();
    const l = document.createElement("div"); l.className = "wa-whatsappLabels"; l.innerHTML = '<button type="button" class="wa-whatsappLabel"><i></i>VIP</button>';
    hdr.appendChild(l);
    const h2 = hdr.getBoundingClientRect().height; const c2 = msgs.clientHeight;
    l.remove();
    return { header: Math.round(h0), typingRowDelta: Math.round(h1 - h0), scrollerDeltaTyping: c1 - c0, labelsRowDelta: Math.round(h2 - h0), scrollerDeltaLabels: c2 - c0 };
  });
  console.log(`[${testInfo.project.name}]`, JSON.stringify(r));
});
