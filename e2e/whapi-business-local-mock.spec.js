import { expect, test } from "@playwright/test";

const user = {
  id: 1,
  nome: "Admin ZapERP",
  email: "admin@zaperp.local",
  perfil: "admin",
  role: "admin",
  company_id: 12,
};

async function installMock(page, sessionUser = user, options = {}) {
  let profileGetCount = 0;
  let profile = {
    id: "5534999998888",
    address: "Av. Brasil, 1200 · Centro, Uberlândia - MG",
    description: "Atendimento consultivo para empresas que querem vender mais pelo WhatsApp.",
    email: "contato@zaperp.com.br",
    websites: ["https://zaperp.com.br", "https://instagram.com/zaperp"],
    hours: {
      timeZone: "America/Sao_Paulo",
      config: [
        { day: "mon", mode: "specific_hours", openTime: 480, closeTime: 1080 },
        { day: "tue", mode: "specific_hours", openTime: 480, closeTime: 1080 },
        { day: "wed", mode: "specific_hours", openTime: 480, closeTime: 1080 },
        { day: "thu", mode: "specific_hours", openTime: 480, closeTime: 1080 },
        { day: "fri", mode: "specific_hours", openTime: 480, closeTime: 1020 },
      ],
    },
  };
  let labels = [
    { id: "1", name: "Novo cliente", color: "mediumturquoise", count: 2 },
    { id: "2", name: "Orçamento enviado", color: "gold", count: 1 },
    { id: "3", name: "Cliente VIP", color: "mediumpurple", count: 0 },
  ];
  const associations = {
    "1": [{ id: "5534988887777@s.whatsapp.net", name: "Mariana Costa", type: "contact" }],
    "2": [{ id: "5534977776666@s.whatsapp.net", name: "Felipe Alves", type: "contact" }],
    "3": [],
  };

  await page.addInitScript((sessionUser) => {
    localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "whapi-business-local", user: sessionUser }));
  }, sessionUser);

  await page.route(/^https?:\/\/(?:localhost:(?:3000|5000)|zapapi\.wmsistemas\.inf\.br)\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const json = (body, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (path === "/api/integrations/whatsapp/instances" && method === "GET") {
      return json({ instances: [{ id: 41, nome: "Comercial · Uberlândia", provider: "whapi", is_default: true, connected: true, is_business: options.isBusiness ?? true, display_phone: "+55 34 99999-8888" }], whapi: { partnerEnabled: true } });
    }
    if (path === "/chats/whatsapp-instances" && method === "GET") {
      return json({ instances: [{ id: 41, nome: "Comercial · Uberlândia", provider: "whapi", is_default: true, connected: true, display_phone: "+55 34 99999-8888" }] });
    }
    if (path === "/api/integrations/whatsapp/instances/41/business-profile" && method === "GET") {
      profileGetCount += 1;
      return json({ provider: "whapi", profile });
    }
    if (path === "/api/integrations/whatsapp/instances/41/business-profile" && method === "POST") {
      profile = { ...profile, ...request.postDataJSON() };
      return json({ sucesso: true, provider: "whapi" });
    }
    if (path === "/api/labels" && method === "GET") return json({ labels });
    if (path === "/api/labels" && method === "POST") {
      const body = request.postDataJSON();
      const label = { id: body.id || String(labels.length + 1), name: body.name, color: body.color, count: 0 };
      labels = [...labels, label];
      associations[label.id] = [];
      return json({ sucesso: true, label }, 201);
    }
    const associationMatch = path.match(/^\/api\/labels\/(\d+)\/associacoes$/);
    if (associationMatch && method === "POST") {
      const labelId = associationMatch[1];
      const chat = request.postDataJSON().chat;
      associations[labelId] = [...(associations[labelId] || []), { id: `${chat.replace(/\D/g, "")}@s.whatsapp.net`, name: chat }];
      return json({ sucesso: true });
    }
    if (associationMatch && method === "DELETE") return json({ sucesso: true });
    const chatsMatch = path.match(/^\/api\/labels\/(\d+)\/chats$/);
    if (chatsMatch && method === "GET") return json({ chats: associations[chatsMatch[1]] || [], messages: [] });
    const labelMatch = path.match(/^\/api\/labels\/(\d+)$/);
    if (labelMatch && method === "PATCH") {
      labels = labels.map((label) => label.id === labelMatch[1] ? { ...label, name: request.postDataJSON().name } : label);
      return json({ sucesso: true });
    }
    if (labelMatch && method === "DELETE") {
      labels = labels.filter((label) => label.id !== labelMatch[1]);
      return json({ sucesso: true });
    }
    if (path.includes("/socket.io/")) return route.abort();
    return json({});
  });
  return { get profileGetCount() { return profileGetCount; } };
}

test("perfil Business carrega, edita e salva no contrato Whapi", async ({ page }) => {
  const mock = await installMock(page);
  await page.goto("/whatsapp-business/perfil");

  await expect(page.getByRole("heading", { name: "Perfil da empresa" })).toBeVisible();
  await expect(page.locator('input[value="contato@zaperp.com.br"]')).toBeVisible();
  await expect(page.getByText("Comercial · Uberlândia", { exact: true }).last()).toBeVisible();

  const description = page.getByLabel(/Descrição/);
  await description.fill("Atendimento premium e vendas pelo WhatsApp.");
  await page.getByRole("button", { name: "Salvar no WhatsApp" }).click();
  await expect(page.getByText("Perfil sincronizado com o canal.")).toBeVisible();
  expect(mock.profileGetCount).toBe(1);
});

test("conta WhatsApp comum não tenta consultar o endpoint Business", async ({ page }) => {
  const mock = await installMock(page, user, { isBusiness: false });
  await page.goto("/whatsapp-business/perfil");

  await expect(page.getByRole("heading", { name: "Este canal não é WhatsApp Business" })).toBeVisible();
  await expect(page.getByText(/Migre o número para o app WhatsApp Business/)).toBeVisible();
  expect(mock.profileGetCount).toBe(0);
});

test("labels lista, cria e abre associações", async ({ page }) => {
  await installMock(page);
  await page.goto("/whatsapp-business/labels");

  await expect(page.getByRole("heading", { name: "Labels do WhatsApp" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Novo cliente ID 1/ })).toBeVisible();
  await expect(page.getByText("Mariana Costa", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Novo label" }).click();
  await page.getByPlaceholder("Ex.: Cliente VIP").fill("Pós-venda");
  await page.getByRole("button", { name: "Criar label" }).click();
  await expect(page.getByRole("button", { name: /Pós-venda ID 4/ })).toBeVisible();
});

test("atendente acessa labels, mas não a edição do Perfil Business", async ({ page }) => {
  await installMock(page, { ...user, perfil: "atendente", role: "atendente" });
  await page.goto("/whatsapp-business");

  await expect(page).toHaveURL(/\/whatsapp-business\/labels/);
  await expect(page.getByRole("heading", { name: "Labels do WhatsApp" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Perfil Business" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Novo label" })).toHaveCount(0);
});
