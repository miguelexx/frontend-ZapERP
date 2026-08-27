import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildTriagemPayload } from "../src/ia/triagem/triagemPayload.js";
import { DEFAULT_CONFIG } from "../src/ia/shared/configDefaults.js";

const admin = {
  id: 1,
  nome: "Admin IA",
  email: "admin.ia@local.test",
  perfil: "admin",
  role: "admin",
  company_id: 1,
};

const defaultConfig = {
  ia: {
    usar_ia: false,
    sugerir_respostas: true,
    corrigir_texto: false,
    auto_completar: false,
    resumo_conversa: true,
    classificar_intencao: true,
    sugerir_tags: true,
  },
  automacoes: {
    encerrar_automatico_min: 0,
    mensagem_encerramento_inatividade: "-conversa encerrada por conta de inatividade-",
    transferir_para_humano_apos_bot: true,
    limite_mensagens_bot: 5,
    auto_assumir: false,
    reabrir_automaticamente: false,
  },
  chatbot_triage: {
    enabled: false,
    welcomeMessage: "Bem-vindo ao atendimento",
    invalidOptionMessage: "Opcao invalida",
    confirmSelectionMessage: "Direcionado para {{departamento}}",
    enviarMensagemFinalizacao: false,
    mensagemFinalizacao: "Protocolo {{protocolo}}",
    foraHorarioEnabled: false,
    horarioInicio: "09:00",
    horarioFim: "18:00",
    diasSemanaDesativados: [0, 6],
    datasEspecificasFechadas: [],
    mensagemForaHorario: "Fora do horario",
    intervaloEnvioSegundos: 3,
    sendOnlyFirstTime: true,
    fallbackToAI: false,
    businessHoursOnly: false,
    transferMode: "departamento",
    tipo_distribuicao: "fila",
    reopenMenuCommand: "0",
    options: [{ key: "1", label: "Suporte", departamento_id: 10, active: true }],
  },
  admin_atendimento_alerta: {
    ativo: false,
    cliente_id: null,
    cliente_nome: "",
    telefone_admin: "",
    horario_envio: "09:00",
    timezone: "",
    incluir_nota_media: false,
    incluir_conversas_sem_resposta: true,
  },
};

async function installSession(page, user = admin) {
  await page.addInitScript((sessionUser) => {
    localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "ia-local-token", user: sessionUser }));
    sessionStorage.removeItem("zap_erp_alerta_sem_resposta_unavailable");
  }, user);
}

function defaultPayload(path, user = admin) {
  if (path === "/usuarios/me") return user;
  if (path === "/usuarios/me/permissoes") return { permissoes: [] };
  if (path === "/ia/config") return defaultConfig;
  if (path === "/ia/logs") return [{ id: 1, tipo: "menu_enviado", criado_em: "2026-08-27T12:00:00Z", detalhes: { texto: "Menu enviado" } }];
  if (path === "/ia/regras") return [{ id: 2, palavra_chave: "horario", resposta: "Das 9h as 18h" }];
  if (path === "/dashboard/departamentos") return [{ id: 10, nome: "Suporte" }];
  if (path === "/tags") return [{ id: 20, nome: "VIP" }];
  if (path === "/usuarios") return [{ id: 1, nome: "Admin IA", perfil: "admin" }];
  if (path === "/clientes") return [{ id: 30, nome: "Gestor", telefone: "5511999999999" }];
  if (path === "/config/alerta-sem-resposta") {
    return {
      alerta_sem_resposta_ativo: false,
      tempo_primeiro_alerta_minutos: 1,
      tempo_alerta_critico_minutos: 3,
      tempo_notificar_gestor_minutos: 5,
      notificar_interno: true,
      aplicar_tag_automatica: true,
      nome_tag_automatica: "Reaberta por falta de resposta",
    };
  }
  if (path === "/config/alerta-sem-resposta/eventos") return { eventos: [] };
  return {};
}

