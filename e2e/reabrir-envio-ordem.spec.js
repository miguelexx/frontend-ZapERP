// Regressão (16/11/2026): enviar numa conversa ENCERRADA reabre-a. A bolha tem de aparecer na
// hora (antes só aparecia depois do POST /reabrir) e 2 mensagens rápidas têm de chegar ao
// servidor na ordem do Enter (antes a 2.ª podia passar à frente da 1.ª).
import { test, expect } from "@playwright/test";

const API = process.env.VITE_API_URL || "http://localhost:5000";

const conversaFechada = {
  id: 1,
  contato_nome: "Contato Encerrado",
  nome_contato_cache: "Contato Encerrado",
  telefone: "5511999990001",
  status_atendimento: "fechada",
  status_atendimento_real: "fechada",
  atendente_id: 1,
  departamento_id: 1,
  unread_count: 0,
  ultima_atividade: "2026-07-24T20:00:00.000Z",
};

const historico = Array.from({ length: 12 }, (_, i) => ({
  id: 80_000 + i,
  conversa_id: 1,
  direcao: i % 2 ? "out" : "in",
  status: "lido",
  tipo: "texto",
  texto: `Historico ${i}`,
  criado_em: new Date(Date.UTC(2026, 6, 24, 12) + i * 60000).toISOString(),
}));

async function montar(page, { reabrirStatus = 200, reabrirAtrasoMs = 900 } = {}) {
  const eventos = [];
  await page.route(/https:\/\/fonts\./, (r) => r.abort());
  await page.addInitScript(() =>
    localStorage.setItem(
      "zap_erp_auth",
      JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } })
    )
  );
  let aberta = false;
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: [conversaFechada] });
    if (p === "/chats/1/reabrir" && req.method() === "POST") {
      eventos.push({ tipo: "reabrir_inicio", t: Date.now() });
      await new Promise((r) => setTimeout(r, reabrirAtrasoMs));
      eventos.push({ tipo: "reabrir_fim", t: Date.now() });
      if (reabrirStatus !== 200) return route.fulfill({ status: reabrirStatus, json: { error: "Falha simulada ao reabrir" } });
      aberta = true;
      return route.fulfill({ json: { ok: true, conversa: { ...conversaFechada, status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento" } } });
    }
    if (p === "/chats/1" && req.method() === "GET") {
      const st = aberta ? "em_atendimento" : "fechada";
      return route.fulfill({
        json: {
          conversa: { ...conversaFechada, status_atendimento: st, status_atendimento_real: st, mensagens_bloqueadas: false },
          mensagens: historico,
          next_cursor: null,
          tags: [],
        },
      });
    }
    if (p === "/chats/1/mensagens" && req.method() === "POST") {
      const body = req.postDataJSON();
      eventos.push({ tipo: "mensagem", texto: body.texto, t: Date.now() });
      await new Promise((r) => setTimeout(r, 150));
      return route.fulfill({
        json: {
          mensagem: {
            id: 90_000 + eventos.length,
            conversa_id: 1,
            texto: body.texto,
            client_temp_id: body.client_temp_id,
            direcao: "out",
            criado_em: new Date().toISOString(),
            status: "enviado",
          },
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/atendimento");
  // Encerrada não aparece em "Minha fila".
  await page.getByRole("button", { name: /Finalizadas/ }).first().click();
  await page.locator(".chat-list-row").filter({ hasText: "Contato Encerrado" }).click();
  await expect(page.locator(".wa-messages")).not.toHaveClass(/wa-messages--opening/);
  await page.waitForTimeout(800);
  return eventos;
}

test("reabrir pelo envio: bolha imediata e ordem do Enter preservada", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"));
  const eventos = await montar(page);
  const input = page.locator(".wa-input");
  await input.click();
  await input.fill("Primeira mensagem");
  await page.keyboard.press("Enter");
  const t0 = Date.now();
  // Segunda mensagem logo a seguir, ENQUANTO o reabrir ainda está no servidor (900ms).
  await input.fill("Segunda mensagem");
  await page.keyboard.press("Enter");
  await expect(page.locator(".wa-bubble").filter({ hasText: "Primeira mensagem" })).toHaveCount(1, { timeout: 2000 });
  const msAteBolha = Date.now() - t0;
  await expect.poll(() => eventos.filter((e) => e.tipo === "mensagem").length, { timeout: 8000 }).toBe(2);
  const ordem = eventos.map((e) => (e.tipo === "mensagem" ? e.texto : e.tipo));
  console.log("[reabrir-ordem]", JSON.stringify({ msAteBolha, ordem }));
  expect(msAteBolha).toBeLessThan(600); // reabrir demora 900ms: a bolha não pode esperar por ele
  expect(ordem).toEqual(["reabrir_inicio", "reabrir_fim", "Primeira mensagem", "Segunda mensagem"]);
});

test("reabrir falha: a bolha sai e o texto volta ao campo", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"));
  const eventos = await montar(page, { reabrirStatus: 500, reabrirAtrasoMs: 300 });
  const input = page.locator(".wa-input");
  await input.click();
  await input.fill("Mensagem que nao vai");
  await page.keyboard.press("Enter");
  await expect.poll(() => eventos.some((e) => e.tipo === "reabrir_fim"), { timeout: 5000 }).toBe(true);
  await expect(page.locator(".wa-bubble").filter({ hasText: "Mensagem que nao vai" })).toHaveCount(0, { timeout: 3000 });
  await expect(input).toHaveValue("Mensagem que nao vai");
  expect(eventos.filter((e) => e.tipo === "mensagem")).toHaveLength(0);
});
