import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Ranking gamificado — API simulada (nenhum backend real). Cobre a aba "Ranking" de IA / Bot,
 * a configuração admin na mesma aba, a celebração única do campeão e os gates.
 */

const SHOTS = process.env.RANKING_SHOTS_DIR || resolve("test-results", "ranking");

// Admin chamado "Maria" (id 2): é quem aparece como "você" no pódio do fixture.
const admin = { id: 2, nome: "Maria", email: "maria.admin@local.test", perfil: "admin", role: "admin", company_id: 1, departamento_ids: [] };
const atendente = { id: 2, nome: "Maria", email: "maria@local.test", perfil: "atendente", role: "atendente", company_id: 1, departamento_ids: [] };

function cicloEncerrado(overrides = {}) {
  return {
    id: 41,
    inicio: "2026-11-06T21:00:00.000Z",
    fim: "2026-11-13T21:00:00.000Z",
    timezone: "America/Sao_Paulo",
    dia_semana: 5,
    horario: "18:00",
    encerramento_descricao: "sexta-feira, às 18h",
    status: "encerrado",
    vencedores: [{ usuario_id: 3, nome: "João", total: 87, posicao: 1 }],
    classificacao: [
      { usuario_id: 3, nome: "João", total: 87, posicao: 1 },
      { usuario_id: 2, nome: "Maria", total: 74, posicao: 2 },
    ],
    total_vencedor: 87,
    total_atendimentos: 161,
    encerrado_em: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function rankingAtual({ ativo = true, ultimo = cicloEncerrado(), eu = 2 } = {}) {
  if (!ativo) return { ativo: false, agora: new Date().toISOString() };
  const classificacao = [
    { usuario_id: 3, nome: "João", total: 87, posicao: 1 },
    { usuario_id: 2, nome: "Maria", total: 74, posicao: 2 },
    { usuario_id: 4, nome: "Pedro", total: 61, posicao: 3 },
    { usuario_id: 5, nome: "Ana", total: 49, posicao: 4 },
    { usuario_id: 6, nome: "Bruno", total: 12, posicao: 5 },
  ];
  const minha = classificacao.find((c) => c.usuario_id === eu);
  return {
    ativo: true,
    agora: new Date().toISOString(),
    config: { dia_semana: 5, horario: "18:00", encerramento_descricao: "sexta-feira, às 18h" },
    ciclo: {
      id: 42,
      inicio: "2026-11-13T21:00:00.000Z",
      fim: new Date(Date.now() + (2 * 86400 + 3 * 3600) * 1000).toISOString(),
      timezone: "America/Sao_Paulo",
      dia_semana: 5,
      horario: "18:00",
      encerramento_descricao: "sexta-feira, às 18h",
      status: "em_andamento",
    },
    proximo_ciclo_com_nova_regra: false,
    ultimo_resultado: ultimo,
    classificacao,
    lideres: [classificacao[0]],
    total_atendimentos: 283,
    eu: { usuario_id: eu, posicao: minha?.posicao ?? null, total: minha?.total ?? 0 },
  };
}

async function installSession(page, user) {
  await page.addInitScript((u) => {
    localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "ranking-local-token", user: u }));
  }, user);
}

async function installApi(page, { user, atual, config, historico = [cicloEncerrado()] }) {
  const writes = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const isApi = ["/usuarios", "/config", "/dashboard", "/tags", "/clientes", "/api", "/chats", "/socket.io", "/notifications"].some(
      (p) => path === p || path.startsWith(`${p}/`)
    );
    if (!isApi) return route.continue();
    if (path.startsWith("/socket.io")) return route.abort();

    if (path === "/api/ranking/atual") return route.fulfill({ json: atual });
    if (path === "/api/ranking/historico") return route.fulfill({ json: { itens: historico } });
    if (path === "/api/ranking/config") {
      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        writes.push(body);
        return route.fulfill({ json: { ...config, config: { ...config.config, ...body } } });
      }
      return route.fulfill({ json: config });
    }
    if (path === "/usuarios/me") return route.fulfill({ json: user });
    if (path === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (path === "/config/empresa") return route.fulfill({ json: { id: 1, nome: "Empresa Teste" } });
    return route.fulfill({ json: {} });
  });
  return { writes };
}

const painelAdmin = {
  config: { ativo: true, dia_semana: 5, horario: "18:00", encerramento_descricao: "sexta-feira, às 18h" },
  indisponivel: false,
  fuso: { timezone: "America/Sao_Paulo", timezone_label: "Horário de Brasília" },
  ciclo_atual: { id: 42, inicio: "2026-11-13T21:00:00.000Z", fim: "2026-11-20T21:00:00.000Z", timezone: "America/Sao_Paulo" },
};


