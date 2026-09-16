import { test, expect } from "@playwright/test";

const API = process.env.VITE_API_URL || "http://localhost:5000";
const labels = [
  { id: "17", name: "COTAÇÃO NOVO", color: "lightskyblue" },
  { id: "18", name: "COTAÇÃO RENOVAÇÃO", color: "gold" },
  { id: "0", name: "Cliente especial", color: "plum" },
];

async function setup(page, { failSave = false } = {}) {
  const requests = [];
  const associations = new Map(labels.map((label) => [label.id, new Set()]));
  const chats = [1, 2].map((id) => ({
    id, contato_nome: `Cliente Etiquetas ${id}`, telefone: `551199999000${id}`,
    whatsapp_instance_id: id === 1 ? 7 : 8, whatsapp_instance_provider: "whapi",
    status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento",
    atendente_id: 1, departamento_id: 1, unread_count: 0,
    ultima_atividade: "2026-09-15T12:00:00.000Z",
  }));
  await page.addInitScript(() => localStorage.setItem("zap_erp_auth", JSON.stringify({
    token: "labels-local-test", user: { id: 1, nome: "Atendente", perfil: "atendente", role: "atendente", departamento_ids: [1] },
  })));
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (path.startsWith("/socket.io")) return route.abort();
    if (path === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "atendente", role: "atendente" } });
    if (path === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (path === "/config/empresa") return route.fulfill({ json: { id: 1, nome: "Etiquetas Teste" } });
    if (path === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (path === "/tags" || path === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (path === "/chats/counts") return route.fulfill({ json: { todas: 2, minha_fila: 2, em_atendimento: 2 } });
    if (path === "/chats") return route.fulfill({ json: chats });
    const detail = path.match(/^\/chats\/(\d+)$/);
    if (detail) return route.fulfill({ json: { conversa: chats[Number(detail[1]) - 1], mensagens: [], tags: [], next_cursor: null } });
    if (path === "/api/labels") return route.fulfill({ json: { labels } });
    const match = path.match(/^\/api\/labels\/(\d+)\/(chats|associacoes)$/);
    if (match) {
      const set = associations.get(match[1]);
      if (match[2] === "chats") {
        const instance = url.searchParams.get("whatsapp_instance_id");
        return route.fulfill({ json: { chats: [...set].filter((key) => key.startsWith(`${instance}:`)).map((key) => ({ id: key.split(":")[1] })), messages: [] } });
      }
      const body = req.postDataJSON();
      requests.push({ method: req.method(), ...body });
      if (failSave) return route.fulfill({ status: 502, json: { error: "Falha simulada" } });
      const key = `${body.whatsapp_instance_id}:${body.chat}`;
      if (req.method() === "POST") set.add(key);
      else set.delete(key);
      return route.fulfill({ json: { sucesso: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/atendimento", { waitUntil: "domcontentloaded" });
  const row = page.locator(".chat-list-row").filter({ hasText: "Cliente Etiquetas 1" });
  if (page.viewportSize().width < 640) await row.tap();
  else await row.click();
  await expect(page.locator(".wa-header-name")).toHaveText("Cliente Etiquetas 1");
  return { requests };
}

async function openPicker(page) {
  await page.getByRole("button", { name: "Mais opções", exact: true }).click();
  await page.getByRole("button", { name: "Etiquetas do WhatsApp", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Etiquetas do WhatsApp" });
  await expect(dialog.getByRole("button", { name: "COTAÇÃO NOVO", exact: true })).toBeVisible();
  return dialog;
}

test("atendente seleciona, persiste e remove etiquetas no canal correto", async ({ page }, testInfo) => {
  const { requests } = await setup(page);
  let dialog = await openPicker(page);
  const label = dialog.getByRole("button", { name: "COTAÇÃO NOVO", exact: true });
  await label.click();
  await expect(label).toHaveAttribute("aria-pressed", "true");
  expect(requests).toEqual([{ method: "POST", whatsapp_instance_id: 7, chat: "5511999990001@s.whatsapp.net" }]);
  await dialog.getByRole("button", { name: "Cliente especial", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Cliente especial", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("textbox", { name: "Buscar etiquetas" }).fill("renovação");
  await expect(dialog.locator(".wa-labelPicker-option")).toHaveCount(1);
  await dialog.getByRole("textbox", { name: "Buscar etiquetas" }).fill("");
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.screenshot({ path: testInfo.outputPath("etiquetas-seletor.png") });
  await dialog.getByRole("button", { name: "Concluir" }).click();
  await expect(page.locator(".wa-whatsappLabels")).toContainText("COTAÇÃO NOVO");
  await page.screenshot({ path: testInfo.outputPath("etiquetas-conversa.png") });
  await page.reload({ waitUntil: "domcontentloaded" });
  const firstRow = page.locator(".chat-list-row").filter({ hasText: "Cliente Etiquetas 1" });
  await expect(firstRow).toBeVisible();
  if (testInfo.project.name.includes("mobile")) await firstRow.tap();
  else await firstRow.click();
  await expect(page.locator(".wa-whatsappLabels")).toContainText("COTAÇÃO NOVO");
  dialog = await openPicker(page);
  await expect(dialog.getByRole("button", { name: "COTAÇÃO NOVO", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "COTAÇÃO NOVO", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "COTAÇÃO NOVO", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".wa-whatsappLabels")).not.toContainText("COTAÇÃO NOVO");
  if (testInfo.project.name.includes("mobile")) await page.getByRole("button", { name: "Voltar para lista de conversas" }).click();
  const secondRow = page.locator(".chat-list-row").filter({ hasText: "Cliente Etiquetas 2" });
  if (testInfo.project.name.includes("mobile")) await secondRow.tap();
  else await secondRow.click();
  await expect(page.locator(".wa-whatsappLabels")).toHaveCount(0);
  dialog = await openPicker(page);
  await dialog.getByRole("button", { name: "COTAÇÃO NOVO", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "COTAÇÃO NOVO", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(requests.at(-1)).toEqual({ method: "POST", whatsapp_instance_id: 8, chat: "5511999990002@s.whatsapp.net" });
});

test("falha ao salvar mantém etiqueta desmarcada e permite tentar novamente", async ({ page }) => {
  await setup(page, { failSave: true });
  const dialog = await openPicker(page);
  const label = dialog.getByRole("button", { name: "COTAÇÃO NOVO", exact: true });
  await label.click();
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível salvar");
  await expect(label).toHaveAttribute("aria-pressed", "false");
  await expect(label).toBeEnabled();
  await dialog.getByRole("button", { name: "Concluir" }).click();
  await expect(page.locator(".wa-whatsappLabels")).toHaveCount(0);
});