async function installIaApi(page, options = {}) {
  const calls = [];
  const writes = [];
  let configGetCount = 0;

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (request.isNavigationRequest()) return route.continue();
    const isApi = ["/usuarios", "/ia", "/dashboard", "/tags", "/clientes", "/config", "/socket.io"].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    );
    if (!isApi) return route.continue();
    if (path.startsWith("/socket.io")) return route.abort();

    calls.push({ method, path, search: url.search });
    if (method !== "GET") {
      let body = null;
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
      writes.push({ method, path, body });
      if (options.onWrite) {
        const custom = await options.onWrite({ method, path, body });
        if (custom) return route.fulfill(custom);
      }
      if (path === "/ia/config") return route.fulfill({ json: { ...defaultConfig, ...(body || {}) } });
      if (path === "/config/alerta-sem-resposta") return route.fulfill({ json: { config: body || {} } });
      return route.fulfill({ json: body || {} });
    }

    if (options.failPath === path) return route.fulfill({ status: 500, json: { error: "Falha controlada da secao" } });
    if (path === "/clientes" && options.onClientes) {
      const custom = await options.onClientes(url);
      if (custom) return route.fulfill(custom);
    }
    if (path === "/ia/config") {
      configGetCount += 1;
      if (options.onConfigGet) {
        const custom = await options.onConfigGet(configGetCount);
        if (custom) return route.fulfill(custom);
      }
    }
    if (options.delayPaths?.[path]) await new Promise((resolve) => setTimeout(resolve, options.delayPaths[path]));
    const payload = Object.prototype.hasOwnProperty.call(options.payloads || {}, path)
      ? options.payloads[path]
      : defaultPayload(path, options.user || admin);
    return route.fulfill({ json: payload });
  });

  return { calls, writes };
}