test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test("aba Ranking do IA / Bot: pódio, você destacado, contagem regressiva e celebração única", async ({ page }, info) => {
  await installSession(page, admin);
  await installApi(page, { user: admin, atual: rankingAtual(), config: painelAdmin });
  await page.goto("/ia?tab=ranking");

  await expect(page.locator(".ia-tab--active")).toHaveText("Ranking");
  await expect(page.getByRole("heading", { name: /Ranking da semana/ })).toBeVisible();
  const podio = page.getByRole("list", { name: "Três primeiros colocados" });
  await expect(podio.locator("li")).toHaveCount(3);
  await expect(podio.locator("li").first()).toContainText("João");
  await expect(page.locator(".rk-podio-card.is-eu")).toContainText("Maria");
  await expect(page.locator(".rk-resumo-card--eu")).toContainText("2º");
  await expect(page.locator(".rk-contagem")).toHaveText(/\dd \dh \d+min/);
  await expect(page.getByText("Próxima premiação: sexta-feira, às 18h")).toBeVisible();
  await expect(page.getByRole("list", { name: "Demais colocados" }).locator("li")).toHaveCount(2);

  // Celebração do campeão (ponte global carrega o resumo ~4s após o boot)
  const dialog = page.getByRole("dialog", { name: /Temos um campeão!/ });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toContainText("João conquistou o 1º lugar nesta semana!");
  await expect(dialog).toContainText("Foram 87 atendimentos realizados.");
  await expect(dialog.getByRole("button", { name: "Ver ranking" })).toBeVisible();
  await page.screenshot({ path: resolve(SHOTS, `celebracao-${info.project.name}.png`) });
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toBeHidden();
  await page.screenshot({ path: resolve(SHOTS, `ranking-${info.project.name}.png`) });

  // Recarregar não mostra de novo (uma vez por pessoa por ciclo)
  await page.reload();
  await expect(page.getByRole("heading", { name: /Ranking da semana/ })).toBeVisible();
  await page.waitForTimeout(5500);
  await expect(page.getByRole("dialog", { name: /Temos um campeão!/ })).toHaveCount(0);
});

test("link antigo /ranking abre a aba Ranking do IA / Bot e o menu não tem mais o item", async ({ page }) => {
  await installSession(page, admin);
  await installApi(page, { user: admin, atual: rankingAtual({ ultimo: null }), config: painelAdmin });
  await page.goto("/ranking");
  await expect(page).toHaveURL(/\/ia\?tab=ranking/);
  await expect(page.getByRole("heading", { name: /Ranking da semana/ })).toBeVisible();
  await expect(page.locator('aside a[href="/ranking"]')).toHaveCount(0);
});

test("empate no 1º lugar celebra todos os vencedores", async ({ page }) => {
  await installSession(page, admin);
  const ultimo = cicloEncerrado({
    id: 50,
    vencedores: [
      { usuario_id: 3, nome: "João", total: 10, posicao: 1 },
      { usuario_id: 2, nome: "Maria", total: 10, posicao: 1 },
    ],
    total_vencedor: 10,
  });
  await installApi(page, { user: admin, atual: rankingAtual({ ultimo }), config: painelAdmin });
  await page.goto("/ia?tab=ranking");
  const dialog = page.getByRole("dialog", { name: /Temos campeões!/ });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toContainText("João e Maria dividiram o 1º lugar nesta semana!");
});

test("admin configura na mesma aba e vê o histórico", async ({ page }, info) => {
  await installSession(page, admin);
  const api = await installApi(page, { user: admin, atual: rankingAtual({ ultimo: null }), config: painelAdmin });
  await page.goto("/ia?tab=ranking");

  const titulo = page.getByRole("heading", { name: "Configuração da competição" });
  await expect(titulo).toBeVisible();
  await expect(page.getByRole("switch", { name: "Ranking ativo" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Vencedores anteriores")).toBeVisible();
  await expect(page.locator(".rk-hist-item")).toContainText("João");
  await page.locator(".rk-hist-item summary").click();
  await expect(page.locator(".rk-hist-classificacao li")).toHaveCount(2);
  await titulo.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(SHOTS, `config-${info.project.name}.png`) });

  const salvar = page.getByRole("button", { name: "Salvar", exact: true });
  await expect(salvar).toBeDisabled();
  await page.getByLabel("Dia da divulgação do vencedor").selectOption("3");
  await page.getByLabel("Horário do encerramento").fill("12:30");
  await expect(page.getByText("O novo dia/horário vale a partir da próxima competição.")).toBeVisible();
  await salvar.click();
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0]).toEqual({ ativo: true, dia_semana: 3, horario: "12:30" });

  // Desligar com competição em andamento pede confirmação
  await page.getByRole("switch", { name: "Ranking ativo" }).click();
  await salvar.click();
  await expect(page.getByRole("alertdialog", { name: "Desativar o ranking?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  expect(api.writes.length).toBe(1);
});

test("Configurações não tem mais a aba Ranking", async ({ page }) => {
  await installSession(page, admin);
  await installApi(page, { user: admin, atual: rankingAtual({ ultimo: null }), config: painelAdmin });
  await page.goto("/configuracoes?tab=ranking");
  await expect(page).toHaveURL(/tab=geral/);
  await expect(page.locator(".ia-tabs").getByRole("button", { name: "Ranking" })).toHaveCount(0);
});

test("atendente: /ranking volta ao atendimento, sem item no menu, celebração sem atalho", async ({ page }) => {
  await installSession(page, atendente);
  await installApi(page, { user: atendente, atual: rankingAtual(), config: painelAdmin });
  await page.goto("/ranking");
  await expect(page).toHaveURL(/\/atendimento/);
  await expect(page.locator('a[href="/ranking"]')).toHaveCount(0);
  const dialog = page.getByRole("dialog", { name: /Temos um campeão!/ });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByRole("button", { name: "Ver ranking" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toBeHidden();
});
