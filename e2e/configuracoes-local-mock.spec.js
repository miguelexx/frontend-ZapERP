import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const API = process.env.VITE_API_URL || "http://localhost:5000";

const admin = {
  id: 1,
  nome: "Admin Configuracoes",
  email: "admin.config@local.test",
  perfil: "admin",
  role: "admin",
  company_id: 1,
  departamento_ids: [10],
};

async function installSession(page, user = admin) {
  await page.addInitScript((sessionUser) => {
    localStorage.setItem(
      "zap_erp_auth",
      JSON.stringify({ token: "config-local-token", user: sessionUser })
    );
  }, user);
}

function defaultPayload(path, user = admin) {
  if (path === "/usuarios/me") return user;
  if (path === "/usuarios/me/permissoes") return { permissoes: [] };
  if (path === "/config/empresa") {
    return {
      id: 1,
      nome: "ZapERP Config Test",
      cor_primaria: "#2563eb",
      nome_fonte: "inter",
      zapi_auto_sync_contatos: true,
    };
  }
  if (path === "/usuarios") {
    return [{ id: 1, nome: "Admin Configuracoes", email: admin.email, perfil: "admin", ativo: true, departamentos: [] }];
  }
  if (path === "/dashboard/departamentos") return [{ id: 10, nome: "Suporte" }];
  if (path === "/tags") return [{ id: 20, nome: "VIP", cor: "#6366f1" }];
  if (path === "/dashboard/respostas-salvas") return [];
  if (path === "/config/auditoria") return [];
  if (path === "/config/empresas-whatsapp") return [];
  if (path === "/config/atendimento-limits") {
    return { enabled: false, default_config: {}, user_configs: [], history: [] };
  }
  return {};
}

async function installConfigApi(page, options = {}) {
  const calls = [];
  const writes = [];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const isApiRequest = [
      "/usuarios",
      "/config",
      "/dashboard",
      "/tags",
      "/clientes",
      "/api/",
      "/notifications",
      "/chats",
      "/socket.io",
    ].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    if (!isApiRequest) {
      await route.continue();
      return;
    }
    calls.push({ method, path, search: url.search });

    if (path.startsWith("/socket.io")) {
      await route.abort();
      return;
    }

    if (method !== "GET") {
      let body = null;
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
      writes.push({ method, path, body });
      if (options.onWrite) {
        const response = await options.onWrite({ method, path, body, request });
        if (response) {
          await route.fulfill(response);
          return;
        }
      }
      await route.fulfill({ json: body || {} });
      return;
    }

    if (path === "/clientes") {
      if (options.onClientes) {
        const response = await options.onClientes({ url, request });
        await route.fulfill(response);
        return;
      }
      await route.fulfill({
        headers: { "x-total-count": "1" },
        json: [{ id: 30, nome: "Cliente Inicial", telefone: "5511999999999" }],
      });
      return;
    }

    if (options.failPath === path) {
      await route.fulfill({ status: 500, json: { error: "Falha controlada" } });
      return;
    }

    if (options.delayPaths?.[path]) {
      await new Promise((resolve) => setTimeout(resolve, options.delayPaths[path]));
    }

    if (Object.prototype.hasOwnProperty.call(options.payloads || {}, path)) {
      await route.fulfill({ json: options.payloads[path] });
      return;
    }

    await route.fulfill({ json: defaultPayload(path, options.user || admin) });
  });

  return { calls, writes };
}