test.describe("IA - shell, contratos e carga sob demanda", () => {
  test.beforeEach(async ({ page }) => {
    await installSession(page);
  });

  test("abre a pagina, navega entre secoes e mantem a fachada da rota", async ({ page }) => {
    await installIaApi(page);
    await page.goto("/ia?tab=logs");
    await expect(page.getByRole("heading", { name: "IA / Bot / Automação" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "6. Logs do bot" })).toBeVisible();

    await page.getByRole("button", { name: "Respostas automáticas" }).click();
    await expect(page.getByRole("heading", { name: "Respostas automáticas" })).toBeVisible();
    await page.getByRole("button", { name: "IA (sugestões)" }).click();
    await expect(page.getByRole("heading", { name: "IA (sugestões inteligentes)" })).toBeVisible();
  });

  test("nega a pagina sem as permissoes atuais", async ({ page }) => {
    const atendente = { ...admin, perfil: "atendente", role: "atendente" };
    await installSession(page, atendente);
    await installIaApi(page, { user: atendente });
    await page.goto("/ia");
    await expect(page).toHaveURL(/\/atendimento/);
    await expect(page.getByRole("heading", { name: "IA / Bot / Automação" })).toHaveCount(0);
  });

  test("carrega apenas os dados exigidos pela secao ativa", async ({ page }) => {
    const api = await installIaApi(page);
    await page.goto("/ia?tab=logs");
    await expect(page.getByText("Menu enviado", { exact: true })).toBeVisible();

    const paths = api.calls.filter((call) => call.method === "GET").map((call) => call.path);
    expect(paths).toContain("/ia/logs");
    expect(paths).not.toContain("/ia/config");
    expect(paths).not.toContain("/ia/regras");
    expect(paths).not.toContain("/dashboard/departamentos");
    expect(paths).not.toContain("/tags");
    expect(paths).not.toContain("/config/alerta-sem-resposta");
  });

  test("isola a falha de logs e permite abrir outra secao", async ({ page }) => {
    await installIaApi(page, { failPath: "/ia/logs" });
    await page.goto("/ia?tab=logs");
    await expect(page.getByRole("alert")).toContainText("Falha controlada da secao");
    await page.getByRole("button", { name: "Automações" }).click();
    await expect(page.getByRole("heading", { name: "5. Automações" })).toBeVisible();
  });

  test("carrega e salva configuracoes de IA com o payload exato", async ({ page }) => {
    const api = await installIaApi(page);
    await page.goto("/ia?tab=ia");
    await page.getByRole("switch", { name: "Usar IA" }).click();
    await page.getByRole("button", { name: "Salvar configurações de IA" }).click();
    await expect.poll(() => api.writes.some((write) => write.path === "/ia/config")).toBe(true);
    expect(api.writes.find((write) => write.path === "/ia/config")?.body).toEqual({
      ia: { ...defaultConfig.ia, usar_ia: true },
    });
  });

  test("preserva o payload de automacoes", async ({ page }) => {
    const api = await installIaApi(page);
    await page.goto("/ia?tab=automacoes");
    await page.locator(".auto-card").first().locator('input[type="number"]').fill("12");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect.poll(() => api.writes.some((write) => write.path === "/ia/config")).toBe(true);
    expect(api.writes.find((write) => write.path === "/ia/config")?.body).toEqual({
      automacoes: { ...defaultConfig.automacoes, encerrar_automatico_min: 12 },
    });
  });

  test("renderiza e atualiza o preview da triagem", async ({ page }) => {
    await installIaApi(page);
    await page.goto("/ia?tab=chatbot");
    await expect(page.getByText("Direcionado para Suporte", { exact: true })).toBeVisible();
    await page.locator(".chatbot-card").first().locator("textarea").first().fill("Nova mensagem de preview");
    await expect(page.locator(".chatbot-preview").getByText("Nova mensagem de preview", { exact: true })).toBeVisible();
  });

  test("preserva o payload completo da triagem", async ({ page }) => {
    const api = await installIaApi(page);
    await page.goto("/ia?tab=chatbot");
    await page.getByRole("button", { name: "Salvar configuração" }).click();
    await expect.poll(() => api.writes.some((write) => write.path === "/ia/config")).toBe(true);
    expect(api.writes.find((write) => write.path === "/ia/config")?.body).toEqual({
      chatbot_triage: buildTriagemPayload({
        ...DEFAULT_CONFIG.chatbot_triage,
        ...defaultConfig.chatbot_triage,
      }),
    });
  });

  test("preserva o payload de respostas automaticas", async ({ page }) => {
    const api = await installIaApi(page);
    await page.goto("/ia?tab=respostas");
    await page.getByPlaceholder("ex: horário, teste, preço").fill("  prazo  ");
    await page.getByPlaceholder(/Nosso horário de atendimento/).fill("  Retorno em dois dias  ");
    await page.getByRole("button", { name: "Salvar regra automática" }).click();
    await expect.poll(() => api.writes.some((write) => write.path === "/ia/regras")).toBe(true);
    expect(api.writes.find((write) => write.path === "/ia/regras")?.body).toEqual({
      palavra_chave: "prazo",
      resposta: "Retorno em dois dias",
      departamento_id: null,
      tag_id: null,
      aplicar_tag: false,
      horario_comercial_only: false,
    });
  });

  test("uma busca antiga de gestor nao sobrescreve a mais recente", async ({ page }) => {
    await installIaApi(page, {
      onClientes: async (url) => {
        const palavra = url.searchParams.get("palavra");
        await new Promise((resolve) => setTimeout(resolve, palavra === "antigo" ? 650 : 20));
        return { json: [{ id: palavra === "antigo" ? 31 : 32, nome: palavra === "antigo" ? "Gestor Antigo" : "Gestor Novo", telefone: "5511999999999" }] };
      },
    });
    await page.goto("/ia?tab=chatbot");
    const card = page.locator(".chatbot-card--admin-alerta");
    await card.getByRole("switch").click();
    const search = card.locator('input[type="search"]');
    await search.fill("antigo");
    await page.waitForTimeout(300);
    await search.fill("novo");
    await expect(card.locator("option", { hasText: "Gestor Novo" })).toHaveCount(1);
    await page.waitForTimeout(700);
    await expect(card.locator("option", { hasText: "Gestor Antigo" })).toHaveCount(0);
  });

  test("carrega alertas e logs somente quando cada secao e aberta", async ({ page }) => {
    const api = await installIaApi(page);
    await page.goto("/ia?tab=alertas");
    await expect(page.getByRole("heading", { name: "Alertas de Atendimento" })).toBeVisible();
    expect(api.calls.some((call) => call.path === "/config/alerta-sem-resposta")).toBe(true);
    expect(api.calls.some((call) => call.path === "/ia/logs")).toBe(false);

    await page.getByRole("button", { name: "Logs do bot" }).click();
    await expect(page.getByText("Menu enviado", { exact: true })).toBeVisible();
    expect(api.calls.some((call) => call.path === "/ia/logs")).toBe(true);
  });
});

if (process.env.IA_VISUAL_CAPTURE === "1") {
  test("IA - evidencias visuais", async ({ page }) => {
    await installSession(page);
    await installIaApi(page);
    const phase = process.env.IA_VISUAL_PHASE || "after";
    const outputDir = resolve("docs/evidencias/ia");
    mkdirSync(outputDir, { recursive: true });

    await page.goto("/ia?tab=chatbot");
    await expect(page.getByRole("heading", { name: "Chatbot de Triagem" })).toBeVisible();
    await page.screenshot({ path: resolve(outputDir, `${phase}-triagem-desktop.png`), fullPage: true });

    await page.getByRole("button", { name: "Logs do bot" }).click();
    await expect(page.getByRole("heading", { name: "6. Logs do bot" })).toBeVisible();
    await page.screenshot({ path: resolve(outputDir, `${phase}-logs-desktop.png`), fullPage: true });
  });
}