test.describe("Configuracoes - contratos protegidos", () => {
  test.beforeEach(async ({ page }) => {
    await installSession(page);
  });

  test("sincroniza a aba com a URL e preserva a navegacao entre secoes", async ({ page }) => {
    const api = await installConfigApi(page);
    await page.goto("/configuracoes?tab=tags");

    await expect(page.getByRole("heading", { name: "Tags / Etiquetas" })).toBeVisible();
    await expect(page).toHaveURL(/tab=tags/);
    const tagsCallsAfterFirstVisit = api.calls.filter((item) => item.path === "/tags").length;

    await page.getByRole("button", { name: "Departamentos" }).click();
    await expect(page.getByRole("heading", { name: "Departamentos (Setores)" })).toBeVisible();
    await expect(page).toHaveURL(/tab=departamentos/);

    await page.getByRole("button", { name: "Tags" }).click();
    await expect(page.getByRole("heading", { name: "Tags / Etiquetas" })).toBeVisible();
    await expect(page).toHaveURL(/tab=tags/);
    expect(api.calls.filter((item) => item.path === "/tags").length).toBe(tagsCallsAfterFirstVisit);
  });

  test("abre a aba geral por padrao e exibe loading e estado vazio por secao", async ({ page }) => {
    await installConfigApi(page, {
      delayPaths: { "/tags": 500 },
      payloads: { "/tags": [] },
    });
    await page.goto("/configuracoes");
    await expect(page).toHaveURL(/tab=geral/);
    await expect(page.getByRole("heading", { name: "Configurações gerais" })).toBeVisible();

    await page.getByRole("button", { name: "Tags" }).click();
    await expect(page.locator(".ds-skeleton-grid")).toBeVisible();
    await expect(page.getByText("Nenhuma tag cadastrada. Crie a primeira acima.")).toBeVisible();
  });

  test("abre e fecha modal de usuario sem alterar o contrato do payload", async ({ page }) => {
    const api = await installConfigApi(page);
    await page.goto("/configuracoes?tab=usuarios");

    await page.getByRole("button", { name: "Novo usuário" }).click();
    await expect(page.getByRole("heading", { name: "Novo usuário" })).toBeVisible();
    const modal = page.getByRole("heading", { name: "Novo usuário" }).locator("..");
    await modal.locator("input").nth(0).fill("Nova Pessoa");
    await modal.locator('input[type="email"]').fill("nova@local.test");
    await modal.locator('input[type="password"]').fill("senha-segura");
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect.poll(() => api.writes.filter((item) => item.path === "/usuarios").length).toBe(1);
    const write = api.writes.find((item) => item.path === "/usuarios");
    expect(write).toMatchObject({
      method: "POST",
      body: {
        nome: "Nova Pessoa",
        email: "nova@local.test",
        senha: "senha-segura",
        perfil: "atendente",
        departamento_ids: [],
        ativo: true,
      },
    });
  });

  test("preserva endpoints e payloads de criar, editar e excluir tag", async ({ page }) => {
    const api = await installConfigApi(page);
    await page.goto("/configuracoes?tab=tags");
    await expect(page.getByText("VIP", { exact: true })).toBeVisible();

    await page.getByPlaceholder("Nome", { exact: true }).fill("Prioridade");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect.poll(() => api.writes.some((item) => item.method === "POST" && item.path === "/tags")).toBe(true);
    expect(api.writes.find((item) => item.method === "POST" && item.path === "/tags")?.body).toEqual({
      nome: "Prioridade",
      cor: "#6366f1",
    });

    await page.getByRole("button", { name: "Editar" }).click();
    const editInput = page.locator(".config-inlineEdit").getByPlaceholder("Nome");
    await editInput.fill("VIP Editada");
    await page.locator(".config-inlineEdit").getByRole("button", { name: /Salvar/ }).click();
    await expect.poll(() => api.writes.some((item) => item.method === "PUT" && item.path === "/tags/20")).toBe(true);
    expect(api.writes.find((item) => item.method === "PUT" && item.path === "/tags/20")?.body).toEqual({
      nome: "VIP Editada",
      cor: "#6366f1",
    });

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Excluir" }).click();
    await expect.poll(() => api.writes.some((item) => item.method === "DELETE" && item.path === "/tags/20")).toBe(true);
  });

  test("abre e fecha os modais principais de clientes sem chamadas de escrita", async ({ page }) => {
    const api = await installConfigApi(page);
    await page.goto("/configuracoes?tab=clientes");
    await expect(page.getByText("Cliente Inicial", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Novo cliente" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();

    await page.getByRole("button", { name: "Importar clientes" }).click();
    await expect(page.getByRole("heading", { name: "Importar clientes por planilha" })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    expect(api.writes).toEqual([]);
  });

});

test.describe("Configuracoes - regressões alvo", () => {
  test.beforeEach(async ({ page }) => {
    await installSession(page);
  });

  test("carrega somente os endpoints exigidos pela aba aberta", async ({ page }) => {
    const api = await installConfigApi(page);
    await page.goto("/configuracoes?tab=tags");
    await expect(page.getByText("VIP", { exact: true })).toBeVisible();

    const configPaths = api.calls
      .filter((item) => item.method === "GET")
      .map((item) => item.path);
    expect(configPaths).not.toContain("/usuarios");
    expect(configPaths).not.toContain("/clientes");
    expect(configPaths).not.toContain("/dashboard/respostas-salvas");
    expect(configPaths).not.toContain("/config/auditoria");
    expect(configPaths).not.toContain("/config/empresas-whatsapp");
  });

  test("redireciona usuario sem permissao e restringe atendente ao modo respostas", async ({ page }) => {
    const semAcesso = { ...admin, perfil: "visitante", role: "visitante" };
    await installSession(page, semAcesso);
    await installConfigApi(page, { user: semAcesso });
    await page.goto("/configuracoes");
    await expect(page).toHaveURL(/\/atendimento/);

    const atendente = { ...admin, perfil: "atendente", role: "atendente" };
    await page.evaluate((user) => {
      localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "config-local-token", user }));
    }, atendente);
    await page.goto("/configuracoes?tab=tags");
    await expect(page).toHaveURL(/tab=respostas/);
    await expect(page.getByRole("heading", { name: "Respostas salvas", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tags" })).toHaveCount(0);
  });

  test("mantem erro de uma secao isolado e permite navegar para outra", async ({ page }) => {
    await installConfigApi(page, { failPath: "/tags" });
    await page.goto("/configuracoes?tab=tags");
    const sectionError = page.locator(".ia-error-banner").filter({ hasText: "Falha controlada" });
    await expect(sectionError).toBeVisible();

    await page.getByRole("button", { name: "Departamentos" }).click();
    await expect(page.getByText("Suporte", { exact: true })).toBeVisible();
    await expect(sectionError).toBeHidden();
  });

  test("ignora resposta antiga de busca de clientes", async ({ page }) => {
    let resolveOldRequest;
    const oldRequestSeen = new Promise((resolve) => {
      resolveOldRequest = resolve;
    });
    await installConfigApi(page, {
      onClientes: async ({ url }) => {
        const palavra = url.searchParams.get("palavra") || "";
        if (palavra === "antiga") {
          resolveOldRequest();
          await new Promise((resolve) => setTimeout(resolve, 700));
          return {
            headers: { "x-total-count": "1" },
            json: [{ id: 31, nome: "Resposta Antiga", telefone: "551100000031" }],
          };
        }
        if (palavra === "nova") {
          return {
            headers: { "x-total-count": "1" },
            json: [{ id: 32, nome: "Resposta Nova", telefone: "551100000032" }],
          };
        }
        return {
          headers: { "x-total-count": "1" },
          json: [{ id: 30, nome: "Cliente Inicial", telefone: "5511999999999" }],
        };
      },
    });

    await page.goto("/configuracoes?tab=clientes");
    const search = page.getByPlaceholder("Digite nome ou telefone...");
    await search.fill("antiga");
    await oldRequestSeen;
    await search.fill("nova");

    await expect(page.getByText("Resposta Nova", { exact: true })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByText("Resposta Nova", { exact: true })).toBeVisible();
    await expect(page.getByText("Resposta Antiga", { exact: true })).toHaveCount(0);
  });
});

test.describe("Configuracoes - evidencias visuais", () => {
  test.skip(!process.env.CONFIG_VISUAL_CAPTURE, "Executado somente na validação visual da sessão.");

  test("captura geral, tabela e modal nas larguras acordadas", async ({ page }) => {
    await installSession(page);
    await installConfigApi(page);
    const phase = process.env.CONFIG_VISUAL_PHASE || "after";
    const outputDir = resolve("docs", "evidencias", "sessao-02-configuracoes");
    mkdirSync(outputDir, { recursive: true });

    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "tablet-768", width: 768, height: 1024 },
      { name: "mobile-375", width: 375, height: 812 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/configuracoes?tab=geral");
      await expect(page.getByRole("heading", { name: "Configurações", level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: "Salvar configurações gerais" })).toBeVisible();
      await page.screenshot({
        path: resolve(outputDir, `${phase}-${viewport.name}-geral.png`),
        fullPage: true,
      });

      await page.getByRole("button", { name: "Usuários" }).click();
      await expect(page.getByRole("button", { name: "Novo usuário" })).toBeVisible();
      await page.getByRole("button", { name: "Novo usuário" }).click();
      await expect(page.getByRole("heading", { name: "Novo usuário" })).toBeVisible();
      await page.screenshot({
        path: resolve(outputDir, `${phase}-${viewport.name}-usuarios-modal.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Cancelar" }).click();
    }
  });
});
